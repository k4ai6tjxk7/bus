'use strict';
/* ---------- 3D 道路：每班車是一顆光點，依到站時間沿路駛向你的站牌 ---------- */
(function(){
  const host=document.getElementById('scene'), tagsEl=document.getElementById('tags');
  if(!window.THREE){host.hidden=true;return}
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}catch(e){host.hidden=true;return}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  host.prepend(renderer.domElement);
  const scene=new THREE.Scene();
  const cam=new THREE.PerspectiveCamera(40,1,0.1,200);

  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-16,0,-72),new THREE.Vector3(9,0,-48),new THREE.Vector3(-7,0,-24),
    new THREE.Vector3(3,0,-9),new THREE.Vector3(0,0,0)]);

  const c=document.createElement('canvas'); c.width=c.height=64;
  const g=c.getContext('2d'), gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.25,'rgba(255,255,255,.75)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  const tex=new THREE.CanvasTexture(c);

  /* 地面點陣，會緩慢起伏 */
  const GX=56,GZ=48,grid=new Float32Array(GX*GZ*3); let i=0;
  for(let x=0;x<GX;x++)for(let z=0;z<GZ;z++){grid[i++]=(x-GX/2)*1.5;grid[i++]=-0.6;grid[i++]=-z*1.7+8}
  const gGeo=new THREE.BufferGeometry(); gGeo.setAttribute('position',new THREE.BufferAttribute(grid,3));
  const gMat=new THREE.PointsMaterial({size:0.13,transparent:true,opacity:.32,depthWrite:false});
  scene.add(new THREE.Points(gGeo,gMat));

  /* 路線光點 */
  const N=240, rp=new Float32Array(N*3);
  for(let k=0;k<N;k++){const p=curve.getPointAt(k/(N-1)); rp[k*3]=p.x; rp[k*3+1]=0; rp[k*3+2]=p.z}
  const rGeo=new THREE.BufferGeometry(); rGeo.setAttribute('position',new THREE.BufferAttribute(rp,3));
  const rMat=new THREE.PointsMaterial({size:0.6,map:tex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  scene.add(new THREE.Points(rGeo,rMat));

  /* 你的站牌 */
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.7,0.95,40),new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true}));
  ring.rotation.x=-Math.PI/2; scene.add(ring);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,2.4,8),new THREE.MeshBasicMaterial()); pole.position.y=1.2; scene.add(pole);
  const stopTag=document.createElement('div'); stopTag.className='tag stop'; stopTag.textContent='你在這'; tagsEl.appendChild(stopTag);

  let buses=[];
  const T_MAX=1200; /* 20 分鐘以外的車都排在路的最遠端 */
  const tOf=sec=>1-Math.min(sec/T_MAX,1)*0.97;
  let pal={};
  function colors(){
    pal={led:new THREE.Color(css('--led')||'#ffb21e'),hot:new THREE.Color(css('--led-hot')||'#ff6b3d'),
         route:new THREE.Color(css('--route')||'#2a7a6f'),ink:new THREE.Color(css('--board-ink')||'#c9d3d8')};
    rMat.color=pal.route; ring.material.color=pal.route; pole.material.color=pal.route; gMat.color=pal.ink;
    buses.forEach(b=>{b.sprite.material.color=b.hot?pal.hot:pal.led});
  }
  window.setBuses=list=>{
    const now=performance.now();
    const next=list.filter(b=>b.sec!=null).slice(0,6).map(b=>{
      const old=buses.find(o=>o.name===b.name);
      let sp=old&&old.sprite, tag=old&&old.tag;
      if(!sp){sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); scene.add(sp)}
      if(!tag){tag=document.createElement('div'); tag.className='tag'; tagsEl.appendChild(tag)}
      tag.textContent=b.name; tag.classList.toggle('is-hot',b.hot);
      return {name:b.name,sec:b.sec,hot:b.hot,at:now,t:old?old.t:Math.max(0,tOf(b.sec)-0.2),sprite:sp,tag};
    });
    buses.forEach(o=>{if(!next.some(n=>n.sprite===o.sprite)){scene.remove(o.sprite); o.tag.remove()}});
    buses=next; colors();
    if(reduce) frame(now);
  };

  /* 先宣告：開啟「減少動態效果」時，resize() 會立刻畫一格，用到這兩個變數 */
  const v=new THREE.Vector3();
  const stopPos=new THREE.Vector3(0,2.4,0);
  function resize(){const w=host.clientWidth,h=host.clientHeight; if(!w||!h)return; renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); if(reduce) frame(performance.now())}
  if(window.ResizeObserver) new ResizeObserver(resize).observe(host); else window.addEventListener('resize',resize);
  resize();

  function place(el,pos,yOff){
    v.copy(pos); v.y+=yOff; v.project(cam);
    const w=host.clientWidth,h=host.clientHeight, vis=v.z<1&&v.x>-1.05&&v.x<1.05&&v.y<1;
    el.style.opacity=vis?1:0; el.style.left=((v.x+1)/2*w)+'px'; el.style.top=((1-v.y)/2*h)+'px';
  }
  function frame(now){
    const t=now/1000;
    cam.position.set(4+Math.sin(t*.15)*2.5,5.5+Math.sin(t*.2)*.4,9); cam.lookAt(-1,0,-18);
    const a=gGeo.attributes.position.array;
    for(let k=0;k<a.length;k+=3) a[k+1]=-0.6+Math.sin(a[k]*.25+t*1.2)*.18+Math.cos(a[k+2]*.2+t*.9)*.18;
    gGeo.attributes.position.needsUpdate=true;
    ring.scale.setScalar(1+Math.sin(t*3)*.08);
    const placed=[];
    for(const b of buses){
      const live=Math.max(0,b.sec-(now-b.at)/1000);
      b.t+=(tOf(live)-b.t)*(reduce?1:0.035);
      const p=curve.getPointAt(Math.min(Math.max(b.t,0),1)); b.sprite.position.set(p.x,0.5,p.z);
      const s=b.hot&&!reduce?2.5+Math.sin(t*6)*.5:2.3; b.sprite.scale.set(s,s,1);
      place(b.tag,b.sprite.position,0.7);
      let x=parseFloat(b.tag.style.left), y=parseFloat(b.tag.style.top), w=b.tag.offsetWidth||40;
      for(let k=0;k<4;k++){const hit=placed.find(o=>Math.abs(o.x-x)<(o.w+w)/2+4&&Math.abs(o.y-y)<22); if(!hit)break; y=hit.y-24}
      b.tag.style.top=y+'px'; placed.push({x,y,w});
    }
    place(stopTag,stopPos,0.2);
    renderer.render(scene,cam);
  }
  colors();
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',colors)}catch(e){}
  if(reduce) frame(performance.now());
  else renderer.setAnimationLoop(()=>{if(document.visibilityState==='visible') frame(performance.now())});
})();

