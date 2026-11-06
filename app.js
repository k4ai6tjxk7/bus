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
/* 找路線（直達、轉乘）全部交給 routes.js；它透過 TDX 查詢取得經過某站的路線 */
const finder=Routes.createFinder({routesThrough:(k,o)=>tdx.routesThrough(k,o)});
/* 何時查到站、查完存什麼、看第幾段全部交給到站更新（updater.js）；這裡只負責把畫面資料畫出來 */
const updater=Updater.createUpdater({store,finder,tdx,onChange:v=>render(v)});

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const waitText=Updater.waitText;

function curPair(){return store.current()}
/* 轉乘組合目前看第幾段（1 或 2），由到站更新決定；換組合、重新打開 App 都回到第一段 */
function viewPair(){return Board.legOf(curPair(),updater.leg())}
function showMsg(t){$('msg').textContent=t||''; $('msg').hidden=!t}

/* ---------- 使用習慣：記錄、猜常用組合、清除都交給 usage.js ---------- */
const usage=Usage.createUsage({storage:LS_ADAPTER,pairIds:()=>store.list().map(p=>p.id)});
/* 只在「打開 App」時呼叫，使用中不會突然跳組合。回傳是否換了組合 */
let why='last';
function autoPick(){
  const g=usage.guess();
  if(g){const before=(curPair()||{}).id; if(store.select(g)){why='guess'; return g!==before}}
  why='last'; return false;
}
/* 停留在同一組超過 20 秒才算真的有在看（規則在 usage.js） */
function viewStart(){const p=curPair(); usage.viewStart(p&&p.id)}

