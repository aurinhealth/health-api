// Apple Health (HealthKit) from the native iPhone app. Apple Health has no web
// API: the app reads HealthKit on the phone, sums it up (steps and energy per
// hour, one value a day for resting heart rate, HRV, breathing, VO2max,
// oxygen and wrist temperature in sleep, minutes in heart-rate zones per day,
// nights with stages, workouts) and sends it to POST /app/api/health/apple.
//
// The rows are stored in health_datapoints as source_family 'apple-health'
// with the same data types and the same payload shape as Google Health, so the
// recovery model, sleep, strain, activities and the profile suggestions read
// them without knowing the source (WEARABLE_FAMILIES).
//
// The same data often reaches Loadwise twice: Google Health on an iPhone
// imports Apple Health. Where Apple Health sent a data type for a day, the
// Google Health rows of that type and day become record_role 'duplicate'
// (marked matched_activity_id 'apple-health', which keeps them out of the
// activity matching).
import { KEEP_TYPE_SQL } from "./activity-type.js";
import { healthPointJson } from "./health-point-json.js";
import { saveAppleFood } from "./apple-food.js";
import { resolveSources, MANAGED_TYPES } from "./source-priority.js";

export const SOURCE = "apple-health";
export const WEARABLE_FAMILIES = "('google-wearables','apple-health')";
const STATUS = "apple_health";
const REPLACED = "apple-health";
const MAX_RECORDS = 5000;
// One request: at most this many bytes (Content-Length), records, heart-rate
// points per workout and stages per night. Days and instants have to lie
// within the last 400 days (what the app reads back) up to tomorrow.
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_HEART_RATE_POINTS = 720;
const MAX_SLEEP_STAGES = 400;
const PAST_MS = 400 * 86400000, FUTURE_MS = 86400000;

const DAILY = {
  "daily-resting-heart-rate": ["dailyRestingHeartRate", "beatsPerMinute", "bpm", 25, 140],
  "daily-heart-rate-variability": ["dailyHeartRateVariability", "averageHeartRateVariabilityMilliseconds", "ms", 1, 400],
  "daily-respiratory-rate": ["dailyRespiratoryRate", "breathsPerMinute", "breaths/min", 4, 60],
  "daily-vo2-max": ["dailyVo2Max", "vo2Max", "ml/kg/min", 10, 95],
  "daily-oxygen-saturation": ["dailyOxygenSaturation", "percentage", "%", 50, 100],
  "daily-walking-heart-rate": ["dailyWalkingHeartRate", "beatsPerMinute", "bpm", 40, 200],
  "daily-heart-rate-recovery": ["dailyHeartRateRecovery", "beatsPerMinute", "bpm", 1, 120],
  // Apple Watch's wrist temperature in sleep, one value a night on the day of waking up.
  "daily-wrist-temperature": ["dailyWristTemperature", "temperatureCelsius", "°C", 30, 42],
  // Hours of the day Apple Watch measured heart rate in, i.e. was worn (source-priority.js).
  "daily-wear-hours": ["dailyWearHours", "hours", "h", 0, 24]
};
// One value a day for Deník (journal-store.js autoDays); the night's noise
// on the day of waking up, the time-zone change in hours (+ east, − west).
export const JOURNAL = {
  "daily-mindful-minutes": ["dailyMindfulMinutes", "minutes", "min", 0, 1440],
  "daily-daylight-minutes": ["dailyDaylightMinutes", "minutes", "min", 0, 1440],
  "daily-morning-daylight-minutes": ["dailyMorningDaylightMinutes", "minutes", "min", 0, 1440],
  "daily-night-noise": ["dailyNightNoise", "decibels", "dBA", 0, 140],
  "daily-symptom-headache": ["dailySymptom", "count", "count", 0, 100],
  "daily-symptom-runny-nose": ["dailySymptom", "count", "count", 0, 100],
  "daily-symptom-body-ache": ["dailySymptom", "count", "count", 0, 100],
  "daily-symptom-stomach": ["dailySymptom", "count", "count", 0, 100],
  "daily-sexual-activity": ["dailySexualActivity", "count", "count", 0, 100],
  "daily-yoga-minutes": ["dailyYogaMinutes", "minutes", "min", 0, 1440],
  "daily-stretching-minutes": ["dailyStretchingMinutes", "minutes", "min", 0, 1440],
  "daily-time-zone-change": ["dailyTimeZoneChange", "hours", "h", -26, 26]
};
const INTERVAL = {
  steps: ["steps", "count", "count", 0, 100000],
  "active-energy-burned": ["activeEnergyBurned", "kcal", "kcal", 0, 20000],
  distance: ["distance", "meters", "m", 0, 500000]
};
const SAMPLE = {
  weight: ["weight", "weightGrams", "kg", 20, 400],
  "body-fat": ["bodyFat", "percentage", "%", 2, 75],
  "lean-body-mass": ["leanBodyMass", "massKilograms", "kg", 10, 200]
};
const ZONES = ["LIGHT", "MODERATE", "VIGOROUS", "PEAK"];
const STAGES = { DEEP: "DEEP", REM: "REM", LIGHT: "LIGHT", CORE: "LIGHT", ASLEEP: "LIGHT", AWAKE: "AWAKE" };
// HKWorkoutActivityType names the app sends, as Google's exerciseType.
const EXERCISE = {
  running: "RUNNING", cycling: "BIKING", indoorRunning: "TREADMILL_RUNNING", indoorCycling: "INDOOR_BIKING", walking: "WALKING", hiking: "HIKING", swimming: "SWIMMING",
  traditionalStrengthTraining: "WEIGHTLIFTING", functionalStrengthTraining: "STRENGTH_TRAINING",
  highIntensityIntervalTraining: "HIIT", yoga: "YOGA", rowing: "ROWING", elliptical: "ELLIPTICAL",
  crossTraining: "CROSS_TRAINING", coreTraining: "CORE_TRAINING", pilates: "PILATES", soccer: "SOCCER",
  tennis: "TENNIS", crossCountrySkiing: "CROSS_COUNTRY_SKIING", downhillSkiing: "SKIING",
  stairClimbing: "STAIR_CLIMBING", mixedCardio: "AEROBIC_WORKOUT", other: "EXERCISE"
};

