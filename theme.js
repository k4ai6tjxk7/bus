'use strict';
/* ---------- 深淺色 ----------
   自動（跟系統）／淺色／深色，整支手機共用一個設定（bus.theme），不分組合；沒設定或讀到壞值就是自動。
   畫面只看 <html data-theme="light|dark">：這裡永遠寫入算好的結果，CSS 與 3D 場景都不直接看系統。
   這個檔案放在 <head> 同步載入，畫面出來前就設好 data-theme，開頁不會先閃另一種顏色。

   createTheme({storage, mq, root, meta}) 回傳：
     current()    目前的設定：'auto'、'light' 或 'dark'
     set(mode)    換設定；不認得的值回傳 false、不寫入
     isDark()     現在畫面是不是深色（自動時看系統）
     systemDark() 系統現在是不是深色（設定頁「自動」後面標的就是這個）
     onChange(fn) 畫面的深淺色真的變了才通知（手動切換、或自動時系統切換）；回傳取消函式
   storage：{get,set}；mq：matchMedia('(prefers-color-scheme: dark)')，沒有就當淺色；
   root：設 data-theme 的元素；meta：手機狀態列顏色的 <meta name="theme-color">，可省略。
   瀏覽器裡載入時就建好一個，放在 Theme.page。 */
(function(root){
  const KEY='bus.theme', DEFAULT='auto', MODES=['auto','light','dark'];
  const BAR={light:'#e9eef0',dark:'#0c1114'};  /* 和 index.html 的 --bg 一樣 */

  function createTheme({storage,mq,root:el,meta}){
    const fns=[];
    const read=()=>{let v; try{v=storage.get(KEY)}catch(e){} return MODES.includes(v)?v:DEFAULT};
    const systemDark=()=>!!(mq&&mq.matches);
    const isDark=()=>{const m=read(); return m==='dark'||(m==='auto'&&systemDark())};
    let shown=null;
    function apply(){
      const dark=isDark(), name=dark?'dark':'light';
      el.setAttribute('data-theme',name);
      if(meta) meta.setAttribute('content',BAR[name]);
      if(shown!==null&&shown!==dark){shown=dark; fns.slice().forEach(fn=>{try{fn(dark)}catch(e){}})}
      shown=dark;
    }
    const onSystem=()=>apply();
    if(mq){try{mq.addEventListener('change',onSystem)}catch(e){try{mq.addListener(onSystem)}catch(e2){}}}
    apply();
    return {
      current:read,
      set(mode){if(!MODES.includes(mode))return false; storage.set(KEY,mode); apply(); return true},
      isDark,
      systemDark,
      onChange(fn){fns.push(fn); return ()=>{const i=fns.indexOf(fn); if(i>=0) fns.splice(i,1)}},
    };
  }

  const api={createTheme,KEY,DEFAULT,MODES};
  if(typeof module!=='undefined'&&module.exports){module.exports=api; return}
  const storage={get(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):undefined}catch(e){return undefined}},
                 set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
  const mq=root.matchMedia?root.matchMedia('(prefers-color-scheme: dark)'):null;
  api.page=createTheme({storage,mq,root:document.documentElement,meta:document.querySelector('meta[name="theme-color"]')});
  root.Theme=api;
})(typeof window!=='undefined'?window:this);
