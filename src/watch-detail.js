// The detail of a workout from the watch (Apple Health or Google Health): the
// summary, the heart rate through it, the time in the athlete's zones and the
// route. Apple Health's route stays on the iPhone (the app reads it there);
// Google Health gives it as a TCX file per workout (exportExerciseTcx, needs
// the location permission), kept here after the first read.
// The answer has the shape of the Intervals.icu detail (activity-detail.js),
// so the app draws both the same way. An Intervals.icu ride with no heart rate
// or route of its own gets them from the watch's copy of the same workout.
import { heartRateZones, heartRateRecovery } from './activity-detail.js';
import { activityRecoveryHours } from './recovery-hours.js';

const MAX_POINTS = 1500;
const ROUTE_TYPE = 'exercise-route';
const n = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const parse = json => { try { return JSON.parse(json || '{}'); } catch { return {}; } };
const seconds = v => { const x = Number(String(v ?? '').replace(/s$/i, '')); return Number.isFinite(x) && x > 0 ? x : null; };
const metric = (m, re) => { const key = Object.keys(m || {}).find(k => re.test(k)); return key ? n(m[key]) : null; };
export const WATCH_FAMILIES = ['google-wearables', 'apple-health'];

// Every step-th point, the last one kept, at most `limit`.
export function thin(points, limit = MAX_POINTS) {
  const step = Math.max(1, Math.ceil(points.length / limit));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

// Track points of a TCX file: seconds from `start`, position, altitude, distance, heart rate.
export function parseTcx(xml, start) {
  const t0 = Date.parse(start), out = [];
  for (const m of String(xml || '').matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)) {
    const body = m[1], tag = name => { const x = new RegExp('<' + name + '>([^<]*)</' + name + '>').exec(body); return x ? x[1].trim() : null; };
    const at = Date.parse(tag('Time') || ''), lat = n(tag('LatitudeDegrees')), lon = n(tag('LongitudeDegrees'));
    if (!Number.isFinite(at) || lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const hr = n(/<HeartRateBpm>\s*<Value>([^<]*)<\/Value>/.exec(body)?.[1]);
    out.push({ t: Math.round((at - (Number.isFinite(t0) ? t0 : at)) / 1000), lat, lon, alt: n(tag('AltitudeMeters')), dist: n(tag('DistanceMeters')), hr: hr > 25 && hr < 250 ? hr : null });
  }
  return thin(out);
}

// Heart rate through [start, end) from the stored samples: 10-second averages
// (5-minute rows once the samples are older than two weeks), seconds from start.
async function storedHeartRate(db, userId, start, end) {
  const s = Date.parse(start), e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || e - s > 24 * 3600e3) return [];
  const bpm = "CAST(COALESCE(value_numeric, json_extract(payload_json, '$.heartRate.beatsPerMinute')) AS REAL)";
  const [raw, buckets] = await Promise.all([
    db.prepare(`SELECT (CAST(strftime('%s', sample_time) AS INTEGER) / 10) * 10 AS at, AVG(${bpm}) AS v FROM health_datapoints
      WHERE user_id=? AND data_type='heart-rate' AND sample_time>=? AND sample_time<? AND ${bpm} BETWEEN 25 AND 250 GROUP BY at ORDER BY at`)
      .bind(userId, start, end).all().then(r => r.results || []).catch(() => []),
    db.prepare(`SELECT CAST(strftime('%s', sample_time) AS INTEGER) AS at, value_numeric AS v FROM health_datapoints
      WHERE user_id=? AND data_type='heart-rate-5min' AND sample_time>=? AND sample_time<? ORDER BY sample_time`)
      .bind(userId, start, end).all().then(r => r.results || []).catch(() => [])
  ]);
  const rows = raw.length ? raw : buckets;
  return thin(rows.map(r => [Math.round(n(r.at) - s / 1000), Math.round(n(r.v))]).filter(([t, v]) => t >= 0 && v > 0));
}

