// Copies Google Health and Apple Health wellness into Intervals.icu: sleep, average sleeping
// heart rate, steps, resting heart rate, HRV, SpO2, respiration, VO2max and
// body fat, per day.
//
// A field is written only when Intervals.icu has no value for that day or the
// value there is one this sync wrote before (a ledger remembers what it
// wrote). So data Intervals.icu gets from elsewhere (a Garmin, a manual entry)
// is never overwritten, while today's steps can grow through the day.
//
// Settings → Synchronizace → Intervals.icu → Zdravotní data limits the fields
// (sync-destinations.js); without a choice nothing goes.

import { heartRateInWindows } from "./index.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { healthPointJson } from './health-point-json.js';
import { localDate } from "./user-time.js";
import { readSyncPrefs, allowedWellness } from "./sync-destinations.js";
import { intervalsReads } from "./intervals-reads.js";

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
const ROUND = { restingHR: 0, hrv: 1, hrvSDNN: 1, spO2: 1, respiration: 1, vo2max: 1, bodyFat: 1, steps: 0, sleepSecs: 0, avgSleepingHR: 0 };
const TOLERANCE = { steps: 1, sleepSecs: 60 };

const round = (field, v) => { const m = 10 ** ROUND[field]; return Math.round(Number(v) * m) / m; };
const same = (field, a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= (TOLERANCE[field] ?? 0.05);

const PRIVATE_SLEEP = new Set(['whoop', 'ultrahuman']);
// Google Health values per day: { "2026-10-01": { restingHR: 52, steps: 8400, … } }.
export async function googleWellness(db, userId, oldest, sleepSessions = []) {
  const days = {};
  const put = (day, field, value) => { if (Number.isFinite(Number(value)) && Number(value) > 0) (days[day] ||= {})[field] = round(field, value); };
  const types = Object.keys(DAILY);
  const rows = (await db.prepare(`SELECT data_type, sample_time, value_numeric, payload_json FROM health_datapoints WHERE user_id = ? AND source_family IN ('google-wearables', 'google-sources', 'apple-health')
    AND data_type IN (${types.map(() => "?").join(", ")}) AND value_numeric IS NOT NULL AND sample_time >= ? AND (record_role IS NULL OR record_role != 'duplicate') ORDER BY sample_time`)
    .bind(userId, ...types, oldest).all()).results || [];
  // Intervals.icu's hrv is rMSSD; Apple Health's own HRV is SDNN, which has a field of its own.
  const field = r => r.data_type === "daily-heart-rate-variability" && /"metric":"sdnn"/.test(String(r.payload_json || "")) ? "hrvSDNN" : DAILY[r.data_type];
  for (const r of rows) put(localDate(r.sample_time), field(r), r.value_numeric);
  const steps = (await db.prepare(`SELECT start_time, value_numeric FROM health_datapoints WHERE user_id = ? AND source_family IN ('google-wearables','apple-health') AND data_type = 'steps'
    AND record_role = 'primary' AND start_time >= ?`).bind(userId, oldest).all()).results || [];
  const stepsPerDay = {};
  for (const r of steps) { const d = localDate(r.start_time); stepsPerDay[d] = (stepsPerDay[d] || 0) + Number(r.value_numeric || 0); }
  for (const [d, v] of Object.entries(stepsPerDay)) put(d, "steps", v);
  // The night's main sleep: the longest session ending that day. Its average
  // heart rate comes from Google Health's heart-rate samples in that window.
  const longest = {};
  // WHOOP and Ultrahuman nights stay in Aurin: their terms and our privacy
  // policy do not let us pass them on, so only Google and Apple sleep is sent.
  for (const s of sleepSessions) if (!PRIVATE_SLEEP.has(s.source) && s.date >= oldest && Number(s.durationMin) > 0 && Number(s.durationMin) > Number(longest[s.date]?.durationMin || 0)) longest[s.date] = s;
  const nights = Object.entries(longest);
  for (const [d, s] of nights) put(d, "sleepSecs", Number(s.durationMin) * 60);
  // The mean over every sample of the night, computed by the database (one query for all nights).
  const timed = nights.filter(([, s]) => s.startTime && s.endTime);
  if (timed.length) (await heartRateInWindows(db, userId, timed.map(([, s]) => ({ start: s.startTime, end: s.endTime }))))
    .forEach((bpm, i) => put(timed[i][0], "avgSleepingHR", bpm));
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
    ON CONFLICT(user_id, source_family, data_type, external_id) DO UPDATE SET payload_json = excluded.payload_json
    WHERE health_datapoints.payload_json IS NOT excluded.payload_json`).bind(userId, date, date + "T12:00:00Z", healthPointJson(merged)).run();
}

const auth = env => ({ Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json", "Content-Type": "application/json" });

// One pass for one user with Intervals.icu connected. Apple Health comes from
// the iPhone, so it is not a connection here: without Google Health the
// Apple Health days still go.
export async function syncWellnessToIntervals(env, { sleepSessions = async () => [], fetchImpl = intervalsReads(env), now = Date.now() } = {}) {
  if (!(env.CONNECTED_PROVIDERS || []).includes("intervals")) return { status: "skipped" };
  const prefs = await readSyncPrefs(env.DB, env.USER_ID, "intervals");
  // Weight goes through weight-sync.js and workouts through watch-forward.js:
  // a list of only those has nothing for the wellness push.
  if (prefs.health !== "all" && !prefs.health.some(type => type !== "weight" && type !== "workouts")) return { status: "skipped", reason: "off" };
  const newest = localDate(new Date(now).toISOString()), oldest = localDate(new Date(now - (WELLNESS_SYNC_DAYS - 1) * 86400000).toISOString());
  const google = await googleWellness(env.DB, env.USER_ID, oldest, await sleepSessions(oldest, newest));
  const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness?oldest=${oldest}&newest=${newest}`, { headers: auth(env) });
  if (!response.ok) throw new Error("Intervals wellness HTTP " + response.status);
  const intervals = Object.fromEntries(((await response.json()) || []).map(r => [r.id, r]));
  const updates = allowedWellness(planWellnessSync(google, intervals, await writtenLedger(env.DB, env.USER_ID, oldest)), prefs);
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
