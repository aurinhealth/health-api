// Fluid intake: drinks logged per day and a daily target worked out from body
// weight and the day's training. The target is a guide, not a prescription.
import { activityFromRow, dedupeActivities, pragueLocal } from "./coach-reflection.js";

const KINDS = ["water", "coffee", "tea", "juice", "milk", "sport", "other"];
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

export async function addFluid(db, { date, ml, kind = "water", at = null }) {
  const amount = Math.round(Number(ml));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Neplatné datum.");
  if (!(amount >= 10 && amount <= 3000)) throw new Error("Zadej množství 10–3000 ml.");
  await ensure(db);
  const consumedAt = at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(at)) ? String(at).slice(0, 16) : `${date}T12:00`;
  const r = await db.prepare("INSERT INTO fluid_log(user_id,date,consumed_at,ml,kind) VALUES(?,?,?,?,?)")
    .bind(db.userId, date, consumedAt, amount, KINDS.includes(kind) ? kind : "other").run();
  return { id: r.meta?.last_row_id ?? null, date, consumedAt, ml: amount, kind: KINDS.includes(kind) ? kind : "other" };
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
    if (pragueLocal(r.start_time).slice(0, 10) !== date) continue;
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch { p = {}; }
    const seconds = Number(p.moving_time ?? p.duration ?? p.duration_seconds ?? p.elapsed_time);
    if (seconds > 0 && seconds <= 8 * 3600 && !/nutrition/i.test(String(p.name || p.type || ""))) planned += seconds / 3600;
  }
  return { trainingHours: Math.max(hours(done.filter(a => a.kind !== "walk")), planned), walkHours: hours(done.filter(a => a.kind === "walk")) };
}
