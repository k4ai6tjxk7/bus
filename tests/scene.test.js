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
