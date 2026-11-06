'use strict';
/* 使用習慣的測試：node --test tests/*.test.js
   假時鐘、記憶體版 storage；平日/假日與幾點都用台北時間判斷，所以固定時區。 */
process.env.TZ='Asia/Taipei';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createUsage,KEY}=require('../usage.js');
const {memoryStorage}=require('../pairs.js');

const D=864e5, H=3600000, M=60000;
const THU_10=Date.parse('2026-11-05T10:00:00+08:00'); /* 星期四 10:00 */
const SAT_10=Date.parse('2026-11-07T10:00:00+08:00'); /* 星期六 10:00 */

function setup(init,ids){
  const clock={t:THU_10}, storage=memoryStorage(init===undefined?{}:{[KEY]:init});
  let pairs=ids||['a','b'];
  const u=createUsage({storage,pairIds:()=>pairs,now:()=>clock.t});
  return {u,clock,stored:()=>storage.get(KEY),setPairs:p=>{pairs=p}};
}
/* 平日前幾天的同一時間（星期四往前 1～3 天都是平日） */
const days=(id,n,offset)=>Array.from({length:n},(_,i)=>[id,THU_10-(i+1)*D+(offset||0)]);

/* ---------- 猜常用組合 ---------- */

test('同一時段至少 3 次才自動選', ()=>{
  assert.equal(setup(days('b',2)).u.guess(),null);
  assert.equal(setup(days('b',3)).u.guess(),'b');
  assert.equal(setup([]).u.guess(),null);
  assert.equal(setup(undefined).u.guess(),null);
});

test('平手不選；多的那組勝出', ()=>{
  assert.equal(setup(days('a',3).concat(days('b',3))).u.guess(),null);
  assert.equal(setup(days('a',3).concat(days('b',2))).u.guess(),'a');
});

test('只看現在前後 1 小時內', ()=>{
  assert.equal(setup(days('b',3,60*M)).u.guess(),'b','剛好 1 小時算');
  assert.equal(setup(days('b',3,-61*M)).u.guess(),null,'61 分鐘外不算');
});

test('跨午夜也算得近：23:30 的紀錄在 00:20 算前後 1 小時內', ()=>{
  const s=setup([['b',Date.parse('2026-11-02T23:30:00+08:00')],['b',Date.parse('2026-11-03T23:40:00+08:00')],['b',Date.parse('2026-11-04T00:10:00+08:00')]]);
  s.clock.t=Date.parse('2026-11-05T00:20:00+08:00');
  assert.equal(s.u.guess(),'b');
});

test('平日、假日分開算', ()=>{
  const weekday=days('b',3);
  const weekend=[['a',SAT_10-7*D],['a',SAT_10-6*D],['a',SAT_10-14*D]]; /* 上週六、上週日、上上週六 */
  const s=setup(weekday.concat(weekend));
  assert.equal(s.u.guess(),'b','平日只看平日');
  s.clock.t=SAT_10;
  assert.equal(s.u.guess(),'a','假日只看假日');
});

test('只看最近 30 天；已刪除的組合、壞資料、未來的紀錄都略過', ()=>{
  const old=[['b',THU_10-31*D],['b',THU_10-32*D],['b',THU_10-33*D]];
  assert.equal(setup(old).u.guess(),null);
  const s=setup([['zz',THU_10-D],['zz',THU_10-2*D],['zz',THU_10-3*D],'x',['b'],['b','t'],[1,THU_10],['b',THU_10+99*D],['b',NaN]]);
  assert.equal(s.u.guess(),null); assert.equal(s.u.count(),0);
  assert.equal(setup('壞掉').u.count(),0);
});

/* ---------- 記錄 ---------- */

test('停留滿 20 秒才記一筆，時間取到分鐘', ()=>{
  const s=setup();
  s.clock.t=THU_10+12345; s.u.viewStart('a');
  s.clock.t+=19000; s.u.viewTick('a'); assert.equal(s.stored(),undefined);
  s.clock.t+=1000; s.u.viewTick('a');
  assert.deepEqual(s.stored(),[['a',THU_10]]);
});

test('同一次停留只記一筆；換了組合要重新算 20 秒', ()=>{
  const s=setup();
  s.u.viewStart('a'); s.clock.t+=30*M; s.u.viewTick('a'); s.clock.t+=30*M; s.u.viewTick('a');
  assert.equal(s.u.count(),1);
  s.u.viewTick('b'); assert.equal(s.u.count(),1,'看的不是開始計算的那組不記');
  s.u.viewStart('b'); s.clock.t+=10000; s.u.viewTick('b'); assert.equal(s.u.count(),1);
  s.u.viewTick(null); s.u.viewStart(null); s.clock.t+=D; s.u.viewTick(null); assert.equal(s.u.count(),1);
});

test('同一組 20 分鐘內已經記過就不再記', ()=>{
  const s=setup();
  s.u.viewStart('a'); s.clock.t+=20000; s.u.viewTick('a');
  s.clock.t+=10*M; s.u.viewStart('a'); s.clock.t+=20000; s.u.viewTick('a');
  assert.equal(s.u.count(),1);
  s.clock.t+=15*M; s.u.viewStart('a'); s.clock.t+=20000; s.u.viewTick('a');
  assert.equal(s.u.count(),2);
});

test('最多留 200 筆，舊的先丟；寫回時順便丟掉過期和壞資料', ()=>{
  const many=Array.from({length:205},(_,i)=>['a',THU_10-D+i*M]);
  const s=setup(many.concat(['bad',['b',THU_10-40*D]]));
  assert.equal(s.u.count(),200);
  s.u.viewStart('b'); s.clock.t+=20000; s.u.viewTick('b');
  const st=s.stored();
  assert.equal(st.length,200); assert.deepEqual(st[st.length-1],['b',THU_10]);
  assert.ok(st.every(x=>Array.isArray(x)&&x[1]>THU_10-30*D));
});

/* ---------- 刪除與清除 ---------- */

test('刪除組合：立刻刪掉那組的紀錄，其他組留著', ()=>{
  const s=setup([['a',THU_10-D],['b',THU_10-2*D],['b',THU_10-3*D]]);
  s.setPairs(['a']); /* 組合儲存已經刪掉 b */
  s.u.forget('b');
  assert.deepEqual(s.stored(),[['a',THU_10-D]]);
  assert.equal(s.u.count(),1);
});

test('清除全部', ()=>{
  const s=setup(days('a',3));
  s.u.clear();
  assert.deepEqual(s.stored(),[]); assert.equal(s.u.count(),0); assert.equal(s.u.guess(),null);
});
