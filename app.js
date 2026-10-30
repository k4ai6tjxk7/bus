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

  function resize(){const w=host.clientWidth,h=host.clientHeight; if(!w||!h)return; renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); if(reduce) frame(performance.now())}
  if(window.ResizeObserver) new ResizeObserver(resize).observe(host); else window.addEventListener('resize',resize);
  resize();

  const v=new THREE.Vector3();
  function place(el,pos,yOff){
    v.copy(pos); v.y+=yOff; v.project(cam);
    const w=host.clientWidth,h=host.clientHeight, vis=v.z<1&&v.x>-1.05&&v.x<1.05&&v.y<1;
    el.style.opacity=vis?1:0; el.style.left=((v.x+1)/2*w)+'px'; el.style.top=((1-v.y)/2*h)+'px';
  }
  const stopPos=new THREE.Vector3(0,2.4,0);
  function frame(now){
    const t=now/1000;
    cam.position.set(4+Math.sin(t*.15)*2.5,5.5+Math.sin(t*.2)*.4,9); cam.lookAt(-1,0,-18);
    const a=gGeo.attributes.position.array;
    for(let k=0;k<a.length;k+=3) a[k+1]=-0.6+Math.sin(a[k]*.25+t*1.2)*.18+Math.cos(a[k+2]*.2+t*.9)*.18;
    gGeo.attributes.position.needsUpdate=true;
    ring.scale.setScalar(1+Math.sin(t*3)*.08);
    for(const b of buses){
      const live=Math.max(0,b.sec-(now-b.at)/1000);
      b.t+=(tOf(live)-b.t)*(reduce?1:0.035);
      const p=curve.getPointAt(Math.min(Math.max(b.t,0),1)); b.sprite.position.set(p.x,0.5,p.z);
      const s=b.hot&&!reduce?2.5+Math.sin(t*6)*.5:2.3; b.sprite.scale.set(s,s,1);
      place(b.tag,b.sprite.position,0.7);
    }
    place(stopTag,stopPos,0.2);
    renderer.render(scene,cam);
  }
  colors();
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',colors)}catch(e){}
  if(reduce) frame(performance.now());
  else renderer.setAnimationLoop(()=>{if(document.visibilityState==='visible') frame(performance.now())});
})();

const API='https://tdx.transportdata.tw/api/basic/v2/Bus';
const TOKEN_URL='https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const CITIES=['Taipei','NewTaipei'];
const $=id=>document.getElementById(id);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
          set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

let cfg=LS.get('bus.cfg',{id:'',secret:''});
let pairs=LS.get('bus.pairs',[{id:'p1',name:'下班',from:'捷運葫洲站(康寧大學)',to:'五分埤',routes:null}]);
let cur=LS.get('bus.cur',pairs[0]&&pairs[0].id);
let tok=LS.get('bus.tok',null);
let busy=false;

const norm=s=>(s||'').replace(/\s/g,'').replace(/（/g,'(').replace(/）/g,')');
const core=s=>norm(s).split('(')[0];
const q=s=>s.replace(/'/g,"''");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- TDX ---------- */
async function getToken(force){
  if(!force&&tok&&tok.exp>Date.now()+60000) return tok.v;
  if(!cfg.id||!cfg.secret) throw new Error('NOKEY');
  let r;
  try{
    r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'client_credentials',client_id:cfg.id,client_secret:cfg.secret})});
  }catch(e){throw new Error('連不上 TDX，請確認網路後再試。')}
  if(!r.ok) throw new Error('金鑰驗證失敗（HTTP '+r.status+'），請確認 Client ID 和 Secret。');
  const j=await r.json();
  tok={v:j.access_token,exp:Date.now()+(j.expires_in||3600)*1000}; LS.set('bus.tok',tok);
  return tok.v;
}
async function api(path,params){
  const qs=Object.entries(Object.assign({},params,{$format:'JSON'})).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  let renewed=false;
  for(let i=0;i<4;i++){
    const t=await getToken(renewed);
    let r;
    try{r=await fetch(API+path+'?'+qs,{headers:{Authorization:'Bearer '+t}})}
    catch(e){throw new Error('連不上 TDX，請確認網路後再試。')}
    if(r.status===401&&!renewed){renewed=true; continue}
    if(r.status===429&&i<3){await new Promise(ok=>setTimeout(ok,1500*(i+1))); continue}
    if(!r.ok){
      let body=''; try{body=(await r.text()).slice(0,200)}catch(e){}
      throw new Error((r.status===429?'TDX 回覆查詢太頻繁':'資料查詢失敗')+'（HTTP '+r.status+'）'+(body?'：'+body:''));
    }
    return r.json();
  }
  throw new Error('金鑰驗證失敗，請到設定重新儲存。');
}

