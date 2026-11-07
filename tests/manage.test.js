'use strict';
/* 組合管理的測試：node --test tests/*.test.js
   組合儲存用記憶體版；找路線用假的（記下呼叫、回傳指定結果），使用習慣只記 forget。不碰 DOM、不呼叫 TDX。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPairManager,errText}=require('../manage.js');
const {createPairStore,memoryStorage,PAIR_MAX}=require('../pairs.js');

const R=(name,extra)=>Object.assign({city:'Taichung',route:'C'+name,name,dir:0,stop:'C'+name+'-0',hops:2},extra);
const CAND={via:'轉一',hops:4,hops1:2,hops2:2,n1:1,n2:1,routes1:[R('M1')],routes2:[R('M3',{stop:'C3-0'})]};
const ready=(id,extra)=>Object.assign({id,name:'組'+id,from:'甲站',to:'乙站',routes:[R('L1')],resolvedAt:1000},extra);

/* finder 的每個操作回傳 answers 裡對應的值（函式就呼叫它，可以丟錯或觸發 onWait） */
function rig({pairs=[],answers={}}={}){
  const store=createPairStore(memoryStorage({'bus.pairs':pairs}),{now:()=>2000});
  const calls=[], status=[], forgot=[];
  const answer=(k,args)=>{calls.push([k,...args.slice(0,-1)]); const a=answers[k]; return Promise.resolve(typeof a==='function'?a(...args):a)};
  const finder={forNewPair:(...a)=>answer('forNewPair',a),resolve:(...a)=>answer('resolve',a),transferOptions:(...a)=>answer('transferOptions',a)};
  const pm=createPairManager({store,finder,usage:{forget:id=>forgot.push(id)},onStatus:t=>status.push(t)});
  return {pm,store,calls,status,forgot,last:()=>status.at(-1)};
}
const nokey=()=>Object.assign(new Error('沒有金鑰'),{kind:'nokey'});

test('新增：上車站或下車站沒選，不查詢', async ()=>{
  const r=rig();
  let started=false;
  assert.deepEqual(await r.pm.add({name:'x',from:'',to:'乙站',region:'taipei'},()=>{started=true}),{});
  assert.equal(r.last(),'請先搜尋並選擇上車站和下車站。');
  assert.equal(r.calls.length,0); assert.equal(started,false);
});

test('新增：已滿 20 組先擋，不浪費查詢', async ()=>{
  const r=rig({pairs:Array.from({length:PAIR_MAX},(_,i)=>ready('z'+i))});
  let started=false;
  assert.deepEqual(await r.pm.add({name:'',from:'卯站',to:'辰站',region:'taichung'},()=>{started=true}),{});
  assert.equal(r.last(),'最多只能存 20 組，請先刪除不用的組合。');
  assert.equal(r.calls.length,0); assert.equal(started,false);
});

test('新增：有直達就直接存；沒填名稱用「組合 N」；開始查詢前先呼叫 onStart', async ()=>{
  const r=rig({pairs:[ready('a')],answers:{forNewPair:{direct:[R('M7'),R('M7',{dir:1}),R('M8')],cands:[CAND]}}});
  const order=[];
  const res=await r.pm.add({name:'  ',from:'卯站',to:'辰站',region:'taichung'},()=>order.push('start:'+r.status.length));
  assert.deepEqual(res,{changed:true});
  assert.deepEqual(order,['start:0'],'onStart 在「正在找出符合的路線…」之前');
  assert.deepEqual(r.calls,[['forNewPair','taichung','卯站','辰站']]);
  assert.deepEqual(r.status,['正在找出符合的路線…','已新增，找到 3 條路線：M7、M8。有不想搭的（例如比較繞），可以在上方這一組裡排除。']);
  const p=r.store.list()[1];
  assert.equal(p.name,'組合 2'); assert.equal(p.region,'taichung'); assert.ok(!p.via);
  assert.deepEqual(p.routes.map(x=>x.name),['M7','M7','M8']);
});

test('新增：直達和轉乘都找不到，照樣存起來並說明', async ()=>{
  const r=rig({answers:{forNewPair:{direct:[],cands:[]}}});
  assert.deepEqual(await r.pm.add({name:'無路',from:'卯站',to:'子站',region:'taichung'}),{changed:true});
  assert.equal(r.last(),'已新增，但目前找不到直達、也找不到只轉一次車的路線。');
  assert.deepEqual(r.store.list().map(p=>[p.name,p.routes.length]),[['無路',0]]);
});

test('新增：沒有直達但有轉乘站，先不存，回傳候選；選了才新增轉乘組合', async ()=>{
  const r=rig({answers:{forNewPair:{direct:[],cands:[CAND]}}});
  const res=await r.pm.add({name:' 下班 ',from:'子站',to:'丑站',region:'taichung'});
  assert.equal(r.store.list().length,0,'還沒選不新增');
  assert.equal(r.last(),'');
  assert.deepEqual(res.pick.cands,[CAND]);
  assert.deepEqual(res.pick.input,{name:'下班',from:'子站',to:'丑站',region:'taichung'});
  assert.equal(res.pick.lead,'子站 → 丑站 沒有直達的公車。可以在下面這些站轉一次車：');
  assert.equal(res.pick.confirm(CAND),'用轉一轉乘，新增組合');
  assert.deepEqual(r.pm.addWithVia(res.pick.input,CAND),{changed:true});
  assert.equal(r.last(),'已新增轉乘組合：在轉一轉乘。看板會先顯示第一段，到了轉一再按「看下一段」。');
  const p=r.store.list()[0];
  assert.deepEqual([p.name,p.via,p.region,p.routes[0].name,p.routes2[0].name],['下班','轉一','taichung','M1','M3']);
});

