export const INTERVAL = 15 * 60 * 1000;
export const WINDOW = 50;
export const RULES = ['양봉 · 거래량 증가', '양봉 · 거래량 감소', '음봉 · 거래량 증가', '음봉 · 거래량 감소'];
export function volumeWeight(rate) {
  const a = Math.abs(rate);
  return a < 0.1 ? 0.25 : a < 0.3 ? 0.5 : a < 0.6 ? 0.75 : 1;
}
export function bodyWeight(ratio) {
  return ratio < 0.2 ? 0.25 : ratio < 0.4 ? 0.5 : ratio < 0.7 ? 0.75 : 1;
}
// Age 1 is the most recently completed candle; each bucket has ten candles.
export function timeWeight(age) {
  if (!Number.isInteger(age) || age < 1 || age > 50) throw new Error('봉 나이는 1~50이어야 합니다.');
  return [0.4, 0.25, 0.15, 0.12, 0.08][Math.floor((age - 1) / 10)] / 10;
}
export function classify(candle, previous) {
  const body = candle.close - candle.open;
  const diff = candle.volume - previous.volume;
  const rate = previous.volume === 0 ? (diff === 0 ? 0 : Infinity) : diff / previous.volume;
  const ratio = candle.high === candle.low ? 0 : Math.abs(body) / (candle.high - candle.low);
  if (body === 0 || diff === 0) return { direction: 0, rule: null, rate, ratio, strength: 0 };
  const rule = body > 0 ? (diff > 0 ? 0 : 1) : (diff > 0 ? 2 : 3);
  const direction = [1, -1, -1, 1][rule];
  return { direction, rule, rate, ratio, strength: direction * volumeWeight(rate) * bodyWeight(ratio) };
}
export function scoreAt(candles, end = candles.length - 1) {
  if (!Number.isInteger(end) || end < WINDOW || end >= candles.length) throw new Error('점수 계산에는 최소 51개 완료 봉이 필요합니다.');
  const contributions = [0, 0, 0, 0];
  let sum = 0, recentSum = 0, recentWeight = 0;
  const details = [];
  for (let age = 1; age <= WINDOW; age++) {
    const i = end - age + 1;
    const item = classify(candles[i], candles[i - 1]);
    const weight = timeWeight(age);
    const value = item.strength * weight;
    sum += value;
    if (item.rule !== null) contributions[item.rule] += 50 * value;
    if (age <= 10) { recentSum += value; recentWeight += weight; }
    details.push({ ...item, age, weight, value, candle: candles[i] });
  }
  const long = Math.max(0, Math.min(100, 50 + 50 * sum));
  return { long, short: 100 - long, recentLong: 50 + 50 * recentSum / recentWeight, contributions, details, time: candles[end].time + INTERVAL };
}
export function scoreHistory(candles) {
  return candles.slice(WINDOW).map((_, offset) => scoreAt(candles, WINDOW + offset));
}
export function entryDecision(long, delta, recentLong) {
  if (long >= 70 && delta >= 3 && recentLong > 50) return '롱 진입 후보';
  if (long <= 30 && delta <= -3 && recentLong < 50) return '숏 진입 후보';
  return '대기';
}
export function positionDecision(position, long) {
  if (position === 'long') return long >= 70 ? '유지' : long >= 55 ? '경계' : long >= 45 ? '청산 검토' : '청산 신호';
  if (position === 'short') return long <= 30 ? '유지' : long <= 45 ? '경계' : long <= 55 ? '청산 검토' : '청산 신호';
  return '포지션 없음';
}
// Wilder ATR: seed with the mean of the first 14 true ranges, then smooth.
export function atr(candles, period = 14) {
  if (candles.length < period + 1) throw new Error('ATR 계산 데이터가 부족합니다.');
  const ranges = candles.slice(1).map((c, i) => Math.max(c.high - c.low, Math.abs(c.high - candles[i].close), Math.abs(c.low - candles[i].close)));
  let value = ranges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const range of ranges.slice(period)) value = (value * (period - 1) + range) / period;
  return value;
}
export function levels(position, price, atrValue) {
  if (!['long', 'short'].includes(position) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(atrValue) || atrValue < 0) return null;
  const distance = atrValue * 1.5;
  const sign = position === 'long' ? 1 : -1;
  return { entry: price, stop: price - sign * distance, target: price + sign * 2 * distance, distance };
}
export function parseCandles(rows, serverTime) {
  if (!Array.isArray(rows) || !Number.isFinite(serverTime)) throw new Error('잘못된 API 데이터입니다.');
  const candles = rows.map(row => {
    if (!Array.isArray(row) || row.length < 6 || row.slice(0, 6).some(v => v === '' || v === null || v === undefined)) throw new Error('캔들 데이터가 누락되었습니다.');
    const [time, open, high, low, close, volume] = row.slice(0, 6).map(Number);
    if (![time, open, high, low, close, volume].every(Number.isFinite) || !Number.isInteger(time) || time % INTERVAL !== 0 || Math.min(open, high, low, close) <= 0 || volume < 0 || low > Math.min(open, close) || high < Math.max(open, close) || high < low) throw new Error('유효하지 않은 가격·거래량 데이터입니다.');
    return { time, open, high, low, close, volume };
  }).filter(c => c.time + INTERVAL <= serverTime).sort((a, b) => a.time - b.time);
  if (candles.length < 55) throw new Error('분석과 1시간 비교에는 최소 55개 완료 봉이 필요합니다.');
  for (let i = 1; i < candles.length; i++) if (candles[i].time - candles[i - 1].time !== INTERVAL) throw new Error('15분봉 누락 또는 중복이 감지되었습니다.');
  const expected = Math.floor(serverTime / INTERVAL) * INTERVAL - INTERVAL;
  if (candles.at(-1).time !== expected) throw new Error('최신 완료 봉이 누락되었습니다. 잠시 후 다시 조회하세요.');
  return candles;
}

// Round the complementary display together so visible scores also total 100.0.
export function displayedScores(score) {
  const long = Number(score.long.toFixed(1));
  return { long: long.toFixed(1), short: (100 - long).toFixed(1) };
}
