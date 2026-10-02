import { getCookbook, getCookbookRecipeByPage } from "./cookbook.js";
import { calculateAmount, normalizeBarcode, productFromLabel } from "./food-sources.js";
import { searchPersonalFoods } from "./personal-foods.js";

const n = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const text = v => v == null ? "" : String(v).trim();

export async function ensureFoodLogTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS food_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, meal_time TEXT, meal_type TEXT, recipe_page INTEGER, recipe_name TEXT, cookbook_page INTEGER, servings REAL NOT NULL DEFAULT 1, calories REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT NOT NULL DEFAULT 'eaten', source TEXT NOT NULL DEFAULT 'cookbook', note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  for (const column of [
    ["fiber_g","REAL"],
    ["salt_g","REAL"],
    ["amount_g","REAL"],
    ["brand","TEXT"],
    ["barcode","TEXT"]
  ]) {
    try { await db.prepare(`ALTER TABLE food_log ADD COLUMN ${column[0]} ${column[1]}`).run(); } catch (_) {}
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_log_user_0 ON food_log(user_id, date)").run();
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
// Label values first, then the user's saved foods by barcode or name.
export async function resolveFoodProduct(db, input = {}) {
  const label = productFromLabel(input);
  if (label) return { status:"ok", match:"package_label", product:label, candidates:[] };
  const name = text(input.name), barcode = normalizeBarcode(input.barcode);
  const personal = (name || barcode) && db?.userId ? await searchPersonalFoods(db, name, barcode) : [];
  if (personal.length) return { status:"ok", match:"personal", product:personal[0], candidates:personal };
  return { status:"not_found", match:"none", product:null, candidates:[], message:"Food not found among saved foods. Send the package label values (per 100 g)." };
}

export async function logResolvedFood(db, input = {}) {
  const product = (await resolveFoodProduct(db, input)).product;
  if (!product) throw new Error("Food product could not be resolved. Send the package label values per 100 g.");
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
    fiber_g: amount?.fiber_g ?? n(input.fiber_g, product.fiber_100g),
    salt_g: amount?.salt_g ?? n(input.salt_g, product.salt_100g),
    servings: amount ? 1 : input.servings,
    amount_g: grams,
    source: input.source || product.source,
    name: input.name || product.name,
    note: [input.note, grams != null ? `amount_g=${grams}` : null].filter(Boolean).join("; ")
  });
}

export async function logFood(db, input = {}) {
  await ensureFoodLogTable(db);
  const date=text(input.date) || new Date().toISOString().slice(0,10), servings=Math.max(0.01,n(input.servings,1)), status=normalizeStatus(input.status);
  const sourceText = text(input.source).toLowerCase();
  const useCookbook = sourceText === "" || sourceText === "cookbook" || input.page != null || input.recipeId;
  const recipe = useCookbook && (input.page != null || input.name || input.recipeId) ? await getCookbookRecipe({page:input.page,name:useCookbook ? input.name : null,recipeId:input.recipeId}) : null;
  if (!recipe && input.calories == null && input.protein_g == null && input.carbs_g == null && input.fat_g == null) throw new Error("Recipe not found and no nutrition values were supplied");
  const calories=n(input.calories,recipe?.calories), protein=n(input.protein_g,recipe?.protein_g), carbs=n(input.carbs_g,recipe?.carbs_g), fat=n(input.fat_g,recipe?.fat_g);
  const result=await db.prepare("INSERT INTO food_log (user_id, date,meal_time,meal_type,recipe_page,recipe_name,cookbook_page,servings,calories,protein_g,carbs_g,fat_g,fiber_g,salt_g,amount_g,brand,barcode,status,source,note) VALUES (?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(db.userId, 
    date,text(input.meal_time || input.mealTime)||null,text(input.meal_type || input.mealType)||null,recipe?.page ?? n(input.page),recipe?.name || text(input.name)||null,recipe?.page ?? n(input.page),servings,
    calories==null?null:calories*servings,protein==null?null:protein*servings,carbs==null?null:carbs*servings,fat==null?null:fat*servings,n(input.fiber_g, null)==null?null:n(input.fiber_g)*servings,n(input.salt_g, null)==null?null:n(input.salt_g)*servings,n(input.amount_g ?? input.grams, null),text(input.brand)||null,normalizeBarcode(input.barcode)||null,status,text(input.source)||"cookbook",text(input.note)||null
  ).run();
  return {status:"ok",id:result.meta?.last_row_id ?? null,date,entryStatus:status,servings,recipe,nutrition:{calories:calories==null?null:calories*servings,protein_g:protein==null?null:protein*servings,carbs_g:carbs==null?null:carbs*servings,fat_g:fat==null?null:fat*servings,fiber_g:n(input.fiber_g,null)==null?null:n(input.fiber_g)*servings,salt_g:n(input.salt_g,null)==null?null:n(input.salt_g)*servings}};
}
export function remainingNutrition(nutritionPlan, eaten = {}) {
  const target=nutritionPlan||{};
  return {
    calories:Math.max(0,n(target.calorieTarget,0)-n(eaten.calories,0)),
    protein_g:Math.max(0,n(target.macros?.proteinGrams,0)-n(eaten.protein_g,0)),
    carbs_g:Math.max(0,n(target.macros?.carbsGrams,0)-n(eaten.carbs_g,0)),
    fat_g:Math.max(0,n(target.macros?.fatGrams,0)-n(eaten.fat_g,0))
  };
}

