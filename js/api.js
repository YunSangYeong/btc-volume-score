import { parseCandles } from './analysis.js';
const BASE = 'https://api.bybit.com';
let lastRequest = 0;
export async function request(path, signal) {
  let response;
  try { response = await fetch(`${BASE}${path}`, { signal, cache: 'no-store' }); }
  catch (e) {
    if (signal.aborted) throw new Error('요청이 취소되었거나 15초 제한 시간을 초과했습니다.');
    throw new Error('Bybit API에 연결할 수 없습니다. 네트워크, 지역 제한 또는 CORS 정책을 확인하세요. 샘플 데이터는 사용하지 않습니다.');
  }
  if (!response.ok) throw new Error(response.status === 429 ? 'API 요청 제한에 도달했습니다. 잠시 후 다시 조회하세요.' : `Bybit API HTTP 오류 (${response.status}). 지역·네트워크 제한을 확인하세요.`);
  let data;
  try { data = await response.json(); } catch { throw new Error('API 응답이 올바른 JSON 형식이 아닙니다.'); }
  if (data.retCode !== 0) throw new Error(`Bybit API 오류 (${data.retCode}): ${data.retMsg || '응답 실패'}`);
  return data;
}
export async function fetchMarket() {
  const now = Date.now();
  if (now - lastRequest < 10000) throw new Error('요청 제한 보호: 10초 후 다시 조회하세요.');
  lastRequest = now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // Freeze cutoff before fetching candles to avoid a boundary race.
    const clock = await request('/v5/market/time', controller.signal);
    const serverTime = Number(clock.result?.timeSecond) * 1000;
    if (!Number.isFinite(serverTime) || serverTime <= 0) throw new Error('거래소 기준 시각이 누락되었습니다.');
    const [kline, ticker] = await Promise.all([
      request('/v5/market/kline?category=linear&symbol=BTCUSDT&interval=15&limit=250', controller.signal),
      request('/v5/market/tickers?category=linear&symbol=BTCUSDT', controller.signal)
    ]);
    if (kline.result?.symbol !== 'BTCUSDT' || kline.result?.category !== 'linear') throw new Error('요청한 시장과 캔들 응답이 다릅니다.');
    const candles = parseCandles(kline.result.list, serverTime);
    const tick = ticker.result?.list?.find(t => t.symbol === 'BTCUSDT');
    const price = Number(tick?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error('현재 가격 데이터가 누락되었습니다.');
    return { candles, price, serverTime, fetchedAt: Date.now() };
  } finally { clearTimeout(timer); controller.abort(); }
}
