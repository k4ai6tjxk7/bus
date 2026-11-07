'use strict';
/* 畫面風格的測試：node --test tests/*.test.js
   只用假的儲存和假的 document，不碰瀏覽器。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createStyleSetting,createLoader,createSwitcher,LIST,DEFAULT,KEY}=require('../styles.js');

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

/* ---------- 換風格（createSwitcher）----------
   假 loader：每次 load 都留著，由測試決定何時、成功或失敗 resolve。假畫法記下建立、班次、收掉。 */
function rig(){
  const loads=[], scenes=[], root={dataset:{}};
  let t=1762394400000;          /* 不從 0 開始，記錯時間才測得出來 */
  const load=id=>new Promise(res=>loads.push({id,res}));
  const createScene=o=>{const s={style:o.style,opts:o,buses:[],disposed:false,setBuses(l){s.buses.push(l)},dispose(){s.disposed=true}}; scenes.push(s); return s};
  const look=createSwitcher({load,createScene,sceneOpts:{host:'H',reduce:true},root,now:()=>t});
  return {look,loads,scenes,root,clock:ms=>{t+=ms},live:()=>scenes.filter(s=>!s.disposed)};
}

test('建立時先畫原版；交給 createScene 的參數原樣轉交', ()=>{
  const r=rig();
  assert.deepEqual(r.scenes.map(s=>s.style),['classic']);
  assert.deepEqual(r.scenes[0].opts,{host:'H',reduce:true,style:'classic'});
  assert.equal(r.root.dataset.style,undefined);
});

test('載入完成才換場景與 data-style；只留一個場景', async ()=>{
  const r=rig();
  const p=r.look.show('toy');
  await tick();
  assert.equal(r.scenes.length,1,'還沒載完不換');
  r.loads[0].res(true);
  assert.equal(await p,'toy');
  assert.deepEqual(r.scenes.map(s=>s.style),['classic','toy']);
  assert.deepEqual(r.live().map(s=>s.style),['toy']);
  assert.equal(r.root.dataset.style,'toy');
  assert.equal(r.scenes[1].opts.host,'H');
});

test('載入中又換了別款：只畫最後選的那款，先載完的不換', async ()=>{
  const r=rig();
  const a=r.look.show('toy'), b=r.look.show('toy2');
  r.loads[0].res(true);
  assert.equal(await a,'classic');
  assert.equal(r.scenes.length,1);
  r.loads[1].res(true);
  assert.equal(await b,'toy2');
  assert.deepEqual(r.scenes.map(s=>s.style),['classic','toy2']);
  /* 換回去：後選的先載完、先選的後載完也一樣 */
  const c=r.look.show('toy'), d=r.look.show('classic');
  r.loads[3].res(true); assert.equal(await d,'classic');
  r.loads[2].res(true); assert.equal(await c,'classic');
  assert.deepEqual(r.live().map(s=>s.style),['classic']);
  assert.equal(r.root.dataset.style,undefined);
});

test('載入失敗就維持原版；之後選別款照常換', async ()=>{
  const r=rig();
  const p=r.look.show('toy'); r.loads[0].res(false);
  assert.equal(await p,'classic');
  assert.equal(r.scenes.length,1,'已經是原版，不重建場景');
  assert.equal(r.root.dataset.style,undefined);
  const q=r.look.show('toy2'); r.loads[1].res(true); await q;
  const z=r.look.show('toy'); r.loads[2].res(false);
  assert.equal(await z,'classic','已是別款時失敗也退回原版');
  assert.deepEqual(r.live().map(s=>s.style),['classic']);
  assert.equal(r.root.dataset.style,undefined);
});

test('選同一款不重建場景', async ()=>{
  const r=rig();
  const p=r.look.show('toy'); r.loads[0].res(true); await p;
  const q=r.look.show('toy'); r.loads[1].res(true); assert.equal(await q,'toy');
  assert.equal(r.scenes.length,2);
});

test('班次交給目前場景；換風格時扣掉經過的秒數，不扣成負數，沒有秒數的不動', async ()=>{
  const r=rig();
  const list=[{name:'L1',sec:100,hot:false},{name:'L2',sec:null},{name:'L3',sec:5,hot:true}];
  r.look.setBuses(list);
  assert.deepEqual(r.scenes[0].buses,[list]);
  r.clock(30000);
  const p=r.look.show('toy'); r.loads[0].res(true); await p;
  assert.deepEqual(r.scenes[1].buses,[[{name:'L1',sec:70,hot:false},{name:'L2',sec:null},{name:'L3',sec:0,hot:true}]]);
  assert.equal(list[0].sec,100,'不改原本的資料');
  r.look.setBuses([{name:'L9',sec:9}]);
  assert.deepEqual(r.scenes[1].buses.at(-1),[{name:'L9',sec:9}]);
  assert.equal(r.scenes[0].buses.length,1,'收掉的場景不再收到班次');
});

test('還沒有班次就換風格：新場景不收到班次', async ()=>{
  const r=rig();
  const p=r.look.show('toy'); r.loads[0].res(true); await p;
  assert.deepEqual(r.scenes[1].buses,[]);
});
