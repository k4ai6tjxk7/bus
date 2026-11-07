'use strict';
/* 畫面風格「微縮」：像擺在桌上的粉彩玩具小鎮，圓角公車，畫面上下緣微微模糊。深色模式是夜晚，窗戶會亮。 */
(function(){
  const K=window.Scene&&window.Scene.kit; if(!K) return;
  const THREE=K.THREE;

  K.css('mini',`
:root[data-style="mini"] #board{--m-card:#ffffff;--m-ink:#2c3a33;--m-muted:#6d7d73;--m-bus:#ffd36b;--m-hot:#ff8a73;--m-mint:#7cc6a4;--m-soft:rgba(60,80,70,.12);--m-chip:#eef3ea;--sky1:#cfe8f5;--sky2:#f3f7ee;
  --ink:var(--m-ink);--muted:var(--m-muted);--surface:var(--m-card)}
:root[data-theme="dark"][data-style="mini"] #board{--m-card:#1f2a33;--m-ink:#e7eef0;--m-muted:#93a3a9;--m-soft:rgba(0,0,0,.35);--m-chip:#151d24;--sky1:#1d2a44;--sky2:#3a4a5c}
:root[data-style="mini"] body:has(#board:not([hidden])){background:#eef3ea}
:root[data-theme="dark"][data-style="mini"] body:has(#board:not([hidden])){background:#151d24}
:root[data-style="mini"] .board{background:var(--m-card);color:var(--m-ink);border:0;border-radius:26px;box-shadow:0 10px 24px var(--m-soft);padding:0}
:root[data-style="mini"] .board::before,:root[data-style="mini"] .scene::after{display:none}
:root[data-style="mini"] .board-head{position:absolute;top:12px;left:14px;right:14px;z-index:2;letter-spacing:0;font-weight:700;color:#2c3a33}
:root[data-style="mini"] #boardTitle,:root[data-style="mini"] .live{background:rgba(255,255,255,.88);color:#2c3a33;border-radius:999px;padding:3px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:root[data-style="mini"] .scene{height:240px;margin:0;background:linear-gradient(var(--sky1),var(--sky2))}
:root[data-style="mini"] .scene::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;backdrop-filter:blur(2.5px);-webkit-backdrop-filter:blur(2.5px);
  -webkit-mask-image:linear-gradient(#000 0%,transparent 34%,transparent 88%,#000 100%);mask-image:linear-gradient(#000 0%,transparent 34%,transparent 88%,#000 100%)}
:root[data-style="mini"] .tags{z-index:2}
:root[data-style="mini"] #hero{padding:14px 18px 18px}
:root[data-style="mini"] .hero{margin-top:0;align-items:center}
:root[data-style="mini"] .hero-route{font-family:inherit;font-weight:700;font-size:28px;color:var(--m-ink);text-shadow:none}
:root[data-style="mini"] .hero-route.dim{color:var(--m-muted)!important}
:root[data-style="mini"] .hero-sub{color:var(--m-muted)}
:root[data-style="mini"] .hero-eta{font-family:inherit;font-weight:700;background:var(--m-bus);color:#2c3a33;text-shadow:none;border-radius:22px;padding:10px 16px 8px}
:root[data-style="mini"] .hero-eta .n{font-size:52px}
:root[data-style="mini"] .hero-eta .u{font-size:16px}
:root[data-style="mini"] .hero-eta.word{font-size:28px;padding:12px 16px}
:root[data-style="mini"] .hero-eta.hot{background:var(--m-hot);color:#fff!important;text-shadow:none!important}
:root[data-style="mini"] .hero-eta.dim{background:none;color:var(--m-muted)!important;font-size:20px}
:root[data-style="mini"] .board-empty{font-family:inherit;color:var(--m-muted);padding:18px}
:root[data-style="mini"] .tag{background:#fff;color:#2c3a33;border-radius:8px;box-shadow:0 2px 0 rgba(0,0,0,.15)}
:root[data-style="mini"] .tag::after{content:"";position:absolute;left:50%;bottom:-5px;width:2px;height:6px;background:#8a7a68;transform:translateX(-50%)}
:root[data-style="mini"] .tag.is-hot{background:var(--m-hot);color:#fff}
:root[data-style="mini"] .tag.stop{background:var(--m-mint);color:#fff}
:root[data-style="mini"] .list{background:none;border:0;overflow:visible;display:flex;flex-direction:column;gap:8px}
:root[data-style="mini"] .row,:root[data-style="mini"] .row:first-child{background:var(--m-card);border:0;border-radius:18px;padding:12px 16px;box-shadow:0 4px 12px var(--m-soft)}
:root[data-style="mini"] .eta{font-family:inherit;font-weight:700;background:var(--m-chip);color:var(--m-ink);border-radius:999px;height:auto;min-width:72px;padding:5px 12px;align-items:baseline}
:root[data-style="mini"] .eta .n{font-size:20px}
:root[data-style="mini"] .eta.hot{background:var(--m-hot);color:#fff!important;text-shadow:none!important}
:root[data-style="mini"] .eta.dim{color:var(--m-muted)!important}
:root[data-style="mini"] .sect .wait{width:72px}
`);

  Scene.register('mini',K.styled(function({scene,mode,color}){
    const dark=mode==='dark';
    const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.85,metalness:0});
    scene.fog=new THREE.Fog(color('--sky2','#f3f7ee'),70,160);
    scene.add(new THREE.HemisphereLight(dark?'#9fb4ff':'#ffffff',dark?'#2b3440':'#cfe0bf',dark?.55:.8));
    const sun=new THREE.DirectionalLight(dark?'#b9c8ff':'#fff1d6',dark?.45:.85);
    sun.position.set(10,18,8); sun.target.position.set(-1,0,-12); scene.add(sun,sun.target);
    sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-22,right:22,top:26,bottom:-26,near:1,far:70}); sun.shadow.bias=-.0008;

    const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),mat(dark?'#3b5446':'#bfe0a0'));
    ground.rotation.x=-Math.PI/2; ground.position.z=-60; ground.receiveShadow=true; scene.add(ground);
    const road=new THREE.Mesh(K.ribbon(K.roadCurve,2.6,.02,[[0,1]],220),mat(dark?'#5b6070':'#efe6d6')); road.receiveShadow=true; scene.add(road);
    const curbM=mat(dark?'#8a90a0':'#ffffff');
    [1,-1].forEach(s=>scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,.18,.05,[[0,1]],220,1.35*s),curbM)));

    /* 房子：粉彩方塊＋四角屋頂，夜晚窗戶亮 */
    const walls=['#f7c6c7','#c9e4f6','#fde3a7','#d6f0c9','#e5d4f2'], roofs=['#e07a6a','#5aa6a0','#c98bb9','#7a8fd6'];
    const baseG=new THREE.BoxGeometry(1.6,1.2,1.6), roofG=new THREE.ConeGeometry(1.3,.9,4), winG=new THREE.BoxGeometry(.32,.32,.04);
    const winM=new THREE.MeshBasicMaterial({color:dark?'#ffd98a':'#6f90ad'});
    for(let k=0,u=.06;u<.93;u+=.068,k++){
      if(u>.84&&k%2===0) continue;
      const side=k%2?1:-1, [x,z]=K.sidePos(u,4+(k%3)*.6,side), p=K.curve.getPointAt(u);
      const h=new THREE.Group(); h.position.set(x,0,z); h.rotation.y=Math.atan2(p.x-x,p.z-z);
      const b=new THREE.Mesh(baseG,mat(walls[k%5])); b.position.y=.6; b.castShadow=b.receiveShadow=true; h.add(b);
      const r=new THREE.Mesh(roofG,mat(roofs[k%4])); r.position.y=1.65; r.rotation.y=Math.PI/4; r.castShadow=true; h.add(r);
      [-.38,.38].forEach(wx=>{const w=new THREE.Mesh(winG,winM); w.position.set(wx,.72,.81); h.add(w)});
      scene.add(h);
    }
    const pineG=new THREE.ConeGeometry(.55,1.5,7), pineM=mat(dark?'#2f6a52':'#6dbb7a');
    for(let k=0,u=.1;u<.9;u+=.11,k++){const [x,z]=K.sidePos(u,2.4,k%2?-1:1); const t=new THREE.Mesh(pineG,pineM); t.position.set(x,.75,z); t.castShadow=true; scene.add(t)}

    /* 站牌＋長椅 */
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,2.2,10),mat('#d9dde4')); pole.position.set(K.STOP.x,1.1,K.STOP.z); pole.castShadow=true;
    const sign=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.12,24),mat('#7cc6a4')); sign.rotation.x=Math.PI/2; sign.position.set(K.STOP.x,2.25,K.STOP.z); sign.castShadow=true;
    const bench=new THREE.Mesh(K.roundBoxGeo(1.2,.16,.4,.06),mat('#b98a62')); bench.position.set(K.STOP.x+1.4,.45,K.STOP.z-.9); bench.rotation.y=Math.PI/2.4; bench.castShadow=true;
    scene.add(pole,sign,bench);

    const kid=K.chibi({mat,skin:'#ffd9b8',shirt:'#7cc6a4',pants:'#5b6b8c',hair:'#5a4636'});
    const makeBus=K.bus({mat,round:true,colors:['#ffd36b','#ff8a73'],glass:dark?'#ffe9b0':'#5c7d99',white:'#ffffff',tire:'#3a3f48',lights:dark?.8:0});
    return {...kid,makeBus,scale:1.2,shadows:true,
      camera(t,cam){cam.fov=30; cam.position.set(9+Math.sin(t*.1)*1.2,15,22); cam.lookAt(-2,0,-16)}};
  }));
})();
