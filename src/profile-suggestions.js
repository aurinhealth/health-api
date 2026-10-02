// Profile values the app can work out itself, so the user fills in only the
// rest: height from Google Health and everyday activity from average steps.
// Stored as dashboard_profile row id=2 and refreshed at most once a day; the
// user's own values (row id=1) always win.

import { effectiveProfile } from "./energy-profile.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Average daily steps → everyday activity (Tudor-Locke step bands).
export function activityFromSteps(averageSteps) {
  const steps = Number(averageSteps);
  if (!(steps > 0)) return null;
  if (steps < 5000) return "sedentary";
  if (steps < 7500) return "light";
  if (steps < 12500) return "active";
  return "heavy";
}

// Days with fewer steps were most likely days without the watch on.
const MIN_WORN_STEPS = 1000;

export async function averageDailySteps(db, userId, now = Date.now()) {
  const since = new Date(now - 28 * DAY_MS).toISOString().slice(0, 10);
  const rows = (await db.prepare(`SELECT substr(COALESCE(start_time, sample_time), 1, 10) AS day, SUM(value_numeric) AS steps
    FROM health_datapoints WHERE user_id = ? AND data_type = 'steps' AND record_role = 'primary' AND COALESCE(start_time, sample_time) >= ?
    GROUP BY day`).bind(userId, since).all()).results || [];
  const worn = rows.map(r => Number(r.steps)).filter(s => s >= MIN_WORN_STEPS);
  return worn.length >= 7 ? Math.round(worn.reduce((a, b) => a + b, 0) / worn.length) : null;
}

// Latest height in Google Health, in cm; null when there is none or no access.
export async function googleHeightCm(token, fetchImpl = fetch) {
  const response = await fetchImpl("https://health.googleapis.com/v4/users/me/dataTypes/height/dataPoints?pageSize=1000", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!response.ok) return null;
  const points = (await response.json().catch(() => ({}))).dataPoints || [];
  const latest = points
    .map(p => ({ mm: Number(p?.height?.heightMillimeters), at: String(p?.height?.sampleTime?.physicalTime || "") }))
    .filter(p => p.mm >= 1000 && p.mm <= 2300)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return latest ? Math.round(latest.mm / 10) : null;
}

export async function readSuggestions(db, userId) {
  const row = await db.prepare("SELECT profile_json FROM dashboard_profile WHERE user_id = ? AND id = 2").bind(userId).first().catch(() => null);
  try { return row ? JSON.parse(row.profile_json) : null; } catch { return null; }
}

// Recomputes the suggestions when they are missing or older than a day.
export async function refreshSuggestions(env, { googleToken, fetchImpl = fetch, now = Date.now() } = {}) {
  const current = await readSuggestions(env.DB, env.USER_ID);
  if (current?.fetchedAt && now - Date.parse(current.fetchedAt) < DAY_MS) return current;
  const averageSteps = await averageDailySteps(env.DB, env.USER_ID, now).catch(() => null);
  let height = current?.height ?? null;
  if (env.GOOGLE_REFRESH_TOKEN && googleToken) {
    try { height = (await googleHeightCm(await googleToken(env), fetchImpl)) ?? height; }
    catch (error) { console.error("Google height read failed", error.message); }
  }
  const next = {
    height,
    activity: activityFromSteps(averageSteps),
    averageSteps,
    sources: { height: height ? "google-health" : null, activity: averageSteps ? "steps" : null },
    fetchedAt: new Date(now).toISOString()
  };
  await env.DB.prepare("INSERT INTO dashboard_profile (user_id, id, profile_json) VALUES (?, 2, ?) ON CONFLICT(user_id, id) DO UPDATE SET profile_json = excluded.profile_json")
    .bind(env.USER_ID, JSON.stringify(next)).run();
  return next;
}

// The profile the calculations use: saved values plus suggestions.
export async function loadEffectiveProfile(db, userId) {
  const rows = (await db.prepare("SELECT id, profile_json FROM dashboard_profile WHERE user_id = ? AND id IN (1, 2)").bind(userId).all().catch(() => ({ results: [] }))).results || [];
  const parsed = id => { try { return JSON.parse(rows.find(r => Number(r.id) === id)?.profile_json || "null"); } catch { return null; } };
  const saved = parsed(1), suggested = parsed(2);
  return saved || suggested ? effectiveProfile(saved, suggested) : null;
}