const num = (v, lo, hi) => { const n = Number(v); return v !== null && v !== "" && Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const inRange = (t, now) => Number.isFinite(t) && t >= now - PAST_MS && t <= now + FUTURE_MS;
// A calendar day that exists (2026-02-30 does not) and touches the range.
const day = (v, now) => { const s = String(v || ""); if (!DAY.test(s)) return null; const t = Date.parse(s + "T00:00:00Z"); return Number.isFinite(t) && t + 86400000 > now - PAST_MS && t <= now + FUTURE_MS && new Date(t).toISOString().slice(0, 10) === s ? s : null; };
// An instant with its zone, normalised to UTC like Google's timestamps, within the range.
const instant = (v, now) => { const s = String(v || ""); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return null; const t = Date.parse(s); return inRange(t, now) ? new Date(t).toISOString().replace(".000Z", "Z") : null; };
const cleanId = v => { const s = String(v ?? "").trim(); return s && s.length <= 120 && /^[A-Za-z0-9:._+-]+$/.test(s) ? s : null; };
const dateParts = d => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) });
const span = (start, end, maxHours) => start && end && Date.parse(end) > Date.parse(start) && Date.parse(end) - Date.parse(start) <= maxHours * 3600000;

// One record from the app as a health_datapoints row, or null when invalid.
export function appleRow(r, now = Date.now()) {
  if (!r || typeof r !== "object") return null;
  const type = String(r.type || ""), id = cleanId(r.id);
  if (!id) return null;
  const row = { data_type: type, external_id: "apple:" + id, sample_time: null, start_time: null, end_time: null, value_numeric: null, value_unit: null, payload: null };
  if (DAILY[type] || JOURNAL[type]) {
    const [key, field, unit, lo, hi] = DAILY[type] || JOURNAL[type], value = num(r.value, lo, hi), date = day(r.date, now);
    if (value == null || !date) return null;
    const body = { date: dateParts(date), [field]: value };
    if (type === "daily-heart-rate-variability" && ["rmssd", "sdnn"].includes(r.metric)) body.metric = r.metric;
    return { ...row, sample_time: date, value_numeric: value, value_unit: unit, payload: { [key]: body, source: SOURCE } };
  }
  if (INTERVAL[type]) {
    const [key, field, unit, lo, hi] = INTERVAL[type], value = num(r.value, lo, hi), start = instant(r.start, now), end = instant(r.end, now);
    if (value == null || !span(start, end, 25)) return null;
    return { ...row, start_time: start, end_time: end, value_numeric: value, value_unit: unit, payload: { [key]: { interval: { startTime: start, endTime: end }, [field]: value }, source: SOURCE } };
  }
  if (SAMPLE[type]) {
    const [key, field, unit, lo, hi] = SAMPLE[type], value = num(r.value, lo, hi), time = instant(r.time, now);
    if (value == null || !time) return null;
    return { ...row, sample_time: time, value_numeric: value, value_unit: unit, payload: { [key]: { sampleTime: { physicalTime: time }, [field]: type === "weight" ? Math.round(value * 1000) : value }, source: SOURCE } };
  }
  if (type === "time-in-heart-rate-zone") {
    // Minutes in one zone on one day, stored as an interval of that length
    // from the start of the day (what google-dashboard.js sums per day).
    const zone = String(r.zone || "").toUpperCase(), minutes = num(r.minutes, 0, 1440), start = instant(r.start, now);
    if (!ZONES.includes(zone) || !minutes || !start) return null;
    const end = new Date(Date.parse(start) + minutes * 60000).toISOString().replace(".000Z", "Z");
    return { ...row, start_time: start, end_time: end, value_numeric: minutes, value_unit: "min", payload: { timeInHeartRateZone: { interval: { startTime: start, endTime: end }, heartRateZoneType: zone, durationMinutes: minutes }, source: SOURCE } };
  }
  if (type === "sleep") {
    const start = instant(r.start, now), end = instant(r.end, now);
    if (!span(start, end, 24)) return null;
    const stages = (Array.isArray(r.stages) ? r.stages : []).slice(0, MAX_SLEEP_STAGES).map(s => ({ type: STAGES[String(s?.type || "").toUpperCase()], startTime: instant(s?.start, now), endTime: instant(s?.end, now) }))
      .filter(s => s.type && span(s.startTime, s.endTime, 24));
    const awake = stages.filter(s => s.type === "AWAKE").reduce((m, s) => m + (Date.parse(s.endTime) - Date.parse(s.startTime)) / 60000, 0);
    let summary = { minutesAwake: Math.round(awake) };
    // The app sends the night from getting into bed to getting up when Apple
    // Health has "in bed" samples (inBed): the time before the first sleep is
    // falling asleep, the time after the last one lying awake in the morning,
    // and the awake stages between them wake after sleep onset, as Google's
    // summary has them (sleep-sessions.js latencyMin, wasoMin).
    const asleep = stages.filter(s => s.type !== "AWAKE");
    if (r.inBed === true && asleep.length) {
      const first = Math.min(...asleep.map(s => Date.parse(s.startTime))), last = Math.max(...asleep.map(s => Date.parse(s.endTime)));
      const latency = Math.max(0, (first - Date.parse(start)) / 60000), after = Math.max(0, (Date.parse(end) - last) / 60000);
      const inside = stages.filter(s => s.type === "AWAKE").reduce((m, s) => m + Math.max(0, Math.min(last, Date.parse(s.endTime)) - Math.max(first, Date.parse(s.startTime))) / 60000, 0);
      summary = { minutesAwake: Math.round(latency + inside + after), minutesToFallAsleep: Math.round(latency), minutesAfterWakeUp: Math.round(after) };
    }
    const sleep = { interval: { startTime: start, endTime: end }, stages, type: stages.some(s => s.type === "DEEP" || s.type === "REM") ? "STAGES" : "CLASSIC", metadata: { nap: r.nap === true }, summary };
    return { ...row, start_time: start, end_time: end, payload: { sleep, source: SOURCE } };
  }
  if (type === "exercise") {
    const start = instant(r.start, now), end = instant(r.end, now);
    if (!span(start, end, 48)) return null;
    const exerciseType = EXERCISE[String(r.activity || "")] || "EXERCISE";
    const metrics = {};
    const put = (key, v, lo, hi, round = true) => { const n = num(v, lo, hi); if (n != null) metrics[key] = round ? Math.round(n) : n; };
    put("caloriesKcal", r.kcal, 0, 20000);
    put("distanceMeters", r.distanceMeters, 0, 1000000);
    put("averageHeartRateBeatsPerMinute", r.avgHr, 25, 250);
    put("maxHeartRateBeatsPerMinute", r.maxHr, 25, 250);
    put("elevationGainMeters", r.elevationGain, 0, 20000);
    put("averagePowerWatts", r.avgPower, 0, 3000);
    put("averageCadence", r.avgCadence, 0, 300);
    put("steps", r.steps, 0, 200000);
    const active = num(r.activeSeconds, 0, 48 * 3600);
    const exercise = { interval: { startTime: start, endTime: end }, exerciseType, displayName: String(r.name || "").slice(0, 80) || undefined, metricsSummary: metrics, exerciseMetadata: { hasGps: r.route === true } };
    if (active) exercise.activeDuration = Math.round(active) + "s";
    // Heart rate over the workout for the detail's chart: [seconds from the start, bpm].
    const heartRate = (Array.isArray(r.heartRate) ? r.heartRate : []).slice(0, MAX_HEART_RATE_POINTS)
      .map(p => Array.isArray(p) ? [num(p[0], 0, 48 * 3600), num(p[1], 25, 250)] : [null, null]).filter(p => p[0] != null && p[1] != null).map(p => [Math.round(p[0]), Math.round(p[1])]);
    const payload = { exercise, source: SOURCE, sourceName: String(r.sourceName || "").slice(0, 60) || undefined };
    if (heartRate.length) payload.samples = { heartRate };
    return { ...row, start_time: start, end_time: end, value_numeric: metrics.caloriesKcal ?? null, value_unit: metrics.caloriesKcal != null ? "kcal" : null, payload };
  }
  return null;
}

