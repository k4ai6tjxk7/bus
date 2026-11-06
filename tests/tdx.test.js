'use strict';
/* TDX 查詢的測試：node --test tests/*.test.js
   假的 fetch、假的時鐘（等待會直接把時間往前撥）、in-memory 儲存；不會真的連 TDX。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTdx,TdxError}=require('../tdx.js');
const {memoryStorage}=require('../pairs.js');

const res=(status,body)=>({status,ok:status>=200&&status<300,
  json:async()=>{if(typeof body==='string') throw new SyntaxError('bad'); return body},text:async()=>String(body||'')});
/* handler(url, init, n) 回傳 res(...)；可以丟錯模擬斷網 */
function setup(handler,init){
  const clock={t:1_000_000_000_000};
  const storage=memoryStorage(Object.assign({'bus.cfg':{id:'cid',secret:'sec'}},init||{}));
  const sent=[];
  const fetch=async(url,opt)=>{sent.push({url:decodeURIComponent(url),opt,at:clock.t}); return handler(url,opt,sent.length)};
  const waits=[];
  const tdx=createTdx({fetch,storage,now:()=>clock.t,sleep:async ms=>{clock.t+=ms}});
  return {tdx,storage,clock,sent,waits,onWait:(s,why)=>waits.push([s,why])};
}
const TOKEN=res(200,{access_token:'T1',expires_in:86400});
const ok=data=>(url)=>url.includes('openid-connect')?TOKEN:res(200,data);
const isData=x=>!x.url.includes('openid-connect');

test('沒填金鑰：丟 nokey，不送任何查詢', async()=>{
  const {tdx,sent}=setup(ok([]),{'bus.cfg':null});
  assert.equal(tdx.hasKey(),false);
  await assert.rejects(tdx.arrivals([{city:'Taipei',stop:'S1'}]),e=>e instanceof TdxError&&e.kind==='nokey'&&e.message==='請先到設定填入金鑰。');
  assert.equal(sent.length,0);
});

test('金鑰設定壞掉：當成沒填', ()=>{
  for(const bad of ['x',5,{id:1,secret:'a'},{id:'a'}]){
    const {tdx}=setup(ok([]),{'bus.cfg':bad});
    assert.equal(tdx.hasKey(),false);
  }
});

test('token 快取：第二次操作不再取 token', async()=>{
  const {tdx,sent}=setup(ok([]));
  await tdx.arrivals([{city:'Taipei',stop:'S1'}]);
  await tdx.arrivals([{city:'Taipei',stop:'S1'}]);
  assert.equal(sent.filter(x=>x.url.includes('openid-connect')).length,1);
});

test('401：重取 token 一次後成功', async()=>{
  let first=true;
  const {tdx,sent}=setup((url)=>{
    if(url.includes('openid-connect')) return TOKEN;
    if(first){first=false; return res(401,'')}
    return res(200,[{StopUID:'S1'}]);
  });
  const rows=await tdx.arrivals([{city:'Taipei',stop:'S1'}]);
  assert.equal(rows.length,1);
  assert.equal(sent.filter(x=>x.url.includes('openid-connect')).length,2);
});

test('401 兩次：丟 auth，不無限重試', async()=>{
  const {tdx,sent}=setup(url=>url.includes('openid-connect')?TOKEN:res(401,''));
  await assert.rejects(tdx.arrivals([{city:'Taipei',stop:'S1'}]),e=>e.kind==='auth'&&/重新儲存/.test(e.message));
  assert.equal(sent.filter(isData).length,2);
});

test('61 秒內最多 4 次：第 5 次排隊並倒數，原因是 limit', async()=>{
  const {tdx,sent,clock,onWait,waits}=setup(ok([]));
  const t0=clock.t;
  await tdx.searchStops('甲',{onWait});   /* token + 2 */
  await tdx.searchStops('乙',{onWait});   /* 2：第 2 次要等 */
  assert.equal(sent.length,5);
  const fifth=sent[4].at;
  assert.ok(fifth-t0>=61000,'第 5 次在 61 秒後才送');
  assert.ok(waits.length>0&&waits.every(([,why])=>why==='limit'));
  assert.ok(waits[0][0]>=60&&waits[0][0]<=62);
});