/* 找出先經過上車站、再經過下車站（同方向）的路線 */
async function resolve(p){
  const seen={};
  for(const city of CITIES){
    const data=await api('/StopOfRoute/City/'+city,{$filter:`Stops/any(s: contains(s/StopName/Zh_tw,'${q(core(p.from))}'))`});
    for(const r of data){
      const st=r.Stops||[];
      const oi=st.findIndex(s=>norm(s.StopName.Zh_tw)===norm(p.from));
      if(oi<0) continue;
      const di=st.findIndex((s,i)=>i>oi&&norm(s.StopName.Zh_tw)===norm(p.to));
      if(di<0) continue;
      const key=city+r.RouteUID+r.Direction+st[oi].StopUID;
      const item={city,route:r.RouteUID,name:r.RouteName.Zh_tw,dir:r.Direction,stop:st[oi].StopUID,hops:di-oi};
      if(!seen[key]||seen[key].hops>item.hops) seen[key]=item;
    }
  }
  p.routes=Object.values(seen); p.resolvedAt=Date.now(); LS.set('bus.pairs',pairs);
  return p.routes;
}

async function loadEta(p){
  const byCity={};
  p.routes.forEach(r=>{(byCity[r.city]=byCity[r.city]||new Set()).add(r.stop)});
  const rows=[];
  for(const city of Object.keys(byCity)){
    const f=[...byCity[city]].map(u=>`StopUID eq '${u}'`).join(' or ');
    const data=await api('/EstimatedTimeOfArrival/City/'+city,{$filter:f});
    data.forEach(d=>rows.push(Object.assign(d,{_city:city})));
  }
  const names={};
  return p.routes.map(r=>{
    const m=rows.filter(d=>d._city===r.city&&d.StopUID===r.stop&&d.RouteUID===r.route&&d.Direction===r.dir);
    m.sort((a,b)=>rank(a)-rank(b));
    return {r,d:m[0]};
  }).filter(x=>{const k=x.r.name+x.r.dir; if(names[k])return false; names[k]=1; return true})
    .sort((a,b)=>rank(a.d)-rank(b.d));
}

/* ---------- 顯示 ---------- */
function rank(d){
  if(!d) return 9e9;
  if(d.StopStatus===0&&d.EstimateTime!=null) return d.EstimateTime;
  if(d.StopStatus===1) return 1e6+(d.NextBusTime?Date.parse(d.NextBusTime)/1e3%1e6:5e5);
  return 2e6+(d.StopStatus||0);
}
const hhmm=t=>{const x=new Date(t);return String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')};
/* 回傳 {kind:'min'|'word', n, text, tone:'hot'|'dim'|''} */
function etaOf(d){
  if(!d) return {kind:'word',text:'無資料',tone:'dim'};
  if(d.StopStatus===0&&d.EstimateTime!=null){
    const s=d.EstimateTime;
    if(s<60) return {kind:'word',text:'進站中',tone:'hot'};
    if(s<180) return {kind:'word',text:'將到站',tone:'hot'};
    return {kind:'min',n:Math.floor(s/60),tone:''};
  }
  if(d.StopStatus===1) return d.NextBusTime?{kind:'word',text:hhmm(d.NextBusTime),tone:''}:{kind:'word',text:'未發車',tone:'dim'};
  return {kind:'word',text:({2:'交管不停',3:'末班已過',4:'今日停駛'}[d.StopStatus]||'無資料'),tone:'dim'};
}
function subOf(x,to){
  let s=`坐 ${x.r.hops} 站到${esc(to)}`;
  if(x.d&&x.d.StopStatus===1&&x.d.NextBusTime) s='首站發車 '+hhmm(x.d.NextBusTime)+' · '+s;
  return s;
}

function curPair(){return pairs.find(p=>p.id===cur)||pairs[0]}
function showMsg(t){$('msg').textContent=t||''; $('msg').hidden=!t}

function renderChips(){
  $('chips').innerHTML=pairs.map(p=>`<button type="button" data-id="${p.id}" aria-pressed="${p.id===(curPair()||{}).id}">${esc(p.name)}</button>`).join('');
  $('chips').hidden=pairs.length<2;
  const p=curPair();
  $('trip').innerHTML=p?`<div class="dot"></div><div><div class="lbl">上車</div><div class="stop">${esc(p.from)}</div></div>
    <div class="rail"></div><div></div>
    <div class="dot end"></div><div><div class="lbl">下車</div><div class="stop">${esc(p.to)}</div></div>`:'';
}
$('chips').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b)return; cur=b.dataset.id; LS.set('bus.cur',cur); renderChips(); $('hero').innerHTML='<div class="board-empty">載入中…</div>'; $('list').hidden=true; $('otherTitle').hidden=true; refresh()});

