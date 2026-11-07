'use strict';
/* 畫面風格「像素」：像 16 位元電玩，3D 畫面用 1/3 解析度畫再放大，看板是 RPG 對話框。 */
(function(){
  const K=window.Scene&&window.Scene.kit; if(!K) return;
  const THREE=K.THREE;

  K.css('pixel',`
:root[data-style="pixel"] #board{--p-win:#29366f;--p-edge:#f4f4f4;--p-bgc:#1a1c2c;--p-ink:#f4f4f4;--p-muted:#94b0c2;--p-num:#ffcd75;--p-hot:#ef7d57;--sky1:#1a1c2c;--sky2:#3b5dc9;
  --ink:var(--p-ink);--muted:var(--p-muted);--surface:var(--p-win);font-family:var(--f-led)}
@media (prefers-color-scheme:light){:root[data-style="pixel"] #board{--p-win:#f4f4f4;--p-edge:#1a1c2c;--p-bgc:#94b0c2;--p-ink:#1a1c2c;--p-muted:#333c57;--p-num:#b86f50;--sky1:#41a6f6;--sky2:#73eff7;--ink:#1a1c2c;--muted:#333c57}}
:root[data-style="pixel"] body:has(#board:not([hidden])){background:#94b0c2}
@media (prefers-color-scheme:dark){:root[data-style="pixel"] body:has(#board:not([hidden])){background:#1a1c2c}}
:root[data-style="pixel"] .board,:root[data-style="pixel"] .list{background:var(--p-win);color:var(--p-ink);border:3px solid var(--p-edge);border-radius:2px;box-shadow:0 0 0 3px var(--p-bgc),0 0 0 6px var(--p-edge);margin:6px}
:root[data-style="pixel"] .board{padding:0}
:root[data-style="pixel"] .board::before,:root[data-style="pixel"] .scene::after{display:none}
:root[data-style="pixel"] .board-head{position:absolute;top:8px;left:10px;right:10px;z-index:2;color:#f4f4f4;text-shadow:2px 2px 0 #1a1c2c;letter-spacing:.06em}
:root[data-style="pixel"] .live{color:#f4f4f4}
:root[data-style="pixel"] .live i{border-radius:0;box-shadow:none}
:root[data-style="pixel"] .scene{height:220px;margin:0;border-bottom:3px solid var(--p-edge);
  background:linear-gradient(var(--sky1) 0 25%,color-mix(in srgb,var(--sky1),var(--sky2)) 25% 50%,var(--sky2) 50%)}
:root[data-style="pixel"] #hero{padding:12px 14px 14px}
:root[data-style="pixel"] .hero{margin-top:0}
:root[data-style="pixel"] .hero-route{color:var(--p-ink);text-shadow:none;font-size:30px}
:root[data-style="pixel"] .hero-route::before{content:"▶ "}
:root[data-style="pixel"] .hero-route.dim{color:var(--p-muted)!important}
:root[data-style="pixel"] .hero-sub{color:var(--p-muted)}
:root[data-style="pixel"] .hero-eta{color:var(--p-num);text-shadow:3px 3px 0 var(--p-bgc)}
:root[data-style="pixel"] .hero-eta .n{font-size:64px}
:root[data-style="pixel"] .hero-eta .u{font-size:18px}
:root[data-style="pixel"] .hero-eta.word{font-size:30px}
:root[data-style="pixel"] .hero-eta.hot{color:var(--p-hot)!important;text-shadow:3px 3px 0 var(--p-bgc)!important;animation:none}
:root[data-style="pixel"] .hero-eta.hot::after{content:"▼";display:block;font-size:14px;text-align:center}
/* 閃爍只在沒開「減少動態效果」時；資料太舊時狀態燈不閃（和原版一樣） */
@media (prefers-reduced-motion:no-preference){
  :root[data-style="pixel"] .live:not(.stale) i,:root[data-style="pixel"] .hero-eta.hot::after{animation:blink 1s steps(1) infinite}
}
:root[data-style="pixel"] .hero-eta.dim{color:var(--p-muted)!important;text-shadow:none!important;font-size:18px}
:root[data-style="pixel"] .board-empty{color:var(--p-muted);padding:16px 14px}
:root[data-style="pixel"] .tag{background:#1a1c2c;color:#f4f4f4;border:2px solid #f4f4f4;border-radius:0;font-family:var(--f-led);font-weight:400;padding:0 5px}
:root[data-style="pixel"] .tag.is-hot{background:#ef7d57}
:root[data-style="pixel"] .tag.stop{background:#38b764}
:root[data-style="pixel"] .list{padding:4px 12px}
:root[data-style="pixel"] .row,:root[data-style="pixel"] .row:first-child{border:0;padding:8px 0}
:root[data-style="pixel"] .rname{font-weight:400}
:root[data-style="pixel"] .rname::before{content:"・"}
:root[data-style="pixel"] .eta{background:none;color:var(--p-num);height:auto;min-width:64px;padding:0}
:root[data-style="pixel"] .eta .n{font-size:22px}
:root[data-style="pixel"] .eta.hot{color:var(--p-hot)!important;text-shadow:none!important}
:root[data-style="pixel"] .eta.dim{color:var(--p-muted)!important}
:root[data-style="pixel"] .sect{font-family:var(--f-led);margin-top:8px}
:root[data-style="pixel"] .sect .wait{width:64px}
`);

  Scene.register('pixel',K.styled(function({scene,mode,color}){
    const dark=mode==='dark';
    const grad=new THREE.DataTexture(new Uint8Array([120,255]),2,1,THREE.LuminanceFormat);
    grad.minFilter=grad.magFilter=THREE.NearestFilter; grad.needsUpdate=true;
    const mat=c=>new THREE.MeshToonMaterial({color:c,gradientMap:grad});
    const line=K.outliner('#1a1c2c');
    scene.fog=new THREE.Fog(color('--sky2','#73eff7'),40,95);
    scene.add(new THREE.HemisphereLight('#ffffff',dark?'#29366f':'#38b764',dark?.5:.7));
    const sun=new THREE.DirectionalLight('#ffffff',dark?.5:.8); sun.position.set(8,14,6); scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),mat(dark?'#257179':'#38b764'));
    ground.rotation.x=-Math.PI/2; ground.position.z=-60; scene.add(ground);
    scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,2.6,.02,[[0,1]],120),mat(dark?'#333c57':'#566c86')));
    const dashes=[]; for(let u=0;u<.97;u+=.026) dashes.push([u,u+.013]);
    scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,.16,.03,dashes,200),new THREE.MeshBasicMaterial({color:'#f4f4f4'})));

    /* 方塊樹 */
    const trunk=new THREE.BoxGeometry(.3,1,.3), leaf=new THREE.BoxGeometry(1.4,1.2,1.4), leaf2=new THREE.BoxGeometry(.9,.8,.9);
    const tM=mat('#5d275d'), lM=mat(dark?'#38b764':'#257179'), lM2=mat('#a7f070');
    for(let k=0,u=.05;u<.92;u+=.075,k++){
      const [x,z]=K.sidePos(u,3.3+(k%3)*.6,k%2?1:-1);
      const a=new THREE.Mesh(trunk,tM); a.position.set(x,.5,z);
      const b=line(new THREE.Mesh(leaf,lM),1.08); b.position.set(x,1.5,z);
      const c=line(new THREE.Mesh(leaf2,lM2),1.1); c.position.set(x,2.4,z);
      scene.add(a,b,c);
    }
    /* 方塊雲 */
    const clouds=[], cM=mat(dark?'#566c86':'#f4f4f4');
    [[-22,13,-70],[8,15,-82],[30,12,-62]].forEach(([x,y,z],k)=>{
      const g=new THREE.Group();
      [[0,0,4,1.6],[2.4,-.5,2.6,1.2],[-2.4,-.4,2.6,1.2]].forEach(([a,b,w,h])=>{const m=line(new THREE.Mesh(new THREE.BoxGeometry(w,h,2),cM),1.06); m.position.set(a,b,0); g.add(m)});
      g.position.set(x,y,z); g.userData.vx=.6+k*.2; scene.add(g); clouds.push(g);
    });
    const pole=line(new THREE.Mesh(new THREE.BoxGeometry(.14,2.3,.14),mat('#94b0c2')),1.2); pole.position.set(K.STOP.x,1.15,K.STOP.z);
    const sign=line(new THREE.Mesh(new THREE.BoxGeometry(.8,.6,.1),mat('#41a6f6')),1.1); sign.position.set(K.STOP.x,2.3,K.STOP.z); sign.rotation.y=.6;
    scene.add(pole,sign);

    const kid=K.chibi({mat,line,skin:'#ffcd9b',shirt:'#41a6f6',pants:'#29366f',hair:'#5d275d'});
    const makeBus=K.bus({mat,line,colors:['#ffcd75','#ef7d57'],glass:'#29366f',white:'#f4f4f4',tire:'#1a1c2c',lights:dark?.9:0});
    return {...kid,makeBus,scale:1.2,pixel:3,
      camera(t,cam){cam.fov=42; cam.position.set(4.6+Math.sin(t*.12)*1.4,4.3,9.6); cam.lookAt(-1.2,1,-18)},
      tick(t,dt){for(const c of clouds){c.position.x+=c.userData.vx*dt; if(c.position.x>45) c.position.x=-45}}};
  }));
})();