test('自動更新額度不夠：整個操作跳過回傳 null，一次都不送', async()=>{
  const now=1_000_000_000_000;
  const {tdx,sent}=setup(ok([]),{'bus.calls':[now-1000,now-900,now-800],'bus.tok':{v:'T',exp:now+864e5}});
  /* 剩 1 次，但台北＋新北要 2 次 */
  const r=await tdx.arrivals([{city:'Taipei',stop:'S1'},{city:'NewTaipei',stop:'N1'}],{auto:true});
  assert.equal(r,null);
  assert.equal(sent.length,0);
  /* 只查台北 1 次：夠 */
  assert.deepEqual(await tdx.arrivals([{city:'Taipei',stop:'S1'}],{auto:true}),[]);
});

test('自動更新：token 失效時也要算進額度', async()=>{
  const now=1_000_000_000_000;
  const {tdx,sent}=setup(ok([]),{'bus.calls':[now-1000,now-900,now-800]});
  assert.equal(await tdx.arrivals([{city:'Taipei',stop:'S1'}],{auto:true}),null);
  assert.equal(sent.length,0);
});

test('429：丟 rate、暫停 65 秒；暫停中自動更新跳過，使用者操作排隊並標示 paused', async()=>{
  let n=0;
  const {tdx,sent,clock,onWait,waits,storage}=setup(url=>{
    if(url.includes('openid-connect')) return TOKEN;
    return ++n===1?res(429,''):res(200,[]);
  });
  const t0=clock.t;
  await assert.rejects(tdx.arrivals([{city:'Taipei',stop:'S1'}]),e=>e.kind==='rate'&&/自動恢復/.test(e.message));
  assert.equal(await tdx.arrivals([{city:'Taipei',stop:'S1'}],{auto:true}),null);
  const before=sent.length;
  await tdx.arrivals([{city:'Taipei',stop:'S1'}],{onWait});
  assert.equal(sent.length,before+1);
  assert.ok(sent[sent.length-1].at-t0>=65000,'65 秒後才送');
  assert.equal(waits[0][1],'paused');
  assert.ok(waits[0][0]>=64&&waits[0][0]<=66);
  /* 舊版也看得懂：bus.calls 是數字陣列 */
  assert.ok(storage.get('bus.calls').every(x=>typeof x==='number'));
});

test('取 token 時 429：同樣暫停', async()=>{
  const {tdx}=setup(()=>res(429,''));
  await assert.rejects(tdx.arrivals([{city:'Taipei',stop:'S1'}]),e=>e.kind==='rate');
  assert.equal(await tdx.arrivals([{city:'Taipei',stop:'S1'}],{auto:true}),null);
});

test('斷網：丟 network', async()=>{
  const {tdx}=setup(()=>{throw new TypeError('Failed to fetch')});
  await assert.rejects(tdx.arrivals([{city:'Taipei',stop:'S1'}]),e=>e.kind==='network'&&e.message==='連不上 TDX，請確認網路後再試。');
});

test('其他 HTTP 錯誤：丟 http，訊息帶狀態碼；回傳格式不對也是 http', async()=>{
  const {tdx}=setup(url=>url.includes('openid-connect')?TOKEN:res(500,'boom'));
  await assert.rejects(tdx.arrivals([{city:'Taipei',stop:'S1'}]),e=>e.kind==='http'&&e.message==='資料查詢失敗（HTTP 500）：boom');
  const {tdx:t2}=setup(url=>url.includes('openid-connect')?TOKEN:res(200,'<html>'));
  await assert.rejects(t2.arrivals([{city:'Taipei',stop:'S1'}]),e=>e.kind==='http');
});

test('金鑰錯：saveKey 丟 auth；沒填完整丟 nokey；成功會存起來', async()=>{
  const {tdx,storage}=setup(()=>res(401,''),{'bus.cfg':null});
  await assert.rejects(tdx.saveKey('',' x '),e=>e.kind==='nokey');
  await assert.rejects(tdx.saveKey(' a ','b'),e=>e.kind==='auth'&&/HTTP 401/.test(e.message));
  assert.deepEqual(storage.get('bus.cfg'),{id:'a',secret:'b'});
  const {tdx:t2,storage:s2}=setup(ok([]),{'bus.cfg':null});
  assert.equal(await t2.saveKey('a','b'),true);
  assert.equal(s2.get('bus.tok').v,'T1');
  assert.equal(t2.hasKey(),true);
});

