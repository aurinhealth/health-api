import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';
import {trainingHistory,starterPlan} from '../src/training-history.js';
import {completeOnboarding,onboardingStatus,trainingSetup,updateTrainingSetup} from '../src/onboarding.js';
import {getWeekPlan,saveWeekPlan} from '../src/week-planner.js';
import {loadEffectiveProfile} from '../src/profile-suggestions.js';
import {energyBaseline} from '../src/energy-profile.js';
const schema=readFileSync(new URL('../staging/schema.sql',import.meta.url),'utf8');
const NOW=Date.now(),DAY=86400000;
function db(){const raw=createD1();raw.sqlite.exec(schema);return {raw,a:scopedDb(raw,1),b:scopedDb(raw,2)};}
function activity(raw,{user=1,days=1,type='Ride',source='intervals',minutes=60,time='12:00:00',role=null}={}){
 const date=new Date(NOW-days*DAY).toISOString().slice(0,10),start=date+'T'+time;
 const payload=source==='google-wearables'?{exercise:{exerciseType:type,activeDuration:minutes*60+'s'}}:{type,moving_time:minutes*60};
 raw.sqlite.prepare('INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,sample_time,payload_json,record_role) VALUES(?,?,?,?,?,?,?,?)').run(user,source,source==='google-wearables'?'exercise':'activity',crypto.randomUUID(),start,start,JSON.stringify(payload),role);
}
test('automatic sport uses 8 weeks, volume uses 4 weeks and matching sources count once per account',async()=>{
 const {raw,a,b}=db();activity(raw);activity(raw,{source:'google-wearables',time:'12:10:00'});activity(raw,{days:3,type:'Run',minutes:30});
 for(let i=0;i<5;i++)activity(raw,{days:60+i,type:'Run'});
 activity(raw,{days:2,type:'Run',role:'duplicate'});activity(raw,{user:2,type:'Run'});
 const h=await trainingHistory(a,1,{now:NOW});assert.equal(h.mainSport,'general');assert.equal(h.recentCount,2);assert.equal(h.weeklyMinutes,Math.round(90/4));assert.equal(h.automaticSportAvailable,true);
 activity(raw,{days:5});assert.equal((await trainingHistory(a,1,{now:NOW})).mainSport,'cycling');assert.equal((await trainingHistory(b,2,{now:NOW})).mainSport,'running');
});
test('experience requires sustained observed training; a connected service alone supplies no history',async()=>{
 const {raw,a,b}=db();for(let week=0;week<12;week++)for(let day=1;day<=4;day++)activity(raw,{days:week*7+day});
 const h=await trainingHistory(a,1,{now:NOW});assert.equal(h.experience,'experienced');assert.ok(h.activeWeeks>=10);
 assert.equal((await trainingHistory(b,2,{now:NOW})).experience,'beginner');
 const status=await onboardingStatus({DB:b,USER_ID:2,CONNECTED_PROVIDERS:['google','intervals']});assert.equal(status.history.automaticSportAvailable,false);
});
test('all setup details can be skipped without invented weight or calorie target; starter budget appears only in Plan',async()=>{
 const {a}=db(),env={DB:a,USER_ID:1,CONNECTED_PROVIDERS:[]};
 const r=await completeOnboarding(env);assert.equal(r.completed,true);assert.equal(r.baseline.ready,false);assert.equal(r.weightKg,null);assert.equal(r.profile.mainSport,'general');assert.equal(r.profile.sportGoal,'');
 assert.equal((await trainingSetup(a)).experience,'beginner');assert.equal((await trainingSetup(a)).experienceMode,'auto');assert.equal((await trainingSetup(a)).equipment,'bodyweight');
 const prefs=await getWeekPlan(a);assert.equal(prefs.automatic.source,'starter');assert.equal(prefs.automatic.weeklyMinutes,105);assert.ok(prefs.availability[5].minutes>prefs.availability[0].minutes);
 assert.equal((await a.prepare('SELECT COUNT(*) n FROM week_plan_preferences WHERE user_id=?').bind(1).first()).n,0);
 assert.equal((await a.prepare('SELECT COUNT(*) n FROM health_datapoints WHERE user_id=?').bind(1).first()).n,0);
});
test('imports update experience and Plan budgets while sport focus stays general until explicitly chosen',async()=>{
 const {raw,a}=db(),env={DB:a,USER_ID:1};await completeOnboarding(env);
 assert.equal((await loadEffectiveProfile(a,1)).mainSport,'general');
 for(let week=0;week<12;week++)for(let day=1;day<=4;day++)activity(raw,{days:week*7+day});
 assert.equal((await loadEffectiveProfile(a,1)).mainSport,'general');assert.equal((await trainingSetup(a)).experience,'experienced');assert.equal((await getWeekPlan(a)).automatic.source,'history');
 await completeOnboarding(env,{profile:{mainSport:'running'},training:{experience:'regular'}});
 assert.equal((await loadEffectiveProfile(a,1)).mainSport,'running');assert.equal((await trainingSetup(a)).experience,'regular');
 await saveWeekPlan(a,{availability:Array.from({length:7},()=>({minutes:20}))});
 await completeOnboarding(env,{training:{experience:'auto'}});const prefs=await getWeekPlan(a);assert.equal(prefs.availability[0].minutes,20);assert.equal(prefs.automatic,undefined);
});
test('changing strength place preserves automatic experience and never completes unfinished onboarding',async()=>{
 const {a,b}=db();await updateTrainingSetup(a,{equipment:'gym'});const status=await onboardingStatus({DB:a});assert.equal(status.completed,false);assert.equal(status.training.experienceMode,'auto');assert.equal(status.training.equipment,'gym');
 assert.equal((await trainingSetup(b)).equipment,'bodyweight');
});
test('starter recommendations are separate from observed averages and optional sport estimates never block calories',()=>{
 const h={experience:'beginner',recentCount:0,recentActiveWeeks:0};assert.equal(starterPlan(h).source,'starter');assert.equal(starterPlan(h,'regular').weeklyMinutes,150);assert.equal(starterPlan(h,'experienced').weeklyMinutes,240);
 const profile={sex:'male',age:30,height:180,activity:'light',goal:'maintain',sportHours:'auto'};
 const baseline=energyBaseline(profile,80,{activityTracked:false});assert.equal(baseline.ready,true);assert.equal(baseline.sportDaily,0);assert.ok(Number.isFinite(baseline.baselineRestTDEE));
});
