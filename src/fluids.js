// Fluid intake: drinks logged per day and a daily target worked out from body
// weight and the day's training. The target is a guide, not a prescription.
import { L } from './lang.js';
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { localDateTime } from "./user-time.js";

const KINDS = ["water", "coffee", "tea", "juice", "milk", "sport", "soda", "beer", "wine", "other"];

// How much of a drink counts towards hydration, against water (the Beverage
// Hydration Index, Maughan 2016: milk and oral-rehydration drinks keep more
// water in the body, coffee and tea about as much as water). Coffee is counted
// at 0.9 to stay on the safe side; beer at half; wine and spirits not at all.
export const HYDRATION_FACTORS = { water: 1, tea: 1, coffee: 0.9, juice: 1, milk: 1.1, sport: 1.1, soda: 0.9, beer: 0.5, wine: 0, other: 1, food: 1 };
export const hydrationMl = (ml, kind) => Math.round((Number(ml) || 0) * (HYDRATION_FACTORS[kind] ?? 1));
const round100 = ml => Math.round(ml / 100) * 100;

// Drinks per day: 30 ml per kg of body weight (food covers the rest of the
// water need), or 2.0 l for men and 1.6 l for women without a weight (the
// drinking share of the EFSA adequate intake); never under 1.5 l. Training
// adds 0.5 l per hour, a walk 0.25 l per hour. Capped at 6 l.
export function hydrationTarget({ weightKg = null, sex = "", trainingHours = 0, walkHours = 0 } = {}) {
  const w = Number(weightKg);
  const base = Math.max(1500, w >= 30 && w <= 300 ? w * 30 : sex === "female" ? 1600 : 2000);
  const exercise = Math.max(0, Number(trainingHours) || 0) * 500 + Math.max(0, Number(walkHours) || 0) * 250;
  return {
    ml: Math.min(6000, round100(base + exercise)),
    baseMl: round100(base), exerciseMl: round100(exercise),
    weightKg: w >= 30 && w <= 300 ? w : null,
    trainingHours: Math.round((Number(trainingHours) || 0) * 10) / 10, walkHours: Math.round((Number(walkHours) || 0) * 10) / 10
  };
}

async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS fluid_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    consumed_at TEXT NOT NULL,
    ml INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'water',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_fluid_log_user_date ON fluid_log(user_id, date)").run();
}

// A refused value (400); any other failure is the server's (500), so the app
// keeps a drink that waits for signal and sends it again.
export class FluidInputError extends Error {}
const invalid = message => new FluidInputError(message);

export async function addFluid(db, { date, ml, kind = "water", at = null }) {
  const amount = Math.round(Number(ml));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw invalid(L("Neplatné datum.", "Invalid date."));
  if (!(amount >= 10 && amount <= 3000)) throw invalid(L("Zadej množství 10–3000 ml.", "Enter an amount of 10–3,000 ml."));
  await ensure(db);
  const consumedAt = at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(at)) ? String(at).slice(0, 16) : `${date}T12:00`;
  const r = await db.prepare("INSERT INTO fluid_log(user_id,date,consumed_at,ml,kind) VALUES(?,?,?,?,?)")
    .bind(db.userId, date, consumedAt, amount, KINDS.includes(kind) ? kind : "other").run();
  return { id: r.meta?.last_row_id ?? null, date, consumedAt, ml: amount, kind: KINDS.includes(kind) ? kind : "other" };
}

// A drink changed afterwards: another amount, kind or time.
export async function updateFluid(db, { id, ml, kind, at }) {
  await ensure(db);
  const row = await db.prepare("SELECT id,date,consumed_at,ml,kind FROM fluid_log WHERE user_id=? AND id=?").bind(db.userId, Number(id)).first();
  if (!row) throw invalid(L("Pití nenalezeno.", "Drink not found."));
  const amount = ml == null ? Number(row.ml) : Math.round(Number(ml));
  if (!(amount >= 10 && amount <= 3000)) throw invalid(L("Zadej množství 10–3000 ml.", "Enter an amount of 10–3,000 ml."));
  const type = kind == null ? row.kind : KINDS.includes(kind) ? kind : "other";
  const consumedAt = at && /^\d{2}:\d{2}$/.test(String(at)) ? `${row.date}T${at}` : row.consumed_at;
  await db.prepare("UPDATE fluid_log SET ml=?,kind=?,consumed_at=? WHERE user_id=? AND id=?").bind(amount, type, consumedAt, db.userId, Number(id)).run();
  return { id: Number(id), date: row.date, consumedAt, ml: amount, kind: type };
}

