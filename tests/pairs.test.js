'use strict';
/* 組合儲存的測試：node --test tests/
   只用假資料和 in-memory adapter，不碰 localStorage、不呼叫 TDX。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPairStore,memoryStorage,ROUTES_TTL,EX_MAX}=require('../pairs.js');

const route=(name,extra)=>Object.assign({city:'Taipei',route:'TPE'+name,name,dir:0,stop:'TPE9'+name,hops:5},extra);
const pair=(id,extra)=>Object.assign({id,name:'組合'+id,from:'甲站',to:'乙站',routes:[route('100'),route('200')],resolvedAt:1000},extra);
const clock=t=>{const c={t,now:()=>c.t}; return c};
const make=(data,c)=>{const s=memoryStorage(data); return {s,store:createPairStore(s,{now:(c||clock(2000)).now})}};

test('整份不是陣列：當成沒有組合，頁面照常', ()=>{
  for(const bad of [{},'x',42,null,true]){
    const {store}=make({'bus.pairs':bad});
    assert.deepEqual(store.list(),[]);
    assert.equal(store.current(),null);
  }
});

test('某組缺欄位：只丟那一組', ()=>{
  const {store}=make({'bus.pairs':[pair('a'),pair('b',{from:5}),null,'x',pair('c',{to:''}),pair('d')]});
  assert.deepEqual(store.list().map(p=>p.id),['a','d']);
});

test('重複 id：只留第一組', ()=>{
  const {store}=make({'bus.pairs':[pair('a',{name:'第一'}),pair('a',{name:'第二'})]});
  assert.deepEqual(store.list().map(p=>p.name),['第一']);
});

test('路線格式錯：保留組合，路線清掉等重找', ()=>{
  const {store}=make({'bus.pairs':[
    pair('a',{routes:'壞'}),
    pair('b',{routes:[route('1'),route('2',{city:'Mars'})]}),
    pair('c',{routes:[route('1',{hops:-1})]})]});
  for(const p of store.list()){
    assert.equal(p.routes,null);
    assert.equal(store.needsRoutes(p.id),true);
  }
});

test('排除清單混入非字串或過長：略過那幾筆', ()=>{
  const {store}=make({'bus.pairs':[pair('a',{exclude:['L9',5,null,'x'.repeat(41),'L9直','L9']})]});
  assert.deepEqual([...store.current().exclude],['L9','L9直']);
});

test('超過上限：組合 20、路線 200、名稱 40 字', ()=>{
  const many=Array.from({length:25},(_,i)=>pair('p'+i));
  const routes=Array.from({length:250},(_,i)=>route(String(i)));
  const {store}=make({'bus.pairs':many.concat([])});
  assert.equal(store.list().length,20);
  const {store:s2}=make({'bus.pairs':[pair('a',{routes,name:'名'.repeat(60)})]});
  assert.equal(s2.current().routes.length,200);
  assert.equal(s2.current().name.length,40);
});

test('讀到壞資料不寫回，儲存內容保持原樣', ()=>{
  const data={'bus.pairs':[pair('a'),{壞:1},pair('b',{routes:'壞'})]};
  const {s,store}=make(data);
  store.list(); store.current(); store.needsRoutes('b');
  assert.equal(s.raw('bus.pairs'),JSON.stringify(data['bus.pairs']));
});

test('使用者修改時才寫回清乾淨的版本', ()=>{
  const {s,store}=make({'bus.pairs':[pair('a'),{壞:1}]});
  store.toggleExclude('a','100');
  assert.deepEqual(s.get('bus.pairs').map(p=>p.id),['a']);
});

test('舊資料沒有 exclude：視為不排除，寫回也不多出欄位', ()=>{
  const {s,store}=make({'bus.pairs':[pair('a'),pair('b')]});
  assert.deepEqual([...store.current().exclude],[]);
  store.toggleExclude('b','100');
  const saved=s.get('bus.pairs');
  assert.equal('exclude' in saved[0],false);
  assert.deepEqual(saved[1].exclude,['100']);
  assert.deepEqual(Object.keys(saved[0]).sort(),['from','id','name','resolvedAt','routes','to']);
});

test('cur 指向不存在的組合：退回第一組', ()=>{
  for(const cur of ['zzz',5,null,undefined]){
    const {store}=make({'bus.pairs':[pair('a'),pair('b')],'bus.cur':cur});
    assert.equal(store.current().id,'a');
  }
  const {store}=make({'bus.pairs':[pair('a'),pair('b')],'bus.cur':'b'});
  assert.equal(store.current().id,'b');
});

test('select：存在才切換並記住', ()=>{
  const {s,store}=make({'bus.pairs':[pair('a'),pair('b')]});
  assert.equal(store.select('nope'),false);
  assert.equal(store.select('b'),true);
  assert.equal(store.current().id,'b');
  assert.equal(s.get('bus.cur'),'b');
});

test('刪除目前那組：改選第一組；刪最後一組：沒有組合', ()=>{
  const {s,store}=make({'bus.pairs':[pair('a'),pair('b')],'bus.cur':'b'});
  assert.equal(store.remove('b'),true);
  assert.equal(store.current().id,'a');
  assert.equal(s.get('bus.cur'),'a');
  assert.equal(store.remove('nope'),false);
  store.remove('a');
  assert.equal(store.current(),null);
  assert.deepEqual(s.get('bus.pairs'),[]);
});

test('排除切換：加入、取消、上限 50', ()=>{
  const {store}=make({'bus.pairs':[pair('a')]});
  store.toggleExclude('a','L9');
  assert.deepEqual([...store.current().exclude],['L9']);
  store.toggleExclude('a','L9');
  assert.deepEqual([...store.current().exclude],[]);
  for(let i=0;i<60;i++) store.toggleExclude('a','r'+i);
  assert.equal(store.current().exclude.length,EX_MAX);
  assert.equal(store.toggleExclude('nope','1'),null);
});

test('路線 7 天過期', ()=>{
  const c=clock(1000);
  const {store}=make({'bus.pairs':[pair('a',{resolvedAt:1000}),pair('b',{routes:null,resolvedAt:undefined})]},c);
  assert.equal(store.needsRoutes('a'),false);
  c.t=1000+ROUTES_TTL;      assert.equal(store.needsRoutes('a'),false);
  c.t=1000+ROUTES_TTL+1;    assert.equal(store.needsRoutes('a'),true);
  assert.equal(store.needsRoutes('b'),true);
  store.setRoutes('a',[route('300')]);
  assert.equal(store.needsRoutes('a'),false);
  assert.deepEqual(store.current().routes.map(r=>r.name),['300']);
});

test('setRoutes：組合已被刪除回傳 null；壞路線存成需要重找', ()=>{
  const {store}=make({'bus.pairs':[pair('a')]});
  assert.equal(store.setRoutes('nope',[route('1')]),null);
  store.setRoutes('a',[{亂:1}]);
  assert.equal(store.needsRoutes('a'),true);
});

test('新增：寫回並可選取；滿 20 組或站名不對會丟出可顯示的錯誤', ()=>{
  const {s,store}=make({});
  const p=store.add('上班','甲站','乙站',[route('1')]);
  assert.equal(store.needsRoutes(p.id),false);
  assert.equal(s.get('bus.pairs').length,1);
  assert.throws(()=>store.add('x','','乙站',[]),/上車站或下車站/);
  for(let i=1;i<20;i++) store.add('組'+i,'甲站','乙站',[]);
  assert.throws(()=>store.add('滿','甲站','乙站',[]),/最多只能存 20 組/);
  assert.equal(new Set(store.list().map(x=>x.id)).size,20);
});

test('給出去的組合是唯讀的', ()=>{
  const {s,store}=make({'bus.pairs':[pair('a')]});
  const p=store.current();
  assert.throws(()=>{p.name='改'});
  assert.throws(()=>{p.exclude.push('1')});
  assert.throws(()=>{p.routes[0].name='改'});
  assert.throws(()=>{store.list().push(pair('z'))});
  assert.equal(s.get('bus.pairs')[0].name,'組合a');
});

/* ---------- 生活圈與轉乘 ---------- */
test('生活圈：舊資料沒有 region＝雙北；不認得的也當雙北；雙北寫回時不多寫欄位', ()=>{
  const {s,store}=make({'bus.pairs':[pair('a'),pair('b',{region:'taichung'}),pair('c',{region:'火星'})]});
  assert.deepEqual(store.list().map(p=>p.region),['north','taichung','north']);
  store.toggleExclude('a','100');
  const raw=JSON.parse(s.raw('bus.pairs'));
  assert.equal('region' in raw[0],false); assert.equal(raw[1].region,'taichung'); assert.equal('region' in raw[2],false);
  assert.equal('via' in raw[0],false); assert.equal('routes2' in raw[0],false); assert.equal('exclude2' in raw[0],false);
});

