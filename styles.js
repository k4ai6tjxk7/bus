'use strict';
/* ---------- 畫面風格 ----------
   看板可以換不同的畫面風格（3D 場景＋看板樣式）。整支手機共用一個設定，不分組合。
   原版內建在 scene.js；其他風格各自一個檔案，只在選到時才載入。

   createStyleSetting({storage, list}) 回傳：
     list()      可選的風格 [{id, name, desc}]
     current()   目前的風格 id；沒設定或讀到壞值就是原版
     set(id)     換風格；不認得的 id 回傳 false、不寫入
   createLoader({doc, list}) 回傳 load(id)：
     需要的檔案依序載入完成時 resolve(true)；原版不必載入、立刻 true；載入失敗 resolve(false)，下次可再試。
     同一個檔案只插入一次 <script>（共用零件 kit 只載一次）；有指定字型時同時載入字型。

   list 只在測試時傳，平常用 LIST。 */
(function(root){
  const KEY='bus.style', DEFAULT='classic';
  /* files：依序載入的檔案（相對網址，帶版本號）；font：Google Fonts 的 family 參數。原版兩者都沒有 */
  const KIT='styles/kit.js?v=20261107a';
  const LIST=[
    {id:'classic',name:'原版',desc:'LED 看板與點陣道路'},
    {id:'anime',name:'動漫',desc:'卡通描邊、藍天白雲、會揮手的 Q 版小人',files:[KIT,'styles/anime.js?v=20261107a'],font:'Zen+Maru+Gothic:wght@500;700;900'},
    {id:'mini',name:'微縮',desc:'粉彩玩具小鎮、圓角公車，像桌上的模型',files:[KIT,'styles/mini.js?v=20261107a']},
    {id:'pixel',name:'像素',desc:'16 位元電玩畫面、RPG 對話框',files:[KIT,'styles/pixel.js?v=20261107a']},
    {id:'picture',name:'繪本',desc:'紙張質感、手寫字、柔和的顏色',files:[KIT,'styles/picture.js?v=20261107a'],font:'LXGW+WenKai+TC:wght@400;700'},
    {id:'neon',name:'霓虹',desc:'城市夜景與發光招牌，淺色模式是黃昏',files:[KIT,'styles/neon.js?v=20261107a']},
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
    const files={}, fonts={};
    /* 一個檔案只插入一次；失敗就忘掉，下次可再試 */
    const script=src=>files[src]||(files[src]=new Promise(res=>{
      const el=doc.createElement('script'); el.src=src;
      el.onload=()=>res(true);
      el.onerror=()=>{delete files[src]; el.remove(); res(false)};
      doc.head.appendChild(el);
    }));
    return async function load(id){
      const s=list.find(x=>x.id===id);
      if(!s) return false;
      if(s.font&&!fonts[id]){
        fonts[id]=true;
        const l=doc.createElement('link'); l.rel='stylesheet';
        l.href='https://fonts.googleapis.com/css2?family='+s.font+'&display=swap';
        doc.head.appendChild(l);
      }
      for(const f of s.files||[]) if(!await script(f)) return false;
      return true;
    };
  }

  const api={createStyleSetting,createLoader,LIST,DEFAULT,KEY,files:()=>[...new Set(LIST.flatMap(s=>s.files||[]))]};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Styles=api;
})(typeof window!=='undefined'?window:this);