export async function consumePlannedFood(db, input = {}) {
  await ensureFoodLogTable(db);
  const id=n(input.id);
  if (!id) throw new Error("Missing food log id");
  const row=await db.prepare("SELECT * FROM food_log WHERE user_id = ? AND id=?").bind(db.userId, id).first();
  if (!row) throw new Error("Food log entry not found");
  if (row.status !== "planned") throw new Error("Only planned food can be consumed with this action");
  const currentServings=Math.max(0,n(row.servings,1));
  const requested=input.servings == null ? currentServings : Math.max(0.01,n(input.servings));
  if (requested > currentServings + 1e-9) throw new Error("Consumed servings exceed planned servings");
  if (Math.abs(requested-currentServings) < 1e-9) {
    await db.prepare("UPDATE food_log SET status='eaten' WHERE user_id = ? AND id=?").bind(db.userId, id).run();
    return {status:"ok",mode:"promoted",id,consumedId:id,remainingPlannedServings:0};
  }
  const factor=requested/currentServings;
  const remaining=currentServings-requested;
  const result=await db.prepare("UPDATE food_log SET servings=?, calories=?, protein_g=?, carbs_g=?, fat_g=?, fiber_g=?, salt_g=?, amount_g=? WHERE id=? AND user_id=?").bind(
    remaining,
    n(row.calories,0)* (1-factor), n(row.protein_g,0)*(1-factor), n(row.carbs_g,0)*(1-factor), n(row.fat_g,0)*(1-factor),
    row.fiber_g==null?null:n(row.fiber_g,0)*(1-factor), row.salt_g==null?null:n(row.salt_g,0)*(1-factor), row.amount_g==null?null:n(row.amount_g,0)*(1-factor), id, db.userId
  ).run();
  const per={calories:n(row.calories,0)*factor,protein_g:n(row.protein_g,0)*factor,carbs_g:n(row.carbs_g,0)*factor,fat_g:n(row.fat_g,0)*factor,fiber_g:row.fiber_g==null?null:n(row.fiber_g,0)*factor,salt_g:row.salt_g==null?null:n(row.salt_g,0)*factor};
  const ins=await db.prepare("INSERT INTO food_log (user_id, date,meal_time,meal_type,recipe_page,recipe_name,cookbook_page,servings,calories,protein_g,carbs_g,fat_g,fiber_g,salt_g,amount_g,brand,barcode,status,source,note) VALUES (?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(db.userId, 
    row.date,row.meal_time,row.meal_type,row.recipe_page,row.recipe_name,row.cookbook_page,requested,per.calories,per.protein_g,per.carbs_g,per.fat_g,per.fiber_g,per.salt_g,row.amount_g==null?null:n(row.amount_g,0)*factor,row.brand,row.barcode,"eaten",row.source,row.note
  ).run();
  return {status:"ok",mode:"split",plannedId:id,consumedId:ins.meta?.last_row_id??null,remainingPlannedServings:remaining};
}

