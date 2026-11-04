import { normalizeBarcode } from "./food-sources.js";
import { localToday } from "./user-time.js";

// null and "" are missing values, not 0: "servings": null used to log
// 0.01 of a portion.
const n = (v, fallback = null) => v == null || v === "" ? fallback : Number.isFinite(Number(v)) ? Number(v) : fallback;
const text = v => v == null ? "" : String(v).trim();

// ---- One food diary -----------------------------------------------------------
// The coach inbox logs into the app's own diary (food_logs),
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

function normalizeStatus(status) { const s=text(status).toLowerCase(); return ["planned","eaten","cancelled"].includes(s) ? s : "eaten"; }
export async function logFood(db, input = {}) {
  await ensureFoodLogTable(db);
  const date=text(input.date) || localToday(), servings=Math.max(0.01,n(input.servings,1)), status=normalizeStatus(input.status);
  if (input.calories == null && input.protein_g == null && input.carbs_g == null && input.fat_g == null) throw new Error("No nutrition values were supplied");
  const calories=n(input.calories), protein=n(input.protein_g), carbs=n(input.carbs_g), fat=n(input.fat_g);
  const each = (v, scale = servings) => v == null ? null : v * scale;
  const meal = diaryMealType(input.meal_type || input.mealType, input.meal_time || input.mealTime);
  const note = compactNote({ mealType: meal, salt_g: each(n(input.salt_g, null)), amount_g: n(input.amount_g ?? input.grams, null), brand: text(input.brand) || null, barcode: normalizeBarcode(input.barcode) || null, text: text(input.note) || null });
  const result=await db.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,cookbook_page,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(db.userId,
    date,consumedAt(date,input.meal_time||input.mealTime),null,text(input.name)||"Jídlo",servings,
    each(calories)??0,each(protein)??0,each(carbs)??0,each(fat)??0,each(n(input.fiber_g,null))??0,
    text(input.source)||"manual",note,status==="eaten"?null:status
  ).run();
  const nutrition={calories:each(calories),protein_g:each(protein),carbs_g:each(carbs),fat_g:each(fat),fiber_g:each(n(input.fiber_g,null)),salt_g:each(n(input.salt_g,null))};
  return {status:"ok",id:result.meta?.last_row_id ?? null,date,entryStatus:status,servings,nutrition};
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


