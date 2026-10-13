import test from 'node:test';
import assert from 'node:assert/strict';
import { request, fetchMarket } from '../js/api.js';
import { INTERVAL } from '../js/analysis.js';
test('공개 API 오류, JSON 실패, 거래소 오류가 사용자 오류로 전달됨', async () => {
  const original = globalThis.fetch;
  try {
    for (const [mock,pattern] of [
      [async()=>({ok:false,status:429}),/요청 제한/],
      [async()=>({ok:false,status:403}),/403/],
      [async()=>({ok:true,json:async()=>{throw new Error('invalid')}}),/JSON/],
      [async()=>({ok:true,json:async()=>({retCode:10006,retMsg:'Too many visits'})}),/10006/],
      [async()=>{throw new TypeError('fetch failed')},/샘플 데이터는 사용하지/]
    ]) { globalThis.fetch=mock; await assert.rejects(request('/test',new AbortController().signal),pattern); }
  } finally {globalThis.fetch=original;}
});
test('실제 수집 경로 형태로 서버 시각·캔들·티커 연결 및 요청 제한', async () => {
  const original = globalThis.fetch;
  const time = 100*INTERVAL;
  const rows = Array.from({length:61},(_,i)=>[String((40+i)*INTERVAL),'100','120','90','110','200','22000']).reverse();
  const calls=[];
  globalThis.fetch=async url=>{
    calls.push(url);
    return {ok:true,json:async()=>url.includes('/time')?{retCode:0,result:{timeSecond:String(time/1000)}}:url.includes('/kline')?{retCode:0,result:{category:'linear',symbol:'BTCUSDT',list:rows}}:{retCode:0,result:{list:[{symbol:'BTCUSDT',lastPrice:'111'}]}}};
  };
  try {
    const data = await fetchMarket(); assert.equal(data.price,111); assert.equal(data.candles.length,60);
    assert.equal(data.candles.at(-1).time,99*INTERVAL);
    assert.equal(calls.length,3);assert.ok(calls[1].includes('category=linear'));assert.ok(calls[1].includes('interval=15'));
    await assert.rejects(fetchMarket(),/10초/); assert.equal(calls.length,3);
  } finally {globalThis.fetch=original;}
});
