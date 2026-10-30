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

const API='https://tdx.transportdata.tw/api/basic/v2/Bus';
const TOKEN_URL='https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const CITIES=['Taipei','NewTaipei'];
const $=id=>document.getElementById(id);
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
          set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

let cfg=LS.get('bus.cfg',{id:'',secret:''});
let pairs=LS.get('bus.pairs',[]);
let cur=LS.get('bus.cur',pairs[0]&&pairs[0].id);
let tok=LS.get('bus.tok',null);
let busy=false, pausedUntil=0, lastTouch=Date.now(), idlePaused=false;
const IDLE_MS=10*60000, BACKOFF_MS=65000;

const norm=s=>(s||'').replace(/\s/g,'').replace(/（/g,'(').replace(/）/g,')');
const core=s=>norm(s).split('(')[0];
const q=s=>String(s).replace(/'/g,"''");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- 查詢次數限制 ----------
   基礎會員每把金鑰每分鐘最多 5 次（含取 token）。這裡自己把關：任意 61 秒內最多 4 次，
   留 1 次餘裕。紀錄只存時間戳（不含任何金鑰資訊），放在 localStorage，
   重新整理或開多個分頁也會算在一起。 */
const RL_MAX=4, RL_WIN=61000;
function rlLoad(){
  const now=Date.now(), a=LS.get('bus.calls',[]);
  return Array.isArray(a)?a.filter(t=>typeof t==='number'&&t>now-RL_WIN&&t<=now+5000).sort((x,y)=>x-y):[];
}
function rlFree(){return Math.max(0,RL_MAX-rlLoad().length)}
let rlChain=Promise.resolve();
/* 取得一次查詢額度；額度用完就排隊等，onWait(秒數) 用來顯示還要等多久 */
function rlTake(onWait){
  const run=async()=>{
    for(;;){
      const a=rlLoad();
      if(a.length<RL_MAX){a.push(Date.now()); LS.set('bus.calls',a); return}
      const wait=Math.max(200,a[0]+RL_WIN-Date.now()+100);
      if(onWait) onWait(Math.ceil(wait/1000));
      await sleep(Math.min(wait,1000));
    }
  };
  const p=rlChain.then(run); rlChain=p.catch(()=>{}); return p;
}
/* 收到 429：把這一分鐘的額度視為用完 */
function rlFill(){const now=Date.now(); LS.set('bus.calls',Array(RL_MAX).fill(now))}
function rateErr(){const e=new Error('RATE'); e.rate=true; return e}
function errText(e){
  if(e.message==='NOKEY') return '請先到設定填入金鑰。';
  if(e.rate) return 'TDX 暫時限制這組金鑰的查詢次數（每分鐘最多 5 次），約 1 分鐘後再試。';
  return e.message;
}

/* ---------- TDX ---------- */
function tokValid(){return !!(tok&&typeof tok.v==='string'&&tok.exp>Date.now()+60000)}
async function getToken(force,onWait){
  if(!force&&tokValid()) return tok.v;
  if(!cfg.id||!cfg.secret) throw new Error('NOKEY');
  await rlTake(onWait);
  let r;
  try{
    r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'client_credentials',client_id:cfg.id,client_secret:cfg.secret})});
  }catch(e){throw new Error('連不上 TDX，請確認網路後再試。')}
  if(r.status===429){rlFill(); throw rateErr()}
  if(!r.ok) throw new Error('金鑰驗證失敗（HTTP '+r.status+'），請確認 Client ID 和 Secret。');
  const j=await r.json();
  if(!j||typeof j.access_token!=='string') throw new Error('金鑰驗證失敗，TDX 回傳格式不正確。');
  /* token 效期 24 小時，提早 1 小時重取 */
  const life=Math.max(300,Math.min(+j.expires_in||3600,86400)-3600);
  tok={v:j.access_token,exp:Date.now()+life*1000}; LS.set('bus.tok',tok);
  return tok.v;
}
async function api(path,params,onWait){
  const qs=Object.entries(Object.assign({},params,{$format:'JSON'})).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  let renewed=false;
  for(let i=0;i<2;i++){
    const t=await getToken(renewed,onWait);
    await rlTake(onWait);
    let r;
    try{r=await fetch(API+path+'?'+qs,{headers:{Authorization:'Bearer '+t}})}
    catch(e){throw new Error('連不上 TDX，請確認網路後再試。')}
    if(r.status===401&&!renewed){renewed=true; tok=null; LS.set('bus.tok',null); continue}
    if(r.status===429){rlFill(); throw rateErr()}
    if(!r.ok){
      let body=''; try{body=(await r.text()).slice(0,200)}catch(e){}
      throw new Error('資料查詢失敗（HTTP '+r.status+'）'+(body?'：'+body:''));
    }
    return r.json();
  }
  throw new Error('金鑰驗證失敗，請到設定重新儲存。');
}
/* 自動更新需要幾次額度（不夠就跳過這輪，不和手動操作搶） */
function callsNeeded(p){
  let n=tokValid()?0:1;
  if(!p.routes||!p.resolvedAt||Date.now()-p.resolvedAt>7*864e5) n+=CITIES.length;
  n+=p.routes?new Set(p.routes.map(r=>r.city)).size:CITIES.length;
  return n;
}

