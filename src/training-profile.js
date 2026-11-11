// The athlete's own FTP, zone model and heart-rate settings (per user).
import { sanitizeTrainingProfile } from "./training-zones.js";
import { L } from "./lang.js";

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS training_profile (user_id INTEGER PRIMARY KEY, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
export async function getTrainingProfile(db) {
  await ensure(db);
  const row = await db.prepare("SELECT profile_json FROM training_profile WHERE user_id=?").bind(db.userId).first();
  try { return row ? JSON.parse(row.profile_json) : {}; } catch { return {}; }
}

// When and how each threshold was set (profile.set: {ftp: {on: "2026-11-06",
// by: "manual" | test id}}). An unchanged value keeps its date; `keys` (the
// values a test just confirmed) get today and `by` even when equal.
const THRESHOLDS = ["ftp", "lthr", "maxHr", "runThresholdPace", "runLthr", "swimCss"];
export async function saveTrainingProfile(db, input, { today = new Date().toISOString().slice(0, 10), by = "manual", keys = [] } = {}) {
  const profile = sanitizeTrainingProfile(input);
  const before = await getTrainingProfile(db);
  const set = {};
  for (const key of THRESHOLDS) {
    if (profile[key] == null) continue;
    set[key] = keys.includes(key) ? { on: today, by } : profile[key] === before[key] && before.set?.[key] ? before.set[key] : { on: today, by: "manual" };
  }
  if (Object.keys(set).length) profile.set = set;
  await db.prepare("INSERT INTO training_profile(user_id,profile_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, JSON.stringify(profile)).run();
  return profile;
}

// "Test 20 min, před 3 týdny", "Z Intervals.icu", "Odhad podle věku": where
// each threshold on Nastavení → Zóny comes from and how old it is, so an
// estimate never looks like a measured value. `t`: athleteThresholds().
const TESTS = () => ({ "test-ride-ftp20": L("Test 20 min", "20-min test"), "test-ride-lthr30": L("Test 30 min", "30-min test"), "test-run-tt30": L("Test 30 min", "30-min test"), "test-swim-css": L("Test 400 + 200 m", "400 + 200 m test") });
function ago(on, today) {
  const days = Math.round((Date.parse(today) - Date.parse(on)) / 86400000);
  if (!(days >= 0)) return null;
  if (days === 0) return L("dnes", "today");
  if (days < 14) return days === 1 ? L("včera", "yesterday") : L("před " + days + " dny", days + " days ago");
  if (days < 63) return L("před " + Math.floor(days / 7) + " týdny", Math.floor(days / 7) + " weeks ago");
  const months = Math.round(days / 30.44);
  return L("před " + months + " měsíci", months + " months ago");
}
export function thresholdNotes(t = {}, today = new Date().toISOString().slice(0, 10)) {
  const from = () => ({
    "intervals-settings": L("Z Intervals.icu", "From Intervals.icu"),
    "latest-ride": L("Odhad z poslední jízdy", "Estimate from your latest ride"),
    heart: L("Podle maximálního tepu výše", "From your max heart rate above"),
    "activities-6m": L("Nejvyšší tep z tréninků za 6 měsíců", "Highest heart rate in 6 months of workouts"),
    "age-estimate": L("Odhad podle věku", "Estimate from age")
  });
  const notes = {};
  for (const key of THRESHOLDS) {
    if (t[key] == null) continue;
    const source = t.sources?.[key], set = t.profile?.set?.[key];
    if (source === "manual") {
      const when = set?.on ? ago(set.on, today) : null;
      notes[key] = [TESTS()[set?.by] || L("Zadáno ručně", "Set by you"), when].filter(Boolean).join(", ");
    } else if (from()[source]) notes[key] = from()[source];
  }
  return notes;
}
