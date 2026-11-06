'use strict';
/* 找路線的測試：node --test tests/*.test.js（只用假資料，假的 routesThrough 記下每次查詢） */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFinder,stopCore}=require('../routes.js');

/* 站名後面可以接 @緯度,經度 指定座標 */
const st=(...n)=>n.map((x,i)=>{
  const [name,pos]=x.split('@'), s={StopUID:'U'+name+i,StopName:{Zh_tw:name}};
  if(pos){const [la,lo]=pos.split(',').map(Number); s.StopPosition={PositionLat:la,PositionLon:lo}}
  return s;
});
const rt=(uid,name,dir,stops,city)=>({_city:city||'Taipei',RouteUID:uid,RouteName:{Zh_tw:name},Direction:dir,Stops:stops});

/* data：{關鍵字: 原始資料}，或 (關鍵字, 第幾次查詢) => 原始資料 */
function setup(data){
  const calls=[];
  const finder=createFinder({routesThrough:async(k,o)=>{
    calls.push({k,region:o.region,auto:!!o.auto});
    return typeof data==='function'?data(k,calls.length):(data[k]||[]);
  }});
  return {finder,calls,keys:()=>calls.map(c=>c.k)};
}
const pair=(from,to,extra)=>Object.assign({id:'p1',name:'x',from,to,region:'north',via:null},extra);

/* ---------- 每個操作查幾次、查哪一站 ---------- */

test('查詢次數與順序：重找直達 1 次、重找轉乘 2 次、換轉乘站 2 次；都帶組合的生活圈', async()=>{
  let s=setup({});
  await s.finder.resolve(pair('甲站','乙站',{region:'taichung'}),{auto:true});
  assert.deepEqual(s.calls,[{k:'甲站',region:'taichung',auto:true}]);

  s=setup({});
  await s.finder.resolve(pair('甲站','乙站',{via:'轉一'}));
  assert.deepEqual(s.keys(),['甲站','乙站']);

  s=setup({});
  await s.finder.transferOptions(pair('甲站','乙站',{region:'kaohsiung'}));
  assert.deepEqual(s.calls.map(c=>[c.k,c.region]),[['甲站','kaohsiung'],['乙站','kaohsiung']]);
});

test('新增組合：有直達只查上車站；沒有直達才查下車站', async()=>{
  let s=setup({'甲站':[rt('R1','L1',0,st('甲站','乙站'))]});
  const a=await s.finder.forNewPair('taichung','甲站','乙站');
  assert.deepEqual(s.calls.map(c=>[c.k,c.region]),[['甲站','taichung']]);
  assert.deepEqual(a.direct.map(x=>x.name),['L1']); assert.deepEqual(a.cands,[]);

  s=setup({});
  const b=await s.finder.forNewPair('north','甲站','乙站');
  assert.deepEqual(s.keys(),['甲站','乙站']);
  assert.deepEqual(b,{direct:[],cands:[]});
});

test('送給 TDX 的關鍵字去掉括號後面那段', async()=>{
  const s=setup({});
  await s.finder.transferOptions(pair('丁站（北）','庚 站(東)'));
  assert.deepEqual(s.keys(),['丁站','庚站']);
});

test('null 約定：任一次查詢回傳 null 就不再查下一站，整個操作回傳 null', async()=>{
  const first=()=>setup(()=>null);
  const second=()=>setup((k,n)=>n===2?null:[]);
  const tr=pair('甲站','乙站',{via:'轉一'});
  for(const [mk,n] of [[first,1],[second,2]]){
    let s=mk(); assert.equal(await s.finder.resolve(tr),null); assert.equal(s.calls.length,n);
    s=mk(); assert.equal(await s.finder.forNewPair('north','甲站','乙站'),null); assert.equal(s.calls.length,n);
    s=mk(); assert.equal(await s.finder.transferOptions(tr),null); assert.equal(s.calls.length,n);
  }
  assert.equal(await first().finder.resolve(pair('甲站','乙站')),null);
});

test('查詢錯誤原樣往外丟', async()=>{
  const err=new Error('連不上');
  const finder=createFinder({routesThrough:async()=>{throw err}});
  await assert.rejects(finder.resolve(pair('甲站','乙站')),e=>e===err);
  await assert.rejects(finder.forNewPair('north','甲站','乙站'),e=>e===err);
  await assert.rejects(finder.transferOptions(pair('甲站','乙站')),e=>e===err);
});

/* ---------- 直達 ---------- */

test('直達：只留先經過上車站、再經過下車站的同方向路線，取站數最少', async()=>{
  const {finder}=setup({'甲站':[
    rt('R1','L1',0,st('甲站','中','乙站')),
    rt('R1','L1',1,st('乙站','中','甲站')),
    rt('R2','L2',0,st('甲 站','乙站')),
    rt('R3','壞',0,null),
    null]});
  const r=(await finder.forNewPair('north','甲站','乙站')).direct;
  assert.deepEqual(r.map(x=>[x.name,x.dir,x.hops]),[['L1',0,2],['L2',0,1]]);
  assert.deepEqual(r[0],{city:'Taipei',route:'R1',name:'L1',dir:0,stop:'U甲站0',hops:2});
});

test('直達：站名忽略空白，全形括號當半形', async()=>{
  const {finder}=setup({'丁站':[rt('R1','L1',0,st('丁站(北)','中','戊 站'))]});
  const r=await finder.resolve(pair('丁站（北）','戊站'));
  assert.deepEqual(r.routes.map(x=>[x.name,x.hops]),[['L1',2]]);
});

/* ---------- 轉乘 ---------- */

