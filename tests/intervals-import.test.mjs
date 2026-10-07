import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';
import legacy from '../src/index.js';
import {initialImport,recentDashboardImport} from '../src/account-sync.js';
import {onboardingStatus, completeOnboarding} from '../src/onboarding.js';
import {dashboardSyncStatus, startDashboardSync} from '../src/dashboard-sync.js';
import {latestStoredWeight} from '../src/athlete-weight.js';
import {syncWeights} from '../src/weight-sync.js';
import {energyBaseline} from '../src/energy-profile.js';
import {pragueToday} from '../src/prague-date.js';
import {EXTRA_SCOPES} from '../src/google-scopes.js';
import {loadEffectiveProfile} from '../src/profile-suggestions.js';

const profile={sex:'female',age:30,height:165,activity:'light',goal:'maintain',weeklyHours:4,mainSport:'running'};
const schema=readFileSync(new URL('../staging/schema.sql',import.meta.url),'utf8');
function setup(){
  const raw=createD1();raw.sqlite.exec(schema);
  const db=scopedDb(raw,1),pending=[],ctx={waitUntil:p=>pending.push(p)};
  const env={DB:db,USER_ID:1,CONNECTED_PROVIDERS:['intervals'],INTERVALS_API_KEY:'test-key'};
  return {raw,db,env,ctx,pending};
}
const sync=(env,ctx,path='/sync/intervals')=>legacy.fetch(new Request('https://internal'+path,{method:'POST'}),env,ctx).then(r=>r.json());
const daily=(env,ctx)=>legacy.fetch(new Request('https://internal/analysis/daily?date='+pragueToday()),env,ctx).then(r=>r.json());
const point=(raw,user,source,type,at,value,id=crypto.randomUUID())=>raw.sqlite.prepare('INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,value_numeric,value_unit,payload_json) VALUES(?,?,?,?,?,?,?,\'kg\',\'{}\')').run(user,source,type,id,at,at,value);

test('Intervals-only initial import makes weight and profile nutrition available even when the calendar is forbidden',async t=>{
  const {db,env,ctx,pending}=setup();
  await completeOnboarding(env,{profile});
  assert.equal((await onboardingStatus(env)).baseline.ready,false);
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    const path=String(url);calls.push(path);
    assert.ok(opts.signal,'remote reads must have a deadline');
    if(path.includes('/activities?'))return Response.json([]);
    if(path.includes('/events?'))return new Response('private response body',{status:403});
    if(path.includes('/wellness?'))return Response.json([{id:pragueToday(),weight:60}]);
    throw new Error('Unexpected remote call: '+path);
  });
  await initialImport(env,ctx);await Promise.all(pending);
  const status=await dashboardSyncStatus(db);
  assert.equal(status.status,'partial');
  assert.equal(status.results[0].parts.planned.status,'error');
  assert.match(status.results[0].parts.planned.message,/HTTP 403/);
  assert.doesNotMatch(JSON.stringify(status),/private response body/);
  assert.equal(status.results[0].parts.weight.weights_saved,1);
  const setupStatus=await onboardingStatus(env),analysis=await daily(env,ctx);
  assert.equal(setupStatus.weightKg,60);
  assert.equal(setupStatus.baseline.ready,true);
  assert.equal(analysis.nutrition.energySource,'profile');
  assert.equal(analysis.nutrition.calorieTarget,setupStatus.baseline.baselineRestTDEE+setupStatus.baseline.sportDaily);
  assert.ok(analysis.nutrition.macros.protein_g>0);
  assert.deepEqual(analysis.nutrition.missing,[]);
  assert.ok(calls.every(url=>url.startsWith('https://intervals.icu/')));
  // A retry clears the partial state rather than treating it as a done import.
  t.mock.method(globalThis,'fetch',async url=>Response.json(String(url).includes('/wellness?')?[{id:pragueToday(),weight:61}]:[]));
  pending.length=0;await initialImport(env,ctx);await Promise.all(pending);
  assert.equal((await dashboardSyncStatus(db)).status,'done');
  assert.equal((await onboardingStatus(env)).weightKg,61);
});

