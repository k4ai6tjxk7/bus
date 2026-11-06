'use strict';
/* ---------- 路線比對 ----------
   給 TDX StopOfRoute 原始資料（每筆加上 _city），算出：
   - direct：先經過上車站、再經過下車站（同方向）的路線
   - transfers：沒有直達時，可以轉一次車的轉乘站候選
   不連網、不記狀態，查詢由 tdx.js 負責。

   路線格式（和組合儲存相同）：{city, route, name, dir, stop, hops}
     stop 是上車的站牌 StopUID（轉乘第二段就是轉乘站的站牌），hops 是坐幾站。

   轉乘規則：
   - 只轉一次；轉乘站必須同名（站名完全相同，只忽略空白與全半形括號）
   - 兩段在轉乘站的站牌相距 300 公尺以內才算（沒有座標的站牌不擋）
   - 依總站數排序；同站數時，兩段可搭路線比較多的在前；最多列 3 個 */
(function(root){
  const MAX_DIST=300, LIMIT=3;
  const norm=s=>(s||'').replace(/\s/g,'').replace(/（/g,'(').replace(/）/g,')');
  const nameOf=s=>s&&s.StopName&&typeof s.StopName.Zh_tw==='string'?s.StopName.Zh_tw:'';
  const stopsOf=r=>r&&r.RouteName&&typeof r.RouteName.Zh_tw==='string'&&Array.isArray(r.Stops)?r.Stops:null;
  const posOf=s=>{
    const p=s&&s.StopPosition, la=p&&+p.PositionLat, lo=p&&+p.PositionLon;
    return isFinite(la)&&isFinite(lo)&&la!==0&&lo!==0?[la,lo]:null;
  };
  function dist(a,b){
    if(!a||!b) return 0; /* 沒有座標：不擋 */
    const R=6371000, rad=Math.PI/180, dLa=(b[0]-a[0])*rad, dLo=(b[1]-a[1])*rad;
    const h=Math.sin(dLa/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLo/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }
  const item=(r,boardStop,hops)=>({city:r._city,route:r.RouteUID,name:r.RouteName.Zh_tw,dir:r.Direction,stop:boardStop.StopUID,hops});
  /* 同一路線同方向同站牌只留站數最少的 */
  function uniq(items){
    const seen=new Map();
    for(const x of items){const k=x.city+'|'+x.route+'|'+x.dir+'|'+x.stop; const o=seen.get(k); if(!o||o.hops>x.hops) seen.set(k,x)}
    return [...seen.values()];
  }

  function direct(raw,from,to){
    const out=[], f=norm(from), t=norm(to);
    for(const r of raw||[]){
      const st=stopsOf(r); if(!st) continue;
      const oi=st.findIndex(s=>norm(nameOf(s))===f); if(oi<0) continue;
      const di=st.findIndex((s,i)=>i>oi&&norm(nameOf(s))===t); if(di<0) continue;
      out.push(item(r,st[oi],di-oi));
    }
    return uniq(out);
  }

  /* opts.via：只看這個轉乘站（重找路線時用）；opts.limit：最多幾個 */
  function transfers(rawFrom,rawTo,from,to,opts){
    opts=opts||{};
    const f=norm(from), t=norm(to), only=opts.via!=null?norm(opts.via):null;
    const limit=opts.limit||LIMIT, maxDist=opts.maxDist||MAX_DIST;
    const groups=new Map(); /* 轉乘站 → {label, a:[第一段], b:[第二段]} */
    const group=(k,label)=>{if(!groups.has(k)) groups.set(k,{label,a:[],b:[]}); return groups.get(k)};
    const skip=k=>!k||k===f||k===t||(only!==null&&k!==only);

    for(const r of rawFrom||[]){
      const st=stopsOf(r); if(!st) continue;
      const oi=st.findIndex(s=>norm(nameOf(s))===f); if(oi<0) continue;
      const done=new Set();
      for(let j=oi+1;j<st.length;j++){
        const k=norm(nameOf(st[j]));
        if(k===t) break; /* 這條本身就到得了下車站，屬於直達 */
        if(skip(k)||done.has(k)) continue;
        done.add(k);
        group(k,nameOf(st[j])).a.push({x:item(r,st[oi],j-oi),pos:posOf(st[j])});
      }
    }
    for(const r of rawTo||[]){
      const st=stopsOf(r); if(!st) continue;
      const di=st.findIndex(s=>norm(nameOf(s))===t); if(di<0) continue;
      const near=new Map(); /* 同一站出現多次，取離下車站最近的那次 */
      for(let i=0;i<di;i++){const k=norm(nameOf(st[i])); if(!skip(k)) near.set(k,i)}
      for(const [k,i] of near) if(groups.has(k)) groups.get(k).b.push({x:item(r,st[i],di-i),pos:posOf(st[i])});
    }

    const out=[];
    for(const g of groups.values()){
      if(!g.a.length||!g.b.length) continue;
      const a=g.a.filter(e=>g.b.some(o=>dist(e.pos,o.pos)<=maxDist));
      const b=g.b.filter(e=>g.a.some(o=>dist(e.pos,o.pos)<=maxDist));
      if(!a.length||!b.length) continue;
      const routes1=uniq(a.map(e=>e.x)), routes2=uniq(b.map(e=>e.x));
      const hops1=Math.min(...routes1.map(x=>x.hops)), hops2=Math.min(...routes2.map(x=>x.hops));
      const n1=new Set(routes1.map(x=>x.name)).size, n2=new Set(routes2.map(x=>x.name)).size;
      out.push({via:g.label,hops:hops1+hops2,hops1,hops2,n1,n2,routes1,routes2});
    }
    out.sort((x,y)=>x.hops-y.hops||(y.n1+y.n2)-(x.n1+x.n2)||x.via.localeCompare(y.via,'zh-Hant'));
    return out.slice(0,limit);
  }

  const api={direct,transfers,dist,norm,MAX_DIST};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Routes=api;
})(typeof window!=='undefined'?window:this);
