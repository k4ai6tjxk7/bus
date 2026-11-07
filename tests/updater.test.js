'use strict';
/* 到站更新的測試：node --test tests/*.test.js
   假 TDX、假找路線、記憶體版組合儲存、假時鐘；不開計時器，也不連網。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createUpdater,IDLE_MS}=require('../updater.js');
const {createPairStore,memoryStorage}=require('../pairs.js');

const T0=1_000_000_000_000;
const R=(name,stop)=>({city:'Taipei',route:'R'+name,name,dir:0,stop,hops:2});
const row=(name,stop,sec)=>({_city:'Taipei',StopUID:stop,RouteUID:'R'+name,Direction:0,StopStatus:0,EstimateTime:sec});
const P=(id,extra)=>Object.assign({id,name:id,from:'甲站',to:'乙站',routes:[R('L1','S1')],resolvedAt:T0},extra);
const settle=async()=>{for(let i=0;i<10;i++) await new Promise(r=>setImmediate(r))};

/* opts.pairs：組合；opts.eta：(routes, opts) => 到站資料（可以是 null、Promise 或丟錯） */
function setup(opts){
  opts=opts||{};
  const clock={t:T0}, now=()=>clock.t;
  const store=createPairStore(memoryStorage({'bus.pairs':opts.pairs||[P('a')],'bus.cur':opts.cur}),{now});
  const calls=[], views=[];
  let key=opts.key!==false;
  const tdx={
    hasKey:()=>key,
    arrivals:async(routes,o)=>{
      calls.push({kind:'eta',stops:routes.map(r=>r.stop),auto:!!o.auto});
      return opts.eta?opts.eta(routes,o):[row('L1','S1',400)];
    }
  };
  const finder={resolve:async(p,o)=>{
    calls.push({kind:'resolve',id:p.id,auto:!!o.auto});
    return opts.resolve?opts.resolve(p,o):{routes:p.routes,routes2:p.routes2,direct:[]};
  }};
  const up=createUpdater({store,finder,tdx,now,onChange:v=>views.push(v)});
  const view=()=>views[views.length-1];
  const etas=()=>calls.filter(c=>c.kind==='eta').length;
  const at=async ms=>{clock.t=T0+ms; up.tick(); await settle()};
  return {up,store,clock,calls,views,view,etas,at,setKey:v=>{key=v}};
}
const hero=v=>v.loading||(v.board&&v.board.state==='ok'?v.board.hero.name+' '+(v.board.hero.eta.n!=null?v.board.hero.eta.n+'分':v.board.hero.eta.text):v.board&&v.board.state);

/* ---------- 第一次開啟 ---------- */

test('第一次開啟：路線還新就直接查到站；看板、資料時間、狀態燈都更新', async()=>{
  const s=setup();
  assert.equal(s.view(),undefined); /* 還沒開始前不會亂畫 */
  await s.up.start(); await settle();
  assert.deepEqual(s.calls,[{kind:'eta',stops:['S1'],auto:false}]);
  const v=s.view();
  assert.equal(v.mode,'board'); assert.equal(hero(v),'L1 6分');
  assert.equal(v.stampAt,T0); assert.equal(v.stale,false); assert.equal(v.spinning,false); assert.equal(v.message,'');
  assert.ok(s.views.some(x=>x.scene),'拿到新資料時要更新 3D 光點');
});

test('第一次開啟：路線超過 7 天先找路線（顯示「正在找可搭的路線…」）再查到站', async()=>{
  const s=setup({pairs:[P('a',{resolvedAt:T0-8*864e5})]});
  await s.up.start(); await settle();
  assert.deepEqual(s.calls.map(c=>c.kind),['resolve','eta']);
  assert.ok(s.views.some(v=>v.loading==='正在找可搭的路線…'));
  assert.equal(hero(s.view()),'L1 6分');
});

test('沒有金鑰或沒有組合：示範模式，不查詢', async()=>{
  let s=setup({key:false});
  await s.up.start();
  assert.equal(s.view().mode,'demo'); assert.equal(s.view().board.state,'ok'); assert.equal(s.view().stale,true);
  assert.equal(s.calls.length,0);
  s=setup({pairs:[]});
  await s.up.start(); await s.at(60000);
  assert.equal(s.view().mode,'demo'); assert.equal(s.view().pair,null); assert.equal(s.calls.length,0);
});

/* ---------- 更新頻率 ---------- */