test('Refresh imports a new Intervals-only weight after an already completed initial import',async t=>{
  const {db,env,ctx,pending}=setup();
  await startDashboardSync(db,ctx,async()=>[{source:'intervals',status:'done'}],'initial_intervals');await Promise.all(pending);pending.length=0;
  t.mock.method(globalThis,'fetch',async(url,opts={})=>{
    assert.equal(opts.method||'GET','GET');
    return Response.json(String(url).includes('/wellness?')?[{id:pragueToday(),weight:62}]:[]);
  });
  await initialImport(env,ctx);
  const run=await startDashboardSync(db,ctx,()=>recentDashboardImport(env,ctx));
  assert.equal(run.status,'running');await Promise.all(pending);
  assert.equal((await latestStoredWeight(db)).value_numeric,62);
  assert.equal((await dashboardSyncStatus(db)).status,'done');
});

test('a large history is saved in batches and a remote activity outage still imports weights',async t=>{
  const {raw,env,ctx}=setup();
  const batches=[],batch=raw.batch.bind(raw);raw.batch=async statements=>{batches.push(statements.length);return batch(statements);};
  // scopedDb closes over raw.batch, so the calls remain observable.
  const activities=Array.from({length:125},(_,i)=>({id:'i'+i,name:'Run',type:'Run',start_date_local:pragueToday()+'T07:00:00',moving_time:1800}));
  t.mock.method(globalThis,'fetch',async url=>Response.json(String(url).includes('/activities?')?activities:String(url).includes('/wellness?')?[{id:pragueToday(),weight:60}]:[]));
  const imported=await sync(env,ctx);
  assert.equal(imported.status,'ok');assert.equal(imported.activities.activities_saved,125);
  assert.ok(batches.filter(n=>n===50).length>=2);
  assert.equal((await raw.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE user_id=1 AND data_type='activity'").first()).n,125);
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('/activities?')?new Response('',{status:503}):Response.json(String(url).includes('/wellness?')?[{id:pragueToday(),weight:61}]:[]));
  const partial=await sync(env,ctx,'/sync/intervals/recent');
  assert.equal(partial.status,'partial');assert.match(partial.activities.message,/HTTP 503/);
  assert.equal((await latestStoredWeight(env.DB)).value_numeric,61);
});

test('a failed calendar write rolls back replacement and preserves other users',async t=>{
  const {raw,env,ctx}=setup(),date=pragueToday();
  raw.sqlite.exec("CREATE TRIGGER reject_bad_event BEFORE INSERT ON health_datapoints WHEN NEW.external_id='planned:bad' BEGIN SELECT RAISE(FAIL,'storage unavailable'); END");
  point(raw,1,'intervals','planned-workout',date,0,'planned:old');point(raw,2,'intervals','planned-workout',date,0,'planned:other');
  t.mock.method(globalThis,'fetch',async url=>Response.json(String(url).includes('/events?')?[{id:'bad',name:'Run',start_date_local:date}]:[]));
  const result=await sync(env,ctx);assert.equal(result.status,'partial');assert.equal(result.planned.status,'error');
  const rows=(await raw.prepare("SELECT external_id FROM health_datapoints WHERE data_type='planned-workout' ORDER BY user_id").all()).results;
  assert.deepEqual(rows.map(r=>r.external_id),['planned:old','planned:other']);
});

test('remote weights are stored locally even if writing to Google fails, and a deleted app copy is repaired',async t=>{
  const {env}=setup();let writes=0;
  const today=pragueToday();
  const deps={googleToken:async()=>{throw new Error('Google unavailable');},fetchImpl:async(url,opts={})=>{
    if(opts.method){writes++;throw new Error('No remote writes expected');}
    return Response.json([{id:today,weight:63}]);
  }};
  const connected={...env,CONNECTED_PROVIDERS:['google','intervals'],GOOGLE_SCOPES:[EXTRA_SCOPES.weightWrite]};
  await syncWeights(connected,deps);assert.equal((await latestStoredWeight(env.DB)).value_numeric,63);assert.equal(writes,0);
  await env.DB.prepare("DELETE FROM health_datapoints WHERE user_id=1 AND data_type='weight'").run();
  await syncWeights(env,deps);assert.equal((await latestStoredWeight(env.DB)).value_numeric,63);
  await env.DB.prepare("DELETE FROM health_datapoints WHERE user_id=1 AND data_type='weight'").run();
  await syncWeights(env,deps);assert.equal((await latestStoredWeight(env.DB)).value_numeric,63);
  t.diagnostic('export ledger entries cannot suppress storage of real measurements');
});

test('calculations pick the latest measurement across sources and ignore export bookkeeping',async()=>{
  const {raw,env}=setup();
  point(raw,1,'google-sources','weight','2026-10-01T10:00:00+02:00',70);
  point(raw,1,'intervals','weight','2026-10-01T09:00:00Z',71);
  point(raw,1,'manual','weight','2026-10-01T07:00:00Z',69);
  point(raw,1,'weight-sync','weight-written','2026-10-07T12:00:00Z',90);
  point(raw,2,'manual','weight','2026-10-07T13:00:00Z',100);
  await completeOnboarding(env,{profile});
  assert.equal((await onboardingStatus(env)).weightKg,71);
  assert.equal((await latestStoredWeight(env.DB)).source_family,'intervals');
  const analysis=await daily(env,{waitUntil(){}});
  assert.equal(analysis.nutrition.calorieTarget,energyBaseline(profile,71,{activityTracked:false}).baselineRestTDEE+energyBaseline(profile,71,{activityTracked:false}).sportDaily);
});

test('weekly hours provide a sport estimate without a history or resting heart rate',()=>{
  const baseline=energyBaseline(profile,60,{activityTracked:false});
  assert.equal(baseline.ready,true);assert.equal(baseline.sportDaily,Math.round(4*60*6/7));
  assert.equal(energyBaseline({...profile,sportHours:'0'},60,{activityTracked:false}).sportDaily,0);
  assert.equal(energyBaseline(profile,60,{activityTracked:true}).sportDaily,0);
});

test('the calculation profile works without any sport focus and history does not select a specialization',async()=>{
  const {raw,db,env,ctx}=setup();
  const basic={sex:'female',age:30,height:165,activity:'light',goal:'maintain'};
  const result=await completeOnboarding(env,{profile:basic,weightKg:60});
  assert.equal(result.baseline.ready,true);
  assert.equal(result.profile.mainSport,'general');
  assert.equal(result.profile.sportGoal,'');
  assert.equal(result.baseline.sportDaily,0);
  point(raw,1,'intervals','activity',pragueToday()+'T08:00:00',0,'activity:ride');
  await db.prepare("UPDATE health_datapoints SET payload_json=? WHERE user_id=1 AND external_id='activity:ride'").bind(JSON.stringify({id:'ride',type:'Ride',name:'Ride',start_date_local:pragueToday()+'T08:00:00',moving_time:3600})).run();
  await db.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(1,2,?)').bind(JSON.stringify({mainSport:'cycling'})).run();
  const status=await onboardingStatus(env);
  assert.equal(status.history.mainSport,'cycling');
  assert.equal(status.profile.mainSport,'general');
  assert.equal((await loadEffectiveProfile(db,1)).mainSport,'general');
  const analysis=await daily(env,ctx);assert.equal(analysis.nutrition.energySource,'profile');assert.ok(analysis.nutrition.calorieTarget>0);
  await completeOnboarding(env,{profile:{mainSport:'running',sportGoal:'Run 5 km'}});
  assert.equal((await loadEffectiveProfile(db,1)).mainSport,'running');
});

test('a recent sync stays running despite earlier partial imports; abandoned imports become retryable',async()=>{
  const {db,ctx,pending}=setup();
  await startDashboardSync(db,ctx,async()=>[{source:'intervals',status:'partial'}],'initial_intervals');await Promise.all(pending);
  await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,updated_at) VALUES(1,'dashboard_recent','running',datetime('now'))").run();
  assert.equal((await dashboardSyncStatus(db)).status,'running');
  await db.prepare("UPDATE sync_status SET status='running',updated_at=datetime('now','-6 minutes') WHERE user_id=1").run();
  assert.equal((await dashboardSyncStatus(db)).status,'partial');
  assert.equal((await db.prepare("SELECT status FROM sync_status WHERE user_id=1 AND sync_name='initial_intervals'").first()).status,'error');
});

