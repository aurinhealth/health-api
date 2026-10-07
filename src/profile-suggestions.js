// Profile values the app can work out itself, so the user fills in only the
// rest: height from Google Health, everyday activity from average steps,
// resting heart rate (30-day average, Google Health or Intervals.icu) and the
// highest heart rate in Intervals.icu and Google Health activities over six
// months (calibratedMaxHeartRate), and the birth
// date from the Google account when the user allowed it.
// Stored as dashboard_profile row id=2 and refreshed at most once a day; the
// user's own values (row id=1) always win.

import { effectiveProfile, ageFrom } from "./energy-profile.js";
import { grantedExtras, birthdayScopes } from "./google-scopes.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import {trainingHistory} from './training-history.js';

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

// Average of Google Health's daily resting heart rate over 30 days.
export async function averageRestingHeartRate(db, userId, now = Date.now()) {
  const since = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);
  const rows = (await db.prepare(`SELECT value_numeric, payload_json FROM health_datapoints WHERE user_id = ? AND data_type = 'daily-resting-heart-rate'
    AND (record_role IS NULL OR record_role != 'duplicate') AND COALESCE(sample_time, start_time) >= ?`).bind(userId, since).all()).results || [];
  const values = rows.map(r => {
    let bpm = Number(r.value_numeric);
    if (!(bpm > 0)) { try { const p = JSON.parse(r.payload_json || "{}"); bpm = Number((p.dailyRestingHeartRate || p).beatsPerMinute); } catch { bpm = NaN; } }
    return bpm;
  }).filter(v => v >= 25 && v <= 120);
  return values.length >= 3 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

const heartRate = v => { const x = Number(v && typeof v === "object" ? v.bpm ?? v.value : v); return x >= 100 && x <= 230 ? Math.round(x) : null; };

// The highest heart rate of one stored activity (Intervals.icu or Google Health).
export function activityMaxHeartRate(payload = {}) {
  const direct = heartRate(payload.max_heartrate ?? payload.maxHeartRate);
  if (direct != null) return direct;
  const metrics = payload.exercise?.metricsSummary || {};
  const key = Object.keys(metrics).find(k => /heart/i.test(k) && /max/i.test(k) && !/variab|zone/i.test(k));
  return key ? heartRate(metrics[key]) : null;
}

// Highest heart rate over six months. A peak more than 8 bpm above every
// other activity is taken for a sensor spike and skipped.
export async function observedMaxHeartRate(db, userId, now = Date.now()) {
  return (await observedHeartRates(db, userId, now)).max;
}
// The same, with how many activities had a heart rate at all.
export async function observedHeartRates(db, userId, now = Date.now()) {
  const since = new Date(now - 183 * DAY_MS).toISOString().slice(0, 10);
  const rows = (await db.prepare(`SELECT payload_json FROM health_datapoints WHERE user_id = ?
    AND ((source_family = 'intervals' AND data_type = 'activity') OR (source_family = 'google-wearables' AND data_type = 'exercise'))
    AND (record_role IS NULL OR record_role != 'duplicate') AND start_time >= ?`).bind(userId, since).all()).results || [];
  const peaks = rows.map(r => { try { return activityMaxHeartRate(JSON.parse(r.payload_json || "{}")); } catch { return null; } }).filter(v => v != null).sort((a, b) => b - a);
  for (let i = 0; i < peaks.length; i++) if (i === peaks.length - 1 || peaks[i] - peaks[i + 1] <= 8) return { max: peaks[i], count: peaks.length };
  return { max: null, count: 0 };
}

// Heart-rate zones calibrate themselves from the activities. A few easy
// sessions never reach the real maximum, so until the activities show a peak
// near the age estimate (Tanaka: 208 − 0.7 × age) or there are 20 of them,
// the age estimate stands in. Every harder session can only raise it.
const TRUSTED_ACTIVITIES = 20;
export function calibratedMaxHeartRate(observed, age) {
  const predicted = Number(age) >= 10 && Number(age) <= 100 ? Math.round(208 - 0.7 * Number(age)) : null;
  if (observed.max && (!predicted || observed.max >= predicted * 0.95 || observed.count >= TRUSTED_ACTIVITIES)) return { hrmax: observed.max, source: "activities-6m" };
  return predicted ? { hrmax: predicted, source: "age-estimate" } : { hrmax: null, source: null };
}

