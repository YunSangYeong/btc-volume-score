import { fetchMarket } from './api.js';
import { scoreHistory, entryDecision, positionDecision, atr, levels, RULES, INTERVAL, displayedScores } from './analysis.js';
const $ = id => document.getElementById(id);
const priceText = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const scoreText = n => n.toFixed(1);
const timeText = ms => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms) + ' KST';
const shortTime = ms => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const changeText = n => `${n > 0 ? '+' : ''}${Math.abs(n) < .05 ? '0.0' : n.toFixed(1)}p`;
const changeClass = n => n > 0 ? 'up' : n < 0 ? 'down' : 'neutral';
let market = null, history = [], currentAtr = 0, busy = false;
function selectedPosition() { return document.querySelector('input[name="position"]:checked').value; }
function drawChart(records) {
  const list = records.slice(-48), w = 1000, h = 220, left = 36, right = 20, top = 16, bottom = 30;
  const x = i => left + (w - left - right) * i / Math.max(1, list.length - 1);
  const y = n => top + (h - top - bottom) * (1 - n / 100);
  const points = list.map((s, i) => `${x(i)},${y(s.long)}`).join(' ');
  const grid = [0, 30, 50, 70, 100].map(n => `<line x1="${left}" y1="${y(n)}" x2="${w-right}" y2="${y(n)}" stroke="#354143" stroke-dasharray="${n === 50 ? '0' : '4 5'}"/><text x="0" y="${y(n)+4}" fill="#98aaa9" font-size="11">${n}</text>`).join('');
  const labels = [0, Math.floor((list.length - 1) / 2), list.length - 1].map((i, j) => `<text x="${x(i)}" y="${h-4}" text-anchor="${['start','middle','end'][j]}" fill="#98aaa9" font-size="11">${shortTime(list[i].time)}</text>`).join('');
  $('chart').innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="최근 ${list.length}개 완료 시점의 롱 점수 차트. 최신 ${scoreText(list.at(-1).long)}점. 상세 값은 최근 분석 기록에서 확인하세요."><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9ef76" stop-opacity=".18"/><stop offset="1" stop-color="#a9ef76" stop-opacity="0"/></linearGradient></defs><rect x="${left}" y="${y(100)}" width="${w-left-right}" height="${y(70)-y(100)}" fill="#a9ef76" opacity=".035"/><rect x="${left}" y="${y(30)}" width="${w-left-right}" height="${y(0)-y(30)}" fill="#ff988b" opacity=".035"/>${grid}<polygon points="${x(0)},${y(0)} ${points} ${x(list.length-1)},${y(0)}" fill="url(#area)"/><polyline points="${points}" fill="none" stroke="#a9ef76" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${x(list.length-1)}" cy="${y(list.at(-1).long)}" r="4" fill="#a9ef76"/>${labels}</svg>`;
}
function renderLevels() {
  const position = selectedPosition();
  $('entry-price').disabled = position === 'none';
  if (!market) {
    $('position-decision').textContent = position === 'none' ? '포지션 없음' : '데이터 조회 필요';
    $('levels').innerHTML = '<p class="empty">유효한 데이터를 조회해야 계산할 수 있습니다.</p>';
    return;
  }
  const s = history.at(-1);
  $('position-decision').textContent = positionDecision(position, s.long);
  $('position-decision').className = position === 'none' ? 'neutral' : position === 'long' ? 'up' : 'down';
  $('position-note').textContent = position === 'none' ? '아래 롱·숏 가격은 최신 완료 봉 종가를 기준으로 합니다.' : '입력한 진입가와 현재 ATR을 사용한 참고 가격입니다. 고정된 초기 손절선이 아닙니다.';
  $('risk-caption').textContent = position === 'none' ? '롱·숏 후보 참고값 · 최신 완료 봉 종가 기준 (진입 신호와 별개)' : '입력 진입가 기준 · ATR은 조회 시점마다 변할 수 있습니다.';
  const input = $('entry-price').value.trim();
  const entry = position === 'none' ? market.candles.at(-1).close : input === '' ? NaN : Number(input);
  if (!Number.isFinite(entry) || entry <= 0) {
    $('levels').innerHTML = '<p class="empty">손절가·목표가를 보려면 유효한 진입가를 입력하세요.</p>';
    return;
  }
  const sides = position === 'none' ? ['long', 'short'] : [position];
  $('levels').innerHTML = sides.map(side => {
    const l = levels(side, entry, currentAtr);
    if (l.stop <= 0 || l.target <= 0) return '<p class="empty">진입가가 손절 거리보다 작습니다. 가격을 확인하세요.</p>';
    return `<div class="level-row"><b class="${side === 'long' ? 'up' : 'down'}">${side === 'long' ? 'LONG' : 'SHORT'}</b><div><small>손절가</small><strong>${priceText(l.stop)}</strong></div><div><small>목표가</small><strong>${priceText(l.target)}</strong></div></div>`;
  }).join('');
}
function renderMarket() {
  const s = history.at(-1), prev = history.at(-2), hour = history.at(-5), candle = market.candles.at(-1);
  const delta = s.long - prev.long;
  $('price').textContent = priceText(market.price);
  $('analysis-time').textContent = timeText(s.time);
  $('fetch-time').textContent = timeText(market.fetchedAt);
  const display = displayedScores(s);
  $('long-score').textContent = display.long;
  $('short-score').textContent = display.short;
  $('long-bar').style.width = `${s.long}%`;
  $('short-bar').style.width = `${s.short}%`;
  $('decision').textContent = entryDecision(s.long, delta, s.recentLong);
  $('decision').className = $('decision').textContent.startsWith('롱') ? 'up' : $('decision').textContent.startsWith('숏') ? 'down' : '';
  $('decision-note').textContent = '롱 점수·직전 변화·최근 10봉의 세 조건을 함께 평가합니다.';
  $('recent').textContent = `${s.recentLong > 50 ? '롱 우세' : s.recentLong < 50 ? '숏 우세' : '중립'} · ${scoreText(s.recentLong)}`;
  $('recent').className = s.recentLong > 50 ? 'up' : s.recentLong < 50 ? 'down' : 'neutral';
  for (const [id, value] of [['delta-15', delta], ['delta-hour', s.long - hour.long]]) { $(id).textContent = changeText(value); $(id).className = changeClass(value); }
  $('atr').textContent = priceText(currentAtr);
  $('distance').textContent = priceText(currentAtr * 1.5);
  $('contributions').innerHTML = RULES.map((label, i) => `<div class="contribution"><span>${label}</span><div class="track"><span style="width:${Math.abs(s.contributions[i])/50*100}%;background:${s.contributions[i] >= 0 ? 'var(--green)' : 'var(--red)'}"></span></div><strong class="${changeClass(s.contributions[i])}">${changeText(s.contributions[i])}</strong></div>`).join('');
  $('ohlcv').innerHTML = [['봉 시작', timeText(candle.time)],['봉 완료', timeText(s.time)],['시가', priceText(candle.open)],['고가', priceText(candle.high)],['저가', priceText(candle.low)],['종가', priceText(candle.close)],['거래량 (BTC)', candle.volume.toLocaleString('en-US', { maximumFractionDigits: 6 })],['확보한 완료 봉', `${market.candles.length}개`]].map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('');
  $('history').innerHTML = history.slice(-12).reverse().map(record => {
    const i = history.indexOf(record), previous = history[i-1], diff = previous ? record.long - previous.long : null;
    const c = market.candles[50+i];
    return `<tr><td>${timeText(record.time)}</td><td>${priceText(c.close)}</td><td>${c.volume.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td><td><span class="up">${displayedScores(record).long}</span> / <span class="down">${displayedScores(record).short}</span></td><td class="${diff === null ? 'neutral' : changeClass(diff)}">${diff === null ? '—' : changeText(diff)}</td><td>${diff === null ? '비교 데이터 없음' : entryDecision(record.long, diff, record.recentLong)}</td></tr>`;
  }).join('');
  drawChart(history); renderLevels();
}
function clearMarket() {
  market = null; history = [];
  for (const id of ['price','analysis-time','fetch-time','long-score','short-score','recent','delta-15','delta-hour','atr','distance']) { $(id).textContent = '—'; $(id).classList.remove('up','down'); }
  $('long-bar').style.width = $('short-bar').style.width = '0%';
  $('decision').textContent = '분석 불가'; $('decision').className = '';
  $('decision-note').textContent = '유효한 실제 데이터가 필요합니다. 오류를 해결한 뒤 다시 조회하세요.';
  $('chart').innerHTML = '<p class="empty">유효한 분석 데이터가 없습니다.</p>';
  $('history').innerHTML = '<tr><td colspan="6" class="empty">유효한 분석 기록이 없습니다.</td></tr>';
  $('contributions').innerHTML = '<p class="empty">데이터 없음</p>';
  $('ohlcv').innerHTML = '<dt>완료 봉 데이터</dt><dd>—</dd>';
  renderLevels();
}
async function refresh() {
  if (busy) return;
  busy = true; $('refresh').disabled = true; $('error').hidden = true;
  $('status').textContent = 'Bybit 실제 데이터 조회 중…';
  try {
    const next = await fetchMarket();
    const nextHistory = scoreHistory(next.candles), nextAtr = atr(next.candles);
    market = next; history = nextHistory; currentAtr = nextAtr;
    renderMarket(); $('status').textContent = '조회 완료 · 실제 공개 API 데이터';
  } catch (error) {
    clearMarket(); $('error').textContent = error.message; $('error').hidden = false;
    $('status').textContent = '조회 실패 · 분석 결과 없음';
  } finally {
    busy = false;
    setTimeout(() => { $('refresh').disabled = false; }, 10000);
  }
}
$('refresh').addEventListener('click', refresh);
for (const input of document.querySelectorAll('input[name="position"]')) input.addEventListener('change', renderLevels);
$('entry-price').addEventListener('input', renderLevels);
// No background polling: snapshots remain tied to their displayed cutoff.
setInterval(() => {
  if (market && !busy && Date.now() >= history.at(-1).time + INTERVAL + 5000) $('status').textContent = '새 완료 봉이 있을 수 있습니다 · 데이터를 갱신하세요';
}, 15000);
refresh();
