import { getCookbook, getCookbookRecipeByPage } from "./cookbook.js";
import { normalizeBarcode } from "./food-sources.js";
import { localToday } from "./user-time.js";

// null and "" are missing values, not 0: "servings": null used to log
// 0.01 of a portion.
const n = (v, fallback = null) => v == null || v === "" ? fallback : Number.isFinite(Number(v)) ? Number(v) : fallback;
const text = v => v == null ? "" : String(v).trim();

// ---- One food diary -----------------------------------------------------------
// The coach inbox and the cookbook log into the app's own diary (food_logs),
// so a meal shows up in the app and counts once. Eaten food has no status, like
// every meal logged in the app; a planned ("planned") or cancelled one stays out
// of the app's totals. The meal, salt, grams, brand and barcode live in the
// note, as the app keeps them.
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
  if (["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "snack_late"].includes(value)) return value;
  const hit = DIARY_MEALS.find(([re]) => re.test(value));
  if (!hit) return null;
  if (hit[1]) return hit[1];
  const hour = Number(String(time || "").match(/^(\d{1,2}):/)?.[1]);
  return Number.isFinite(hour) && hour < 12 ? "snack_am" : "snack_pm";
}
function noteOf(row) { try { const note = JSON.parse(row?.note || "{}"); return note && typeof note === "object" && !Array.isArray(note) ? note : { text: String(row.note) }; } catch { return row?.note ? { text: String(row.note) } : {}; } }
// When a meal is logged for another day than today, it gets its slot's usual time.
export const MEAL_DEFAULT_TIMES = { breakfast: "07:00", snack_am: "10:00", lunch: "12:00", snack_pm: "16:00", dinner: "19:00", snack_late: "21:00" };
// time: "HH:MM" the app logged the meal at, kept when the entry waited for
// signal and is sent later; otherwise now for today, the meal's usual time before.
export function mealConsumedAt(date, mealType, time) {
  const t = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || "")) ? time : null;
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return date + "T" + t + ":00";
  return date === localToday() ? null : date + "T" + (MEAL_DEFAULT_TIMES[mealType] || "12:00") + ":00";
}
function consumedAt(date, time) {
  const t = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (t) return date + "T" + t[1].padStart(2, "0") + ":" + t[2] + ":00";
  return date === localToday() ? new Date().toISOString() : date + "T12:00:00";
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
async function diaryRow(db, id) {
  const key = n(id); if (!key) throw new Error("Missing food log id");
  const row = await db.prepare("SELECT * FROM food_logs WHERE user_id = ? AND id=?").bind(db.userId, key).first();
  if (!row) throw new Error("Food log entry not found");
  return row;
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


