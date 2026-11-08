'use strict';
/* 站名檔 module：從本機站名檔搜尋站名（GLOSSARY「站名檔」）。
   Stops.createStopIndex({load, tdx}).search(關鍵字, {region, onWait, live}) 回傳 {names, more, source}。
   load(生活圈 id) 回傳解析後的站名檔（App 用 fetch 加 ?v=VERSION）；tdx 只用 searchStops。
   改用 TDX（備案）時，同一生活圈＋同一關鍵字在這個 index 的生命期內只查一次；live 每次都真的查，成功才更新快取。
   站名檔是不可信資料：整檔不合格就作廢（改用 TDX），單筆不合格就略過。 */
(function(root){
  const VERSION='20261108j';
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

  const api={VERSION,createStopIndex};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Stops=api;
})(typeof window!=='undefined'?window:this);