test('更新頻率：3 分鐘內有車 30 秒、其他 60 秒、沒有即時資料 90 秒', async()=>{
  for(const [sec,gap] of [[120,30000],[400,60000],[null,90000]]){
    const s=setup({eta:()=>sec==null?[]:[row('L1','S1',sec)]});
    await s.up.start(); await settle();
    await s.at(gap-1000); assert.equal(s.etas(),1,`${sec} 秒：時間還沒到不查`);
    await s.at(gap); assert.equal(s.etas(),2,`${sec} 秒：${gap/1000} 秒後查`);
    assert.equal(s.calls[1].auto,true,'心跳的查詢是自動更新');
  }
});

test('下次更新從拿到資料的時間起算（排隊等很久時不會一查完又馬上再查）', async()=>{
  const s=setup({eta:()=>{s.clock.t+=50000; return [row('L1','S1',400)]}});
  await s.up.start(); await settle();
  assert.equal(s.view().stampAt,T0+50000);
  s.clock.t=T0+100000; s.up.tick(); await settle();
  assert.equal(s.etas(),1,'拿到資料後才 50 秒，還不用查');
});

test('倒數：兩次查詢之間畫面自己扣秒數，不查詢；扣過秒的班次也交給 3D 場景', async()=>{
  const s=setup();
  await s.up.start(); await settle();
  await s.at(40000);
  assert.equal(hero(s.view()),'L1 6分'); assert.equal(s.view().scene,true);
  assert.deepEqual(s.view().board.buses,[{name:'L1',sec:360,hot:false}]);
  await s.at(55000);
  assert.equal(hero(s.view()),'L1 5分'); assert.equal(s.etas(),1);
});

test('倒數跨過 3 分鐘時自動更新被跳過：看板變將到站，交給 3D 場景的班次也同時變將到站', async()=>{
  let skip=false;
  const s=setup({eta:(r,o)=>o.auto&&skip?null:[row('L1','S1',230)]});
  await s.up.start(); await settle();         /* 230 秒：還不是將到站，60 秒後才再查 */
  skip=true;                                  /* 額度不夠：之後的自動更新都被跳過，只靠本地倒數 */
  await s.at(40000);
  assert.equal(hero(s.view()),'L1 3分'); assert.deepEqual(s.view().board.buses,[{name:'L1',sec:190,hot:false}]);
  const n=s.views.length;
  await s.at(55000);
  assert.equal(s.etas(),2,'跨過 3 分鐘時更新頻率變 30 秒，試著查但被跳過');
  assert.equal(hero(s.view()),'L1 將到站');
  const toScene=s.views.slice(n).filter(v=>v.scene&&v.board);
  assert.ok(toScene.length,'有把班次交給 3D 場景');
  assert.deepEqual(toScene[toScene.length-1].board.buses,[{name:'L1',sec:175,hot:true}]);
});

test('自動更新額度不夠被跳過：不推進下次查詢時間，下次心跳再試', async()=>{
  let skip=false;
  const s=setup({eta:(r,o)=>o.auto&&skip?null:[row('L1','S1',400)]});
  await s.up.start(); await settle();
  skip=true; await s.at(60000); assert.equal(s.etas(),2);
  skip=false; await s.at(65000); assert.equal(s.etas(),3,'下一次心跳馬上再試');
  await s.at(70000); assert.equal(s.etas(),3);
});

test('找路線時被跳過也一樣：下次心跳再試', async()=>{
  let skip=true;
  const s=setup({pairs:[P('a',{resolvedAt:T0-8*864e5})],resolve:(p,o)=>o.auto&&skip?null:{routes:p.routes}});
  s.up.tick(); await settle(); /* 心跳的自動更新先遇到額度不夠 */
  assert.deepEqual(s.calls.map(c=>c.kind),['resolve']);
  skip=false; await s.at(5000);
  assert.deepEqual(s.calls.map(c=>c.kind),['resolve','resolve','eta']);
});

/* ---------- 切換組合、段落 ---------- */

test('查詢途中切換組合：舊結果不畫但存起來，查完馬上接著查新組合', async()=>{
  let release;
  const s=setup({pairs:[P('a'),P('b',{routes:[R('L2','S2')]})],
    eta:r=>r[0].stop==='S1'?new Promise(ok=>{release=()=>ok([row('L1','S1',400)])}):[row('L2','S2',300)]});
  s.up.start(); await settle();
  assert.equal(s.up.select('b'),true);
  assert.equal(s.view().loading,'載入中…'); assert.equal(s.view().pair.id,'b');
  assert.equal(s.etas(),1,'舊查詢還在跑時不重複送');
  release(); await settle();
  assert.deepEqual(s.calls.map(c=>[c.stops[0],c.auto]),[['S1',false],['S2',false]],'舊的一查完就接著查新組合，不用等心跳');
  assert.equal(hero(s.view()),'L2 5分');
  s.up.select('a');
  assert.equal(hero(s.view()),'L1 6分','舊組合查到的資料留著，切回去直接顯示');
  assert.equal(s.etas(),2);
  assert.equal(s.up.select('不存在'),false);
});

