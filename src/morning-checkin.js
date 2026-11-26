// The morning check-in on Today: how the athlete feels, one tap (svěží,
// normál, unavený). Sensors miss sore legs or a bad week at work.
// The answer NEVER changes the readiness (Petr 2026-10-14; redesign QA-2 and
// T-HAB-1, 2026-11-16): "tired" is one advice signal of the day
// (morning-advice.js adviceSignals) and the coach's fact of the day
// (coach-assistant.js today.feeling). Only Sick from the Journal acts on the
// readiness (readinessCheckin below).
import { L } from "./lang.js";

// "sick" is only still accepted from builds before the redesign (their old
// card had a fourth answer, removed 2026-11-25 so every place asks the same
// three); it is stored but never read (feelingOf). Drop it with the
// redesign's MIN_APP_API raise.
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
// a tired body, so it must not lower the readiness) and comes back with the
// redesign as advice only (feelingOf).
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

// R5 (Petr 2026-11-26): after Nemoc ticked in the Journal (the day after the
// last tick still counts as sick, readinessCheckin), as many easy days as sick
// days, at least 2 and at most 7. { day, of } for today, or null.
export async function journalSickReturn(db, date) {
  if (!db || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const shift = n => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  let rows = [];
  try { rows = (await db.prepare("SELECT date,answer FROM journal_entries WHERE user_id=? AND item_key='sick' AND date>=? AND date<?").bind(db.userId, shift(-21), date).all()).results || []; }
  catch (error) { if (/no such table/i.test(String(error?.message || error))) return null; throw error; }
  const sick = new Set(rows.filter(r => Number(r.answer) === 1).map(r => r.date));
  for (let back = 2; back <= 8; back++) {
    const last = shift(-back);
    if (!sick.has(last)) continue;
    if ([...Array(back - 1)].some((_, i) => sick.has(shift(-1 - i)))) return null;
    let count = 0;
    while (sick.has(shift(-back - count))) count++;
    const of = Math.min(7, Math.max(2, count)), day = back - 1;
    return day <= of ? { day, of } : null;
  }
  return null;
}

// null clears the day's answer.
export async function saveCheckin(db, date, feeling) {
  if (feeling != null && !FEELINGS.includes(feeling)) throw new Error(L("Neznámá odpověď.", "Unknown answer."));
  await ensure(db);
  if (feeling == null) await db.prepare("DELETE FROM morning_checkins WHERE user_id=? AND date=?").bind(db.userId, date).run();
  else await db.prepare("INSERT INTO morning_checkins(user_id,date,feeling) VALUES(?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET feeling=excluded.feeling,updated_at=CURRENT_TIMESTAMP").bind(db.userId, date, feeling).run();
  return feeling;
}

// The day's stored answer for the advice and the coach, or null. A missing
// table is no answer (one read, no table created on a read).
export async function feelingOf(db, date) {
  if (!db || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  try {
    const row = await db.prepare("SELECT feeling FROM morning_checkins WHERE user_id=? AND date=?").bind(db.userId, date).first();
    return ["fresh", "normal", "tired"].includes(row?.feeling) ? row.feeling : null;
  } catch (error) { if (/no such table/i.test(String(error?.message || error))) return null; throw error; }
}
