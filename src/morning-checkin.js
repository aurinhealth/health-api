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
