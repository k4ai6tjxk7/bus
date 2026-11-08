'use strict';
/* 被嵌入別的網頁時（theme.js 判斷，index.html 只顯示「請直接開啟」）在建 3D 場景、讀組合、查 TDX、記使用習慣之前結束 */
(function(){
if(Theme.framed) return;
const $=id=>document.getElementById(id);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
          set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

const LS_ADAPTER={get:k=>LS.get(k),set:(k,v)=>LS.set(k,v)};

/* ---------- 3D 場景與畫面風格 ----------
   3D 場景只負責畫（scene.js）；看板內容的 buses 交給它。沒有 WebGL 時場景會隱藏，看板照常運作。
   畫面風格整支手機共用；換風格（載入、換場景、班次轉交）全部交給 styles.js 的 createSwitcher。 */
const styleSetting=Styles.createStyleSetting({storage:LS_ADAPTER});
const styleSwitcher=Styles.createSwitcher({load:Styles.createLoader({doc:document}),createScene:Scene.createScene,
  sceneOpts:{host:$('scene'),tagsEl:$('tags'),THREE:window.THREE,theme:Theme.page,reduce:matchMedia('(prefers-reduced-motion: reduce)').matches},
  root:document.documentElement,now:()=>Date.now()});
styleSwitcher.show(styleSetting.current());
/* 組合的讀寫、驗證全部交給組合儲存（pairs.js） */
const store=PairStore.createPairStore(LS_ADAPTER);
/* 和 TDX 打交道（金鑰、token、查詢額度、錯誤訊息）全部交給 TDX 查詢（tdx.js） */
const tdx=Tdx.createTdx({fetch:(u,o)=>fetch(u,o),storage:LS_ADAPTER});
/* 找路線（直達、轉乘）全部交給 routes.js；它透過 TDX 查詢取得經過某站的路線 */
const finder=Routes.createFinder({routesThrough:(k,o)=>tdx.routesThrough(k,o)});
/* 站名檔：搜尋走本機站名檔，載入失敗時站名檔 module 自動改用 TDX */
const stopIndex=Stops.createStopIndex({tdx,load:async region=>{
  const res=await fetch('stops/'+encodeURIComponent(region)+'.json?v='+Stops.VERSION);
  if(!res.ok) throw new Error('stops '+res.status);
  return res.json();
}});
/* 何時查到站、查完存什麼、看第幾段全部交給到站更新（updater.js）；這裡只負責把畫面資料畫出來 */
const updater=Updater.createUpdater({store,finder,tdx,onChange:v=>render(v)});

const esc=Board.esc;
const waitText=Updater.waitText;

function curPair(){return store.current()}
/* 轉乘組合目前看第幾段（1 或 2），由到站更新決定；換組合、重新打開 App 都回到第一段 */
function viewPair(){return Board.legOf(curPair(),updater.leg())}
function showMsg(t){$('msg').textContent=t||''; $('msg').hidden=!t}

/* ---------- 使用習慣：記錄、猜常用組合、清除都交給 usage.js ---------- */
const usage=Usage.createUsage({storage:LS_ADAPTER,pairIds:()=>store.list().map(p=>p.id)});
/* 只在「打開 App」時呼叫，使用中不會突然跳組合。回傳是否換了組合 */
function autoPick(){
  const g=usage.guess();
  if(g){const before=(curPair()||{}).id; if(store.select(g)){usage.chose(g,'guess'); return g!==before}}
  const p=curPair(); usage.chose(p&&p.id,'last'); return false;
}
/* 停留在同一組超過 20 秒才算真的有在看；選組合的原因與計時都交給 usage.js（chose／resume） */
function resumeView(){const p=curPair(); usage.resume(p&&p.id)}

const CHECK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
function closeMenu(){$('pairMenu').hidden=true; $('pairBtn').setAttribute('aria-expanded','false')}
function renderChips(){
  const p=curPair(), leg=updater.leg();
  const list=store.list();
  $('pairBox').hidden=list.length<2;
  $('pairName').textContent=p?p.name:'';
  const tip=!LS.get('bus.tip',false);
  const w=tip?'點這裡切換其他組合':usage.reason();
  renderHidden();
  $('pairWhy').textContent=w; $('pairWhy').hidden=!w; $('pairWhy').classList.toggle('tip',tip);
  $('pairMenu').innerHTML=list.map(x=>{const on=p&&x.id===p.id;
    return `<button type="button" data-id="${esc(x.id)}" aria-current="${on}"><span class="mi"><span class="mn">${esc(x.name)}</span><span class="ms">${esc(stopsText(x))}</span></span>${on?CHECK:''}</button>`}).join('')
    +'<button type="button" class="manage" data-act="manage">新增或管理組合</button>';
  const v=viewPair();
  $('boardTitle').textContent=!p?'下一班進站':(p.via?(leg===2?'第二段・':'第一段・'):'')+Routes.stopCore(v.from)+' 下一班進站';
  const stop=(cls,lbl,name)=>`<div class="dot ${cls}"></div><div class="${cls==='past'?'past':''}"><div class="lbl">${lbl}</div><div class="stop">${esc(name)}</div></div>`;
  $('trip').innerHTML=!p?'':!p.via?`${stop('','上車',p.from)}<div class="rail"></div><div></div>${stop('end','下車',p.to)}`
    :leg===2?`${stop('past','上車（已搭過）',p.from)}<div class="rail off"></div><div></div>${stop('via','現在在這裡轉乘',p.via)}<div class="rail"></div><div></div>${stop('end','下車',p.to)}`
    :`${stop('','上車',p.from)}<div class="rail"></div><div></div>${stop('via','轉乘',p.via)}<div class="rail off"></div><div></div>${stop('end','下車',p.to)}`;
  const lb=$('legBtn');
  lb.hidden=!p||!p.via;
  if(p&&p.via){
    lb.classList.toggle('back',leg===2);
    lb.innerHTML=leg===2?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>回第一段'
      :`到${esc(p.via)}了，看下一段<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  }
}
const stopsText=p=>p.via?p.from+' → '+p.via+' → '+p.to:p.from+' → '+p.to;
$('legBtn').addEventListener('click',()=>{
  updater.switchLeg();
  window.scrollTo(0,0);
});
$('pairBtn').addEventListener('click',()=>{
  const open=$('pairMenu').hidden;
  $('pairMenu').hidden=!open; $('pairBtn').setAttribute('aria-expanded',String(open));
  if(open&&!LS.get('bus.tip',false)){LS.set('bus.tip',true); renderChips()} /* 提示看過一次就不再出現 */
});
$('pairMenu').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  closeMenu();
  if(b.dataset.act==='manage'){openSettings(true); return}
  const id=b.dataset.id;
  if(id===(curPair()||{}).id) return; /* 點同一組不重查 */
  const before=(curPair()||{}).id;
  usage.chose(id,'manual'); /* 先記好原因，updater.select 畫畫面時名稱下方才會顯示對的文字 */
  if(!updater.select(id)) usage.resume(before);
});
document.addEventListener('click',e=>{if(!$('pairMenu').hidden&&!$('pairBox').contains(e.target)) closeMenu()});

/* ---------- 排除路線：每組各自設定「不搭的路線」，只在畫面上過濾，不影響查詢次數 ----------
   存在組合的 exclude 欄位（路線名稱陣列，選填）。驗證與上限由組合儲存負責。 */
function exOf(p){return p?p.exclude:[]}
function routeNames(p){return p&&Array.isArray(p.routes)?[...new Set(p.routes.map(r=>r.name))]:[]}
function hiddenCount(p){const ex=exOf(p); return routeNames(p).filter(n=>ex.includes(n)).length}
function renderHidden(){
  const n=hiddenCount(viewPair()), el=$('hidNote');
  el.hidden=!n; el.textContent=n?`已隱藏 ${n} 條路線 · 修改`:'';
}
$('hidNote').addEventListener('click',()=>{const p=curPair(); if(p) openSettings(true,(p.via&&updater.leg()===2?'ex2-':'ex-')+p.id)});

/* 把看板內容畫出來；所有文字都在這裡跳脫。scene=true 才把班次交給 3D 場景（載入中、錯誤時維持原樣） */
const EMPTY_TEXT={noBus:'目前沒有車',allExcluded:'可搭的路線都已排除',noRoutes:'找不到同時經過這兩站的路線'};
function etaHtml(e,cls,hero){
  return e.kind==='min'?`<div class="${cls}"><span class="n">${e.n}</span><span class="u">分</span></div>`
    :`<div class="${cls} word ${e.tone}${hero&&e.tone==='hot'?' blink':''}">${esc(e.text)}</div>`;
}
function renderBoard(b,scene){
  renderHidden();
  if(scene) styleSwitcher.setBuses(b.buses);
  if(b.state!=='ok'){
    $('hero').innerHTML=`<div class="board-empty">${esc(EMPTY_TEXT[b.state])}</div>`;$('list').hidden=true;$('otherTitle').hidden=true;return;
  }
  const h=b.hero;
  $('hero').innerHTML=`<div class="hero"><div style="min-width:0"><div class="hero-route ${h.eta.tone==='dim'?'dim':''}">${esc(h.name)}</div><div class="hero-sub">${esc(h.sub)}</div></div>${etaHtml(h.eta,'hero-eta',true)}</div>`;
  $('otherTitle').hidden=!b.rest.length; $('list').hidden=!b.rest.length;
  $('list').innerHTML=b.rest.map(x=>`<div class="row"><div class="rinfo"><div class="rname">${esc(x.name)}</div><div class="rsub">${esc(x.sub)}</div></div>${etaHtml(x.eta,'eta',false)}</div>`).join('');
}
/* 把到站更新交來的畫面資料畫出來。到站狀態都在 updater.js；這裡只記上次畫了什麼，避免每 5 秒重畫組合選單與新手引導（示範模式下按「複製網址」的字樣與焦點才不會被洗掉） */
let drawn={pid:undefined,leg:undefined,stampAt:undefined,hasKey:undefined,hasPair:undefined};
function render(v){
  const pid=v.pair?v.pair.id:null;
  if(pid!==drawn.pid||v.leg!==drawn.leg){drawn.pid=pid; drawn.leg=v.leg; renderChips()}
  const hasKey=tdx.hasKey(), hasPair=!!v.pair;
  if(hasKey!==drawn.hasKey||hasPair!==drawn.hasPair){drawn.hasKey=hasKey; drawn.hasPair=hasPair; renderGuide(hasKey,hasPair)}
  $('demoNote').hidden=v.mode!=='demo';
  if(v.loading){$('hero').innerHTML=`<div class="board-empty">${esc(v.loading)}</div>`; $('list').hidden=true; $('otherTitle').hidden=true; renderHidden()}
  else if(v.board) renderBoard(v.board,v.scene);
  $('legNote').textContent=v.legNote||''; $('legNote').hidden=!v.legNote;
  showMsg(v.message);
  if(v.mode==='demo'){$('stamp').textContent='示範'; drawn.stampAt=undefined}
  else if(v.stampAt!=null&&v.stampAt!==drawn.stampAt){drawn.stampAt=v.stampAt; $('stamp').textContent=new Date(v.stampAt).toLocaleTimeString('zh-TW',{hour12:false})}
  $('live').classList.toggle('stale',v.stale);
  $('btnRefresh').classList.toggle('spin',v.spinning);
}

/* ---------- 設定 ---------- */
function openSettings(on,focusId){
  $('board').hidden=on; $('settings').hidden=!on; closeMenu();
  if(on) updater.setActive(false);
  if(on){
    const k=tdx.key(); $('cid').value=k.id; $('csec').value=k.secret; renderPairs(); renderUsage(); renderStyles(); renderTheme(); renderRegions(); resetRegion();
    const f=focusId&&$(focusId);
    if(f){f.scrollIntoView({block:'center'}); f.focus({preventScroll:true})} else window.scrollTo(0,0);
  } else {renderChips(); updater.setActive(true); resumeView()}
}

/* ---------- 新手引導 ---------- */
const TDX_SITE='https://tdx.transportdata.tw/';
/* 顯名聲明：設定頁最下面的「資料來源」與新手引導共用同一行 */
const SOURCE_HTML=`<img class="tdx-logo" src="tdxlogo.png" width="367" height="68" alt="TDX 交通部運輸資料流通服務平臺標章">資料介接「交通部TDX平臺」（交通部運輸資料流通服務平臺）<a href="${TDX_SITE}" target="_blank" rel="noopener noreferrer">TDX 網站</a>`;
$('sourceText').innerHTML=SOURCE_HTML;
function renderGuide(hasKey,hasPair){
  const g=$('guide');
  if(hasKey&&hasPair){g.hidden=true; g.innerHTML=''; return}
  const st=i=>i===1?(hasKey?'done':'now'):i===2?(hasPair?'done':(hasKey?'now':'')):'';
  const s1=hasKey?'':`<div class="step-b">
      <ol><li>到 TDX 網站註冊會員，並完成 Email 驗證</li>
          <li>登入後到「會員中心」的 API 金鑰頁面</li>
          <li>複製 <b>Client Id</b> 和 <b>Client Secret</b></li></ol>
      <div class="urlbox"><a href="${TDX_SITE}" target="_blank" rel="noopener noreferrer">tdx.transportdata.tw</a><button class="btn" type="button" id="gCopy">複製網址</button></div>
      <button class="btn primary" type="button" id="gKey">我拿到了，去貼上金鑰</button>
      <div class="hint">金鑰只存在你這支手機的瀏覽器裡，不會上傳，也不會分享給別人。申請免費。</div></div>`;
  const s2=(!hasKey||hasPair)?'':`<div class="step-b">
      <div>先選生活圈（雙北、台中、高雄……），再搜尋你要上車和下車的站名。程式會自動找出所有同方向、會經過這兩站的路線，不用一條一條查。</div>
      <div>沒有直達車時，會列出可以轉一次車的轉乘站讓你選。</div>
      <button class="btn primary" type="button" id="gPair">新增上下車站</button>
      <div class="hint">可以存好幾組，例如「上班」「下班」「出差」，每組各自選生活圈。點看板上方的組合名稱就能切換，用幾次後會依時段自動打開常用的那組。</div></div>`;
  g.innerHTML=`<h2>三步驟開始使用</h2>
    <p class="lead">設定一次就好，之後打開就直接看到哪幾班車能到。</p>
    <ol class="steps">
      <li class="step ${st(1)}"><span class="num">${hasKey?'✓':'1'}</span><span class="step-t">申請 TDX 金鑰</span>${s1}</li>
      <li class="step ${st(2)}"><span class="num">${hasPair?'✓':'2'}</span><span class="step-t">新增上下車站</span>${s2}</li>
      <li class="step"><span class="num">3</span><span class="step-t">看即時到站</span></li>
    </ol>
    <div class="hint">小技巧：用 Safari 打開，點<b>分享</b> →<b>加入主畫面</b>，就能像 App 一樣一鍵打開。</div><div class="hint src">${SOURCE_HTML}</div>`;
  g.hidden=false;
  const cp=$('gCopy');
  if(cp) cp.onclick=async()=>{
    try{await navigator.clipboard.writeText(TDX_SITE); cp.textContent='已複製'}
    catch(e){const r=document.createRange(); r.selectNodeContents(g.querySelector('.urlbox a')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); cp.textContent='已選取'}
    setTimeout(()=>{cp.textContent='複製網址'},1800);
  };
  if($('gKey')) $('gKey').onclick=()=>openSettings(true,'cid');
  if($('gPair')) $('gPair').onclick=()=>openSettings(true,'pName');
}
$('btnSettings').onclick=()=>openSettings($('settings').hidden);
$('btnBack').onclick=()=>openSettings(false);
$('btnRefresh').onclick=()=>updater.refresh();

$('btnSaveKey').onclick=async()=>{
  $('keyStatus').textContent='測試中…';
  try{
    await tdx.saveKey($('cid').value,$('csec').value,{onWait:(s,why)=>{$('keyStatus').textContent=waitText(s,why)}});
    $('keyStatus').textContent='✓ 金鑰可以用了';
  }catch(e){$('keyStatus').textContent=e.kind==='nokey'?'請填入兩個欄位。':e.message}
};
/* 設定頁的組合操作（新增、重找、換轉乘站、刪除）的規則與提示文字都在組合管理（manage.js）；這裡只畫、綁按鈕 */
const pm=Manage.createPairManager({store,finder,usage,onStatus:t=>{$('addStatus').textContent=t}});
const setErr=e=>{$('addStatus').textContent=Manage.errText(e)};

const regionName=id=>Regions.get(id).name;
function chips(p,leg2){
  const names=routeNames(leg2?Board.legOf(p,2):p), ex=leg2?p.exclude2:p.exclude;
  return `<div class="xchips">${names.map(n=>`<button type="button" class="xchip" data-act="ex" data-leg="${leg2?2:1}" data-id="${esc(p.id)}" data-n="${esc(n)}" aria-pressed="${ex.includes(n)}">${esc(n)}</button>`).join('')}</div>`;
}
function renderPairs(){
  const list=store.list();
  /* 只用一個生活圈時不顯示生活圈標籤，畫面和以前一樣 */
  const manyRegions=new Set(list.map(p=>p.region)).size>1;
  $('pairList').innerHTML=list.length?list.map(p=>{
    const n1=routeNames(p).length, n2=p.via?routeNames(Board.legOf(p,2)).length:0;
    const tags=(manyRegions?`<span class="ptag">${esc(regionName(p.region))}</span>`:'')+(p.via?'<span class="ptag tr">轉乘</span>':'');
    const hid=hiddenCount(p)+(p.via?hiddenCount(Board.legOf(p,2)):0);
    const info=p.via?`${esc(stopsText(p))}${p.routes?` · 第一段 ${n1} 條、第二段 ${n2} 條`:''}`
      :`${esc(stopsText(p))}${p.routes?` · ${n1} 條路線`:''}`;
    let exw='';
    if(p.via&&(n1||n2)) exw=`<div class="exw" id="ex-${esc(p.id)}" tabindex="-1"><div class="small">不搭的路線：點一下排除，看板上就不會顯示（只影響這一組）</div>
      ${n1?`<div class="legt">第一段・${esc(p.from)} → ${esc(p.via)}</div>${chips(p,false)}`:''}
      <div id="ex2-${esc(p.id)}" tabindex="-1" style="display:flex;flex-direction:column;gap:8px">${n2?`<div class="legt">第二段・${esc(p.via)} → ${esc(p.to)}</div>${chips(p,true)}`:''}</div></div>`;
    else if(n1) exw=`<div class="exw" id="ex-${esc(p.id)}" tabindex="-1"><div class="small">不搭的路線：點一下排除，看板上就不會顯示（只影響這一組）</div>${chips(p,false)}</div>`;
    const ask=p.via&&p.direct?`<div class="exw"><div class="ask"><span>現在有直達車了（${new Set(p.direct.map(r=>r.name)).size} 條），要改成直達嗎？</span>
      <span class="btns"><button class="btn primary" type="button" data-act="direct" data-id="${esc(p.id)}">改成直達</button><button class="btn ghost" type="button" data-act="keep" data-id="${esc(p.id)}">維持轉乘</button></span></div></div>`:'';
    /* 轉乘組合可換轉乘站；直達組合找不到路線時可找轉乘站 */
    const viaBtn=p.via?'換轉乘站':(p.routes&&!p.routes.length?'找轉乘站':'');
    return `<div class="pair"><div><b>${esc(p.name)}</b>${tags}<div class="small">${info}${hid?`，已排除 ${hid} 條`:''}</div></div>
    <div class="btns"><button class="btn" type="button" data-act="re" data-id="${esc(p.id)}">重找路線</button>${viaBtn?`<button class="btn" type="button" data-act="via" data-id="${esc(p.id)}">${viaBtn}</button>`:''}<button class="btn danger" type="button" data-act="del" data-id="${esc(p.id)}">刪除</button></div>${ask}${exw}
    <div class="exw vp" id="vp-${esc(p.id)}"></div></div>`}).join(''):'<div class="small">目前沒有組合。</div>';
}
/* 轉乘站候選清單：選一個再按確定。pick＝組合管理給的 {cands, lead, confirm}；onPick(候選) */
let pickSeq=0;
function renderPicker(el,{cands,lead,confirm},onPick){
  const nm='vp'+(++pickSeq);
  el.innerHTML=`<div class="note">${esc(lead)}</div>
    <fieldset class="cands"><legend>轉乘站（站數少的在前）</legend>
    ${cands.map((c,i)=>`<label class="cand"><input type="radio" name="${nm}" value="${i}"${i===0?' checked':''}>
      <span><b>${esc(c.via)}</b><small>共 ${c.hops} 站・第一段 ${c.hops1} 站／第二段 ${c.hops2} 站</small><small>第一段 ${c.n1} 條路線・第二段 ${c.n2} 條路線</small></span></label>`).join('')}</fieldset>
    <button class="btn primary" type="button">${esc(confirm(cands[0]))}</button>
    <div class="small">只列出兩段站牌相距 ${Routes.MAX_DIST} 公尺內、轉一次車的轉乘站。</div>`;
  const btn=el.querySelector('button.primary');
  const sel=()=>cands[+(el.querySelector('input:checked')||{}).value||0];
  el.querySelectorAll('input').forEach(x=>x.onchange=()=>{btn.textContent=confirm(sel())});
  btn.onclick=()=>{const c=sel(); el.innerHTML=''; onPick(c)};
}
$('pairList').addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b||!b.dataset.act)return;
  const p=store.list().find(x=>x.id===b.dataset.id); if(!p)return;
  const keepScroll=()=>{const y=window.scrollY; renderPairs(); window.scrollTo(0,y)};
  if(b.dataset.act==='ex'){
    store.toggleExclude(p.id,b.dataset.n,+b.dataset.leg);
    keepScroll(); return;
  }
  if(b.dataset.act==='direct'){store.useDirect(p.id); keepScroll(); return}
  if(b.dataset.act==='keep'){store.dismissDirect(p.id); keepScroll(); return}
  if(b.dataset.act==='del'){
    if(b.dataset.confirm!=='1'){b.dataset.confirm='1'; b.textContent='確定刪除'; return}
    pm.remove(p.id);
    renderPairs(); renderUsage();
  }else if(b.dataset.act==='via'){
    b.textContent='尋找中…';
    const r=await pm.transfers(p.id);
    renderPairs();
    const el=$('vp-'+p.id); if(!el) return;
    if(r.none){el.innerHTML=`<div class="note">${esc(r.none)}</div>`; return}
    if(!r.pick) return;
    renderPicker(el,r.pick,c=>{pm.chooseVia(p.id,c); renderPairs()});
    el.scrollIntoView({block:'nearest'});
  }else{
    b.textContent='尋找中…';
    await pm.refind(p.id);
    renderPairs();
  }
});

function renderUsage(){
  const n=usage.count();
  $('usageStatus').textContent=n?`最近 30 天有 ${n} 筆紀錄`:'目前沒有紀錄';
  const b=$('btnClearUsage'); b.textContent='清除使用習慣'; b.dataset.confirm=''; b.hidden=!n;
}
$('btnClearUsage').onclick=()=>{
  const b=$('btnClearUsage');
  if(b.dataset.confirm!=='1'){b.dataset.confirm='1'; b.textContent='確定清除'; return}
  usage.clear(); renderUsage();
};

/* 畫面風格：只有一款時不顯示這一區；選了馬上換，不必重新整理 */
function renderStyles(){
  const list=styleSetting.list(), cur=styleSetting.current();
  $('stylePanel').hidden=list.length<2;
  $('styleList').innerHTML=list.map(s=>`<label class="cand"><input type="radio" name="style" value="${esc(s.id)}"${s.id===cur?' checked':''}>
    <span><b>${esc(s.name)}</b><small>${esc(s.desc)}</small></span></label>`).join('');
}
$('styleList').onchange=e=>{const id=e.target.value; if(styleSetting.set(id)) styleSwitcher.show(id)};

/* 深淺色：自動（跟手機）／淺色／深色，選了馬上換；畫面與 3D 場景由 theme.js 通知 */
const THEMES=[['auto','自動'],['light','淺色'],['dark','深色']];
function renderTheme(){
  const cur=Theme.page.current(), now=Theme.page.systemDark()?'深色':'淺色';  /* 手機現在的設定＝選自動會是哪個 */
  $('themeSeg').innerHTML=THEMES.map(([m,name])=>`<button class="btn" type="button" data-mode="${m}" aria-pressed="${m===cur}">${m==='auto'?`${name}（手機：${now}）`:name}</button>`).join('');
}
$('themeSeg').onclick=e=>{const b=e.target.closest('button[data-mode]'); if(b&&Theme.page.set(b.dataset.mode)) renderTheme()};
Theme.page.onChange(renderTheme);

/* 生活圈：預設用最後新增那組的生活圈；換生活圈時站名要重新搜尋 */
function renderRegions(){
  const list=store.list(), def=list.length?list[list.length-1].region:Regions.DEFAULT;
  $('pRegion').innerHTML=Regions.LIST.map(r=>`<option value="${r.id}"${r.id===def?' selected':''}>${esc(r.name)}${r.note?'（'+esc(r.note)+'）':''}</option>`).join('');
}
renderRegions();
/* 搜尋站名（上車站、下車站各一組）：搜尋的狀態（結果、按鈕、上一次的關鍵字與生活圈）全部在站名搜尋 module（stops.js）；這裡只依它交出的資料畫選單與按鈕 */
const SEARCH_SIDES=['From','To'].map(k=>{
  const side={kw:'kw'+k,btn:'s'+k,sel:'sel'+k,row:'live'+k,liveBtn:'liveS'+k,queueStarted:false};
  /* 排隊時按鈕顯示等 N 秒，狀態列由 renderWaitNote 依 module 的說明畫 */
  side.search=Stops.createStopSearch({index:stopIndex,getRegion:()=>$('pRegion').value,waitText,onWait:()=>{
    renderSearchButtons(side); renderWaitNote(side.queueStarted); side.queueStarted=false;
  }});
  return side;
});
/* 狀態列的排隊說明只有這一個出口：取第一個有排隊說明的那側（module 交出的 waitNote），都沒有就清掉自己寫的說明。
   shownNote＝上一次這裡寫進狀態列的字。queueStarted＝這次是新開始的排隊，不論狀態列現在是什麼都寫；其餘時候（倒數、結束）只在狀態列還是自己寫的字時才動，免得把錯誤訊息蓋掉 */
let shownNote='';
function renderWaitNote(queueStarted){
  const st=$('addStatus');
  const note=SEARCH_SIDES.map(s=>s.search.waitNote()).find(t=>t)||'';
  if(note){
    if(queueStarted||st.textContent===shownNote) st.textContent=note;
    shownNote=note;
  }else{
    if(st.textContent===shownNote) st.textContent='';
    shownNote='';
  }
}
/* 選單：只在結果換了（搜尋回來、作廢）時重畫，等候秒數更新不動選單，免得選到一半被重設。提示項目（value 為 null）畫成 value=""、disabled */
function renderSearchMenu(side){
  const st=side.search.state(), sel=$(side.sel);
  sel.innerHTML=st?st.items.map(i=>i.value===null?`<option value="" disabled>${esc(i.text)}</option>`:`<option>${esc(i.text)}</option>`).join(''):'';
  sel.hidden=!st;
  renderSearchButtons(side);
}
/* 按鈕文字、能不能按、即時搜尋那一列要不要顯示 */
function renderSearchButtons(side){
  const b=side.search.buttons(), st=side.search.state();
  $(side.btn).textContent=b.general.text; $(side.btn).disabled=b.general.disabled;
  $(side.liveBtn).textContent=b.live.text; $(side.liveBtn).disabled=b.live.disabled;
  $(side.row).hidden=!(st&&st.liveShown);
}
async function runSearch(side,live){
  side.queueStarted=true;
  const p=live?side.search.live():side.search.search($(side.kw).value);
  renderSearchButtons(side); /* 搜尋已開始：按鈕顯示搜尋中、收起即時搜尋那一列 */
  try{
    const r=await p;
    renderWaitNote(false); /* 結束（含作廢）：清掉自己寫的排隊說明；另一側還在排隊就改顯示它的 */
    renderSearchMenu(side);
  }catch(e){ setErr(e); renderSearchButtons(side) } /* 出錯：錯誤訊息保留，不呼叫 renderWaitNote */
}
for(const side of SEARCH_SIDES){
  $(side.btn).onclick=()=>{ if(!$(side.kw).value.trim()||$(side.btn).disabled)return; runSearch(side,false) };
  $(side.liveBtn).onclick=()=>{ if($(side.liveBtn).disabled)return; runSearch(side,true) };
}
/* 生活圈變了（手動換、打開設定頁重設）：兩邊的搜尋全部作廢，選單與按鈕清掉，輸入框關鍵字保留；轉乘站候選與新增狀態也清掉 */
function resetRegion(){
  for(const side of SEARCH_SIDES){side.search.regionChanged(); renderSearchMenu(side)}
  $('viaPick').innerHTML=''; $('addStatus').textContent=''; shownNote='';
}
$('pRegion').onchange=resetRegion;

$('btnAdd').onclick=async()=>{
  const r=await pm.add({name:$('pName').value,region:$('pRegion').value,
    from:$('selFrom').hidden?'':$('selFrom').value,to:$('selTo').hidden?'':$('selTo').value},()=>{$('viaPick').innerHTML=''});
  if(r.changed) renderPairs();
  /* 沒有直達：列出轉乘站，選了才新增 */
  if(r.pick) renderPicker($('viaPick'),r.pick,c=>{if(pm.addWithVia(r.pick.input,c).changed) renderPairs()});
};

/* ---------- 啟動 ---------- */
/* 先決定要看哪一組，再送第一次查詢，避免先查錯的組合又切換而多花一次 */
autoPick(); renderChips(); updater.start();
function onBoard(){return document.visibilityState==='visible'&&$('settings').hidden}
document.addEventListener('pointerdown',()=>updater.touch(),{passive:true});
/* 心跳：每 5 秒更新倒數，時間到了才真的去查 TDX（由到站更新決定） */
setInterval(()=>{
  /* 有金鑰、而且在看板上才記使用時間 */
  if(onBoard()&&tdx.hasKey()){const p=curPair(); usage.viewTick(p&&p.id)}
  updater.tick();
},5000);
/* 離開超過 30 分鐘再回來，視為重新打開 App：到站更新回到第一段，這裡重新判斷要看哪一組 */
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'){updater.leave(); closeMenu(); return}
  resumeView();
  /* 自動選組合時 usage.chose 會重新計時並記下原因 */
  updater.back(()=>{const changed=autoPick(); renderChips(); return changed});
});
})();
