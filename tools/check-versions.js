#!/usr/bin/env node
'use strict';
/* 版本號檢查（CODING_STANDARDS S6）：push 前執行。
   比較兩個版本，找出「內容改了、版本號沒改」的 js。改了卻沒換版本號，手機會繼續用快取的舊檔。

   用法：node tools/check-versions.js [舊版本] [新版本]
     舊版本預設 origin/main，新版本預設 HEAD（要先 commit 才檢查得到）。
     例：node tools/check-versions.js 020c331^ 020c331

   檢查兩種引用：
     index.html 的 <script src="x.js?v=…">：x.js 內容改了，?v= 也要改
     styles.js 裡的 'styles/x.js?v=…'：風格檔內容改了，清單裡的版本號也要改
   index.html 載入但沒帶 ?v= 的檔案（three.min.js）改了也算錯：要先加上版本號。
   新增的檔案不檢查。沒有問題時結束碼 0，有問題時列出來、結束碼 1。 */
const {execFileSync}=require('child_process');

const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
function show(ref,path){try{return git('show',`${ref}:${path}`)}catch(e){return null}}

/* 從文字裡找出 {檔案: 版本號}；沒帶版本號的是 null */
function refsOf(text,re){
  const out={};
  for(const m of (text||'').matchAll(re)) out[m[1]]=m[2]||null;
  return out;
}
const SCRIPT=/<script\s+src="([^"?]+\.js)(?:\?v=([^"]+))?"/g;
const STYLE=/'(styles\/[^'?]+\.js)\?v=([^']+)'/g;

function check(base,head){
  const problems=[];
  const sources=[['index.html',SCRIPT],['styles.js',STYLE]];
  for(const [file,re] of sources){
    const now=refsOf(show(head,file),re), before=refsOf(show(base,file),re);
    for(const [path,v] of Object.entries(now)){
      const a=show(base,path), b=show(head,path);
      if(a===null||b===null||a===b) continue;   /* 新增、刪除或沒改 */
      if(v===null) problems.push(`${path} 改了，但 ${file} 引用它時沒有版本號`);
      else if(before[path]===v) problems.push(`${path} 改了，但 ${file} 裡的版本號還是 ${v}`);
    }
  }
  return problems;
}

if(require.main===module){
  const [base='origin/main',head='HEAD']=process.argv.slice(2);
  let problems;
  try{problems=check(base,head)}
  catch(e){console.error('無法比較 '+base+' 和 '+head+'：'+String(e.stderr||e.message).trim()); process.exit(2)}
  if(!problems.length){console.log(`版本號沒問題（${base} → ${head}）`); process.exit(0)}
  console.log(`版本號要更新（${base} → ${head}）：`);
  for(const p of problems) console.log('  - '+p);
  process.exit(1);
}
module.exports={check,refsOf};
