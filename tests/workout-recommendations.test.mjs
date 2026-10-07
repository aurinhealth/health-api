import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CYCLING_WORKOUTS, defaultCapabilities, rankWorkoutCandidates, diversifyWorkoutCandidates, searchWorkoutLibrary, scheduleWorkoutInIntervals, stepRows, parseWorkoutSearchFilters} from '../src/workout-library.js';
import {flattenSteps, totalMinutes, renderForEnvironment, buildWorkout, step, intervalsText} from '../src/workout-model.js';
import {parseIntervalsDescription, parseStepLine, structureFromWorkoutDoc} from '../src/planned-detail.js';
import {scopedDb} from '../src/tenancy.js';
import {createD1} from './helpers/d1.mjs';

const filters = {system:'threshold', durationMinutes:90, durationTolerance:30, maxDifficulty:10, environment:'outdoor'};
const caps = defaultCapabilities(); caps.threshold.level = 4;
const workout = id => { const w=CYCLING_WORKOUTS.find(w=>w.id===id); assert.ok(w,id); return w; };
const rowsFor = (structure, options) => stepRows(structure, options).flatMap(b=>b.steps);
function testDb() {
  const raw=createD1();
  raw.sqlite.exec('CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,external_id TEXT,sample_time TEXT,start_time TEXT,end_time TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))');
  return scopedDb(raw,1);
}

for (const readiness of ['green','red']) test(`90 ±30 recommended selection varies durations, families and placement with ${readiness} readiness`,()=>{
  const ranked=rankWorkoutCandidates(CYCLING_WORKOUTS,filters,{readiness,hardBikeDaysRolling7d:1},caps);
  const top=diversifyWorkoutCandidates(ranked,filters,5);
  assert.equal(top.length,5);
  assert.equal(top[0].id,ranked[0].id,'the best day match still leads');
  assert.equal(new Set(top.map(w=>w.family)).size,5);
  assert.ok(new Set(top.map(w=>w.duration_minutes)).size>=3);
  assert.ok(top.every(w=>w.duration_minutes>=60&&w.duration_minutes<=120&&w.difficulty<=10&&w.primary_system==='threshold'));
  assert.ok(top.some(w=>w.tags_json.includes('late-quality')));
  assert.ok(top.some(w=>w.tags_json.includes('split-quality')));
  assert.ok(top.every(w=>w.score_points>=ranked[0].score_points-12),'variety retains similarly suitable options');
});

test('difficulty sorting is independent of suitability and the maximum remains a hard cap',async()=>{
  const db=scopedDb(createD1(),1);
  const result=await searchWorkoutLibrary(db,{...filters,sort:'difficulty',maxDifficulty:7,limit:15},{readiness:'red'});
  assert.equal(result.sort,'difficulty');
  assert.equal(result.workouts.length,15);
  assert.ok(result.workouts.every(w=>w.difficulty<=7));
  assert.ok(result.workouts.every((w,i,rows)=>!i||rows[i-1].difficulty>=w.difficulty));
  assert.ok(result.workouts[0].difficulty>6,'max difficulty does not accidentally choose the easiest');
  const nearest=await searchWorkoutLibrary(db,{...filters,sort:'duration',limit:15});
  assert.ok(nearest.workouts.every(w=>w.duration_minutes===90));
});

test('narrow duration filters and indoor-only restrictions survive diversification',()=>{
  for(const system of ['threshold','vo2max','anaerobic','sprint']) {
    const f={...filters,system,durationTolerance:5,maxDifficulty:6};
    const ranked=rankWorkoutCandidates(CYCLING_WORKOUTS,f,{readiness:'green'},caps);
    const selected=diversifyWorkoutCandidates(ranked,f,15);
    assert.ok(selected.length>0,system);
    assert.ok(selected.every(w=>w.duration_minutes>=85&&w.duration_minutes<=95&&w.difficulty<=6&&!w.indoor_only),system);
    assert.ok(selected.slice(0,5).every(w=>w.primary_system===system),system);
  }
});

test('the duration window includes the longer outdoor warm-up, including tolerance boundaries',async()=>{
  const result=await searchWorkoutLibrary(testDb(),{sport:'ride',system:'vo2max',durationMinutes:90,durationTolerance:30,environment:'outdoor',limit:100},{readiness:'green'});
  assert.ok(result.workouts.length>20);
  assert.ok(result.workouts.every(w=>w.duration_minutes>=60&&w.duration_minutes<=120));
  assert.ok(!result.workouts.some(w=>w.id==='pfd-vo2-5x3x115-120'),'123-minute outdoor version lies outside the requested range');
  for(const w of result.workouts)assert.equal(w.duration_minutes,Math.round(totalMinutes(JSON.parse(w.structure_json))),w.id);
});

test('late and split race workouts put real quality in the last part of the session',()=>{
  for(const id of ['pfd-thr-late-8-90','pfd-thr-split-8x10-90','pfd-thr-race-finish-8x10-90','pfd-vo2-late-3-90','pfd-ana-late-attacks-4-90','pfd-sprint-late-4-90']) {
    const w=workout(id),structure=JSON.parse(w.structure_json),steps=flattenSteps(structure);
    assert.equal(Math.round(totalMinutes(structure)),90,id);
    const threshold={threshold:95,vo2max:106,anaerobic:121,sprint:151}[w.primary_system];
    let elapsed=0;const late=[];
    for(const s of steps){if(s.power>=threshold&&elapsed>=60)late.push(s);elapsed+=s.durationMinutes;}
    assert.ok(late.length>0,id+' must contain quality after minute 60');
    const tags=JSON.parse(w.tags_json);
    if(tags.includes('split-quality'))assert.ok(steps.some(s=>s.power===67&&s.durationMinutes>=15),'long Z2 between quality blocks');
  }
});

