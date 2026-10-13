"""Optional browser smoke checks; mocked market responses are TEST ONLY."""
import json
import time
from playwright.sync_api import sync_playwright

INTERVAL = 900000
cutoff = int(time.time() * 1000) // INTERVAL * INTERVAL
rows = []
for i in range(250):
    start = cutoff - (249 - i) * INTERVAL
    price = 60000 + i * 10
    close = price + (40 if i % 3 else -30)
    rows.append([str(start), str(price), str(max(price, close) + 20), str(min(price, close) - 20), str(close), str(100 + (i % 7) * 30), '0'])

def mock_market(route):
    url = route.request.url
    result = {'timeSecond': str(cutoff // 1000 + 1)} if '/time' in url else {'category': 'linear', 'symbol': 'BTCUSDT', 'list': list(reversed(rows))} if '/kline' in url else {'list': [{'symbol': 'BTCUSDT', 'lastPrice': '62500'}]}
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'retCode': 0, 'result': result}))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width in [390, 1280]:
        page = browser.new_page(viewport={'width': width, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://api.bybit.com/**', mock_market)
        page.goto('http://127.0.0.1:8080')
        page.wait_for_function("document.querySelector('#status').textContent.includes('조회 완료')")
        assert page.locator('#price').inner_text() == '62,500.00'
        long = float(page.locator('#long-score').inner_text())
        short = float(page.locator('#short-score').inner_text())
        assert abs(long + short - 100) < .11
        assert page.locator('#history tr').count() == 12
        assert page.locator('#chart svg').count() == 1
        assert page.locator('#entry-price').is_disabled()
        assert page.locator('#levels .level-row').count() == 2
        page.locator('label:has(input[value="long"])').click()
        assert page.locator('#entry-price').is_enabled()
        assert page.locator('#levels .level-row').count() == 0
        assert '진입가' in page.locator('#levels').inner_text()
        page.locator('#entry-price').fill('60000')
        assert page.locator('#levels .level-row').count() == 1
        page.locator('label:has(input[value="short"])').click()
        assert 'SHORT' in page.locator('#levels').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        assert not errors, errors
        page.screenshot(path=f"/tmp/btc-volume-score-{width}.png", full_page=True)
        page.close()
    page = browser.new_page()
    page.route('https://api.bybit.com/**', lambda route: route.fulfill(status=403, body='Forbidden'))
    page.goto('http://127.0.0.1:8080')
    page.locator('#error').wait_for(state='visible')
    assert '403' in page.locator('#error').inner_text()
    assert page.locator('#long-score').inner_text() == '—'
    assert page.locator('#decision').inner_text() == '분석 불가'
    # A successful snapshot must disappear on a subsequent failed refresh.
    page.unroute('https://api.bybit.com/**')
    page.route('https://api.bybit.com/**', mock_market)
    page.reload()
    page.wait_for_function("document.querySelector('#status').textContent.includes('조회 완료')")
    page.unroute('https://api.bybit.com/**')
    page.route('https://api.bybit.com/**', lambda route: route.fulfill(status=429, body='Rate limited'))
    page.locator('#refresh').click(timeout=15000)
    page.locator('#error').wait_for(state='visible')
    assert '요청 제한' in page.locator('#error').inner_text()
    assert page.locator('#price').inner_text() == '—'
    assert page.locator('#chart svg').count() == 0
    browser.close()
print('PASS: desktop/mobile rendering, position inputs, no overflow, 403/429 errors, stale result removal (TEST FIXTURES ONLY)')
