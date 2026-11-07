'use strict';
/* 深淺色的測試：node --test tests/*.test.js
   假的儲存、假的系統設定（mq）、假的 <html> 與 <meta>，不碰瀏覽器。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTheme,KEY,DEFAULT}=require('../theme.js');

const mem=init=>{const d=Object.assign({},init); return {d,get:k=>d[k],set:(k,v)=>{d[k]=v}}};
/* 假的 matchMedia：flip(dark) 模擬系統切換 */
const sys=dark=>{const fns=[]; return {matches:dark,addEventListener:(t,f)=>fns.push(f),flip(v){this.matches=v; fns.forEach(f=>f({matches:v}))}}};
const el=()=>{const a={}; return {a,setAttribute:(k,v)=>{a[k]=v}}};
const make=(stored,dark=false)=>{
  const storage=mem(stored===undefined?{}:{[KEY]:stored}), mq=sys(dark), root=el(), meta=el();
  const t=createTheme({storage,mq,root,meta}), seen=[];
  t.onChange(d=>seen.push(d));
  return {t,storage,mq,root,meta,seen};
};

test('預設是自動：跟著系統；建立時就寫好 data-theme 與手機狀態列顏色', ()=>{
  assert.equal(DEFAULT,'auto');
  const a=make(undefined,false);
  assert.equal(a.t.current(),'auto'); assert.equal(a.t.isDark(),false);
  assert.equal(a.root.a['data-theme'],'light'); assert.equal(a.meta.a.content,'#e9eef0');
  const b=make(undefined,true);
  assert.equal(b.t.isDark(),true);
  assert.equal(b.root.a['data-theme'],'dark'); assert.equal(b.meta.a.content,'#0c1114');
});

test('讀到壞值就當成自動', ()=>{
  for(const bad of [42,null,{},['dark'],'','Dark','night','__proto__']){
    const x=make(bad,true);
    assert.equal(x.t.current(),'auto',String(bad)); assert.equal(x.root.a['data-theme'],'dark',String(bad));
  }
});

test('儲存讀不到（丟錯）也當成自動', ()=>{
  const root=el();
  const t=createTheme({storage:{get(){throw new Error('x')},set(){}},mq:sys(true),root});
  assert.equal(t.current(),'auto'); assert.equal(root.a['data-theme'],'dark');
});

test('手動設定蓋過系統', ()=>{
  const a=make('light',true);
  assert.equal(a.t.isDark(),false); assert.equal(a.root.a['data-theme'],'light');
  assert.equal(a.t.systemDark(),true,'設定頁「自動」後面標的是系統的結果');
  const b=make('dark',false);
  assert.equal(b.t.systemDark(),false);
  assert.equal(b.t.isDark(),true); assert.equal(b.root.a['data-theme'],'dark'); assert.equal(b.meta.a.content,'#0c1114');
});

test('set 只收 auto／light／dark；不認得的不寫入、畫面不變', ()=>{
  const x=make(undefined,false);
  for(const bad of ['night',1,null,undefined,'']) assert.equal(x.t.set(bad),false);
  assert.equal(x.storage.d[KEY],undefined); assert.equal(x.root.a['data-theme'],'light'); assert.deepEqual(x.seen,[]);
  assert.equal(x.t.set('dark'),true);
  assert.equal(x.storage.d[KEY],'dark'); assert.equal(x.t.current(),'dark');
  assert.equal(x.root.a['data-theme'],'dark'); assert.equal(x.meta.a.content,'#0c1114');
});

test('手動切換時通知；結果沒變（系統已是深色時從自動換成深色）不通知', ()=>{
  const x=make(undefined,true);
  x.t.set('dark'); assert.deepEqual(x.seen,[]);
  x.t.set('light'); assert.deepEqual(x.seen,[false]);
  x.t.set('auto'); assert.deepEqual(x.seen,[false,true]);
});

test('自動時系統切換會跟著變並通知；手動時系統切換不變、不通知', ()=>{
  const x=make(undefined,false);
  x.mq.flip(true);
  assert.equal(x.root.a['data-theme'],'dark'); assert.deepEqual(x.seen,[true]);
  x.t.set('light'); assert.deepEqual(x.seen,[true,false]);
  x.mq.flip(false); x.mq.flip(true);
  assert.equal(x.root.a['data-theme'],'light'); assert.deepEqual(x.seen,[true,false]);
  x.t.set('auto');
  assert.equal(x.root.a['data-theme'],'dark'); assert.deepEqual(x.seen,[true,false,true]);
});

test('通知時 data-theme 已經換好（場景重新上色讀得到新顏色）；取消後不再通知', ()=>{
  const storage=mem(), root=el(), t=createTheme({storage,mq:sys(false),root}), got=[];
  const off=t.onChange(()=>got.push(root.a['data-theme']));
  t.set('dark'); assert.deepEqual(got,['dark']);
  off(); t.set('light'); assert.deepEqual(got,['dark']);
});

test('沒有系統設定（舊瀏覽器）就當淺色；沒有 meta 也不出錯', ()=>{
  const root=el(), t=createTheme({storage:mem(),mq:null,root});
  assert.equal(t.isDark(),false); assert.equal(root.a['data-theme'],'light');
  t.set('dark'); assert.equal(root.a['data-theme'],'dark');
});
