import test from 'node:test';
import assert from 'node:assert/strict';
import {personalBaseline,sleepNeedMinutes,sleepDebtMinutes,recoveryReadiness,heartRateLoad,strainScore,recoveryComponentScore,bedtimePlan,sleepNeedFor} from '../src/recovery-model.js';

const day=i=>new Date(Date.UTC(2026,7,1)+i*86400000).toISOString().slice(0,10);
const history=(n,f)=>Array.from({length:n},(_,i)=>({id:day(i),...f(i)}));

test('baseline excludes today, uses 60 days and needs 14 values',()=>{
  const rows=history(80,i=>({hrv:i<10?20:50}));
  const b=personalBaseline(rows,day(79),'hrv');assert.equal(b.count,60);assert.equal(b.mean,50);
  assert.equal(personalBaseline(rows.slice(0,10),day(10),'hrv').mean,null);
  assert.ok(Math.abs(personalBaseline(rows,day(79),'hrv',{log:true}).mean-Math.log(50))<1e-9);
});
test('sleep need follows NSF ranges by age and rises after a hard day',()=>{
  assert.equal(sleepNeedMinutes({age:30}),480);assert.equal(sleepNeedMinutes({age:70}),450);
  assert.equal(sleepNeedMinutes({age:30,strain:10}),480);assert.equal(sleepNeedMinutes({age:30,strain:14}),495);assert.equal(sleepNeedMinutes({age:30,strain:15}),499);assert.equal(sleepNeedMinutes({age:30,strain:19}),510);
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
  const s=sleepNeedFor({date,age:30,rows:calm,sessions:short});assert.equal(s.debt,60);assert.equal(s.need,540);
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
  const sixHours = Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-0${i + 1}`, durationMin: 355 }));
  assert.equal(sleepNeedFor({ date: "2026-10-08", age: 40, goal: 360, rows: [], sessions: sixHours }).need, 390, "a 30 min debt on a 6 h goal moves the bedtime by 30 min");
  // 2026-10-08 is a Thursday: the next morning is a work day.
  const plan = bedtimePlan({ date: "2026-10-08", need: 480, nights: [], wake: { workday: 390, weekend: 480 } });
  assert.equal(plan.wake, 390);
  assert.equal(plan.wakeSource, "setting");
  assert.equal(plan.bed, ((390 - Math.round(480 / 0.9 / 5) * 5) % 1440 + 1440) % 1440);
  const saturday = bedtimePlan({ date: "2026-10-09", need: 480, nights: [], wake: { workday: 390, weekend: 480 } });
  assert.equal(saturday.wake, 480, "Friday night: the weekend alarm");
  assert.equal(bedtimePlan({ date: "2026-10-08", need: 480, nights: [] }), null, "no nights and no alarm: no plan");
});

test('a single wild HRV value is dropped from the baseline, and without one nothing changes',()=>{
  // Thirty days around 50 ms and one 200 ms night (a misread strap).
  const rows=history(30,i=>({hrv:50+(i%3)-1,restingHR:50}));
  const clean=personalBaseline(rows,day(31),'hrv',{log:true}),withOutlier=personalBaseline([...rows,{id:day(30),hrv:200}],day(31),'hrv',{log:true});
  assert.equal(withOutlier.count,30);assert.ok(Math.abs(withOutlier.mean-clean.mean)<1e-12);assert.ok(Math.abs(withOutlier.sd-clean.sd)<1e-12);
  const r=recoveryReadiness({rows:[...rows,{id:day(30),hrv:200},{id:day(31),hrv:50,restingHR:50}],date:day(31)});
  assert.ok(r.components.hrv.score>=69,String(r.components.hrv.score));
  assert.ok(r.components.hrv.low>46&&r.components.hrv.high<54,'the normal range stays around 50 ms');
  // No outlier: the plain mean and SD, to the byte.
  const values=rows.map(r=>Math.log(r.hrv)),mean=values.reduce((s,v)=>s+v,0)/values.length;
  assert.deepEqual(clean,{count:30,mean,sd:Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/(values.length-1))});
});
test('a young baseline has its SD pulled toward a typical one until 30 days',()=>{
  const same=n=>history(n,()=>({hrv:50,restingHR:50}));
  const young=recoveryReadiness({rows:[...same(14),{id:day(14),hrv:45,restingHR:55}],date:day(14)});
  const settled=recoveryReadiness({rows:[...same(30),{id:day(30),hrv:45,restingHR:55}],date:day(30)});
  // 14 identical days then 5 ms less: no longer a −2.1 SD event; at 30 days only the floors apply.
  assert.ok(young.components.hrv.z>-1.5&&young.components.hrv.z>settled.components.hrv.z,String(young.components.hrv.z));
  assert.ok(Math.abs(settled.components.hrv.z-Math.log(45/50)/0.05)<1e-9);
  assert.ok(young.components.restingHR.z<settled.components.restingHR.z);assert.equal(settled.components.restingHR.z,5/1.5);
});
test('Apple HRV as SDNN and as RMSSD are two baselines, not one',()=>{
  const rows=[...history(20,()=>({hrv:50,hrvSource:'apple-health:sdnn'})),...Array.from({length:20},(_,i)=>({id:day(20+i),hrv:75+(i%3),hrvSource:'apple-health:rmssd'}))];
  const r=recoveryReadiness({rows:[...rows,{id:day(40),hrv:76,hrvSource:'apple-health:rmssd',restingHR:50}],date:day(40)});
  assert.equal(r.components.hrv.days,20);assert.ok(Math.abs(r.components.hrv.baseline-76)<1.5,String(r.components.hrv.baseline));
  // A day without the measure named is not pooled with either.
  assert.equal(recoveryReadiness({rows:[...rows,{id:day(40),hrv:76,hrvSource:'apple-health',restingHR:50}],date:day(40)}).components.hrv,undefined);
});
test('resting heart rate is compared within its source; a new source borrows the mixed baseline and says so',()=>{
  // 30 days from Intervals.icu (a chest strap, 60 bpm), then 20 days from the Google watch (50 bpm).
  const rows=[...history(30,i=>({restingHR:60+(i%2),restingHRSource:'intervals',hrv:60})),...Array.from({length:20},(_,i)=>({id:day(30+i),restingHR:50+(i%2),restingHRSource:'google-wearables',hrv:60}))];
  const google=recoveryReadiness({rows:[...rows,{id:day(50),restingHR:51,restingHRSource:'google-wearables',hrv:60}],date:day(50)});
  assert.equal(google.components.restingHR.days,20);assert.ok(Math.abs(google.components.restingHR.baseline-50.5)<1e-9);assert.ok(!google.flags.includes('restingHRMixed'));
  // Five days of a new Apple Watch: the baseline over every source, flagged.
  const fresh=[...rows,...Array.from({length:5},(_,i)=>({id:day(50+i),restingHR:55,restingHRSource:'apple-health',hrv:60}))];
  const apple=recoveryReadiness({rows:[...fresh,{id:day(55),restingHR:55,restingHRSource:'apple-health',hrv:60}],date:day(55)});
  assert.ok(apple.components.restingHR,'the number is not lost');assert.ok(apple.flags.includes('restingHRMixed'));assert.equal(apple.components.restingHR.days,55);
  // Without any source tags (Intervals.icu only), as before.
  const plain=history(20,i=>({restingHR:50+(i%2),hrv:60}));
  assert.equal(recoveryReadiness({rows:[...plain,{id:day(20),restingHR:51,hrv:60}],date:day(20)}).components.restingHR.days,20);
});
