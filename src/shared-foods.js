import {productFromLabel} from './food-sources.js';
import {foodKey,foodSimilarity} from './personal-foods.js';
async function ensure(db){await db.prepare('CREATE TABLE IF NOT EXISTS shared_foods (food_key TEXT PRIMARY KEY,search_name TEXT NOT NULL,product_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();}
export async function saveSharedFood(db,input){
  const p=productFromLabel(input);if(!p||p.nutrition_basis==='portion')return null;
  const product={...p,preferred_unit:null,source:'shared',confidence:'user',label_verified:false};
  // Only food label data is shared. Diary dates, amounts eaten, preferences,
  // author identities and private notes never enter the common catalogue.
  const identity=[foodKey(p.name),foodKey(p.brand),p.barcode,p.nutrition_basis,p.quantity,p.serving_size,p.piece_size,p.calories_100g,p.protein_100g,p.carbs_100g,p.fat_100g];
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));
  const key=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  await ensure(db);await db.prepare('INSERT INTO shared_foods(food_key,search_name,product_json) VALUES(?,?,?) ON CONFLICT(food_key) DO UPDATE SET updated_at=CURRENT_TIMESTAMP').bind(key,foodKey(p.name)+' '+foodKey(p.brand),JSON.stringify(product)).run();
  return {...product,catalog_id:key};
}
export async function searchSharedFoods(db,name,barcode){
  await ensure(db);
  // SQL narrows the candidate set before fuzzy Czech matching. Barcode lookups
  // do not depend on the latest 500 products in a growing catalogue.
  const code=String(barcode||'').replace(/\D/g,''),q=foodKey(name).replace(/[%_]/g,'');
  const rows=(await db.prepare("SELECT food_key,product_json FROM shared_foods WHERE (?!='' AND json_extract(product_json,'$.barcode')=?) OR (?='' AND search_name LIKE ?) ORDER BY updated_at DESC LIMIT 500").bind(code,code,code,'%'+q.slice(0,2)+'%').all()).results;
  return rows.map(row=>({...JSON.parse(row.product_json),catalog_id:row.food_key})).filter(p=>code?String(p.barcode)===code:foodSimilarity(name,p.name)>=.65).sort((a,b)=>foodSimilarity(name,b.name)-foodSimilarity(name,a.name)).slice(0,12);
}
