import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantAppContext,selectedAssistantContext} from '../src/assistant-app-context.js';
import {assistantTask} from '../src/coach-assistant.js';
import {validateCoachActions} from '../src/coach-actions.js';
import {assistantStreamResponse} from '../src/assistant-stream.js';
import {planValues} from '../src/gym-plan-store.js';
import {getWeekPlan,saveWeekPlan,addWeekSport} from '../src/week-planner.js';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';

const today='2026-10-05',sunday='2026-10-11';
const gym=date=>({values:planValues({date,rows:[['WORK','DB Arnold press','1','10','8–12','','','','FALSE','','','FALSE','']]}),history:[]});

test('screen context ignores supplied training results and invalid dates',()=>{
  const c=assistantAppContext({view:'unknown',date:'2026-02-30',weekStart:'invalid',sport:'swim',exercise:1,values:[['injected']]},today);
  assert.deepEqual(c,{view:'today',date:today,weekStart:today,sport:null,exercise:null});
});

test('selected future gym is loaded from storage while recovery date stays today',async()=>{
  const c=assistantAppContext({view:'workouts',date:sunday,sport:'gym',exercise:'DB Arnold press'},today),loaded=[];
  const inputs={date:today,gym:gym(today),week:{days:[{date:today},{date:sunday,daily:{training:{planned:[{name:'Ride'}]}}}]}};
  const result=await selectedAssistantContext(c,inputs,{loadGym:async d=>{loaded.push(d);return gym(d);},loadWeek:()=>assert.fail('Existing week must be reused'),loadPrefs:async()=>({days:[[],[],[],[],[],[],['ride']],availability:[]})});
  assert.deepEqual(loaded,[sunday]);assert.equal(inputs.date,today);assert.equal(result.selectedGym.date,sunday);assert.equal(result.appContext.exercise,'DB Arnold press');assert.equal(result.selectedDay.planned[0].name,'Ride');
  const actions=validateCoachActions([{type:'gym_swap',date:sunday,fromExercise:'DB Arnold press',toExercise:'DB shoulder press',reason:'Jednodušší tlak.'}],{gymPlan:result.gymPlan,athleteState:'active'},today);
  assert.equal(actions[0].date,sunday);assert.equal(validateCoachActions([{...actions[0],date:today}],{gymPlan:result.gymPlan},today).length,0);
});

test('a different selected week loads its own schedule and rejects unknown exercises',async()=>{
  const c=assistantAppContext({view:'workouts',date:'2026-11-01',sport:'gym',exercise:'Invented exercise'},today),requested=[];
  const result=await selectedAssistantContext(c,{date:today,week:{days:[{date:today}]}},{loadGym:async()=>gym(c.date),loadWeek:async start=>{requested.push(start);return {days:[{date:c.date,daily:{training:{planned:[{name:'Future ride'}]}}}]};},loadPrefs:async start=>{requested.push(start);return {days:[[],[],[],[],[],[],['ride']],availability:[]};}});
  assert.deepEqual(requested,['2026-10-26','2026-10-26']);assert.equal(result.appContext.exercise,null);assert.equal(result.selectedDay.planned[0].name,'Future ride');assert.equal(result.week.days.length,2);
});

test('brief followups on an open gym use the loaded training context',()=>{
  assert.equal(assistantTask('Uprav to',{sport:'gym'}),'adjustment');assert.equal(assistantTask('A jiný cvik?',{sport:'gym'}),'adjustment');assert.equal(assistantTask('Proč takhle?',{view:'workouts'}),'planning');assert.equal(assistantTask('Ahoj',{sport:'gym'}),'simple');
});

test('a confirmed gym addition preserves Sunday ride, availability and other weeks',async()=>{
  const raw=createD1(),db=scopedDb(raw,1),other=scopedDb(raw,2);
  const defaults={days:[['gym'],[],[],[],[],[],['ride']],availability:Array.from({length:7},()=>({minutes:90})),weeklyActivities:4};
  await saveWeekPlan(db,defaults);await saveWeekPlan(db,{...defaults,weeklyActivities:5},today);
  const action=validateCoachActions([{type:'week_sport',date:sunday,sport:'gym',reason:'Gym po kole.'}],{remainingPlanned:[{date:sunday,sport:'ride'}]},today)[0];
  assert.equal(action.type,'week_sport');await addWeekSport(db,action.date,action.sport);await addWeekSport(db,action.date,action.sport);
  const saved=await getWeekPlan(db,sunday);assert.deepEqual(saved.days[6],['ride','gym']);assert.deepEqual(saved.days[0],['gym']);assert.equal(saved.availability[6].minutes,90);assert.equal(saved.weeklyActivities,5);
  assert.deepEqual((await getWeekPlan(db,'2026-10-18')).days[6],['ride']);assert.deepEqual((await getWeekPlan(other,sunday)).days[6],[]);
  assert.deepEqual(validateCoachActions([{...action,date:'2026-10-04'}],{},today),[]);assert.deepEqual(validateCoachActions([action],{athleteState:'sick'},today),[]);
});

test('assistant progress appears before readable reply and validated actions',async()=>{
  const response=assistantStreamResponse(async(emit,progress)=>{progress('Načítám plán');emit('Připraveno');progress('Kontroluji návrhy');return {answer:'Připraveno',actions:[]};});
  const frames=(await response.text()).trim().split('\n').map(JSON.parse);assert.deepEqual(frames.map(f=>f.type),['start','progress','answer','progress','done']);
});
