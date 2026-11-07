'use strict';
/* ---------- 到站更新 ----------
   決定何時查到站、查完存什麼、看第幾段，狀態一變就把「畫面資料」交給 onChange。
   不碰畫面、不開計時器：app.js 每 5 秒呼叫 tick()，時間一律用注入的 now()。
   不管使用習慣與自動選組合（app.js 在 back() 的 pick 裡處理）。

   createUpdater({store, finder, tdx, now, onChange})
     store   組合儲存（pairs.js）       finder  找路線（routes.js）
     tdx     TDX 查詢（tdx.js）：hasKey、arrivals
   操作：
     start()          開啟 App、已決定看哪一組之後，送第一次查詢
     tick()           每 5 秒：扣倒數、閒置暫停、時間到才自動更新
     refresh()        使用者按更新
     select(id)       切換組合：回到第一段；這組手上有 3 分鐘內的到站資料就先顯示，
                      到了更新時間才在背景查；沒有才顯示「載入中…」並查詢。id 不存在回傳 false
     switchLeg()      轉乘組合看下一段／回第一段（兩段到站一起查過，不另外查）
     setActive(on)    是否在看板上（進出設定頁）；回到看板時和切換組合一樣：有資料先顯示，到時間才查
     leave()          App 切到背景
     back(pick)       App 回到前景；離開 30 分鐘以上算重新打開：回到第一段，
                      並呼叫 pick()，pick 回傳 true 表示它換了目前組合
     touch()          使用者點畫面：從閒置暫停恢復
     leg()            目前第幾段（1 或 2）

   畫面資料 view：
     mode      'demo'（沒有金鑰或沒有組合，顯示示範資料）| 'board'
     pair      目前組合（唯讀）       leg      目前第幾段
     loading   要顯示在看板中間的等待文字；有它就不畫 board
     board     看板內容（board.js 的 boardOf 結果）
     legNote   第二段沒車的一行警告（純文字）或 null
     message   提示訊息（純文字，空字串＝不顯示）
     stampAt   最後一次拿到到站資料的時間（null＝還沒有）
     stale     資料是否太舊或有問題       spinning 是否正在查
     scene     這次要不要把班次交給 3D 場景（倒數時也交：跨過 3 分鐘時「將到站」要和看板同時變）
   所有文字都是純文字，畫 HTML 時再跳脫。

   到站資料記住「是查哪些站牌」：路線改了（重找、換轉乘站、改直達）就自動失效，不用呼叫端清除；
   只排除路線不會讓它失效。
   每個組合各自保留最後一次的到站資料（只在記憶體，不寫 localStorage），切回來不用重查；
   超過 3 分鐘（看板「資料太舊」的標準）就不再拿來用。
   查詢途中切換組合：舊組合排隊中的查詢直接取消；已送出的照樣收下存起來，查完馬上接著查新組合。 */
