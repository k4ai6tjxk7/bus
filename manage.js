'use strict';
/* ---------- 組合管理 ----------
   設定頁新增、重找路線、換轉乘站、刪除組合的流程規則與提示文字。
   查詢交給找路線（finder），存取交給組合儲存（store），刪除時一併刪使用習慣（usage）；不碰 DOM。

   createPairManager({store, finder, usage, onStatus}) 回傳：
     add({name, from, to, region}, onStart)
                                    新增組合。有直達、或直達和轉乘都找不到，就直接存；
                                    沒有直達但有轉乘站，回傳 {pick} 讓使用者選，選了再呼叫 addWithVia。
                                    通過檢查、開始找路線時先呼叫 onStart()（畫面收掉上一次的轉乘站候選）。
     addWithVia(input, 候選)        用選好的轉乘站新增（input 用 add 回傳的 pick.input）
     refind(id)                     重找路線；直達組合找不到路線時提示可以找轉乘站
     transfers(id)                  查轉乘站候選，回傳 {pick} 或 {none: 文字}；這次沒查到回傳 {}
     chooseVia(id, 候選)            改用選好的轉乘站
     remove(id)                     刪除組合，連同它的使用習慣
   pick＝{cands, lead, confirm(候選)→按鈕文字}（add 另帶 input）。
   onStatus(文字)：設定頁組合區下方的提示。排隊等查詢額度的倒數、進行中、結果、錯誤都從這裡出去；
     不必改提示的情況就不呼叫（例如重找時這次沒查到，畫面維持原樣）。
   回傳 changed: true 表示組合清單變了，要重畫。
   errText(錯誤)：設定頁的錯誤說法（沒金鑰時是「請先儲存金鑰。」），站名搜尋也用。

   另有 createAddForm（新增組合表單）：設定頁「新增組合」那一區的狀態與規則，內部建立組合管理；說明在函式上方。 */
