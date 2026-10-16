// The morning readiness, locked for the rest of the day (readiness.js
// readinessLockOf / withLock): one row per user and day with the day's
// signals and its night, written the first time the day has a readiness with
// its night (Today, Health or the morning push). dashboardProfile hands the
// last days' locks to every readiness as profile.readinessLocks.
import { readinessFor, readinessLockOf } from "./readiness.js";

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS readiness_locks (user_id INTEGER NOT NULL, date TEXT NOT NULL, lock_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, date))").run();
}

// { date: { row, night } } for the days from `from` on.
export async function readinessLocks(db, from) {
  await ensure(db);
  const rows = (await db.prepare("SELECT date, lock_json FROM readiness_locks WHERE user_id=? AND date>=?").bind(db.userId, from).all()).results || [];
  const out = {};
  for (const r of rows) { try { out[r.date] = JSON.parse(r.lock_json); } catch { /* a broken row locks nothing */ } }
  return out;
}

// Locks `date` (today) once: the readiness Today shows from these inputs.
// Nothing happens while the night is missing or when the day is locked already.
// A lock whose night went on after it (the rest of a night synced at a
// wake-up) is replaced once by the readiness of the whole night.
export async function lockReadiness(db, { date, health = {}, fitness = {}, sleep = {}, profile = null }) {
  const old = profile?.readinessLocks?.[date] || null;
  const readiness = readinessFor({ date, google: health?.wellness || [], intervals: fitness?.wellness || [], sessions: Array.isArray(sleep?.sessions) ? sleep.sessions : [], profile });
  if (old && readiness.night === old.night) return false;
  const lock = readinessLockOf(readiness, date);
  if (!lock) return false;
  await ensure(db);
  await db.prepare(old ? "INSERT OR REPLACE INTO readiness_locks(user_id,date,lock_json) VALUES(?,?,?)" : "INSERT OR IGNORE INTO readiness_locks(user_id,date,lock_json) VALUES(?,?,?)").bind(db.userId, date, JSON.stringify(lock)).run();
  return true;
}