function renderRows(rows,to){
  if(window.setBuses) window.setBuses(rows.map(x=>{const d=x.d;
    const sec=d&&d.StopStatus===0&&d.EstimateTime!=null?d.EstimateTime:null;
    return {name:x.r.name,sec,hot:sec!=null&&sec<180}}));
  if(!rows.length){$('hero').innerHTML='<div class="board-empty">目前沒有車</div>';$('list').hidden=true;$('otherTitle').hidden=true;return}
  const h=rows[0], e=etaOf(h.d);
  const etaHtml=e.kind==='min'?`<div class="hero-eta"><span class="n">${e.n}</span><span class="u">分</span></div>`
    :`<div class="hero-eta word ${e.tone} ${e.tone==='hot'?'blink':''}">${esc(e.text)}</div>`;
  $('hero').innerHTML=`<div class="hero"><div style="min-width:0"><div class="hero-route ${e.tone==='dim'?'dim':''}">${esc(h.r.name)}</div><div class="hero-sub">${subOf(h,to)}</div></div>${etaHtml}</div>`;
  const rest=rows.slice(1);
  $('otherTitle').hidden=!rest.length; $('list').hidden=!rest.length;
  $('list').innerHTML=rest.map(x=>{const e=etaOf(x.d);
    const eh=e.kind==='min'?`<div class="eta"><span class="n">${e.n}</span><span class="u">分</span></div>`
      :`<div class="eta word ${e.tone}">${esc(e.text)}</div>`;
    return `<div class="row"><div class="rinfo"><div class="rname">${esc(x.r.name)}</div><div class="rsub">${subOf(x,to)}</div></div>${eh}</div>`}).join('');
}
function stamp(){const n=new Date(); $('stamp').textContent=n.toLocaleTimeString('zh-TW',{hour12:false}); $('live').classList.remove('stale')}

/* 示範資料：尚未填金鑰時顯示，讓畫面不是空的 */
function demo(p){
  const now=Date.now();
  const mk=(name,hops,d)=>({r:{name,hops},d});
  renderRows([
    mk('內湖幹線',7,{StopStatus:0,EstimateTime:420}),
    mk('紅2',6,{StopStatus:0,EstimateTime:110}),
    mk('630',7,{StopStatus:0,EstimateTime:960}),
    mk('小1',9,{StopStatus:1,NextBusTime:new Date(now+40*60000).toISOString()})
  ].sort((a,b)=>rank(a.d)-rank(b.d)),p.to);
  $('demoNote').hidden=false; $('stamp').textContent='示範'; $('live').classList.add('stale');
}

async function refresh(){
  const p=curPair();
  $('demoNote').hidden=true;
  if(!p){$('hero').innerHTML='<div class="board-empty">請到設定新增起訖站</div>';return}
  if(!cfg.id||!cfg.secret){demo(p);return}
  if(busy) return; busy=true; $('btnRefresh').classList.add('spin');
  try{
    if(!p.routes||!p.resolvedAt||Date.now()-p.resolvedAt>7*864e5){$('hero').innerHTML='<div class="board-empty">正在找可搭的路線…</div>'; await resolve(p)}
    if(!p.routes.length){$('hero').innerHTML='<div class="board-empty">找不到同時經過這兩站的路線</div>'; showMsg('請到設定確認站名，或按「重找路線」。'); return}
    renderRows(await loadEta(p),p.to); stamp(); showMsg('');
  }catch(e){
    showMsg(e.message==='NOKEY'?'請先到設定填入金鑰。':e.message); $('live').classList.add('stale');
  }finally{busy=false; $('btnRefresh').classList.remove('spin')}
}