const $=id=>document.getElementById(id);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
          set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

const LS_ADAPTER={get:k=>LS.get(k),set:(k,v)=>LS.set(k,v)};
/* 組合的讀寫、驗證全部交給組合儲存（pairs.js） */
const store=PairStore.createPairStore(LS_ADAPTER);
/* 和 TDX 打交道（金鑰、token、查詢額度、錯誤訊息）全部交給 TDX 查詢（tdx.js） */
const tdx=Tdx.createTdx({fetch:(u,o)=>fetch(u,o),storage:LS_ADAPTER});
let busy=false, lastTouch=Date.now(), idlePaused=false;
const IDLE_MS=10*60000;

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* 排隊等額度時的提示：limit 自己保留額度、paused 被 TDX 擋 */
const waitText=(s,why,then)=>why==='paused'?'TDX 暫時限制這組金鑰的查詢次數，約 '+s+' 秒後自動重試…'
  :'為了不超過 TDX 每分鐘的查詢上限，約 '+s+' 秒後'+(then||'送出查詢')+'…';

function curPair(){return store.current()}
function showMsg(t){$('msg').textContent=t||''; $('msg').hidden=!t}

/* ---------- 使用習慣：記下「什麼時間看哪一組」，開啟時自動切到常用的那組 ----------
   只存 [組合 id, 時間(取到分鐘)]，不存站名、位置或金鑰；只在這支手機的 localStorage。
   保留最近 30 天、最多 200 筆，所以不會越用越大。全部在本機計算，不呼叫 API。
   規則：最近 30 天、平日/假日分開、現在前後 1 小時內，用最多次的那組；至少 3 次且沒有平手才自動選。 */