test('explicit Intervals refresh retries full history after success, ignores Google and deduplicates concurrent clicks',async t=>{
  const {db,env,ctx,pending}=setup();
  await startDashboardSync(db,ctx,async()=>[{source:'intervals',status:'done'}],'initial_intervals');await Promise.all(pending);pending.length=0;
  let release;const blocked=new Promise(resolve=>{release=resolve;}),calls=[];
  t.mock.method(globalThis,'fetch',async url=>{calls.push(String(url));await blocked;return Response.json(String(url).includes('/wellness?')?[{id:pragueToday(),weight:64}]:[]);});
  const connected={...env,CONNECTED_PROVIDERS:['google','intervals']};
  const started=await initialImport(connected,ctx,{provider:'intervals',force:true});
  await initialImport(connected,ctx,{provider:'intervals',force:true});
  assert.equal(started.status,'running');assert.equal(pending.length,1);
  assert.equal((await dashboardSyncStatus(db,'initial_intervals')).status,'running');
  release();await Promise.all(pending);
  assert.equal((await dashboardSyncStatus(db,'initial_intervals')).status,'done');
  assert.equal((await latestStoredWeight(db)).value_numeric,64);
  assert.ok(calls.every(url=>url.startsWith('https://intervals.icu/')));
  const activityUrl=new URL(calls.find(url=>url.includes('/activities?')));
  assert.ok(Date.parse(activityUrl.searchParams.get('newest'))-Date.parse(activityUrl.searchParams.get('oldest'))>=364*86400000);
});

