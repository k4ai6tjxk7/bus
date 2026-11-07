'use strict';
/* ---------- TDX 查詢 ----------
   所有和 TDX 打交道的事都在這裡：網址、篩選語法、查哪些縣市、金鑰與 token、查詢額度、錯誤訊息。
   呼叫端只說「搜尋站名」「經過某站的路線」「查到站」「存金鑰」。
   搜尋站名、經過某站的路線：只查 opts.region 生活圈的縣市（見 regions.js，沒給就是雙北）。
   這裡不判斷站名：routesThrough 收到的是已經算好的關鍵字。站名規則與找路線（直達、轉乘）都在 routes.js。

   查詢額度（基礎會員每把金鑰每分鐘 5 次，含取 token）：
   - 任意 61 秒內最多 4 次，留 1 次餘裕。時間戳存在 bus.calls（不含金鑰資訊），跨分頁共用。
   - 收到 429：暫停 65 秒。把 4 筆時間戳記在「未來 4 秒」佔滿額度（舊版也讀得懂，同樣會等），
     另外在 bus.pause 記暫停到幾點，只用來顯示是哪一種等待。
   - opts.auto=true（自動更新）：這個操作的額度不夠就整個跳過，回傳 null，不和使用者搶。
   - 使用者操作：排隊等，每秒呼叫 opts.onWait(秒數, 原因)；原因 'limit' 自己保留額度、'paused' 被 TDX 擋。

   錯誤一律是 TdxError：e.kind 為 'nokey' | 'rate' | 'network' | 'auth' | 'http'，e.message 可直接顯示。

   依賴從外面注入：fetch、now、sleep、storage（get/set，和組合儲存相同）。 */