const USAGE_KEY='bus.usage', USAGE_DAYS=30, USAGE_MAX=200, VIEW_MS=20000, SAME_GAP=20*60000, LEARN_MIN=3, LEARN_WIN=60;
function usageLoad(){
  const now=Date.now(), ids=new Set(store.list().map(p=>p.id)), a=LS.get(USAGE_KEY,[]);
  if(!Array.isArray(a)) return [];
  return a.filter(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'&&ids.has(x[0])&&
      typeof x[1]==='number'&&isFinite(x[1])&&x[1]>now-USAGE_DAYS*864e5&&x[1]<=now+60000)
    .sort((x,y)=>x[1]-y[1]).slice(-USAGE_MAX);
}
function usageAdd(id){
  const now=Date.now(), a=usageLoad();
  if(a.some(x=>x[0]===id&&now-x[1]<SAME_GAP)) return; /* 同一次使用只記一筆 */
  a.push([id,Math.floor(now/60000)*60000]);
  LS.set(USAGE_KEY,a.slice(-USAGE_MAX));
}
function usageGuess(){
  const a=usageLoad(); if(!a.length) return null;
  const weekend=d=>d.getDay()===0||d.getDay()===6, mins=d=>d.getHours()*60+d.getMinutes();
  const now=new Date(), nw=weekend(now), nm=mins(now), cnt={};
  for(const [id,ts] of a){
    const d=new Date(ts); if(weekend(d)!==nw) continue;
    let diff=Math.abs(mins(d)-nm); diff=Math.min(diff,1440-diff);
    if(diff<=LEARN_WIN) cnt[id]=(cnt[id]||0)+1;
  }
  const top=Object.entries(cnt).sort((x,y)=>y[1]-x[1]);
  if(!top.length||top[0][1]<LEARN_MIN||(top[1]&&top[1][1]===top[0][1])) return null;
  return top[0][0];
}
/* 只在「打開 App」時呼叫，使用中不會突然跳組合。回傳是否換了組合 */
let why='last';
function autoPick(){
  const g=usageGuess();
  if(g){const before=(curPair()||{}).id; if(store.select(g)){why='guess'; return g!==before}}
  why='last'; return false;
}
/* 停留在同一組超過 20 秒才算真的有在看 */
let view={id:null,since:0,done:false};
function viewStart(){const p=curPair(); view={id:p?p.id:null,since:Date.now(),done:false}}
function viewCheck(){
  const p=curPair();
  if(view.done||!p||p.id!==view.id||!tdx.hasKey()) return;
  if(Date.now()-view.since>=VIEW_MS){view.done=true; usageAdd(p.id)}
}

const CHECK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
function closeMenu(){$('pairMenu').hidden=true; $('pairBtn').setAttribute('aria-expanded','false')}
function renderChips(){
  const p=curPair();
  const list=store.list();
  $('pairBox').hidden=list.length<2;
  $('pairName').textContent=p?p.name:'';
  const tip=!LS.get('bus.tip',false);
  const w=tip?'點這裡切換其他組合':why==='guess'?'通常這個時間用這組':why==='last'?'上次使用':'';
  renderHidden(p);
  $('pairWhy').textContent=w; $('pairWhy').hidden=!w; $('pairWhy').classList.toggle('tip',tip);
  $('pairMenu').innerHTML=list.map(x=>{const on=p&&x.id===p.id;
    return `<button type="button" data-id="${esc(x.id)}" aria-current="${on}"><span class="mi"><span class="mn">${esc(x.name)}</span><span class="ms">${esc(x.from)} → ${esc(x.to)}</span></span>${on?CHECK:''}</button>`}).join('')
    +'<button type="button" class="manage" data-act="manage">新增或管理組合</button>';
  $('boardTitle').textContent=p?Tdx.stopCore(p.from)+' 下一班進站':'下一班進站';
  $('trip').innerHTML=p?`<div class="dot"></div><div><div class="lbl">上車</div><div class="stop">${esc(p.from)}</div></div>
    <div class="rail"></div><div></div>
    <div class="dot end"></div><div><div class="lbl">下車</div><div class="stop">${esc(p.to)}</div></div>`:'';
}
function loadPair(){$('hero').innerHTML='<div class="board-empty">載入中…</div>'; $('list').hidden=true; $('otherTitle').hidden=true; refresh(); viewStart()}
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
  if(!store.select(id)) return;
  why='manual'; renderChips(); loadPair();
});
document.addEventListener('click',e=>{if(!$('pairMenu').hidden&&!$('pairBox').contains(e.target)) closeMenu()});