test('查詢途中切換組合：舊組合的錯誤不顯示在新組合上', async()=>{
  let fail;
  const s=setup({pairs:[P('a'),P('b',{routes:[R('L2','S2')]})],
    eta:r=>r[0].stop==='S1'?new Promise((ok,no)=>{fail=()=>no(Object.assign(new Error('網路連線失敗'),{kind:'network'}))}):[row('L2','S2',300)]});
  s.up.start(); await settle();
  s.up.select('b'); fail(); await settle();
  assert.ok(!s.views.some(v=>v.pair.id==='b'&&v.message),'畫面上不閃出舊組合的錯誤'); assert.equal(hero(s.view()),'L2 5分'); assert.equal(s.view().stale,false);
});

test('切換組合：3 分鐘內的資料先顯示，不顯示載入中；到更新時間才在背景查', async()=>{
  const s=setup({pairs:[P('a'),P('b',{routes:[R('L2','S2')]})],eta:r=>[row(r[0].name,r[0].stop,400)]});
  await s.up.start(); await settle();
  s.up.select('b'); await settle();
  assert.equal(s.etas(),2);
  s.clock.t=T0+20000; s.up.select('a');
  assert.ok(!s.views.slice(-3).some(v=>v.loading),'不轉圈');
  assert.equal(hero(s.view()),'L1 6分'); assert.equal(s.view().stampAt,T0); assert.equal(s.view().stale,false);
  await settle(); assert.equal(s.etas(),2,'最近一班 6 分鐘，60 秒內的資料不用重查');
  await s.at(59000); assert.equal(s.etas(),2);
  await s.at(60000); assert.equal(s.etas(),3); assert.deepEqual(s.calls[2],{kind:'eta',stops:['S1'],auto:true},'到時間在背景查（自動更新，不排隊）');
  s.clock.t=T0+90000; s.up.select('b');
  assert.ok(s.views.some(v=>v.pair.id==='b'&&hero(v)==='L2 5分'),'切回 b 先顯示 b 的舊資料（已扣倒數）');
  await settle(); assert.equal(s.etas(),4); assert.equal(s.calls[3].auto,true,'b 的資料已超過更新時間：背景查');
});

test('切換組合：資料超過 3 分鐘就不用，顯示載入中並查', async()=>{
  const s=setup({pairs:[P('a'),P('b',{routes:[R('L2','S2')]})],eta:r=>[row(r[0].name,r[0].stop,400)]});
  await s.up.start(); await settle();
  s.up.select('b'); await settle();
  s.clock.t=T0+3*60000+1000; s.up.select('a');
  assert.equal(s.view().loading,'載入中…'); assert.equal(s.view().stampAt,null);
  await settle(); assert.deepEqual(s.calls.slice(-1),[{kind:'eta',stops:['S1'],auto:false}]);
});

test('切換組合時，舊組合還在排隊等額度的查詢直接取消', async()=>{
  let cancelled=null;
  const s=setup({pairs:[P('a'),P('b',{routes:[R('L2','S2')]})],
    eta:(r,o)=>r[0].stop==='S1'?new Promise(ok=>{const t=setInterval(()=>{if(o.cancel()){clearInterval(t); cancelled=true; ok(null)}},1)}):[row('L2','S2',300)]});
  s.up.start(); await settle();
  s.up.select('b');
  await new Promise(r=>setTimeout(r,20)); await settle();
  assert.equal(cancelled,true);
  assert.equal(hero(s.view()),'L2 5分');
  assert.deepEqual(s.calls.map(c=>c.stops[0]),['S1','S2']);
});

const TR=P('t',{via:'轉一',routes:[R('L7','S1')],routes2:[R('L10','S9')]});
const trEta=()=>[row('L7','S1',400),row('L10','S9',700)];

test('切換段落不查詢；換組合回到第一段', async()=>{
  const s=setup({pairs:[TR,P('a')],eta:trEta});
  await s.up.start(); await settle();
  assert.deepEqual(s.calls[0].stops,['S1','S9'],'兩段的站牌一起查');
  s.up.switchLeg();
  assert.equal(s.up.leg(),2); assert.equal(hero(s.view()),'L10 11分'); assert.equal(s.view().scene,true);
  s.up.switchLeg(); assert.equal(s.up.leg(),1); assert.equal(hero(s.view()),'L7 6分');
  assert.equal(s.etas(),1);
  s.up.switchLeg(); s.up.select('a'); assert.equal(s.up.leg(),1);
  /* 直達組合沒有段落 */
  await settle(); s.up.switchLeg(); assert.equal(s.up.leg(),1);
});

