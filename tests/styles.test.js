'use strict';
/* 畫面風格的測試：node --test tests/*.test.js
   只用假的儲存和假的 document，不碰瀏覽器。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStyleSetting,createLoader,LIST,DEFAULT,KEY}=require('../styles.js');

const mem=init=>{const d=Object.assign({},init); return {d,get:k=>d[k],set:(k,v)=>{d[k]=v}}};
const LIST2=[{id:'classic',name:'原版',desc:'a'},{id:'toy',name:'玩具',desc:'b',file:'styles/toy.js?v=1',font:'Foo'}];

test('預設是原版，原版一定在清單裡', ()=>{
  assert.equal(DEFAULT,'classic');
  assert.ok(LIST.some(s=>s.id==='classic'&&!s.file));
  assert.equal(createStyleSetting({storage:mem()}).current(),'classic');
});

test('讀到壞值或不認得的風格就退回原版', ()=>{
  for(const bad of [42,null,{},['toy'],'','沒有這款','__proto__']){
    assert.equal(createStyleSetting({storage:mem({[KEY]:bad}),list:LIST2}).current(),'classic',String(bad));
  }
  assert.equal(createStyleSetting({storage:mem({[KEY]:'toy'}),list:LIST2}).current(),'toy');
});

test('只能換成清單裡的風格；清單只給名稱和說明', ()=>{
  const st=mem(), s=createStyleSetting({storage:st,list:LIST2});
  assert.equal(s.set('沒有這款'),false); assert.equal(st.d[KEY],undefined);
  assert.equal(s.set('toy'),true); assert.equal(s.current(),'toy');
  assert.deepEqual(s.list(),[{id:'classic',name:'原版',desc:'a'},{id:'toy',name:'玩具',desc:'b'}]);
});

function fakeDoc(){
  const added=[];
  return {added,createElement:t=>({tag:t,remove(){const i=added.indexOf(this); if(i>=0)added.splice(i,1)}}),head:{appendChild:e=>added.push(e)}};
}

test('只載入選到的那一款：原版不載入；同一款只插入一次；字型一起載入', async ()=>{
  const doc=fakeDoc(), load=createLoader({doc,list:LIST2});
  assert.equal(await load('classic'),true);
  assert.equal(doc.added.length,0);
  const p1=load('toy'), p2=load('toy');
  const scripts=doc.added.filter(e=>e.tag==='script');
  assert.equal(scripts.length,1); assert.equal(scripts[0].src,'styles/toy.js?v=1');
  assert.ok(doc.added.some(e=>e.tag==='link'&&e.href.includes('family=Foo')));
  scripts[0].onload();
  assert.equal(await p1,true); assert.equal(await p2,true);
  assert.equal(await load('沒有這款'),false);
});

test('載入失敗回傳 false，下次可以再試，字型不重複載入', async ()=>{
  const doc=fakeDoc(), load=createLoader({doc,list:LIST2});
  const p=load('toy'); doc.added.find(e=>e.tag==='script').onerror();
  assert.equal(await p,false);
  assert.equal(doc.added.filter(e=>e.tag==='script').length,0);
  load('toy');
  assert.equal(doc.added.filter(e=>e.tag==='script').length,1);
  assert.equal(doc.added.filter(e=>e.tag==='link').length,1);
});
