// The morning check-in on Today: how the athlete feels, one tap (svěží,
// normál, unavený, nemocný). Sensors miss sore legs, a coming cold or a bad
// week at work. The check-in can only lower the readiness the body's signals
// give (recovery-model.js applyCheckin): a "fresh" tap never turns a red
// morning green, "tired" caps it at yellow and "sick" makes it red. Today, the
// ride and run coach and the gym read the same stored answer.
import { L } from "./lang.js";

export const FEELINGS = ["fresh", "normal", "tired", "sick"];

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS morning_checkins (user_id INTEGER NOT NULL, date TEXT NOT NULL, feeling TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, date))").run();
}

export async function getCheckin(db, date) {
  await ensure(db);
  const row = await db.prepare("SELECT feeling FROM morning_checkins WHERE user_id=? AND date=?").bind(db.userId, date).first();
  return FEELINGS.includes(row?.feeling) ? row.feeling : null;
}

// The question left Today on 2026-10-14 (Petr: a sleepy 6 am for work is not
// a tired body, so it must not lower the readiness). Readiness, the coaches
// and the gym no longer read the stored answers; the table and the endpoint
// stay for builds that still ask.
// Nemoc ticked in Deník takes its place (audit wave 2, 9.1): ticked today, or
// yesterday without a ✕ today, the day counts as a sick morning did, so
// Today, the ride and run coach and the gym say rest. One read of at most two
// rows on the journal's key.
export async function readinessCheckin(db, date) {
  if (!db || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const yesterday = new Date(Date.parse(date + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  let rows = [];
  try { rows = (await db.prepare("SELECT date,answer FROM journal_entries WHERE user_id=? AND item_key='sick' AND date IN (?,?)").bind(db.userId, yesterday, date).all()).results || []; }
  catch (error) { if (/no such table/i.test(String(error?.message || error))) return null; throw error; }
  const answer = day => rows.find(r => r.date === day)?.answer;
  const today = answer(date);
  return Number(today) === 1 || (today == null && Number(answer(yesterday)) === 1) ? "sick" : null;
}

// null clears the day's answer.
export async function saveCheckin(db, date, feeling) {
  if (feeling != null && !FEELINGS.includes(feeling)) throw new Error(L("Neznámá odpověď.", "Unknown answer."));
  await ensure(db);
  if (feeling == null) await db.prepare("DELETE FROM morning_checkins WHERE user_id=? AND date=?").bind(db.userId, date).run();
  else await db.prepare("INSERT INTO morning_checkins(user_id,date,feeling) VALUES(?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET feeling=excluded.feeling,updated_at=CURRENT_TIMESTAMP").bind(db.userId, date, feeling).run();
  return feeling;
}

// The coach's 0–100 manual readiness (cycling-coach-v2.js caps the zone below
// 67 at yellow and below 34 at red), so "normal" leaves the body's zone alone.
export function manualReadinessFor(feeling) {
  return { fresh: 85, normal: 70, tired: 50, sick: 15 }[feeling] ?? null;
}
