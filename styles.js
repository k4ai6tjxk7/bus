'use strict';
/* ---------- 畫面風格 ----------
   看板可以換不同的畫面風格（3D 場景＋看板樣式）。整支手機共用一個設定，不分組合。
   原版內建在 scene.js；其他風格各自一個檔案，只在選到時才載入。

   createStyleSetting({storage, list}) 回傳：
     list()      可選的風格 [{id, name, desc}]
     current()   目前的風格 id；沒設定或讀到壞值就是原版
     set(id)     換風格；不認得的 id 回傳 false、不寫入
   createLoader({doc, list}) 回傳 load(id)：
     需要的檔案載入完成時 resolve(true)；原版不必載入、立刻 true；載入失敗 resolve(false)，下次可再試。
     同一款只插入一次 <script>；有指定字型時同時載入字型。

   list 只在測試時傳，平常用 LIST。 */
(function(root){
  const KEY='bus.style', DEFAULT='classic';
  /* file：風格檔（相對網址，帶版本號）；font：Google Fonts 的 family 參數。原版兩者都沒有 */
  const LIST=[
    {id:'classic',name:'原版',desc:'LED 看板與點陣道路'},
  ];

  function createStyleSetting({storage,list=LIST}){
    const known=id=>typeof id==='string'&&list.some(s=>s.id===id);
    return {
      list:()=>list.map(({id,name,desc})=>({id,name,desc})),
      current(){const v=storage.get(KEY); return known(v)?v:DEFAULT},
      set(id){if(!known(id))return false; storage.set(KEY,id); return true},
    };
  }

  function createLoader({doc,list=LIST}){
    const pending={}, fonts={};
    return function load(id){
      const s=list.find(x=>x.id===id);
      if(!s||!s.file) return Promise.resolve(!!s);
      if(pending[id]) return pending[id];
      if(s.font&&!fonts[id]){
        fonts[id]=true;
        const l=doc.createElement('link'); l.rel='stylesheet';
        l.href='https://fonts.googleapis.com/css2?family='+s.font+'&display=swap';
        doc.head.appendChild(l);
      }
      return pending[id]=new Promise(res=>{
        const el=doc.createElement('script'); el.src=s.file;
        el.onload=()=>res(true);
        el.onerror=()=>{delete pending[id]; el.remove(); res(false)};
        doc.head.appendChild(el);
      });
    };
  }

  const api={createStyleSetting,createLoader,LIST,DEFAULT,KEY};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Styles=api;
})(typeof window!=='undefined'?window:this);
