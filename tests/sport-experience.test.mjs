import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';
import {sportExperience,epley1rm} from '../src/training-history.js';
import {trainingSetup,updateTrainingSetup} from '../src/onboarding.js';
const schema=readFileSync(new URL('../staging/schema.sql',import.meta.url),'utf8');
// Sessions of one sport: n per month for the given months (YYYY-MM).
const sessions=(kind,months,n=4,extra={})=>months.flatMap(m=>Array.from({length:n},(_,i)=>({kind,date:`${m}-${String(i*7+5).padStart(2,'0')}`,minutes:60,...extra})));
const monthsFrom=(year,month,count)=>Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(year,month-1+i,1));return d.toISOString().slice(0,7);});
test('no data is a beginner in every sport',()=>{
  assert.deepEqual(sportExperience(),{strength:'beginner',ride:'beginner',run:'beginner',swim:'beginner'});
});
test('months with training set the level; a long pause does not lower it',()=>{
  // 14 months of gym, then an 8-month injury pause: still experienced.
  const gym=sessions('strength',monthsFrom(2024,11,14));
  assert.equal(sportExperience({activities:gym}).strength,'experienced');
  assert.equal(sportExperience({activities:sessions('strength',monthsFrom(2026,4,5))}).strength,'regular');
  assert.equal(sportExperience({activities:sessions('strength',monthsFrom(2026,8,2))}).strength,'beginner');
  // Fewer than 4 sessions a month do not count as an active month.
  assert.equal(sportExperience({activities:sessions('ride',monthsFrom(2025,1,10),3)}).ride,'beginner');
  assert.equal(sportExperience({activities:sessions('ride',monthsFrom(2025,1,10))}).ride,'regular');
});
test('estimated 1RM against body weight raises the gym level',()=>{
  assert.equal(Math.round(epley1rm(100,5)),117);
  const set=(exercise,kg,reps)=>({workout_date:'2026-10-01',exercise,actual_kg:kg,actual_reps:reps});
  assert.equal(sportExperience({strengthSets:[set('Barbell back squat',70,5)],weightKg:80}).strength,'regular');
  assert.equal(sportExperience({strengthSets:[set('Barbell bench press',75,8)],weightKg:80}).strength,'experienced');
  assert.equal(sportExperience({strengthSets:[set('Trap bar deadlift',130,5)],weightKg:80}).strength,'experienced');
  assert.equal(sportExperience({strengthSets:[set('Barbell back squat',70,5)]}).strength,'beginner','no body weight, no ratio');
});
test('FTP in W/kg, threshold pace and running volume',()=>{
  assert.equal(sportExperience({ftp:290,weightKg:80}).ride,'experienced');
  assert.equal(sportExperience({ftp:250,weightKg:80}).ride,'beginner');
  assert.equal(sportExperience({runThresholdPace:280}).run,'experienced');
  assert.equal(sportExperience({activities:sessions('run',['2026-09'],4,{distanceKm:35})}).run,'regular');
  assert.equal(sportExperience({activities:sessions('run',['2026-09'],4,{thresholdSpeed:1000/270})}).run,'experienced');
});
test('another sport raises a level by one step at most',()=>{
  const cyclist=sportExperience({activities:sessions('ride',monthsFrom(2024,10,25))});
  // Swimming is technique: riding does not raise it.
  assert.deepEqual(cyclist,{strength:'regular',ride:'experienced',run:'regular',swim:'beginner'});
  assert.equal(sportExperience({activities:sessions('ride',monthsFrom(2026,1,5))}).strength,'regular');
});
test('settings: per-sport auto/manual, the old single experience is the gym manual level',async()=>{
  const raw=createD1();raw.sqlite.exec(schema);const db=scopedDb(raw,1);
  await db.prepare('CREATE TABLE IF NOT EXISTS user_setup (user_id INTEGER PRIMARY KEY,completed_at TEXT,training_json TEXT NOT NULL DEFAULT \'{}\')').run();
  await db.prepare('INSERT INTO user_setup(user_id,training_json) VALUES(1,?)').bind(JSON.stringify({experience:'experienced'})).run();
  let t=await trainingSetup(db);
  assert.deepEqual(t.experienceBySport.strength,{mode:'manual',level:'experienced',autoLevel:'beginner'});
  assert.deepEqual(t.experienceBySport.ride,{mode:'auto',level:'beginner',autoLevel:'beginner'});
  assert.equal(t.experience,'experienced');
  t=await updateTrainingSetup(db,{experienceBySport:{ride:'regular'}});
  assert.equal(t.experienceBySport.ride.level,'regular');assert.equal(t.experienceBySport.strength.level,'experienced');
  t=await updateTrainingSetup(db,{experience:'auto'});
  assert.equal(t.experienceBySport.strength.mode,'auto');assert.equal(t.experienceBySport.ride.mode,'manual');assert.equal(t.experienceMode,'auto');
});
