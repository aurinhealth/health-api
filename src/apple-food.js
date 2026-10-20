// Food and drinks other apps (Yazio, MyFitnessPal, Lifesum…) logged in Apple
// Health. The iPhone app reads them (not what Aurin wrote there itself) and
// sends every one in a window of days; they go into the same diary as food
// logged in Aurin (food_logs, source 'apple-health') and the drinks into
// fluid_log, so totals, meals and Pití count them. They are the other app's:
// they are not edited here, and they are never sent on to Apple Health or
// Google Health again (food-google-sync.js, AppleHealthExport.swift). Deleting
// one removes it from Aurin only: Aurin cannot delete another app's data in
// Apple Health, so it remembers the id and skips it in later syncs.
import { ensureFoodLogTable } from "./food-log.js";
import { ensure as ensureFluidLog } from "./fluids.js";

export const FOOD_SOURCE = "apple-health";
// Food and drinks other apps logged in Google Health come the same way (google-food.js).
export const GOOGLE_FOOD_SOURCE = "google-health";
export const OTHER_APP_SOURCES = [FOOD_SOURCE, GOOGLE_FOOD_SOURCE];
const MAX_ITEMS = 2000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (v, lo, hi) => { const n = Number(v); return v !== null && v !== "" && v !== undefined && Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const round = (v, d = 1) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
const cleanId = v => { const s = String(v ?? "").trim(); return s && s.length <= 120 && /^[A-Za-z0-9:._+-]+$/.test(s) ? s : null; };
const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const minutesOf = at => { const m = /T(\d{2}):(\d{2})/.exec(String(at)); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };

async function ensureHidden(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS apple_food_hidden (user_id INTEGER NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, kind, external_id))").run();
}

// Deletes an imported meal ("meal", a food_logs row) or drink ("drink", a
// fluid_log row) from Aurin and keeps it out of later syncs.
export async function hideAppleFood(db, userId, kind, rowId) {
  const meal = kind === "meal";
  const row = await db.prepare(meal
    ? "SELECT id, json_extract(note,'$.external_id') AS ext FROM food_logs WHERE user_id=? AND id=? AND source IN (?,?)"
    : "SELECT id, external_id AS ext FROM fluid_log WHERE user_id=? AND id=? AND source IN (?,?)").bind(userId, Number(rowId), ...OTHER_APP_SOURCES).first();
  if (!row) return false;
  await ensureHidden(db);
  const statements = [db.prepare(`DELETE FROM ${meal ? "food_logs" : "fluid_log"} WHERE user_id=? AND id=?`).bind(userId, row.id)];
  if (row.ext) statements.unshift(db.prepare("INSERT OR IGNORE INTO apple_food_hidden (user_id, kind, external_id) VALUES (?,?,?)").bind(userId, kind, String(row.ext)));
  await db.batch(statements);
  return true;
}

// A meal name some apps use for the whole meal ("Breakfast", "Oběd").
const MEAL_NAMES = [["breakfast", /^(breakfast|snídaně|snidane|frühstück)$/i], ["lunch", /^(lunch|oběd|obed|mittagessen)$/i],
  ["dinner", /^(dinner|supper|večeře|vecere|abendessen)$/i], ["snack", /^(snack|snacks|svačina|svacina|zwischenmahlzeit)$/i]];
// Google Health's meal types (google-food.js).
const GOOGLE_MEALS = { BREAKFAST: "breakfast", LUNCH: "lunch", DINNER: "dinner", SNACK: "snack" };
export function mealTypeOfName(name) {
  for (const [type, re] of MEAL_NAMES) if (re.test(String(name || "").trim())) return type;
  return null;
}