/* 找出先經過上車站、再經過下車站（同方向）的路線 */
async function resolve(p,onWait){
  const seen={};
  for(const city of CITIES){
    const data=await api('/StopOfRoute/City/'+city,{$filter:`Stops/any(s: contains(s/StopName/Zh_tw,'${q(core(p.from))}'))`,
      $select:'RouteUID,RouteName,Direction,Stops'},onWait);
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

async function loadEta(p,onWait){
  const byCity={};
  p.routes.forEach(r=>{if(CITIES.includes(r.city))(byCity[r.city]=byCity[r.city]||new Set()).add(r.stop)});
  const rows=[];
  for(const city of Object.keys(byCity)){
    const f=[...byCity[city]].map(u=>`StopUID eq '${q(u)}'`).join(' or ');
    const data=await api('/EstimatedTimeOfArrival/City/'+city,{$filter:f,
      $select:'StopUID,RouteUID,Direction,StopStatus,EstimateTime,NextBusTime'},onWait);
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
  $('boardTitle').textContent=p?core(p.from)+' 下一班進站':'下一班進站';
  $('trip').innerHTML=p?`<div class="dot"></div><div><div class="lbl">上車</div><div class="stop">${esc(p.from)}</div></div>
    <div class="rail"></div><div></div>
    <div class="dot end"></div><div><div class="lbl">下車</div><div class="stop">${esc(p.to)}</div></div>`:'';
}
$('chips').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b)return; cur=b.dataset.id; LS.set('bus.cur',cur); renderChips(); $('hero').innerHTML='<div class="board-empty">載入中…</div>'; $('list').hidden=true; $('otherTitle').hidden=true; refresh()});

