// Keeps body weight the same in the app, Google Health and Intervals.icu:
// a weight entered in any of them reaches the others.
//
// Per day the value comes from Google Health first (smart scales write
// there), then the app's own manual entry, then Intervals.icu. Missing or
// different values are written to the other services; the app reads Google
// Health through its regular sync, so an Intervals.icu weight reaches the app
// through Google, or directly when Google Health is not connected. A ledger
// of what was written keeps a slow Google sync from causing a second write.

import { grantedExtras } from "./google-scopes.js";

const TOLERANCE_KG = 0.05;
export const WEIGHT_SYNC_DAYS = 14;
const pragueDay = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date(iso));
const kg = v => { const x = Number(v); return x >= 30 && x <= 300 ? Math.round(x * 10) / 10 : null; };
const same = (a, b) => a != null && b != null && Math.abs(a - b) < TOLERANCE_KG;

// What to write where, from the latest weight per day in each place.
export function planWeightSync({ google = {}, manual = {}, intervals = {}, written = {} }, { googleConnected, intervalsConnected, googleWritable = googleConnected }) {
  const actions = [];
  const days = new Set([...Object.keys(google), ...Object.keys(manual), ...Object.keys(intervals)]);
  for (const date of [...days].sort()) {
    const value = google[date] ?? manual[date] ?? intervals[date];
    const origin = google[date] != null ? "google" : manual[date] != null ? "manual" : "intervals";
    const already = target => same(written[`${target}:${date}`], value);
    if (intervalsConnected && !same(intervals[date], value) && !already("intervals")) actions.push({ target: "intervals", date, kg: value });
    // Manual entries go to Google Health when they are saved (appWeight).
    // Without permission to write to Google Health the app keeps its own copy.
    if (origin === "intervals" && googleWritable && !already("google")) actions.push({ target: "google", date, kg: value });
    if (origin === "intervals" && !googleWritable && !already("app")) actions.push({ target: "app", date, kg: value });
  }
  return actions;
}

// Latest weight per Prague day from the app's database, by where it came from.
export async function storedWeights(db, userId, since) {
  const rows = (await db.prepare(`SELECT source_family, sample_time, value_numeric FROM health_datapoints
    WHERE user_id = ? AND data_type = 'weight' AND value_numeric IS NOT NULL AND sample_time >= ? ORDER BY sample_time`).bind(userId, since).all()).results || [];
  const out = { google: {}, manual: {}, intervals: {} };
  for (const r of rows) {
    const place = r.source_family === "manual" ? "manual" : r.source_family === "intervals" ? "intervals" : "google";
    const value = kg(r.value_numeric);
    if (value != null) out[place][pragueDay(r.sample_time)] = value;
  }
  return out;
}

export async function writtenLedger(db, userId, since) {
  const rows = (await db.prepare(`SELECT external_id, value_numeric FROM health_datapoints WHERE user_id = ? AND source_family = 'weight-sync' AND data_type = 'weight-written' AND sample_time >= ?`).bind(userId, since).all()).results || [];
  return Object.fromEntries(rows.map(r => [r.external_id, Number(r.value_numeric)]));
}

async function remember(db, userId, target, date, value) {
  await db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, value_unit, payload_json)
    VALUES (?, 'weight-sync', 'weight-written', ?, ?, ?, 'kg', '{}') ON CONFLICT(user_id, source_family, data_type, external_id) DO UPDATE SET value_numeric = excluded.value_numeric, sample_time = excluded.sample_time`)
    .bind(userId, `${target}:${date}`, date + "T12:00:00Z", value).run();
}

const intervalsAuth = env => ({ Authorization: "Basic " + btoa("API_KEY:" + String(env.INTERVALS_API_KEY)), Accept: "application/json", "Content-Type": "application/json" });

// Weight per day from Intervals.icu wellness.
export async function intervalsWeights(env, oldest, newest, fetchImpl = fetch) {
  const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness?oldest=${oldest}&newest=${newest}`, { headers: intervalsAuth(env) });
  if (!response.ok) throw new Error("Intervals wellness HTTP " + response.status);
  const rows = await response.json();
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map(r => [r.id, kg(r.weight)]).filter(([id, v]) => id && v != null));
}

export async function writeIntervalsWeight(env, date, value, fetchImpl = fetch) {
  const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness/${date}`, { method: "PUT", headers: intervalsAuth(env), body: JSON.stringify({ id: date, weight: value }) });
  if (!response.ok) throw new Error("Intervals wellness write HTTP " + response.status);
}

export async function writeGoogleWeight(token, date, value, fetchImpl = fetch) {
  const at = date + "T12:00:00+02:00";
  const response = await fetchImpl("https://health.googleapis.com/v4/users/me/dataTypes/weight/dataPoints", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ weight: { sampleTime: { physicalTime: at, utcOffset: "7200s" }, weightGrams: Math.round(value * 1000), notes: "Petr Fitness Data" } })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error("Google Health weight write failed"), { status: response.status, body });
  return body;
}

async function saveAppWeight(db, userId, date, value) {
  const at = date + "T12:00:00+02:00";
  await db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json)
    VALUES (?, 'intervals', 'weight', ?, ?, ?, ?, ?, 'kg', ?) ON CONFLICT(user_id, source_family, data_type, external_id) DO UPDATE SET value_numeric = excluded.value_numeric, payload_json = excluded.payload_json`)
    .bind(userId, "intervals-weight:" + date, at, at, at, value, JSON.stringify({ value_kg: value, source: "intervals" })).run();
}

// One sync pass for one user over the last WEIGHT_SYNC_DAYS days.
export async function syncWeights(env, { googleToken, fetchImpl = fetch, now = Date.now() } = {}) {
  const providers = env.CONNECTED_PROVIDERS || [];
  const googleConnected = providers.includes("google"), intervalsConnected = providers.includes("intervals");
  if (!intervalsConnected) return { status: "skipped", reason: "Intervals.icu is not connected" };
  const newest = pragueDay(new Date(now).toISOString()), oldest = pragueDay(new Date(now - (WEIGHT_SYNC_DAYS - 1) * 86400000).toISOString());
  const stored = await storedWeights(env.DB, env.USER_ID, oldest);
  const written = await writtenLedger(env.DB, env.USER_ID, oldest);
  const intervals = await intervalsWeights(env, oldest, newest, fetchImpl);
  const googleWritable = googleConnected && grantedExtras(env).weightWrite;
  const actions = planWeightSync({ ...stored, intervals, written }, { googleConnected, intervalsConnected, googleWritable });
  let token = null;
  const done = [];
  for (const action of actions) {
    try {
      if (action.target === "intervals") await writeIntervalsWeight(env, action.date, action.kg, fetchImpl);
      if (action.target === "google") await writeGoogleWeight(token ||= await googleToken(env), action.date, action.kg, fetchImpl);
      if (action.target === "app") await saveAppWeight(env.DB, env.USER_ID, action.date, action.kg);
      await remember(env.DB, env.USER_ID, action.target, action.date, action.kg);
      done.push(action);
    } catch (error) { console.error("Weight sync failed", action.target, action.date, error.message); }
  }
  return { status: "ok", written: done };
}
