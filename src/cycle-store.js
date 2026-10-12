// Cycle tracking's stored data (cycle-model.js computes from it):
// - cycle_settings: one JSON row per user (normalizeCycleSettings);
// - cycle_days: one row per day with what was logged in the app (flow,
//   symptoms, the pill, a "not yet" answer, "keep my plan") and what Apple
//   Health had (apple_flow, apple_ovulation). The app's own flow wins over
//   Apple Health's; Apple Health's fills the days the athlete did not log.
import { normalizeCycleSettings, normalizeCycleDay, SYMPTOMS } from "./cycle-model.js";
import { L } from "./lang.js";

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS cycle_settings (user_id INTEGER NOT NULL PRIMARY KEY, settings_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS cycle_days (user_id INTEGER NOT NULL, date TEXT NOT NULL, flow INTEGER, symptoms TEXT, pill TEXT, no_period INTEGER NOT NULL DEFAULT 0, ovulation_test INTEGER NOT NULL DEFAULT 0, keep_plan INTEGER NOT NULL DEFAULT 0, apple_flow INTEGER, apple_ovulation INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, date))").run();
}

export async function getCycleSettings(db) {
  await ensure(db);
  const row = await db.prepare("SELECT settings_json FROM cycle_settings WHERE user_id=?").bind(db.userId).first();
  let raw = null;
  try { raw = JSON.parse(row?.settings_json || "null"); } catch { raw = null; }
  return normalizeCycleSettings(raw);
}

// Merges `changes` into the saved settings.
export async function saveCycleSettings(db, changes) {
  const next = normalizeCycleSettings({ ...(await getCycleSettings(db)), ...(changes && typeof changes === "object" ? changes : {}) });
  await db.prepare("INSERT INTO cycle_settings(user_id,settings_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, JSON.stringify(next)).run();
  return next;
}

const dayOf = r => normalizeCycleDay({
  date: r.date,
  flow: r.flow != null ? r.flow : r.apple_flow,
  symptoms: (() => { try { return JSON.parse(r.symptoms || "[]"); } catch { return []; } })(),
  pill: r.pill,
  noPeriod: !!r.no_period,
  ovulationTest: !!(r.ovulation_test || r.apple_ovulation),
});

// The logged days from `from` to `to` (both included), oldest first, each with
// keepPlan (the athlete undid the coach's easier session that day).
export async function listCycleDays(db, from, to) {
  await ensure(db);
  const rows = (await db.prepare("SELECT * FROM cycle_days WHERE user_id=? AND date>=? AND date<=? ORDER BY date").bind(db.userId, from, to).all()).results || [];
  return rows.map(r => ({ ...dayOf(r), keepPlan: !!r.keep_plan }));
}

// Saves what the athlete logged on a day; fields left out stay as they were.
// flow 0 means no bleeding logged by hand (Apple Health's then counts again
// only when it was never set: null clears it).
export async function saveCycleDay(db, body) {
  const date = body && body.date;
  if (!isDate(date)) throw new Error(L("Chybí den.", "The day is missing."));
  await ensure(db);
  const old = await db.prepare("SELECT * FROM cycle_days WHERE user_id=? AND date=?").bind(db.userId, date).first() || {};
  const has = k => Object.hasOwn(body, k);
  const flow = has("flow") ? (body.flow == null ? null : Math.max(0, Math.min(3, Math.round(Number(body.flow)) || 0))) : (old.flow ?? null);
  const symptoms = has("symptoms") ? JSON.stringify((Array.isArray(body.symptoms) ? body.symptoms : []).filter(s => SYMPTOMS.includes(s))) : (old.symptoms ?? null);
  const pill = has("pill") ? (body.pill === true ? "taken" : /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.pill || "")) ? body.pill : null) : (old.pill ?? null);
  const noPeriod = has("noPeriod") ? (body.noPeriod ? 1 : 0) : (old.no_period || 0);
  const ovulation = has("ovulationTest") ? (body.ovulationTest ? 1 : 0) : (old.ovulation_test || 0);
  const keepPlan = has("keepPlan") ? (body.keepPlan ? 1 : 0) : (old.keep_plan || 0);
  await db.prepare("INSERT INTO cycle_days(user_id,date,flow,symptoms,pill,no_period,ovulation_test,keep_plan,apple_flow,apple_ovulation) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET flow=excluded.flow,symptoms=excluded.symptoms,pill=excluded.pill,no_period=excluded.no_period,ovulation_test=excluded.ovulation_test,keep_plan=excluded.keep_plan,updated_at=CURRENT_TIMESTAMP")
    .bind(db.userId, date, flow, symptoms, pill, noPeriod, ovulation, keepPlan, old.apple_flow ?? null, old.apple_ovulation || 0).run();
  const row = await db.prepare("SELECT * FROM cycle_days WHERE user_id=? AND date=?").bind(db.userId, date).first();
  return { ...dayOf(row), keepPlan: !!row.keep_plan };
}

// Apple Health's menstrual flow and ovulation tests for the days it sent
// (at most 400): only the apple_* columns change, what was logged in the app
// stays.
export async function importAppleCycle(db, days) {
  await ensure(db);
  const list = (Array.isArray(days) ? days : []).filter(d => d && isDate(d.date)).slice(0, 400);
  for (const d of list) {
    const flow = d.flow == null ? null : Math.max(0, Math.min(3, Math.round(Number(d.flow)) || 0));
    await db.prepare("INSERT INTO cycle_days(user_id,date,apple_flow,apple_ovulation) VALUES(?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET apple_flow=excluded.apple_flow,apple_ovulation=excluded.apple_ovulation,updated_at=CURRENT_TIMESTAMP")
      .bind(db.userId, d.date, flow, d.ovulationTest ? 1 : 0).run();
  }
  return list.length;
}

// What the readiness and Today need: the settings and the last 200 days, or
// null when the cycle is off.
export async function cycleInputs(db, date) {
  const settings = await getCycleSettings(db);
  if (!settings.enabled) return null;
  return { settings, days: await listCycleDays(db, shift(date, -200), shift(date, 60)) };
}
