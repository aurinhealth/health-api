import { getCookbook, getCookbookRecipeByPage } from "./cookbook.js";
import { resolveFood, calculateAmount, normalizeBarcode, productFromLabel } from "./food-sources.js";

const n = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const text = v => v == null ? "" : String(v).trim();

export async function ensureFoodLogTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS food_log (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, meal_time TEXT, meal_type TEXT, recipe_page INTEGER, recipe_name TEXT, cookbook_page INTEGER, servings REAL NOT NULL DEFAULT 1, calories REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT NOT NULL DEFAULT 'eaten', source TEXT NOT NULL DEFAULT 'cookbook', note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log(date)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS food_products (id INTEGER PRIMARY KEY AUTOINCREMENT, barcode TEXT UNIQUE, name TEXT, brand TEXT, quantity TEXT, serving_size TEXT, calories_100g REAL, protein_100g REAL, carbs_100g REAL, fat_100g REAL, fiber_100g REAL, salt_100g REAL, source TEXT NOT NULL, source_url TEXT, confidence TEXT, raw_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_products_name ON food_products(name)").run();
}

function recipeId(recipe) {
  return text(recipe?.id || recipe?.recipe_id || recipe?.slug || String(recipe?.page || "recipe") + "-" + text(recipe?.name || recipe?.title));
}
function searchableRecipeText(recipe) {
  const fields = ["name","title","recipe_name","description","category","meal","keywords","tags","ingredients"];
  return fields.flatMap(k => { const v = recipe?.[k]; return Array.isArray(v) ? v.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)) : [v]; }).join(" ").toLowerCase();
}
function nutritionFromRecipe(recipe) {
  const source = recipe?.nutrition || recipe?.nutrients || recipe?.macros || recipe || {};
  return {
    calories: n(source.calories ?? source.kcal ?? source.energy_kcal ?? recipe?.calories),
    protein_g: n(source.protein_g ?? source.protein ?? recipe?.protein_g ?? recipe?.protein),
    carbs_g: n(source.carbs_g ?? source.carbohydrates_g ?? source.carbohydrates ?? recipe?.carbs_g ?? recipe?.carbs),
    fat_g: n(source.fat_g ?? source.fat ?? recipe?.fat_g ?? recipe?.fat)
  };
}
function publicRecipe(recipe, requestedPage = null) {
  return { id:recipeId(recipe), name:text(recipe?.name || recipe?.title || recipe?.recipe_name) || null, page:n(recipe?.page), requested_page:requestedPage, ...nutritionFromRecipe(recipe), ingredients:recipe?.ingredients || null, description:recipe?.description || null, raw:recipe };
}
export async function searchCookbookRecipes({ page, name, limit = 10 } = {}) {
  const data = await getCookbook();
  const recipes = Array.isArray(data?.recipes) ? data.recipes : [];
  const pageNumber = page == null || page === "" ? null : Number(page);
  const query = text(name).toLowerCase();
  const results = recipes.map(r => {
    const exactPage = Number.isInteger(pageNumber) && Number(r?.page) === pageNumber;
    const canonicalPage = Number.isInteger(pageNumber) && Number(data?.page_aliases?.[String(pageNumber)]) === Number(r?.page);
    const recipeText = searchableRecipeText(r);
    const nameExact = query && text(r?.name || r?.title || r?.recipe_name).toLowerCase() === query;
    const nameMatch = query && recipeText.includes(query);
    let score = exactPage ? 100 : canonicalPage ? 60 : 0;
    if (nameExact) score += 80; else if (nameMatch) score += 40;
    if (!pageNumber && !query) score = 1;
    return { r, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
  return { status:"ok", count:results.length, recipes:results.map(x => publicRecipe(x.r, pageNumber)) };
}
export async function getCookbookRecipe({ page, name, recipeId: wantedId } = {}) {
  if (page != null && page !== "") {
    const recipe = await getCookbookRecipeByPage(page);
    if (recipe && (!name || searchableRecipeText(recipe).includes(text(name).toLowerCase()))) return publicRecipe(recipe, Number(page));
  }
  const result = await searchCookbookRecipes({ page, name, limit:10 });
  return wantedId ? result.recipes.find(r => r.id === wantedId) || null : result.recipes[0] || null;
}
function normalizeStatus(status) { const s=text(status).toLowerCase(); return ["planned","eaten","cancelled"].includes(s) ? s : "eaten"; }
export async function resolveAndCacheFood(db, input = {}) {
  await ensureFoodLogTable(db);
  const result = await resolveFood(input);
  if (result.product?.barcode) {
    const p = result.product;
    await db.prepare("INSERT INTO food_products (barcode,name,brand,quantity,serving_size,calories_100g,protein_100g,carbs_100g,fat_100g,fiber_100g,salt_100g,source,source_url,confidence,raw_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(barcode) DO UPDATE SET name=excluded.name,brand=excluded.brand,quantity=excluded.quantity,serving_size=excluded.serving_size,calories_100g=excluded.calories_100g,protein_100g=excluded.protein_100g,carbs_100g=excluded.carbs_100g,fat_100g=excluded.fat_100g,fiber_100g=excluded.fiber_100g,salt_100g=excluded.salt_100g,source=excluded.source,source_url=excluded.source_url,confidence=excluded.confidence,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP").bind(
      p.barcode,p.name||null,p.brand||null,p.quantity||null,p.serving_size||null,p.calories_100g,p.protein_100g,p.carbs_100g,p.fat_100g,p.fiber_100g,p.salt_100g,p.source,p.source_url||null,p.confidence||null,JSON.stringify(p)
    ).run();
  }
  return result;
}

export async function lookupCachedFood(db, input = {}) {
  await ensureFoodLogTable(db);
  const barcode = normalizeBarcode(input.barcode);
  if (barcode) {
    const row = await db.prepare("SELECT * FROM food_products WHERE barcode=?").bind(barcode).first();
    if (row) return { status:"ok", match:"cache", product:row };
  }
  const name = text(input.name);
  if (name) {
    const rows = await db.prepare("SELECT * FROM food_products WHERE lower(name) LIKE lower(?) ORDER BY updated_at DESC LIMIT 8").bind("%"+name+"%").all();
    if (rows.results?.length) return { status:"ok", match:"cache_name", products:rows.results };
  }
  return null;
}

export async function logResolvedFood(db, input = {}) {
  const product = productFromLabel(input) || (await resolveAndCacheFood(db, input)).product;
  if (!product) throw new Error("Food product could not be resolved. Send the package label values or a barcode.");
  const grams = n(input.grams ?? input.amount_g ?? input.amountGrams);
  const amount = grams != null ? calculateAmount(product, grams) : null;
  const values = amount || {
    calories: n(input.calories, product.calories_100g),
    protein_g: n(input.protein_g, product.protein_100g),
    carbs_g: n(input.carbs_g, product.carbs_100g),
    fat_g: n(input.fat_g, product.fat_100g)
  };
  return logFood(db, {
    ...input,
    calories: values.calories,
    protein_g: values.protein_g,
    carbs_g: values.carbs_g,
    fat_g: values.fat_g,
    servings: amount ? 1 : input.servings,
    source: input.source || product.source,
    name: input.name || product.name,
    note: [input.note, grams != null ? `amount_g=${grams}` : null].filter(Boolean).join("; ")
  });
}

export async function logFood(db, input = {}) {
  await ensureFoodLogTable(db);
  const date=text(input.date) || new Date().toISOString().slice(0,10), servings=Math.max(0.01,n(input.servings,1)), status=normalizeStatus(input.status);
  const recipe=(input.page != null || input.name) ? await getCookbookRecipe({page:input.page,name:input.name,recipeId:input.recipeId}) : null;
  if (!recipe && input.calories == null && input.protein_g == null && input.carbs_g == null && input.fat_g == null) throw new Error("Recipe not found and no nutrition values were supplied");
  const calories=n(input.calories,recipe?.calories), protein=n(input.protein_g,recipe?.protein_g), carbs=n(input.carbs_g,recipe?.carbs_g), fat=n(input.fat_g,recipe?.fat_g);
  const result=await db.prepare("INSERT INTO food_log (date,meal_time,meal_type,recipe_page,recipe_name,cookbook_page,servings,calories,protein_g,carbs_g,fat_g,status,source,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(
    date,text(input.meal_time || input.mealTime)||null,text(input.meal_type || input.mealType)||null,recipe?.page ?? n(input.page),recipe?.name || text(input.name)||null,recipe?.page ?? n(input.page),servings,
    calories==null?null:calories*servings,protein==null?null:protein*servings,carbs==null?null:carbs*servings,fat==null?null:fat*servings,status,text(input.source)||"cookbook",text(input.note)||null
  ).run();
  return {status:"ok",id:result.meta?.last_row_id ?? null,date,entryStatus:status,servings,recipe,nutrition:{calories:calories==null?null:calories*servings,protein_g:protein==null?null:protein*servings,carbs_g:carbs==null?null:carbs*servings,fat_g:fat==null?null:fat*servings}};
}
export async function getFoodDay(db,date) {
  await ensureFoodLogTable(db); const day=text(date)||new Date().toISOString().slice(0,10);
  const rows=await db.prepare("SELECT id,date,meal_time,meal_type,recipe_page,recipe_name,cookbook_page,servings,calories,protein_g,carbs_g,fat_g,status,source,note,created_at FROM food_log WHERE date=? ORDER BY COALESCE(meal_time,created_at),id").bind(day).all();
  const all=rows.results||[],eaten=all.filter(r=>r.status==="eaten"),planned=all.filter(r=>r.status==="planned");
  const sum=list=>["calories","protein_g","carbs_g","fat_g"].reduce((o,k)=>{o[k]=Math.round(list.reduce((s,r)=>s+n(r[k],0),0));return o;},{});
  return {status:"ok",date:day,entries:all,totals:{eaten:sum(eaten),planned:sum(planned),all:sum(all.filter(r=>r.status!=="cancelled"))}};
}
export function recommendFood({day,nutritionPlan,entries}) {
  const target=nutritionPlan||{},eaten=entries?.totals?.eaten||{};
  const remaining={calories:Math.max(0,n(target.calorieTarget,0)-n(eaten.calories,0)),protein_g:Math.max(0,n(target.macros?.proteinGrams,0)-n(eaten.protein_g,0)),carbs_g:Math.max(0,n(target.macros?.carbsGrams,0)-n(eaten.carbs_g,0)),fat_g:Math.max(0,n(target.macros?.fatGrams,0)-n(eaten.fat_g,0))};
  const suggestions=[];
  if(remaining.protein_g>=30)suggestions.push({reason:"protein_remaining",suggestion:"Doplň hlavně bílkoviny; vhodná je porce libového masa, skyr/tvaroh nebo proteinový nápoj podle toho, co máš k dispozici."});
  if(remaining.carbs_g>=60 && n(target?.training?.plannedCyclingCalories,0)>0)suggestions.push({reason:"cycling_carbs_remaining",suggestion:"Po plánovaném kole je vhodné doplnit sacharidy; přednostně jídlem z kuchařky nebo snadno dostupnou rýží, pečivem či ovocem."});
  if(!suggestions.length)suggestions.push({reason:"balanced_remaining",suggestion:"Zbývá prostor pro jídlo podle zbývajících kalorií a makroživin."});
  return {status:"ok",day,remaining,suggestions};
}
