// Copies Google Health wellness into Intervals.icu: sleep, average sleeping
// heart rate, steps, resting heart rate, HRV, SpO2, respiration, VO2max and
// body fat, per day.
//
// A field is written only when Intervals.icu has no value for that day or the
// value there is one this sync wrote before (a ledger remembers what it
// wrote). So data Intervals.icu gets from elsewhere (a Garmin, a manual entry)
// is never overwritten, while today's steps can grow through the day.

import { heartRateFromSamples } from "./index.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { localDate } from "./user-time.js";

export const WELLNESS_SYNC_DAYS = 14;

// Google Health data type → Intervals.icu wellness field.
const DAILY = {
  "daily-resting-heart-rate": "restingHR",
  "daily-heart-rate-variability": "hrv",
  "daily-oxygen-saturation": "spO2",
  "daily-respiratory-rate": "respiration",
  "daily-vo2-max": "vo2max",
  "body-fat": "bodyFat"
};
const ROUND = { restingHR: 0, hrv: 1, spO2: 1, respiration: 1, vo2max: 1, bodyFat: 1, steps: 0, sleepSecs: 0, avgSleepingHR: 0 };
const TOLERANCE = { steps: 1, sleepSecs: 60 };

// Google sample times are stored as RFC 3339 UTC without milliseconds.
const utc = iso => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
const round = (field, v) => { const m = 10 ** ROUND[field]; return Math.round(Number(v) * m) / m; };
const same = (field, a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= (TOLERANCE[field] ?? 0.05);

// Google Health values per day: { "2026-10-01": { restingHR: 52, steps: 8400, … } }.
export async function googleWellness(db, userId, oldest, sleepSessions = []) {
  const days = {};
  const put = (day, field, value) => { if (Number.isFinite(Number(value)) && Number(value) > 0) (days[day] ||= {})[field] = round(field, value); };
  const types = Object.keys(DAILY);
  const rows = (await db.prepare(`SELECT data_type, sample_time, value_numeric FROM health_datapoints WHERE user_id = ? AND source_family IN ('google-wearables', 'google-sources')
    AND data_type IN (${types.map(() => "?").join(", ")}) AND value_numeric IS NOT NULL AND sample_time >= ? AND (record_role IS NULL OR record_role != 'duplicate') ORDER BY sample_time`)
    .bind(userId, ...types, oldest).all()).results || [];
  for (const r of rows) put(localDate(r.sample_time), DAILY[r.data_type], r.value_numeric);
  const steps = (await db.prepare(`SELECT start_time, value_numeric FROM health_datapoints WHERE user_id = ? AND source_family = 'google-wearables' AND data_type = 'steps'
    AND record_role = 'primary' AND start_time >= ?`).bind(userId, oldest).all()).results || [];
  const stepsPerDay = {};
  for (const r of steps) { const d = localDate(r.start_time); stepsPerDay[d] = (stepsPerDay[d] || 0) + Number(r.value_numeric || 0); }
  for (const [d, v] of Object.entries(stepsPerDay)) put(d, "steps", v);
  // The night's main sleep: the longest session ending that day. Its average
  // heart rate comes from Google Health's heart-rate samples in that window.
  const longest = {};
  for (const s of sleepSessions) if (s.date >= oldest && Number(s.durationMin) > 0 && Number(s.durationMin) > Number(longest[s.date]?.durationMin || 0)) longest[s.date] = s;
  for (const [d, s] of Object.entries(longest)) {
    put(d, "sleepSecs", Number(s.durationMin) * 60);
    if (!s.startTime || !s.endTime) continue;
    const samples = (await db.prepare(`SELECT sample_time, value_numeric, payload_json FROM health_datapoints WHERE user_id = ? AND data_type IN ('heart-rate', 'heart_rate')
      AND sample_time >= ? AND sample_time <= ? LIMIT 5000`).bind(userId, utc(s.startTime), utc(s.endTime)).all()).results || [];
    put(d, "avgSleepingHR", heartRateFromSamples({ start: s.startTime, end: s.endTime }, samples));
  }
  return days;
}

// The fields to write per day.
export function planWellnessSync(google, intervals, written) {
  const updates = {};
  for (const [date, values] of Object.entries(google)) {
    for (const [field, value] of Object.entries(values)) {
      const current = intervals[date]?.[field];
      const ours = written[date]?.[field];
      const free = current == null || same(field, current, ours);
      if (free && !same(field, current, value)) (updates[date] ||= {})[field] = value;
    }
  }
  return updates;
}

async function writtenLedger(db, userId, oldest) {
  const rows = (await db.prepare(`SELECT external_id, payload_json FROM health_datapoints WHERE user_id = ? AND source_family = 'wellness-sync' AND data_type = 'wellness-written' AND sample_time >= ?`).bind(userId, oldest).all()).results || [];
  return Object.fromEntries(rows.map(r => { try { return [r.external_id, JSON.parse(r.payload_json || "{}")]; } catch { return [r.external_id, {}]; } }));
}

async function remember(db, userId, date, fields) {
  const row = await db.prepare(`SELECT payload_json FROM health_datapoints WHERE user_id = ? AND source_family = 'wellness-sync' AND data_type = 'wellness-written' AND external_id = ?`).bind(userId, date).first();
  let merged = {};
  try { merged = { ...JSON.parse(row?.payload_json || "{}"), ...fields }; } catch { merged = fields; }
  await db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, payload_json) VALUES (?, 'wellness-sync', 'wellness-written', ?, ?, ?)
    ON CONFLICT(user_id, source_family, data_type, external_id) DO UPDATE SET payload_json = excluded.payload_json`).bind(userId, date, date + "T12:00:00Z", JSON.stringify(merged)).run();
}

const auth = env => ({ Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json", "Content-Type": "application/json" });

// One pass for one user with both Google Health and Intervals.icu connected.
export async function syncWellnessToIntervals(env, { sleepSessions = async () => [], fetchImpl = fetch, now = Date.now() } = {}) {
  const providers = env.CONNECTED_PROVIDERS || [];
  if (!providers.includes("google") || !providers.includes("intervals")) return { status: "skipped" };
  const newest = localDate(new Date(now).toISOString()), oldest = localDate(new Date(now - (WELLNESS_SYNC_DAYS - 1) * 86400000).toISOString());
  const google = await googleWellness(env.DB, env.USER_ID, oldest, await sleepSessions(oldest, newest));
  const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness?oldest=${oldest}&newest=${newest}`, { headers: auth(env) });
  if (!response.ok) throw new Error("Intervals wellness HTTP " + response.status);
  const intervals = Object.fromEntries(((await response.json()) || []).map(r => [r.id, r]));
  const updates = planWellnessSync(google, intervals, await writtenLedger(env.DB, env.USER_ID, oldest));
  const done = {};
  for (const [date, fields] of Object.entries(updates)) {
    try {
      const put = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness/${date}`, { method: "PUT", headers: auth(env), body: JSON.stringify({ id: date, ...fields }) });
      if (!put.ok) throw new Error("HTTP " + put.status);
      await remember(env.DB, env.USER_ID, date, fields);
      done[date] = fields;
    } catch (error) { console.error("Wellness sync failed", date, error.message); }
  }
  return { status: "ok", written: done };
}