test('latest source results supersede stale import errors and connector status stays scoped',async()=>{
  const {db,raw}=setup();
  const save=(name,status,at,results,user=1)=>raw.sqlite.prepare('INSERT OR REPLACE INTO sync_status(user_id,sync_name,status,finished_at,updated_at,details_json) VALUES(?,?,?,?,?,?)').run(user,name,status,at,at,JSON.stringify({finishedAt:at,results}));
  await dashboardSyncStatus(db);
  save('dashboard_recent','partial','2026-10-07T12:00:00.001Z',[{source:'intervals',status:'partial',parts:{planned:{status:'error',message:'HTTP 403'}}},{source:'matching',status:'ok'}]);
  save('initial_intervals','done','2026-10-07T12:00:00.002Z',[{source:'intervals',status:'done'}]);
  save('initial_intervals','error','2026-10-07T13:00:00Z',[],2);
  let status=await dashboardSyncStatus(db);
  assert.equal(status.status,'done');assert.equal(status.results.filter(r=>r.source==='intervals').length,1);
  assert.equal(status.results.find(r=>r.source==='intervals').status,'done');
  save('initial_google','error','2026-10-07T12:01:00Z',[]);
  save('google','error','2026-10-07T12:01:00Z',[]);
  assert.equal((await dashboardSyncStatus(db)).status,'partial');
  assert.equal((await dashboardSyncStatus(db,'initial_intervals')).status,'done');
  save('dashboard_recent','partial','2026-10-07T12:02:00Z',[{source:'intervals',status:'partial',parts:{weight:{status:'error',message:'HTTP 503'}}}]);
  status=await dashboardSyncStatus(db);
  assert.equal(status.status,'partial');assert.equal(status.results.find(r=>r.source==='intervals').parts.weight.message,'HTTP 503');
});

test('anonymous export errors are retained alongside successful exports',async()=>{
  const {db,ctx,pending}=setup();
  await startDashboardSync(db,ctx,async()=>[{status:'error',message:'export failed'},{status:'synced'},{source:'intervals',status:'ok'}]);
  await Promise.all(pending);
  const status=await dashboardSyncStatus(db);
  assert.equal(status.status,'partial');assert.equal(status.results.length,3);
});
