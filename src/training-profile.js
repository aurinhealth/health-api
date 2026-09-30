// The athlete's own FTP, zone model and heart-rate settings (per user).
import { sanitizeTrainingProfile } from "./training-zones.js";

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS training_profile (user_id INTEGER PRIMARY KEY, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
export async function getTrainingProfile(db) {
  await ensure(db);
  const row = await db.prepare("SELECT profile_json FROM training_profile WHERE user_id=?").bind(db.userId).first();
  try { return row ? JSON.parse(row.profile_json) : {}; } catch { return {}; }
}
export async function saveTrainingProfile(db, input) {
  const profile = sanitizeTrainingProfile(input);
  await ensure(db);
  await db.prepare("INSERT INTO training_profile(user_id,profile_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, JSON.stringify(profile)).run();
  return profile;
}