/* ---------- 設定 ---------- */
function openSettings(on){
  $('board').hidden=on; $('settings').hidden=!on;
  if(on){$('cid').value=cfg.id; $('csec').value=cfg.secret; renderPairs(); window.scrollTo(0,0)} else {renderChips(); refresh()}
}
$('btnSettings').onclick=()=>openSettings($('settings').hidden);
$('btnBack').onclick=()=>openSettings(false);
$('btnRefresh').onclick=()=>refresh();

$('btnSaveKey').onclick=async()=>{
  cfg={id:$('cid').value.trim(),secret:$('csec').value.trim()}; LS.set('bus.cfg',cfg); tok=null; LS.set('bus.tok',null);
  $('keyStatus').textContent='測試中…';
  try{await getToken(true); $('keyStatus').textContent='✓ 金鑰可以用了'}
  catch(e){$('keyStatus').textContent=e.message==='NOKEY'?'請填入兩個欄位。':e.message}
};

function renderPairs(){
  $('pairList').innerHTML=pairs.length?pairs.map(p=>`<div class="pair"><div><b>${esc(p.name)}</b><div class="small">${esc(p.from)} → ${esc(p.to)}${p.routes?` · ${p.routes.length} 條路線`:''}</div></div>
    <div class="btns"><button class="btn" type="button" data-act="re" data-id="${p.id}">重找路線</button><button class="btn danger" type="button" data-act="del" data-id="${p.id}">刪除</button></div></div>`).join(''):'<div class="small">目前沒有組合。</div>';
}
$('pairList').addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b)return;
  const p=pairs.find(x=>x.id===b.dataset.id); if(!p)return;
  if(b.dataset.act==='del'){
    if(b.dataset.confirm!=='1'){b.dataset.confirm='1'; b.textContent='確定刪除'; return}
    pairs=pairs.filter(x=>x!==p); LS.set('bus.pairs',pairs); if(cur===p.id){cur=pairs[0]&&pairs[0].id; LS.set('bus.cur',cur)} renderPairs();
  }else{
    b.textContent='尋找中…';
    try{await resolve(p)}catch(err){$('addStatus').textContent=err.message==='NOKEY'?'請先儲存金鑰。':err.message}
    renderPairs();
  }
});

async function searchStops(kw){
  const names=new Set();
  for(const city of CITIES){
    const d=await api('/Stop/City/'+city,{$filter:`contains(StopName/Zh_tw,'${q(kw)}')`,$select:'StopName',$top:'300'});
    d.forEach(s=>names.add(s.StopName.Zh_tw));
  }
  return [...names].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
}
function bindSearch(btn,kw,sel){
  $(btn).onclick=async()=>{
    const k=$(kw).value.trim(); if(!k)return;
    $(btn).textContent='搜尋中';
    try{
      const list=await searchStops(k);
      $(sel).innerHTML=list.length?list.map(n=>`<option>${esc(n)}</option>`).join(''):'<option value="">找不到這個站名</option>';
      $(sel).hidden=false;
    }catch(e){$('addStatus').textContent=e.message==='NOKEY'?'請先儲存金鑰。':e.message}
    $(btn).textContent='搜尋';
  };
}
bindSearch('sFrom','kwFrom','selFrom'); bindSearch('sTo','kwTo','selTo');

$('btnAdd').onclick=async()=>{
  const from=$('selFrom').hidden?'':$('selFrom').value, to=$('selTo').hidden?'':$('selTo').value;
  const name=$('pName').value.trim()||'組合 '+(pairs.length+1);
  if(!from||!to){$('addStatus').textContent='請先搜尋並選擇上車站和下車站。';return}
  const p={id:'p'+Date.now(),name,from,to,routes:null};
  $('addStatus').textContent='正在找出符合的路線…';
  try{
    const r=await resolve(p);
    pairs.push(p); LS.set('bus.pairs',pairs);
    $('addStatus').textContent=r.length?`已新增，找到 ${r.length} 條路線：${[...new Set(r.map(x=>x.name))].join('、')}`:'已新增，但目前找不到同時經過這兩站的路線。';
    renderPairs();
  }catch(e){$('addStatus').textContent=e.message==='NOKEY'?'請先儲存金鑰。':e.message}
};

/* ---------- 啟動 ---------- */
renderChips(); refresh();
setInterval(()=>{if(document.visibilityState==='visible'&&$('settings').hidden) refresh()},20000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&$('settings').hidden) refresh()});