test('篩選字串的單引號會跳脫', async()=>{
  const {tdx,sent}=setup(ok([]));
  await tdx.searchStops("O'Hare");
  await tdx.routesThrough("甲'站");
  await tdx.arrivals([{city:'Taipei',stop:"S'1"}]);
  const urls=sent.filter(isData).map(x=>x.url);
  assert.ok(urls[0].includes("contains(StopName/Zh_tw,'O''Hare')"));
  assert.ok(urls[2].includes("contains(s/StopName/Zh_tw,'甲''站')"),urls[2]);
  assert.ok(urls[4].includes("StopUID eq 'S''1'"));
});

test('每個操作花的額度：搜尋 2、經過某站的路線 2、查到站依縣市數；搜尋同關鍵字不重查', async()=>{
  const {tdx,sent}=setup(ok([]),{'bus.tok':{v:'T',exp:1_000_000_000_000+864e5}});
  await tdx.searchStops('甲'); assert.equal(sent.length,2);
  await tdx.searchStops('甲'); assert.equal(sent.length,2);
  await tdx.routesThrough('甲站'); assert.equal(sent.length,4);
  await tdx.arrivals([{city:'Taipei',stop:'S1'},{city:'Taipei',stop:'S2'}]); assert.equal(sent.length,5);
  await tdx.arrivals([{city:'Taipei',stop:'S1'},{city:'NewTaipei',stop:'N1'}]); assert.equal(sent.length,7);
  assert.deepEqual(await tdx.arrivals([]),[]); assert.equal(sent.length,7);
});

test('經過某站的路線：關鍵字原樣送出（站名規則在 routes.js），加上 _city，略過不是物件的資料', async()=>{
  const {tdx,sent}=setup(url=>url.includes('openid-connect')?TOKEN:res(200,url.includes('NewTaipei')?[{RouteUID:'N'}]:[{RouteUID:'T'},null,'x']));
  const rows=await tdx.routesThrough('甲站');
  assert.deepEqual(rows,[{RouteUID:'T',_city:'Taipei'},{RouteUID:'N',_city:'NewTaipei'}]);
  assert.ok(sent.filter(isData).every(x=>x.url.includes("contains(s/StopName/Zh_tw,'甲站')")));
});

test('生活圈：只查那個生活圈的縣市；不認得的生活圈當成雙北；搜尋快取分生活圈', async()=>{
  const {tdx,sent}=setup(ok([{StopName:{Zh_tw:'壬站'}}]),{'bus.tok':{v:'T',exp:1_000_000_000_000+864e5}});
  await tdx.searchStops('台中',{region:'taichung'});
  assert.deepEqual(sent.map(x=>x.url.split('?')[0].split('/').pop()),['Taichung']);
  await tdx.searchStops('台中',{region:'taichung'}); assert.equal(sent.length,1);
  await tdx.searchStops('台中',{region:'hsinchu'}); assert.equal(sent.length,3);
  assert.deepEqual(sent.slice(1).map(x=>x.url.split('?')[0].split('/').pop()),['Hsinchu','HsinchuCounty']);
  await tdx.routesThrough('甲站',{region:'不存在'});
  assert.deepEqual(sent.slice(3).map(x=>x.url.split('?')[0].split('/').pop()),['Taipei','NewTaipei']);
  await tdx.arrivals([{city:'Kaohsiung',stop:'K1'}]);
  assert.ok(sent[5].url.includes('/EstimatedTimeOfArrival/City/Kaohsiung?'));
});

test('查到站：加上 _city，略過不是物件的資料', async()=>{
  const {tdx}=setup(ok([{StopUID:'S1',RouteUID:'R'},null,'x']));
  const rows=await tdx.arrivals([{city:'Taipei',stop:'S1'},{city:'Mars',stop:'K'}]);
  assert.deepEqual(rows,[{StopUID:'S1',RouteUID:'R',_city:'Taipei'}]);
});
