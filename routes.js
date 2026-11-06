'use strict';
/* ---------- 找路線 ----------
   「查經過上車站的路線 → 算直達 → 查經過下車站的路線 → 算轉乘」只寫在這裡。
   createFinder({routesThrough}) 回傳三個操作，routesThrough(關鍵字, opts) 由 tdx.js 提供：
   - resolve(組合, opts) → {routes, routes2, direct}
       重找路線。直達組合查 1 次；轉乘組合查 2 次，只看組合已選的轉乘站，順便看看是不是有直達了。
   - forNewPair(生活圈, 上車站, 下車站, opts) → {direct, cands}
       新增組合。先查上車站，有直達就停；沒有才查下車站，列出轉乘站候選。
   - transferOptions(組合, opts) → 轉乘站候選陣列
       換轉乘站／找轉乘站。兩站都查。
   null 約定：任何一次查詢回傳 null（自動更新額度不夠，這次跳過），就不再查下一站，整個操作回傳 null。
   查哪個生活圈由組合的 region（或 forNewPair 的生活圈）決定；每查一站實際花的次數＝生活圈的縣市數（見 tdx.js）。
   查詢錯誤（TdxError）原樣往外丟。

   路線格式（和組合儲存相同）：{city, route, name, dir, stop, hops}
     stop 是上車的站牌 StopUID（轉乘第二段就是轉乘站的站牌），hops 是坐幾站。

   站名規則（搜尋、比對、看板標題都用這一份）：
   - norm：忽略空白，全形括號當成半形
   - stopCore：再去掉括號後面那段，查 TDX 時當關鍵字用（例如「丁站(北)」→「丁站」）

   轉乘規則：
   - 只轉一次；轉乘站必須同名（站名完全相同，只忽略空白與全半形括號）
   - 兩段在轉乘站的站牌相距 300 公尺以內才算（沒有座標的站牌不擋）
   - 依總站數排序；同站數時，兩段可搭路線比較多的在前；最多列 3 個 */
(function(root){
  const MAX_DIST=300, LIMIT=3;
  const norm=s=>(s||'').replace(/\s/g,'').replace(/（/g,'(').replace(/）/g,')');
  const stopCore=s=>norm(s).split('(')[0];
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

  function createFinder(deps){
    const through=(name,region,opts)=>deps.routesThrough(stopCore(name),Object.assign({},opts,{region}));
    return {
      async resolve(pair,opts){
        const rawFrom=await through(pair.from,pair.region,opts); if(rawFrom===null) return null;
        const d=direct(rawFrom,pair.from,pair.to);
        if(!pair.via) return {routes:d};
        const rawTo=await through(pair.to,pair.region,opts); if(rawTo===null) return null;
        const c=transfers(rawFrom,rawTo,pair.from,pair.to,{via:pair.via})[0];
        return {routes:c?c.routes1:[],routes2:c?c.routes2:[],direct:d};
      },
      async forNewPair(region,from,to,opts){
        const rawFrom=await through(from,region,opts); if(rawFrom===null) return null;
        const d=direct(rawFrom,from,to);
        if(d.length) return {direct:d,cands:[]};
        const rawTo=await through(to,region,opts); if(rawTo===null) return null;
        return {direct:d,cands:transfers(rawFrom,rawTo,from,to)};
      },
      async transferOptions(pair,opts){
        const rawFrom=await through(pair.from,pair.region,opts); if(rawFrom===null) return null;
        const rawTo=await through(pair.to,pair.region,opts); if(rawTo===null) return null;
        return transfers(rawFrom,rawTo,pair.from,pair.to);
      }
    };
  }

  const api={createFinder,stopCore,MAX_DIST};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Routes=api;
})(typeof window!=='undefined'?window:this);
