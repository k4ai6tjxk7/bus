'use strict';
/* 3D 場景的測試：node --test tests/*.test.js
   只測不靠畫面的規則；畫得好不好看靠截圖確認。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createScene,tOf,T_MAX}=require('../scene.js');

test('到站時間對應到路上的位置：0 秒在站牌，越久越遠，20 分鐘以外都排在最遠端', ()=>{
  assert.equal(tOf(0),1);
  assert.ok(tOf(60)>tOf(300));
  assert.ok(tOf(300)>tOf(900));
  assert.equal(T_MAX,1200);
  assert.equal(tOf(T_MAX),tOf(T_MAX*3));
  assert.ok(Math.abs(tOf(T_MAX)-0.03)<1e-9);
});

test('沒有 three.js 時隱藏場景，setBuses 不做事也不出錯', ()=>{
  const host={hidden:false};
  const s=createScene({host,tagsEl:{},THREE:undefined,reduce:false});
  assert.equal(host.hidden,true);
  assert.doesNotThrow(()=>s.setBuses([{name:'D1',sec:60,hot:true}]));
});

test('畫面風格：用登記過的畫法；沒登記過的風格畫原版；畫法出錯時隱藏場景', ()=>{
  const {register}=require('../scene.js');
  const calls=[];
  register('classic',o=>{calls.push('classic:'+o.style); return {setBuses(){},dispose(){}}});
  register('x',o=>{calls.push('x'); return {setBuses(){},dispose(){}}});
  register('broken',()=>{throw new Error('壞了')});
  const host={hidden:false}, base={host,tagsEl:{},THREE:{},reduce:false};
  createScene(Object.assign({style:'x'},base));
  createScene(Object.assign({style:'沒有這款'},base));
  assert.deepEqual(calls,['x','classic:沒有這款']);
  const s=createScene(Object.assign({style:'broken'},base));
  assert.equal(host.hidden,true);
  assert.doesNotThrow(()=>{s.setBuses([]); s.dispose()});
});

test('畫法出錯隱藏場景後，換成正常的風格，場景要再出現', ()=>{
  const {register}=require('../scene.js');
  register('classic',()=>({setBuses(){},dispose(){}}));
  register('broken',()=>{throw new Error('壞了')});
  const host={hidden:false}, base={host,tagsEl:{},THREE:{},reduce:false};
  createScene(Object.assign({style:'broken'},base));
  assert.equal(host.hidden,true);
  createScene(Object.assign({style:'classic'},base));
  assert.equal(host.hidden,false);
  createScene(Object.assign({style:'broken'},base));
  assert.equal(host.hidden,true);
});

test('深淺色換了：叫目前畫法的 recolor；收掉後不再叫；沒給 theme 就是淺色', ()=>{
  const {register}=require('../scene.js');
  const fns=[], theme={isDark:()=>dark,onChange(f){fns.push(f); return ()=>fns.splice(fns.indexOf(f),1)}};
  let dark=false;
  const calls=[], seen=[];
  register('tt',o=>{seen.push(o.theme.isDark()); return {setBuses(){},dispose(){calls.push('dispose')},recolor(){calls.push('recolor')}}});
  register('plain',()=>({setBuses(){},dispose(){}}));
  const base={host:{hidden:false},tagsEl:{},THREE:{},reduce:false};
  const s=createScene(Object.assign({style:'tt',theme},base));
  dark=true; fns.forEach(f=>f(true));
  assert.deepEqual(calls,['recolor']);
  s.dispose(); assert.equal(fns.length,0,'收掉場景要取消監聽');
  fns.forEach(f=>f(false)); assert.deepEqual(calls,['recolor','dispose']);
  createScene(Object.assign({style:'tt'},base)); assert.deepEqual(seen,[false,false],'沒給 theme 時畫法看到淺色');
  const p=createScene(Object.assign({style:'plain',theme},base));
  assert.doesNotThrow(()=>fns.forEach(f=>f(true)),'沒有 recolor 的畫法也不出錯'); p.dispose();
});

test('小人的動作：將到站一直揮手；有車每 5 秒揮 1.5 秒；沒車不揮手、偶爾望向路', ()=>{
  const {wave}=require('../scene.js');
  const up=a=>a>2;
  for(let t=0;t<20;t+=.25){
    assert.ok(up(wave(t,'arrive').arm),'將到站 '+t);
    assert.equal(up(wave(t,'normal').arm),(t%5)<1.5,'有車 '+t);
    assert.ok(!up(wave(t,'none').arm),'沒車 '+t);
  }
  assert.equal(wave(1,'none').look<0,true);
  assert.equal(wave(4,'none').look,0);
  assert.equal(wave(1,'normal').look,0);
});