// One food from the app: { id, date, time, name, app, kcal, protein, carbs, fat, fiber, sugar, salt }.
export function appleFood(r) {
  const id = cleanId(r?.id), date = DAY.test(String(r?.date || "")) ? r.date : null;
  const kcal = num(r?.kcal, 0, 10000);
  if (!id || !date || kcal == null) return null;
  const app = text(r.app, 60) || "Apple Health";
  const name = text(r.name, 120) || app;
  const time = CLOCK.test(String(r.time || "")) ? r.time : null;
  const note = { external_id: id, app, sugar_g: round(num(r.sugar, 0, 1000)), salt_g: round(num(r.salt, 0, 200), 2) };
  const meal = mealTypeOfName(r.name) || GOOGLE_MEALS[r.mealType] || null;
  if (meal) note.mealType = meal;
  return {
    id, date, consumed_at: date + "T" + (time || "12:00") + ":00", name,
    kcal: round(kcal, 0), protein_g: round(num(r.protein, 0, 1000)) ?? 0, carbs_g: round(num(r.carbs, 0, 2000)) ?? 0,
    fat_g: round(num(r.fat, 0, 1000)) ?? 0, fiber_g: round(num(r.fiber, 0, 500)) ?? 0,
    note: JSON.stringify(Object.fromEntries(Object.entries(note).filter(([, v]) => v != null)))
  };
}

// One drink: { id, date, time, ml, app }. Water only: other apps write
// coffee or juice as water too, and Aurin cannot tell them apart.
export function appleDrink(r) {
  const id = cleanId(r?.id), date = DAY.test(String(r?.date || "")) ? r.date : null;
  const ml = num(r?.ml, 10, 3000);
  if (!id || !date || ml == null) return null;
  const time = CLOCK.test(String(r.time || "")) ? r.time : "12:00";
  return { id, date, consumed_at: date + "T" + time, ml: Math.round(ml), app: text(r.app, 60) || "Apple Health" };
}