test('直達組合寫回後格式和以前完全相同', ()=>{
  const old=[pair('a',{exclude:['100']})];
  const {s,store}=make({'bus.pairs':old});
  store.toggleExclude('a','200'); store.toggleExclude('a','200');
  assert.deepEqual(JSON.parse(s.raw('bus.pairs')),old);
});

test('新增轉乘組合：存 via、第二段；兩段各自排除', ()=>{
  const {s,store}=make({});
  const p=store.add('去遠方','甲站','乙站',[route('1')],{region:'kaohsiung',via:'轉站',routes2:[route('2')]});
  assert.equal(p.via,'轉站'); assert.equal(p.region,'kaohsiung'); assert.deepEqual(p.routes2.map(r=>r.name),['2']);
  store.toggleExclude(p.id,'2',2);
  const q=store.current();
  assert.deepEqual([...q.exclude],[]); assert.deepEqual([...q.exclude2],['2']);
  const raw=JSON.parse(s.raw('bus.pairs'))[0];
  assert.equal(raw.via,'轉站'); assert.deepEqual(raw.exclude2,['2']); assert.equal(raw.region,'kaohsiung');
  assert.equal(store.needsRoutes(p.id),false);
});

test('轉乘組合第二段壞掉或沒有：要重找；直達組合帶的 routes2、exclude2 會被忽略', ()=>{
  const {store}=make({'bus.pairs':[
    pair('a',{via:'轉站',routes2:'壞'}),
    pair('b',{via:'轉站'}),
    pair('c',{routes2:[route('9')],exclude2:['9']}),
    pair('d',{via:'甲站',routes2:[route('9')]})]});
  const [a,b,c,d]=store.list();
  assert.equal(store.needsRoutes(a.id),true); assert.equal(store.needsRoutes(b.id),true);
  assert.equal(c.via,null); assert.equal(c.routes2,null); assert.deepEqual([...c.exclude2],[]);
  assert.equal(d.via,null); /* 轉乘站和上下車站同名：不算轉乘 */
});

