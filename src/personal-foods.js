import {productFromLabel} from './food-sources.js';
import {foodPackageSize} from './food-portions.js';
import {saveSharedFood,searchSharedFoods,removeFoodContribution} from './shared-foods.js';
export const foodKey=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function foodSimilarity(a,b){a=foodKey(a);b=foodKey(b);if(!a||!b)return 0;if(b.includes(a)||a.includes(b))return .9;const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return 1-d[a.length][b.length]/Math.max(a.length,b.length);}
async function ensure(db){await db.prepare('CREATE TABLE IF NOT EXISTS personal_foods (user_id INTEGER NOT NULL,food_key TEXT NOT NULL,product_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (user_id,food_key))').run();}
export async function savePersonalFood(db,input){
  const p=productFromLabel(input),serving=foodPackageSize(p?.serving_size);
  if(p?.nutrition_basis==='portion'&&serving){
    for(const key of ['calories_100g','protein_100g','carbs_100g','fat_100g','fiber_100g','salt_100g'])if(p[key]!=null)p[key]=p[key]*100/serving.amount;
    p.nutrition_basis=serving.unit;
  }
  const portion=p?.nutrition_basis==='portion';
  await ensure(db);
  if(input.id&&!await db.prepare('SELECT food_key FROM personal_foods WHERE user_id=? AND food_key=?').bind(db.userId,String(input.id)).first())throw new Error('Potravina nebyla nalezena.');
  if(!p?.name||p.name.length>180||!['g','ml','portion'].includes(p.nutrition_basis)||['calories_100g','protein_100g','carbs_100g','fat_100g'].some(k=>p[k]==null||p[k]<0||p[k]>(k==='calories_100g'?(portion?10000:1000):(portion?1000:100))))throw new Error('Doplň název, jednotku a platné nutriční hodnoty.');
  await ensure(db);const product={...p,quantity:String(input.quantity||'').slice(0,100),source:'personal',confidence:'user'};
  await db.prepare('INSERT INTO personal_foods(user_id,food_key,product_json) VALUES(?,?,?) ON CONFLICT(user_id,food_key) DO UPDATE SET product_json=excluded.product_json,updated_at=CURRENT_TIMESTAMP').bind(db.userId,input.id?String(input.id):foodKey(product.name)+'|'+foodKey(product.brand),JSON.stringify(product)).run();
  const id=input.id?String(input.id):foodKey(product.name)+'|'+foodKey(product.brand);await saveSharedFood(db,product,id);return {...product,id};
}
export async function searchPersonalFoods(db,name,barcode){await ensure(db);const r=await db.prepare('SELECT food_key,product_json FROM personal_foods WHERE user_id=? ORDER BY updated_at DESC LIMIT 500').bind(db.userId).all();return(r.results||[]).map(r=>({...JSON.parse(r.product_json),id:r.food_key})).filter(p=>barcode?String(p.barcode)===String(barcode):foodSimilarity(name,p.name)>=.65).sort((a,b)=>foodSimilarity(name,b.name)-foodSimilarity(name,a.name)).slice(0,12);}
export async function listPersonalFoods(db){await ensure(db);return (await db.prepare('SELECT food_key,product_json FROM personal_foods WHERE user_id=? ORDER BY updated_at DESC LIMIT 500').bind(db.userId).all()).results.map(r=>({...JSON.parse(r.product_json),id:r.food_key}));}
export async function searchFoodCatalog(db,name,barcode){
  const [own,shared]=await Promise.all([searchPersonalFoods(db,name,barcode),searchSharedFoods(db,name,barcode)]);
  const identity=p=>[p.barcode||foodKey(p.name)+'|'+foodKey(p.brand),p.quantity,p.nutrition_basis,p.calories_100g,p.protein_100g,p.carbs_100g,p.fat_100g].join('|');
  const result=[],seen=new Set();for(const p of [...own,...shared]){const key=identity(p);if(!seen.has(key)){seen.add(key);result.push(p);}}
  return result.slice(0,12);
}

export async function deletePersonalFood(db,id){await ensure(db);const r=await db.prepare('DELETE FROM personal_foods WHERE user_id=? AND food_key=?').bind(db.userId,String(id)).run();if(!r.meta.changes)throw new Error('Potravina nebyla nalezena.');await removeFoodContribution(db,id);}
