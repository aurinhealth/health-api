import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { parseTimeWindow, normalizeAvailability, trainingBudget, validDay } from '../src/training-availability.js';
import { getWeekPlan, saveWeekPlan, resetWeekPlan, sanitizeWeekPlan, nightlyGymSkip } from '../src/week-planner.js';
import { getAthleteState, updateAthleteState, proactiveAdvice, explicitPreference } from '../src/athlete-state.js';
import { capWeekTargets, weekProposal, environmentFor, activityHistoryEstimate } from '../src/adaptive-week.js';
import { askCoach, assistantTask } from '../src/coach-assistant.js';
import { scheduleWorkoutInIntervals, CYCLING_WORKOUTS } from '../src/workout-library.js';
import { validateCoachActions } from '../src/coach-actions.js';
import { deletePlannedEvent } from '../src/planned-events.js';

test('availability means duration and retires legacy clock positions and sport preferences',()=>{
  assert.deepEqual(parseTimeWindow('10-15'),{start:'10:00',end:'15:00',minutes:300});
  assert.equal(parseTimeWindow('10:30–15:00').minutes,270);
  assert.throws(()=>parseTimeWindow('15-10'));
  assert.throws(()=>parseTimeWindow('24-25'));
  assert.equal(validDay('2026-02-30'),false);
  assert.equal(validDay('2026-99-99'),false);
  const p=sanitizeWeekPlan({availability:[{window:'10–15',minutes:180},{minutes:0}]});
  assert.equal(trainingBudget(p,'2026-10-05',240),180);
  assert.equal(trainingBudget(p,'2026-10-06',60),0);
  assert.deepEqual(normalizeAvailability([{window:'10-11',minutes:180,preferredSports:['ride']}])[0],{window:'',minutes:180,preferredSports:[]});
  assert.equal(normalizeAvailability([{window:'10-15'}])[0].minutes,300);
});
test('a week override expires by week and preserves defaults and other users',async()=>{
  const raw=createD1(),a=scopedDb(raw,1),b=scopedDb(raw,2);
  await saveWeekPlan(a,{availability:[{minutes:180}],days:[['ride']],weeklyActivities:3});
  await saveWeekPlan(a,{availability:[{minutes:30}],days:[['gym']],weeklyActivities:1},'2026-10-06');
  assert.equal((await getWeekPlan(a,'2026-10-05')).availability[0].minutes,30);
  assert.equal((await getWeekPlan(a,'2026-10-12')).availability[0].minutes,180);
  assert.equal((await getWeekPlan(a)).weeklyActivities,3);
  assert.equal((await getWeekPlan(b,'2026-10-05')).availability[0].minutes,null);
  await resetWeekPlan(a,'2026-10-05');
  assert.equal((await getWeekPlan(a,'2026-10-05')).availability[0].minutes,180);
});
test('the total budget includes existing sessions and never assigns a no-time day',()=>{
  const prefs=sanitizeWeekPlan({availability:[{minutes:90},{minutes:0}]});
  const targets={items:[{date:'2026-10-05',sport:'ride',minutes:90,tss:60},{date:'2026-10-05',sport:'gym',minutes:60,tss:30},{date:'2026-10-06',sport:'ride',minutes:60,tss:40}]};
  const r=capWeekTargets(targets,prefs,[{date:'2026-10-05',daily:{training:{completed:[{type:'Run',durationHours:.5}]}}}]);
  assert.ok(r.items.reduce((n,x)=>n+x.minutes,0)<=60);
  assert.equal(r.items.filter(x=>x.date==='2026-10-06').length,0);
});
test('an empty week uses availability and activity count without requiring CTL',()=>{
  const prefs=sanitizeWeekPlan({weeklyActivities:2,availability:[{minutes:180},{minutes:0},{minutes:60},{minutes:0},{minutes:0},{minutes:90},{minutes:0}]});
  const p=weekProposal({prefs,start:'2026-10-05',today:'2026-10-05',state:{status:'active'},focus:{sport:'cycling'}});
  assert.equal(p.items.length,2);
  assert.ok(p.items.every(x=>['2026-10-05','2026-10-07','2026-10-10'].includes(x.date)));
  assert.equal(p.targets.status,'estimated');
  assert.equal(weekProposal({prefs,start:'2026-10-05',today:'2026-10-05',state:{status:'sick'}}).items.length,0);
});
test('missing or short history uses a clear, bounded fallback instead of extrapolating a burst of activity',()=>{
  assert.equal(activityHistoryEstimate([],'2026-10-05').status,'empty');
  const short=[{date:'2026-10-04',daily:{training:{completed:Array(9).fill({type:'Ride'})}}}];
  const estimate=activityHistoryEstimate(short,'2026-10-05');
  assert.equal(estimate.status,'short');assert.equal(estimate.count,3);assert.match(estimate.message,/2 týdny a 4 aktivity/);
  const prefs=sanitizeWeekPlan({availability:Array(7).fill({minutes:60})});
  const proposal=weekProposal({prefs,start:'2026-10-05',today:'2026-10-05',history:short});
  assert.equal(proposal.items.length,3);assert.ok(proposal.warnings.some(w=>w.text.includes('Historie je zatím krátká')));
  const manual=weekProposal({prefs:{...prefs,weeklyActivities:2},start:'2026-10-05',today:'2026-10-05',history:short});
  assert.equal(manual.items.length,2);assert.ok(!manual.warnings.some(w=>w.text.includes('Historie je zatím krátká')));
});
test('enough recent history estimates frequency for future weeks from the same recent sample',()=>{
  const history=['2026-09-15','2026-09-19','2026-09-22','2026-09-25','2026-09-29','2026-10-02'].map(date=>({date,daily:{training:{completed:[{type:'Ride'}]}}}));
  const estimate=activityHistoryEstimate(history,'2026-10-05');assert.equal(estimate.status,'ready');assert.equal(estimate.count,2);
  const prefs=sanitizeWeekPlan({availability:Array(7).fill({minutes:60})});
  assert.equal(weekProposal({prefs,start:'2026-10-12',today:'2026-10-05',history}).items.length,2);
});
test('winter and bad weather choose shorter indoor cycling with explicit fallback',()=>{
  assert.equal(environmentFor('2026-12-14','ride').environment,'indoor');
  assert.equal(environmentFor('2026-07-13','ride',{max:22,rain:5}).environment,'indoor');
  assert.match(environmentFor('2026-07-13','run').reason,/není dostupná/);
  const p=sanitizeWeekPlan({availability:[{minutes:180}]});
  assert.equal(capWeekTargets({items:[{date:'2026-12-14',sport:'ride',minutes:180,tss:120}]},p).items[0].minutes,90);
});
test('state, preference memory and conversations belong to one user',async()=>{
  const raw=createD1(),a=scopedDb(raw,1),b=scopedDb(raw,2);
  const m=explicitPreference('Nemám rád masáže');assert.ok(m);
  await updateAthleteState(a,{status:'injured',note:'koleno',memory:m,turn:[{role:'user',content:'Kompromis?'}]});
  assert.equal((await getAthleteState(a)).status,'injured');
  assert.equal((await getAthleteState(b)).status,'active');
  assert.deepEqual((await getAthleteState(b)).memories,[]);
  assert.match(await nightlyGymSkip(a,'2026-10-05'),/pozastavuje/);
  await updateAthleteState(a,{forget:m});assert.deepEqual((await getAthleteState(a)).memories,[]);
});
test('multiple recent recovery signals suggest a break, never diagnose sickness',()=>{
  const input={date:'2026-10-05',fitness:{wellness:[{id:'2026-10-05',tsb:-30}]},health:{sleep:[{date:'2026-10-05',durationMin:280}]},state:{status:'active'}};
  const a=proactiveAdvice(input);assert.equal(a.status,'on_break');
  assert.equal(proactiveAdvice({...input,health:{sleep:[]}}),null);
  assert.equal(proactiveAdvice({...input,state:{status:'active',dismissed:[a.id]}}),null);
  assert.equal(proactiveAdvice({...input,state:{status:'sick'}}),null);
});
test('scheduling respects a pause and a clock window before external writes',async()=>{
  const raw=createD1(),db=scopedDb(raw,1);
  await updateAthleteState(db,{status:'sick'});
  await assert.rejects(scheduleWorkoutInIntervals({INTERVALS_API_KEY:'test'},db,{workoutId:CYCLING_WORKOUTS[0].id,date:'2026-10-05',confirm:true}),/Sick/);
});
test('simple, planning and block requests route to configurable Luna and Sol',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json({model:body.model,output_text:'Odpověď'});};
  try{
    const env={OPENAI_API_KEY:'test',OPENAI_LIGHT_MODEL:'gpt-6-luna',OPENAI_MODEL:'gpt-6-sol'};
    await askCoach(env,'Díky!',{fitness:Array(30).fill({ctl:40})});
    await askCoach(env,'Naplánuj zítřejší posilovnu',{});
    await askCoach(env,'Analyzuj 12týdenní blok',{});
    await askCoach(env,'Jaké mám FTP?',{date:'2026-10-05',thresholds:{ftp:265}});
    // Quick and simple on Luna; plans and analysis on Sol, with a low effort to keep tokens down.
    assert.deepEqual(calls.map(c=>c.model),['gpt-6-luna','gpt-6-sol','gpt-6-sol','gpt-6-luna']);
    assert.deepEqual(calls.map(c=>c.reasoning.effort),['low','low','low','low']);assert.deepEqual(calls.map(c=>c.max_output_tokens),[4000,16000,25000,6000]);
    // A quick question still sees the athlete's data.
    assert.match(calls[3].input[0].content,/"ftp":265/);
    assert.ok(calls.every(c=>c.store===false));
    // The effort of complex answers can be raised on the server.
    await askCoach({...env,OPENAI_REASONING_EFFORT:'medium'},'Naplánuj zítřejší posilovnu',{});
    assert.equal(calls.at(-1).reasoning.effort,'medium');
    // Without OPENAI_MODEL the complex model is Sol.
    await askCoach({OPENAI_API_KEY:'test'},'Naplánuj zítřejší posilovnu',{});
    assert.equal(calls.at(-1).model,'gpt-6-sol');
    assert.equal(assistantTask('Poslední tři týdny a nový plán'),'planning');
  }finally{globalThis.fetch=original;}
});

