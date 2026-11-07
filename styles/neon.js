'use strict';
/* 畫面風格「霓虹」：城市夜景、發光招牌、對向車道的紅色尾燈。淺色模式改成黃昏。 */
(function(){
  const K=window.Scene&&window.Scene.kit; if(!K) return;
  const THREE=K.THREE;

  K.css('neon',`
:root[data-style="neon"] #board{--n-card:#100d22;--n-ink:#f2ecff;--n-muted:#8f86b3;--n-cyan:#3df2ff;--n-pink:#ff3d8b;--n-bus:#ffd23f;--n-glow:.9;--sky1:#05040c;--sky2:#2a1250;
  --ink:var(--n-ink);--muted:var(--n-muted);--surface:var(--n-card)}
:root[data-theme="light"][data-style="neon"] #board{--n-card:#36255a;--n-ink:#fff1ea;--n-muted:#c9b3d9;--n-glow:.55;--sky1:#3b2a6e;--sky2:#ff9566}
:root[data-style="neon"] body:has(#board:not([hidden])){background:#2a1d45}
:root[data-theme="dark"][data-style="neon"] body:has(#board:not([hidden])){background:#07060f}
:root[data-theme="light"][data-style="neon"] body:has(#board:not([hidden])) .top h1{color:#fff1ea}
:root[data-style="neon"] .board{background:var(--n-card);color:var(--n-ink);border:1px solid var(--n-cyan);border-radius:16px;padding:0;
  box-shadow:0 0 calc(18px*var(--n-glow)) rgba(61,242,255,.35),inset 0 0 12px rgba(61,242,255,.12)}
:root[data-style="neon"] .board::before,:root[data-style="neon"] .scene::after{display:none}
:root[data-style="neon"] .board-head{position:absolute;top:10px;left:14px;right:14px;z-index:2;color:var(--n-cyan);text-shadow:0 0 8px var(--n-cyan)}
:root[data-style="neon"] .live{color:var(--n-cyan)}
:root[data-style="neon"] .live i{background:var(--n-pink);box-shadow:0 0 8px var(--n-pink)}
:root[data-style="neon"] .scene{height:230px;margin:0;background:linear-gradient(var(--sky1),var(--sky2));border-bottom:1px solid rgba(61,242,255,.4)}
:root[data-style="neon"] #hero{padding:14px 18px 18px}
:root[data-style="neon"] .hero{margin-top:0}
:root[data-style="neon"] .hero-route{font-family:inherit;font-weight:700;font-size:30px;color:var(--n-cyan);text-shadow:0 0 12px var(--n-cyan)}
:root[data-style="neon"] .hero:has(.hero-eta.hot) .hero-route{color:var(--n-pink);text-shadow:0 0 12px var(--n-pink)}
:root[data-style="neon"] .hero-route.dim{color:var(--n-muted)!important;text-shadow:none!important}
:root[data-style="neon"] .hero-sub{color:var(--n-muted)}
:root[data-style="neon"] .hero-eta{font-family:inherit;font-weight:700;color:var(--n-bus);text-shadow:0 0 16px var(--n-bus)}
:root[data-style="neon"] .hero-eta .n{font-size:72px;font-style:italic}
:root[data-style="neon"] .hero-eta .u{font-size:18px}
:root[data-style="neon"] .hero-eta.word{font-size:34px;font-style:italic}
:root[data-style="neon"] .hero-eta.hot{color:#fff!important;text-shadow:0 0 6px #fff,0 0 18px var(--n-pink),0 0 32px var(--n-pink)!important;animation:neon-flick 2.4s infinite}
:root[data-style="neon"] .hero-eta.dim{color:var(--n-muted)!important;text-shadow:none!important;font-size:20px}
:root[data-style="neon"] .board-empty{font-family:inherit;color:var(--n-muted);padding:18px}
:root[data-style="neon"] .tag{background:rgba(7,6,15,.75);color:var(--n-bus);border:1px solid var(--n-bus);box-shadow:0 0 8px var(--n-bus);border-radius:4px}
:root[data-style="neon"] .tag.is-hot{color:var(--n-pink);border-color:var(--n-pink);box-shadow:0 0 10px var(--n-pink);background:rgba(7,6,15,.75)}
:root[data-style="neon"] .tag.stop{color:var(--n-cyan);border-color:var(--n-cyan);box-shadow:0 0 8px var(--n-cyan);background:rgba(7,6,15,.75)}
:root[data-style="neon"] .list{background:var(--n-card);border:1px solid rgba(255,61,139,.5);border-radius:16px;padding:2px 16px;box-shadow:0 0 calc(14px*var(--n-glow)) rgba(255,61,139,.2)}
:root[data-style="neon"] .row{padding:11px 0;border-top:1px solid rgba(143,134,179,.2)}
:root[data-style="neon"] .row:first-child{border-top:0}
:root[data-style="neon"] .eta{font-family:inherit;font-weight:700;background:none;color:var(--n-bus);text-shadow:0 0 8px var(--n-bus);height:auto;min-width:64px;padding:0}
:root[data-style="neon"] .eta .n{font-size:22px}
:root[data-style="neon"] .eta.hot{color:var(--n-pink)!important;text-shadow:0 0 8px var(--n-pink)!important}
:root[data-style="neon"] .eta.dim{color:var(--n-muted)!important;text-shadow:none!important}
:root[data-style="neon"] .sect .wait{width:64px}
@keyframes neon-flick{0%,92%,100%{opacity:1}94%{opacity:.4}96%{opacity:1}97%{opacity:.6}}
@media (prefers-reduced-motion:reduce){:root[data-style="neon"] .hero-eta.hot{animation:none}}
`);

  Scene.register('neon',K.styled(function({scene,mode,color}){
    const dusk=mode==='light';
    const mat=c=>new THREE.MeshLambertMaterial({color:c});
    const neon=c=>new THREE.MeshBasicMaterial({color:c});
    const CY='#3df2ff', PK='#ff3d8b';
    scene.fog=new THREE.Fog(color('--sky2','#2a1250'),30,90);
    scene.add(new THREE.HemisphereLight(dusk?'#ffb08a':'#7a6cff','#120d22',dusk?.6:.45));
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),mat(dusk?'#2a1f3d':'#0b0a16'));
    ground.rotation.x=-Math.PI/2; ground.position.z=-60; scene.add(ground);
    scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,2.8,.02,[[0,1]],200),mat(dusk?'#3a2d55':'#16132a')));
    [1,-1].forEach(s=>scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,.07,.03,[[0,1]],220,1.4*s),neon(CY))));
    const dashes=[]; for(let u=0;u<.97;u+=.024) dashes.push([u,u+.012]);
    scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,.08,.03,dashes,260),neon(PK)));

    /* 大樓：窗戶貼圖隨機亮燈，屋頂霓虹邊 */
    const c=document.createElement('canvas'); c.width=64; c.height=128; const g=c.getContext('2d');
    g.fillStyle='#0d0b1a'; g.fillRect(0,0,64,128);
    for(let y=4;y<124;y+=8)for(let x=4;x<60;x+=10){const r=Math.random(); g.fillStyle=r<.35?'#ffd98a':r<.45?'#7ef9ff':r<.5?'#ff9ac8':'#1b1830'; g.fillRect(x,y,6,4)}
    const bM=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),color:dusk?'#d8c8e8':'#ffffff'});
    for(let k=0,u=.04;u<.8;u+=.055,k++){
      const side=k%2?1:-1, off=5.2+(k%3)*.9, [x,z]=K.sidePos(u,off,side), h=4+((k*7)%9), w=2.4+(k%3)*.5;
      const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),bM); b.position.set(x,h/2,z); scene.add(b);
      const trim=new THREE.Mesh(new THREE.BoxGeometry(w+.12,.08,w+.12),neon(k%2?CY:PK)); trim.position.set(x,h,z); scene.add(trim);
      if(k%4===1){
        const col=k%8===1?PK:CY, [sx,sz]=K.sidePos(u,off-w/2-.1,side);
        const s=new THREE.Mesh(new THREE.BoxGeometry(.18,1.6,.7),neon(col)); s.position.set(sx,h*.55,sz);
        const gl=K.glow(col,3.2,.6); gl.position.copy(s.position); scene.add(s,gl);
      }
    }
    /* 對向車流：往遠處開的紅色尾燈 */
    const streaks=[0,1,2,3,4].map(k=>{
      const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
      const l=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#ff4d6d',transparent:true,blending:THREE.AdditiveBlending})); const h=K.glow('#ff4d6d',.9,.9);
      l.frustumCulled=false; scene.add(l,h); return {l,h,u:.98-k*.19,v:.035+k*.006};
    });
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,2.3,8),mat('#3b3560')); pole.position.set(K.STOP.x,1.15,K.STOP.z);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(.75,.5,.08),neon(CY)); sign.position.set(K.STOP.x,2.3,K.STOP.z); sign.rotation.y=.6;
    const sg=K.glow(CY,3,.7); sg.position.copy(sign.position); scene.add(pole,sign,sg);

    /* 小人：衣服自己帶一點光，暗處也看得清楚；背後一圈柔和的光 */
    const lit=c=>new THREE.MeshLambertMaterial({color:c,emissive:c,emissiveIntensity:.5});
    const kid=K.chibi({mat:lit,line:K.outliner('#ffb3dd'),skin:'#ffe1cf',shirt:'#8a6bff',pants:'#4a3f8c',hair:'#5a3a6e'});
    const halo=K.glow('#ff9ad0',3.2,dusk?.35:.5); halo.position.set(K.PERSON.x-.1,1.4,K.PERSON.z-.4); scene.add(halo);

    const makeBus=K.bus({mat,colors:['#26223d','#26223d'],glass:'#0d0b1a',white:'#3a3560',tire:'#0d0b1a',lights:.95,
      extra(body,g){
        const sm=neon('#ffd23f');
        [[.48,.3],[-.48,.3],[.48,1],[-.48,1]].forEach(([x,y])=>{const s=new THREE.Mesh(new THREE.BoxGeometry(.03,.05,2.08),sm); s.position.set(x,y,0); body.add(s)});
        const ring=K.glow('#ffd23f',2.6,.35); ring.position.y=.6; g.add(ring);
        const tail=K.glow('#ff2d55',1.1,.9); tail.position.set(0,.4,-1.15); g.add(tail);
        return {setHot(h){const c=h?PK:'#ffd23f'; sm.color.set(c); ring.material.color.set(c)}};
      }});
    return {...kid,makeBus,scale:1.2,
      camera(t,cam){cam.fov=42; cam.position.set(4.6+Math.sin(t*.12)*1.4,4.6,9.6); cam.lookAt(-1.2,1.4,-18)},
      tick(t,dt){
        for(const s of streaks){
          s.u-=s.v*dt; if(s.u<.03) s.u=.985;
          const a=K.roadCurve.getPointAt(s.u), b=K.roadCurve.getPointAt(Math.min(1,s.u+.03)), d=K.roadCurve.getTangentAt(s.u), ox=-d.z*.7, oz=d.x*.7;
          s.l.geometry.attributes.position.array.set([a.x+ox,.35,a.z+oz,b.x+ox,.35,b.z+oz]); s.l.geometry.attributes.position.needsUpdate=true;
          s.h.position.set(a.x+ox,.35,a.z+oz);
        }
      }};
  }));
})();
