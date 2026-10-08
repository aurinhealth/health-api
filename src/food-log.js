import { L } from './lang.js';
import { getCookbook, getCookbookRecipeByPage } from "./cookbook.js";
import { calculateAmount, normalizeBarcode, productFromLabel } from "./food-sources.js";
import { searchPersonalFoods } from "./personal-foods.js";
import { localToday, timeZone } from "./user-time.js";
import { dateFormat } from "./date-format.js";

// null and "" are missing values, not 0: ChatGPT sends "servings": null, and
// that used to log 0.01 of a portion.
const n = (v, fallback = null) => v == null || v === "" ? fallback : Number.isFinite(Number(v)) ? Number(v) : fallback;
const text = v => v == null ? "" : String(v).trim();

// ---- One food diary -----------------------------------------------------------
// ChatGPT (MCP) and the coach inbox log into the app's own diary (food_logs),
// so a meal shows up in the app and counts once. Eaten food has no status, like
// every meal logged in the app; a planned ("planned") or cancelled one stays out
// of the app's totals. The meal, salt, grams, brand and barcode live in the
// note, as the app keeps them.
export const EATEN_FOOD = "(status IS NULL OR status='eaten')";
let diaryReady = false;
export async function ensureFoodLogTable(db) {
  if (diaryReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS food_logs (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL NOT NULL DEFAULT (1), kcal REAL NOT NULL DEFAULT (0), protein_g REAL NOT NULL DEFAULT (0), carbs_g REAL NOT NULL DEFAULT (0), fat_g REAL NOT NULL DEFAULT (0), fiber_g REAL NOT NULL DEFAULT (0), source TEXT NOT NULL DEFAULT ('manual'), note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), status TEXT)").run();
  // A database from before migration 0007 has no status column yet.
  try { await db.prepare("ALTER TABLE food_logs ADD COLUMN status TEXT").run(); } catch (_) {}
  diaryReady = true;
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
const DIARY_MEALS = [[/break|snída|snida/i, "breakfast"], [/lunch|oběd|obed/i, "lunch"], [/dinner|supper|večeř|veceř|vecer/i, "dinner"], [/snack|svač|svac/i, null]];
// The app's meal for a free-text meal type ("oběd", "snack") and time.
function diaryMealType(type, time) {
  const value = text(type);
  if (["breakfast", "snack_am", "lunch", "snack_pm", "dinner"].includes(value)) return value;
  const hit = DIARY_MEALS.find(([re]) => re.test(value));
  if (!hit) return null;
  if (hit[1]) return hit[1];
  const hour = Number(String(time || "").match(/^(\d{1,2}):/)?.[1]);
  return Number.isFinite(hour) && hour < 12 ? "snack_am" : "snack_pm";
}
function noteOf(row) { try { const note = JSON.parse(row?.note || "{}"); return note && typeof note === "object" && !Array.isArray(note) ? note : { text: String(row.note) }; } catch { return row?.note ? { text: String(row.note) } : {}; } }
// When a meal is logged for another day than today, it gets its slot's usual time.
export const MEAL_DEFAULT_TIMES = { breakfast: "07:00", snack_am: "10:00", lunch: "12:00", snack_pm: "16:00", dinner: "19:00" };
export function mealConsumedAt(date, mealType) {
  return date === localToday() ? null : date + "T" + (MEAL_DEFAULT_TIMES[mealType] || "12:00") + ":00";
}
function consumedAt(date, time) {
  const t = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (t) return date + "T" + t[1].padStart(2, "0") + ":" + t[2] + ":00";
  return date === localToday() ? new Date().toISOString() : date + "T12:00:00";
}
// "HH:MM" in Prague from the app's consumed_at (local, or UTC with Z).
function pragueTime(value) {
  const t = String(value || "");
  if (!/T\d{2}:\d{2}/.test(t)) return null;
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(t)) return t.slice(11, 16);
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? dateFormat("en-GB", { timeZone: timeZone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) : null;
}
// A diary row in the shape the ChatGPT tools have always returned.
function toEntry(row) {
  const note = noteOf(row);
  return { id: row.id, date: row.consumed_date, meal_time: pragueTime(row.consumed_at), meal_type: note.mealType || null, recipe_page: row.cookbook_page ?? null, recipe_name: row.recipe_title, cookbook_page: row.cookbook_page ?? null, servings: row.servings, calories: row.kcal, protein_g: row.protein_g, carbs_g: row.carbs_g, fat_g: row.fat_g, fiber_g: row.fiber_g, salt_g: note.salt_g ?? null, amount_g: note.amount_g ?? null, brand: note.brand || null, barcode: note.barcode || null, status: row.status || "eaten", source: row.source, note: note.text || note.legacyNote || null, created_at: row.created_at };
}
const compactNote = note => JSON.stringify(Object.fromEntries(Object.entries(note).filter(([, v]) => v != null && v !== "")));

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
  const date=text(input.date) || localToday(), servings=Math.max(0.01,n(input.servings,1)), status=normalizeStatus(input.status);
  const sourceText = text(input.source).toLowerCase();
  // Own nutrition values make it a manual entry: a loose name match must not
  // turn "Tvaroh, 200 kcal" into "Zapečené palačinky s tvarohem".
  const ownValues = [input.calories, input.protein_g, input.carbs_g, input.fat_g].some(v => v != null && v !== "");
  const useCookbook = input.page != null || input.recipeId || sourceText === "cookbook" || (sourceText === "" && !ownValues);
  const recipe = useCookbook && (input.page != null || input.name || input.recipeId) ? await getCookbookRecipe({page:input.page,name:useCookbook ? input.name : null,recipeId:input.recipeId}) : null;
  if (!recipe && input.calories == null && input.protein_g == null && input.carbs_g == null && input.fat_g == null) throw new Error("Recipe not found and no nutrition values were supplied");
  const calories=n(input.calories,recipe?.calories), protein=n(input.protein_g,recipe?.protein_g), carbs=n(input.carbs_g,recipe?.carbs_g), fat=n(input.fat_g,recipe?.fat_g);
  const each = (v, scale = servings) => v == null ? null : v * scale;
  const page = recipe?.page ?? n(input.page), meal = diaryMealType(input.meal_type || input.mealType, input.meal_time || input.mealTime);
  const note = compactNote({ mealType: meal, salt_g: each(n(input.salt_g, null)), amount_g: n(input.amount_g ?? input.grams, null), brand: text(input.brand) || null, barcode: normalizeBarcode(input.barcode) || null, text: text(input.note) || null });
  const result=await db.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,cookbook_page,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(db.userId,
    date,consumedAt(date,input.meal_time||input.mealTime),page,recipe?.name||text(input.name)||"Jídlo",servings,
    each(calories)??0,each(protein)??0,each(carbs)??0,each(fat)??0,each(n(input.fiber_g,null))??0,
    text(input.source)||(recipe?"cookbook":"manual"),note,status==="eaten"?null:status
  ).run();
  const nutrition={calories:each(calories),protein_g:each(protein),carbs_g:each(carbs),fat_g:each(fat),fiber_g:each(n(input.fiber_g,null)),salt_g:each(n(input.salt_g,null))};
  return {status:"ok",id:result.meta?.last_row_id ?? null,date,entryStatus:status,servings,recipe,nutrition};
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

async function diaryRow(db, id) {
  const key = n(id); if (!key) throw new Error("Missing food log id");
  const row = await db.prepare("SELECT * FROM food_logs WHERE user_id = ? AND id=?").bind(db.userId, key).first();
  if (!row) throw new Error("Food log entry not found");
  return row;
}
export async function consumePlannedFood(db, input = {}) {
  await ensureFoodLogTable(db);
  const row = await diaryRow(db, input.id), id = row.id;
  if (row.status !== "planned") throw new Error("Only planned food can be consumed with this action");
  const currentServings=Math.max(0,n(row.servings,1));
  const requested=input.servings == null ? currentServings : Math.max(0.01,n(input.servings));
  if (requested > currentServings + 1e-9) throw new Error("Consumed servings exceed planned servings");
  const when = row.consumed_date === localToday() ? new Date().toISOString() : row.consumed_at;
  if (Math.abs(requested-currentServings) < 1e-9) {
    await db.prepare("UPDATE food_logs SET status=NULL, consumed_at=? WHERE user_id = ? AND id=?").bind(when, db.userId, id).run();
    return {status:"ok",mode:"promoted",id,consumedId:id,remainingPlannedServings:0};
  }
  const factor=requested/currentServings, remaining=currentServings-requested, part=k=>n(row[k],0)*factor, rest=k=>n(row[k],0)*(1-factor);
  await db.prepare("UPDATE food_logs SET servings=?, kcal=?, protein_g=?, carbs_g=?, fat_g=?, fiber_g=? WHERE id=? AND user_id=?").bind(remaining,rest("kcal"),rest("protein_g"),rest("carbs_g"),rest("fat_g"),rest("fiber_g"),id,db.userId).run();
  const ins=await db.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,cookbook_page,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)").bind(db.userId,
    row.consumed_date,when,row.cookbook_page,row.recipe_title,requested,part("kcal"),part("protein_g"),part("carbs_g"),part("fat_g"),part("fiber_g"),row.source,row.note).run();
  return {status:"ok",mode:"split",plannedId:id,consumedId:ins.meta?.last_row_id??null,remainingPlannedServings:remaining};
}

