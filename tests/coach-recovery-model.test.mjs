import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdaptiveDecision } from '../src/adaptive-engine.js';
import { generateStrengthPlan } from '../src/strength-generator.js';
import { recoveryReadiness, mergeWellnessRows } from '../src/recovery-model.js';
import { buildToday } from '../src/app-today.js';

const date='2026-10-08';
const day=o=>new Date(Date.parse(date+'T12:00:00Z')+o*86400000).toISOString().slice(0,10);
const series=today=>[...Array.from({length:30},(_,i)=>({id:day(-30+i),hrv:70+(i%4)*2,restingHR:50+(i%2)})),{id:date,...today}];
const context=today=>({date,wellnessSeries:series(today),recovery:{sleep_duration_minutes:[{sampleTime:date+'T06:30:00',value:470}]},cycling:{recentRideTss:300,recentRideHours:5,recentActivities:[],plannedWorkouts:[]}});

test('the coach uses the same recovery score as the dashboard',()=>{
  const sleepSessions=[{date,startTime:day(-1)+'T22:40:00Z',endTime:date+'T06:30:00Z',durationMin:470,timeInBedMin:490}];
  const ctx={...context({hrv:73,restingHR:50}),sleepSessions,profile:{age:40,sleepGoal:500}};
  const d=buildAdaptiveDecision(ctx);
  // Today with the same rows, nights and profile shows this number.
  const today=buildToday({date,health:{wellness:ctx.wellnessSeries},sleep:{sessions:sleepSessions},profile:ctx.profile});
  assert.equal(d.recovery.model,'shared');assert.equal(d.recovery.score,today.readiness.score);
  assert.equal(d.recovery.sleepNeed,500);
  assert.ok(buildAdaptiveDecision({...ctx,wellnessSeries:series({hrv:45,restingHR:60})}).recovery.score<today.readiness.score);
});
test('without a personal baseline the coach falls back to the older rules',()=>{
  assert.equal(buildAdaptiveDecision({date,wellnessSeries:[],recovery:{},cycling:{}}).recovery.model,'legacy');
});
test('Intervals.icu fills only what Google Health lacks',()=>{
  const rows=mergeWellnessRows([{id:day(0),hrv:60}],[{id:day(0),hrv:90,restingHR:48},{id:day(-1),respiration:14}]);
  assert.deepEqual(rows,[{id:day(-1),respiration:14},{id:day(0),hrv:60,restingHR:48,restingHRSource:'intervals'}]);
});
test('deep endurance fatigue (TSB) protects the legs instead of a load ratio',()=>{
  const base={date,cycling:{recentRideTss:200,recentRideHours:4,plannedWorkouts:[],recentActivities:[{date:day(-3),type:'Ride',name:'Endurance',tss:60,durationHours:1.5,ctl:60,atl:90}]},recovery:{},strength:{recentCompletedSets:[]}};
  const tired=generateStrengthPlan(base,{maxExercises:8});
  base.cycling.recentActivities[0].atl=62;
  const fresh=generateStrengthPlan(base,{maxExercises:8});
  assert.match(JSON.stringify(tired),/forma TSB -30/);
  assert.doesNotMatch(JSON.stringify(fresh),/forma TSB/);
});

test('a falling 7-day HRV before the week makes it a recovery week for everything',async()=>{
  const { hrvWeekTrendDown, recoveryWeek } = await import('../src/week-planner.js');
  const monday='2026-10-05',d=o=>new Date(Date.parse(monday+'T12:00:00Z')+o*86400000).toISOString().slice(0,10);
  const rows=Array.from({length:60},(_,i)=>({id:d(-67+i),hrv:70+(i%5)}));
  assert.equal(hrvWeekTrendDown([...rows,...Array.from({length:7},(_,i)=>({id:d(-7+i),hrv:72}))],monday),false);
  assert.equal(hrvWeekTrendDown([...rows,...Array.from({length:7},(_,i)=>({id:d(-7+i),hrv:60}))],monday),true);
  assert.equal(hrvWeekTrendDown([...rows,...Array.from({length:3},(_,i)=>({id:d(-3+i),hrv:50}))],monday),false);
  assert.deepEqual(recoveryWeek({base:500,weekLoads:[400],hrvDown:true}),{recovery:true,reason:'hrv_trend'});
  assert.deepEqual(recoveryWeek({base:500,weekLoads:[400]}),{recovery:false,reason:null});
});