export async function updateFoodEntry(db, input = {}) {
  await ensureFoodLogTable(db);
  const id=n(input.id); if(!id) throw new Error("Missing food log id");
  const row=await db.prepare("SELECT * FROM food_log WHERE user_id = ? AND id=?").bind(db.userId, id).first();
  if(!row) throw new Error("Food log entry not found");
  const servings=Math.max(0.01,n(input.servings,row.servings));
  const baseCalories=input.calories!=null?n(input.calories):n(row.calories)/Math.max(0.01,n(row.servings,1));
  const baseProtein=input.protein_g!=null?n(input.protein_g):n(row.protein_g)/Math.max(0.01,n(row.servings,1));
  const baseCarbs=input.carbs_g!=null?n(input.carbs_g):n(row.carbs_g)/Math.max(0.01,n(row.servings,1));
  const baseFat=input.fat_g!=null?n(input.fat_g):n(row.fat_g)/Math.max(0.01,n(row.servings,1));
  const fiber=input.fiber_g!=null?n(input.fiber_g):row.fiber_g==null?null:n(row.fiber_g)/Math.max(0.01,n(row.servings,1));
  const salt=input.salt_g!=null?n(input.salt_g):row.salt_g==null?null:n(row.salt_g)/Math.max(0.01,n(row.servings,1));
  await db.prepare("UPDATE food_log SET meal_time=?,meal_type=?,servings=?,calories=?,protein_g=?,carbs_g=?,fat_g=?,fiber_g=?,salt_g=?,status=?,note=? WHERE id=? AND user_id=?").bind(
    text(input.meal_time??input.mealTime??row.meal_time)||null,text(input.meal_type??input.mealType??row.meal_type)||null,servings,
    baseCalories*servings,baseProtein*servings,baseCarbs*servings,baseFat*servings,fiber==null?null:fiber*servings,salt==null?null:salt*servings,
    normalizeStatus(input.status??row.status),text(input.note??row.note)||null,id,db.userId
  ).run();
  return {status:"ok",id};
}

export async function cancelFoodEntry(db, id) {
  await ensureFoodLogTable(db); const key=n(id); if(!key) throw new Error("Missing food log id");
  const result=await db.prepare("UPDATE food_log SET status='cancelled' WHERE user_id = ? AND id=?").bind(db.userId, key).run();
  return {status:"ok",id:key,cancelled:!!result.meta?.changes};
}

