import test from 'node:test';
import assert from 'node:assert/strict';
import {gymExerciseCatalog,findGymExercises,gymAlternatives,catalogueStartLoad} from '../src/gym-catalog.js';
import {EXERCISES} from '../src/strength-generator.js';
import {EXERCISE_INTELLIGENCE} from '../src/strength-intelligence.js';
import { serverSource } from "./helpers/server-source.mjs";

test('picker offers only canonical plan exercises with set prescriptions',()=>{
  const catalog=gymExerciseCatalog();
  assert.equal(catalog.length,Object.keys(EXERCISES).length);
  assert.ok(catalog.every(item=>EXERCISES[item.name]&&item.sets>0&&item.reps));
  assert.equal(findGymExercises('dřep',catalog).some(item=>item.name==='Pendulum squat'),true);
  assert.equal(findGymExercises('triceps',catalog).some(item=>item.name==='Cable triceps extension'),true);
  assert.deepEqual(findGymExercises('náhodný cvik',catalog),[]);
});

test('every picker exercise has a fatigue for ordering an added exercise in the app',()=>{
  assert.ok(gymExerciseCatalog().every(item=>Number.isFinite(EXERCISE_INTELLIGENCE[item.name]?.fatigue)));
  const src=serverSource();
  assert.match(src,/fatigue:EXERCISE_INTELLIGENCE\[e\.name\]\?\.fatigue\?\?null/);
});

test('a swapped-in exercise never done before still gets a weight (Petr 2026-11-12)',()=>{
  // No history: the generator's catalogue start, never an empty kg.
  const alts=gymAlternatives('Barbell bench press',[],[],{},()=>true,{sex:'male',experience:'regular'});
  assert.ok(alts.length>0);
  assert.ok(alts.filter(a=>EXERCISES[a.name].baseKg>0).every(a=>a.kg>0&&a.source==='catalogue-default'));
  // Lighter for a woman and below the experienced level, as the generator.
  const male=catalogueStartLoad('Lat pulldown',{sex:'male',experience:'experienced'}).kg;
  assert.ok(catalogueStartLoad('Lat pulldown',{sex:'female',experience:'experienced'}).kg<male);
  assert.ok(catalogueStartLoad('Lat pulldown',{sex:'male',experience:'beginner'}).kg<male);
  // Own history still wins.
  const history=[{workout_date:'2026-11-01',exercise:'Barbell Floor Press',actual_kg:70,actual_reps:8,rpe:8,set_type:'WORK',completed:1}];
  const own=gymAlternatives('Barbell bench press',history).find(a=>a.name==='Barbell Floor Press');
  assert.equal(own.kg,70);assert.equal(own.source,'own-history');
});