test('with the sleep sessions the coach uses the same night and sleep need as the dashboard',async()=>{
  const { sleepNeedFor } = await import('../src/recovery-model.js');
  const ctx=context({hrv:73,restingHR:50});
  ctx.profile={age:70};ctx.sleepSessions=[{date,durationMin:400,timeInBedMin:430},{date:day(-1),durationMin:30,nap:true}];
  const d=buildAdaptiveDecision(ctx);
  const need=sleepNeedFor({date,age:70,rows:ctx.wellnessSeries,sessions:ctx.sleepSessions}).need;
  assert.equal(d.recovery.sleepNeed,need);assert.equal(d.recovery.sleepMinutes,400);
  assert.equal(d.recovery.score,recoveryReadiness({rows:ctx.wellnessSeries,date,night:ctx.sleepSessions[0],sleepNeed:need}).score);
});

test('the week target holds at maintenance when CTL already ramps over 8 a week',async()=>{
  const { weekTargets } = await import('../src/week-planner.js');
  const args={roles:[],ctl:60,days:[],today:'2026-10-05',weekStart:'2026-10-05',weekLoads:[400]};
  assert.equal(weekTargets(args).target,Math.round(420*1.05));
  const hold=weekTargets({...args,rampRate:9});assert.equal(hold.target,420);assert.equal(hold.rampHold,true);
});

test('the recovery week reads HRV from the source with the most mornings, never a mix', async () => {
  const { hrvWeekTrendDown, hrvSourceRows } = await import('../src/week-planner.js');
  const monday = '2026-10-05', d = o => new Date(Date.parse(monday + 'T12:00:00Z') + o * 86400000).toISOString().slice(0, 10);
  // No Intervals.icu HRV; the watch (Google, RMSSD) falls in the last week, Apple's few SDNN days do not count.
  const health = Array.from({ length: 67 }, (_, i) => ({ id: d(-67 + i), hrv: 40, hrvBySource: { 'google-wearables': i >= 60 ? 55 : 70 + (i % 5), ...(i % 20 === 0 ? { 'apple-health:sdnn': 40 } : {}) } }));
  const rows = hrvSourceRows([{ id: d(-1), hrv: 60 }], health, monday);
  assert.equal(rows.find(r => r.id === d(-1)).hrv, 55);
  assert.equal(hrvWeekTrendDown(rows, monday), true);
  // Intervals.icu with more mornings wins.
  const intervals = Array.from({ length: 67 }, (_, i) => ({ id: d(-67 + i), hrv: 70 + (i % 5) }));
  assert.equal(hrvWeekTrendDown(hrvSourceRows(intervals, health, monday), monday), false);
});

test('a red morning or signs of illness leave the gym out today',()=>{
  const plan=(today,extra={})=>{const ctx={...context(today),strength:{recentCompletedSets:[]},...extra};ctx.adaptive=buildAdaptiveDecision(ctx);return ()=>generateStrengthPlan(ctx,{maxExercises:6});};
  assert.doesNotThrow(plan({hrv:74,restingHR:50}));
  assert.throws(plan({hrv:40,restingHR:60}),/červená zóna|red zone/);
  const breathing=context({hrv:74,restingHR:50,respiration:19});
  breathing.wellnessSeries=breathing.wellnessSeries.map(r=>r.id===date?r:{...r,respiration:14+(Number(r.id.slice(-1))%2)*0.2});
  breathing.strength={recentCompletedSets:[]};breathing.adaptive=buildAdaptiveDecision(breathing);
  assert.ok(breathing.adaptive.recovery.flags.includes('respiration_elevated'));
  assert.throws(()=>generateStrengthPlan(breathing,{maxExercises:6}),/nad tvým normálem|above your normal/);
});
