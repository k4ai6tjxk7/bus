'use strict';
/* 發佈內容的守門測試：node --test tests/*.test.js
   原則：GitHub Pages 只發佈 App 執行需要的檔案（index.html 和它載入的本機 js）；
   測試、工具、文件留在 repo、不發佈。
   App 需要哪些檔案由 index.html 決定，不另外維護清單；
   根目錄其他的檔案或資料夾都必須列在 _config.yml 的 exclude 裡。
   Jekyll 本來就不發佈 . 或 _ 開頭的檔案，不用列。 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

/* index.html 載入的本機檔案（不含外部網址），去掉 ?v= 版本號 */
function appFiles(){
  const html=read('index.html'), out=new Set(['index.html']);
  for(const m of html.matchAll(/\b(?:src|href)="([^"#]+)"/g)){
    const u=m[1];
    if(/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u)) continue; /* https:、data: 等外部或內嵌資源 */
    out.add(u.split('?')[0].replace(/^\.\//,''));
  }
  return out;
}
/* _config.yml 的 exclude 清單（只認這個檔案用的簡單寫法：exclude: 底下一行一項「- 名稱」） */
function excluded(){
  const lines=read('_config.yml').split('\n'), out=new Set();
  let inList=false;
  for(const raw of lines){
    const line=raw.replace(/#.*$/,'').trimEnd();
    if(/^exclude:\s*$/.test(line)){inList=true; continue}
    if(inList){
      const m=line.match(/^\s+-\s+(.+?)\s*$/);
      if(m){out.add(m[1].replace(/^["']|["']$/g,'').replace(/\/$/,'')); continue}
      if(line.trim()) inList=false;
    }
  }
  return out;
}

test('App 載入的本機檔案都存在，而且沒有被排除', ()=>{
  const app=appFiles(), ex=excluded();
  assert.ok(app.size>=2,'index.html 至少載入一支 js');
  for(const f of app){
    assert.ok(fs.existsSync(path.join(ROOT,f)),`index.html 載入的 ${f} 不存在`);
    assert.ok(!ex.has(f)&&!ex.has(f.split('/')[0]),`${f} 是 App 需要的檔案，不可以排除`);
  }
});

test('根目錄不是 App 需要的檔案或資料夾，都不發佈', ()=>{
  const app=appFiles(), ex=excluded();
  const leak=fs.readdirSync(ROOT)
    .filter(n=>!n.startsWith('.')&&!n.startsWith('_'))
    .filter(n=>!app.has(n)&&!ex.has(n));
  assert.deepEqual(leak,[],'這些會被發佈到網站上，請加進 _config.yml 的 exclude：'+leak.join('、'));
});

test('測試、工具、文件一律不發佈', ()=>{
  const ex=excluded();
  for(const n of ['tests','tools','docs']) assert.ok(ex.has(n),`${n} 要列在 _config.yml 的 exclude`);
});