test('重找轉乘組合：存兩段與發現的直達；改成直達或維持轉乘', ()=>{
  const c=clock(2000);
  const {store}=make({'bus.pairs':[pair('a',{via:'轉站',routes2:[route('2')],exclude2:['2']})]},c);
  c.t=5000;
  let p=store.setRoutes('a',[route('1')],{routes2:[route('3')],direct:[route('直')]});
  assert.deepEqual(p.routes2.map(r=>r.name),['3']); assert.deepEqual(p.direct.map(r=>r.name),['直']); assert.equal(p.resolvedAt,5000);
  p=store.dismissDirect('a'); assert.equal(p.direct,null); assert.equal(p.via,'轉站');
  store.setRoutes('a',[route('1')],{routes2:[route('3')],direct:[route('直')]});
  p=store.useDirect('a');
  assert.equal(p.via,null); assert.equal(p.routes2,null); assert.deepEqual(p.routes.map(r=>r.name),['直']); assert.deepEqual([...p.exclude2],[]);
  assert.equal(store.useDirect('a').via,null); /* 已經是直達：不動 */
});

test('換轉乘站：兩段換新、第二段排除清單重來；直達組合也能改成轉乘', ()=>{
  const {store}=make({'bus.pairs':[pair('a',{via:'轉站',routes2:[route('2')],exclude2:['2']}),pair('b')]});
  let p=store.setVia('a','新轉站',[route('5')],[route('6')]);
  assert.equal(p.via,'新轉站'); assert.deepEqual(p.routes.map(r=>r.name),['5']); assert.deepEqual([...p.exclude2],[]);
  p=store.setVia('b','轉站',[route('7')],[route('8')]);
  assert.equal(p.via,'轉站'); assert.deepEqual(p.routes2.map(r=>r.name),['8']);
});