test('assistant actions cannot invent events, dates or illness from sensor data',()=>{
  const context={userMessage:'Mám málo spánku. Změníme plán?',week:[{date:'2026-10-10',planned:[{id:'planned:12',name:'Long ride',durationHours:3}]}]};
  const raw=[{type:'rest',eventId:'planned:99',reason:'Odpočinek'},{type:'move',eventId:'planned:12',date:'2026-10-11',reason:'Více času'},{type:'status',status:'sick',reason:'Málo spánku'},{type:'workout',sport:'ride',date:'2026-02-30',minutes:60,reason:'Alternativa'}];
  const accepted=validateCoachActions(raw,context,'2026-10-05');
  assert.equal(accepted.length,1);assert.equal(accepted[0].type,'move');assert.equal(accepted[0].eventSnapshot.date,'2026-10-10');
  assert.equal(validateCoachActions([{type:'status',status:'injured',reason:'Bolest kolene'}],{userMessage:'Bolí mě koleno'},'2026-10-05')[0].status,'injured');
});

test('three confirmed library workouts can exceed the day budget without using legacy clock positions',async()=>{
  const db=scopedDb(createD1(),1),original=globalThis.fetch,events=[];
  await db.prepare('CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))').run();
  const workout=CYCLING_WORKOUTS.find(w=>w.duration_minutes===60&&w.primary_system==='endurance');assert.ok(workout);
  await saveWeekPlan(db,{availability:[{window:'10-15',minutes:65}]});
  globalThis.fetch=async(_,opts)=>{const event=JSON.parse(opts.body)[0];events.push(event);return Response.json([{id:122+events.length,category:'WORKOUT'}]);};
  try{
    await scheduleWorkoutInIntervals({INTERVALS_API_KEY:'test'},db,{workoutId:workout.id,date:'2026-10-05',environment:'indoor',confirm:true});
    assert.equal(events[0].start_date_local,'2026-10-05T00:00:00');
    const others=CYCLING_WORKOUTS.filter(w=>w.duration_minutes===60&&w.id!==workout.id).slice(0,2);
    for(const other of others)assert.equal((await scheduleWorkoutInIntervals({INTERVALS_API_KEY:'test'},db,{workoutId:other.id,date:'2026-10-05',environment:'indoor',confirm:true})).status,'ok');
    assert.equal(events.length,3);
    assert.equal(events.reduce((sum,e)=>sum+e.moving_time/60,0),180);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM workout_schedule_links WHERE user_id=?').bind(db.userId).first()).count,3);
    assert.equal((await scheduleWorkoutInIntervals({INTERVALS_API_KEY:'test'},db,{workoutId:workout.id,date:'2026-10-05',confirm:true})).status,'already_scheduled');
    assert.equal(events.length,3);
  }finally{globalThis.fetch=original;}
});

