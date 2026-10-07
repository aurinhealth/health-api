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
import { dateFormat } from "./date-format.js";
import { intervalsAuthorization } from "./intervals-auth.js";

const TOLERANCE_KG = 0.05;
export const WEIGHT_SYNC_DAYS = 14;
const pragueDay = iso => dateFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date(iso));
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

const intervalsAuth = env => ({ Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json", "Content-Type": "application/json" });

// Weight per day from Intervals.icu wellness.
export async function intervalsWeights(env, oldest, newest, fetchImpl = fetch) {
  const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness?oldest=${oldest}&newest=${newest}`, { headers: intervalsAuth(env), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Intervals wellness HTTP " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Invalid Intervals wellness response');
  return Object.fromEntries(rows.map(r => [r.id, kg(r.weight)]).filter(([id, v]) => /^\d{4}-\d{2}-\d{2}$/.test(id) && id >= oldest && id <= newest && v != null));
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
    body: JSON.stringify({ weight: { sampleTime: { physicalTime: at, utcOffset: "7200s" }, weightGrams: Math.round(value * 1000), notes: "Loadwise" } })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error("Google Health weight write failed"), { status: response.status, body });
  return body;
}

function appWeightStatement(db, userId, date, value) {
  const at = date + "T12:00:00+02:00";
  return db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json)
    VALUES (?, 'intervals', 'weight', ?, ?, ?, ?, ?, 'kg', ?) ON CONFLICT(user_id, source_family, data_type, external_id) DO UPDATE SET value_numeric = excluded.value_numeric, payload_json = excluded.payload_json`)
    .bind(userId, "intervals-weight:" + date, at, at, at, value, JSON.stringify({ value_kg: value, source: "intervals" }));
}

async function storeIntervalsWeights(env, weights) {
  const statements = Object.entries(weights).map(([date, value]) => appWeightStatement(env.DB, env.USER_ID, date, value));
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
}

// Read-only import: connecting a service must make its weights usable right
// away, independently of activity/calendar access or outbound Google writes.
export async function importIntervalsWeights(env, { days = 365, fetchImpl = fetch, now = Date.now() } = {}) {
  const newest = pragueDay(new Date(now).toISOString()), oldest = pragueDay(new Date(now - (days - 1) * 86400000).toISOString());
  const weights = await intervalsWeights(env, oldest, newest, fetchImpl);
  await storeIntervalsWeights(env, weights);
  return { weights_found: Object.keys(weights).length, weights_saved: Object.keys(weights).length };
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
  // Persist before attempting writes elsewhere: a Google outage must never
  // delay the weight used by nutrition and the athlete profile.
  await storeIntervalsWeights(env, intervals);
  const googleWritable = googleConnected && grantedExtras(env).weightWrite;
  const actions = planWeightSync({ ...stored, intervals, written }, { googleConnected, intervalsConnected, googleWritable });
  let token = null;
  const done = [];
  for (const action of actions) {
    try {
      if (action.target === "intervals") await writeIntervalsWeight(env, action.date, action.kg, fetchImpl);
      if (action.target === "google") await writeGoogleWeight(token ||= await googleToken(env), action.date, action.kg, fetchImpl);
      // The app copy was saved above even if the ledger already had an entry.
      await remember(env.DB, env.USER_ID, action.target, action.date, action.kg);
      done.push(action);
    } catch (error) { console.error("Weight sync failed", action.target, action.date, error.message); }
  }
  return { status: "ok", written: done };
}
