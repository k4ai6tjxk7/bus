'use strict';
/* ---------- 組合儲存 ----------
   所有「組合」（上下車站、找到的路線、排除路線）和「目前看哪一組」的讀寫都在這裡。
   - 讀取時把 localStorage 當不可信資料：逐組驗證，壞掉的組合略過；只有路線壞掉就保留組合、之後重找。
   - 讀到壞資料不會馬上寫回，等使用者下一次真的修改才寫，萬一驗證規則寫錯也救得回來。
   - 給出去的組合是唯讀的，要改一律透過這裡的操作。
   - 不碰網路，也不認識使用習慣。
   - 儲存格式和以前相同（bus.pairs、bus.cur），新欄位一律選填，新舊版本可以讀同一份資料：
       region     生活圈（regions.js）；雙北不寫，舊資料沒有＝雙北
       via        轉乘站名；有這欄才是轉乘組合，routes 是第一段（上車站→轉乘站）
       routes2    第二段路線（轉乘站→下車站）
       exclude2   第二段不搭的路線
       direct     轉乘組合重找路線時發現的直達路線（提醒使用者改成直達用）
   storage 介面：get(key) 回傳解析後的值（沒有就 undefined/null），set(key, value)。 */
(function(root){
  const KEY='bus.pairs', CUR_KEY='bus.cur';
  const PAIR_MAX=20, ROUTE_MAX=200, TEXT_MAX=40, EX_MAX=50, ROUTES_TTL=7*864e5;
  const Regions=typeof module!=='undefined'&&module.exports?require('./regions.js'):root.Regions;

  const text=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=(max||TEXT_MAX);
  const isTime=t=>typeof t==='number'&&isFinite(t)&&t>0;

  function cleanRoute(r){
    if(!r||typeof r!=='object') return null;
    if(!Regions.isCity(r.city)||!text(r.route)||!text(r.name)||!text(r.stop)) return null;
    if(!Number.isInteger(r.dir)||r.dir<0||r.dir>9) return null;
    if(!Number.isInteger(r.hops)||r.hops<1||r.hops>999) return null;
    return {city:r.city,route:r.route,name:r.name,dir:r.dir,stop:r.stop,hops:r.hops};
  }
  /* 路線只要有一筆不對就整份作廢（回傳 null＝之後重找），不留半套資料 */
  function cleanRoutes(a){
    if(!Array.isArray(a)) return null;
    const out=[];
    for(const r of a.slice(0,ROUTE_MAX)){const c=cleanRoute(r); if(!c) return null; out.push(c)}
    return out;
  }
  function cleanExclude(a){
    return Array.isArray(a)?[...new Set(a.filter(s=>text(s)))].slice(0,EX_MAX):[];
  }
  function cleanPair(p){
    if(!p||typeof p!=='object') return null;
    if(!text(p.id)||!text(p.from)||!text(p.to)) return null;
    const name=typeof p.name==='string'&&p.name.trim()?p.name.slice(0,TEXT_MAX):p.from+' → '+p.to;
    const routes=cleanRoutes(p.routes);
    const region=Regions.valid(p.region)?p.region:Regions.DEFAULT;
    const via=text(p.via)&&p.via!==p.from&&p.via!==p.to?p.via:null;
    const routes2=via?cleanRoutes(p.routes2):null;
    /* 轉乘組合兩段都要有，才算找過路線 */
    const ok=routes&&(!via||routes2);
    const direct=via&&ok?cleanRoutes(p.direct):null;
    return {id:p.id,name,from:p.from,to:p.to,region,via,routes,routes2,
      resolvedAt:ok&&isTime(p.resolvedAt)?p.resolvedAt:null,
      exclude:cleanExclude(p.exclude),exclude2:via?cleanExclude(p.exclude2):[],
      direct:direct&&direct.length?direct:null};
  }
  function cleanAll(a){
    if(!Array.isArray(a)) return [];
    const seen=new Set(), out=[];
    for(const raw of a){
      if(out.length>=PAIR_MAX) break;
      const p=cleanPair(raw);
      if(!p||seen.has(p.id)) continue;
      seen.add(p.id); out.push(p);
    }
    return out;
  }
  const freezeList=a=>{if(a){a.forEach(Object.freeze); Object.freeze(a)}};
  function freeze(p){
    freezeList(p.routes); freezeList(p.routes2); freezeList(p.direct);
    Object.freeze(p.exclude); Object.freeze(p.exclude2);
    return Object.freeze(p);
  }
  const copyList=a=>a&&a.map(r=>Object.assign({},r));
  /* 寫回時維持舊格式：沒用到的新欄位（雙北、不是轉乘、沒有排除）都不寫 */
  function toStored(p){
    const o={id:p.id,name:p.name,from:p.from,to:p.to,routes:p.routes};
    if(p.resolvedAt) o.resolvedAt=p.resolvedAt;
    if(p.exclude.length) o.exclude=p.exclude;
    if(p.region!==Regions.DEFAULT) o.region=p.region;
    if(p.via){
      o.via=p.via; o.routes2=p.routes2;
      if(p.exclude2.length) o.exclude2=p.exclude2;
      if(p.direct) o.direct=p.direct;
    }
    return o;
  }

  function createPairStore(storage,opts){
    const now=(opts&&opts.now)||(()=>Date.now());
    let pairs=Object.freeze(cleanAll(storage.get(KEY)).map(freeze));
    const c=storage.get(CUR_KEY);
    let cur=typeof c==='string'&&pairs.some(p=>p.id===c)?c:null;

    const find=id=>pairs.find(p=>p.id===id)||null;
    const save=()=>storage.set(KEY,pairs.map(toStored));
    function replace(id,fn){
      const old=find(id); if(!old) return null;
      const draft=Object.assign({},old,{exclude:[...old.exclude],exclude2:[...old.exclude2],
        routes:copyList(old.routes),routes2:copyList(old.routes2),direct:copyList(old.direct)});
      const next=freeze(cleanPair(fn(draft)));
      pairs=Object.freeze(pairs.map(p=>p.id===id?next:p)); save();
      return next;
    }

    return {
      /* 全部組合（唯讀） */
      list(){return pairs},
      /* 目前的組合；記住的那組不存在時退回第一組；沒有組合回傳 null */
      current(){return find(cur)||pairs[0]||null},
      /* 切換並記住；id 不存在回傳 false */
      select(id){
        if(!find(id)) return false;
        cur=id; storage.set(CUR_KEY,cur); return true;
      },
      /* 新增並回傳新組合；資料不對或滿了會丟錯誤（訊息可直接顯示）
         extra（選填）：{region, via, routes2}；有 via 就是轉乘組合，routes 是第一段 */
      add(name,from,to,routes,extra){
        if(pairs.length>=PAIR_MAX) throw new Error('最多只能存 '+PAIR_MAX+' 組，請先刪除不用的組合。');
        let id='p'+now(); while(find(id)) id+='x';
        const x=extra||{};
        const p=cleanPair({id,name,from,to,routes,resolvedAt:now(),region:x.region,via:x.via,routes2:x.routes2});
        if(!p) throw new Error('上車站或下車站不正確，請重新搜尋。');
        pairs=Object.freeze(pairs.concat(freeze(p))); save();
        return p;
      },
      /* 刪除；刪到目前那組就改選第一組。回傳是否有刪到 */
      remove(id){
        if(!find(id)) return false;
        pairs=Object.freeze(pairs.filter(p=>p.id!==id)); save();
        if(cur===id){cur=pairs[0]?pairs[0].id:null; storage.set(CUR_KEY,cur)}
        return true;
      },
      /* 排除或取消排除一條路線，回傳更新後的組合；leg=2 是轉乘第二段 */
      toggleExclude(id,name,leg){
        if(!text(name)) return find(id);
        const k=leg===2?'exclude2':'exclude';
        return replace(id,p=>{
          p[k]=p[k].includes(name)?p[k].filter(x=>x!==name):p[k].concat(name).slice(0,EX_MAX);
          return p;
        });
      },
      /* 還沒找過路線、路線資料壞掉，或超過 7 天，就需要重找（轉乘組合兩段都要有） */
      needsRoutes(id){
        const p=find(id);
        return !!p&&(!p.resolvedAt||now()-p.resolvedAt>ROUTES_TTL);
      },
      /* 存入重找的路線，回傳更新後的組合；組合已被刪除回傳 null
         轉乘組合：extra={routes2, direct}，direct 是發現的直達路線（沒有就空陣列） */
      setRoutes(id,routes,extra){
        const x=extra||{};
        return replace(id,p=>{
          p.routes=routes; p.resolvedAt=now();
          if(p.via){p.routes2=x.routes2; p.direct=x.direct||null}
          return p;
        });
      },
      /* 換轉乘站（或把直達組合改成轉乘），第二段排除清單重來 */
      setVia(id,via,routes1,routes2){
        if(!text(via)) return find(id);
        return replace(id,p=>{
          p.via=via; p.routes=routes1; p.routes2=routes2; p.exclude2=[]; p.direct=null; p.resolvedAt=now();
          return p;
        });
      },
      /* 轉乘組合改成直達：用重找時發現的直達路線，回傳更新後的組合；沒有直達路線就不動 */
      useDirect(id){
        const o=find(id); if(!o||!o.via||!o.direct) return o;
        return replace(id,p=>{
          p.routes=p.direct; p.via=null; p.routes2=null; p.exclude2=[]; p.direct=null; p.resolvedAt=now();
          return p;
        });
      },
      /* 維持轉乘：收起「現在有直達車」的提醒（下次重找路線時若還有直達，會再提醒一次） */
      dismissDirect(id){
        return replace(id,p=>{p.direct=null; return p});
      }
    };
  }

  /* in-memory adapter：測試用，行為和 localStorage 一樣經過 JSON 序列化 */
  function memoryStorage(init){
    const m=new Map(Object.entries(init||{}).filter(([,v])=>v!==undefined).map(([k,v])=>[k,JSON.stringify(v)]));
    return {get:k=>m.has(k)?JSON.parse(m.get(k)):undefined,set:(k,v)=>{m.set(k,JSON.stringify(v))},raw:k=>m.get(k)};
  }

  const api={createPairStore,memoryStorage,PAIR_MAX,ROUTE_MAX,TEXT_MAX,EX_MAX,ROUTES_TTL};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.PairStore=api;
})(typeof window!=='undefined'?window:this);
