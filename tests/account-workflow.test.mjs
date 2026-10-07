import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';
import {completeOnboarding,onboardingStatus,hasRecentActivityData} from '../src/onboarding.js';
import {subscriptionStatus,assertAIAccess} from '../src/subscription.js';
import {savePersonalFood,listPersonalFoods,deletePersonalFood,searchFoodCatalog} from '../src/personal-foods.js';
import {reportFood} from '../src/shared-foods.js';
import {saveRecipe,listRecipes,deleteRecipe,searchRecipes} from '../src/personal-recipes.js';
import {scheduleWorkoutInIntervals,getScheduledWorkouts} from '../src/workout-library.js';
import {movePlannedEvent,deletePlannedEvent,setPlannedEnvironment} from '../src/planned-events.js';
import {retryWorkoutExports,importedEventIsLocal,completeLocalWorkout} from '../src/local-workouts.js';
import {generateStrengthPlan} from '../src/strength-generator.js';
import {dashboardSyncStatus,startDashboardSync} from '../src/dashboard-sync.js';
const schema=readFileSync(new URL('../staging/schema.sql',import.meta.url),'utf8');
function setup(){const raw=createD1();raw.sqlite.exec(schema);const a=scopedDb(raw,1),b=scopedDb(raw,2);return {raw,a,b,env:{DB:a,USER_ID:1,CONNECTED_PROVIDERS:[]}};}
const input=()=>({profile:{sex:'male',age:30,height:180,activity:'light',sportHours:'3-6',goal:'maintain',mainSport:'cycling',sportGoal:'Zlepšit kondici'},weightKg:80,training:{experience:'beginner',equipment:'dumbbells',limitations:'',availability:Array.from({length:7},()=>({minutes:60}))}});
const food={name:'Test jogurt',brand:'Test',calories_100g:100,protein_100g:5,carbs_100g:11,fat_100g:4,nutrition_basis:'g'};
const recipe={name:'Jogurtová svačina',servings:2,ingredients:[{name:'Jogurt',quantity:200,unit:'g',calories:200,protein_g:10,carbs_g:22,fat_g:8}]};
test('account setup works without providers, persists per account and refuses an incomplete profile',async()=>{
 const {a,b,env}=setup();assert.equal((await onboardingStatus(env)).completed,false);
 const invalid=input();invalid.profile.sex='';await assert.rejects(completeOnboarding(env,invalid),/Doplň údaje/);assert.equal((await onboardingStatus(env)).completed,false);
 const result=await completeOnboarding(env,input());assert.equal(result.baseline.ready,true);assert.ok(result.baseline.sportDaily>0);
 assert.equal((await onboardingStatus(env)).completed,true);assert.equal((await onboardingStatus({...env,DB:b,USER_ID:2})).completed,false);
 await completeOnboarding(env,input());assert.equal((await a.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE user_id=? AND source_family='manual'").bind(1).first()).n,1);
 assert.equal(await hasRecentActivityData(a),false);
});
test('pilot grants AI to invited accounts; an enabled paywall checks server-side expiration',async()=>{
 const {a,env}=setup();assert.equal((await subscriptionStatus(env)).aiAccess,true);await assertAIAccess(env);
 const paid={...env,AI_PAYWALL_ENABLED:'true'};await assert.rejects(assertAIAccess(paid),e=>e.status===402);
 await a.prepare("INSERT INTO subscriptions(user_id,plan,valid_until) VALUES(1,'ai','2099-01-01')").run();assert.equal((await subscriptionStatus(paid)).aiAccess,true);
 await a.prepare("UPDATE subscriptions SET valid_until='2000-01-01' WHERE user_id=1").run();await assert.rejects(assertAIAccess(paid),e=>e.status===402);
 assert.equal((await subscriptionStatus({...paid,DB:scopedDb(setup().raw,2),USER_ID:2})).aiAccess,false);
});
test('food edits retain identity, preserve other accounts, replace shared values and accept one report per account',async()=>{
 const {a,b}=setup();const p=await savePersonalFood(a,food);const q=await savePersonalFood(b,food);
 const shared=(await searchFoodCatalog(b,'Test jogurt'))[0];assert.ok(shared);
 const changed=await savePersonalFood(a,{...p,name:'Přejmenovaný jogurt',calories_100g:110});assert.equal(changed.id,p.id);assert.equal((await listPersonalFoods(a)).length,1);assert.equal((await listPersonalFoods(b))[0].name,food.name);
 await assert.rejects(savePersonalFood(b,{...changed,id:'not-owned'}),/nebyla nalezena/);
 await deletePersonalFood(a,p.id);assert.equal((await listPersonalFoods(a)).length,0);assert.equal((await listPersonalFoods(b)).length,1);
 const candidate=(await searchFoodCatalog(a,'Test jogurt'))[0];assert.ok(candidate.catalog_id);assert.equal(candidate.id,undefined);
 await reportFood(a,{catalogId:candidate.catalog_id,reason:'Nesedí kalorie'});await reportFood(a,{catalogId:candidate.catalog_id,reason:'Nesedí tuky'});
 assert.equal((await searchFoodCatalog(a,'Test jogurt'))[0].reports,1);assert.equal((await searchFoodCatalog(a,'')).length,0);
 await deletePersonalFood(b,q.id);assert.equal((await searchFoodCatalog(a,'Test jogurt')).length,0);
});
test('recipes calculate portions, remain private unless shared and can be edited and deleted without cross-account access',async()=>{
 const {a,b}=setup();const r=await saveRecipe(a,recipe);assert.equal(r.portion.calories_100g,100);assert.equal((await searchRecipes(b,'Jogurtová')).length,0);
 await saveRecipe(a,{...r,shared:true});const found=(await searchRecipes(b,'Jogurtová'))[0];assert.equal(found.calories_100g,100);assert.ok(found.catalog_id);assert.equal(found.id,undefined);
 await assert.rejects(saveRecipe(b,{...r,name:'Útok'}),/nebylo nalezeno/);
 await saveRecipe(a,{...r,name:'Nové jídlo',servings:4,shared:false});assert.equal((await listRecipes(a)).length,1);assert.equal((await listRecipes(a))[0].portion.calories_100g,50);assert.equal((await searchRecipes(b,'Jogurtová')).length,0);
 await deleteRecipe(a,r.id);assert.equal((await listRecipes(a)).length,0);
});
test('offline workout scheduling, moving and environment edits persist; completion enters local history',async()=>{
 const {a,env}=setup(),args={workoutId:'pfd-vo2-5x4x112-90',date:'2026-10-10',confirm:true};
 const scheduled=await scheduleWorkoutInIntervals(env,a,args);assert.equal(scheduled.sync.status,'not_connected');assert.ok(scheduled.eventId.startsWith('planned:local-'));
 const moved=await movePlannedEvent(env,{eventId:scheduled.eventId,date:'2026-10-11'});assert.equal(moved.status,'ok');
 await setPlannedEnvironment(env,{eventId:scheduled.eventId,environment:'outdoor'});const links=await getScheduledWorkouts(a);assert.equal(links[0].scheduled_date,'2026-10-11');assert.equal(links[0].environment,'outdoor');
 await completeLocalWorkout(a,scheduled.eventId,{minutes:83,rpe:6,notes:'Hotovo'});assert.equal((await getScheduledWorkouts(a))[0].status,'completed');
 const row=await a.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family='local' AND data_type='activity'").bind(1).first();assert.equal(JSON.parse(row.payload_json).moving_time,83*60);
});
test('an export outage preserves the app plan; retry is idempotent, import does not duplicate it, and deletion survives offline',async()=>{
 const {a,env}=setup(),original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>new Response('',{status:503});const scheduled=await scheduleWorkoutInIntervals({...env,INTERVALS_API_KEY:'test'},a,{workoutId:'pfd-vo2-5x4x112-90',date:'2026-10-12',confirm:true});assert.equal(scheduled.sync.status,'error');assert.equal((await getScheduledWorkouts(a)).length,1);
  globalThis.fetch=async(_,options)=>{calls++;assert.equal(JSON.parse(options.body)[0].external_id.startsWith('loadwise:1:local-'),true);return Response.json([{id:777,category:'WORKOUT'}]);};
  await retryWorkoutExports({...env,INTERVALS_API_KEY:'test'});await retryWorkoutExports({...env,INTERVALS_API_KEY:'test'});assert.equal(calls,1);assert.equal(await importedEventIsLocal(a,{id:777}),true);
  await deletePlannedEvent(env,{eventId:scheduled.eventId});assert.equal((await getScheduledWorkouts(a)).length,0);
  globalThis.fetch=async(_,options)=>{calls++;assert.equal(options.method,'DELETE');return new Response('',{status:200});};await retryWorkoutExports({...env,INTERVALS_API_KEY:'test'});assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
test('bodyweight plans never contain equipment-dependent exercises and beginners get at most two work sets per exercise',()=>{
 const context={date:'2026-10-12',strength:{recentCompletedSets:[]},cycling:{recentActivities:[],plannedWorkouts:[]},trainingSetup:{equipment:'bodyweight',experience:'beginner'}};
 const plan=generateStrengthPlan(context,{durationMinutes:45});const work=plan.rows.filter(r=>r[0]==='WORK');assert.ok(work.length>0);assert.ok(work.every(r=>['Push-up','Bodyweight squat','Glute bridge','Dead bug'].includes(r[1])));
 for(const name of new Set(work.map(r=>r[1])))assert.ok(work.filter(r=>r[1]===name).length<=2);
});
test('two initial providers start independently and status stays running while Google batches run',async()=>{
 const {a}=setup(),pending=[];const ctx={waitUntil:p=>pending.push(p)};
 await startDashboardSync(a,ctx,async()=>[{source:'google',status:'queued'}],'initial_google');await startDashboardSync(a,ctx,async()=>[{source:'intervals',status:'done'}],'initial_intervals');await Promise.all(pending);
 await a.prepare("INSERT INTO sync_status(user_id,sync_name,status) VALUES(1,'google','running')").run();assert.equal((await dashboardSyncStatus(a)).status,'running');
 await a.prepare("UPDATE sync_status SET status='completed' WHERE user_id=1 AND sync_name='google'").run();assert.equal((await dashboardSyncStatus(a)).status,'done');
});