export async function getFoodDay(db,date) {
  await ensureFoodLogTable(db); const day=text(date)||new Date().toISOString().slice(0,10);
  const rows=await db.prepare("SELECT id,date,meal_time,meal_type,recipe_page,recipe_name,cookbook_page,servings,calories,protein_g,carbs_g,fat_g,fiber_g,salt_g,amount_g,brand,barcode,status,source,note,created_at FROM food_log WHERE user_id = ? AND date=? ORDER BY COALESCE(meal_time,created_at),id").bind(db.userId, day).all();
  const all=rows.results||[],eaten=all.filter(r=>r.status==="eaten"),planned=all.filter(r=>r.status==="planned");
  const sum=list=>["calories","protein_g","carbs_g","fat_g","fiber_g","salt_g"].reduce((o,k)=>{o[k]=Math.round(list.reduce((s,r)=>s+n(r[k],0),0));return o;},{});
  return {status:"ok",date:day,entries:all,totals:{eaten:sum(eaten),planned:sum(planned),all:sum(all.filter(r=>r.status!=="cancelled"))}};
}
export function recommendFood({day,nutritionPlan,entries}) {
  const target=nutritionPlan||{};
  const eaten=entries?.totals?.eaten||{};
  const remaining=remainingNutrition(target,eaten);
  const planned=(entries?.entries||[]).filter(r=>r.status==="planned");
  const plannedFoodOptions=planned.map(r=>{
    const ratio=Math.max(0.01,n(r.servings,1));
    const kcal=n(r.calories,0), protein=n(r.protein_g,0), carbs=n(r.carbs_g,0), fat=n(r.fat_g,0);
    const proteinFit=Math.min(protein/Math.max(remaining.protein_g,1),1);
    const calorieFit=Math.min(kcal/Math.max(remaining.calories,1),1);
    const overshoot=Math.max(0,kcal-remaining.calories);
    const score=(proteinFit*0.55)+(calorieFit*0.25)+(remaining.calories>0?Math.max(0,1-overshoot/Math.max(remaining.calories,1))*0.20:0);
    return {id:r.id,name:r.recipe_name,servings:r.servings,calories:kcal,protein_g:protein,carbs_g:carbs,fat_g:fat,score:Number(score.toFixed(3)),mealType:r.meal_type,mealTime:r.meal_time};
  }).sort((a,b)=>b.score-a.score);
  const suggestions=[];
  const completedRide=n(target.training?.cyclingTrainingCalories,0)>0;
  const longRide=!!target.fueling?.plannedRide && n(target.fueling.plannedRide.durationHours,0)>=1.5;

  if(plannedFoodOptions.length) {
    const pick=plannedFoodOptions[0];
    suggestions.push({
      reason:"use_planned_food",
      suggestion:`Máš naplánované jídlo „${pick.name}“ — ${pick.servings} porcí. Z hlediska dnešního zbývajícího příjmu dává smysl začít jím.`,
      food:pick
    });
  }
  if(completedRide && remaining.protein_g>=25) {
    suggestions.push({
      reason:"post_ride_recovery",
      suggestion:"Po dokončeném kole máš stále prostor hlavně na bílkoviny; dej přednost normálnímu jídlu s kvalitním zdrojem bílkovin a podle délky/intenzity kola i sacharidům."
    });
  } else if(longRide && remaining.carbs_g>=60) {
    suggestions.push({
      reason:"ride_carbs",
      suggestion:"Na delší plánované kolo je vhodné mít dostatek sacharidů; přednostně je pokryj jídlem, které už máš naplánované, případně rýží, pečivem, bramborami nebo ovocem."
    });
  }
  if(remaining.protein_g>=30 && !plannedFoodOptions.length)
    suggestions.push({reason:"protein_remaining",suggestion:"Chybí ti významná část bílkovin; vhodný je skyr/tvaroh, libové maso, vejce nebo proteinový nápoj podle dostupnosti."});
  if(remaining.calories<=150)
    suggestions.push({reason:"target_nearby",suggestion:"Jsi blízko dnešního kalorického cíle; další jídlo drž spíše malé a podle zbývajících makroživin."});
  if(!suggestions.length)
    suggestions.push({reason:"balanced_remaining",suggestion:"Zbývá prostor pro jídlo podle zbývajících kalorií a makroživin."});
  const mealSchedule=[];
  const plannedByTime=[...planned].sort((a,b)=>String(a.meal_time||"").localeCompare(String(b.meal_time||"")));
  if(longRide && remaining.carbs_g>=60)
    mealSchedule.push({phase:"pre_ride",timing:"1–3 h před kolem",goal:"sacharidy + lehce stravitelné jídlo",suggestion:"Pokryj část sacharidů z připraveného jídla; před delší jízdou nechoď s velkým kalorickým deficitem."});
  if(completedRide && remaining.protein_g>=25)
    mealSchedule.push({phase:"post_ride",timing:"do 2 h po kole",goal:"regenerace",suggestion:"Normální jídlo s kvalitním proteinem a sacharidy podle délky/intenzity jízdy."});
  for(const item of plannedByTime.slice(0,4))
    mealSchedule.push({phase:item.meal_type||"planned",timing:item.meal_time||"podle hladu a tréninku",goal:"využít připravené jídlo",food:item.recipe_name||item.name||"plánované jídlo",servings:item.servings});
  return {status:"ok",day,remaining,plannedFoodOptions,suggestions,mealSchedule};
}


export async function getFoodFavorites(db, limit=20) {
  await ensureFoodLogTable(db);
  const safe=Math.max(1,Math.min(50,Number(limit)||20));
  const rows=await db.prepare(`SELECT COALESCE(barcode,'') barcode, COALESCE(recipe_name,'') name, COALESCE(brand,'') brand,
      COUNT(*) count, MAX(created_at) lastUsed,
      ROUND(AVG(NULLIF(calories,0)),0) calories,
      ROUND(AVG(NULLIF(protein_g,0)),1) protein_g,
      ROUND(AVG(NULLIF(carbs_g,0)),1) carbs_g,
      ROUND(AVG(NULLIF(fat_g,0)),1) fat_g
    FROM food_log
    WHERE user_id = ? AND status='eaten' AND date>=date('now','-60 day') AND (recipe_name IS NOT NULL OR barcode IS NOT NULL)
    GROUP BY barcode, recipe_name, brand
    ORDER BY count DESC, lastUsed DESC
    LIMIT ?`).bind(db.userId, safe).all();
  return {status:"ok",limit:safe,days:60,foods:rows.results||[]};
}
