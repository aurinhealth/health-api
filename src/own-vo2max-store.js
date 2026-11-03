// Aurin's own VO2max, fitness age and composite age (own-vo2max.js), worked
// out once a day by the user job "fitness-estimate" (entrypoint.js) and kept
// as one row per day in fitness_estimates. Nothing shows it yet: screens will
// read the newest row only, never recompute it.
//
// Reads per user and day (D1 rows): the last stored row (1), activity and
// exercise rows of 8 weeks by the (user, source, type, start) index (an
// athlete training daily with a watch: about 130 kept of some 300 scanned), daily resting heart rate of 30 days
// (≤ 60), the newest weight and body fat (≤ 6), sleep of 30 nights (≤ 60) and
// the profile (2); one row written.
import { estimateDay, inputsFromRows, WINDOW_DAYS } from "./own-vo2max.js";
import { loadProfiles } from "./profile-suggestions.js";
import { sleepSessionFromRow, joinSplitNights } from "./sleep-sessions.js";
import { localToday, dayStartUtc } from "./user-time.js";

export const FITNESS_ESTIMATES_TABLE = "CREATE TABLE IF NOT EXISTS fitness_estimates (user_id INTEGER NOT NULL, date TEXT NOT NULL, vo2max REAL NOT NULL, confidence TEXT NOT NULL, fitness_age REAL, composite_age REAL, ride_factor REAL, model INTEGER NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, date))";
// Every source that stores workouts, so the read stays on the index with the source first.
const ACTIVITY_SOURCES = ["intervals", "wahoo", "local", "google-wearables", "apple-health", "whoop", "ultrahuman"];
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const rowsOf = query => query.then(r => r.results || []);

// The newest stored estimate (one row), or null.
export async function latestFitnessEstimate(db, userId) {
  await db.prepare(FITNESS_ESTIMATES_TABLE).run();
  const row = await db.prepare("SELECT date, vo2max, confidence, fitness_age, composite_age, ride_factor, model, details_json FROM fitness_estimates WHERE user_id = ? ORDER BY date DESC LIMIT 1").bind(userId).first();
  if (!row) return null;
  let details = null;
  try { details = JSON.parse(row.details_json); } catch { details = null; }
  return { date: row.date, vo2max: row.vo2max, confidence: row.confidence, fitnessAge: row.fitness_age, compositeAge: row.composite_age, rideFactor: row.ride_factor, model: row.model, details };
}

// The day's estimate, worked out and stored once: { status: "saved" | "done" | "no-data", estimate? }.
export async function updateFitnessEstimate(env, { date = localToday() } = {}) {
  const db = env.DB, user = env.USER_ID;
  await db.prepare(FITNESS_ESTIMATES_TABLE).run();
  const last = await db.prepare("SELECT date, vo2max, ride_factor FROM fitness_estimates WHERE user_id = ? AND date <= ? ORDER BY date DESC LIMIT 1").bind(user, date).first();
  if (last?.date === date) return { status: "done" };
  const start = shift(date, -WINDOW_DAYS), end = shift(date, 1), utcEnd = dayStartUtc(end);
  const places = ACTIVITY_SOURCES.map(() => "?").join(",");
  const [activityRows, restRows, weightRows, fatRows, sleepRows, profiles] = await Promise.all([
    // Intervals.icu keeps local times, the watch UTC: the end is the later of the two (own-fitness.js).
    rowsOf(db.prepare(`SELECT start_time, end_time, source_family, record_role, payload_json FROM health_datapoints WHERE user_id = ? AND source_family IN (${places}) AND data_type IN ('activity','exercise') AND start_time >= ? AND start_time < ? AND (record_role IS NULL OR record_role != 'duplicate')`).bind(user, ...ACTIVITY_SOURCES, start, utcEnd > end ? utcEnd : end).all()),
    rowsOf(db.prepare("SELECT data_type, value_numeric, sample_time FROM health_datapoints WHERE user_id = ? AND data_type = 'daily-resting-heart-rate' AND sample_time >= ? AND sample_time < ? AND value_numeric > 0").bind(user, shift(date, -29), end).all()),
    rowsOf(db.prepare("SELECT data_type, value_numeric, sample_time FROM health_datapoints WHERE user_id = ? AND data_type = 'weight' AND sample_time >= ? AND value_numeric BETWEEN 30 AND 300 ORDER BY sample_time DESC LIMIT 3").bind(user, shift(date, -365)).all()),
    rowsOf(db.prepare("SELECT data_type, value_numeric, sample_time FROM health_datapoints WHERE user_id = ? AND data_type = 'body-fat' AND sample_time >= ? AND value_numeric BETWEEN 3 AND 60 ORDER BY sample_time DESC LIMIT 3").bind(user, shift(date, -180)).all()),
    rowsOf(db.prepare("SELECT external_id, source_family, start_time, end_time, payload_json FROM health_datapoints WHERE user_id = ? AND data_type = 'sleep' AND sample_time >= ? AND sample_time < ?").bind(user, shift(date, -30), end).all()),
    loadProfiles(db, user)
  ]);
  const profile = profileInputs(profiles);
  // The newest weight and body fat by the instant (offsets differ between sources).
  const newest = rows => [...rows].sort((a, b) => (Date.parse(b.sample_time) || 0) - (Date.parse(a.sample_time) || 0)).slice(0, 1);
  const nights = joinSplitNights(sleepRows.map(sleepSessionFromRow));
  const previous = last ? { date: last.date, vo2max: last.vo2max, rideFactor: last.ride_factor } : null;
  const estimate = estimateDay(inputsFromRows({ date, profile, activityRows, dailyRows: [...restRows, ...newest(weightRows), ...newest(fatRows)], nights, previous }));
  if (!estimate) return { status: "no-data" };
  await db.prepare("INSERT INTO fitness_estimates (user_id, date, vo2max, confidence, fitness_age, composite_age, ride_factor, model, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, date) DO NOTHING")
    .bind(user, date, estimate.vo2max, estimate.confidence, estimate.fitnessAge, estimate.compositeAge, estimate.rideFactor, estimate.details.model, JSON.stringify(estimate.details)).run();
  return { status: "saved", estimate };
}

// What the estimate takes from the profile: the user's own values first; a
// maximum heart rate only when the user typed it or the workouts showed it
// (an age formula would pass for a measured one); steps a day from the
// suggestions (profile-suggestions.js).
export function profileInputs({ saved, suggested } = {}) {
  const s = saved || {}, g = suggested || {};
  const pick = key => (s[key] != null && s[key] !== "" ? s[key] : g[key] != null && g[key] !== "" ? g[key] : null);
  const hrmax = s.hrmax != null && s.hrmax !== "" ? s.hrmax : g.sources?.hrmax === "activities-6m" ? g.hrmax : null;
  return { sex: pick("sex"), birthDate: pick("birthDate"), age: pick("age"), height: pick("height"), hrmax, averageSteps: g.averageSteps ?? null };
}