const upsert = (db, userId, row) => db.prepare(
  `INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json, record_role)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'primary')
   ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET
     sample_time = excluded.sample_time, start_time = excluded.start_time, end_time = excluded.end_time,
     value_numeric = excluded.value_numeric, value_unit = excluded.value_unit, ${KEEP_TYPE_SQL}, updated_at = CURRENT_TIMESTAMP
   WHERE health_datapoints.sample_time IS NOT excluded.sample_time
     OR health_datapoints.start_time IS NOT excluded.start_time
     OR health_datapoints.end_time IS NOT excluded.end_time
     OR health_datapoints.value_numeric IS NOT excluded.value_numeric
     OR health_datapoints.value_unit IS NOT excluded.value_unit
     OR health_datapoints.payload_json IS NOT excluded.payload_json`
).bind(userId, SOURCE, row.data_type, row.external_id, row.sample_time, row.start_time, row.end_time, row.value_numeric, row.value_unit, healthPointJson(row.payload));

// The day a row counts for, the same expression for both sources.
const DAY_OF = "substr(COALESCE(sample_time,end_time,start_time),1,10)";

// Google Health rows of the types and days Apple Health has become duplicates.
export async function replaceGoogleWithApple(db, userId, types, since) {
  let changed = 0;
  for (const type of types) {
    // Weighings and body fat come from Google's other sources (scales, apps).
    const family = SAMPLE[type] ? "'google-sources','all-sources'" : "'google-wearables'";
    const result = await db.prepare(
      `UPDATE health_datapoints SET record_role = 'duplicate', matched_activity_id = '${REPLACED}', match_confidence = 0, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND source_family IN (${family}) AND data_type = ?
         AND COALESCE(sample_time,end_time,start_time) >= ?
         AND NOT (COALESCE(record_role,'') = 'duplicate' AND COALESCE(matched_activity_id,'') = '${REPLACED}')
         AND ${DAY_OF} IN (SELECT DISTINCT ${DAY_OF} FROM health_datapoints WHERE user_id = ? AND source_family = '${SOURCE}' AND data_type = ? AND COALESCE(sample_time,end_time,start_time) >= ?)`
    ).bind(userId, type, since, userId, type, since).run();
    changed += Number(result?.meta?.changes || 0);
  }
  return changed;
}

