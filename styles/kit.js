'use strict';
/* ---------- 畫面風格共用零件 ----------
   原版以外的風格才會載入這個檔案（見 styles.js）。各風格檔只描述「長什麼樣子」，
   公車怎麼開、小人怎麼揮手、標籤怎麼擺，都由這裡的 styled() 統一處理。

   Scene.kit.styled(look) 回傳可以交給 Scene.register 的畫法。
     look(ctx) 在建立場景時被呼叫，ctx = {scene, mode:'light'|'dark', color(變數名, 預設色)}，回傳：
       person, armR, armL, head   小人與它的手臂、頭（chibi() 做好的）
       makeBus()                  做一台車 → {g, body, wheels, glow, setHot(是否將到站)}（bus() 做好的）
       scale                      小人的大小，用來擺「你在這」標籤
       camera(t, cam)             每一格怎麼擺鏡頭
       tick(t, dt)                其他會動的東西（雲、車流……），可省略
       shadows                    是否開即時陰影；pixel：用幾分之一的解析度畫（像素風）
   手機切換深淺色時整個場景重建一次。開啟「減少動態效果」時只在資料變動時畫一格。
   Scene.kit.css(id, 樣式)：風格檔的看板樣式，只插入一次。 */
(function(root){
  const THREE=root.THREE, Scene=root.Scene;
  if(!THREE||!Scene) return;

  /* 道路：和原版同一條路；STOP 是站牌，PERSON 是小人站的位置 */
  const PTS=[[-16,-72],[9,-48],[-7,-24],[3,-9],[0,0]];
  const curve=new THREE.CatmullRomCurve3(PTS.map(([x,z])=>new THREE.Vector3(x,0,z)));
  const roadCurve=new THREE.CatmullRomCurve3([...PTS,[-2.6,9]].map(([x,z])=>new THREE.Vector3(x,0,z)));
  const STOP=new THREE.Vector3(1.7,0,0.5), PERSON=new THREE.Vector3(2.5,0,0.9);
  const STOP_T=0.986;   /* 停靠時車頭停在站牌前 */
  const ARRIVING=60;    /* 剩 1 分鐘內就開到站牌前停下 */

  /* 沿路的帶狀平面（路面、標線）；off 是往路的一側偏移 */
  function ribbon(cv,w,y,ranges,n,off=0){
    const pos=[],idx=[];
    for(const [a,b] of ranges){
      const base=pos.length/3, seg=Math.max(1,Math.round(n*(b-a)));
      for(let i=0;i<=seg;i++){
        const u=a+(b-a)*i/seg, p=cv.getPointAt(u).clone(), d=cv.getTangentAt(u);
        p.x+=d.z*off; p.z-=d.x*off;
        pos.push(p.x+d.z*w/2,y,p.z-d.x*w/2, p.x-d.z*w/2,y,p.z+d.x*w/2);
        if(i<seg){const k=base+i*2; idx.push(k,k+1,k+2,k+1,k+3,k+2)}
      }
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /* 路邊第 u 處、離路 off 遠的位置 */
  function sidePos(u,off,side){u=Math.min(Math.max(u,0),1); const p=curve.getPointAt(u), d=curve.getTangentAt(u); return [p.x+d.z*off*side,p.z-d.x*off*side]}
  let glowT=null;
  function glowTex(){
    if(glowT) return glowT;
    const c=document.createElement('canvas'); c.width=c.height=64;
    const g=c.getContext('2d'), gr=g.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.25,'rgba(255,255,255,.75)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,64,64); return glowT=new THREE.CanvasTexture(c);
  }
  function glow(color,size,opacity){
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(),color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity}));
    s.scale.set(size,size,1); return s;
  }
  /* 描邊：把物件放大一點、反面塗色（不用後製特效） */
  function outliner(color){
    const m=new THREE.MeshBasicMaterial({color,side:THREE.BackSide});
    return (mesh,s=1.07)=>{const o=new THREE.Mesh(mesh.geometry,m); o.scale.setScalar(s); mesh.add(o); return mesh};
  }
  function roundBoxGeo(w,h,l,r){
    const s=new THREE.Shape(), x=-w/2, y=0;
    s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r); s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y);
    const g=new THREE.ExtrudeGeometry(s,{depth:l,bevelEnabled:false,curveSegments:5}); g.translate(0,-h/2,-l/2); return g;
  }

  /* Q 版小人：o = {mat(顏色)→材質, line(描邊，可省略), skin, shirt, pants, hair, eye} */
  function chibi(o){
    const L=o.line||(m=>m), mat=o.mat, person=new THREE.Group();
    const skin=mat(o.skin), shirt=mat(o.shirt), pants=mat(o.pants), hairM=mat(o.hair);
    const add=(m,x,y,z)=>{m.position.set(x,y,z); m.castShadow=true; L(m,1.08); person.add(m); return m};
    const leg=new THREE.CylinderGeometry(.09,.09,.42,8);
    add(new THREE.Mesh(leg,pants),.1,.21,0); add(new THREE.Mesh(leg,pants),-.1,.21,0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(.19,.25,.52,12),shirt),0,.66,0);
    const head=new THREE.Group(); head.position.set(0,1.2,0); person.add(head);
    const hm=new THREE.Mesh(new THREE.SphereGeometry(.34,18,14),skin); hm.castShadow=true; L(hm,1.06); head.add(hm);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.355,18,10,0,Math.PI*2,0,Math.PI*.55),hairM); hair.rotation.x=-.25; head.add(hair);
    const dot=new THREE.SphereGeometry(.045,8,6), eyeM=new THREE.MeshBasicMaterial({color:o.eye||'#1f2330'}), blushM=new THREE.MeshBasicMaterial({color:'#ff9a9a'});
    [[.12,-.01,.31,eyeM],[-.12,-.01,.31,eyeM],[.2,-.1,.26,blushM],[-.2,-.1,.26,blushM]].forEach(([x,y,z,m])=>{
      const e=new THREE.Mesh(dot,m); e.position.set(x,y,z); if(m===blushM) e.scale.set(1.2,.6,.5); head.add(e)});
    const arm=side=>{
      const g=new THREE.Group(); g.position.set(side*.24,.86,0);
      const a=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.4,8),shirt); a.position.y=-.2; a.castShadow=true; L(a,1.15); g.add(a);
      const h=new THREE.Mesh(new THREE.SphereGeometry(.085,10,8),skin); h.position.y=-.42; L(h,1.12); g.add(h);
      person.add(g); return g};
    const armR=arm(1), armL=arm(-1);
    person.scale.setScalar(o.scale||1.2); person.position.copy(PERSON);
    return {person,armR,armL,head};
  }

  /* 公車：o = {mat, line, round(圓角車身), colors:[一般, 將到站], glass, white, tire, lights(車燈亮度 0～1), extra(body,g)→{setHot}} */
  function bus(o){
    const L=o.line||(m=>m), mat=o.mat;
    const glassM=mat(o.glass), whiteM=mat(o.white), tireM=mat(o.tire), lampM=new THREE.MeshBasicMaterial({color:'#fff7d1'});
    const G={shell:o.round?roundBoxGeo(.92,.84,2.1,.24):new THREE.BoxGeometry(.92,.78,2.1),roof:new THREE.BoxGeometry(.84,.14,1.86),
      glass:new THREE.BoxGeometry(.95,.28,1.66),front:new THREE.BoxGeometry(.7,.32,.06),stripe:new THREE.BoxGeometry(.94,.07,2.12),
      wheel:new THREE.CylinderGeometry(.19,.19,.14,14),lamp:new THREE.SphereGeometry(.07,8,6)};
    return function makeBus(){
      const g=new THREE.Group(), body=new THREE.Group(); g.add(body);
      const paint=mat(o.colors[0]);
      const shell=L(new THREE.Mesh(G.shell,paint),1.05); shell.position.y=.6; body.add(shell);
      if(!o.round){const roof=L(new THREE.Mesh(G.roof,whiteM),1.08); roof.position.y=1.05; body.add(roof)}
      const gl=new THREE.Mesh(G.glass,glassM); gl.position.set(0,.76,-.1); body.add(gl);
      const fr=new THREE.Mesh(G.front,glassM); fr.position.set(0,.76,1.06); body.add(fr);
      const st=new THREE.Mesh(G.stripe,whiteM); st.position.y=.46; body.add(st);
      [.3,-.3].forEach(x=>{const l=new THREE.Mesh(G.lamp,lampM); l.position.set(x,.4,1.06); body.add(l)});
      const wheels=[]; [[.46,.66],[-.46,.66],[.46,-.66],[-.46,-.66]].forEach(([x,z])=>{
        const w=L(new THREE.Mesh(G.wheel,tireM),1.1); w.rotation.z=Math.PI/2; w.position.set(x,.19,z); g.add(w); wheels.push(w)});
      const lights=glow('#fff2b8',2.2,o.lights||0); lights.position.set(0,.45,1.6); g.add(lights);
      const extra=o.extra?o.extra(body,g):null;
      g.traverse(m=>{if(m.isMesh) m.castShadow=true});
      g.scale.setScalar(o.scale||1.25);
      return {g,body,wheels,setHot(h){paint.color.set(o.colors[h?1:0]); if(extra) extra.setHot(h)}};
    };
  }

  const wave=Scene.wave;

  function styled(look){
    return function({host,tagsEl,reduce,theme}){
      const stopTag=document.createElement('div'); stopTag.className='tag stop'; stopTag.textContent='你在這'; tagsEl.appendChild(stopTag);
      let W=null, given=[], givenAt=0;
      const start=()=>{W=world(); W.setBuses(given,givenAt)};
      const restyle=()=>{if(W) W.stop(); start()};
      const ro=window.ResizeObserver?new ResizeObserver(()=>W&&W.resize()):null;
      if(ro) ro.observe(host);

      function world(){
        const scene=new THREE.Scene(), cam=new THREE.PerspectiveCamera(40,1,.1,250);
        const color=(n,f)=>new THREE.Color(getComputedStyle(host).getPropertyValue(n).trim()||f);
        const sty=look({scene,mode:theme.isDark()?'dark':'light',color});
        const renderer=new THREE.WebGLRenderer({antialias:!sty.pixel,alpha:true});
        renderer.shadowMap.enabled=!!sty.shadows; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        host.prepend(renderer.domElement);
        if(sty.pixel) renderer.domElement.style.imageRendering='pixelated';
        scene.add(sty.person);
        let buses=[], last=performance.now();
        const v=new THREE.Vector3(), tan=new THREE.Vector3();

        function resize(){
          const w=host.clientWidth,h=host.clientHeight; if(!w||!h) return;
          const px=sty.pixel||1;
          renderer.setPixelRatio(px>1?1:Math.min(window.devicePixelRatio||1,2));
          renderer.setSize(Math.ceil(w/px),Math.ceil(h/px),false);
          cam.aspect=w/h; cam.updateProjectionMatrix();
          if(reduce) frame(performance.now());
        }
        function setBuses(list,at){
          const next=list.filter(b=>b.sec!=null).slice(0,6).map(b=>{
            let o=buses.find(x=>x.id===Scene.busId(b));
            if(!o){
              const obj=sty.makeBus(); scene.add(obj.g);
              const tag=document.createElement('div'); tag.className='tag'; tag.textContent=b.name; tagsEl.appendChild(tag);
              o={id:Scene.busId(b),name:b.name,obj,tag,t:Math.max(0,Scene.tOf(b.sec)-.2)};
            }
            o.sec=b.sec; o.at=at; o.hot=b.hot; o.obj.setHot(b.hot); o.tag.classList.toggle('is-hot',b.hot);
            return o;
          });
          buses.forEach(o=>{if(!next.includes(o)){scene.remove(o.obj.g); o.tag.remove()}});
          buses=next;
          if(reduce) frame(performance.now());
        }
        function place(el,pos,yOff){
          v.copy(pos); v.y+=yOff; v.project(cam);
          const w=host.clientWidth,h=host.clientHeight, vis=v.z<1&&v.x>-1.05&&v.x<1.05&&v.y<1;
          el.style.opacity=vis?1:0; el.style.left=((v.x+1)/2*w)+'px'; el.style.top=((1-v.y)/2*h)+'px';
        }
        function frame(now){
          const dt=Math.min(.1,(now-last)/1000); last=now;
          const t=reduce?0:now/1000, wall=Date.now();
          sty.camera(t,cam); cam.updateProjectionMatrix();
          const P=sty.person;
          place(stopTag,P.position,1.9*sty.scale);
          const placed=[{x:parseFloat(stopTag.style.left),y:parseFloat(stopTag.style.top),w:stopTag.offsetWidth||48}];
          for(const b of buses){
            const live=Math.max(0,b.sec-(wall-b.at)/1000);
            const target=live<=ARRIVING?STOP_T:Math.min(Scene.tOf(live),STOP_T), before=b.t;
            b.t=reduce?target:b.t+(target-b.t)*(1-Math.exp(-dt*1.1));
            const u=Math.min(Math.max(b.t,0),1), p=curve.getPointAt(u); curve.getTangentAt(u,tan);
            const g=b.obj.g; g.position.set(p.x+tan.z*.6,0,p.z-tan.x*.6); g.rotation.y=Math.atan2(tan.x,tan.z);
            const speed=Math.abs(b.t-before)*curve.getLength()/Math.max(dt,1e-3);
            b.obj.wheels.forEach(w=>w.rotation.x+=speed*dt/.2);
            b.obj.body.position.y=reduce?0:Math.abs(Math.sin(now/90+b.name.length))*Math.min(speed,3)*.012;
            place(b.tag,g.position,1.9);
            let x=parseFloat(b.tag.style.left), y=parseFloat(b.tag.style.top), w=b.tag.offsetWidth||40;
            for(let k=0;k<4;k++){const hit=placed.find(o=>Math.abs(o.x-x)<(o.w+w)/2+4&&Math.abs(o.y-y)<22); if(!hit)break; y=hit.y-24}
            b.tag.style.top=y+'px'; placed.push({x,y,w});
          }
          const state=!buses.length?'none':buses.some(b=>b.hot)?'arrive':'normal';
          const wv=reduce?{arm:.12,look:0}:wave(t,state), k=reduce?1:1-Math.exp(-dt*14);
          P.rotation.y=Math.atan2(cam.position.x-P.position.x,cam.position.z-P.position.z)*.8;
          if(!reduce){P.position.y=Math.sin(t*2.2)*.025; P.rotation.z=Math.sin(t*1.3)*.03}
          sty.armR.rotation.z+=(wv.arm-sty.armR.rotation.z)*k;
          sty.armL.rotation.z+=(-.12-sty.armL.rotation.z)*k;
          if(sty.head) sty.head.rotation.y+=(wv.look-sty.head.rotation.y)*(reduce?1:1-Math.exp(-dt*4));
          if(!reduce&&sty.tick) sty.tick(t,dt);
          renderer.render(scene,cam);
        }
        resize();
        if(reduce) frame(performance.now());
        else renderer.setAnimationLoop(()=>{if(document.visibilityState==='visible') frame(performance.now())});
        function stop(){
          renderer.setAnimationLoop(null);
          buses.forEach(b=>b.tag.remove());
          renderer.dispose(); renderer.domElement.remove();
        }
        return {setBuses,resize,stop};
      }

      start();
      return {
        setBuses(list){given=list; givenAt=Date.now(); W.setBuses(list,givenAt)},
        recolor:restyle,  /* 深淺色換了：整個場景用新的顏色重建，班次沿用 */
        dispose(){
          if(ro) ro.disconnect();
          W.stop(); stopTag.remove();
        }
      };
    };
  }

  function css(id,text){
    if(!document.getElementById('style-kit')){
      /* 看板頁的文字跟著風格的顏色走（body 的顏色是在 :root 算好的，不會跟著 #board 的變數變） */
      const b=document.createElement('style'); b.id='style-kit';
      b.textContent=':root[data-style] #board{color:var(--ink)}'; document.head.appendChild(b);
    }
    if(document.getElementById('style-'+id)) return;
    const s=document.createElement('style'); s.id='style-'+id; s.textContent=text; document.head.appendChild(s);
  }

  Scene.kit={THREE,curve,roadCurve,STOP,PERSON,ribbon,sidePos,glowTex,glow,outliner,roundBoxGeo,chibi,bus,wave,styled,css};
})(typeof window!=='undefined'?window:this);
