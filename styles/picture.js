'use strict';
/* 畫面風格「繪本」：紙張紋理、手寫字、柔和的顏色，棒棒糖樹和小花。深色模式是夜晚的繪本，天上是月亮。 */
(function(){
  const K=window.Scene&&window.Scene.kit; if(!K) return;
  const THREE=K.THREE;

  /* 紙張紋理：一小塊隨機雜訊，平鋪在看板頁 */
  const c=document.createElement('canvas'); c.width=c.height=160;
  const g=c.getContext('2d'), d=g.createImageData(160,160);
  for(let i=0;i<d.data.length;i+=4){const v=225+Math.random()*30; d.data[i]=v; d.data[i+1]=v-4; d.data[i+2]=v-12; d.data[i+3]=255}
  g.putImageData(d,0,0);
  const grain=`url(${c.toDataURL()})`;

  K.css('picture',`
:root[data-style="picture"]{--w-grain:${grain}}
:root[data-style="picture"] #board{--w-paper:#f3ecdd;--w-card:#fbf6ec;--w-ink:#4a3b31;--w-muted:#8a7766;--w-line:#6b4f3f;--w-bus:#e9c46a;--w-hot:#e76f51;--w-mint:#7fb7a4;--sky1:#bcd9e4;--sky2:#f2ead8;
  --ink:var(--w-ink);--muted:var(--w-muted);--surface:var(--w-card);font-family:"LXGW WenKai TC",var(--f-body)}
@media (prefers-color-scheme:dark){:root[data-style="picture"] #board{--w-paper:#1f2840;--w-card:#28324d;--w-ink:#efe6d4;--w-muted:#b1a993;--w-line:#d8c9a8;--sky1:#1c2742;--sky2:#4a5577}}
:root[data-style="picture"] body:has(#board:not([hidden])){background:#f3ecdd var(--w-grain);background-blend-mode:multiply}
@media (prefers-color-scheme:dark){:root[data-style="picture"] body:has(#board:not([hidden])){background:#1f2840}}
:root[data-style="picture"] .board{background:var(--w-card);color:var(--w-ink);border:1.5px solid var(--w-line);border-radius:22px 26px 20px 28px/26px 20px 28px 22px;padding:0}
:root[data-style="picture"] .board::before{display:none}
:root[data-style="picture"] .board-head{position:absolute;top:10px;left:14px;right:14px;z-index:2;letter-spacing:0;font-size:14px}
:root[data-style="picture"] .board-head,:root[data-style="picture"] .live{color:#4a3b31}
@media (prefers-color-scheme:dark){:root[data-style="picture"] .board-head,:root[data-style="picture"] .live{color:#efe6d4}}
:root[data-style="picture"] .scene{height:230px;margin:0;border-bottom:1.5px dashed var(--w-line);
  background:radial-gradient(60% 40% at 25% 30%,rgba(255,255,255,.55),transparent 70%),radial-gradient(40% 30% at 80% 20%,rgba(255,240,210,.5),transparent 70%),linear-gradient(var(--sky1),var(--sky2))}
:root[data-style="picture"] .scene::after{inset:0;height:auto;background:var(--w-grain);mix-blend-mode:multiply;opacity:.5}
:root[data-style="picture"] #hero{padding:12px 18px 18px}
:root[data-style="picture"] .hero{margin-top:0}
:root[data-style="picture"] .hero-route{font-family:inherit;font-weight:700;font-size:32px;color:var(--w-ink);text-shadow:none}
:root[data-style="picture"] .hero-route.dim{color:var(--w-muted)!important}
:root[data-style="picture"] .hero-sub{color:var(--w-muted);font-size:14px}
:root[data-style="picture"] .hero-eta{font-family:inherit;font-weight:700;color:var(--w-ink);text-shadow:none}
:root[data-style="picture"] .hero-eta .n{font-size:72px;color:var(--w-bus);-webkit-text-stroke:1.5px var(--w-line)}
:root[data-style="picture"] .hero-eta .u{font-size:20px}
:root[data-style="picture"] .hero-eta.word{font-size:34px}
:root[data-style="picture"] .hero-eta.hot{color:var(--w-hot)!important;text-shadow:none!important;transform:rotate(-4deg)}
:root[data-style="picture"] .hero-eta.dim{color:var(--w-muted)!important;font-size:20px}
:root[data-style="picture"] .board-empty{font-family:inherit;color:var(--w-muted);padding:18px}
:root[data-style="picture"] .tag{background:var(--w-card);color:var(--w-ink);border:1.5px solid var(--w-line);border-radius:10px 12px 9px 13px;font-family:"LXGW WenKai TC",var(--f-body)}
:root[data-style="picture"] .tag.is-hot{background:var(--w-hot);color:#fff}
:root[data-style="picture"] .tag.stop{background:var(--w-mint);color:#fff}
:root[data-style="picture"] .list{background:var(--w-card);border:1.5px solid var(--w-line);border-radius:20px 24px 18px 26px/24px 18px 26px 20px;padding:2px 18px}
:root[data-style="picture"] .row{padding:11px 0;border-top:1.5px dashed color-mix(in srgb,var(--w-line) 40%,transparent)}
:root[data-style="picture"] .row:first-child{border-top:0}
:root[data-style="picture"] .rname{font-size:18px}
:root[data-style="picture"] .eta{font-family:inherit;font-weight:700;background:none;color:var(--w-ink);height:auto;min-width:64px;padding:0}
:root[data-style="picture"] .eta .n{font-size:24px}
:root[data-style="picture"] .eta.hot{color:var(--w-hot)!important;text-shadow:none!important}
:root[data-style="picture"] .eta.dim{color:var(--w-muted)!important}
:root[data-style="picture"] .sect .wait{width:64px}
`);

  Scene.register('picture',K.styled(function({scene,mode,color}){
    const dark=mode==='dark';
    const mat=c=>new THREE.MeshLambertMaterial({color:c});
    const ink=new THREE.MeshBasicMaterial({color:dark?'#1a1730':'#6b4f3f',side:THREE.BackSide});
    const line=(m,s=1.05)=>{const o=new THREE.Mesh(m.geometry,ink); o.scale.setScalar(1+(s-1)*.7); m.add(o); return m};
    scene.fog=new THREE.Fog(color('--sky2','#f2ead8'),35,95);
    scene.add(new THREE.HemisphereLight(dark?'#b8c4ff':'#fffaf0',dark?'#2b3048':'#e6dcc0',dark?.65:.85));
    const sun=new THREE.DirectionalLight(dark?'#c9d4ff':'#fff0d8',dark?.35:.5); sun.position.set(-6,12,8); scene.add(sun);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),mat(dark?'#3c5245':'#d4e2b0'));
    ground.rotation.x=-Math.PI/2; ground.position.z=-60; scene.add(ground);
    scene.add(new THREE.Mesh(K.ribbon(K.roadCurve,2.4,.02,[[0,1]],200),mat(dark?'#59607a':'#ece2cf')));

    /* 棒棒糖樹與小花 */
    const trunk=new THREE.CylinderGeometry(.08,.11,1.2,6), crown=new THREE.SphereGeometry(1,14,10);
    const crowns=[mat(dark?'#5f8a6e':'#9cc59a'),mat(dark?'#738f62':'#b5d39b'),mat(dark?'#a07b86':'#efb9a8')], tM=mat('#9a7356');
    for(let k=0,u=.05;u<.9;u+=.07,k++){
      const [x,z]=K.sidePos(u,3.2+(k%3)*.7,k%2?1:-1), r=.7+(k%3)*.2;
      const a=new THREE.Mesh(trunk,tM); a.position.set(x,.6,z);
      const b=line(new THREE.Mesh(crown,crowns[k%3])); b.scale.setScalar(r); b.position.set(x,1.2+r*.8,z);
      scene.add(a,b);
    }
    const fl=new THREE.InstancedMesh(new THREE.SphereGeometry(.09,6,5),new THREE.MeshBasicMaterial(),70), o=new THREE.Object3D();
    const fc=['#f4a6a6','#ffe08a','#ffffff','#c8b6ff','#f7b267'].map(c=>new THREE.Color(c).multiplyScalar(dark?.6:1));
    for(let k=0;k<70;k++){const u=.62+((k*37)%100)/262, [x,z]=K.sidePos(u,1.7+((k*53)%100)/40,k%2?1:-1); o.position.set(x,.08,z); o.updateMatrix(); fl.setMatrixAt(k,o.matrix); fl.setColorAt(k,fc[k%5])}
    scene.add(fl);

    /* 扁扁的雲、太陽或月亮 */
    const clouds=[], cM=new THREE.MeshLambertMaterial({color:dark?'#6c6f95':'#ffffff',transparent:true,opacity:.92});
    [[-20,12,-70],[10,14,-80],[28,11,-60]].forEach(([x,y,z],k)=>{
      const g=new THREE.Group();
      [[0,0,3],[2.6,-.3,2.2],[-2.5,-.3,2.1]].forEach(([a,b,r])=>{const m=new THREE.Mesh(crown,cM); m.scale.set(r,r*.45,r*.6); m.position.set(a,b,0); g.add(m)});
      g.position.set(x,y,z); g.userData.vx=.35+k*.1; scene.add(g); clouds.push(g);
    });
    const orb=K.glow(dark?'#fff5d6':'#ffe2a8',16,1); orb.material.blending=THREE.NormalBlending; orb.material.fog=false;
    orb.position.set(-30,24,-90); scene.add(orb);

    const pole=line(new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,2.2,8),mat('#d8cfc0'))); pole.position.set(K.STOP.x,1.1,K.STOP.z);
    const sign=line(new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.1,20),mat('#7fb7a4'))); sign.rotation.x=Math.PI/2; sign.position.set(K.STOP.x,2.25,K.STOP.z);
    scene.add(pole,sign);

    /* 淡淡的影子（不用即時陰影） */
    const shG=new THREE.CircleGeometry(.55,20), shM=new THREE.MeshBasicMaterial({color:dark?'#000000':'#3b2a20',transparent:true,opacity:dark?.3:.13,depthWrite:false});
    const ks=new THREE.Mesh(shG,shM); ks.rotation.x=-Math.PI/2; ks.position.set(K.PERSON.x,.03,K.PERSON.z); scene.add(ks);

    const kid=K.chibi({mat,line,skin:'#ffdcc2',shirt:'#e8a87c',pants:'#6d8fa6',hair:'#5b4033',eye:'#4a3b31'});
    const makeBus=K.bus({mat,line,round:true,colors:['#e9c46a','#e76f51'],glass:dark?'#ffe2a0':'#8fb8c9',white:'#fbf6ec',tire:'#4a3b31',lights:dark?.7:0,
      extra(body,g){const s=new THREE.Mesh(shG,shM); s.rotation.x=-Math.PI/2; s.scale.set(1.1,2.1,1); s.position.y=.02; g.add(s); return null}});
    return {...kid,makeBus,scale:1.2,
      camera(t,cam){cam.fov=42; cam.position.set(4.6+Math.sin(t*.1)*1.2,4.6,9.8); cam.lookAt(-1.2,1,-18)},
      tick(t,dt){for(const c of clouds){c.position.x+=c.userData.vx*dt; if(c.position.x>45) c.position.x=-45}}};
  }));
})();
