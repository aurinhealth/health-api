import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStrengthPlan,EXERCISES } from '../src/strength-generator.js';
import { sportMuscleLoad,strengthCoverage } from '../src/strength-balance.js';
import { coachInstructions,coachContext } from '../src/coach-assistant.js';

const base=()=>({date:'2026-10-04',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],plannedWorkouts:[]},recovery:{},strength:{recentCompletedSets:[]}});
const muscles=plan=>new Set(plan.loadEstimates.map(x=>EXERCISES[x.exercise].muscle));
for(const type of ['Ride','Run','RockClimbing'])test(type+' changes the dose while preserving whole-body strength patterns',()=>{
  const context=base();context.sports={recentActivities:[{id:type,date:'2026-10-03',type,durationHours:2,tss:110}]};
  const plan=generateStrengthPlan(context,{maxExercises:8});
  assert.ok(muscles(plan).has('quads')||muscles(plan).has('hamstrings'));
  assert.ok(muscles(plan).has('chest'));assert.ok(muscles(plan).has('back'));
  const patterns=new Set(plan.loadEstimates.map(x=>EXERCISES[x.exercise].pattern));assert.ok(patterns.has('pull'));assert.ok(patterns.has('pull_vertical'));
  const stressed=plan.loadEstimates.filter(x=>(plan.balance.sportMuscleLoad[EXERCISES[x.exercise].muscle]||0)>=1);
  assert.ok(stressed.length);assert.ok(stressed.every(x=>x.reducedDose&&x.sets<=2));
  const usual=generateStrengthPlan(base(),{maxExercises:8});
  for(const x of stressed){const previous=usual.loadEstimates.find(p=>p.exercise===x.exercise);if(previous?.kg!=null)assert.ok(x.kg<=previous.kg);}
  assert.match(plan.rationale,/nenahrazuje.*silový trénink/);
});
test('sports do not count as completed strength coverage; future and warmup sets do not count either',()=>{
  const context=base();context.sports={recentActivities:[{date:'2026-10-03',type:'Ride',durationHours:3}]};
  context.strength.recentCompletedSets=[{exercise:'Pivot leg press',workout_date:'2026-10-03',type:'WARMUP'},{exercise:'Pivot leg press',workout_date:'2026-10-05',type:'WORK'},{exercise:'Lat pulldown',workout_date:'2026-10-02',type:'WORK',completed:true}];
  const coverage=strengthCoverage(context,EXERCISES);
  assert.equal(coverage.lastStrengthDateByMuscle.quads,undefined);assert.ok(coverage.undertrainedMuscles.includes('quads'));
  assert.equal(coverage.setsLast7Days.back,1);
});
test('sport load is dated, deduplicated, bounded and fades',()=>{
  const context=base(),ride={id:'1',date:'2026-10-03',type:'Ride',durationHours:2};
  context.cycling.recentActivities=[ride];context.sports={recentActivities:[ride,{id:'old',date:'2026-09-27',type:'Ride',durationHours:5},{id:'future',date:'2026-10-05',type:'Ride',durationHours:5}]};
  assert.equal(sportMuscleLoad(context).get('quads'),4/3);
  context.sports.recentActivities=[];context.cycling.recentActivities=[{...ride,date:'2026-10-02'}];
  assert.equal(sportMuscleLoad(context).get('quads'),2/3);
});
test('weekly reserve role does not permanently exclude legs; explicit upper-body choice is respected',()=>{
  const context=base();context.cycling.nextRide={name:'VO2',intensity:true,durationHours:1};
  const automatic=generateStrengthPlan(context,{focus:'upper',focusSource:'week'});
  assert.ok(muscles(automatic).has('quads')||muscles(automatic).has('hamstrings'));
  context.cycling.nextRide=null;
  const weekly=generateStrengthPlan(context,{focus:'upper',focusSource:'week'});
  assert.ok(weekly.loadEstimates.some(x=>x.reducedDose&&['quads','hamstrings'].includes(EXERCISES[x.exercise].muscle)));
  const manual=generateStrengthPlan(context,{focus:'upper'});
  assert.equal(manual.planName,'Upper Body');assert.ok(!muscles(manual).has('quads'));assert.ok(!muscles(manual).has('hamstrings'));
});
test('AI instructions distinguish sport load from strength coverage',()=>{
  assert.match(coachInstructions,/lezení záda a paže/);assert.match(coachInstructions,/nikdy není trvalým filtrem partií/);
});
test('AI sees recent completed strength sets instead of the oldest tail of descending history',()=>{
  const history=[{workout_date:'2026-10-03',exercise:'Pivot leg press',type:'WORK',completed:1},...Array.from({length:20},()=>({workout_date:'2026-08-01',exercise:'DB bench press',type:'WORK',completed:1}))];
  const context=coachContext({date:'2026-10-04',gym:{history}});
  assert.equal(context.gym.length,1);assert.equal(context.strengthCoverage.setsLast7Days.quads,1);assert.equal(context.strengthCoverage.setsLast7Days.chest,undefined);
});