test('controlled 30s efforts retain watts and cadence; they are never relabeled all-out',()=>{
  const threshold=renderForEnvironment(workout('pfd-thr-hard-start-4x5-90'),'outdoor');
  assert.match(threshold.intervals_description,/- 30s 126-134% 100-110rpm nástup/);
  assert.doesNotMatch(threshold.intervals_description,/freeride|naplno|% max/);
  const sprintStart=rowsFor(JSON.parse(threshold.structure_json),{environment:'outdoor',ftp:260}).find(s=>s.durationSeconds===30);
  assert.equal(sprintStart.free,false);
  assert.equal(sprintStart.wattsLow,328);
  assert.equal(sprintStart.wattsHigh,348);
  assert.equal(sprintStart.cadence,'100-110');
  const vo2=renderForEnvironment(workout('pfd-vo2-30-30-2x8-90'),'outdoor');
  assert.match(vo2.intervals_description,/- 30s 121-129% 100-110rpm/);
  assert.doesNotMatch(vo2.intervals_description,/freeride|naplno/);
});

test('true maximal efforts have no FTP target indoors or outdoors, including Wingate',()=>{
  for(const id of ['pfd-sprint-10-8-75','pfd-sprint-standing-6-90','research-sit-4-6x30'])for(const environment of ['indoor','outdoor']) {
    const w=renderForEnvironment(workout(id),environment),steps=rowsFor(JSON.parse(w.structure_json),{ftp:260,environment});
    const efforts=steps.filter(s=>s.free);
    assert.ok(efforts.length>0,id);
    assert.ok(efforts.every(s=>s.wattsLow==null&&s.wattsHigh==null));
    assert.match(w.intervals_description,/freeride .*rpm .*naplno/);
    assert.doesNotMatch(w.intervals_description,/% max/);
    const roundtrip=flattenSteps(parseIntervalsDescription(w.intervals_description));
    assert.ok(roundtrip.some(s=>s.free&&s.cadence&&/naplno/.test(s.note)),id+' retains free effort and cadence in planned detail');
  }
  // High % FTP alone also does not make a prescribed effort all-out.
  const fixed=buildWorkout({id:'fixed',name:'controlled',system:'anaerobic',structure:[step(15,55),step(.5,160,'100-110','kontrolovaně'),step(10,50)]});
  assert.match(renderForEnvironment(fixed,'outdoor').intervals_description,/30s 156-164% 100-110rpm kontrolovaně/);
});

test('provider free/max-effort flags override an indicative target in planned detail',()=>{
  const rows=structureFromWorkoutDoc({steps:[{duration:10,maxeffort:true,power:{value:200,units:'%ftp'},cadence:{start:100,end:120}},{duration:30,freeride:true,power:{value:175,units:'%ftp'}}]});
  assert.ok(rows.every(s=>s.free&&!('power' in s)));
  assert.equal(rows[0].cadence,'100–120');
  assert.equal(parseStepLine('- 10s maxeffort Z7 110rpm').free,true);
});

test('all prescribed cadence targets round-trip outdoors, including low-cadence drills',()=>{
  const w=renderForEnvironment(workout('pfd-tempo-force-3x8-90'),'outdoor');
  assert.match(w.intervals_description,/8m 79-85% 55-65rpm nízká kadence/);
  const source=flattenSteps(JSON.parse(w.structure_json));
  const parsed=flattenSteps(parseIntervalsDescription(w.intervals_description));
  assert.equal(parsed.length,source.length);
  source.forEach((s,i)=>assert.equal(parsed[i].cadence,s.cadence?.replace(/-/g,'–'),String(i)));
  assert.match(intervalsText([step(5,90,'85–95')],{environment:'outdoor'}),/85-95rpm/);
});

test('the actual Intervals schedule request carries outdoor cadence and controlled power',async()=>{
  const original=globalThis.fetch;let sent;
  globalThis.fetch=async(_url,init)=>{sent=JSON.parse(init.body);return Response.json([{id:4321,category:'WORKOUT'}]);};
  try {
    const result=await scheduleWorkoutInIntervals({INTERVALS_API_KEY:'fixture'},testDb(),{workoutId:'pfd-thr-hard-start-4x5-90',date:'2026-10-10',environment:'outdoor',confirm:true});
    assert.equal(result.status,'ok');
    assert.match(sent[0].description,/- 30s 126-134% 100-110rpm nástup/);
    assert.doesNotMatch(sent[0].description,/% max|sprint naplno/);
  }finally{globalThis.fetch=original;}
});

test('the frontend query and backend parser preserve explicit ordering',()=>{
  const client=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
  const fn=client.match(/function librarySearchQuery\(f\)\{[\s\S]*?\n\}/)[0];
  const query=vm.runInNewContext(fn+'; librarySearchQuery({sport:"ride",sort:"difficulty",duration:90,tolerance:30,difficulty:10});',{URLSearchParams});
  const parsed=parseWorkoutSearchFilters(new URLSearchParams(query));
  assert.equal(parsed.sort,'difficulty');
  assert.equal(parsed.maxDifficulty,10);
  assert.equal(parsed.durationTolerance,30);
  assert.match(client,/sort:\$\("workoutSort"\)/);
});