test('離開 30 分鐘以上回來：回到第一段並問要不要換組合；20 分鐘回來維持', async()=>{
  for(const [mins,leg,asked] of [[31,1,true],[20,2,false]]){
    const s=setup({pairs:[TR],eta:trEta});
    await s.up.start(); await settle(); s.up.switchLeg();
    s.up.leave(); s.clock.t=T0+mins*60000;
    let picked=false;
    s.up.back(()=>{picked=true; return false}); await settle();
    assert.equal(s.up.leg(),leg,`${mins} 分鐘`); assert.equal(picked,asked);
    assert.equal(s.etas(),2,'資料超過 20 秒，回來就查');
  }
});

test('回來時 pick 換了組合：顯示載入中並查新組合', async()=>{
  const s=setup({pairs:[P('a'),P('b',{routes:[R('L2','S2')]})],eta:r=>[row(r[0].name,r[0].stop,300)]});
  await s.up.start(); await settle();
  s.up.leave(); s.clock.t=T0+40*60000;
  s.up.back(()=>s.store.select('b')); assert.equal(s.view().loading,'載入中…');
  await settle();
  assert.deepEqual(s.calls.map(c=>[c.stops[0],c.auto]),[['S1',false],['S2',false]]);
});

test('切回來資料還不到 20 秒：只扣倒數，不查詢', async()=>{
  const s=setup();
  await s.up.start(); await settle();
  s.up.leave(); s.clock.t=T0+15000; s.up.back(); await settle();
  assert.equal(s.etas(),1);
  s.up.leave(); s.clock.t=T0+25000; s.up.back(); await settle();
  assert.equal(s.etas(),2); assert.equal(s.calls[1].auto,true);
});

/* ---------- 閒置與設定頁 ---------- */

test('閒置 10 分鐘暫停自動更新，點一下恢復並馬上查', async()=>{
  const s=setup();
  await s.up.start(); await settle();
  await s.at(IDLE_MS+1000);
  assert.equal(s.etas(),1); assert.match(s.view().message,/已暫停自動更新/); assert.equal(s.view().stale,true);
  await s.at(IDLE_MS+5*60000); assert.equal(s.etas(),1);
  s.up.touch(); await settle();
  assert.equal(s.etas(),2); assert.equal(s.calls[1].auto,false); assert.equal(s.view().message,'');
  s.up.touch(); await settle(); assert.equal(s.etas(),2,'沒有暫停時點畫面不查');
});

test('在設定頁或 App 在背景時不查；回到看板時資料到更新時間才查', async()=>{
  const s=setup();
  await s.up.start(); await settle();
  s.up.setActive(false); s.clock.t=T0+30000; s.up.setActive(true); await settle();
  assert.equal(s.etas(),1,'30 秒的資料（最近一班 6 分鐘）不重查'); assert.equal(hero(s.view()),'L1 6分');
  s.up.setActive(false); await s.at(2*60000); assert.equal(s.etas(),1,'在設定頁不查');
  s.up.setActive(true); await settle(); assert.equal(s.etas(),2,'超過更新時間，回到看板就查');
  s.up.leave(); await s.at(10*60000); assert.equal(s.etas(),2);
});

test('在設定頁改了路線：回到看板顯示載入中並查', async()=>{
  const s=setup();
  await s.up.start(); await settle();
  s.up.setActive(false);
  s.store.setRoutes('a',[R('L3','S3')],{});
  s.up.setActive(true);
  assert.equal(s.view().loading,'載入中…');
  await settle(); assert.deepEqual(s.calls[1],{kind:'eta',stops:['S3'],auto:false});
});

/* ---------- 這一段不用查 ---------- */

test('找不到路線：不查到站，提示依直達／轉乘不同', async()=>{
  let s=setup({pairs:[P('a',{routes:[]})]});
  await s.up.start(); await settle();
  assert.equal(s.etas(),0); assert.equal(s.view().board.state,'noRoutes');
  assert.equal(s.view().message,'請到設定確認站名，或按「重找路線」。');
  s=setup({pairs:[P('t',{via:'轉一',routes:[R('L7','S1')],routes2:[]})]});
  await s.up.start(); await settle(); s.up.switchLeg();
  assert.equal(s.view().board.state,'noRoutes'); assert.equal(s.etas(),1,'切段不查');
  await s.up.refresh(); await settle();
  assert.equal(s.etas(),1,'這一段找不到路線就不查到站');
  assert.equal(s.view().message,'這一段找不到路線，請到設定按「換轉乘站」或「重找路線」。');
});