// The Google route of a workout: kept from an earlier read, else exported now.
// null without GPS, without the location permission or when Google refuses.
export async function googleRoute(env, row, { token, fetchImpl = fetch } = {}) {
  const ex = parse(row.payload_json).exercise || {};
  if (ex.exerciseMetadata?.hasGps !== true) return null;
  const kept = await env.DB.prepare(`SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family='google-wearables' AND data_type='${ROUTE_TYPE}' AND external_id=?`)
    .bind(env.USER_ID, row.external_id).first().catch(() => null);
  if (kept) return parse(kept.payload_json).points || null;
  if (!token || !/^users\/[^/]+\/dataTypes\/exercise\/dataPoints\/[A-Za-z0-9_.-]+$/.test(String(row.external_id || ''))) return null;
  const response = await fetchImpl('https://health.googleapis.com/v4/' + row.external_id + ':exportExerciseTcx?alt=media', {
    headers: { Authorization: 'Bearer ' + await token() }, signal: AbortSignal.timeout(12000)
  }).catch(() => null);
  if (!response?.ok) return null;
  const xml = await response.text();
  if (xml.length > 20 * 1024 * 1024) return null;
  const points = parseTcx(xml, row.start_time);
  if (!points.length) return null;
  await env.DB.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json)
    VALUES (?, 'google-wearables', '${ROUTE_TYPE}', ?, ?, ?, ?) ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=CURRENT_TIMESTAMP`)
    .bind(env.USER_ID, row.external_id, row.start_time, row.end_time, JSON.stringify({ points })).run().catch(() => {});
  return points;
}

async function watchRow(env, source, id) {
  if (!WATCH_FAMILIES.includes(source) || !id || String(id).length > 200) return null;
  return env.DB.prepare(`SELECT source_family, external_id, start_time, end_time, payload_json FROM health_datapoints
    WHERE user_id=? AND source_family=? AND data_type='exercise' AND external_id=?`).bind(env.USER_ID, source, String(id)).first();
}

// The heart-rate zones as Intervals.icu sends them (upper bounds), from the athlete's.
export function zoneBounds(hrZones = []) {
  const highs = (hrZones || []).map(z => n(z.bpmHigh)).filter(v => v > 0);
  return highs.length >= 3 ? [...highs, 250] : [];
}

// Seconds in each zone. The watch's samples can be minutes apart (5-minute
// rows after two weeks), so a gap counts up to 6 minutes.
export function zoneSeconds(bounds, time, bpm, maxGap = 360) {
  const out = bounds.map(() => 0);
  for (let i = 1; i < bpm.length; i++) {
    const dt = time[i] - time[i - 1];
    if (!(dt > 0) || dt > maxGap || !(bpm[i] > 0)) continue;
    let z = bounds.findIndex(b => bpm[i] <= b);
    if (z < 0) z = bounds.length - 1;
    out[z] += dt;
  }
  return out;
}

// Seconds from the start and bpm as the streams the app reads.
function streamsOf(heart, route) {
  const streams = [];
  if (heart.length) streams.push({ type: 'heartrate', points: heart.map(([t, v]) => ({ t, v })) });
  if (route?.length) {
    streams.push({ type: 'latlng', points: route.map(p => ({ t: p.t, v: [p.lat, p.lon] })) });
    if (route.some(p => p.alt != null)) streams.push({ type: 'altitude', points: route.filter(p => p.alt != null).map(p => ({ t: p.t, v: p.alt })) });
  }
  return streams;
}

export async function watchDetail(env, { source, id, hrZones = [], token = null, fetchImpl = fetch } = {}) {
  const row = await watchRow(env, source, id);
  if (!row) return null;
  const p = parse(row.payload_json), ex = p.exercise || {}, m = ex.metricsSummary || {};
  const start = row.start_time, end = row.end_time;
  const heart = Array.isArray(p.samples?.heartRate) && p.samples.heartRate.length
    ? thin(p.samples.heartRate.filter(x => Array.isArray(x) && n(x[0]) != null && n(x[1]) > 0))
    : await storedHeartRate(env.DB, env.USER_ID, start, end);
  const route = source === 'google-wearables' ? await googleRoute(env, row, { token, fetchImpl }) : null;
  const elapsed = (Date.parse(end) - Date.parse(start)) / 1000;
  const moving = seconds(ex.activeDuration) || (elapsed > 0 ? elapsed : null);
  const distance = n(m.distanceMeters) ?? (n(m.distanceMillimeters) != null ? n(m.distanceMillimeters) / 1000 : null) ?? (route?.at(-1)?.dist ?? null);
  const hrs = heart.map(x => x[1]);
  const avgHr = metric(m, /^av(era)?g.*heart|heart.*av(era)?g/i) || (hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null);
  const maxHr = metric(m, /^max.*heart|heart.*max/i) || (hrs.length ? Math.max(...hrs) : null);
  const bounds = zoneBounds(hrZones);
  const activity = {
    name: ex.displayName || null, type: ex.exerciseType || null, distance, moving_time: moving,
    total_elevation_gain: metric(m, /elevation/i), average_watts: metric(m, /power|watts/i),
    average_heartrate: avgHr, max_heartrate: maxHr, average_cadence: metric(m, /cadence/i),
    average_speed: distance && moving ? distance / moving : null, calories: n(m.caloriesKcal)
  };
  const time = heart.map(x => x[0]), bpm = heart.map(x => x[1]);
  return {
    status: 'ok', activity, recoveryHours: activityRecoveryHours(activity), analysis: null, intervals: [],
    hrZones: heartRateZones({ icu_hr_zones: bounds, icu_hr_zone_times: zoneSeconds(bounds, time, bpm) }, time, bpm),
    streams: streamsOf(heart, route),
    hrr: heartRateRecovery(time, bpm, bounds.length >= 4 ? bounds[2] + 1 : null),
    watch: { source, id: row.external_id, start, hasGps: ex.exerciseMetadata?.hasGps === true, route: Boolean(route?.length) },
    source
  };
}

// The watch's copy of an Intervals.icu activity (activity matching pairs them).
export async function watchCopyOf(env, activityId) {
  const ids = [String(activityId), 'activity:' + activityId];
  const row = await env.DB.prepare(`SELECT external_id, matched_activity_id FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND external_id IN (?, ?)`)
    .bind(env.USER_ID, ...ids).first().catch(() => null);
  const refs = [row?.matched_activity_id].filter(Boolean);
  const keys = [row?.external_id, ...ids].filter(Boolean).map(id => 'intervals:' + id);
  const copy = await env.DB.prepare(`SELECT source_family, external_id FROM health_datapoints WHERE user_id=? AND data_type='exercise' AND source_family IN ('google-wearables','apple-health')
    AND matched_activity_id IN (${keys.map(() => '?').join(',')}) ORDER BY source_family='apple-health' DESC LIMIT 1`).bind(env.USER_ID, ...keys).first().catch(() => null);
  if (copy) return { source: copy.source_family, id: copy.external_id };
  const ref = refs.find(r => WATCH_FAMILIES.some(f => r.startsWith(f + ':')));
  if (!ref) return null;
  const at = ref.indexOf(':');
  return { source: ref.slice(0, at), id: ref.slice(at + 1) };
}

// An Intervals.icu activity with a copy from the watch: Apple Health and
// Google Health are the source of the heart rate, zones, calories, distance
// and route; Intervals.icu keeps what only it has (power, TSS, intervals) and
// fills in what the watch did not record.
const WATCH_FIELDS = ['average_heartrate', 'max_heartrate', 'calories', 'distance', 'total_elevation_gain'];
export async function withWatch(env, detail, activityId, options = {}) {
  const ref = await watchCopyOf(env, activityId).catch(() => null);
  if (!ref) return detail;
  const watch = await watchDetail(env, { ...ref, ...options }).catch(() => null);
  if (!watch) return { ...detail, watch: { ...ref } };
  const fromWatch = new Set(watch.streams.filter(s => s.points?.length).map(s => s.type));
  const streams = [...(detail.streams || []).filter(s => !fromWatch.has(s.type)), ...watch.streams.filter(s => s.points?.length)];
  const activity = { ...detail.activity };
  for (const key of WATCH_FIELDS) if (watch.activity?.[key] != null) activity[key] = watch.activity[key];
  return {
    ...detail, activity, streams,
    hrZones: watch.hrZones?.length ? watch.hrZones : detail.hrZones,
    hrr: watch.hrr || detail.hrr,
    watch: watch.watch
  };
}
