import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recoveryModelBlock} from '../src/recovery-model-block.js';
import {personalBaseline,sleepNeedMinutes,sleepDebtMinutes,recoveryReadiness,heartRateLoad,strainScore,recoveryComponentScore,bedtimePlan,sleepNeedFor} from '../src/recovery-model.js';

const day=i=>new Date(Date.UTC(2026,7,1)+i*86400000).toISOString().slice(0,10);
const history=(n,f)=>Array.from({length:n},(_,i)=>({id:day(i),...f(i)}));

test('the dashboard client carries the exact shared model (run scripts/sync-recovery-model.mjs)',()=>{
  const client=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
  assert.ok(client.includes(recoveryModelBlock()));
});
test('baseline excludes today, uses 60 days and needs 14 values',()=>{
  const rows=history(80,i=>({hrv:i<10?20:50}));
  const b=personalBaseline(rows,day(79),'hrv');assert.equal(b.count,60);assert.equal(b.mean,50);
  assert.equal(personalBaseline(rows.slice(0,10),day(10),'hrv').mean,null);
  assert.ok(Math.abs(personalBaseline(rows,day(79),'hrv',{log:true}).mean-Math.log(50))<1e-9);
});
test('sleep need follows NSF ranges by age and rises after a hard day',()=>{
  assert.equal(sleepNeedMinutes({age:30}),480);assert.equal(sleepNeedMinutes({age:70}),450);
  assert.equal(sleepNeedMinutes({age:30,strain:15}),495);assert.equal(sleepNeedMinutes({age:30,strain:19}),510);
});
test('sleep debt accumulates, a long night repays at most an hour',()=>{
  const nights=[0,1,2,3,4,5,6].map(i=>({date:day(i),durationMin:i===6?600:420}));
  assert.deepEqual({...sleepDebtMinutes(nights,day(6),480),average:0},{minutes:300,nights:7,average:0,need:480});
  assert.equal(sleepDebtMinutes([],day(6)),null);
});
test('component score: personal mean 70, −1 SD 50, −2 SD 30',()=>{assert.equal(recoveryComponentScore(0),70);assert.equal(recoveryComponentScore(-1),50);assert.equal(recoveryComponentScore(-2),30);assert.equal(recoveryComponentScore(3),100);});
test('recovery: HRV trend below the smallest worthwhile change and raised breathing are flagged',()=>{
  const rows=history(40,i=>({hrv:60+(i%2?4:-4),restingHR:50+(i%2),respiration:14+(i%2)*0.2}));
  for(let i=34;i<40;i++)rows[i].hrv=50;
  const date=day(40),today={id:date,hrv:52,restingHR:50,respiration:16};
  const r=recoveryReadiness({rows:[...rows,today],date,night:{date,durationMin:480},sleepNeed:480});
  assert.equal(r.components.hrv.trend,'down');assert.ok(r.flags.includes('hrv_trend_down'));
  assert.ok(r.components.respiration.elevated);assert.ok(r.flags.includes('respiration_elevated'));
  const calm=recoveryReadiness({rows:[...rows,{...today,respiration:14.1}],date,night:{date,durationMin:480}});
  assert.equal(calm.score-r.score,10);
});
test('recovery works without sleep, but not on sleep alone',()=>{
  const rows=history(20,i=>({hrv:60+(i%3),restingHR:50}));
  const date=day(20);
  assert.ok(recoveryReadiness({rows:[...rows,{id:date,hrv:61}],date}).score>0);
  assert.equal(recoveryReadiness({rows:[...rows,{id:date}],date,night:{date,durationMin:480}}).score,null);
});
test('heart-rate load weights Google zones as Edwards zones 2–5 and saturates on 0–21',()=>{
  assert.equal(heartRateLoad({light:30,moderate:20,vigorous:10,peak:2}),30*2+20*3+10*4+2*5);
  assert.equal(heartRateLoad({}),null);assert.equal(heartRateLoad(null),null);
  assert.equal(strainScore(180),11.6);assert.ok(strainScore(600)>19&&strainScore(600)<21);assert.equal(strainScore(0),0);
});
test('a skin temperature clearly above the baseline is flagged, a small rise is not',()=>{
  const rows=history(20,i=>({hrv:60+(i%3),restingHR:50}));const date=day(20);
  const r=t=>recoveryReadiness({rows:[...rows,{id:date,hrv:61,restingHR:50,...t}],date});
  assert.ok(r({skinTempDeviation:0.8,skinTempSd:0.2}).flags.includes('skin_temp_elevated'));
  assert.equal(r({skinTempDeviation:0.3,skinTempSd:0.1}).components.skinTemp.elevated,false);
  assert.equal(r({skinTempDeviation:0.6,skinTempSd:0.4}).components.skinTemp.elevated,false);
  assert.equal(r({}).score-r({skinTempDeviation:0.8,skinTempSd:0.2}).score,10);
});
test('sleep index uses NSF latency and wake-after-sleep-onset ranges when the device reports them',async()=>{
  const {sleepIndexScore}=await import('../src/recovery-model.js');
  const night={durationMin:480,timeInBedMin:540,stages:{DEEP:80,REM:110}};
  assert.equal(sleepIndexScore({...night,latencyMin:10,wasoMin:15},480),100);
  assert.equal(sleepIndexScore({...night,latencyMin:60,wasoMin:50},480),85);
  assert.equal(sleepIndexScore(night,480),100);
});
test('sleep need: naps lower it, a low HRV status and sleep debt raise it, within 7–9 h',async()=>{
  const {sleepNeedFor}=await import('../src/recovery-model.js');
  const date=day(40),prev=day(39);
  const calm=history(40,i=>({hrv:60+(i%3),restingHR:50}));
  const nights=Array.from({length:7},(_,i)=>({date:day(33+i),durationMin:480}));
  assert.deepEqual(sleepNeedFor({date,age:30,rows:calm,sessions:nights}),{need:480,base:480,hrv:0,debt:0,naps:0});
  assert.equal(sleepNeedFor({date,age:30,rows:calm,sessions:[...nights,{date:prev,durationMin:40,nap:true}]}).need,440);
  assert.equal(sleepNeedFor({date,age:30,rows:calm,sessions:[...nights,{date:prev,durationMin:120,nap:true}]}).need,420);
  const low=calm.map((r,i)=>i>=34?{...r,hrv:45}:r);
  assert.equal(sleepNeedFor({date,age:30,rows:low,sessions:nights}).hrv,15);
  const short=nights.map(n=>({...n,durationMin:390}));
  const s=sleepNeedFor({date,age:30,rows:calm,sessions:short});assert.equal(s.debt,30);assert.equal(s.need,510);
  assert.equal(sleepNeedFor({date,age:30,strain:19,rows:low,sessions:short}).need,540);
});
test('sleep debt adds a day\'s naps to its night',()=>{
  const s=[{date:day(6),durationMin:420},{date:day(6),durationMin:40,nap:true}];
  assert.equal(sleepDebtMinutes(s,day(6),480).minutes,20);
});

