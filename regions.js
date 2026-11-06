'use strict';
/* ---------- 生活圈 ----------
   每個組合屬於一個生活圈；查詢只查這個生活圈的縣市（TDX 市區公車）。
   一個生活圈最多 2 個縣市（雙北、新竹、嘉義），每次搜尋或找路線 1～2 次查詢。
   舊組合沒有 region 欄位：當成雙北，和以前一樣。 */
(function(root){
  const LIST=[
    ['north','雙北',['Taipei','NewTaipei'],'台北市＋新北市'],
    ['keelung','基隆',['Keelung']],
    ['taoyuan','桃園',['Taoyuan']],
    ['hsinchu','新竹',['Hsinchu','HsinchuCounty'],'新竹市＋新竹縣'],
    ['miaoli','苗栗',['MiaoliCounty']],
    ['taichung','台中',['Taichung']],
    ['changhua','彰化',['ChanghuaCounty']],
    ['nantou','南投',['NantouCounty']],
    ['yunlin','雲林',['YunlinCounty']],
    ['chiayi','嘉義',['Chiayi','ChiayiCounty'],'嘉義市＋嘉義縣'],
    ['tainan','台南',['Tainan']],
    ['kaohsiung','高雄',['Kaohsiung']],
    ['pingtung','屏東',['PingtungCounty']],
    ['yilan','宜蘭',['YilanCounty']],
    ['hualien','花蓮',['HualienCounty']],
    ['taitung','台東',['TaitungCounty']],
    ['penghu','澎湖',['PenghuCounty']],
    ['kinmen','金門',['KinmenCounty']],
    ['lienchiang','馬祖',['LienchiangCounty']]
  ].map(([id,name,cities,note])=>Object.freeze({id,name,cities:Object.freeze(cities),note:note||''}));
  const DEFAULT='north';
  const byId=new Map(LIST.map(r=>[r.id,r]));
  const ALL_CITIES=Object.freeze([...new Set(LIST.flatMap(r=>r.cities))]);

  const api={
    LIST:Object.freeze(LIST),DEFAULT,ALL_CITIES,
    /* 不認得的 id（含舊資料沒有這欄位）一律當成雙北 */
    get(id){return byId.get(id)||byId.get(DEFAULT)},
    valid(id){return byId.has(id)},
    isCity(c){return ALL_CITIES.includes(c)}
  };
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.Regions=api;
})(typeof window!=='undefined'?window:this);
