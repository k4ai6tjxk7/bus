'use strict';
/* 看板內容的測試：node --test tests/*.test.js
   只用假資料，不碰畫面、不呼叫 TDX。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {boardOf,demoBoard}=require('../board.js');

const route=(name,extra)=>Object.assign({city:'Taipei',route:'R'+name,name,dir:0,stop:'S1',hops:5},extra);
const row=(name,d,extra)=>Object.assign({_city:'Taipei',StopUID:'S1',RouteUID:'R'+name,Direction:0},d,extra);
const sec=s=>({StopStatus:0,EstimateTime:s});
const pair=(routes,exclude)=>({to:'乙站',routes,exclude:exclude||[]});
const NOW=Date.parse('2026-11-06T10:00:00+08:00');
const names=b=>b.hero?[b.hero.name].concat(b.rest.map(x=>x.name)):[];

test('排序：分鐘數 → 未發車（依發車時間）→ 末班已過、今日停駛', ()=>{
  const rs=['A','B','C','D','E'].map(n=>route(n));
  const b=boardOf(pair(rs),[
    row('A',{StopStatus:3}),
    row('B',{StopStatus:1,NextBusTime:new Date(NOW+3600e3).toISOString()}),
    row('C',sec(600)),
    row('D',{StopStatus:1,NextBusTime:new Date(NOW+600e3).toISOString()}),
    row('E',sec(240))],NOW,NOW);
  assert.equal(b.state,'ok');
  assert.deepEqual(names(b),['E','C','D','B','A']);
  assert.deepEqual(b.rest[3].eta.kind,'word');
  assert.match(b.rest[1].sub,/^首站發車 \d\d:\d\d · 坐 5 站到乙站$/);
  assert.deepEqual(b.rest[3].eta,{kind:'word',text:'末班已過',tone:'dim'});
});

test('沒有資料的路線顯示「無資料」排最後', ()=>{
  const b=boardOf(pair([route('A'),route('B')]),[row('B',sec(300))],NOW,NOW);
  assert.deepEqual(names(b),['B','A']);
  assert.deepEqual(b.rest[0].eta,{kind:'word',text:'無資料',tone:'dim'});
});

test('同一條路線有多筆資料：取最快的那筆', ()=>{
  const b=boardOf(pair([route('A')]),[row('A',sec(900)),row('A',sec(300)),row('A',sec(600))],NOW,NOW);
  assert.deepEqual(b.hero.eta,{kind:'min',n:5,tone:''});
});

test('只認同縣市、同站、同方向的資料', ()=>{
  const b=boardOf(pair([route('A')]),[
    row('A',sec(60),{_city:'NewTaipei'}),row('A',sec(70),{StopUID:'S9'}),row('A',sec(80),{Direction:1}),row('A',sec(400))],NOW,NOW);
  assert.deepEqual(b.hero.eta,{kind:'min',n:6,tone:''});
});

test('去重：同名同方向只留一筆；雙站位留比較快到的', ()=>{
  const rs=[route('A',{stop:'S1',hops:5}),route('A',{stop:'S2',hops:6}),route('B')];
  const b=boardOf(pair(rs),[row('A',sec(180),{StopUID:'S2'}),row('B',sec(600))],NOW,NOW);
  assert.deepEqual(names(b),['A','B']);
  assert.equal(b.hero.sub,'坐 6 站到乙站');
  assert.deepEqual(b.hero.eta,{kind:'min',n:3,tone:''});
  const b2=boardOf(pair([route('A',{dir:0}),route('A',{dir:1,route:'RA'})]),[],NOW,NOW);
  assert.equal(names(b2).length,2);
});

test('部分排除：不出現在看板與光點，hidden 計數', ()=>{
  const b=boardOf(pair([route('L9'),route('L9直'),route('L1')],['L9','L9直']),
    [row('L9',sec(60)),row('L9直',sec(90)),row('L1',sec(500))],NOW,NOW);
  assert.equal(b.state,'ok');
  assert.deepEqual(names(b),['L1']);
  assert.deepEqual(b.buses.map(x=>x.name),['L1']);
  assert.equal(b.hidden,2);
});

test('全部排除：allExcluded、沒有光點；排除清單有不存在的路線不影響', ()=>{
  const b=boardOf(pair([route('A'),route('B')],['A','B','Z']),[row('A',sec(60))],NOW,NOW);
  assert.equal(b.state,'allExcluded');
  assert.equal(b.hero,null);
  assert.deepEqual(b.buses,[]);
  assert.equal(b.hidden,2);
});

test('沒有路線：noRoutes', ()=>{
  assert.equal(boardOf(pair([]),[],NOW,NOW).state,'noRoutes');
  assert.equal(boardOf({to:'乙站',routes:null},[],NOW,NOW).state,'noRoutes');
  assert.equal(boardOf(null,[],NOW,NOW).state,'noRoutes');
});

test('倒數：分鐘數隨時間減少，跨 3 分鐘變「將到站」、1 分鐘變「進站中」，不會變負', ()=>{
  const p=pair([route('A')]), rows=[row('A',sec(250))];
  assert.deepEqual(boardOf(p,rows,NOW,NOW).hero.eta,{kind:'min',n:4,tone:''});
  assert.deepEqual(boardOf(p,rows,NOW,NOW+20e3).hero.eta,{kind:'min',n:3,tone:''});
  assert.deepEqual(boardOf(p,rows,NOW,NOW+80e3).hero.eta,{kind:'word',text:'將到站',tone:'hot'});
  assert.deepEqual(boardOf(p,rows,NOW,NOW+200e3).hero.eta,{kind:'word',text:'進站中',tone:'hot'});
  const late=boardOf(p,rows,NOW,NOW+999e3);
  assert.equal(late.buses[0].sec,0);
  assert.equal(rows[0].EstimateTime,250,'不改動傳進來的資料');
});

test('3D 光點：秒數與是否快到', ()=>{
  const b=boardOf(pair([route('A'),route('B'),route('C')]),
    [row('A',sec(100)),row('B',sec(400)),row('C',{StopStatus:3})],NOW,NOW);
  assert.deepEqual(b.buses,[{name:'A',sec:100,hot:true},{name:'B',sec:400,hot:false},{name:'C',sec:null,hot:false}]);
});

test('下次更新：3 分鐘內 30 秒、其他 60 秒、沒有即時資料 90 秒（含排除的路線）', ()=>{
  const p=pair([route('A'),route('B')]);
  assert.equal(boardOf(p,[row('A',sec(170)),row('B',sec(600))],NOW,NOW).nextRefreshMs,30000);
  assert.equal(boardOf(p,[row('A',sec(400))],NOW,NOW).nextRefreshMs,60000);
  assert.equal(boardOf(p,[row('A',sec(400))],NOW,NOW+230e3).nextRefreshMs,30000);
  assert.equal(boardOf(p,[row('A',{StopStatus:1})],NOW,NOW).nextRefreshMs,90000);
  assert.equal(boardOf(pair([route('A'),route('B')],['A']),[row('A',sec(100)),row('B',sec(600))],NOW,NOW).nextRefreshMs,30000);
});

test('資料太舊：超過 3 分鐘才標示', ()=>{
  const p=pair([route('A')]), rows=[row('A',sec(900))];
  assert.equal(boardOf(p,rows,NOW,NOW+180e3).stale,false);
  assert.equal(boardOf(p,rows,NOW,NOW+181e3).stale,true);
});

test('示範資料能產生看板', ()=>{
  const b=demoBoard('戊站',NOW);
  assert.equal(b.state,'ok');
  assert.deepEqual(names(b),['D1','D2','D3','D4']);
  assert.deepEqual(b.hero.eta,{kind:'word',text:'將到站',tone:'hot'});
  assert.equal(b.hero.sub,'坐 6 站到戊站');
  assert.equal(demoBoard(undefined,NOW).hero.sub,'坐 6 站到下車站');
});

test('回傳純文字：站名與路線名含 < 時原樣保留', ()=>{
  const b=boardOf({to:'<b>站',routes:[route('<i>1')],exclude:[]},[row('<i>1',sec(300))],NOW,NOW);
  assert.equal(b.hero.name,'<i>1');
  assert.equal(b.hero.sub,'坐 5 站到<b>站');
});

/* ---------- 轉乘 ---------- */
test('轉乘組合拆兩段；直達組合原樣', ()=>{
  const {legOf}=require('../board.js');
  const r1=[{city:'Taipei',route:'A',name:'1',dir:0,stop:'S1',hops:3}], r2=[{city:'Taipei',route:'B',name:'2',dir:0,stop:'X1',hops:4}];
  const p={from:'甲站',via:'轉站',to:'乙站',routes:r1,routes2:r2,exclude:['x'],exclude2:['y']};
  assert.deepEqual(legOf(p,1),{from:'甲站',to:'轉站',routes:r1,exclude:['x']});
  assert.deepEqual(legOf(p,2),{from:'轉站',to:'乙站',routes:r2,exclude:['y']});
  const d={from:'甲站',to:'乙站',routes:r1,exclude:[]};
  assert.equal(legOf(d,2),d);
});

