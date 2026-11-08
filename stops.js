'use strict';
/* 站名檔 module：從本機站名檔搜尋站名（GLOSSARY「站名檔」）。
   Stops.createStopIndex({load, tdx}).search(關鍵字, {region, onWait, live}) 回傳 {names, more, source}。
   load(生活圈 id) 回傳解析後的站名檔（App 用 fetch 加 ?v=VERSION）；tdx 只用 searchStops。
   站名檔是不可信資料：整檔不合格就作廢（改用 TDX），單筆不合格就略過。 */
(function(root){
  const VERSION='20261108f';
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
    return {
      async search(kw,opts){
        const q=String(kw||'').trim();
        const region=opts&&opts.region, onWait=opts&&opts.onWait;
        const viaTdx=()=>tdx.searchStops(q,{region,onWait}).then(list=>capped(list,'tdx'));
        if(opts&&opts.live) return viaTdx();
        const names=await namesOf(region);
        if(names===null) return viaTdx();
        return capped(names.filter(n=>n.includes(q)),'file');
      }
    };
  }

  const api={VERSION,createStopIndex};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Stops=api;
})(typeof window!=='undefined'?window:this);
