'use strict';
/* ---------- 使用習慣 ----------
   記下「什麼時間看哪一組」，開啟 App 時猜這個時間通常看哪一組。
   - 只存 [組合 id, 時間(取到分鐘)]，不存站名、位置或金鑰；只在這支手機的 bus.usage。
   - 讀取時當不可信資料：格式不對、已刪除的組合、30 天以前、未來的紀錄都略過；最多 200 筆。
   - 不呼叫 API，不碰畫面。

   createUsage({storage, pairIds, now})
     storage  get/set（和組合儲存相同）     pairIds() 目前所有組合的 id
   操作：
     chose(id, why) 手動或自動選了組合：重新計時，並記下原因（why：guess／last／manual）
     resume(id)     只重新計時，原因不變（從設定頁回看板、從背景回來但沒換組合）
     reason()       原因文字：guess、last 有字；manual 或還沒選是空字串（只在記憶體）
     viewTick(id)   心跳時呼叫：同一組連續看滿 20 秒才記一筆；同一次只記一次，
                    同一組 20 分鐘內已經記過也不再記
     guess()        最近 30 天、平日/假日分開、現在前後 1 小時內看最多次的組合；
                    至少 3 次而且沒有平手才回傳 id，否則 null
     forget(id)     刪除組合時，立刻刪掉那組的紀錄
     clear()        清除全部
     count()        目前有幾筆紀錄（最近 30 天） */
(function(root){
  const KEY='bus.usage', DAYS=30, MAX=200, VIEW_MS=20000, SAME_GAP=20*60000, LEARN_MIN=3, LEARN_WIN=60;

  function createUsage(deps){
    const storage=deps.storage, pairIds=deps.pairIds, now=deps.now||(()=>Date.now());

    function load(){
      const t=now(), ids=new Set(pairIds()), a=storage.get(KEY);
      if(!Array.isArray(a)) return [];
      return a.filter(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'&&ids.has(x[0])&&
          typeof x[1]==='number'&&isFinite(x[1])&&x[1]>t-DAYS*864e5&&x[1]<=t+60000)
        .sort((x,y)=>x[1]-y[1]).slice(-MAX);
    }
    function add(id){
      const t=now(), a=load();
      if(a.some(x=>x[0]===id&&t-x[1]<SAME_GAP)) return; /* 同一次使用只記一筆 */
      a.push([id,Math.floor(t/60000)*60000]);
      storage.set(KEY,a.slice(-MAX));
    }

    let view={id:null,since:0,done:false}, kind=null;
    const WHY_TEXT={guess:'通常這個時間用這組', last:'上次使用'};
    function start(id){view={id:id||null,since:now(),done:false}}
    return {
      chose(id,why){kind=why||null; start(id)},
      resume(id){start(id)},
      reason(){return WHY_TEXT[kind]||''},
      viewTick(id){
        if(view.done||!id||id!==view.id) return;
        if(now()-view.since>=VIEW_MS){view.done=true; add(id)}
      },
      guess(){
        const a=load(); if(!a.length) return null;
        const weekend=d=>d.getDay()===0||d.getDay()===6, mins=d=>d.getHours()*60+d.getMinutes();
        const n=new Date(now()), nw=weekend(n), nm=mins(n), cnt={};
        for(const [id,ts] of a){
          const d=new Date(ts); if(weekend(d)!==nw) continue;
          let diff=Math.abs(mins(d)-nm); diff=Math.min(diff,1440-diff); /* 跨午夜也算得近 */
          if(diff<=LEARN_WIN) cnt[id]=(cnt[id]||0)+1;
        }
        const top=Object.entries(cnt).sort((x,y)=>y[1]-x[1]);
        if(!top.length||top[0][1]<LEARN_MIN||(top[1]&&top[1][1]===top[0][1])) return null;
        return top[0][0];
      },
      /* 組合已經從組合儲存刪掉了，重新讀取時自然略過；寫回就等於刪除 */
      forget(id){storage.set(KEY,load().filter(x=>x[0]!==id))},
      clear(){storage.set(KEY,[])},
      count(){return load().length}
    };
  }

  const api={createUsage,KEY,VIEW_MS};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Usage=api;
})(typeof window!=='undefined'?window:this);