/* ---------- 排除路線：每組各自設定「不搭的路線」，只在畫面上過濾，不影響查詢次數 ----------
   存在組合的 exclude 欄位（路線名稱陣列，選填）。驗證與上限由組合儲存負責。 */
function exOf(p){return p?p.exclude:[]}
function routeNames(p){return p&&Array.isArray(p.routes)?[...new Set(p.routes.map(r=>r.name))]:[]}
function hiddenCount(p){const ex=exOf(p); return routeNames(p).filter(n=>ex.includes(n)).length}
function renderHidden(p){
  const n=hiddenCount(p), el=$('hidNote');
  el.hidden=!n; el.textContent=n?`已隱藏 ${n} 條路線 · 修改`:'';
}
$('hidNote').addEventListener('click',()=>{const p=curPair(); if(p) openSettings(true,'ex-'+p.id)});

/* 把看板內容畫出來；所有文字都在這裡跳脫。scene=true 才更新 3D 光點（倒數時 3D 自己會動） */
const EMPTY_TEXT={noBus:'目前沒有車',allExcluded:'可搭的路線都已排除',noRoutes:'找不到同時經過這兩站的路線'};
function etaHtml(e,cls,hero){
  return e.kind==='min'?`<div class="${cls}"><span class="n">${e.n}</span><span class="u">分</span></div>`
    :`<div class="${cls} word ${e.tone}${hero&&e.tone==='hot'?' blink':''}">${esc(e.text)}</div>`;
}
function renderBoard(b,scene){
  renderHidden(curPair());
  if(scene&&window.setBuses) window.setBuses(b.buses);
  if(b.state!=='ok'){
    $('hero').innerHTML=`<div class="board-empty">${esc(EMPTY_TEXT[b.state])}</div>`;$('list').hidden=true;$('otherTitle').hidden=true;return;
  }
  const h=b.hero;
  $('hero').innerHTML=`<div class="hero"><div style="min-width:0"><div class="hero-route ${h.eta.tone==='dim'?'dim':''}">${esc(h.name)}</div><div class="hero-sub">${esc(h.sub)}</div></div>${etaHtml(h.eta,'hero-eta',true)}</div>`;
  $('otherTitle').hidden=!b.rest.length; $('list').hidden=!b.rest.length;
  $('list').innerHTML=b.rest.map(x=>`<div class="row"><div class="rinfo"><div class="rname">${esc(x.name)}</div><div class="rsub">${esc(x.sub)}</div></div>${etaHtml(x.eta,'eta',false)}</div>`).join('');
}
function stamp(){const n=new Date(); $('stamp').textContent=n.toLocaleTimeString('zh-TW',{hour12:false}); $('live').classList.remove('stale')}

/* ---------- 本地倒數：兩次查詢之間，畫面自己扣秒數（扣秒由看板內容負責） ---------- */
let last=null; /* {pid,rows,at} 最後一次成功取得的原始到站資料 */
let lastTry=0; /* 最後一次嘗試自動/手動查詢的時間 */
function lastBoard(){
  const p=last&&store.list().find(x=>x.id===last.pid);
  return p?Board.boardOf(p,last.rows,last.at,Date.now()):null;
}
function tickCountdown(){
  const p=curPair();
  if(!last||!p||last.pid!==p.id) return;
  const b=lastBoard(); if(!b) return;
  renderBoard(b,false);
  if(b.stale) $('live').classList.add('stale');
}
/* 依最近一班車決定多久查一次：3 分鐘內 30 秒、其他 60 秒、沒有即時資料 90 秒 */
function refreshDelay(){
  const b=lastBoard();
  return b?b.nextRefreshMs:30000;
}