test('第二段沒車時才有警告', ()=>{
  const {secondLegNote,boardOf,legOf}=require('../board.js');
  const r2=[{city:'Taipei',route:'B',name:'2',dir:0,stop:'X1',hops:4}];
  const p={from:'甲站',via:'轉站',to:'乙站',routes:[{city:'Taipei',route:'A',name:'1',dir:0,stop:'S1',hops:3}],routes2:r2,exclude:[],exclude2:[]};
  const row=d=>Object.assign({_city:'Taipei',StopUID:'X1',RouteUID:'B',Direction:0},d);
  const T=1e12;
  assert.equal(secondLegNote(p,[row({StopStatus:0,EstimateTime:300})],T,T),null);
  assert.equal(secondLegNote(p,[row({StopStatus:1,NextBusTime:new Date(T+6e5).toISOString()})],T,T),null);
  assert.match(secondLegNote(p,[row({StopStatus:3})],T,T),/目前沒有車/);
  assert.match(secondLegNote(p,[],T,T),/第二段（轉站 → 乙站）目前沒有車/);
  assert.match(secondLegNote(Object.assign({},p,{routes2:[]}),[],T,T),/找不到路線/);
  assert.match(secondLegNote(Object.assign({},p,{exclude2:['2']}),[],T,T),/都已排除/);
  assert.equal(secondLegNote({from:'甲站',to:'乙站',routes:[]},[],T,T),null);
  /* 第一段看板的「坐幾站到」寫轉乘站 */
  const b=boardOf(legOf(p,1),[{_city:'Taipei',StopUID:'S1',RouteUID:'A',Direction:0,StopStatus:0,EstimateTime:300}],T,T);
  assert.equal(b.hero.sub,'坐 3 站到轉站');
});
