'use strict';
/* ---------- 看板內容 ----------
   給「組合＋TDX 到站資料＋查到的時間＋現在時間」，算出整個看板要顯示什麼。
   不記狀態、不碰畫面、不連網；每 5 秒重算一次也很便宜。
   回傳的文字都是純文字，畫 HTML 時再統一跳脫。

   boardOf(pair, rows, at, now) 回傳：
     state       'ok' 有車 | 'noBus' 目前沒有車 | 'allExcluded' 可搭的路線都已排除 | 'noRoutes' 找不到路線
     hero        第一班 {name, sub, eta}；沒有就是 null
     rest        其他路線，同樣格式
     buses       3D 光點 [{name, sec, hot}]
     hidden      已隱藏幾條路線
     stale       資料是否超過 3 分鐘
     nextRefreshMs 多久後再查：3 分鐘內有車 30 秒、其他 60 秒、沒有即時資料 90 秒
   eta = {kind:'min', n, tone} 或 {kind:'word', text, tone}，tone 是 'hot' | 'dim' | '' */
(function(root){
  const SOON=180, ARRIVING=60, STALE_MS=3*60000;

  /* 排序用：有即時分鐘數的最前面，其次未發車（依首站發車時間），最後末班已過、停駛等 */
  function rank(d){
    if(!d) return 9e9;
    if(d.StopStatus===0&&d.EstimateTime!=null) return d.EstimateTime;
    if(d.StopStatus===1) return 1e6+(d.NextBusTime?Date.parse(d.NextBusTime)/1e3%1e6:5e5);
    return 2e6+(d.StopStatus||0);
  }
  const live=d=>!!d&&d.StopStatus===0&&d.EstimateTime!=null;
  const hhmm=t=>{const x=new Date(t);return String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')};

  function etaOf(d){
    if(!d) return {kind:'word',text:'無資料',tone:'dim'};
    if(live(d)){
      const s=d.EstimateTime;
      if(s<ARRIVING) return {kind:'word',text:'進站中',tone:'hot'};
      if(s<SOON) return {kind:'word',text:'將到站',tone:'hot'};
      return {kind:'min',n:Math.floor(s/60),tone:''};
    }
    if(d.StopStatus===1) return d.NextBusTime?{kind:'word',text:hhmm(d.NextBusTime),tone:''}:{kind:'word',text:'未發車',tone:'dim'};
    return {kind:'word',text:({2:'交管不停',3:'末班已過',4:'今日停駛'}[d.StopStatus]||'無資料'),tone:'dim'};
  }
  function subOf(r,d,to){
    const s='坐 '+r.hops+' 站到'+to;
    return d&&d.StopStatus===1&&d.NextBusTime?'首站發車 '+hhmm(d.NextBusTime)+' · '+s:s;
  }

  /* 每條路線挑出最快的那筆，再把同名同方向的合併（雙站位時留比較快到的），最後依到站排序 */
  function match(routes,rows){
    const items=routes.map(r=>{
      let best=null;
      for(const d of rows) if(d&&d._city===r.city&&d.StopUID===r.stop&&d.RouteUID===r.route&&d.Direction===r.dir&&(!best||rank(d)<rank(best))) best=d;
      return {r,d:best};
    });
    const byKey=new Map();
    for(const x of items){
      const k=x.r.name+'|'+x.r.dir, old=byKey.get(k);
      if(!old||rank(x.d)<rank(old.d)) byKey.set(k,x);
    }
    return [...byKey.values()].sort((a,b)=>rank(a.d)-rank(b.d));
  }
  /* 兩次查詢之間，畫面自己扣秒數 */
  function aged(d,sec){
    return live(d)?Object.assign({},d,{EstimateTime:Math.max(0,d.EstimateTime-sec)}):d;
  }

  function boardOf(pair,rows,at,now){
    const routes=pair&&Array.isArray(pair.routes)?pair.routes:[];
    const exclude=pair&&Array.isArray(pair.exclude)?pair.exclude:[];
    const names=[...new Set(routes.map(r=>r.name))];
    const hidden=names.filter(n=>exclude.includes(n)).length;
    const elapsed=Math.max(0,(now-at)/1000);
    const base={hero:null,rest:[],buses:[],hidden,stale:now-at>STALE_MS,nextRefreshMs:90000};
    if(!routes.length) return Object.assign(base,{state:'noRoutes',stale:false,nextRefreshMs:30000});
    if(hidden===names.length) return Object.assign(base,{state:'allExcluded',stale:false,nextRefreshMs:30000});

    const all=match(routes,Array.isArray(rows)?rows:[]).map(x=>({r:x.r,d:aged(x.d,elapsed)}));
    /* 更新頻率看的是所有路線（含排除的），和以前一樣 */
    const soonest=all.filter(x=>live(x.d)).map(x=>x.d.EstimateTime);
    base.nextRefreshMs=!soonest.length?90000:Math.min(...soonest)<=SOON?30000:60000;

    const shown=all.filter(x=>!exclude.includes(x.r.name));
    if(!shown.length) return Object.assign(base,{state:'noBus'});
    const to=pair.to||'';
    const view=x=>({name:x.r.name,sub:subOf(x.r,x.d,to),eta:etaOf(x.d)});
    return Object.assign(base,{state:'ok',hero:view(shown[0]),rest:shown.slice(1).map(view),
      buses:shown.map(x=>{const sec=live(x.d)?x.d.EstimateTime:null; return {name:x.r.name,sec,hot:sec!=null&&sec<SOON}})});
  }

  /* 轉乘組合拆成兩段，各自當成一個組合交給 boardOf；直達組合原樣回傳
     leg=1：上車站 → 轉乘站（routes、exclude）；leg=2：轉乘站 → 下車站（routes2、exclude2） */
  function legOf(pair,leg){
    if(!pair||!pair.via) return pair;
    return leg===2?{from:pair.via,to:pair.to,routes:pair.routes2||[],exclude:pair.exclude2||[]}
      :{from:pair.from,to:pair.via,routes:pair.routes||[],exclude:pair.exclude||[]};
  }
  /* 看第一段時，第二段如果沒車就回傳一行警告（純文字），有車或不是轉乘組合回傳 null。
     第二段的站牌和第一段一起查到站，不多花查詢次數。 */
  function secondLegNote(pair,rows,at,now){
    if(!pair||!pair.via) return null;
    const b=boardOf(legOf(pair,2),rows,at,now), leg='第二段（'+pair.via+' → '+pair.to+'）';
    if(b.state==='noRoutes') return leg+'找不到路線，請到設定換轉乘站。';
    if(b.state==='allExcluded') return leg+'的路線都已排除。';
    if(b.state==='noBus'||b.hero.eta.tone==='dim') return leg+'目前沒有車，可能已收班。';
    return null;
  }

  /* 示範資料：還沒填金鑰時顯示，和真的看板走同一條路 */
  function demoBoard(to,now){
    const mk=(name,hops)=>({city:'Taipei',route:'DEMO'+name,name,dir:0,stop:'DEMO',hops});
    const row=(name,d)=>Object.assign({_city:'Taipei',StopUID:'DEMO',RouteUID:'DEMO'+name,Direction:0},d);
    const pair={to:to||'下車站',routes:[mk('D2',7),mk('D1',6),mk('D3',7),mk('D4',9)],exclude:[]};
    return boardOf(pair,[
      row('D2',{StopStatus:0,EstimateTime:420}),
      row('D1',{StopStatus:0,EstimateTime:110}),
      row('D3',{StopStatus:0,EstimateTime:960}),
      row('D4',{StopStatus:1,NextBusTime:new Date(now+40*60000).toISOString()})],now,now);
  }

  const api={boardOf,demoBoard,legOf,secondLegNote};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Board=api;
})(typeof window!=='undefined'?window:this);