export async function deleteFluid(db, id) {
  await ensure(db);
  await db.prepare("DELETE FROM fluid_log WHERE user_id=? AND id=?").bind(db.userId, Number(id)).run();
}

export async function listFluids(db, date) {
  await ensure(db);
  const rows = (await db.prepare("SELECT id,date,consumed_at,ml,kind FROM fluid_log WHERE user_id=? AND date=? ORDER BY consumed_at,id").bind(db.userId, date).all()).results || [];
  return rows.map(r => ({ id: r.id, date: r.date, consumedAt: r.consumed_at, ml: Number(r.ml), kind: r.kind }));
}

// Drinks logged in the food diary count too: an entry measured in ml, or the
// ml ingredients of a composed meal. Alcohol is not counted as fluid.
const ALCOHOL = /(pivo|piva|beer|ležák|lezak|radler|víno|vína|vino|wine|prosecco|šampaň|sekt|vodka|rum\b|whisk|slivovic|gin\b|likér|liker|panák|alkohol)/i;
export function drinkFromFoodEntry(row) {
  let note = {};
  try { note = typeof row.note === "string" ? JSON.parse(row.note || "{}") : row.note || {}; } catch { note = {}; }
  const name = String(row.recipe_title || "Nápoj");
  const parts = note.unit === "ml" ? [{ name, ml: Number(note.amount) }]
    : (Array.isArray(note.ingredients) ? note.ingredients : []).filter(i => i?.unit === "ml").map(i => ({ name: String(i.name || name), ml: Number(i.amount) }));
  const valid = parts.filter(p => p.ml > 0 && p.ml <= 5000);
  if (!valid.length) return null;
  const counted = valid.filter(p => !ALCOHOL.test(p.name)).reduce((s, p) => s + p.ml, 0);
  return { id: "food:" + row.id, foodId: row.id, consumedAt: String(row.consumed_at || "").slice(0, 16), ml: Math.round(counted), name, kind: "food", alcohol: counted === 0, totalMl: Math.round(valid.reduce((s, p) => s + p.ml, 0)) };
}

export async function foodDrinks(db, userId, date) {
  const rows = (await db.prepare("SELECT id,consumed_at,recipe_title,note FROM food_logs WHERE user_id=? AND consumed_date=? AND (status IS NULL OR status='eaten') ORDER BY consumed_at").bind(userId, date).all().catch(() => ({ results: [] }))).results || [];
  return rows.map(drinkFromFoodEntry).filter(Boolean);
}

// Training and walking hours of a day: done sessions, or the planned ones when
// more is planned than done yet.
export async function dayActivityHours(db, userId, date) {
  const next = new Date(Date.parse(date + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  const prev = new Date(Date.parse(date + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  const rows = (await db.prepare(`SELECT data_type,start_time,end_time,payload_json FROM health_datapoints
    WHERE user_id=? AND data_type IN ('activity','exercise','planned-workout') AND start_time>=? AND start_time<?
      AND (record_role IS NULL OR record_role!='duplicate')`).bind(userId, prev, next + "T23:59").all().catch(() => ({ results: [] }))).results || [];
  const done = dedupeActivities(rows.filter(r => r.data_type !== "planned-workout").map(activityFromRow)).filter(a => a.date === date);
  const hours = list => list.reduce((s, a) => s + (Number(a.minutes) || 0), 0) / 60;
  let planned = 0;
  for (const r of rows.filter(r => r.data_type === "planned-workout")) {
    if (localDateTime(r.start_time).slice(0, 10) !== date) continue;
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch { p = {}; }
    const seconds = Number(p.moving_time ?? p.duration ?? p.duration_seconds ?? p.elapsed_time);
    if (seconds > 0 && seconds <= 8 * 3600 && !/nutrition/i.test(String(p.name || p.type || ""))) planned += seconds / 3600;
  }
  return { trainingHours: Math.max(hours(done.filter(a => a.kind !== "walk")), planned), walkHours: hours(done.filter(a => a.kind === "walk")) };
}
