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
   createSwitcher({load, createScene, sceneOpts, root, now}) 回傳：
     show(id)        換成這款畫面風格：載入完成才換 3D 場景與 <html data-style>。
                     載入中又換了別款，這款就不換（只畫最後選的）；載入失敗就維持原版（風格設定不動，下次再試）。
                     回傳 Promise，resolve 成目前實際顯示的風格 id。
     setBuses(list)  把班次交給目前的 3D 場景並記下時間；換風格時扣掉經過的秒數，交給新場景。
     建立時就先畫原版，風格檔還沒載完時看板上方也有場景。
     load＝createLoader 的 load、createScene＝Scene.createScene（測試時換成假的）；
     sceneOpts 原樣交給 createScene（另加 style）；root 是設 data-style 的元素；now() 回傳毫秒。

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
    {id:'neon',name:'霓虹',desc:'城市夜景與發光招牌，淺色模式是黃昏',files:[KIT,'styles/neon.js?v=20261107b']},
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

  function createSwitcher({load,createScene,sceneOpts,root,now}){
    const make=style=>createScene(Object.assign({},sceneOpts,{style}));
    let scene=make(DEFAULT), shown=DEFAULT, want=DEFAULT;
    let last=null;                /* 最後交給場景的班次與時間 */
    function show(id){
      want=id;
      return load(id).then(ok=>{
        if(want!==id) return shown;   /* 載入時又換了別款 */
        const use=ok?id:DEFAULT;
        if(use===shown) return shown;
        shown=use;
        if(use===DEFAULT) delete root.dataset.style; else root.dataset.style=use;
        scene.dispose();
        scene=make(use);
        if(last){
          const gone=(now()-last.at)/1000;
          scene.setBuses(last.list.map(b=>b.sec==null?b:Object.assign({},b,{sec:Math.max(0,b.sec-gone)})));
        }
        return shown;
      });
    }
    function setBuses(list){last={list,at:now()}; scene.setBuses(list)}
    return {show,setBuses};
  }

  const api={createStyleSetting,createLoader,createSwitcher,LIST,DEFAULT,KEY,files:()=>[...new Set(LIST.flatMap(s=>s.files||[]))]};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Styles=api;
})(typeof window!=='undefined'?window:this);