function renderRows(rows,to,scene){
  if(scene!==false&&window.setBuses) window.setBuses(rows.map(x=>{const d=x.d;
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

/* ---------- 本地倒數：兩次查詢之間，畫面自己扣秒數 ---------- */
let last=null; /* {pid,rows,to,at} 最後一次成功取得的到站資料 */
let lastTry=0; /* 最後一次嘗試自動/手動查詢的時間 */
function aged(rows,sec){
  return rows.map(x=>{
    const d=x.d;
    if(!d||d.StopStatus!==0||d.EstimateTime==null) return x;
    return {r:x.r,d:Object.assign({},d,{EstimateTime:Math.max(0,d.EstimateTime-sec)})};
  });
}
function tickCountdown(){
  const p=curPair();
  if(!last||!p||last.pid!==p.id) return;
  renderRows(aged(last.rows,(Date.now()-last.at)/1000),last.to,false);
  if(Date.now()-last.at>3*60000) $('live').classList.add('stale');
}
/* 依最近一班車決定多久查一次：3 分鐘內 30 秒、其他 60 秒、沒有即時資料 90 秒 */
function refreshDelay(){
  if(!last) return 30000;
  const el=(Date.now()-last.at)/1000;
  const live=last.rows.map(x=>x.d).filter(d=>d&&d.StopStatus===0&&d.EstimateTime!=null).map(d=>d.EstimateTime-el);
  if(!live.length) return 90000;
  return Math.min(...live)<=180?30000:60000;
}

/* 示範資料：尚未填金鑰時顯示，讓畫面不是空的 */
function demo(p){
  const now=Date.now();
  const mk=(name,hops,d)=>({r:{name,hops},d});
  renderRows([
    mk('307',7,{StopStatus:0,EstimateTime:420}),
    mk('紅2',6,{StopStatus:0,EstimateTime:110}),
    mk('262',7,{StopStatus:0,EstimateTime:960}),
    mk('小2',9,{StopStatus:1,NextBusTime:new Date(now+40*60000).toISOString()})
  ].sort((a,b)=>rank(a.d)-rank(b.d)),p?p.to:'下車站');
  $('demoNote').hidden=false; $('stamp').textContent='示範'; $('live').classList.add('stale');
}

/* auto=true：自動更新，額度不夠就跳過這輪；auto=false：使用者操作，額度不夠就排隊等 */
async function refresh(auto){
  const p=curPair(), hasKey=!!(cfg.id&&cfg.secret);
  renderGuide(hasKey,!!p);
  $('demoNote').hidden=true;
  if(!hasKey||!p){demo(p);return}
  if(busy) return;
  if(Date.now()<pausedUntil){
    if(!auto) showMsg('TDX 暫時限制這組金鑰的查詢次數，'+Math.ceil((pausedUntil-Date.now())/1000)+' 秒後自動恢復。畫面是最後一次的資料。');
    return;
  }
  if(auto&&rlFree()<Math.min(callsNeeded(p),RL_MAX)) return;
  busy=true; lastTry=Date.now(); $('btnRefresh').classList.add('spin');
  const onWait=s=>showMsg('為了不超過 TDX 每分鐘的查詢上限，約 '+s+' 秒後送出查詢…');
  try{
    if(!p.routes||!p.resolvedAt||Date.now()-p.resolvedAt>7*864e5){
      if(!last||last.pid!==p.id) $('hero').innerHTML='<div class="board-empty">正在找可搭的路線…</div>';
      await resolve(p,onWait);
    }
    if(!p.routes.length){last=null; $('hero').innerHTML='<div class="board-empty">找不到同時經過這兩站的路線</div>'; showMsg('請到設定確認站名，或按「重找路線」。'); return}
    const rows=await loadEta(p,onWait);
    if(curPair()!==p) return; /* 等待期間使用者切換了組合 */
    last={pid:p.id,rows,to:p.to,at:Date.now()};
    renderRows(rows,p.to); stamp(); showMsg('');
  }catch(e){
    if(e.rate){pausedUntil=Date.now()+BACKOFF_MS; showMsg('TDX 暫時限制這組金鑰的查詢次數，約 1 分鐘後自動恢復。畫面是最後一次的資料。')}
    else showMsg(errText(e));
    $('live').classList.add('stale');
  }finally{
    busy=false; $('btnRefresh').classList.remove('spin');
    if(curPair()!==p) lastTry=0; /* 讓下一次心跳馬上查新的組合 */
  }
}

/* ---------- 設定 ---------- */
function openSettings(on,focusId){
  $('board').hidden=on; $('settings').hidden=!on;
  if(on){
    $('cid').value=cfg.id; $('csec').value=cfg.secret; renderPairs();
    const f=focusId&&$(focusId);
    if(f){f.scrollIntoView({block:'center'}); f.focus({preventScroll:true})} else window.scrollTo(0,0);
  } else {renderChips(); refresh()}
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
      <div class="hint">可以存好幾組，例如「上班」「下班」，在看板上方切換。</div></div>`;
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
  cfg={id:$('cid').value.trim(),secret:$('csec').value.trim()}; LS.set('bus.cfg',cfg); tok=null; LS.set('bus.tok',null);
  $('keyStatus').textContent='測試中…';
  try{await getToken(true,s=>{$('keyStatus').textContent='等待查詢額度，約 '+s+' 秒…'}); $('keyStatus').textContent='✓ 金鑰可以用了'}
  catch(e){$('keyStatus').textContent=e.message==='NOKEY'?'請填入兩個欄位。':errText(e)}
};
const addWait=s=>{$('addStatus').textContent='為了不超過 TDX 每分鐘的查詢上限，約 '+s+' 秒後繼續…'};

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
    try{await resolve(p,addWait); $('addStatus').textContent=''; if(last&&last.pid===p.id) last=null}
    catch(err){$('addStatus').textContent=err.message==='NOKEY'?'請先儲存金鑰。':errText(err)}
    renderPairs();
  }
});

/* 同一個關鍵字這次打開頁面內只查一次，省查詢次數 */
const stopCache=new Map();
async function searchStops(kw,onWait){
  if(stopCache.has(kw)) return stopCache.get(kw);
  const names=new Set();
  for(const city of CITIES){
    const d=await api('/Stop/City/'+city,{$filter:`contains(StopName/Zh_tw,'${q(kw)}')`,$select:'StopName',$top:'300'},onWait);
    d.forEach(s=>{if(s&&s.StopName&&typeof s.StopName.Zh_tw==='string') names.add(s.StopName.Zh_tw)});
  }
  const list=[...names].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
  stopCache.set(kw,list);
  return list;
}
function bindSearch(btn,kw,sel){
  $(btn).onclick=async()=>{
    const k=$(kw).value.trim(); if(!k||$(btn).disabled)return;
    $(btn).textContent='搜尋中'; $(btn).disabled=true;
    try{
      const list=await searchStops(k,s=>{$(btn).textContent='等 '+s+' 秒'});
      $(sel).innerHTML=list.length?list.map(n=>`<option>${esc(n)}</option>`).join(''):'<option value="">找不到這個站名</option>';
      $(sel).hidden=false; $('addStatus').textContent='';
    }catch(e){$('addStatus').textContent=e.message==='NOKEY'?'請先儲存金鑰。':errText(e)}
    $(btn).textContent='搜尋'; $(btn).disabled=false;
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
    const r=await resolve(p,addWait);
    pairs.push(p); LS.set('bus.pairs',pairs);
    $('addStatus').textContent=r.length?`已新增，找到 ${r.length} 條路線：${[...new Set(r.map(x=>x.name))].join('、')}`:'已新增，但目前找不到同時經過這兩站的路線。';
    renderPairs();
  }catch(e){$('addStatus').textContent=e.message==='NOKEY'?'請先儲存金鑰。':errText(e)}
};

/* ---------- 啟動 ---------- */
renderChips(); refresh();
function onBoard(){return document.visibilityState==='visible'&&$('settings').hidden}
function wake(){
  lastTouch=Date.now();
  if(idlePaused){idlePaused=false; showMsg(''); if(onBoard()) refresh()}
}
document.addEventListener('pointerdown',wake,{passive:true});
/* 心跳：每 5 秒更新倒數，時間到了才真的去查 TDX */
function heartbeat(){
  if(!onBoard()) return;
  tickCountdown();
  if(Date.now()-lastTouch>IDLE_MS){
    if(!idlePaused){idlePaused=true; showMsg('已暫停自動更新，以節省查詢次數。點一下畫面就會繼續。'); $('live').classList.add('stale')}
    return;
  }
  if(Date.now()-lastTry>=refreshDelay()) refresh(true);
}
setInterval(heartbeat,5000);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible') return;
  lastTouch=Date.now();
  if(idlePaused){idlePaused=false; showMsg('')}
  /* 切回來時資料超過 20 秒才重查，其餘交給倒數 */
  if(onBoard()&&Date.now()-lastTry>20000) refresh(true); else tickCountdown();
});
