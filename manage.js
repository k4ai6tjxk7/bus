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
   errText(錯誤)：設定頁的錯誤說法（沒金鑰時是「請先儲存金鑰。」），站名搜尋也用。 */
(function(root){
  const node=typeof module!=='undefined'&&module.exports;
  const {waitText}=node?require('./updater.js'):root.Updater;
  const {PAIR_MAX}=node?require('./pairs.js'):root.PairStore;

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

  const api={createPairManager,errText};
  if(node) module.exports=api;
  else root.Manage=api;
})(typeof window!=='undefined'?window:this);