const CHECK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
function closeMenu(){$('pairMenu').hidden=true; $('pairBtn').setAttribute('aria-expanded','false')}
function renderChips(){
  const p=curPair(), leg=updater.leg();
  const list=store.list();
  $('pairBox').hidden=list.length<2;
  $('pairName').textContent=p?p.name:'';
  const tip=!LS.get('bus.tip',false);
  const w=tip?'點這裡切換其他組合':why==='guess'?'通常這個時間用這組':why==='last'?'上次使用':'';
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
  if(!store.select(id)) return;
  why='manual'; updater.select(id); viewStart();
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

/* 把看板內容畫出來；所有文字都在這裡跳脫。scene=true 才更新 3D 光點（倒數時 3D 自己會動） */
const EMPTY_TEXT={noBus:'目前沒有車',allExcluded:'可搭的路線都已排除',noRoutes:'找不到同時經過這兩站的路線'};
function etaHtml(e,cls,hero){
  return e.kind==='min'?`<div class="${cls}"><span class="n">${e.n}</span><span class="u">分</span></div>`
    :`<div class="${cls} word ${e.tone}${hero&&e.tone==='hot'?' blink':''}">${esc(e.text)}</div>`;
}
function renderBoard(b,scene){
  renderHidden();
  if(scene&&window.setBuses) window.setBuses(b.buses);
  if(b.state!=='ok'){
    $('hero').innerHTML=`<div class="board-empty">${esc(EMPTY_TEXT[b.state])}</div>`;$('list').hidden=true;$('otherTitle').hidden=true;return;
  }
  const h=b.hero;
  $('hero').innerHTML=`<div class="hero"><div style="min-width:0"><div class="hero-route ${h.eta.tone==='dim'?'dim':''}">${esc(h.name)}</div><div class="hero-sub">${esc(h.sub)}</div></div>${etaHtml(h.eta,'hero-eta',true)}</div>`;
  $('otherTitle').hidden=!b.rest.length; $('list').hidden=!b.rest.length;
  $('list').innerHTML=b.rest.map(x=>`<div class="row"><div class="rinfo"><div class="rname">${esc(x.name)}</div><div class="rsub">${esc(x.sub)}</div></div>${etaHtml(x.eta,'eta',false)}</div>`).join('');
}
/* 到站更新交來的畫面資料畫出來；狀態都在 updater.js，這裡不記 */
let drawn={pid:undefined,leg:undefined,stampAt:undefined};
function render(v){
  const pid=v.pair?v.pair.id:null;
  if(pid!==drawn.pid||v.leg!==drawn.leg){drawn.pid=pid; drawn.leg=v.leg; renderChips()}
  renderGuide(tdx.hasKey(),!!v.pair);
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
    const k=tdx.key(); $('cid').value=k.id; $('csec').value=k.secret; renderPairs(); renderUsage(); renderRegions(); $('viaPick').innerHTML='';
    const f=focusId&&$(focusId);
    if(f){f.scrollIntoView({block:'center'}); f.focus({preventScroll:true})} else window.scrollTo(0,0);
  } else {renderChips(); updater.setActive(true); viewStart()}
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
$('btnRefresh').onclick=()=>updater.refresh();

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
/* 轉乘站候選清單：選一個再按確定。onPick(候選) */
let pickSeq=0;
function renderPicker(el,cands,lead,confirm,onPick){
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
    store.remove(p.id);
    usage.forget(p.id); /* 這組的使用紀錄一起刪掉 */
    renderPairs(); renderUsage();
  }else if(b.dataset.act==='via'){
    b.textContent='尋找中…';
    try{
      const cands=await finder.transferOptions(p,addOpts);
      renderPairs();
      if(cands===null) return; /* 這次沒查到：畫面維持原樣 */
      const el=$('vp-'+p.id); if(!el) return;
      if(!cands.length){el.innerHTML='<div class="note">找不到只轉一次車的轉乘站。</div>'; return}
      renderPicker(el,cands,`${p.from} → ${p.to}：可以在下面這些站轉一次車`,c=>'改在'+c.via+'轉乘',c=>{
        store.setVia(p.id,c.via,c.routes1,c.routes2);
        renderPairs(); $('addStatus').textContent='';
      });
      el.scrollIntoView({block:'nearest'});
    }catch(err){setErr(err); renderPairs()}
  }else{
    b.textContent='尋找中…';
    try{
      const r=await finder.resolve(p,addOpts);
      if(r){ /* null＝這次沒查到：畫面維持原樣 */
        store.setRoutes(p.id,r.routes,r); $('addStatus').textContent='';
        if(!p.via&&!r.routes.length) $('addStatus').textContent=`「${p.name}」找不到直達的路線，可以按「找轉乘站」。`;
      }
    }
    catch(err){setErr(err)}
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

/* 生活圈：預設用最後新增那組的生活圈；換生活圈時站名要重新搜尋 */
function renderRegions(){
  const list=store.list(), def=list.length?list[list.length-1].region:Regions.DEFAULT;
  $('pRegion').innerHTML=Regions.LIST.map(r=>`<option value="${r.id}"${r.id===def?' selected':''}>${esc(r.name)}${r.note?'（'+esc(r.note)+'）':''}</option>`).join('');
}
renderRegions();
$('pRegion').onchange=()=>{
  for(const id of ['selFrom','selTo']){$(id).hidden=true; $(id).innerHTML=''}
  $('viaPick').innerHTML=''; $('addStatus').textContent='';
};
function bindSearch(btn,kw,sel){
  $(btn).onclick=async()=>{
    const k=$(kw).value.trim(); if(!k||$(btn).disabled)return;
    $(btn).textContent='搜尋中'; $(btn).disabled=true;
    try{
      const list=await tdx.searchStops(k,{region:$('pRegion').value,onWait:s=>{$(btn).textContent='等 '+s+' 秒'}}); /* 同生活圈同關鍵字只查一次 */
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
  const region=$('pRegion').value;
  $('viaPick').innerHTML='';
  $('addStatus').textContent='正在找出符合的路線…';
  try{
    const found=await finder.forNewPair(region,from,to,addOpts);
    if(!found){$('addStatus').textContent=''; return} /* 這次沒查到：畫面維持原樣 */
    const {direct:r,cands}=found;
    if(r.length||!cands.length){
      store.add(name,from,to,r,{region});
      $('addStatus').textContent=r.length?`已新增，找到 ${r.length} 條路線：${[...new Set(r.map(x=>x.name))].join('、')}。有不想搭的（例如比較繞），可以在上方這一組裡排除。`
        :'已新增，但目前找不到直達、也找不到只轉一次車的路線。';
      renderPairs(); return;
    }
    /* 沒有直達：列出轉乘站，選了才新增 */
    $('addStatus').textContent='';
    renderPicker($('viaPick'),cands,`${from} → ${to} 沒有直達的公車。可以在下面這些站轉一次車：`,c=>'用'+c.via+'轉乘，新增組合',c=>{
      try{
        store.add(name,from,to,c.routes1,{region,via:c.via,routes2:c.routes2});
        $('addStatus').textContent=`已新增轉乘組合：在${c.via}轉乘。看板會先顯示第一段，到了${c.via}再按「看下一段」。`;
        renderPairs();
      }catch(e){$('addStatus').textContent=e.message}
    });
  }catch(e){setErr(e)}
};

/* ---------- 啟動 ---------- */
/* 先決定要看哪一組，再送第一次查詢，避免先查錯的組合又切換而多花一次 */
autoPick(); renderChips(); updater.start(); viewStart();
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
  viewStart();
  updater.back(()=>{const changed=autoPick(); renderChips(); return changed});
});