test('路線全部排除：不查到站，顯示已排除', async()=>{
  const s=setup({pairs:[P('a',{exclude:['L1']})]});
  await s.up.start(); await settle();
  assert.equal(s.etas(),0); assert.equal(s.view().board.state,'allExcluded');
  assert.ok(s.views.some(v=>v.scene&&v.board&&v.board.state==='allExcluded'),'清掉 3D 光點');
});

test('第二段沒車：看第一段時顯示一行警告，看第二段時不顯示', async()=>{
  const s=setup({pairs:[TR],eta:()=>[row('L7','S1',400)]});
  await s.up.start(); await settle();
  assert.equal(s.view().legNote,'第二段（轉一 → 乙站）目前沒有車，可能已收班。');
  s.up.switchLeg(); assert.equal(s.view().legNote,null);
});

/* ---------- 舊到站資料自動失效 ---------- */

test('路線改了，舊到站資料自動失效：先顯示載入中，這次心跳就重查', async()=>{
  const s=setup({eta:r=>[row(r[0].name,r[0].stop,400)]});
  await s.up.start(); await settle();
  s.store.setRoutes('a',[R('L1','S7')]); /* 例如在設定頁重找路線 */
  const n=s.views.length;
  await s.at(5000);
  assert.equal(s.views[n].loading,'載入中…','不拿新路線去對舊資料');
  assert.deepEqual(s.calls.map(c=>c.stops[0]),['S1','S7']);
  assert.equal(hero(s.view()),'L1 6分');
});

test('只排除路線不會讓到站資料失效，也不多查', async()=>{
  const s=setup({pairs:[P('a',{routes:[R('L1','S1'),R('L2','S1')]})],eta:()=>[row('L1','S1',400),row('L2','S1',500)]});
  await s.up.start(); await settle();
  s.store.toggleExclude('a','L1');
  await s.at(5000);
  assert.equal(hero(s.view()),'L2 8分'); assert.equal(s.etas(),1);
});

test('漏洞情境：自動重找路線後查到站被跳過，不再拿新路線對舊資料（以前會顯示「無資料」）', async()=>{
  let skip=false;
  const s=setup({pairs:[P('a',{resolvedAt:T0-7*864e5+60000})],
    resolve:()=>({routes:[R('L1','S7')]}),
    eta:(r,o)=>o.auto&&skip?null:[row(r[0].name,r[0].stop,400)]});
  await s.up.start(); await settle();
  skip=true; await s.at(61000); /* 路線過期 → 重找成功 → 查到站被跳過 */
  assert.deepEqual(s.calls.map(c=>c.kind),['eta','resolve','eta']);
  await s.at(62000);
  assert.equal(s.view().loading,'載入中…');
  assert.ok(!s.views.slice(-3).some(v=>v.board&&v.board.state==='ok'&&v.board.hero.eta.text==='無資料'));
  skip=false; await s.at(67000);
  assert.equal(hero(s.view()),'L1 6分');
});

/* ---------- 錯誤與提示 ---------- */

test('查詢錯誤：顯示訊息並標成資料太舊；額度限制時加一句', async()=>{
  const fail=(kind,message)=>()=>{const e=new Error(message); e.kind=kind; throw e};
  let s=setup({eta:fail('http','資料查詢失敗（HTTP 500）')});
  await s.up.start(); await settle();
  assert.equal(s.view().message,'資料查詢失敗（HTTP 500）'); assert.equal(s.view().stale,true); assert.equal(s.view().spinning,false);
  s=setup({eta:fail('rate','TDX 暫時限制。')});
  await s.up.start(); await settle();
  assert.equal(s.view().message,'TDX 暫時限制。畫面是最後一次的資料。');
});

test('排隊等額度時顯示倒數提示；查詢中轉圈', async()=>{
  let spinning=null;
  const s=setup({eta:(r,o)=>{o.onWait(12,'limit'); spinning=s.view().spinning; return [row('L1','S1',400)]}});
  await s.up.start(); await settle();
  assert.ok(s.views.some(v=>v.message==='為了不超過 TDX 每分鐘的查詢上限，約 12 秒後送出查詢…'));
  assert.equal(spinning,true); assert.equal(s.view().message,'');
});