(function(root){
  const node=typeof module!=='undefined'&&module.exports;
  const {waitText}=node?require('./tdx.js'):root.Tdx;
  const {PAIR_MAX}=node?require('./pairs.js'):root.PairStore;
  const Regions=node?require('./regions.js'):root.Regions;

  const errText=e=>e.kind==='nokey'?'請先儲存金鑰。':e.message;
  const names=routes=>[...new Set(routes.map(x=>x.name))].join('、');

  function createPairManager({store,finder,usage,onStatus}){
    /* 使用者操作排隊等額度時，提示多久後繼續 */
    const waitHint={onWait:(s,why)=>onStatus(waitText(s,why,'繼續'))};
    const find=id=>store.list().find(p=>p.id===id);

    async function add({name,from,to,region},onStart){
      name=(name||'').trim()||'組合 '+(store.list().length+1);
      if(!from||!to){onStatus('請先搜尋並選擇上車站和下車站。'); return {}}
      if(store.list().length>=PAIR_MAX){onStatus('最多只能存 '+PAIR_MAX+' 組，請先刪除不用的組合。'); return {}} /* 先擋，不浪費查詢 */
      if(onStart) onStart();
      onStatus('正在找出符合的路線…');
      try{
        const found=await finder.forNewPair(region,from,to,waitHint);
        if(!found){onStatus(''); return {}} /* 這次沒查到 */
        const {direct:r,cands}=found;
        if(r.length||!cands.length){
          store.add(name,from,to,r,{region});
          onStatus(r.length?`已新增，找到 ${r.length} 條路線：${names(r)}。有不想搭的（例如比較繞），可以在上方這一組裡排除。`
            :'已新增，但目前找不到直達、也找不到只轉一次車的路線。');
          return {changed:true};
        }
        /* 沒有直達：列出轉乘站，選了才新增 */
        onStatus('');
        return {pick:{cands,input:{name,from,to,region},lead:`${from} → ${to} 沒有直達的公車。可以在下面這些站轉一次車：`,confirm:c=>'用'+c.via+'轉乘，新增組合'}};
      }catch(e){onStatus(errText(e)); return {}}
    }

    function addWithVia({name,from,to,region},c){
      try{
        store.add(name,from,to,c.routes1,{region,via:c.via,routes2:c.routes2});
        onStatus(`已新增轉乘組合：在${c.via}轉乘。看板會先顯示第一段，到了${c.via}再按「看下一段」。`);
        return {changed:true};
      }catch(e){onStatus(e.message); return {}}
    }

    async function refind(id){
      const p=find(id); if(!p) return {};
      try{
        const r=await finder.resolve(p,waitHint);
        if(!r) return {}; /* 這次沒查到：畫面維持原樣 */
        store.setRoutes(p.id,r.routes,r);
        onStatus(!p.via&&!r.routes.length?`「${p.name}」找不到直達的路線，可以按「找轉乘站」。`:'');
        return {changed:true};
      }catch(e){onStatus(errText(e)); return {}}
    }

    async function transfers(id){
      const p=find(id); if(!p) return {};
      try{
        const cands=await finder.transferOptions(p,waitHint);
        if(cands===null) return {}; /* 這次沒查到：畫面維持原樣 */
        if(!cands.length) return {none:'找不到只轉一次車的轉乘站。'};
        return {pick:{cands,lead:`${p.from} → ${p.to}：可以在下面這些站轉一次車`,confirm:c=>'改在'+c.via+'轉乘'}};
      }catch(e){onStatus(errText(e)); return {}}
    }

    function chooseVia(id,c){
      store.setVia(id,c.via,c.routes1,c.routes2);
      onStatus('');
      return {changed:true};
    }

    function remove(id){
      store.remove(id);
      usage.forget(id); /* 這組的使用紀錄一起刪掉 */
      return {changed:true};
    }

    return {add,addWithVia,refind,transfers,chooseVia,remove};
  }

  /* 新增組合表單：設定頁「新增組合」那一區的狀態與規則（GLOSSARY「新增組合表單」），不碰 DOM。
     createAddForm({store, finder, usage, createSearch, onChange}) 回傳 {open, setRegion, search, live, choose, add, pickVia, view, manager}。
     createSearch({getRegion, onWait})：畫面提供，回傳一個站名搜尋（Stops.createStopSearch 的回傳值）；建立時呼叫兩次（上車站 from、下車站 to）。
     manager：表單自己建的組合管理，onStatus 寫進表單的狀態列；設定頁組合清單的重找、換轉乘站、刪除照舊呼叫它，提示出現在同一條狀態列。
     onChange()：任何狀態變了就通知畫面重畫。操作都不丟錯，錯誤一律變成狀態列文字。
     open()：打開設定頁。生活圈設成最後一組的生活圈（沒有組合用 Regions.DEFAULT），再做 setRegion 的重設。
     setRegion(id)：手動換生活圈。兩個站名搜尋作廢、選到的站與轉乘站候選清掉、狀態列清成空字串。
     search(side, 關鍵字)、live(side)：side 是 'from' 或 'to'。關鍵字 trim 後空白、或那一側忙碌中，不做事。
     choose(side, 站名)：改選；不是目前這批可選的項目就忽略。
     add(名稱)：用表單記的生活圈與兩側選到的站呼叫組合管理的 add，回傳 {changed}；沒有直達只有轉乘時候選放在 view().pick。
     pickVia(候選)：選了轉乘站候選；候選清掉，用組合管理的 addWithVia 新增，回傳 {changed}。
     view()：{region, status, pick, from, to}。pick 是 null 或 {cands, lead, confirm}；
       from／to 是 {menu, menuRev, chosen, buttons, liveShown}：menu 是 null（選單藏起來）或項目（站名搜尋的 state().items）；
       menuRev 每次選單該重畫時加一，畫面只在它變了才重畫選單（等候秒數更新時不重畫，免得選到一半被重設）；chosen 是選到的站名或空字串。 */
  function createAddForm({store,finder,usage,createSearch,onChange}){
    const notify=()=>{ if(onChange) onChange(); };
    const lastRegion=()=>{ const l=store.list(); return l.length?l[l.length-1].region:Regions.DEFAULT; };
    let region=lastRegion(), pick=null, status='';
    let lastNote=''; /* 上一次算出的排隊說明：狀態列還是這句，才表示沒被別人蓋過，可以更新或清掉 */
    const manager=createPairManager({store,finder,usage,onStatus:t=>{ status=t; notify(); }});
    const sides={};
    for(const k of ['from','to']){
      const s=sides[k]={menuRev:0,chosen:'',queueStarted:false};
      s.search=createSearch({getRegion:()=>region,onWait:()=>{ waitNote(s.queueStarted); s.queueStarted=false; notify(); }});
    }
    const itemsOf=s=>{ const st=s.search.state(); return st?st.items:null; };
    const defaultChoice=s=>{ const it=(itemsOf(s)||[]).find(x=>x.selectable); return it?it.value:''; };
    /* 選單該重畫了：選到的站回到預設（第一個可選的項目） */
    const redrawMenu=s=>{ s.menuRev++; s.chosen=defaultChoice(s); };
    /* 狀態列的排隊說明只有這一個出口：取第一個有排隊說明的那側（先上車站），都沒有就清掉自己寫的說明。
       started＝這次是新開始的排隊，不論狀態列現在是什麼都寫；其餘時候（倒數、結束）只在狀態列還是自己寫的字時才動，免得把錯誤和組合管理的提示蓋掉 */
    function waitNote(started){
      const note=['from','to'].map(k=>sides[k].search.waitNote()).find(t=>t)||'';
      if(note){ if(started||status===lastNote) status=note; lastNote=note; }
      else{ if(status===lastNote) status=''; lastNote=''; }
    }
    function reset(){
      for(const s of Object.values(sides)){ s.search.regionChanged(); redrawMenu(s); }
      pick=null; status=''; lastNote='';
      notify();
    }
    async function run(s,start){
      s.queueStarted=true;
      const p=start();
      notify(); /* 搜尋已開始：按鈕顯示搜尋中、收起即時搜尋那一列 */
      try{ await p; waitNote(false); redrawMenu(s); } /* 結束（含作廢）：重算排隊說明 */
      catch(e){ status=errText(e); } /* 出錯：錯誤訊息保留，不重算排隊說明 */
      notify();
    }
    return {
      manager,
      open(){ region=lastRegion(); reset(); },
      setRegion(id){ region=id; reset(); },
      async search(side,kw){
        const s=sides[side]; if(!s) return;
        if(!String(kw||'').trim()||s.search.buttons().general.disabled) return;
        await run(s,()=>s.search.search(kw));
      },
      async live(side){
        const s=sides[side]; if(!s||s.search.buttons().live.disabled) return;
        await run(s,()=>s.search.live());
      },
      choose(side,name){
        const s=sides[side]; if(!s) return;
        if((itemsOf(s)||[]).some(x=>x.selectable&&x.value===name)){ s.chosen=name; notify(); }
      },
      async add(name){
        const r=await manager.add({name,region,from:sides.from.chosen,to:sides.to.chosen},()=>{ pick=null; notify(); });
        if(r.pick) pick=r.pick;
        notify();
        return {changed:!!r.changed};
      },
      pickVia(c){
        if(!pick) return {changed:false};
        const input=pick.input; pick=null;
        const r=manager.addWithVia(input,c);
        notify();
        return {changed:!!r.changed};
      },
      view(){
        const side=s=>({menu:itemsOf(s),menuRev:s.menuRev,chosen:s.chosen,buttons:s.search.buttons(),liveShown:!!(s.search.state()&&s.search.state().liveShown)});
        return {region,status,pick:pick&&{cands:pick.cands,lead:pick.lead,confirm:pick.confirm},from:side(sides.from),to:side(sides.to)};
      },
    };
  }

  const api={createPairManager,createAddForm,errText};
  if(node) module.exports=api;
  else root.Manage=api;
})(typeof window!=='undefined'?window:this);