test('a replacement can be saved before deleting the original even with a 150 minute day budget',async()=>{
  const db=scopedDb(createD1(),1),original=globalThis.fetch;
  await db.prepare('CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))').run();
  await saveWeekPlan(db,{availability:[{minutes:150}]});
  await db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,start_time,external_id,payload_json) VALUES(1,'intervals','planned-workout','2026-10-05T09:00:00','planned:99',?)").bind(JSON.stringify({id:99,type:'Ride',duration:9000})).run();
  const workout=CYCLING_WORKOUTS.find(w=>w.duration_minutes===120&&w.primary_system==='endurance');
  globalThis.fetch=async()=>Response.json([{id:123,category:'WORKOUT'}]);
  try{
    assert.equal((await scheduleWorkoutInIntervals({INTERVALS_API_KEY:'test'},db,{workoutId:workout.id,date:'2026-10-05',confirm:true})).status,'ok');
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM health_datapoints WHERE user_id=? AND data_type='planned-workout'").bind(db.userId).first()).count,2);
    await deletePlannedEvent({DB:db,INTERVALS_API_KEY:'test'},{eventId:'planned:99'});
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM health_datapoints WHERE user_id=? AND data_type='planned-workout'").bind(db.userId).first()).count,1);
    await saveWeekPlan(db,{availability:[{minutes:0}]});
    const longer=CYCLING_WORKOUTS.find(w=>w.duration_minutes===180&&w.primary_system==='endurance');
    assert.equal((await scheduleWorkoutInIntervals({INTERVALS_API_KEY:'test'},db,{workoutId:longer.id,date:'2026-10-05',confirm:true})).status,'ok');
  }finally{globalThis.fetch=original;}
});