// After a Google Health sync: which copy of the new rows counts. Measurements
// several devices take follow source-priority.js; the rest (workouts, weight)
// keep Apple Health's on the days it has them.
const appleUsers = new WeakMap();
export async function afterGoogleSync(env, type, points) {
  if (!points?.length || !env?.DB) return 0;
  try {
    const since = new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10);
    if (MANAGED_TYPES.includes(type)) return await resolveSources(env.DB, env.USER_ID, { types: [type], since });
    let on = appleUsers.get(env);
    if (on === undefined) { on = Boolean(await env.DB.prepare("SELECT 1 FROM sync_status WHERE user_id = ? AND sync_name = ? AND status != 'disconnected'").bind(env.USER_ID, STATUS).first()); appleUsers.set(env, on); }
    if (!on) return 0;
    return await replaceGoogleWithApple(env.DB, env.USER_ID, [type], new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10));
  } catch (error) { console.error("Apple Health dedupe failed", error.message); return 0; }
}

async function writeStatus(db, userId, status, details) {
  await db.prepare("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))").run();
  await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,?,datetime('now'),?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status=excluded.status,finished_at=excluded.finished_at,details_json=excluded.details_json,updated_at=excluded.updated_at")
    .bind(userId, STATUS, status, JSON.stringify(details)).run();
}

export async function appleHealthStatus(db, userId) {
  const row = await db.prepare("SELECT status, finished_at, details_json FROM sync_status WHERE user_id = ? AND sync_name = ?").bind(userId, STATUS).first().catch(() => null);
  if (!row || row.status === "disconnected") return { connected: false, lastSuccessAt: null, categories: [] };
  let details = {};
  try { details = JSON.parse(row.details_json || "{}"); } catch {}
  return { connected: true, lastSuccessAt: row.finished_at ? row.finished_at.replace(" ", "T") + "Z" : null, categories: Array.isArray(details.categories) ? details.categories : [], saved: details.saved ?? null };
}

