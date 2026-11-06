import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {scopedDb} from '../src/tenancy.js';
import {dashboardSyncStatus} from '../src/dashboard-sync.js';
import app,{googleToken} from '../src/index.js';
const schema=readFileSync(new URL('../staging/schema.sql',import.meta.url),'utf8');
function setup(){const raw=createD1();raw.sqlite.exec(schema);return scopedDb(raw,1);}
const put=(db,name,status,{details=null,finished=null,updated})=>db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,?,?,?,?)").bind(1,name,status,finished,details&&JSON.stringify(details),updated).run();

test('a Google outage in Sync everything stops showing once the five-minute sync went fine',async()=>{
 const db=setup();
 await put(db,'dashboard_recent','partial',{finished:'2026-11-06T09:13:28.039Z',details:{finishedAt:'2026-11-06T09:13:28.039Z',results:[{source:'google',status:'partial',message:'not downloaded: sleep (the service had an outage)'},{source:'intervals',status:'ok'}]},updated:'2026-11-06 09:13:28'});
 await put(db,'google_recent','partial',{updated:'2026-11-06 09:13:27'});
 await put(db,'google','partial',{finished:'2026-11-06T01:40:00.000Z',updated:'2026-11-06 01:40:00'});
 let status=await dashboardSyncStatus(db);
 assert.equal(status.status,'partial');assert.equal(status.results.find(r=>r.source==='google').status,'partial');assert.equal(status.googleStatus,'partial');
 await db.prepare("UPDATE sync_status SET status='ok',updated_at='2026-11-06 09:15:33' WHERE user_id=? AND sync_name='google_recent'").bind(1).run();
 status=await dashboardSyncStatus(db);
 assert.equal(status.status,'done');assert.equal(status.results.find(r=>r.source==='google').status,'ok');assert.equal(status.googleStatus,'completed');
 // Another source's failure stays.
 await db.prepare("UPDATE sync_status SET details_json=? WHERE user_id=? AND sync_name='dashboard_recent'").bind(JSON.stringify({results:[{source:'google',status:'ok'},{source:'intervals',status:'error',message:'x'}]}),1).run();
 assert.equal((await dashboardSyncStatus(db)).status,'partial');
});

test('a Google 5xx is asked once more a second later; other answers are not',async()=>{
 const original=globalThis.fetch;let calls=0;
 const env={DB:setup(),USER_ID:1,GOOGLE_REFRESH_TOKEN:'r',GOOGLE_CLIENT_ID:'c',GOOGLE_CLIENT_SECRET:'s',GOOGLE_SCOPES:'https://www.googleapis.com/auth/googlehealth.sleep.readonly'};
 try{
  globalThis.fetch=async()=>++calls===1?Response.json({error:'internal_failure'},{status:500}):Response.json({access_token:'t'});
  assert.equal(await googleToken(env,['scope']),'t');assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'invalid_request'},{status:400});};
  await assert.rejects(googleToken(env,['scope']),/invalid_request/);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

test('a nightly Google run left partial does not reopen the first import; the first import’s own end does',async()=>{
 const db=setup(),env={DB:db,USER_ID:1,CONNECTED_PROVIDERS:['intervals']},end={config_index:99,results:[{data_type:'sleep',status:'error',message:'sleep HTTP 503'}]};
 const at=async details=>{
  await db.prepare("DELETE FROM sync_status WHERE user_id=?").bind(1).run();
  await put(db,'initial_google','done',{updated:'2026-11-06 01:00:00'});
  await put(db,'google','running',{details,updated:'2026-11-06 01:05:00'});
  await app.scheduled({cron:'* * * * *'},env,{waitUntil(){}});
  return (await db.prepare("SELECT status FROM sync_status WHERE user_id=? AND sync_name='initial_google'").bind(1).first()).status;
 };
 assert.equal(await at(end),'done');
 assert.equal(await at({...end,initial:true}),'partial');
});
