'use strict';
/* 站名檔 module：從本機站名檔搜尋站名（GLOSSARY「站名檔」）。
   Stops.createStopIndex({load, tdx}).search(關鍵字, {region, onWait, live}) 回傳 {names, more, source}。
   load(生活圈 id) 回傳解析後的站名檔（App 用 fetch 加 ?v=VERSION）；tdx 只用 searchStops。
   改用 TDX（備案）時，同一生活圈＋同一關鍵字在這個 index 的生命期內只查一次；live 每次都真的查，成功才更新快取。
   站名檔是不可信資料：整檔不合格就作廢（改用 TDX），單筆不合格就略過。 */
(function(root){
  const VERSION='20261108n';
  const MAX_STOPS=30000, MAX_NAME=40, MAX_SHOWN=100;
  /* 控制字元與看不見的格式字元（Unicode Cc、Cf：零寬字元、方向控制字元、軟連字號、BOM……） */
  const BAD_CHARS=/[\p{Cc}\p{Cf}]/u;

  /* 回傳站名陣列（已略過不合格的單筆）；整檔不合格回傳 null */
  function usableNames(f,region){
    if(!f||typeof f!=='object'||f.region!==region) return null;
    if(!Array.isArray(f.names)||f.names.length>MAX_STOPS) return null;
    return f.names.filter(n=>typeof n==='string'&&n!==''&&n.length<=MAX_NAME&&!BAD_CHARS.test(n));
  }

  /* 最多列 100 筆，其餘算進 more */
  function capped(list,source){
    return {names:list.slice(0,MAX_SHOWN),more:Math.max(0,list.length-MAX_SHOWN),source};
  }

  function createStopIndex({load,tdx}){
    /* 生活圈 → Promise<站名陣列 | null>；失敗或作廢的不留在這裡，下次搜尋再試 */
    const loaded=new Map();
    function namesOf(region){
      if(!loaded.has(region)){
        const p=Promise.resolve().then(()=>load(region)).then(f=>usableNames(f,region)).catch(()=>null);
        loaded.set(region,p);
        p.then(names=>{ if(names===null&&loaded.get(region)===p) loaded.delete(region); });
      }
      return loaded.get(region);
    }
    /* 備案（改用 TDX）的結果快取：生活圈|關鍵字 → Promise<站名陣列>；只存成功的結果 */
    const tdxCache=new Map();
    const tdxKey=(q,region)=>region+'|'+q;
    const fromTdx=(q,region,onWait)=>tdx.searchStops(q,{region,onWait});
    /* 即時搜尋：每次都真的查，成功才蓋掉快取；失敗保留原本的快取 */
    function searchTdxLive(q,region,onWait){
      return fromTdx(q,region,onWait).then(list=>{
        tdxCache.set(tdxKey(q,region),Promise.resolve(list));
        return capped(list,'tdx');
      });
    }
    /* 備案搜尋：同一個生活圈＋關鍵字只查一次；失敗的查詢不留在快取 */
    function searchTdxCached(q,region,onWait){
      const ck=tdxKey(q,region);
      if(!tdxCache.has(ck)){
        const p=fromTdx(q,region,onWait);
        tdxCache.set(ck,p);
        p.catch(()=>{ if(tdxCache.get(ck)===p) tdxCache.delete(ck); });
      }
      return tdxCache.get(ck).then(list=>capped(list,'tdx'));
    }
    return {
      async search(kw,opts){
        const q=String(kw||'').trim();
        const region=opts&&opts.region, onWait=opts&&opts.onWait;
        if(opts&&opts.live) return searchTdxLive(q,region,onWait);
        const names=await namesOf(region);
        if(names===null) return searchTdxCached(q,region,onWait);
        return capped(names.filter(n=>n.includes(q)),'file');
      }
    };
  }

  /* 站名搜尋：index 是 createStopIndex 的回傳值；getRegion() 回傳畫面目前的生活圈。
     search(kw)：一般搜尋。關鍵字 trim 後空白就回傳 null、不呼叫 index；否則開始時先收起即時搜尋按鈕，結果回來才換成新一批。
     live()：即時搜尋。用目前這一批的關鍵字與生活圈直接查 TDX，開始時不收起按鈕；沒有這一批就不做。
     items：[{text, value, selectable}]；超過 100 筆最後一個是不能選的提示；0 筆是「找不到這個站名」。
     state()：目前這一批 {kw, region, items, liveShown} 的複本（一般搜尋進行中 liveShown 為 false），沒有（還沒搜尋或已作廢）回傳 null。
     buttons()：兩顆按鈕的文字與能不能按。
     regionChanged()：生活圈變了，作廢全部。 */
  function createStopSearch({index,getRegion}){
    let batch=null, seq=0, busy=null; /* seq 每次搜尋或作廢加一，只有最新一次搜尋的結果能寫回；busy＝還沒回來的那一次 {kind:'general'|'live', waitSec}，沒有就 null */
    const LABEL={general:'搜尋',live:'用 TDX 即時搜尋'};
    const itemsOf=(names,more)=>{
      if(!names.length) return [{text:'找不到這個站名',value:null,selectable:false}];
      const items=names.map(n=>({text:n,value:n,selectable:true}));
      if(more>0) items.push({text:`還有 ${more} 筆，請多打幾個字`,value:null,selectable:false});
      return items;
    };
    const state=()=>batch&&{kw:batch.kw,region:batch.region,items:batch.items.map(x=>({...x})),liveShown:!(busy&&busy.kind==='general')};
    /* 開始一次查詢；忙碌時由 search()／live() 擋下，這裡不會重入 */
    async function runSearch(kind,q,region){
      const mine=++seq, job={kind,waitSec:null};
      busy=job;
      let res, err=null;
      /* onWait 只在排隊時被呼叫；拿到額度後維持最後的等 N 秒直到查完（tdx 不通知額度到手，和原本畫面相同） */
      try{ res=await index.search(q,{region,live:kind==='live',onWait:s=>{ job.waitSec=s }}); }catch(e){ err=e; }
      if(busy===job) busy=null;
      if(mine!==seq) return null;
      /* 生活圈讀法已回傳別區（沒走 regionChanged）：同樣視為作廢，舊區的上一批也不留 */
      if(getRegion()!==region){ batch=null; return null; }
      if(err) throw err;
      batch={kw:q,region,items:itemsOf(res.names,res.more)};
      return state();
    }
    return {
      /* 搜尋被丟棄（途中作廢、生活圈變了）回傳 null，錯誤也一樣丟棄；
         最新一次搜尋出錯時錯誤原樣丟出，上一批結果與按鈕維持原狀。
         忙碌時（還有一次沒回來）再呼叫 search() 或 live() 直接回傳 null、不呼叫 index，不論關鍵字或生活圈 */
      async search(kw){
        if(busy) return null;
        const q=String(kw||'').trim();
        if(!q) return null;
        return runSearch('general',q,getRegion());
      },
      /* 即時搜尋：用上一次搜尋的關鍵字與生活圈直接查 TDX；沒有上一次搜尋（剛建立或已作廢）回傳 null、不做。
         開始時不收起按鈕，結果取代選單的一批 */
      async live(){
        if(busy||!batch) return null;
        return runSearch('live',batch.kw,batch.region);
      },
      state,
      /* 按鈕的文字與能不能按：有查詢在跑時兩個都不能按，正在用的那顆顯示「搜尋中」，排隊時「等 N 秒」；結束（含出錯）回原文字 */
      buttons(){
        const label=kind=>busy&&busy.kind===kind?(busy.waitSec!=null?`等 ${busy.waitSec} 秒`:'搜尋中'):LABEL[kind];
        return {
          general:{text:label('general'),disabled:busy!==null},
          live:{text:label('live'),disabled:busy!==null},
        };
      },
      /* 生活圈變了（手動換、打開設定頁）：結果、按鈕、上一次搜尋的關鍵字與生活圈全部作廢，進行中的搜尋結果也丟棄 */
      regionChanged(){ seq++; batch=null; busy=null; },
    };
  }

  const api={VERSION,createStopIndex,createStopSearch};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Stops=api;
})(typeof window!=='undefined'?window:this);