// Resting heart rate from the Intervals.icu wellness (a watch synced there)
// for users without Google Health: the 30-day average.
export async function intervalsRestingHeartRate(env, fetchImpl = fetch, now = Date.now()) {
  if (!env.INTERVALS_API_KEY) return null;
  const oldest = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10), newest = new Date(now).toISOString().slice(0, 10);
  const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness?oldest=${oldest}&newest=${newest}`, { signal: AbortSignal.timeout(8000), headers: { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json" } });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const values = (Array.isArray(rows) ? rows : []).map(r => Number(r?.restingHR)).filter(v => v >= 25 && v <= 120);
  return values.length >= 3 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
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

// Birth date from the Google account (People API); null without a full date.
export async function googleBirthDate(token, fetchImpl = fetch) {
  const response = await fetchImpl("https://people.googleapis.com/v1/people/me?personFields=birthdays", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  if (!response.ok) return null;
  const birthdays = (await response.json().catch(() => ({}))).birthdays || [];
  const date = (birthdays.find(b => b?.metadata?.primary && b?.date?.year) || birthdays.find(b => b?.date?.year))?.date;
  if (!date?.month || !date?.day) return null;
  const value = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  return ageFrom(value) != null ? value : null;
}

export async function readSuggestions(db, userId) {
  const row = await db.prepare("SELECT profile_json FROM dashboard_profile WHERE user_id = ? AND id = 2").bind(userId).first().catch(() => null);
  try { return row ? JSON.parse(row.profile_json) : null; } catch { return null; }
}

// Recomputes the suggestions when they are missing or older than a day.
export async function refreshSuggestions(env, { googleToken, fetchImpl = fetch, now = Date.now(), force = false } = {}) {
  const current = await readSuggestions(env.DB, env.USER_ID);
  // A newly granted permission refreshes right away instead of the next day.
  const permissions = JSON.stringify(grantedExtras(env));
  const history=await trainingHistory(env.DB,env.USER_ID,{now});
  if (!force && current?.fetchedAt && now - Date.parse(current.fetchedAt) < DAY_MS && current.permissions === permissions) return {...current,mainSport:history.mainSport,trainingHistory:history};
  const averageSteps = await averageDailySteps(env.DB, env.USER_ID, now).catch(() => null);
  const rhr = await averageRestingHeartRate(env.DB, env.USER_ID, now).catch(() => null)
    ?? await intervalsRestingHeartRate(env, fetchImpl, now).catch(() => null);
  const observed = await observedHeartRates(env.DB, env.USER_ID, now).catch(() => ({ max: null, count: 0 }));
  let height = current?.height ?? null;
  if (env.GOOGLE_REFRESH_TOKEN && googleToken) {
    try { height = (await googleHeightCm(await googleToken(env), fetchImpl)) ?? height; }
    catch (error) { console.error("Google height read failed", error.message); }
  }
  // Without access to Google (a background refresh) the birth date read before is kept.
  let birthDate = googleToken ? null : current?.birthDate ?? null;
  if (env.GOOGLE_REFRESH_TOKEN && googleToken && grantedExtras(env).birthday) {
    try { birthDate = await googleBirthDate(await googleToken(env, birthdayScopes), fetchImpl); }
    catch (error) { console.error("Google birth date read failed", error.message); }
  }
  const saved = await env.DB.prepare("SELECT profile_json FROM dashboard_profile WHERE user_id = ? AND id = 1").bind(env.USER_ID).first().catch(() => null);
  let savedProfile = null;
  try { savedProfile = JSON.parse(saved?.profile_json || "null"); } catch { savedProfile = null; }
  const { hrmax, source: hrmaxSource } = calibratedMaxHeartRate(observed, effectiveProfile(savedProfile, { birthDate }).age);
  const next = {
    mainSport:history.mainSport,
    trainingHistory:history,
    height,
    activity: activityFromSteps(averageSteps),
    averageSteps,
    rhr,
    hrmax,
    birthDate,
    permissions,
    sources: { birthDate: birthDate ? "google-account" : null, height: height ? "google-health" : null, activity: averageSteps ? "steps" : null, rhr: rhr ? "resting-30d" : null, hrmax: hrmaxSource },
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
  if(!saved&&!suggested)return null;
  return effectiveProfile(saved,suggested);
}