test('用轉乘站新增時組合儲存擋下（例如已滿），顯示它的訊息、不算新增', async ()=>{
  const r=rig({pairs:Array.from({length:PAIR_MAX},(_,i)=>ready('z'+i))});
  assert.deepEqual(r.pm.addWithVia({name:'x',from:'子站',to:'丑站',region:'taichung'},CAND),{});
  assert.equal(r.last(),'最多只能存 20 組，請先刪除不用的組合。');
});

test('新增：這次沒查到（額度不夠）就清掉提示、什麼都不存', async ()=>{
  const r=rig({answers:{forNewPair:null}});
  assert.deepEqual(await r.pm.add({name:'x',from:'卯站',to:'辰站',region:'taichung'}),{});
  assert.deepEqual(r.status,['正在找出符合的路線…','']);
  assert.equal(r.store.list().length,0);
});

test('排隊等查詢額度時提示多久後繼續', async ()=>{
  const r=rig({answers:{forNewPair:(rg,f,t,opts)=>{opts.onWait(42,'quota'); opts.onWait(9,'paused'); return {direct:[],cands:[]}}}});
  await r.pm.add({name:'x',from:'卯站',to:'辰站',region:'taichung'});
  assert.equal(r.status[1],'為了不超過 TDX 每分鐘的查詢上限，約 42 秒後繼續…');
  assert.match(r.status[2],/TDX 暫時限制這組金鑰的查詢次數，約 9 秒後自動重試/);
});

test('錯誤：沒金鑰換成設定頁的說法，其他照原訊息', async ()=>{
  assert.equal(errText(nokey()),'請先儲存金鑰。');
  assert.equal(errText(new Error('網路連不上')),'網路連不上');
  const r=rig({answers:{forNewPair:()=>{throw nokey()}}});
  assert.deepEqual(await r.pm.add({name:'x',from:'卯站',to:'辰站',region:'taichung'}),{});
  assert.equal(r.last(),'請先儲存金鑰。');
});

test('重找路線：存新路線並清掉提示', async ()=>{
  const r=rig({pairs:[ready('a')],answers:{resolve:{routes:[R('L2')]}}});
  assert.deepEqual(await r.pm.refind('a'),{changed:true});
  assert.deepEqual(r.calls,[['resolve',r.calls[0][1]]]); assert.equal(r.calls[0][1].id,'a');
  assert.deepEqual(r.store.list()[0].routes.map(x=>x.name),['L2']);
  assert.deepEqual(r.status,['']);
});

test('重找路線：直達組合找不到時提示可以找轉乘站；轉乘組合不提示', async ()=>{
  const r=rig({pairs:[ready('a'),ready('b',{via:'轉一',routes2:[R('M3')]})],answers:{resolve:{routes:[],routes2:[]}}});
  await r.pm.refind('a');
  assert.equal(r.last(),'「組a」找不到直達的路線，可以按「找轉乘站」。');
  await r.pm.refind('b');
  assert.equal(r.last(),'');
});

test('重找路線：這次沒查到，提示和路線都不動；錯誤顯示出來', async ()=>{
  const r=rig({pairs:[ready('a')],answers:{resolve:null}});
  assert.deepEqual(await r.pm.refind('a'),{});
  assert.deepEqual(r.status,[]);
  assert.deepEqual(r.store.list()[0].routes.map(x=>x.name),['L1']);
  const e=rig({pairs:[ready('a')],answers:{resolve:()=>{throw nokey()}}});
  await e.pm.refind('a'); assert.equal(e.last(),'請先儲存金鑰。');
  assert.deepEqual(await e.pm.refind('沒有這組'),{});
});

test('換轉乘站：回傳候選，選了才改', async ()=>{
  const r=rig({pairs:[ready('a',{from:'子站',to:'丑站'})],answers:{transferOptions:[CAND]}});
  const res=await r.pm.transfers('a');
  assert.equal(res.pick.lead,'子站 → 丑站：可以在下面這些站轉一次車');
  assert.equal(res.pick.confirm(CAND),'改在轉一轉乘');
  assert.ok(!r.store.list()[0].via,'還沒選不改');
  assert.deepEqual(r.pm.chooseVia('a',CAND),{changed:true});
  assert.equal(r.store.list()[0].via,'轉一'); assert.equal(r.last(),'');
});

test('換轉乘站：找不到候選、這次沒查到、錯誤', async ()=>{
  assert.deepEqual(await rig({pairs:[ready('a')],answers:{transferOptions:[]}}).pm.transfers('a'),{none:'找不到只轉一次車的轉乘站。'});
  const n=rig({pairs:[ready('a')],answers:{transferOptions:null}});
  assert.deepEqual(await n.pm.transfers('a'),{}); assert.deepEqual(n.status,[]);
  const e=rig({pairs:[ready('a')],answers:{transferOptions:()=>{throw new Error('壞了')}}});
  assert.deepEqual(await e.pm.transfers('a'),{}); assert.equal(e.last(),'壞了');
});

test('刪除組合連同它的使用習慣', ()=>{
  const r=rig({pairs:[ready('a'),ready('b')]});
  assert.deepEqual(r.pm.remove('a'),{changed:true},'和其他操作一樣回傳 changed');
  assert.deepEqual(r.store.list().map(p=>p.id),['b']);
  assert.deepEqual(r.forgot,['a']);
});