// A request whose declared size is over the limit is refused before it is read.
export const appleBodyTooLarge = request => Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES;

// POST body: { records: [...], windows: { exercise: {from, to}, sleep: {from, to} }, categories: [...] }.
// A window says the app sent every workout (or night) starting in it: the
// Apple rows of that type in the window it did not send were deleted on the phone.
export async function saveAppleHealth(db, userId, body = {}, { now = Date.now() } = {}) {
  const input = Array.isArray(body.records) ? body.records : [];
  if (input.length > MAX_RECORDS) return { status: "error", code: 413, message: "Too many records in one request." };
  const rows = input.map(r => appleRow(r, now)).filter(Boolean);
  const statements = rows.map(row => upsert(db, userId, row));
  // Rows really written: the upsert leaves a row that did not change alone.
  let changed = 0;
  // 200 statements a round trip: a first sync of 1500 records is 8 batches, not 30.
  for (let i = 0; i < statements.length; i += 200) {
    for (const result of await db.batch(statements.slice(i, i + 200)) || []) changed += Number(result?.meta?.changes || 0);
  }

  let removed = 0;
  // A window reaching further back than the range starts at the range: rows
  // older than that are kept, the app no longer sends them.
  const floor = new Date(now - PAST_MS).toISOString().replace(".000Z", "Z");
  for (const type of ["exercise", "sleep"]) {
    const w = body.windows?.[type], to = instant(w?.to, now);
    const from = instant(w?.from, now) || (Date.parse(String(w?.from || "")) < now - PAST_MS ? floor : null);
    if (!from || !to || to <= from) continue;
    const keep = rows.filter(r => r.data_type === type).map(r => r.external_id);
    const result = await db.prepare(
      `DELETE FROM health_datapoints WHERE user_id = ? AND source_family = '${SOURCE}' AND data_type = ? AND start_time >= ? AND start_time < ?
       ${keep.length ? `AND external_id NOT IN (SELECT value FROM json_each(?))` : ""}`
    ).bind(...[userId, type, from, to, ...(keep.length ? [JSON.stringify(keep)] : [])]).run();
    removed += Number(result?.meta?.changes || 0);
  }

  // Only the rows accepted above set how far back Google's copies are replaced.
  const types = [...new Set(rows.map(r => r.data_type))];
  const oldest = rows.map(r => String(r.sample_time || r.end_time || r.start_time || "").slice(0, 10)).filter(Boolean).sort()[0];
  // Deník's values come only from Apple Health: nothing of Google's to replace.
  const other = types.filter(t => !MANAGED_TYPES.includes(t) && !JOURNAL[t]);
  let replaced = other.length && oldest ? await replaceGoogleWithApple(db, userId, other, oldest) : 0;
  // Nights, steps and energy several devices measure (and the hours worn that
  // decide between them) go by source-priority.js; a night ends a day later in UTC.
  if (oldest && types.some(t => MANAGED_TYPES.includes(t) || t === "daily-wear-hours")) {
    const since = new Date(Date.parse(oldest + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
    replaced += await resolveSources(db, userId, { types: types.includes("daily-wear-hours") ? [...types, "steps", "active-energy-burned", "distance", "time-in-heart-rate-zone"] : types, since });
  }
  // Food and drinks other apps logged (apple-food.js), with their own window.
  const food = body.food && typeof body.food === "object" ? await saveAppleFood(db, userId, body.food) : { saved: 0, removed: 0 };
  const categories = (Array.isArray(body.categories) ? body.categories : []).map(String).filter(c => /^[a-z]{2,20}$/.test(c)).slice(0, 12);
  const saved = rows.length + food.saved;
  removed += food.removed;
  // Nothing new (the usual sync that sends the same hours again): the cached
  // screens and the coach's texts stay valid (entrypoint.js).
  changed += removed + replaced + Number(food.changed || 0);
  await writeStatus(db, userId, "ok", { saved, skipped: input.length - rows.length, removed, replaced, categories });
  return { status: "ok", saved, changed, skipped: input.length - rows.length, removed, replaced, ...(body.food ? { food: food.saved } : {}) };
}

// Disconnecting: like the other services, the data Loadwise already has stays
// (and keeps replacing the Google copies of those days); nothing new comes.
export async function disconnectAppleHealth(db, userId) {
  await writeStatus(db, userId, "disconnected", {});
  return { status: "ok" };
}
