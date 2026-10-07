import {ensureFoodReports} from './shared-foods.js';
async function ensure(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS personal_recipes (user_id INTEGER NOT NULL,id TEXT NOT NULL,recipe_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,id))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shared_recipes (catalog_id TEXT PRIMARY KEY,recipe_json TEXT NOT NULL,search_name TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS recipe_contributions (user_id INTEGER NOT NULL,recipe_id TEXT NOT NULL,catalog_id TEXT NOT NULL,PRIMARY KEY(user_id,recipe_id))").run();
}
export function normalizeRecipe(input){
  const name=String(input.name||'').trim().slice(0,180),servings=Number(input.servings),ingredients=Array.isArray(input.ingredients)?input.ingredients:[];
  if(!name||!Number.isFinite(servings)||servings<=0||servings>100||!ingredients.length||ingredients.length>100)throw new Error('Doplň název, počet porcí a suroviny.');
  const sums={calories:0,protein_g:0,carbs_g:0,fat_g:0};
  const cleaned=ingredients.map(i=>{
    const item={name:String(i.name||'').trim().slice(0,180),quantity:Number(i.quantity),unit:['g','ml','piece'].includes(i.unit)?i.unit:'g'};
    if(!item.name||!Number.isFinite(item.quantity)||item.quantity<=0||item.quantity>100000)throw new Error('Doplň platné množství každé suroviny.');
    for(const k of Object.keys(sums)){const value=Number(i[k]);if(i[k]==null||i[k]===''||!Number.isFinite(value)||value<0||value>100000)throw new Error('Doplň nutriční hodnoty surovin pro použité množství.');item[k]=value;sums[k]+=value;}
    return item;
  });
  return {name,servings,ingredients:cleaned,shared:input.shared===true,...sums,portion:{name,nutrition_basis:'portion',calories_100g:sums.calories/servings,protein_100g:sums.protein_g/servings,carbs_100g:sums.carbs_g/servings,fat_100g:sums.fat_g/servings,source:'personal_recipe'}};
}
export async function listRecipes(db){await ensure(db);return (await db.prepare('SELECT id,recipe_json FROM personal_recipes WHERE user_id=? ORDER BY updated_at DESC').bind(db.userId).all()).results.map(r=>({...JSON.parse(r.recipe_json),id:r.id}));}
async function removeContribution(db,id){
  const old=await db.prepare('SELECT catalog_id FROM recipe_contributions WHERE user_id=? AND recipe_id=?').bind(db.userId,id).first();
  await db.prepare('DELETE FROM recipe_contributions WHERE user_id=? AND recipe_id=?').bind(db.userId,id).run();
  if(old)await db.prepare('DELETE FROM shared_recipes WHERE catalog_id=? AND NOT EXISTS (SELECT 1 FROM recipe_contributions WHERE user_id IS NOT NULL AND catalog_id=?)').bind(old.catalog_id,old.catalog_id).run();
}
export async function saveRecipe(db,input){
  await ensure(db);const recipe=normalizeRecipe(input),id=input.id?String(input.id):crypto.randomUUID();
  if(input.id&&!await db.prepare('SELECT id FROM personal_recipes WHERE user_id=? AND id=?').bind(db.userId,id).first())throw new Error('Jídlo nebylo nalezeno.');
  await db.prepare('INSERT INTO personal_recipes(user_id,id,recipe_json) VALUES(?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET recipe_json=excluded.recipe_json,updated_at=CURRENT_TIMESTAMP').bind(db.userId,id,JSON.stringify(recipe)).run();
  await removeContribution(db,id);
  if(recipe.shared){
    const publicRecipe={name:recipe.name,servings:recipe.servings,ingredients:recipe.ingredients,portion:{...recipe.portion,source:'shared_recipe',confidence:'user',label_verified:false}};
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(publicRecipe))),key=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    await db.prepare('INSERT INTO shared_recipes(catalog_id,recipe_json,search_name) VALUES(?,?,?) ON CONFLICT(catalog_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP').bind(key,JSON.stringify(publicRecipe),recipe.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()).run();
    await db.prepare('INSERT INTO recipe_contributions(user_id,recipe_id,catalog_id) VALUES(?,?,?)').bind(db.userId,id,key).run();
  }
  return {...recipe,id};
}
export async function deleteRecipe(db,id){await ensure(db);const r=await db.prepare('DELETE FROM personal_recipes WHERE user_id=? AND id=?').bind(db.userId,String(id)).run();if(!r.meta.changes)throw new Error('Jídlo nebylo nalezeno.');await removeContribution(db,String(id));}
export async function searchRecipes(db,name){
  await ensure(db);await ensureFoodReports(db);const q=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[%_]/g,'').trim();if(q.length<2)return [];
  const own=(await listRecipes(db)).filter(r=>r.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).map(r=>({...r.portion,recipeId:r.id}));
  const shared=(await db.prepare('SELECT catalog_id,recipe_json,(SELECT COUNT(*) FROM food_reports WHERE user_id IS NOT NULL AND catalog_id=shared_recipes.catalog_id) AS reports FROM shared_recipes WHERE search_name LIKE ? ORDER BY updated_at DESC LIMIT 12').bind('%'+q+'%').all()).results.map(r=>({...JSON.parse(r.recipe_json).portion,catalog_id:r.catalog_id,reports:r.reports,confidence:r.reports?'reported':'user'}));
  return [...own,...shared].slice(0,12);
}
