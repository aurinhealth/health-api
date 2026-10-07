import {productFromLabel} from './food-sources.js';
import {foodKey,foodSimilarity} from './personal-foods.js';
async function ensure(db){await db.prepare('CREATE TABLE IF NOT EXISTS shared_foods (food_key TEXT PRIMARY KEY,search_name TEXT NOT NULL,product_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();await db.prepare('CREATE TABLE IF NOT EXISTS food_contributions (user_id INTEGER NOT NULL,personal_id TEXT NOT NULL,catalog_id TEXT NOT NULL,PRIMARY KEY(user_id,personal_id))').run();await ensureFoodReports(db);}
export async function saveSharedFood(db,input,personalId=null){
  await ensure(db);
  if(personalId)await removeFoodContribution(db,personalId);
  const p=productFromLabel(input);if(!p||p.nutrition_basis==='portion')return null;
  const product={...p,preferred_unit:null,source:'shared',confidence:'user',label_verified:false};
  // Only food label data is shared. Diary dates, amounts eaten, preferences,
  // author identities and private notes never enter the common catalogue.
  const identity=[foodKey(p.name),foodKey(p.brand),p.barcode,p.nutrition_basis,p.quantity,p.serving_size,p.piece_size,p.calories_100g,p.protein_100g,p.carbs_100g,p.fat_100g];
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));
  const key=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  await ensure(db);await db.prepare('INSERT INTO shared_foods(food_key,search_name,product_json) VALUES(?,?,?) ON CONFLICT(food_key) DO UPDATE SET updated_at=CURRENT_TIMESTAMP').bind(key,foodKey(p.name)+' '+foodKey(p.brand),JSON.stringify(product)).run();
  if(personalId)await db.prepare('INSERT INTO food_contributions(user_id,personal_id,catalog_id) VALUES(?,?,?)').bind(db.userId,personalId,key).run();
  return {...product,catalog_id:key};
}
export async function searchSharedFoods(db,name,barcode){
  await ensure(db);
  // SQL narrows the candidate set before fuzzy Czech matching. Barcode lookups
  // do not depend on the latest 500 products in a growing catalogue.
  const code=String(barcode||'').replace(/\D/g,''),q=foodKey(name).replace(/[%_]/g,'');
  if(!code&&q.length<2)return [];
  const rows=(await db.prepare("SELECT food_key,product_json,(SELECT COUNT(*) FROM food_reports WHERE user_id IS NOT NULL AND catalog_id=food_key) AS reports FROM shared_foods WHERE (?!='' AND json_extract(product_json,'$.barcode')=?) OR (?='' AND search_name LIKE ?) ORDER BY updated_at DESC LIMIT 500").bind(code,code,code,'%'+q.slice(0,2)+'%').all()).results;
  return rows.map(row=>({...JSON.parse(row.product_json),catalog_id:row.food_key,reports:row.reports,confidence:row.reports?'reported':'user'})).filter(p=>code?String(p.barcode)===code:foodSimilarity(name,p.name)>=.65).sort((a,b)=>foodSimilarity(name,b.name)-foodSimilarity(name,a.name)).slice(0,12);
}

export async function ensureFoodReports(db){await db.prepare('CREATE TABLE IF NOT EXISTS food_reports (user_id INTEGER NOT NULL,catalog_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,catalog_id))').run();}
export async function removeFoodContribution(db,personalId){
  await ensure(db);const old=await db.prepare('SELECT catalog_id FROM food_contributions WHERE user_id=? AND personal_id=?').bind(db.userId,String(personalId)).first();
  await db.prepare('DELETE FROM food_contributions WHERE user_id=? AND personal_id=?').bind(db.userId,String(personalId)).run();
  if(old)await db.prepare('DELETE FROM shared_foods WHERE food_key=? AND NOT EXISTS (SELECT 1 FROM food_contributions WHERE user_id IS NOT NULL AND catalog_id=?)').bind(old.catalog_id,old.catalog_id).run();
}
export async function reportFood(db,{catalogId,reason}){
  await ensure(db);if(!/^[a-f0-9]{64}$/.test(String(catalogId||'')))throw new Error('Neplatná položka katalogu.');
  reason=String(reason||'').trim().slice(0,500);if(!reason)throw new Error('Popiš, které údaje nesedí.');
  const food=await db.prepare('SELECT food_key FROM shared_foods WHERE food_key=?').bind(catalogId).first();
  if(!food){await db.prepare('CREATE TABLE IF NOT EXISTS shared_recipes (catalog_id TEXT PRIMARY KEY,recipe_json TEXT NOT NULL,search_name TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();if(!await db.prepare('SELECT catalog_id FROM shared_recipes WHERE catalog_id=?').bind(catalogId).first())throw new Error('Položka nebyla nalezena.');}
  await db.prepare('INSERT INTO food_reports(user_id,catalog_id,reason) VALUES(?,?,?) ON CONFLICT(user_id,catalog_id) DO UPDATE SET reason=excluded.reason').bind(db.userId,catalogId,reason).run();
  return {status:'ok'};
}