export async function updateFoodEntry(db, input = {}) {
  await ensureFoodLogTable(db);
  const row = await diaryRow(db, input.id), id = row.id, old = Math.max(0.01, n(row.servings, 1));
  const servings=Math.max(0.01,n(input.servings,old));
  const base = (k, rowKey) => input[k] != null && input[k] !== "" ? n(input[k], 0) : n(row[rowKey], 0) / old;
  const note = noteOf(row), meal = input.meal_type ?? input.mealType;
  if (meal != null) note.mealType = diaryMealType(meal, input.meal_time ?? input.mealTime) || note.mealType;
  if (input.salt_g != null && input.salt_g !== "") note.salt_g = n(input.salt_g, 0) * servings;
  if (input.note != null) note.text = text(input.note) || null;
  const time = input.meal_time ?? input.mealTime, status = normalizeStatus(input.status ?? row.status ?? "eaten");
  await db.prepare("UPDATE food_logs SET consumed_at=?,servings=?,kcal=?,protein_g=?,carbs_g=?,fat_g=?,fiber_g=?,status=?,note=? WHERE id=? AND user_id=?").bind(
    time ? consumedAt(row.consumed_date, time) : row.consumed_at, servings,
    base("calories","kcal")*servings, base("protein_g","protein_g")*servings, base("carbs_g","carbs_g")*servings, base("fat_g","fat_g")*servings, base("fiber_g","fiber_g")*servings,
    status === "eaten" ? null : status, compactNote(note), id, db.userId
  ).run();
  return {status:"ok",id};
}