(function(root){
  const node=typeof module!=='undefined'&&module.exports;
  const Board=node?require('./board.js'):root.Board;
  const IDLE_MS=10*60000, REOPEN_MS=30*60000, BACK_STALE_MS=20000, KEEP_MS=3*60000;
  const TEXT={
    loading:'載入中…',
    finding:'正在找可搭的路線…',
    idle:'已暫停自動更新，以節省查詢次數。點一下畫面就會繼續。',
    noRoutesVia:'這一段找不到路線，請到設定按「換轉乘站」或「重找路線」。',
    noRoutes:'請到設定確認站名，或按「重找路線」。',
    rateTail:'畫面是最後一次的資料。'
  };
  /* 排隊等額度時的提示：limit 自己保留額度、paused 被 TDX 擋（設定頁也用） */
  const waitText=(s,why,then)=>why==='paused'?'TDX 暫時限制這組金鑰的查詢次數，約 '+s+' 秒後自動重試…'
    :'為了不超過 TDX 每分鐘的查詢上限，約 '+s+' 秒後'+(then||'送出查詢')+'…';
  /* 到站資料是查哪些站牌：同縣市同站牌只算一次，順序不影響 */
  function keyOf(p){
    const rs=p.via?(p.routes||[]).concat(p.routes2||[]):(p.routes||[]);
    return [...new Set(rs.map(r=>r.city+'|'+r.stop))].sort().join(',');
  }

  function createUpdater(deps){
    const store=deps.store, finder=deps.finder, tdx=deps.tdx, onChange=deps.onChange||(()=>{});
    const now=deps.now||(()=>Date.now());

    let leg=1, last=null; /* last＝{pid, key, rows, at} 目前組合最後一次成功取得的原始到站資料 */
    const kept=new Map(); /* 組合 id → 同樣格式的到站資料，切回來時用 */
    let lastTry=0, busy=false, again=null, /* again：查詢中又有人要查（null＝沒有；false＝使用者操作） */ active=true, visible=true, idle=false, lastTouch=now(), hiddenAt=0;
    let demo=false, screen={loading:TEXT.loading,board:null}, legNote=null, message='', stampAt=null, stale=true; /* 還沒拿到資料：狀態燈先暗著 */

    const onBoard=()=>active&&visible;
    const stillHere=pid=>(store.current()||{}).id===pid;
    const valid=p=>!!(last&&p&&last.pid===p.id&&last.key===keyOf(p));
    function emit(scene){
      onChange({mode:demo?'demo':'board',pair:store.current(),leg,loading:screen.loading,board:screen.board,
        legNote,message,stampAt,stale,spinning:busy,scene:!!scene});
    }
    function lastBoard(){
      const p=store.current();
      return valid(p)?Board.boardOf(Board.legOf(p,leg),last.rows,last.at,now()):null;
    }
    /* 看第一段時，第二段沒車才顯示一行警告 */
    function noteOf(){
      const p=store.current();
      return p&&p.via&&leg===1&&valid(p)?Board.secondLegNote(p,last.rows,last.at,now()):null;
    }
    /* 用手上的到站資料重畫（倒數、切段），回傳是否畫了 */
    function showLast(scene,markStale){
      const b=lastBoard(); if(!b) return false;
      screen={loading:null,board:b}; legNote=noteOf();
      if(markStale&&b.stale) stale=true;
      emit(scene); return true;
    }
    function loading(text){screen={loading:text,board:null}; legNote=null}
    /* 本地倒數：兩次查詢之間畫面自己扣秒數；扣過秒的班次也交給 3D 場景，「將到站」只由看板內容決定 */
    function countdown(){
      const p=store.current();
      if(!last||!p||last.pid!==p.id) return;
      if(showLast(true,true)) return;
      /* 路線改了，手上的到站資料對不上：顯示載入中，這次心跳就重查 */
      kept.delete(p.id); last=null; lastTry=0; loading(TEXT.loading); emit(false);
    }
    /* 換了目前組合或回到看板：手上有這組 3 分鐘內的資料就先畫出來，到了更新時間才在背景查；
       沒有才顯示「載入中…」並查詢 */
    function resume(){
      const p=store.current();
      if(!p||!tdx.hasKey()||demo) return refresh(false);
      const e=kept.get(p.id);
      last=e&&now()-e.at<=KEEP_MS?e:null;
      message='';
      if(last){
        lastTry=last.at; stampAt=last.at; stale=false;
        if(showLast(true,true)){
          if(now()-lastTry>=refreshDelay()) return refresh(true);
          return;
        }
        kept.delete(p.id); last=null; /* 路線改了，資料對不上 */
      }
      lastTry=0; stampAt=null; stale=true; loading(TEXT.loading); emit(false);
      return refresh(false);
    }
    /* 只留 3 分鐘內的資料 */
    function keep(entry){
      for(const [id,e] of kept) if(now()-e.at>KEEP_MS) kept.delete(id);
      kept.set(entry.pid,entry);
    }
    /* 依最近一班車決定多久查一次（由看板內容決定）：3 分鐘內 30 秒、其他 60 秒、沒有即時資料 90 秒 */
    function refreshDelay(){
      const b=lastBoard();
      return b?b.nextRefreshMs:30000;
    }

    /* auto=true：自動更新，額度不夠就跳過這輪；auto=false：使用者操作，額度不夠就排隊等 */
    async function refresh(auto){
      let p=store.current();
      if(!tdx.hasKey()||!p){
        demo=true; screen={loading:null,board:Board.demoBoard(p?p.to:'',now())}; legNote=null; stale=true;
        emit(true); return;
      }
      if(demo){demo=false; emit(false)}
      if(busy){again=again===null?!!auto:again&&!!auto; return} /* 查完馬上接著查 */
      const pid=p.id, prevTry=lastTry;
      busy=true; lastTry=now(); emit(false);
      const opts={auto:!!auto,cancel:()=>!stillHere(pid),
        onWait:(s,why)=>{if(stillHere(pid)){message=waitText(s,why); emit(false)}}};
      try{
        if(store.needsRoutes(pid)){
          if(!last||last.pid!==pid){loading(TEXT.finding); emit(false)}
          const found=await finder.resolve(p,opts);
          if(found===null){if(stillHere(pid)) lastTry=prevTry; return} /* 這輪跳過（或已切換組合），下次心跳再試 */
          p=store.setRoutes(pid,found.routes,found);
          if(!p||!stillHere(pid)) return; /* 等待期間組合被刪除或切換了 */
        }
        /* 這一段找不到路線、或路線全部排除了：不用查到站，省一次查詢 */
        const pre=Board.boardOf(Board.legOf(p,leg),[],now(),now());
        if(pre.state==='noRoutes'){
          last=null; screen={loading:null,board:pre}; legNote=null;
          message=p.via?TEXT.noRoutesVia:TEXT.noRoutes; emit(false); return;
        }
        if(pre.state==='allExcluded'){
          last=null; screen={loading:null,board:pre}; legNote=null; message=''; emit(true); return;
        }
        /* 轉乘組合兩段的站牌一起查（同縣市合併成一次），切換段落時不用再查 */
        const rows=await tdx.arrivals(p.via?p.routes.concat(p.routes2||[]):p.routes,opts);
        if(rows===null){if(stillHere(pid)) lastTry=prevTry; return}
        const at=now(), got={pid,key:keyOf(p),rows,at};
        keep(got); /* 等待期間切換了組合也存起來，切回來時用得到 */
        if(!stillHere(pid)) return;
        last=got;
        lastTry=at; /* 從拿到資料起算下次更新（排隊等很久時不會一查完又馬上再查） */
        stale=false; stampAt=at; message='';
        showLast(true,false);
      }catch(e){
        if(!stillHere(pid)) return; /* 舊組合的錯誤不顯示在新組合上 */
        message=(e&&e.message||'查詢失敗')+(e&&e.kind==='rate'?TEXT.rateTail:'');
        stale=true; emit(false);
      }finally{
        busy=false;
        emit(false);
        if(again!==null){const a=again; again=null; if(onBoard()) refresh(a)}
      }
    }

    return {
      start(){return refresh(false)},
      refresh(){return refresh(false)},
      tick(){
        if(!onBoard()) return;
        countdown();
        if(now()-lastTouch>IDLE_MS){
          if(!idle){idle=true; message=TEXT.idle; stale=true; emit(false)}
          return;
        }
        if(now()-lastTry>=refreshDelay()) refresh(true);
      },
      select(id){
        if(!store.select(id)) return false;
        leg=1; resume();
        return true;
      },
      switchLeg(){
        const p=store.current(); if(!p||!p.via) return;
        leg=leg===2?1:2;
        /* 兩段的到站資料是一起查的，直接用手上的資料重畫，不另外查詢 */
        if(last&&last.pid===p.id){if(!showLast(true,false)) emit(false)}
        else{emit(false); refresh(false)}
      },
      setActive(on){
        active=!!on;
        if(active) resume();
      },
      leave(){visible=false; hiddenAt=now()},
      back(pick){
        visible=true; lastTouch=now();
        if(idle){idle=false; message=''}
        const reopened=hiddenAt&&now()-hiddenAt>=REOPEN_MS; hiddenAt=0;
        if(reopened&&active){
          const wasLeg2=leg!==1; leg=1; /* 重新打開時，轉乘組合回到第一段 */
          if(pick&&pick()){resume(); return}
          if(wasLeg2) showLast(true,false);
        }
        emit(false);
        /* 切回來時資料超過 20 秒才重查，其餘交給倒數 */
        if(onBoard()&&now()-lastTry>BACK_STALE_MS) refresh(true); else countdown();
      },
      touch(){
        lastTouch=now();
        if(!idle) return;
        idle=false; message=''; emit(false);
        if(onBoard()) refresh(false);
      },
      leg(){return leg}
    };
  }

  const api={createUpdater,waitText,IDLE_MS,REOPEN_MS};
  if(node) module.exports=api;
  else root.Updater=api;
})(typeof window!=='undefined'?window:this);