/* 示範資料：尚未填金鑰時顯示，讓畫面不是空的 */
function demo(p){
  renderBoard(Board.demoBoard(p?p.to:'',Date.now()),true);
  $('demoNote').hidden=false; $('stamp').textContent='示範'; $('live').classList.add('stale');
}

/* auto=true：自動更新，額度不夠就跳過這輪；auto=false：使用者操作，額度不夠就排隊等 */
async function refresh(auto){
  let p=curPair(); const hasKey=tdx.hasKey();
  renderGuide(hasKey,!!p);
  $('demoNote').hidden=true;
  if(!hasKey||!p){demo(p);return}
  if(busy) return;
  const pid=p.id, stillHere=()=>(curPair()||{}).id===pid, prevTry=lastTry;
  busy=true; lastTry=Date.now(); $('btnRefresh').classList.add('spin');
  /* auto：額度不夠時 TDX 查詢回傳 null（這輪跳過），下一次心跳再試 */
  const opts={auto:!!auto,onWait:(s,why)=>showMsg(waitText(s,why))};
  const skipped=()=>{lastTry=prevTry};
  try{
    if(store.needsRoutes(pid)){
      if(!last||last.pid!==pid) $('hero').innerHTML='<div class="board-empty">正在找可搭的路線…</div>';
      const found=await tdx.findRoutes(p.from,p.to,opts);
      if(found===null) return skipped();
      p=store.setRoutes(pid,found);
      if(!p||!stillHere()) return; /* 等待期間組合被刪除或切換了 */
    }
    /* 找不到路線、或路線全部排除了：不用查到站，省一次查詢 */
    const pre=Board.boardOf(p,[],Date.now(),Date.now());
    if(pre.state==='noRoutes'){last=null; renderBoard(pre,false); showMsg('請到設定確認站名，或按「重找路線」。'); return}
    if(pre.state==='allExcluded'){last=null; renderBoard(pre,true); showMsg(''); return}
    const rows=await tdx.arrivals(p.routes,opts);
    if(rows===null) return skipped();
    if(!stillHere()) return; /* 等待期間使用者切換了組合 */
    const at=Date.now();
    last={pid,rows,at}; lastTry=at; /* 從拿到資料起算下次更新（排隊等很久時不會一查完又馬上再查） */
    renderBoard(Board.boardOf(curPair(),rows,at,at),true); stamp(); showMsg('');
  }catch(e){
    showMsg(e.message+(e.kind==='rate'?'畫面是最後一次的資料。':''));
    $('live').classList.add('stale');
  }finally{
    busy=false; $('btnRefresh').classList.remove('spin');
    if(!stillHere()) lastTry=0; /* 讓下一次心跳馬上查新的組合 */
  }
}

/* ---------- 設定 ---------- */
function openSettings(on,focusId){
  $('board').hidden=on; $('settings').hidden=!on; closeMenu();
  if(on){
    const k=tdx.key(); $('cid').value=k.id; $('csec').value=k.secret; renderPairs(); renderUsage();
    const f=focusId&&$(focusId);
    if(f){f.scrollIntoView({block:'center'}); f.focus({preventScroll:true})} else window.scrollTo(0,0);
  } else {renderChips(); refresh(); viewStart()}
}

