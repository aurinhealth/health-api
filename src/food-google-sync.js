import { L } from './lang.js';
import { localToday, zonedTime } from "./user-time.js";
import { readSyncPrefs, healthAllowed, utcOffset } from "./sync-destinations.js";
// Durable, user-scoped outbox. Local food writes never depend on Google being
// online. Known Google records are patched, not recreated, on edits.
const BASE='https://health.googleapis.com/v4/';
const COLLECTION='users/me/dataTypes/nutrition-log/dataPoints';
// Water logged in Aurin goes the same way, as the drink's id negated (entry_id < 0).
const DRINKS='users/me/dataTypes/hydration-log/dataPoints';
const RESOURCE=/^users\/[^/]+\/dataTypes\/(nutrition|hydration)-log\/dataPoints\/[^/?#]+$/;
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
  // A time without an offset (food-log.js mealConsumedAt) is the user's wall
  // clock: their time zone makes it an instant, DST included. The offsets put
  // it on that day in Google Health, which otherwise shows it at UTC.
  return {nutritionLog:{interval:minute(row.consumed_at,row.consumed_date),
    foodDisplayName:row.recipe_title,mealType:MEALS[note.mealType]||'SNACK',energy:{kcal:Number(row.kcal)||0},
    totalCarbohydrate:{grams:Number(row.carbs_g)||0},totalFat:{grams:Number(row.fat_g)||0},
    nutrients:[{nutrient:'PROTEIN',quantity:{grams:Number(row.protein_g)||0}},...extraNutrients(row,note)]}};
}
function minute(consumedAt,date){
  const stamp=String(consumedAt||'');
  const at=!stamp.startsWith(date)?NaN:/[Zz]|[+-]\d\d:\d\d$/.test(stamp)?Date.parse(stamp):/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(stamp)?zonedTime(stamp):NaN;
  const start=new Date(Number.isFinite(at)?at:Date.parse(date+'T12:00:00Z')),end=new Date(+start+60000);
  return {startTime:start.toISOString(),startUtcOffset:utcOffset(start),endTime:end.toISOString(),endUtcOffset:utcOffset(end)};
}
// A glass of water logged in Aurin (fluids.js fluid_log; consumed_at is the wall clock).
export function drinkGooglePayload(row){
  return {hydrationLog:{interval:minute(row.consumed_at,row.date),amountConsumed:{milliliters:Number(row.ml)||0}}};
}
// Fibre, sugars and sodium when the meal has them (micronutrients.js); Google takes
// grams, and salt on EU labels is sodium × 2.5. Unknown fibre is a 0 with a flag.
function extraNutrients(row,note){
  const out=[],put=(nutrient,v)=>{const g=Number(v);if(v!=null&&v!==''&&Number.isFinite(g)&&g>=0)out.push({nutrient,quantity:{grams:Math.round(g*1000)/1000}});};
  if(note.fiber_unknown!==true)put('DIETARY_FIBER',row.fiber_g);
  put('SUGAR',note.sugar_g);
  if(note.salt_g!=null&&note.salt_g!=='')put('SODIUM',Number(note.salt_g)/2.5);
  return out;
}
export async function queueFoodGoogle(db,id,{deleted=false}={}){
  await ensure(db);
  const row=deleted?null:await db.prepare('SELECT * FROM food_logs WHERE user_id=? AND id=?').bind(db.userId,Number(id)).first();
  if(!deleted&&!row)throw new Error(L('Jídlo už v deníku není.', 'The meal is no longer in the log.'));
  // Food from another app via Apple or Google Health is not sent on to Google
  // (apple-food.js), nor is such a food moved in Aurin: the original is still there.
  if(row?.source==='apple-health'||row?.source==='google-health'||/"from_app"/.test(String(row?.note||'')))return {status:'skipped'};
  await enqueue(db,Number(id),row?JSON.stringify({date:row.consumed_date,payload:foodGooglePayload(row)}):null);
  return {status:row&&row.consumed_date>today()?'planned':'queued'};
}
async function enqueue(db,entryId,desired){
  await db.prepare(`INSERT INTO food_google_exports(user_id,entry_id,desired_json) VALUES(?,?,?)
    ON CONFLICT(user_id,entry_id) DO UPDATE SET desired_json=excluded.desired_json,revision=revision+1,
    status=CASE WHEN food_google_exports.status IN ('uncertain','operation','syncing') THEN food_google_exports.status ELSE 'queued' END,
    message=NULL,updated_at=CURRENT_TIMESTAMP`).bind(db.userId,entryId,desired).run();
}
// Settings → Synchronizace → Google Health → Voda: the plain water the user
// logged in Aurin (as Apple Health gets it), never a drink another app sent.
// New glasses from the day it is on (earlier days the Google Health app has
// already read from Apple Health); a changed or deleted one of the last 14 days
// is queued again. Compared by day, clock and amount, so a new time zone
// does not move old glasses.
async function queueDrinks(db){
  const from=new Date(Date.parse(today()+'T00:00:00Z')-13*86400000).toISOString().slice(0,10);
  let drinks;
  try{drinks=(await db.prepare("SELECT id,date,consumed_at,ml FROM fluid_log WHERE user_id=? AND date>=? AND date<=? AND source IS NULL AND kind='water' ORDER BY date DESC,id DESC LIMIT 500").bind(db.userId,from,today()).all()).results||[];}
  catch(error){if(/no such table/i.test(error.message))return;throw error;}
  const known=new Map(((await db.prepare("SELECT entry_id,desired_json FROM food_google_exports WHERE user_id=? AND entry_id<0 AND desired_json IS NOT NULL AND json_extract(desired_json,'$.date')>=?").bind(db.userId,from).all()).results||[]).map(r=>[r.entry_id,JSON.parse(r.desired_json)]));
  for(const drink of drinks){
    const was=known.get(-drink.id);known.delete(-drink.id);
    if(!was&&drink.date<today())continue;
    if(was&&was.date===drink.date&&was.at===drink.consumed_at&&was.ml===Number(drink.ml))continue;
    await enqueue(db,-drink.id,JSON.stringify({date:drink.date,at:drink.consumed_at,ml:Number(drink.ml),payload:drinkGooglePayload(drink)}));
  }
  for(const entryId of known.keys())await enqueue(db,entryId,null);
}
export async function foodGoogleStatus(db){
  await ensure(db);return (await db.prepare('SELECT entry_id,status,message,desired_json FROM food_google_exports WHERE user_id=? AND entry_id>0 ORDER BY entry_id DESC LIMIT 500').bind(db.userId).all()).results.map(r=>({id:r.entry_id,status:r.desired_json&&JSON.parse(r.desired_json).date>today()?'planned':r.status,message:r.message}));
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
  // Settings → Synchronizace → Google Health: food left out stays only in the app (queued).
  const prefs=await readSyncPrefs(db,db.userId??env.USER_ID,'google'),food=healthAllowed(prefs,'nutrition'),water=healthAllowed(prefs,'water');
  if(!food&&!water)return {status:'off'};
  if(Array.isArray(env.CONNECTED_PROVIDERS)&&!env.CONNECTED_PROVIDERS.includes('google')){
    await db.prepare("UPDATE food_google_exports SET status='disconnected',message='Google není připojené.' WHERE user_id=? AND status='queued'").bind(db.userId).run();
    return {status:'disconnected'};
  }
  if(water)await queueDrinks(db);
  // Water has no Odeslat znovu button: a failed glass is tried again after an hour.
  const rows=(await db.prepare(`SELECT * FROM food_google_exports WHERE user_id=? AND (entry_id>0 OR ?) AND (entry_id<0 OR ?) AND
    (status IN ('queued','operation','disconnected') OR (status='syncing' AND updated_at<datetime('now','-5 minutes'))
     OR (entry_id<0 AND status='error' AND updated_at<datetime('now','-1 hour')))
    AND (desired_json IS NULL OR json_extract(desired_json,'$.date')<=? OR remote_name IS NOT NULL OR operation_name IS NOT NULL)
    ORDER BY updated_at,entry_id LIMIT 20`).bind(db.userId,water?1:0,food?1:0,today()).all()).results;
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
      const collection=row.entry_id<0?DRINKS:COLLECTION;
      const path=polling?row.operation_name:desired?(row.remote_name||collection):collection+':batchDelete';
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
