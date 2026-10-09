import { L } from './lang.js';
import { localToday } from "./user-time.js";
// Durable, user-scoped outbox. Local food writes never depend on Google being
// online. Known Google records are patched, not recreated, on edits.
const BASE='https://health.googleapis.com/v4/';
const COLLECTION='users/me/dataTypes/nutrition-log/dataPoints';
const RESOURCE=/^users\/[^/]+\/dataTypes\/nutrition-log\/dataPoints\/[^/?#]+$/;
const MEALS={breakfast:'BREAKFAST',snack_am:'SNACK',snack_pm:'SNACK',snack_late:'SNACK',snack:'SNACK',lunch:'LUNCH',dinner:'DINNER'};
const today=()=>localToday();
async function ensure(db){await db.prepare(`CREATE TABLE IF NOT EXISTS food_google_exports (
  user_id INTEGER NOT NULL,entry_id INTEGER NOT NULL,desired_json TEXT,revision INTEGER NOT NULL DEFAULT 1,
  remote_name TEXT,operation_name TEXT,operation_revision INTEGER,operation_kind TEXT,status TEXT NOT NULL DEFAULT 'queued',message TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,entry_id))`).run();}
export function foodGooglePayload(row){
  let note={};try{note=JSON.parse(row.note||'{}');}catch{/* Older free text. */}
  // The consumed date is authoritative; older entries sometimes carried the
  // write time even when food was entered retrospectively.
  const stamp=String(row.consumed_at||''),date=row.consumed_date;
  const start=new Date(stamp.startsWith(date)&&/[Zz]|[+-]\d\d:\d\d$/.test(stamp)?stamp:date+'T12:00:00Z');
  return {nutritionLog:{interval:{startTime:start.toISOString(),endTime:new Date(+start+60000).toISOString()},
    foodDisplayName:row.recipe_title,mealType:MEALS[note.mealType]||'SNACK',energy:{kcal:Number(row.kcal)||0},
    totalCarbohydrate:{grams:Number(row.carbs_g)||0},totalFat:{grams:Number(row.fat_g)||0},
    nutrients:[{nutrient:'PROTEIN',quantity:{grams:Number(row.protein_g)||0}}]}};
}
export async function queueFoodGoogle(db,id,{deleted=false}={}){
  await ensure(db);
  const row=deleted?null:await db.prepare('SELECT * FROM food_logs WHERE user_id=? AND id=?').bind(db.userId,Number(id)).first();
  if(!deleted&&!row)throw new Error(L('Jídlo už v deníku není.', 'The meal is no longer in the log.'));
  const desired=row?JSON.stringify({date:row.consumed_date,payload:foodGooglePayload(row)}):null;
  await db.prepare(`INSERT INTO food_google_exports(user_id,entry_id,desired_json) VALUES(?,?,?)
    ON CONFLICT(user_id,entry_id) DO UPDATE SET desired_json=excluded.desired_json,revision=revision+1,
    status=CASE WHEN food_google_exports.status IN ('uncertain','operation','syncing') THEN food_google_exports.status ELSE 'queued' END,
    message=NULL,updated_at=CURRENT_TIMESTAMP`).bind(db.userId,Number(id),desired).run();
  return {status:row&&row.consumed_date>today()?'planned':'queued'};
}
export async function foodGoogleStatus(db){
  await ensure(db);return (await db.prepare('SELECT entry_id,status,message,desired_json FROM food_google_exports WHERE user_id=? ORDER BY entry_id DESC LIMIT 500').bind(db.userId).all()).results.map(r=>({id:r.entry_id,status:r.desired_json&&JSON.parse(r.desired_json).date>today()?'planned':r.status,message:r.message}));
}
export async function retryFoodGoogle(db,id){
  await ensure(db);
  const row=await db.prepare('SELECT status FROM food_google_exports WHERE user_id=? AND entry_id=?').bind(db.userId,Number(id)).first();
  if(row?.status==='uncertain')throw new Error(L('Google nepotvrdil výsledek zápisu. Nejdřív zkontroluj jeho jídelníček, aby nevznikla kopie.', 'Google didn\'t confirm the result of the entry. Check its food log first so you don\'t create a duplicate.'));
  return queueFoodGoogle(db,id);
}
export async function backfillFoodGoogle(db){
  await ensure(db);
  // This exact old route saved package_label entries without any Google call.
  // Other legacy writers may already have exported their records.
  const rows=(await db.prepare(`SELECT id FROM food_logs WHERE user_id=? AND source='package_label'
    AND consumed_date>=date('now','-14 days') AND consumed_date<=?
    AND json_valid(note) AND json_extract(note,'$.enteredQuantity') IS NOT NULL
    AND id NOT IN (SELECT entry_id FROM food_google_exports WHERE user_id=?) LIMIT 100`).bind(db.userId,today(),db.userId).all()).results;
  for(const row of rows)await queueFoodGoogle(db,row.id);
  return rows.length;
}
export async function processFoodGoogle(env,{token,fetcher=fetch}={}){
  const db=env.DB;await ensure(db);
  if(Array.isArray(env.CONNECTED_PROVIDERS)&&!env.CONNECTED_PROVIDERS.includes('google')){
    await db.prepare("UPDATE food_google_exports SET status='disconnected',message='Google není připojené.' WHERE user_id=? AND status='queued'").bind(db.userId).run();
    return {status:'disconnected'};
  }
  const rows=(await db.prepare(`SELECT * FROM food_google_exports WHERE user_id=? AND
    (status IN ('queued','operation','disconnected') OR (status='syncing' AND updated_at<datetime('now','-5 minutes')))
    AND (desired_json IS NULL OR json_extract(desired_json,'$.date')<=? OR remote_name IS NOT NULL OR operation_name IS NOT NULL)
    ORDER BY updated_at,entry_id LIMIT 20`).bind(db.userId,today()).all()).results;
  let access=null,synced=0;
  for(const row of rows){
    const requested=row.desired_json?JSON.parse(row.desired_json):null,planned=requested?.date>today();
    // Moving a consumed meal into the future removes its old Google record.
    // The planned meal is exported on its date, not counted as eaten today.
    const desired=planned?null:requested;
    // A crashed create has an unknown outcome. Never blindly duplicate it.
    if(row.status==='syncing'&&!row.remote_name&&!row.operation_name){await db.prepare("UPDATE food_google_exports SET status='uncertain',message='Výsledek zápisu Google není potvrzený.' WHERE user_id=? AND entry_id=? AND revision=?").bind(db.userId,row.entry_id,row.revision).run();continue;}
    const claim=await db.prepare("UPDATE food_google_exports SET status='syncing',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND entry_id=? AND revision=? AND status=?").bind(db.userId,row.entry_id,row.revision,row.status).run();
    if(!claim.meta.changes)continue;
    let method='GET',responseReceived=false;
    try{
      access ||= await token(env);
      if(row.remote_name&&!RESOURCE.test(row.remote_name))throw new Error(L('Neplatný Google záznam.', 'Invalid Google entry.'));
      if(!desired&&!row.remote_name&&!row.operation_name){await finish('deleted');continue;}
      const polling=Boolean(row.operation_name);
      method=polling?'GET':desired?(row.remote_name?'PATCH':'POST'):'POST';
      if(polling&&!/^operations\/[^?#]+$/.test(row.operation_name))throw new Error(L('Neplatná Google operace.', 'Invalid Google operation.'));
      const path=polling?row.operation_name:desired?(row.remote_name||COLLECTION):COLLECTION+':batchDelete';
      const body=polling?undefined:JSON.stringify(desired?desired.payload:{names:[row.remote_name]});
      const response=await fetcher(BASE+path,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',Accept:'application/json'},body,signal:AbortSignal.timeout(15000)});
      responseReceived=true;const data=await response.json().catch(()=>({}));
      if(!response.ok){
        if(!desired&&response.status===404){await db.prepare('UPDATE food_google_exports SET remote_name=NULL,operation_name=NULL,operation_revision=NULL,operation_kind=NULL WHERE user_id=? AND entry_id=?').bind(db.userId,row.entry_id).run();await finish(planned?'queued':'deleted');continue;}
        const error=new Error(response.status===403?L('Google nepovolil zápis výživy. Obnov připojení Google v Nastavení.', 'Google didn\'t allow writing nutrition. Renew the Google connection in Settings.'):response.status===401?L('Google připojení je potřeba obnovit.', 'The Google connection needs to be renewed.'):L('Google Health zápis selhal (HTTP ', 'Writing to Google Health failed (HTTP ')+response.status+').');error.status=response.status;throw error;
      }
      if(data.error)throw new Error(L('Google operace selhala: ', 'The Google operation failed: ')+String(data.error.message||L('neznámá chyba', 'unknown error')).slice(0,120));
      if(data.done===false){
        const operation=data.name||row.operation_name;if(!/^operations\/[^?#]+$/.test(operation||''))throw new Error(L('Google nevrátil potvrzenou operaci.', 'Google didn\'t return a confirmed operation.'));
        await db.prepare("UPDATE food_google_exports SET operation_name=?,operation_revision=COALESCE(operation_revision,?),operation_kind=COALESCE(operation_kind,?),status='operation',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND entry_id=?").bind(operation,row.revision,desired?'write':'delete',db.userId,row.entry_id).run();continue;
      }
      if((polling&&row.operation_kind==='delete')||(!polling&&!desired)){
        await db.prepare('UPDATE food_google_exports SET remote_name=NULL,operation_name=NULL,operation_revision=NULL,operation_kind=NULL WHERE user_id=? AND entry_id=?').bind(db.userId,row.entry_id).run();
        await finish(planned?'queued':'deleted');continue;
      }
      if(desired||polling){
        const name=data.response?.name||data.name;
        if(!RESOURCE.test(name||'')){if(!desired){await db.prepare('UPDATE food_google_exports SET operation_name=NULL WHERE user_id=? AND entry_id=?').bind(db.userId,row.entry_id).run();await finish('deleted');continue;}throw new Error(L('Google nevrátil identifikátor uloženého jídla.', 'Google didn\'t return an ID for the saved meal.'));}
        await db.prepare('UPDATE food_google_exports SET remote_name=?,operation_name=NULL,operation_revision=NULL,operation_kind=NULL WHERE user_id=? AND entry_id=?').bind(name,db.userId,row.entry_id).run();
        // A change while the request was running stays queued for a PATCH.
        await finish('synced');synced++;
      }else{await finish('deleted');}
    }catch(error){
      const create=!row.remote_name&&!row.operation_name&&method==='POST';
      const uncertain=create&&(!responseReceived||!error.status||error.status>=500);
      await finish(uncertain?'uncertain':error.status===429?'queued':'error',String(error.message).slice(0,200));
    }
    async function finish(status,message=null){
      await db.prepare("UPDATE food_google_exports SET status=CASE WHEN revision=? THEN ? ELSE 'queued' END,message=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND entry_id=?").bind(row.operation_name?row.operation_revision:row.revision,status,message,db.userId,row.entry_id).run();
    }
  }
  return {status:'ok',synced};
}
