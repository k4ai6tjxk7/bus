'use strict';
/* 畫面風格的測試：node --test tests/*.test.js
   只用假的儲存和假的 document，不碰瀏覽器。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStyleSetting,createLoader,LIST,DEFAULT,KEY}=require('../styles.js');

const mem=init=>{const d=Object.assign({},init); return {d,get:k=>d[k],set:(k,v)=>{d[k]=v}}};
const LIST2=[{id:'classic',name:'原版',desc:'a'},{id:'toy',name:'玩具',desc:'b',files:['styles/kit.js?v=1','styles/toy.js?v=1'],font:'Foo'},
  {id:'toy2',name:'玩具二',desc:'c',files:['styles/kit.js?v=1','styles/toy2.js?v=1']}];

test('預設是原版，原版一定在清單裡', ()=>{
  assert.equal(DEFAULT,'classic');
  assert.ok(LIST.some(s=>s.id==='classic'&&!s.files));
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
  assert.deepEqual(s.list().slice(0,2),[{id:'classic',name:'原版',desc:'a'},{id:'toy',name:'玩具',desc:'b'}]);
});

function fakeDoc(){
  const added=[];
  return {added,createElement:t=>({tag:t,remove(){const i=added.indexOf(this); if(i>=0)added.splice(i,1)}}),head:{appendChild:e=>added.push(e)}};
}

const tick=()=>new Promise(r=>setImmediate(r));
const scripts=doc=>doc.added.filter(e=>e.tag==='script');

test('只載入選到的那一款：原版不載入；檔案依序載入、各只插入一次；字型一起載入', async ()=>{
  const doc=fakeDoc(), load=createLoader({doc,list:LIST2});
  assert.equal(await load('classic'),true);
  assert.equal(doc.added.length,0);
  const p1=load('toy'), p2=load('toy'); await tick();
  assert.deepEqual(scripts(doc).map(e=>e.src),['styles/kit.js?v=1']);       /* 共用零件先載，風格檔等它載完 */
  assert.equal(doc.added.filter(e=>e.tag==='link'&&e.href.includes('family=Foo')).length,1);
  scripts(doc)[0].onload(); await tick();
  assert.deepEqual(scripts(doc).map(e=>e.src),['styles/kit.js?v=1','styles/toy.js?v=1']);
  scripts(doc)[1].onload();
  assert.equal(await p1,true); assert.equal(await p2,true);
  const p3=load('toy2'); await tick();                                          /* 共用零件不再載一次 */
  assert.deepEqual(scripts(doc).map(e=>e.src),['styles/kit.js?v=1','styles/toy.js?v=1','styles/toy2.js?v=1']);
  scripts(doc)[2].onload(); assert.equal(await p3,true);
  assert.equal(await load('沒有這款'),false);
});

test('載入失敗回傳 false，下次可以再試，字型不重複載入', async ()=>{
  const doc=fakeDoc(), load=createLoader({doc,list:LIST2});
  const p=load('toy'); await tick(); scripts(doc)[0].onerror();
  assert.equal(await p,false);
  assert.equal(scripts(doc).length,0);
  load('toy'); await tick();
  assert.equal(scripts(doc).length,1);
  assert.equal(doc.added.filter(e=>e.tag==='link').length,1);
});

test('每款風格的檔案都在 styles/ 裡，而且帶版本號', ()=>{
  const fs=require('node:fs'), path=require('node:path');
  for(const s of LIST) for(const f of s.files||[]){
    assert.match(f,/^styles\/[a-z]+\.js\?v=\d{8}[a-z]$/,f);
    assert.ok(fs.existsSync(path.join(__dirname,'..',f.split('?')[0])),f+' 不存在');
  }
});