// POST body part: { food: { from, to, meals: [...], drinks: [...] } }. The
// window says the app sent everything from those days: what it did not send
// was deleted in the other app and goes here too.
export async function saveAppleFood(db, userId, input = {}, { source = FOOD_SOURCE } = {}) {
  const from = DAY.test(String(input?.from || "")) ? input.from : null, to = DAY.test(String(input?.to || "")) ? input.to : null;
  if (!from || !to || to < from) return { saved: 0, removed: 0 };
  const inWindow = item => item && item.date >= from && item.date <= to;
  // A list left out was not read (that kind is switched off): keep what is here.
  // HealthKit answers a read the user denied (or Health still restoring) with
  // nothing, not an error, so an empty Apple list says nothing was read either.
  const read = list => Array.isArray(list) && (list.length > 0 || source !== FOOD_SOURCE);
  const readMeals = read(input.meals), readDrinks = read(input.drinks);
  const mealsIn = (readMeals ? input.meals : []).slice(0, MAX_ITEMS).map(appleFood).filter(inWindow);
  const drinksIn = (readDrinks ? input.drinks : []).slice(0, MAX_ITEMS).map(appleDrink).filter(inWindow);
  await ensureFoodLogTable(db);
  await ensureFluidLog(db);
  await ensureHidden(db);
  const hidden = new Set(((await db.prepare("SELECT kind || ':' || external_id AS k FROM apple_food_hidden WHERE user_id=?").bind(userId).all()).results || []).map(r => r.k));
  const shown = kind => item => !hidden.has(kind + ":" + item.id);
  // An app that writes to both Apple Health and Google Health would count
  // twice: an item the other source already brought (the same day, name and
  // energy, or the same amount of water, within half an hour) is left out.
  const other = OTHER_APP_SOURCES.find(s => s !== source);
  const [otherMeals, otherDrinks] = await Promise.all([
    db.prepare("SELECT consumed_at AS at, recipe_title AS name, kcal FROM food_logs WHERE user_id=? AND source=? AND consumed_date>=? AND consumed_date<=?").bind(userId, other, from, to).all(),
    db.prepare("SELECT consumed_at AS at, ml FROM fluid_log WHERE user_id=? AND source=? AND date>=? AND date<=?").bind(userId, other, from, to).all()
  ]).then(r => r.map(x => x.results || []));
  const near = (a, b) => String(a).slice(0, 10) === String(b).slice(0, 10) && Math.abs(minutesOf(a) - minutesOf(b)) <= 30;
  const sameName = (a, b) => text(a, 120).toLowerCase() === text(b, 120).toLowerCase();
  const fresh = (list, same) => item => !list.some(o => near(o.at, item.consumed_at) && same(o, item));
  const meals = mealsIn.filter(shown("meal")).filter(fresh(otherMeals, (o, m) => sameName(o.name, m.name) && Math.abs(Number(o.kcal) - m.kcal) <= 2));
  const drinks = drinksIn.filter(shown("drink")).filter(fresh(otherDrinks, (o, d) => Math.abs(Number(o.ml) - d.ml) <= 5));

  const statements = [];
  const known = new Map(((await db.prepare(`SELECT id, json_extract(note,'$.external_id') AS ext FROM food_logs
    WHERE user_id=? AND source=? AND consumed_date>=? AND consumed_date<=?`).bind(userId, source, from, to).all()).results || []).map(r => [r.ext, r.id]));
  for (const m of meals) {
    const id = known.get(m.id);
    known.delete(m.id);
    statements.push(id
      ? db.prepare(`UPDATE food_logs SET consumed_date=?1,consumed_at=?2,recipe_title=?3,kcal=?4,protein_g=?5,carbs_g=?6,fat_g=?7,fiber_g=?8,note=?9 WHERE user_id=?10 AND id=?11
          AND (consumed_date IS NOT ?1 OR consumed_at IS NOT ?2 OR recipe_title IS NOT ?3 OR kcal IS NOT ?4 OR protein_g IS NOT ?5 OR carbs_g IS NOT ?6 OR fat_g IS NOT ?7 OR fiber_g IS NOT ?8 OR note IS NOT ?9)`)
        .bind(m.date, m.consumed_at, m.name, m.kcal, m.protein_g, m.carbs_g, m.fat_g, m.fiber_g, m.note, userId, id)
      : db.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,fiber_g,source,note) VALUES (?,?,?,?,1,?,?,?,?,?,?,?)")
        .bind(userId, m.date, m.consumed_at, m.name, m.kcal, m.protein_g, m.carbs_g, m.fat_g, m.fiber_g, source, m.note));
  }
  const removedMeals = readMeals ? [...known.values()] : [];
  if (removedMeals.length) statements.push(db.prepare("DELETE FROM food_logs WHERE user_id=? AND source=? AND id IN (SELECT value FROM json_each(?))").bind(userId, source, JSON.stringify(removedMeals)));

  const knownDrinks = new Map(((await db.prepare("SELECT id, external_id FROM fluid_log WHERE user_id=? AND source=? AND date>=? AND date<=?")
    .bind(userId, source, from, to).all()).results || []).map(r => [r.external_id, r.id]));
  for (const d of drinks) {
    const id = knownDrinks.get(d.id);
    knownDrinks.delete(d.id);
    statements.push(id
      ? db.prepare("UPDATE fluid_log SET date=?1,consumed_at=?2,ml=?3,app=?4 WHERE user_id=?5 AND id=?6 AND (date IS NOT ?1 OR consumed_at IS NOT ?2 OR ml IS NOT ?3 OR app IS NOT ?4)")
        .bind(d.date, d.consumed_at, d.ml, d.app, userId, id)
      : db.prepare("INSERT INTO fluid_log(user_id,date,consumed_at,ml,kind,source,external_id,app) VALUES(?,?,?,?,'water',?,?,?)")
        .bind(userId, d.date, d.consumed_at, d.ml, source, d.id, d.app));
  }
  const removedDrinks = readDrinks ? [...knownDrinks.values()] : [];
  if (removedDrinks.length) statements.push(db.prepare("DELETE FROM fluid_log WHERE user_id=? AND source=? AND id IN (SELECT value FROM json_each(?))").bind(userId, source, JSON.stringify(removedDrinks)));

  // Rows really written: an update that changes nothing counts none.
  let changed = 0;
  for (let i = 0; i < statements.length; i += 50) {
    for (const result of await db.batch(statements.slice(i, i + 50)) || []) changed += Number(result?.meta?.changes || 0);
  }
  return { saved: meals.length + drinks.length, removed: removedMeals.length + removedDrinks.length, changed };
}