test('bedtimePlan wakes at the usual time of that kind of morning and adds the time awake in bed', () => {
  // Work days wake at 6:30, weekends at 8:00; asleep 90 % of the time in bed.
  const nights = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(Date.parse('2026-10-08T12:00:00Z') - i * 864e5).toISOString().slice(0, 10), day = new Date(date + 'T12:00:00Z').getUTCDay();
    nights.push({ date, wakeMin: [0, 6].includes(day) ? 480 : 390, durationMin: 450, timeInBedMin: 500 });
  }
  const workday = bedtimePlan({ date: '2026-10-08', need: 495, nights });
  assert.equal(workday.wake, 390);
  assert.equal(workday.inBed, 550); // 495 / 0.9
  assert.equal(workday.bed, 1280); // 21:20
  const weekend = bedtimePlan({ date: '2026-10-09', need: 480, nights });
  assert.equal(weekend.weekend, true);
  assert.equal(weekend.wake, 480);
  assert.equal(bedtimePlan({ date: '2026-10-08', need: 480, nights: [] }), null);
});

test("an own sleep goal replaces the age baseline and a set alarm plans bedtime without nights", () => {
  assert.equal(sleepNeedMinutes({ age: 40, goal: 450 }), 450);
  assert.equal(sleepNeedMinutes({ age: 40, goal: 450, strain: 18 }), 480, "a hard day still adds 30 min");
  assert.equal(sleepNeedMinutes({ age: 40, goal: 200 }), 480, "a goal outside 6–10 h is ignored");
  assert.equal(sleepNeedFor({ date: "2026-10-08", age: 40, goal: 390, rows: [], sessions: [] }).need, 390, "a 6.5 h goal may go under 7 h");
  // 2026-10-08 is a Thursday: the next morning is a work day.
  const plan = bedtimePlan({ date: "2026-10-08", need: 480, nights: [], wake: { workday: 390, weekend: 480 } });
  assert.equal(plan.wake, 390);
  assert.equal(plan.wakeSource, "setting");
  assert.equal(plan.bed, ((390 - Math.round(480 / 0.9 / 5) * 5) % 1440 + 1440) % 1440);
  const saturday = bedtimePlan({ date: "2026-10-09", need: 480, nights: [], wake: { workday: 390, weekend: 480 } });
  assert.equal(saturday.wake, 480, "Friday night: the weekend alarm");
  assert.equal(bedtimePlan({ date: "2026-10-08", need: 480, nights: [] }), null, "no nights and no alarm: no plan");
});
