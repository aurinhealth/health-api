import { L } from './lang.js';
import { intervalsAuthorization } from './intervals-auth.js';
// App-owned events and an outbox; providers are destinations, not storage.
export async function ensureLocalWorkouts(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS local_workouts (user_id INTEGER NOT NULL,id TEXT NOT NULL,event_key TEXT NOT NULL,event_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled',revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,id),UNIQUE(user_id,event_key))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS workout_exports (user_id INTEGER NOT NULL,local_id TEXT NOT NULL,provider TEXT NOT NULL,remote_id TEXT,status TEXT NOT NULL DEFAULT 'pending',revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,local_id,provider))").run();
}
async function projection(db,id,event,remove=false){
  if(remove)return db.prepare("DELETE FROM health_datapoints WHERE user_id=? AND source_family='local' AND data_type='planned-workout' AND external_id=?").bind(db.userId,'planned:'+id);
  const start=event.start_date_local;
  return db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,end_time,payload_json) VALUES(?,'local','planned-workout',?,?,?,?,?) ON CONFLICT(user_id,source_family,data_type,external_id) DO UPDATE SET sample_time=excluded.sample_time,start_time=excluded.start_time,end_time=excluded.end_time,payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId,'planned:'+id,start,start,event.end_date_local||null,JSON.stringify({...event,id}));
}
export async function storeLocalEvent(db,event,{key=event.external_id,id=null}={}){
  await ensureLocalWorkouts(db);
  const existing=id?await localWorkout(db,id):await db.prepare('SELECT * FROM local_workouts WHERE user_id=? AND event_key=?').bind(db.userId,key).first();
  if(id&&!existing)throw new Error(L('Trénink nebyl nalezen.', 'The workout wasn\'t found.'));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(db.userId+':'+key));
  id=existing?.id||'local-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,40);
  const payload={...event,id,external_id:'loadwise:'+db.userId+':'+id};
  await db.batch([
    db.prepare("INSERT INTO local_workouts(user_id,id,event_key,event_json) VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET event_key=excluded.event_key,event_json=excluded.event_json,status='scheduled',revision=local_workouts.revision+1,updated_at=CURRENT_TIMESTAMP").bind(db.userId,id,key,JSON.stringify(payload)),
    await projection(db,id,payload),
    db.prepare("INSERT INTO workout_exports(user_id,local_id,provider) VALUES(?,?,'intervals') ON CONFLICT(user_id,local_id,provider) DO UPDATE SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE workout_exports.status!='running'").bind(db.userId,id)
  ]);
  return {id,event:payload,existing:Boolean(existing)};
}
export async function localWorkout(db,id){
  await ensureLocalWorkouts(db);return db.prepare('SELECT * FROM local_workouts WHERE user_id=? AND id=?').bind(db.userId,String(id).replace(/^planned:/,'' )).first();
}
export async function syncLocalWorkout(env,id,fetchImpl=fetch){
  const db=env.DB,row=await localWorkout(db,id);
  if(!row)return {status:'not_found'};
  if(!env.INTERVALS_API_KEY)return {status:'not_connected',message:L('Trénink je uložený v aplikaci. Intervals.icu není připojeno.', 'The workout is saved in the app. Intervals.icu isn\'t connected.')};
  const exported=await db.prepare("SELECT * FROM workout_exports WHERE user_id=? AND local_id=? AND provider='intervals'").bind(db.userId,row.id).first();
  if(exported?.revision===row.revision&&exported.status==='synced')return {status:'synced',eventId:exported.remote_id};
  const claimed=await db.prepare("UPDATE workout_exports SET status='running',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND local_id=? AND provider='intervals' AND (status!='running' OR updated_at<datetime('now','-5 minutes'))").bind(db.userId,row.id).run();
  if(!claimed.meta?.changes)return {status:'pending'};
  const event=JSON.parse(row.event_json),headers={Authorization:intervalsAuthorization(env.INTERVALS_API_KEY),Accept:'application/json','Content-Type':'application/json'};
  try{
    let remoteId=exported?.remote_id;
    // A delete whose first export response was lost still removes the upserted event.
    if(row.status==='deleted'&&!remoteId){
      const r=await fetchImpl('https://intervals.icu/api/v1/athlete/0/events?oldest='+event.start_date_local.slice(0,10)+'&newest='+event.start_date_local.slice(0,10),{headers});
      if(!r.ok)throw new Error('Intervals.icu HTTP '+r.status);
      const events=await r.json();if(!Array.isArray(events))throw new Error(L('Neplatná odpověď Intervals.icu.', 'Invalid response from Intervals.icu.'));remoteId=events.find(e=>e.external_id===event.external_id)?.id;
    }
    if(row.status==='deleted'){
      if(remoteId){const r=await fetchImpl('https://intervals.icu/api/v1/athlete/0/events/'+encodeURIComponent(remoteId),{method:'DELETE',headers});if(!r.ok&&r.status!==404)throw new Error('Intervals.icu HTTP '+r.status);}
    }else{
      // Keep a provider event id through date/environment edits.
      const {id:ignoredId,...providerEvent}=event;void ignoredId;
      const url=remoteId?'https://intervals.icu/api/v1/athlete/0/events/'+encodeURIComponent(remoteId):'https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true';
      const r=await fetchImpl(url,{method:remoteId?'PUT':'POST',headers,body:JSON.stringify(remoteId?providerEvent:[providerEvent])});
      if(!r.ok)throw new Error('Intervals.icu HTTP '+r.status);
      const data=await r.json(),saved=Array.isArray(data)?data[0]:data;
      if(saved?.id==null)throw new Error(L('Intervals.icu nepotvrdilo uložení.', 'Intervals.icu didn\'t confirm the save.'));remoteId=String(saved.id);
    }
    await db.prepare("UPDATE workout_exports SET remote_id=?,revision=?,status=CASE WHEN ?=(SELECT revision FROM local_workouts WHERE user_id=? AND id=?) THEN 'synced' ELSE 'pending' END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND local_id=? AND provider='intervals'").bind(remoteId==null?null:String(remoteId),row.revision,row.revision,db.userId,row.id,db.userId,row.id).run();
    // An old imported projection must not double-count an app-owned event.
    if(remoteId!=null)await db.prepare("DELETE FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='planned-workout' AND external_id=?").bind(db.userId,'planned:'+remoteId).run();
    return {status:'synced',eventId:remoteId};
  }catch{
    await db.prepare("UPDATE workout_exports SET status='error',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND local_id=? AND provider='intervals'").bind(db.userId,row.id).run();
    return {status:'error',message:L('Trénink je uložený v aplikaci. Export se nepodařil; lze ho zkusit znovu.', 'The workout is saved in the app. The export failed; you can try again.')};
  }
}
export async function retryWorkoutExports(env){
  await ensureLocalWorkouts(env.DB);
  if(!env.INTERVALS_API_KEY)return [];
  const rows=(await env.DB.prepare("SELECT local_id FROM workout_exports WHERE user_id=? AND provider='intervals' AND (status IN ('pending','error') OR (status='running' AND updated_at<datetime('now','-5 minutes'))) ORDER BY updated_at LIMIT 20").bind(env.DB.userId).all()).results;
  const results=[];for(const row of rows)results.push(await syncLocalWorkout(env,row.local_id));return results;
}
export async function localExportIndex(db,userId=db.userId){
  await ensureLocalWorkouts(db);
  const rows=(await db.prepare("SELECT e.remote_id,l.event_json FROM local_workouts l LEFT JOIN workout_exports e ON e.user_id=l.user_id AND e.local_id=l.id AND e.provider='intervals' WHERE l.user_id=?").bind(userId).all()).results;
  return {remote:new Set(rows.map(r=>r.remote_id).filter(v=>v!=null).map(String)),external:new Set(rows.map(r=>JSON.parse(r.event_json).external_id))};
}
export async function importedEventIsLocal(db,event,userId=db.userId){
  const index=await localExportIndex(db,userId);return index.remote.has(String(event.id??event.event_id??''))||index.external.has(event.external_id);
}
export async function editLocalWorkout(env,id,change,fetchImpl=fetch){
  const db=env.DB,row=await localWorkout(db,id);if(!row||row.status==='deleted')throw new Error(L('Trénink nebyl nalezen.', 'The workout wasn\'t found.'));
  const event=JSON.parse(row.event_json);
  if(change.deleted){
    await db.batch([db.prepare("UPDATE local_workouts SET status='deleted',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(db.userId,row.id),await projection(db,row.id,event,true),db.prepare("DELETE FROM workout_schedule_links WHERE user_id=? AND intervals_event_id=?").bind(db.userId,row.id),db.prepare("UPDATE workout_exports SET status='pending' WHERE user_id=? AND local_id=? AND status!='running'").bind(db.userId,row.id)]);
  }else{
    const next={...event,...change};
    const link=await db.prepare('SELECT workout_id FROM workout_schedule_links WHERE user_id=? AND intervals_event_id=?').bind(db.userId,row.id).first();
    const key=link?'pfd-library:'+link.workout_id+':'+next.start_date_local.slice(0,10)+(/Virtual/.test(next.type)?'':':outdoor'):row.event_key;
    await storeLocalEvent(db,next,{key,id:row.id});
    if(link)await db.prepare('UPDATE workout_schedule_links SET intervals_external_id=? WHERE user_id=? AND intervals_event_id=?').bind(key,db.userId,row.id).run();
    await db.prepare('UPDATE workout_schedule_links SET scheduled_date=?,environment=? WHERE user_id=? AND intervals_event_id=?').bind(next.start_date_local.slice(0,10),/Virtual/.test(next.type)?'indoor':'outdoor',db.userId,row.id).run();
  }
  const sync=await syncLocalWorkout(env,row.id,fetchImpl);return {status:'ok',eventId:row.id,sync};
}
export async function completeLocalWorkout(db,id,{minutes,rpe,notes}={}){
  const row=await localWorkout(db,id);if(!row||row.status==='deleted')throw new Error(L('Trénink nebyl nalezen.', 'The workout wasn\'t found.'));
  const event=JSON.parse(row.event_json),duration=Number(minutes??event.moving_time/60);
  if(!Number.isFinite(duration)||duration<=0||duration>1440)throw new Error(L('Zadej skutečnou délku tréninku.', 'Enter the actual duration of the workout.'));
  const payload={...event,moving_time:duration*60,rpe:Number(rpe)||null,description:String(notes||'').slice(0,1000)};
  await db.batch([
    db.prepare("UPDATE local_workouts SET status='completed' WHERE user_id=? AND id=?").bind(db.userId,row.id),
    db.prepare("UPDATE workout_exports SET status='not_exported',revision=? WHERE user_id=? AND local_id=? AND remote_id IS NULL").bind(row.revision,db.userId,row.id),
    db.prepare("UPDATE workout_schedule_links SET status='completed' WHERE user_id=? AND intervals_event_id=?").bind(db.userId,row.id),
    db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,payload_json) VALUES(?,'local','activity',?,?,?,?) ON CONFLICT(user_id,source_family,data_type,external_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId,'activity:'+row.id,event.start_date_local,event.start_date_local,JSON.stringify(payload)),await projection(db,row.id,event,true)
  ]);
}