test('轉乘：找出第一段之後、第二段之前的同名站，依總站數排序，最多 3 個', async()=>{
  const {finder}=setup({
    '甲站':[
      rt('A1','L2',0,st('甲站','a','轉一','b','轉二')),
      rt('A2','L4',0,st('甲站','轉一','c','轉三','轉四')),
      rt('A3','L3',1,st('x','甲站','轉二'))],
    '乙站':[
      rt('B1','L5',0,st('轉一','d','e','乙站')),
      rt('B2','L6',0,st('轉二','乙站')),
      rt('B3','L7',0,st('轉三','乙站')),
      rt('B4','L8',0,st('轉四','乙站')),
      rt('B5','L11',0,st('轉三','乙站'))]});
  const c=(await finder.forNewPair('north','甲站','乙站')).cands;
  assert.deepEqual(c.map(x=>[x.via,x.hops,x.n1,x.n2]),[['轉二',2,2,1],['轉一',4,2,1],['轉三',4,1,2]]);
  /* 轉二：第一段 L3 坐 1 站（比L2 的 4 站少），第二段L6 1 站；轉一、轉三同為 4 站、路線數也相同，依站名 */
  assert.deepEqual(c[0].routes1.map(x=>[x.name,x.hops,x.stop]),[['L2',4,'U甲站0'],['L3',1,'U甲站1']]);
  assert.deepEqual(c[0].routes2.map(x=>[x.name,x.stop]),[['L6','U轉二0']]);
  assert.equal(c[0].hops1,1); assert.equal(c[0].hops2,1);
});

test('轉乘：同站數時兩段路線多的在前；重找只看組合已選的轉乘站', async()=>{
  const {finder}=setup({
    '甲站':[rt('A1','1',0,st('甲站','轉一','轉二')),rt('A2','2',0,st('甲站','轉一','轉二'))],
    '乙站':[rt('B1','3',0,st('轉二','轉一','乙站')),rt('B2','4',0,st('轉二','x','乙站'))]});
  /* 轉一：1+1=2、路線 2+1；轉二：2+2=4 */
  assert.deepEqual((await finder.transferOptions(pair('甲站','乙站'))).map(x=>x.via),['轉一','轉二']);
  const r=await finder.resolve(pair('甲站','乙站',{via:'轉二'}));
  assert.deepEqual([r.routes.map(x=>x.name),r.routes2.map(x=>x.name),r.direct],[['1','2'],['3','4'],[]]);
  assert.deepEqual(await finder.resolve(pair('甲站','乙站',{via:'不存在'})),{routes:[],routes2:[],direct:[]});
});

test('轉乘：重找時順便帶回發現的直達路線', async()=>{
  const {finder}=setup({
    '甲站':[rt('A1','直',0,st('甲站','乙站')),rt('A2','1',0,st('甲站','轉一'))],
    '乙站':[rt('A1','直',0,st('甲站','乙站')),rt('B1','2',0,st('轉一','乙站'))]});
  const r=await finder.resolve(pair('甲站','乙站',{via:'轉一'}));
  assert.deepEqual([r.routes.map(x=>x.name),r.routes2.map(x=>x.name),r.direct.map(x=>x.name)],[['1'],['2'],['直']]);
});

test('轉乘：兩段站牌相距超過 300 公尺不算；沒有座標不擋', async()=>{
  const toRaw=[
    rt('B1','2',0,st('轉一@25.0400,121.5000','乙站')),   /* 約 111 公尺 */
    rt('B2','3',0,st('轉二@25.0600,121.5000','乙站'))];  /* 約 1.1 公里 */
  let {finder}=setup({'甲站':[rt('A1','1',0,st('甲站','轉一@25.0410,121.5000','轉二@25.0500,121.5000'))],'乙站':toRaw});
  assert.deepEqual((await finder.transferOptions(pair('甲站','乙站'))).map(x=>x.via),['轉一']);
  ({finder}=setup({'甲站':[rt('A2','4',0,st('甲站','轉二'))],'乙站':toRaw}));
  assert.deepEqual((await finder.transferOptions(pair('甲站','乙站'))).map(x=>x.via),['轉二']);
});

test('轉乘：已經到得了下車站的路線不列入；上下車站本身不算轉乘站；資料壞掉略過', async()=>{
  const toRaw=[rt('B1','6',0,st('轉一','甲站','乙站'))];
  let {finder}=setup({'甲站':[
    rt('A1','直',0,st('甲站','乙站','轉一')),
    rt('A2','壞',0,'x'),
    {RouteUID:'A3',Stops:st('甲站','轉一')},
    rt('A4','5',0,st('轉一','甲站'))],'乙站':toRaw});
  assert.deepEqual(await finder.transferOptions(pair('甲站','乙站')),[]);
  ({finder}=setup({'乙站':toRaw}));
  assert.deepEqual(await finder.transferOptions(pair('甲站','乙站')),[]);
});

test('轉乘：第二段同一站出現兩次（環狀），取離下車站最近的那次', async()=>{
  const {finder}=setup({'甲站':[rt('A1','1',0,st('甲站','轉一'))],'乙站':[rt('B1','2',0,st('轉一','a','b','轉一','乙站'))]});
  const c=await finder.transferOptions(pair('甲站','乙站'));
  assert.deepEqual(c[0].routes2.map(x=>[x.hops,x.stop]),[[1,'U轉一3']]);
});

/* ---------- 站名規則 ---------- */

test('站名規則：忽略空白、全形括號當半形；查詢關鍵字去掉括號後面那段', ()=>{
  assert.equal(stopCore(' 丁 站（北） '),'丁站');
  assert.equal(stopCore('庚 站(東)'),'庚站');
  assert.equal(stopCore('辛站'),'辛站');
  assert.equal(stopCore(''),''); assert.equal(stopCore(null),''); assert.equal(stopCore(undefined),'');
});