export async function cancelFoodEntry(db, id) {
  await ensureFoodLogTable(db); const key=n(id); if(!key) throw new Error("Missing food log id");
  const result=await db.prepare("UPDATE food_logs SET status='cancelled' WHERE user_id = ? AND id=?").bind(db.userId, key).run();
  return {status:"ok",id:key,cancelled:!!result.meta?.changes};
}

export async function getFoodDay(db,date) {
  await ensureFoodLogTable(db); const day=text(date)||localToday();
  const rows=await db.prepare("SELECT * FROM food_logs WHERE user_id = ? AND consumed_date=? ORDER BY consumed_at,id").bind(db.userId, day).all();
  const all=(rows.results||[]).map(toEntry),eaten=all.filter(r=>r.status==="eaten"),planned=all.filter(r=>r.status==="planned");
  const sum=list=>["calories","protein_g","carbs_g","fat_g","fiber_g","salt_g"].reduce((o,k)=>{o[k]=Math.round(list.reduce((s,r)=>s+n(r[k],0),0));return o;},{});
  return {status:"ok",date:day,entries:all,totals:{eaten:sum(eaten),planned:sum(planned),all:sum(all.filter(r=>r.status!=="cancelled"))}};
}
export function recommendFood({day,nutritionPlan,entries}) {
  const target=nutritionPlan||{};
  const eaten=entries?.totals?.eaten||{};
  const remaining=remainingNutrition(target,eaten);
  const planned=(entries?.entries||[]).filter(r=>r.status==="planned");
  const plannedFoodOptions=planned.map(r=>{
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
      suggestion:L(`Máš naplánované jídlo „${pick.name}“ — ${pick.servings} porcí. Z hlediska dnešního zbývajícího příjmu dává smysl začít jím.`, `You have a planned meal “${pick.name}” — ${pick.servings} servings. Given today's remaining intake, it makes sense to start with it.`),
      food:pick
    });
  }
  if(completedRide && remaining.protein_g>=25) {
    suggestions.push({
      reason:"post_ride_recovery",
      suggestion:L("Po dokončeném kole máš stále prostor hlavně na bílkoviny; dej přednost normálnímu jídlu s kvalitním zdrojem bílkovin a podle délky/intenzity kola i sacharidům.", "After the ride you still have room mainly for protein; prefer a normal meal with a good protein source, plus carbs depending on the ride's length and intensity.")
    });
  } else if(longRide && remaining.carbs_g>=60) {
    suggestions.push({
      reason:"ride_carbs",
      suggestion:L("Na delší plánované kolo je vhodné mít dostatek sacharidů; přednostně je pokryj jídlem, které už máš naplánované, případně rýží, pečivem, bramborami nebo ovocem.", "For a longer planned ride, have enough carbs; cover them first with food you've already planned, or with rice, bread, potatoes or fruit.")
    });
  }
  if(remaining.protein_g>=30 && !plannedFoodOptions.length)
    suggestions.push({reason:"protein_remaining",suggestion:L("Chybí ti významná část bílkovin; vhodný je skyr/tvaroh, libové maso, vejce nebo proteinový nápoj podle dostupnosti.", "You're missing a big part of your protein; skyr/quark, lean meat, eggs or a protein shake work well.")});
  if(remaining.calories<=150)
    suggestions.push({reason:"target_nearby",suggestion:L("Jsi blízko dnešního kalorického cíle; další jídlo drž spíše malé a podle zbývajících makroživin.", "You're close to today's calorie goal; keep your next meal small and in line with your remaining macros.")});
  if(!suggestions.length)
    suggestions.push({reason:"balanced_remaining",suggestion:L("Zbývá prostor pro jídlo podle zbývajících kalorií a makroživin.", "There's room for a meal within your remaining calories and macros.")});
  const mealSchedule=[];
  const plannedByTime=[...planned].sort((a,b)=>String(a.meal_time||"").localeCompare(String(b.meal_time||"")));
  if(longRide && remaining.carbs_g>=60)
    mealSchedule.push({phase:"pre_ride",timing:L("1–3 h před kolem", "1–3 h before the ride"),goal:L("sacharidy + lehce stravitelné jídlo", "carbs + easily digestible food"),suggestion:L("Pokryj část sacharidů z připraveného jídla; před delší jízdou nechoď s velkým kalorickým deficitem.", "Cover part of the carbs with your prepared food; don't start a longer ride in a big calorie deficit.")});
  if(completedRide && remaining.protein_g>=25)
    mealSchedule.push({phase:"post_ride",timing:L("do 2 h po kole", "within 2 h after the ride"),goal:L("regenerace", "recovery"),suggestion:L("Normální jídlo s kvalitním proteinem a sacharidy podle délky/intenzity jízdy.", "A normal meal with good protein and carbs depending on the ride's length and intensity.")});
  for(const item of plannedByTime.slice(0,4))
    mealSchedule.push({phase:item.meal_type||"planned",timing:item.meal_time||L("podle hladu a tréninku", "by hunger and training"),goal:L("využít připravené jídlo", "use the prepared food"),food:item.recipe_name||item.name||L("plánované jídlo", "planned food"),servings:item.servings});
  return {status:"ok",day,remaining,plannedFoodOptions,suggestions,mealSchedule};
}


export async function getFoodFavorites(db, limit=20) {
  await ensureFoodLogTable(db);
  const safe=Math.max(1,Math.min(50,Number(limit)||20));
  const rows=await db.prepare(`SELECT '' barcode, recipe_title name, '' brand,
      COUNT(*) count, MAX(created_at) lastUsed,
      ROUND(AVG(NULLIF(kcal,0)),0) calories,
      ROUND(AVG(NULLIF(protein_g,0)),1) protein_g,
      ROUND(AVG(NULLIF(carbs_g,0)),1) carbs_g,
      ROUND(AVG(NULLIF(fat_g,0)),1) fat_g
    FROM food_logs
    WHERE user_id = ? AND ${EATEN_FOOD} AND consumed_date>=date('now','-60 day') AND recipe_title IS NOT NULL
    GROUP BY recipe_title
    ORDER BY count DESC, lastUsed DESC
    LIMIT ?`).bind(db.userId, safe).all();
  return {status:"ok",limit:safe,days:60,foods:rows.results||[]};
}