(function(root){
  const API='https://tdx.transportdata.tw/api/basic/v2/Bus';
  const TOKEN_URL='https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
  const Regions=typeof module!=='undefined'&&module.exports?require('./regions.js'):root.Regions;
  const RL_MAX=4, RL_WIN=61000, PAUSE_MS=65000, FUTURE_OK=5000;
  const KEY_MAX=200;

  const q=s=>String(s).replace(/'/g,"''");

  const MSG={
    nokey:'請先到設定填入金鑰。',
    rate:'TDX 暫時限制這組金鑰的查詢次數（每分鐘最多 5 次），約 1 分鐘後自動恢復。',
    network:'連不上 TDX，請確認網路後再試。'
  };
  class TdxError extends Error{constructor(kind,msg){super(msg||MSG[kind]||'查詢失敗'); this.kind=kind}}
  const SKIP={}; /* 內部用：自動更新額度不夠 */

  function createTdx(deps){
    const fetchFn=deps.fetch, now=deps.now||(()=>Date.now()), storage=deps.storage;
    const sleep=deps.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));

    /* ----- 金鑰與 token：讀取時當不可信資料 ----- */
    function loadCfg(){
      const c=storage.get('bus.cfg');
      return c&&typeof c==='object'&&typeof c.id==='string'&&typeof c.secret==='string'&&c.id.length<=KEY_MAX&&c.secret.length<=KEY_MAX
        ?{id:c.id,secret:c.secret}:{id:'',secret:''};
    }
    let cfg=loadCfg();
    let tok=storage.get('bus.tok');
    const tokValid=()=>!!(tok&&typeof tok==='object'&&typeof tok.v==='string'&&typeof tok.exp==='number'&&tok.exp>now()+60000);

    /* ----- 查詢額度 ----- */
    function calls(){
      const t=now(), a=storage.get('bus.calls');
      return Array.isArray(a)?a.filter(x=>typeof x==='number'&&isFinite(x)&&x>t-RL_WIN&&x<=t+FUTURE_OK).sort((x,y)=>x-y):[];
    }
    const free=()=>Math.max(0,RL_MAX-calls().length);
    let chain=Promise.resolve();
    /* 取得一次額度。auto：沒有就丟 SKIP；否則排隊等 */
    function take(opts){
      const run=async()=>{
        for(;;){
          const a=calls(), t=now();
          if(a.length<RL_MAX){a.push(t); storage.set('bus.calls',a); return}
          if(opts.auto) throw SKIP;
          const pu=storage.get('bus.pause'), paused=typeof pu==='number'&&pu>t&&pu<=t+PAUSE_MS;
          const wait=Math.max(200,a[0]+RL_WIN-t+100);
          if(opts.onWait) opts.onWait(Math.ceil(wait/1000),paused?'paused':'limit');
          await sleep(Math.min(wait,1000));
        }
      };
      const p=chain.then(run); chain=p.catch(()=>{}); return p;
    }
    /* 收到 429：暫停 65 秒（61 秒視窗 + 未來 4 秒） */
    function pause(){
      const t=now();
      storage.set('bus.calls',Array(RL_MAX).fill(t+PAUSE_MS-RL_WIN));
      storage.set('bus.pause',t+PAUSE_MS);
    }

    async function send(url,init){
      try{return await fetchFn(url,init)}catch(e){throw new TdxError('network')}
    }
    async function getToken(force,opts){
      if(!force&&tokValid()) return tok.v;
      if(!cfg.id||!cfg.secret) throw new TdxError('nokey');
      await take(opts);
      const r=await send(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'client_credentials',client_id:cfg.id,client_secret:cfg.secret})});
      if(r.status===429){pause(); throw new TdxError('rate')}
      if(!r.ok) throw new TdxError('auth','金鑰驗證失敗（HTTP '+r.status+'），請確認 Client ID 和 Secret。');
      let j=null; try{j=await r.json()}catch(e){}
      if(!j||typeof j.access_token!=='string') throw new TdxError('auth','金鑰驗證失敗，TDX 回傳格式不正確。');
      /* token 效期 24 小時，提早 1 小時重取 */
      const life=Math.max(300,Math.min(+j.expires_in||3600,86400)-3600);
      tok={v:j.access_token,exp:now()+life*1000}; storage.set('bus.tok',tok);
      return tok.v;
    }
    async function get(path,params,opts){
      const qs=Object.entries(Object.assign({},params,{$format:'JSON'})).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
      let renewed=false;
      for(let i=0;i<2;i++){
        const t=await getToken(renewed,opts);
        await take(opts);
        const r=await send(API+path+'?'+qs,{headers:{Authorization:'Bearer '+t}});
        if(r.status===401&&!renewed){renewed=true; tok=null; storage.set('bus.tok',null); continue}
        if(r.status===401) break;
        if(r.status===429){pause(); throw new TdxError('rate')}
        if(!r.ok){
          let body=''; try{body=(await r.text()).slice(0,200)}catch(e){}
          throw new TdxError('http','資料查詢失敗（HTTP '+r.status+'）'+(body?'：'+body:''));
        }
        let data; try{data=await r.json()}catch(e){throw new TdxError('http','資料查詢失敗：TDX 回傳格式不正確。')}
        return Array.isArray(data)?data:[];
      }
      throw new TdxError('auth','金鑰驗證失敗，請到設定重新儲存。');
    }

    /* 一個操作：先確認有金鑰；自動更新時先看額度夠不夠整個操作，不夠就跳過 */
    async function op(dataCalls,opts,body){
      opts=opts||{};
      if(!cfg.id||!cfg.secret) throw new TdxError('nokey');
      if(opts.auto&&free()<Math.min(RL_MAX,dataCalls+(tokValid()?0:1))) return null;
      try{return await body(opts)}
      catch(e){if(e===SKIP) return null; throw e}
    }

    const stopCache=new Map();
    return {
      hasKey(){return !!(cfg.id&&cfg.secret)},
      key(){return {id:cfg.id,secret:cfg.secret}},
      /* 存金鑰並立刻取 token 測試；沒填完整丟 nokey */
      async saveKey(id,secret,opts){
        cfg={id:String(id||'').trim().slice(0,KEY_MAX),secret:String(secret||'').trim().slice(0,KEY_MAX)};
        storage.set('bus.cfg',cfg); tok=null; storage.set('bus.tok',null);
        if(!cfg.id||!cfg.secret) throw new TdxError('nokey');
        await getToken(true,opts||{});
        return true;
      },
      /* 站名搜尋；同一個生活圈、同一個關鍵字這次打開頁面內只查一次 */
      searchStops(kw,opts){
        const reg=Regions.get(opts&&opts.region), ck=reg.id+'|'+kw;
        if(stopCache.has(ck)) return Promise.resolve(stopCache.get(ck));
        return op(reg.cities.length,opts,async o=>{
          const names=new Set();
          for(const city of reg.cities){
            const d=await get('/Stop/City/'+city,{$filter:`contains(StopName/Zh_tw,'${q(kw)}')`,$select:'StopName',$top:'300'},o);
            d.forEach(s=>{if(s&&s.StopName&&typeof s.StopName.Zh_tw==='string') names.add(s.StopName.Zh_tw)});
          }
          const list=[...names].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
          stopCache.set(ck,list);
          return list;
        });
      },
      /* 站名包含 keyword 的所有路線（原始資料，每筆加上 _city），交給找路線 */
      routesThrough(keyword,opts){
        const reg=Regions.get(opts&&opts.region);
        return op(reg.cities.length,opts,async o=>{
          const rows=[];
          for(const city of reg.cities){
            const data=await get('/StopOfRoute/City/'+city,{$filter:`Stops/any(s: contains(s/StopName/Zh_tw,'${q(keyword)}'))`,
              $select:'RouteUID,RouteName,Direction,Stops'},o);
            data.forEach(r=>{if(r&&typeof r==='object') rows.push(Object.assign(r,{_city:city}))});
          }
          return rows;
        });
      },
      /* 查到站：同縣市所有站合併成一次查詢；回傳原始資料（加上 _city）交給看板內容 */
      arrivals(routes,opts){
        const byCity={};
        (routes||[]).forEach(r=>{if(r&&Regions.isCity(r.city))(byCity[r.city]=byCity[r.city]||new Set()).add(r.stop)});
        const cities=Object.keys(byCity);
        return op(cities.length,opts,async o=>{
          const rows=[];
          for(const city of cities){
            const f=[...byCity[city]].map(u=>`StopUID eq '${q(u)}'`).join(' or ');
            const data=await get('/EstimatedTimeOfArrival/City/'+city,{$filter:f,
              $select:'StopUID,RouteUID,Direction,StopStatus,EstimateTime,NextBusTime'},o);
            data.forEach(d=>{if(d&&typeof d==='object') rows.push(Object.assign(d,{_city:city}))});
          }
          return rows;
        });
      }
    };
  }

  const api={createTdx,TdxError,RL_MAX,RL_WIN,PAUSE_MS};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Tdx=api;
})(typeof window!=='undefined'?window:this);
