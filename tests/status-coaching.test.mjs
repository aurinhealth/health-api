import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachCouncil } from '../src/coach-engine.js';
import { buildCyclingCoachV2 } from '../src/cycling-coach-v2.js';
import { coachContext } from '../src/coach-assistant.js';
import { buildDailyPlan } from '../src/daily-plan.js';
import { buildAdaptiveDecision } from '../src/adaptive-engine.js';
import { generateStrengthPlan } from '../src/strength-generator.js';
import { reflectionInput, rulesReflection } from '../src/coach-reflection.js';
import { validateCoachActions } from '../src/coach-actions.js';
import { getAthleteState, updateAthleteState } from '../src/athlete-state.js';
import { scopedDb } from '../src/tenancy.js';
import { createD1 } from './helpers/d1.mjs';

const date='2026-10-05';
const planned=[{id:'planned:1',name:'Threshold 4×8',type:'Ride',durationHours:1.5,tss:95},{id:'planned:2',name:'Gym',type:'WeightTraining',durationHours:1}];
const completed=[{id:'done:1',name:'Endurance',type:'Ride',durationHours:1,tss:45,calories:600}];
const daily={training:{planned,completed},nutrition:{calorieTarget:2650,macros:{protein_g:150,carbs_g:330,fat_g:80},foodLog:{totals:{kcal:800}}}};
const inputs={date,daily,week:{days:[{date,daily}]},fitness:{wellness:[{id:date,ctl:60,atl:55,tsb:5}]},health:{sleep:[{type:'sleep',durationMin:470,endTime:date+'T06:30:00'}]},gym:{history:[]},goal:{phase:'build',focus:'FTP'},availabilityMinutes:90};
for(const status of ['sick','injured','on_break'])test('gym generator respects '+status+' even on a preview path',()=>{
  assert.throws(()=>generateStrengthPlan({date,athleteState:{status}}),/pozastavené|přednost/);
});
const context={date,recovery:{sleep:[{sampleTime:date,value:470}],hrv:[{sampleTime:date,value:90}]},cycling:{nextRide:{name:'Threshold',intensity:true,durationHours:1.5},plannedWorkouts:[{intensity:true,durationHours:1.5}]},strength:{plannedWorkout:{name:'Gym'}}};

for(const status of ['sick','injured','on_break']){
  const athleteState={status,note:'Citlivé koleno, vynechat běh.'};
  test(status+': council puts declared status before the remaining plan and preserves completed data',()=>{
    const before=structuredClone(daily);
    const r=buildCoachCouncil({daily,fitness:{ctl:60,atl:55,tsb:5},sleepSessions:[{durationMin:470}],athleteState});
    assert.deepEqual(r.coaches.map(c=>c.id),['athlete-status','nutrition']);
    assert.equal(r.coaches[0].phase,'rest');
    assert.match(r.coaches[0].actions.join(' '),/Citlivé koleno/);
    assert.match(r.priorities[0],new RegExp(status==='on_break'?'On break':status==='sick'?'Sick':'Injured'));
    assert.equal(r.reviews[0].id,'review-done:1');
    assert.match(r.reviews[0].actions[0],/45 TSS/);
    assert.match(r.coaches[1].actions[1],/není doporučení/);
    assert.deepEqual(daily,before);
  });

  for(const sport of ['ride','run'])test(status+': '+sport+' recommendation is rest even with green readiness',()=>{
    const active=buildCyclingCoachV2({...inputs,sport});
    const r=buildCyclingCoachV2({...inputs,sport,athleteState});
    assert.equal(r.readiness.status,'green');
    assert.deepEqual(r.readiness,active.readiness);
    assert.deepEqual(r.load,active.load);
    assert.equal(r.recommendation.session.kind,'rest');
    assert.equal(r.recommendation.session.durationMinutes,0);
    assert.equal(r.recommendation.progression.action,'pause');
    assert.deepEqual(r.alternatives,[]);
    assert.equal(r.athleteState.note,athleteState.note);
  });

  test(status+': daily and adaptive plans suppress training, including a previously cached positive decision',()=>{
    const active=buildAdaptiveDecision(context);
    const pausedContext={...context,athleteState};
    const adaptive=buildAdaptiveDecision(pausedContext);
    assert.deepEqual(adaptive.recovery,active.recovery);
    assert.equal(adaptive.strengthVolumeModifier,0);
    assert.equal(adaptive.strengthPriority,'rest');
    assert.equal(adaptive.nextRide,null);
    assert.deepEqual(adaptive.upcomingCycling,[]);
    const r=buildDailyPlan({context:{...pausedContext,adaptive:active},nutrition:daily.nutrition,food:{totals:{eaten:{calories:800}}}});
    assert.equal(r.training.paused,true);
    assert.deepEqual(r.training.actions,[]);
    assert.equal(r.training.nextRide,null);
    assert.equal(r.training.strength,null);
    assert.equal(r.nutrition.calorieTarget,2650);
    assert.equal(r.food.eaten.calories,800);
    assert.match(r.recommendations.join(' '),/Citlivé koleno/);
  });
}

test('assistant top-level status and embedded coach agree and carry the injury note',()=>{
  const r=coachContext({...inputs,athleteState:{status:'injured',note:'Bez běhu'}});
  assert.equal(r.athleteState,'injured');
  assert.equal(r.statusNote,'Bez běhu');
  assert.equal(r.cyclingCoachV2.athleteState.status,'injured');
  assert.equal(r.cyclingCoachV2.recommendation.session.kind,'rest');
});

test('post-workout AI and fallback both receive the current pause and its limitations',()=>{
  const data={date,feedback:{rpe:5},workout:{sport:'ride'},signals:[],activities:[],wellness:[],sleep:[],recentFeedback:[],athleteState:{status:'injured',note:'Bez běhu'}};
  assert.equal(reflectionInput(data).athleteState.note,'Bez běhu');
  const text=rulesReflection(data);
  assert.match(text,/Injured/);
  assert.match(text,/Bez běhu/);
  assert.match(text,/pozastavené/);
});

test('assistant can propose resuming but cannot propose a workout during a pause',()=>{
  const workout={type:'workout',date,sport:'ride',minutes:60,reason:'Další trénink'};
  assert.deepEqual(validateCoachActions([workout],{athleteState:'on_break'},date),[]);
  assert.equal(validateCoachActions([workout],{athleteState:'active'},date)[0].type,'workout');
  assert.equal(validateCoachActions([{type:'status',status:'active',reason:'Chci se vrátit'}],{athleteState:'on_break'},date)[0].status,'active');
});

test('persisted status applies on every read and returning to Active restores normal coaching',async()=>{
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  await updateAthleteState(db,{status:'sick',note:'Dnes pauza'});
  assert.equal(buildCoachCouncil({daily,athleteState:await getAthleteState(db)}).coaches[0].id,'athlete-status');
  assert.equal((await getAthleteState(other)).status,'active');
  await updateAthleteState(db,{status:'active'});
  assert.deepEqual(buildCoachCouncil({daily,athleteState:await getAthleteState(db)}).coaches.map(c=>c.id),['cycling','gym','nutrition']);
  assert.notEqual(buildCyclingCoachV2({...inputs,athleteState:await getAthleteState(db)}).recommendation.session.kind,'rest');
});
