'use strict';
/* ---------- 3D 場景 ----------
   看板上方的 3D 道路：每班車是一顆光點，依到站時間沿路駛向你的站牌。
   只負責畫，不知道到站更新、組合、TDX；app.js 把看板內容的 buses 交進來。

   createScene({host, tagsEl, THREE, reduce, style, theme}) 回傳 {setBuses(list), dispose()}
     host     放 canvas 的元素；沒有 WebGL、或這款畫法出錯時會被隱藏，看板照常運作（換風格時再顯示）
     tagsEl   放路線標籤（HTML）的元素
     reduce   是否開啟「減少動態效果」：只在資料變動時畫一格，不跑動畫
     style    畫面風格 id；沒有註冊過的風格一律畫原版
     theme    深淺色（theme.js 的 Theme.page）：isDark() 給畫法看，onChange 時叫畫法的 recolor；沒給就是淺色、不會切換
     list     [{key, name, sec, hot}]（Board.boardOf 的 buses）；key 是認車用的鍵（同名不同方向各畫一台），沒有 key 的班次用 name 認車
     dispose  換風格時收掉這個場景：停止動畫、移除 canvas 與標籤

   register(id, factory)：其他畫面風格的檔案載入時用它登記自己的畫法，
     factory 收到和 createScene 一樣的參數（theme 一定有），回傳 {setBuses, dispose}，可另加 recolor()：深淺色換了時重新上色。
   對外另有 tOf(秒數)：到站時間對應到路上的位置（0＝路的最遠端，1＝站牌）。
   wave(秒, 狀態)：其他風格裡小人的動作，狀態是 'arrive' 將到站、'normal' 有車、'none' 沒車；
     回傳 {arm: 右手舉多高（弧度，0.12 是放下）, look: 頭轉向路的那頭多少}。 */
(function(root){
  const T_MAX=1200; /* 20 分鐘以外的車都排在路的最遠端 */
  const tOf=sec=>1-Math.min(sec/T_MAX,1)*0.97;
  /* 小人的動作：將到站一直揮手；有車時每 5 秒揮一次（揮 1.5 秒）；沒車時不揮手、每 7 秒望向路的那頭一次 */
  const ARM_DOWN=.12;
  function wave(t,state){
    if(state==='arrive') return {arm:2.6+Math.sin(t*12)*.38,look:0};
    if(state==='none') return {arm:ARM_DOWN,look:(t%7<2.4)?-0.9:0};
    return {arm:(t%5)<1.5?2.6+Math.sin(t*11)*.38:ARM_DOWN,look:0};
  }
  /* 認車用的鍵：Board 給的 key（路線名稱＋方向）；沒給就用路線名稱 */
  const busId=b=>b.key!==undefined?b.key:b.name;
  const NONE={setBuses(){},dispose(){}};
  const LIGHT={isDark:()=>false,onChange:()=>()=>{}};
  const FACTORIES={};
  const register=(id,factory)=>{FACTORIES[id]=factory};

  function createScene(opts){
    const {host,THREE}=opts;
    if(!THREE){host.hidden=true;return NONE}
    const f=FACTORIES[opts.style]||FACTORIES.classic;
    host.hidden=false;  /* 上一款畫法出錯時隱藏過，換風格要再顯示 */
    const theme=opts.theme||LIGHT;
    let s;
    try{s=f(Object.assign({},opts,{theme}))}catch(e){host.hidden=true;return NONE}
    /* 深淺色換了：交給畫法重新上色。場景只聽 theme，不直接看系統 */
    const off=theme.onChange(()=>{if(s.recolor) try{s.recolor()}catch(e){}});
    return {setBuses:l=>s.setBuses(l),dispose(){off(); s.dispose()}};
  }

  /* 原版：點陣道路＋光點 */
  register('classic',function({host,tagsEl,THREE,reduce}){
    const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    let renderer;
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
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
    let pal={};
    function colors(){
      pal={led:new THREE.Color(css('--led')||'#ffb21e'),hot:new THREE.Color(css('--led-hot')||'#ff6b3d'),
           route:new THREE.Color(css('--route')||'#2a7a6f'),ink:new THREE.Color(css('--board-ink')||'#c9d3d8')};
      rMat.color=pal.route; ring.material.color=pal.route; pole.material.color=pal.route; gMat.color=pal.ink;
      buses.forEach(b=>{b.sprite.material.color=b.hot?pal.hot:pal.led});
    }
    function setBuses(list){
      const now=performance.now();
      const next=list.filter(b=>b.sec!=null).slice(0,6).map(b=>{
        const old=buses.find(o=>o.id===busId(b));
        let sp=old&&old.sprite, tag=old&&old.tag;
        if(!sp){sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); scene.add(sp)}
        if(!tag){tag=document.createElement('div'); tag.className='tag'; tagsEl.appendChild(tag)}
        tag.textContent=b.name; tag.classList.toggle('is-hot',b.hot);
        return {id:busId(b),name:b.name,sec:b.sec,hot:b.hot,at:now,t:old?old.t:Math.max(0,tOf(b.sec)-0.2),sprite:sp,tag};
      });
      buses.forEach(o=>{if(!next.some(n=>n.sprite===o.sprite)){scene.remove(o.sprite); o.tag.remove()}});
      buses=next; colors();
      if(reduce) frame(now);
    }

    /* 先宣告：開啟「減少動態效果」時，resize() 會立刻畫一格，用到這兩個變數 */
    const v=new THREE.Vector3();
    const stopPos=new THREE.Vector3(0,2.4,0);
    function resize(){const w=host.clientWidth,h=host.clientHeight; if(!w||!h)return; renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); if(reduce) frame(performance.now())}
    const ro=window.ResizeObserver?new ResizeObserver(resize):null;
    if(ro) ro.observe(host); else window.addEventListener('resize',resize);
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
    if(reduce) frame(performance.now());
    else renderer.setAnimationLoop(()=>{if(document.visibilityState==='visible') frame(performance.now())});
    function dispose(){
      renderer.setAnimationLoop(null);
      if(ro) ro.disconnect(); else window.removeEventListener('resize',resize);
      buses.forEach(b=>b.tag.remove()); stopTag.remove();
      renderer.dispose(); renderer.domElement.remove();
    }
    return {setBuses,dispose,recolor:colors};
  });

  const api={createScene,register,tOf,T_MAX,wave,busId};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Scene=api;
})(typeof window!=='undefined'?window:this);