/* ---------- 新手引導 ---------- */
const TDX_SITE='https://tdx.transportdata.tw/';
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
      <div>搜尋你要上車和下車的站名。程式會自動找出所有同方向、會經過這兩站的路線，不用一條一條查。</div>
      <button class="btn primary" type="button" id="gPair">新增上下車站</button>
      <div class="hint">可以存好幾組，例如「上班」「下班」。點看板上方的組合名稱就能切換，用幾次後會依時段自動打開常用的那組。</div></div>`;
  g.innerHTML=`<h2>三步驟開始使用</h2>
    <p class="lead">設定一次就好，之後打開就直接看到哪幾班車能到。</p>
    <ol class="steps">
      <li class="step ${st(1)}"><span class="num">${hasKey?'✓':'1'}</span><span class="step-t">申請 TDX 金鑰</span>${s1}</li>
      <li class="step ${st(2)}"><span class="num">${hasPair?'✓':'2'}</span><span class="step-t">新增上下車站</span>${s2}</li>
      <li class="step"><span class="num">3</span><span class="step-t">看即時到站</span></li>
    </ol>
    <div class="hint">小技巧：用 Safari 打開，點<b>分享</b> →<b>加入主畫面</b>，就能像 App 一樣一鍵打開。</div>`;
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
$('btnRefresh').onclick=()=>refresh();

$('btnSaveKey').onclick=async()=>{
  $('keyStatus').textContent='測試中…';
  try{
    await tdx.saveKey($('cid').value,$('csec').value,{onWait:(s,why)=>{$('keyStatus').textContent=why==='paused'?waitText(s,why):'等待查詢額度，約 '+s+' 秒…'}});
    $('keyStatus').textContent='✓ 金鑰可以用了';
  }catch(e){$('keyStatus').textContent=e.kind==='nokey'?'請填入兩個欄位。':e.message}
};
/* 設定頁的操作：等額度時的提示，以及「沒金鑰」換成設定頁的說法 */
const addOpts={onWait:(s,why)=>{$('addStatus').textContent=waitText(s,why,'繼續')}};
const setErr=e=>{$('addStatus').textContent=e.kind==='nokey'?'請先儲存金鑰。':e.message};

function renderPairs(){
  const list=store.list();
  $('pairList').innerHTML=list.length?list.map(p=>{
    const names=routeNames(p), ex=exOf(p);
    const exw=names.length?`<div class="exw" id="ex-${esc(p.id)}" tabindex="-1"><div class="small">不搭的路線：點一下排除，看板上就不會顯示（只影響這一組）</div>
      <div class="xchips">${names.map(n=>`<button type="button" class="xchip" data-act="ex" data-id="${esc(p.id)}" data-n="${esc(n)}" aria-pressed="${ex.includes(n)}">${esc(n)}</button>`).join('')}</div></div>`:'';
    return `<div class="pair"><div><b>${esc(p.name)}</b><div class="small">${esc(p.from)} → ${esc(p.to)}${p.routes?` · ${names.length} 條路線`:''}${ex.length&&names.length?`，已排除 ${hiddenCount(p)} 條`:''}</div></div>
    <div class="btns"><button class="btn" type="button" data-act="re" data-id="${esc(p.id)}">重找路線</button><button class="btn danger" type="button" data-act="del" data-id="${esc(p.id)}">刪除</button></div>${exw}</div>`}).join(''):'<div class="small">目前沒有組合。</div>';
}
$('pairList').addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b)return;
  const p=store.list().find(x=>x.id===b.dataset.id); if(!p)return;
  if(b.dataset.act==='ex'){
    store.toggleExclude(p.id,b.dataset.n);
    const y=window.scrollY; renderPairs(); window.scrollTo(0,y);
    return;
  }
  if(b.dataset.act==='del'){
    if(b.dataset.confirm!=='1'){b.dataset.confirm='1'; b.textContent='確定刪除'; return}
    store.remove(p.id);
    LS.set(USAGE_KEY,usageLoad()); /* 這組的使用紀錄一起刪掉 */
    renderPairs(); renderUsage();
  }else{
    b.textContent='尋找中…';
    try{store.setRoutes(p.id,await tdx.findRoutes(p.from,p.to,addOpts)); $('addStatus').textContent=''; if(last&&last.pid===p.id) last=null}
    catch(err){setErr(err)}
    renderPairs();
  }
});

function renderUsage(){
  const n=usageLoad().length;
  $('usageStatus').textContent=n?`最近 30 天有 ${n} 筆紀錄`:'目前沒有紀錄';
  const b=$('btnClearUsage'); b.textContent='清除使用習慣'; b.dataset.confirm=''; b.hidden=!n;
}
$('btnClearUsage').onclick=()=>{
  const b=$('btnClearUsage');
  if(b.dataset.confirm!=='1'){b.dataset.confirm='1'; b.textContent='確定清除'; return}
  LS.set(USAGE_KEY,[]); renderUsage();
};

function bindSearch(btn,kw,sel){
  $(btn).onclick=async()=>{
    const k=$(kw).value.trim(); if(!k||$(btn).disabled)return;
    $(btn).textContent='搜尋中'; $(btn).disabled=true;
    try{
      const list=await tdx.searchStops(k,{onWait:s=>{$(btn).textContent='等 '+s+' 秒'}}); /* 同關鍵字只查一次 */
      $(sel).innerHTML=list.length?list.map(n=>`<option>${esc(n)}</option>`).join(''):'<option value="">找不到這個站名</option>';
      $(sel).hidden=false; $('addStatus').textContent='';
    }catch(e){setErr(e)}
    $(btn).textContent='搜尋'; $(btn).disabled=false;
  };
}
bindSearch('sFrom','kwFrom','selFrom'); bindSearch('sTo','kwTo','selTo');

$('btnAdd').onclick=async()=>{
  const from=$('selFrom').hidden?'':$('selFrom').value, to=$('selTo').hidden?'':$('selTo').value;
  const name=$('pName').value.trim()||'組合 '+(store.list().length+1);
  if(!from||!to){$('addStatus').textContent='請先搜尋並選擇上車站和下車站。';return}
  if(store.list().length>=PairStore.PAIR_MAX){$('addStatus').textContent='最多只能存 '+PairStore.PAIR_MAX+' 組，請先刪除不用的組合。';return} /* 先擋，不浪費查詢 */
  $('addStatus').textContent='正在找出符合的路線…';
  try{
    const r=await tdx.findRoutes(from,to,addOpts);
    store.add(name,from,to,r);
    $('addStatus').textContent=r.length?`已新增，找到 ${r.length} 條路線：${[...new Set(r.map(x=>x.name))].join('、')}。有不想搭的（例如比較繞），可以在上方這一組裡排除。`:'已新增，但目前找不到同時經過這兩站的路線。';
    renderPairs();
  }catch(e){setErr(e)}
};

/* ---------- 啟動 ---------- */
/* 先決定要看哪一組，再送第一次查詢，避免先查錯的組合又切換而多花一次 */
autoPick(); renderChips(); refresh(); viewStart();
function onBoard(){return document.visibilityState==='visible'&&$('settings').hidden}
function wake(){
  lastTouch=Date.now();
  if(idlePaused){idlePaused=false; showMsg(''); if(onBoard()) refresh()}
}
document.addEventListener('pointerdown',wake,{passive:true});
/* 心跳：每 5 秒更新倒數，時間到了才真的去查 TDX */
function heartbeat(){
  if(!onBoard()) return;
  tickCountdown(); viewCheck();
  if(Date.now()-lastTouch>IDLE_MS){
    if(!idlePaused){idlePaused=true; showMsg('已暫停自動更新，以節省查詢次數。點一下畫面就會繼續。'); $('live').classList.add('stale')}
    return;
  }
  if(Date.now()-lastTry>=refreshDelay()) refresh(true);
}
setInterval(heartbeat,5000);
/* 離開超過 30 分鐘再回來，視為重新打開 App：重新判斷要看哪一組 */
const REOPEN_MS=30*60000;
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'){hiddenAt=Date.now(); closeMenu(); return}
  lastTouch=Date.now();
  if(idlePaused){idlePaused=false; showMsg('')}
  const reopened=hiddenAt&&Date.now()-hiddenAt>=REOPEN_MS; hiddenAt=0;
  viewStart();
  if(reopened&&$('settings').hidden){
    const changed=autoPick(); renderChips();
    if(changed){loadPair(); return}
  }
  /* 切回來時資料超過 20 秒才重查，其餘交給倒數 */
  if(onBoard()&&Date.now()-lastTry>20000) refresh(true); else tickCountdown();
});
