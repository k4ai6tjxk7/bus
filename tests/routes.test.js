'use strict';
/* 路線比對的測試：node --test tests/*.test.js（只用假資料） */
const test=require('node:test');
const assert=require('node:assert/strict');
const {direct,transfers,dist,norm,stopCore}=require('../routes.js');

/* 站名後面可以接 @緯度,經度 指定座標 */
const st=(...n)=>n.map((x,i)=>{
  const [name,pos]=x.split('@'), s={StopUID:'U'+name+i,StopName:{Zh_tw:name}};
  if(pos){const [la,lo]=pos.split(',').map(Number); s.StopPosition={PositionLat:la,PositionLon:lo}}
  return s;
});
const rt=(uid,name,dir,stops,city)=>({_city:city||'Taipei',RouteUID:uid,RouteName:{Zh_tw:name},Direction:dir,Stops:stops});

test('直達：只留先經過上車站、再經過下車站的同方向路線，取站數最少', ()=>{
  const raw=[
    rt('R1','L1',0,st('甲站','中','乙站')),
    rt('R1','L1',1,st('乙站','中','甲站')),
    rt('R2','L2',0,st('甲 站','乙站')),
    rt('R3','壞',0,null),
    null];
  const r=direct(raw,'甲站','乙站');
  assert.deepEqual(r.map(x=>[x.name,x.dir,x.hops]),[['L1',0,2],['L2',0,1]]);
  assert.deepEqual(r[0],{city:'Taipei',route:'R1',name:'L1',dir:0,stop:'U甲站0',hops:2});
});

test('轉乘：找出第一段之後、第二段之前的同名站，依總站數排序，最多 3 個', ()=>{
  const fromRaw=[
    rt('A1','L2',0,st('甲站','a','轉一','b','轉二')),
    rt('A2','L4',0,st('甲站','轉一','c','轉三','轉四')),
    rt('A3','L3',1,st('x','甲站','轉二'))];
  const toRaw=[
    rt('B1','L5',0,st('轉一','d','e','乙站')),
    rt('B2','L6',0,st('轉二','乙站')),
    rt('B3','L7',0,st('轉三','乙站')),
    rt('B4','L8',0,st('轉四','乙站')),
    rt('B5','L11',0,st('轉三','乙站'))];
  const c=transfers(fromRaw,toRaw,'甲站','乙站');
  assert.deepEqual(c.map(x=>[x.via,x.hops,x.n1,x.n2]),[['轉二',2,2,1],['轉一',4,2,1],['轉三',4,1,2]]);
  /* 轉二：第一段 L3 坐 1 站（比L2 的 4 站少），第二段L6 1 站；轉一、轉三同為 4 站、路線數也相同，依站名 */
  assert.deepEqual(c[0].routes1.map(x=>[x.name,x.hops,x.stop]),[['L2',4,'U甲站0'],['L3',1,'U甲站1']]);
  assert.deepEqual(c[0].routes2.map(x=>[x.name,x.stop]),[['L6','U轉二0']]);
  assert.equal(c[0].hops1,1); assert.equal(c[0].hops2,1);
});

test('轉乘：同站數時兩段路線多的在前；只看指定的轉乘站', ()=>{
  const fromRaw=[rt('A1','1',0,st('甲站','轉一','轉二')),rt('A2','2',0,st('甲站','轉一','轉二'))];
  const toRaw=[rt('B1','3',0,st('轉二','轉一','乙站')),rt('B2','4',0,st('轉二','x','乙站'))];
  /* 轉一：1+1=2、路線 2+1；轉二：2+2=4 */
  assert.deepEqual(transfers(fromRaw,toRaw,'甲站','乙站').map(x=>x.via),['轉一','轉二']);
  const only=transfers(fromRaw,toRaw,'甲站','乙站',{via:'轉二'});
  assert.deepEqual(only.map(x=>[x.via,x.n2]),[['轉二',2]]);
  assert.deepEqual(transfers(fromRaw,toRaw,'甲站','乙站',{via:'不存在'}),[]);
});

test('轉乘：兩段站牌相距超過 300 公尺不算；沒有座標不擋', ()=>{
  const far=[rt('A1','1',0,st('甲站','轉一@25.0400,121.5000','轉二@25.0500,121.5000'))];
  const toRaw=[
    rt('B1','2',0,st('轉一@25.0410,121.5000','乙站')),   /* 約 111 公尺 */
    rt('B2','3',0,st('轉二@25.0600,121.5000','乙站'))];  /* 約 1.1 公里 */
  assert.deepEqual(transfers(far,toRaw,'甲站','乙站').map(x=>x.via),['轉一']);
  const noPos=[rt('A2','4',0,st('甲站','轉二'))];
  assert.deepEqual(transfers(noPos,toRaw,'甲站','乙站').map(x=>x.via),['轉二']);
  assert.ok(Math.abs(dist([25.04,121.5],[25.041,121.5])-111)<2);
});

test('轉乘：已經到得了下車站的路線不列入；上下車站本身不算轉乘站；資料壞掉略過', ()=>{
  const fromRaw=[
    rt('A1','直',0,st('甲站','乙站','轉一')),
    rt('A2','壞',0,'x'),
    {RouteUID:'A3',Stops:st('甲站','轉一')},
    rt('A4','5',0,st('轉一','甲站'))];
  const toRaw=[rt('B1','6',0,st('轉一','甲站','乙站'))];
  assert.deepEqual(transfers(fromRaw,toRaw,'甲站','乙站'),[]);
  assert.deepEqual(transfers([],toRaw,'甲站','乙站'),[]);
});

test('轉乘：第二段同一站出現兩次（環狀），取離下車站最近的那次', ()=>{
  const fromRaw=[rt('A1','1',0,st('甲站','轉一'))];
  const toRaw=[rt('B1','2',0,st('轉一','a','b','轉一','乙站'))];
  const c=transfers(fromRaw,toRaw,'甲站','乙站');
  assert.deepEqual(c[0].routes2.map(x=>[x.hops,x.stop]),[[1,'U轉一3']]);
});

test('站名規則：忽略空白、全形括號當半形；查詢關鍵字去掉括號後面那段', ()=>{
  assert.equal(norm(' 丁 站（北） '),'丁站(北)');
  assert.equal(stopCore('丁站（北）'),'丁站');
  assert.equal(stopCore('庚 站(東)'),'庚站');
  assert.equal(stopCore('辛站'),'辛站');
  assert.equal(norm(''),''); assert.equal(norm(null),''); assert.equal(stopCore(undefined),'');
});
