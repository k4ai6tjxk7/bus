'use strict';
/* 畫面風格「動漫」：卡通著色＋黑色描邊、藍天白雲、Q 版小人。深色模式是傍晚，路燈與車燈會亮。 */
(function(){
  const K=window.Scene&&window.Scene.kit; if(!K) return;
  const THREE=K.THREE;

  K.css('anime',`
:root[data-style="anime"] #board{--a-bg:#e6f4ff;--a-card:#ffffff;--a-ink:#1f2330;--a-muted:#5a6275;--a-line:#1f2330;--a-bus:#ffc83a;--a-hot:#ff6450;--a-mint:#2fb5a8;--sky1:#6ec3ff;--sky2:#dff3ff;
  --ink:var(--a-ink);--muted:var(--a-muted);--surface:var(--a-card);font-family:"Zen Maru Gothic",var(--f-body)}
@media (prefers-color-scheme:dark){:root[data-style="anime"] #board{--a-bg:#141830;--a-card:#232945;--a-ink:#f3f1ff;--a-muted:#a9acc9;--a-line:#080a16;--a-mint:#4fd1c3;--sky1:#161a45;--sky2:#6b4677}}
:root[data-style="anime"] body:has(#board:not([hidden])){background:#e6f4ff}
@media (prefers-color-scheme:dark){:root[data-style="anime"] body:has(#board:not([hidden])){background:#141830}}
:root[data-style="anime"] .board{background:var(--a-card);color:var(--a-ink);border:3px solid var(--a-line);border-radius:22px;box-shadow:5px 5px 0 var(--a-line);padding:0}
:root[data-style="anime"] .board::before,:root[data-style="anime"] .scene::after{display:none}
:root[data-style="anime"] .board-head{position:absolute;top:10px;left:10px;right:10px;z-index:2;letter-spacing:0;font-size:13px;font-weight:700}
:root[data-style="anime"] #boardTitle,:root[data-style="anime"] .live{background:var(--a-card);color:var(--a-ink);border:2.5px solid var(--a-line);border-radius:999px;padding:2px 11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:root[data-style="anime"] .scene{height:230px;margin:0;background:linear-gradient(var(--sky1),var(--sky2));border-bottom:3px solid var(--a-line)}
:root[data-style="anime"] #hero{padding:14px 16px 16px}
:root[data-style="anime"] .hero{margin-top:0}
:root[data-style="anime"] .hero-route{font-family:inherit;font-weight:900;font-size:30px;color:var(--a-ink);text-shadow:none;display:flex;align-items:center;gap:8px}
:root[data-style="anime"] .hero-route::before{content:"";flex:none;width:16px;height:16px;border-radius:50%;background:var(--a-bus);border:2.5px solid var(--a-line)}
:root[data-style="anime"] .hero:has(.hero-eta.hot) .hero-route::before{background:var(--a-hot)}
:root[data-style="anime"] .hero-route.dim{color:var(--a-muted)!important}
:root[data-style="anime"] .hero-sub{color:var(--a-muted);font-weight:700}
:root[data-style="anime"] .hero-eta{font-family:inherit;font-weight:900;color:var(--a-ink);text-shadow:none;position:relative;z-index:0}
:root[data-style="anime"] .hero-eta .n{font-size:72px;color:var(--a-bus);-webkit-text-stroke:2px var(--a-line);paint-order:stroke fill;text-shadow:4px 4px 0 var(--a-line)}
:root[data-style="anime"] .hero-eta .u{font-size:22px}
:root[data-style="anime"] .hero-eta.word{font-size:32px;padding:4px 2px}
:root[data-style="anime"] .hero-eta.hot{color:#fff!important;-webkit-text-stroke:2px var(--a-line);paint-order:stroke fill;text-shadow:3px 3px 0 var(--a-line)!important;padding:18px 14px}
:root[data-style="anime"] .hero-eta.hot::before{content:"";position:absolute;inset:-4px -8px;z-index:-1;background:var(--a-hot);
  clip-path:polygon(50% 0%,61% 18%,82% 8%,78% 30%,100% 32%,84% 50%,100% 68%,78% 70%,82% 92%,61% 82%,50% 100%,39% 82%,18% 92%,22% 70%,0% 68%,16% 50%,0% 32%,22% 30%,18% 8%,39% 18%)}
:root[data-style="anime"] .hero-eta.dim{color:var(--a-muted)!important}
:root[data-style="anime"] .board-empty{font-family:inherit;font-weight:700;color:var(--a-muted);padding:18px 16px}
:root[data-style="anime"] .tag{background:#fff;color:#1f2330;border:2px solid #1f2330;border-radius:999px;padding:1px 8px;font-family:"Zen Maru Gothic",var(--f-body);font-weight:900}
:root[data-style="anime"] .tag.is-hot{background:var(--a-hot);color:#fff}
:root[data-style="anime"] .tag.stop{background:var(--a-mint);color:#fff}
:root[data-style="anime"] .list{background:none;border:0;overflow:visible;display:flex;flex-direction:column;gap:10px}
:root[data-style="anime"] .row{background:var(--a-card);border:2.5px solid var(--a-line);border-radius:16px;box-shadow:3px 3px 0 var(--a-line);padding:10px 14px}
:root[data-style="anime"] .row:first-child{border-top:2.5px solid var(--a-line)}
:root[data-style="anime"] .rname{font-weight:900;font-size:18px}
:root[data-style="anime"] .eta{font-family:inherit;font-weight:900;background:var(--a-bus);color:#1f2330;border:2.5px solid var(--a-line);border-radius:12px;height:auto;min-width:76px;padding:4px 10px;align-items:baseline}
:root[data-style="anime"] .eta .n{font-size:22px}
:root[data-style="anime"] .eta.hot{background:var(--a-hot);color:#fff!important;text-shadow:none!important}
:root[data-style="anime"] .eta.dim{background:var(--a-card);color:var(--a-muted)!important}
:root[data-style="anime"] .sect .wait{width:76px}
`);

  Scene.register('anime',K.styled(function({scene,mode,color}){
    const dark=mode==='dark';
    const grad=new THREE.DataTexture(new Uint8Array([90,170,255]),3,1,THREE.LuminanceFormat);
    grad.minFilter=grad.magFilter=THREE.NearestFilter; grad.needsUpdate=true;
    const toon=c=>new THREE.MeshToonMaterial({color:c,gradientMap:grad});
    const line=K.outliner(dark?'#05060d':'#1f2330');
    scene.fog=new THREE.Fog(color('--sky2','#dff3ff'),38,95);

    scene.add(new THREE.HemisphereLight(dark?'#8a8fd6':'#ffffff',dark?'#2a2440':'#9fc48a',dark?.55:.75));
    const sun=new THREE.DirectionalLight(dark?'#c8b8ff':'#fff4dc',dark?.55:.85);
    sun.position.set(9,15,7); sun.target.position.set(0,0,-8); scene.add(sun,sun.target);
    sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-12,right:12,top:14,bottom:-16,near:1,far:50}); sun.shadow.bias=-.0006;

    const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),toon(dark?'#2c4a3e':'#9fd87c'));
    ground.rotation.x=-Math.PI/2; ground.position.z=-60; ground.receiveShadow=true; scene.add(ground);
    const road=new THREE.Mesh(K.ribbon(K.roadCurve,2.6,.02,[[0,1]],220),toon(dark?'#3c4250':'#7a8291'));
    road.receiveShadow=true; scene.add(road);
    const dashes=[]; for(let u=0;u<.97;u+=.022) dashes.push([u,u+.011]);
    scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,.14,.03,dashes,260),new THREE.MeshBasicMaterial({color:dark?'#c9c9a8':'#ffffff'})));

    /* 樹：沿路兩側，近處的投影 */
    const trunkG=new THREE.CylinderGeometry(.14,.18,1,6), leafG=new THREE.SphereGeometry(1,12,10);
    const trunkM=toon('#8a5a3c'), leafMs=[toon(dark?'#2f6b4f':'#4fb760'),toon(dark?'#3a7d55':'#7fcf5a')];
    [[.06,1],[.12,-1],[.2,1],[.27,-1],[.36,1],[.44,-1],[.53,1],[.6,-1],[.68,1],[.76,-1],[.84,1],[.9,-1]].forEach(([u,side],k)=>{
      const r=.9+(k%2)*.35, [x,z]=K.sidePos(u,3.4+(k%3)*.7,side);
      const tr=new THREE.Mesh(trunkG,trunkM); tr.position.set(x,.5,z); tr.castShadow=true;
      const lf=line(new THREE.Mesh(leafG,leafMs[k%2]),1.06); lf.scale.setScalar(r); lf.position.set(x,1+r*.9,z); lf.castShadow=z>-30;
      scene.add(tr,lf);
    });

    /* 雲 */
    const clouds=[], cloudM=toon(dark?'#7f7aa8':'#ffffff');
    [[-24,13,-70],[6,15,-85],[30,12,-62],[-6,17,-95]].forEach(([x,y,z],k)=>{
      const g=new THREE.Group();
      [[0,0,2.6],[2.4,-.4,2],[-2.4,-.5,1.9],[1,1.1,1.8]].forEach(([a,b,r])=>{const m=line(new THREE.Mesh(leafG,cloudM),1.05); m.scale.setScalar(r); m.position.set(a,b,0); g.add(m)});
      g.position.set(x,y,z); g.userData.vx=.5+k*.15; scene.add(g); clouds.push(g);
    });

    /* 路燈：傍晚會亮 */
    [.42,.58,.72,.86,.96].forEach(u=>{
      const [x,z]=K.sidePos(u,1.9,-1);
      const post=line(new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,2.6,6),toon('#4a5160')),1.25); post.position.set(x,1.3,z);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshBasicMaterial({color:dark?'#ffe3a1':'#d9dde4'})); head.position.set(x,2.65,z);
      scene.add(post,head);
      if(dark){const g=K.glow('#ffcf7a',2.4,.8); g.position.copy(head.position); scene.add(g)}
    });

    /* 站牌 */
    const sp=line(new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,2.3,8),toon('#d7dbe3')),1.25); sp.position.set(K.STOP.x,1.15,K.STOP.z); sp.castShadow=true;
    const sign=line(new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.1,20),toon('#2fb5a8')),1.08);
    sign.rotation.x=Math.PI/2; sign.position.set(K.STOP.x,2.35,K.STOP.z); scene.add(sp,sign);

    const kid=K.chibi({mat:toon,line,skin:'#ffd9b8',shirt:'#2fb5a8',pants:'#3b4766',hair:'#3b2a2a'});
    const makeBus=K.bus({mat:toon,line,colors:['#ffc83a','#ff6450'],glass:dark?'#ffe6a8':'#3a4a6a',white:'#ffffff',tire:'#2a2d36',lights:dark?.85:0});
    return {...kid,makeBus,scale:1.2,shadows:true,
      camera(t,cam){cam.fov=42; cam.position.set(4.6+Math.sin(t*.12)*1.4,4.3,9.6); cam.lookAt(-1.2,1,-18)},
      tick(t,dt){for(const c of clouds){c.position.x+=c.userData.vx*dt; if(c.position.x>45) c.position.x=-45}}};
  }));
})();
