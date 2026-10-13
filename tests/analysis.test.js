import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, volumeWeight, bodyWeight, timeWeight, scoreAt, scoreHistory, entryDecision, positionDecision, atr, levels, parseCandles, INTERVAL, displayedScores } from '../js/analysis.js';
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-10, `${a} != ${b}`);
const candle = (open = 100, close = 110, volume = 200) => ({ time: 0, open, close, high: Math.max(open, close), low: Math.min(open, close), volume });
const series = n => Array.from({length:n}, (_,i) => ({...candle(100,110,i+100),time:i*INTERVAL}));
const rows = cs => cs.map(c => [c.time,c.open,c.high,c.low,c.close,c.volume].map(String));
test('4원칙 분류와 도지·거래량 동일 중립', () => {
  const previous = candle(100,110,100);
  for (const [c,rule,direction] of [[candle(100,110,200),0,1],[candle(100,110,50),1,-1],[candle(110,100,200),2,-1],[candle(110,100,50),3,1]]) {
    const result = classify(c,previous); assert.equal(result.rule,rule); assert.equal(result.direction,direction);
  }
  for (const c of [candle(100,100,200),candle(100,110,100)]) { assert.equal(classify(c,previous).strength,0); assert.equal(classify(c,previous).rule,null); }
});
test('직전 거래량 0: 증가 무한대 / 둘 다 0 중립', () => {
  assert.equal(classify(candle(100,110,1),candle(100,110,0)).rate,Infinity);
  assert.equal(classify(candle(100,110,1),candle(100,110,0)).strength,1);
  assert.equal(classify(candle(100,110,0),candle(100,110,0)).strength,0);
});
test('거래량 가중치 경계값과 감소율', () => {
  for (const [rate,weight] of [[0,.25],[.099999,.25],[.1,.5],[.299999,.5],[.3,.75],[.599999,.75],[.6,1],[2,1]]) { assert.equal(volumeWeight(rate),weight); assert.equal(volumeWeight(-rate),weight); }
});
test('몸통 가중치 경계값', () => {
  for (const [ratio,weight] of [[0,.25],[.199999,.25],[.2,.5],[.399999,.5],[.4,.75],[.699999,.75],[.7,1],[1,1]]) assert.equal(bodyWeight(ratio),weight);
  assert.equal(classify(candle(100,100),candle()).ratio,0);
});
test('50봉 시간 가중치 총합 1 및 구간별 동일 가중치', () => {
  near(Array.from({length:50},(_,i)=>timeWeight(i+1)).reduce((a,b)=>a+b,0),1);
  for (let bucket=0;bucket<5;bucket++) for (let i=1;i<=10;i++) near(timeWeight(bucket*10+i),[.04,.025,.015,.012,.008][bucket]);
  assert.throws(()=>timeWeight(0)); assert.throws(()=>timeWeight(51));
});
test('알려진 최대 롱 / 최대 숏 / 중립 점수 및 합계 100', () => {
  for (const [direction,expected] of [[1,100],[-1,0],[0,50]]) {
    const cs = Array.from({length:60},(_,i)=>({...candle(direction===-1?110:100,direction===0?100:direction===-1?100:110,2**i),time:i*INTERVAL}));
    const s = scoreAt(cs); near(s.long,expected); near(s.short+s.long,100); near(s.recentLong,expected);
    near(s.contributions.reduce((a,b)=>a+b,0),expected-50);
  }
  for (const s of scoreHistory(series(100))) {near(s.long+s.short,100);assert.ok(s.long>=0&&s.long<=100);}
  assert.throws(()=>scoreAt(series(50)));
});
test('최근 10봉 정규화: 직전 40봉 중립, 최신 10봉 강한 롱', () => {
  const cs = Array.from({length:51},(_,i)=>({...candle(100,i<41?100:110,2**i),time:i*INTERVAL}));
  const s = scoreAt(cs); near(s.long,70); near(s.recentLong,100);
});
test('과거 시점 계산은 이후 봉의 추가·변경과 무관', () => {
  const cs = series(120), prefix = cs.slice(0,80);
  const before = scoreAt(prefix);
  const changed = cs.map((c,i)=> i<80?c:{...c,open:10000,close:1,volume:1e12});
  assert.deepEqual(scoreAt(changed,79),before);
  assert.deepEqual(scoreHistory(changed).slice(0,30),scoreHistory(prefix));
  assert.equal(before.time,80*INTERVAL);
});
test('롱·숏 진입 경계와 세 조건 모두 충족 필요', () => {
  assert.equal(entryDecision(70,3,50.01),'롱 진입 후보');
  assert.equal(entryDecision(30,-3,49.99),'숏 진입 후보');
  for (const values of [[69.99,3,60],[70,2.99,60],[70,3,50],[30.01,-3,40],[30,-2.99,40],[30,-3,50],[50,0,50]]) assert.equal(entryDecision(...values),'대기');
});
test('롱 보유 판단 모든 경계', () => {
  for (const [s,label] of [[100,'유지'],[70,'유지'],[69.99,'경계'],[55,'경계'],[54.99,'청산 검토'],[45,'청산 검토'],[44.99,'청산 신호']]) assert.equal(positionDecision('long',s),label);
});
test('숏 보유 판단 모든 경계', () => {
  for (const [s,label] of [[0,'유지'],[30,'유지'],[30.01,'경계'],[45,'경계'],[45.01,'청산 검토'],[55,'청산 검토'],[55.01,'청산 신호']]) assert.equal(positionDecision('short',s),label);
  assert.equal(positionDecision('none',99),'포지션 없음');
});
test('Wilder ATR은 갭을 포함하고 14봉 이후 평활', () => {
  const cs = Array.from({length:16},(_,i)=>({...candle(100,110),time:i*INTERVAL}));
  near(atr(cs),10);
  cs[15]={...cs[15],open:130,low:130,high:140,close:140};
  near(atr(cs),(10*13+30)/14);
  assert.throws(()=>atr(cs.slice(0,14)));
});
test('ATR 손절·목표가 및 진입가 미입력', () => {
  assert.deepEqual(levels('long',100,10),{entry:100,stop:85,target:130,distance:15});
  assert.deepEqual(levels('short',100,10),{entry:100,stop:115,target:70,distance:15});
  for (const p of [NaN,0,-1,Infinity,undefined]) assert.equal(levels('long',p,10),null);
});
test('미완성 봉 제외, 역순 API 응답 정렬, 정확한 완료 경계', () => {
  const cs = series(60);
  const parsed = parseCandles(rows(cs).reverse(),59*INTERVAL+1000);
  assert.equal(parsed.length,59); assert.equal(parsed.at(-1).time,58*INTERVAL);
  assert.equal(parseCandles(rows(cs),60*INTERVAL).length,60);
});
test('API 데이터 부족·누락·중복·잘못된 OHLCV·최신 누락 오류', () => {
  const cs = series(60), valid = rows(cs), time = 60*INTERVAL;
  assert.throws(()=>parseCandles(rows(cs.slice(0,54)),54*INTERVAL));
  assert.throws(()=>parseCandles(valid.filter((_,i)=>i!==20),time),/누락/);
  assert.throws(()=>parseCandles([...valid,valid[20]],time),/중복/);
  assert.throws(()=>parseCandles(valid.slice(0,-1),time),/최신/);
  for (const [column,value] of [[1,'NaN'],[2,'1'],[3,'1000'],[5,'-1'],[5,''],[0,'1']]) {
    const bad = valid.map(r=>[...r]); bad[20][column]=value; assert.throws(()=>parseCandles(bad,time));
  }
});

test('롱·숏 정수 반올림 표시 합계 100, 원본 점수 유지', () => {
  for (const [long, short, expectedLong, expectedShort] of [
    [40.1, 59.9, '40', '60'], [40.9, 59.1, '41', '59'],
    [41.5, 58.5, '42', '58'], [41.49, 58.51, '41', '59'],
    [0.5, 99.5, '1', '99'], [99.5, 0.5, '100', '0'],
    [50, 50, '50', '50'], [0, 100, '0', '100'], [100, 0, '100', '0'],
    [69.96, 30.04, '70', '30']
  ]) {
    const score = { long, short };
    assert.deepEqual(displayedScores(score), { long: expectedLong, short: expectedShort });
    assert.equal(Number(expectedLong) + Number(expectedShort), 100);
    assert.deepEqual(score, { long, short });
    near(score.long + score.short, 100);
  }
});
