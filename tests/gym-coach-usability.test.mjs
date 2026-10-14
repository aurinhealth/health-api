import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStrengthPlan, EXERCISES } from '../src/strength-generator.js';
import { configureStrengthCoaching, estimateStrengthTiming } from '../src/strength-timing.js';
import { planValues } from '../src/gym-plan-store.js';
import { strengthPlanToIntervalsEvent } from '../src/intervals-strength.js';
const row=(name,n,options={})=>['WORK',name,String(n),'162,5','10','','','','FALSE','[Pauza 75 s]','','FALSE',''].map((v,i)=>i===12?options.group||'':i===8?options.done?'TRUE':'FALSE':v);

test('45 minute strength proposals fit including equipment time, both sides, rests and a buffer',()=>{
  for(const focus of [undefined,'upper','lower']){
    const plan=generateStrengthPlan({date:'2026-10-04',strength:{recentCompletedSets:[]},cycling:{recentActivities:[],plannedWorkouts:[]},recovery:{}},{durationMinutes:45,focus});
    assert.ok(plan.timing.totalSeconds<=2700);assert.ok(plan.timing.bufferSeconds>=180);
    assert.deepEqual({...estimateStrengthTiming(plan.rows,EXERCISES,45),routineSeconds:(plan.stretching?.seconds||0)+(plan.warmup?.seconds||0)},plan.timing);assert.ok(plan.timing.routineSeconds>0);assert.ok(plan.stretching.items.length>=2);
    assert.equal(planValues(plan)[4][1],45);
  }
  const def={'Left':{unilateral:true},'Both':{unilateral:false}};
  assert.ok(estimateStrengthTiming([row('Left',1)],def).workSeconds>estimateStrengthTiming([row('Both',1)],def).workSeconds);
});

test('coach pairs compatible accessory equipment, prescribes one failure set only when recovered and exports the instructions',()=>{
  const rows=[row('Cable curl',1),row('Cable curl',2),row('Cable triceps extension',1),row('Cable triceps extension',2),row('Pivot leg press',1)];
  configureStrengthCoaching(rows,EXERCISES);assert.equal(rows[0][12],'A');assert.equal(rows[2][12],'A');assert.equal(rows.filter(r=>r[11]==='TRUE').length,1);assert.equal(rows.at(-1)[11],'FALSE');
  const event=strengthPlanToIntervalsEvent({date:'2026-10-04',rows},{durationMinutes:45});assert.match(event.description,/supersérie A/);assert.match(event.description,/technického selhání/);assert.match(event.description,/pauza 75 s/);
  configureStrengthCoaching(rows,EXERCISES,{factor:.9});assert.equal(rows.filter(r=>r[11]==='TRUE').length,0);
});

test('a 30 minute strength session still fits with warm-up, rests and a buffer',()=>{
  for(const focus of [undefined,'upper','lower']){
    const plan=generateStrengthPlan({date:'2026-10-04',strength:{recentCompletedSets:[]},cycling:{recentActivities:[],plannedWorkouts:[]},recovery:{}},{durationMinutes:30,focus});
    assert.ok(plan.timing.totalSeconds<=1800);assert.ok(plan.rows.some(r=>r[0]==='WORK'));
  }
});
