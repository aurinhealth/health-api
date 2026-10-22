// The detail of a ride or run imported from Wahoo: the summary Wahoo sent
// (wahoo.js wahooActivityRow) and the curves from the workout's FIT file
// (power, heart rate, cadence, altitude, route), read once and kept as an
// 'activity-streams' row next to the activity (disconnecting deletes both).
// Without the file the heart rate comes from the watch's samples. The answer
// has the shape of the Intervals.icu detail (activity-detail.js), so the app
// draws it the same way.
import { heartRateZones, heartRateRecovery, sampleActivityStreams } from './activity-detail.js';
import { analyzeRide } from './ride-analysis.js';
import { watchOrigin } from './activity-origin.js';
import { activityRecoveryHours } from './recovery-hours.js';
import { rideFtpFor } from './intervals-athlete.js';
import { parseFit, fitStreams } from './fit-file.js';
import { thin, zoneBounds, zoneSeconds, storedHeartRate } from './watch-detail.js';
import { wahooFileUrl } from './wahoo.js';

const STREAMS = 'activity-streams';
const MAX_FILE = 20 * 1024 * 1024;
const n = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const parse = json => { try { return JSON.parse(json || '{}'); } catch { return {}; } };

async function download(url, fetchImpl) {
  if (!url) return null;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(12000) }).catch(() => null);
  if (!response?.ok || Number(response.headers.get('content-length') || 0) > MAX_FILE) return null;
  const bytes = new Uint8Array(await response.arrayBuffer().catch(() => new ArrayBuffer(0)));
  return bytes.length && bytes.length <= MAX_FILE ? bytes : null;
}

// The workout's curves: kept from an earlier read, else from the FIT file (the
// link kept with the activity, or asked of Wahoo again when that one is gone).
export async function wahooStreams(env, row, { fetchImpl = fetch } = {}) {
  const kept = await env.DB.prepare(`SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family='wahoo' AND data_type='${STREAMS}' AND external_id=?`)
    .bind(env.USER_ID, row.external_id).first().catch(() => null);
  if (kept) return parse(kept.payload_json).streams || [];
  const w = parse(row.payload_json).wahoo || {};
  let bytes = await download(w.file, fetchImpl);
  if (!bytes) bytes = await download(await wahooFileUrl(env, w.workoutId, { fetchImpl }).catch(() => null), fetchImpl);
  if (!bytes) return [];
  const points = await parseFit(bytes).catch(() => []);
  if (!points.length) return [];
  const streams = fitStreams(thin(points, 1800));
  await env.DB.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json)
    VALUES (?, 'wahoo', '${STREAMS}', ?, ?, ?, ?) ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=CURRENT_TIMESTAMP`)
    .bind(env.USER_ID, row.external_id, row.start_time, row.end_time, JSON.stringify({ streams })).run().catch(() => {});
  return streams;
}

export async function wahooDetail(env, { id, hrZones = [], thresholds = null, fetchImpl = fetch } = {}) {
  if (!/^wahoo:\d{1,15}$/.test(String(id || ''))) return null;
  const row = await env.DB.prepare(`SELECT external_id, start_time, end_time, payload_json FROM health_datapoints
    WHERE user_id=? AND source_family='wahoo' AND data_type='activity' AND external_id=?`).bind(env.USER_ID, String(id)).first();
  if (!row) return null;
  const p = parse(row.payload_json);
  let streams = await wahooStreams(env, row, { fetchImpl });
  if (!streams.length) {
    // No file: the watch's heart rate through the same time.
    const from = Date.parse(p.start_date), seconds = n(p.elapsed_time) ?? n(p.moving_time);
    const iso = t => new Date(t).toISOString().replace('.000Z', 'Z');
    const heart = Number.isFinite(from) && seconds ? await storedHeartRate(env.DB, env.USER_ID, iso(from), iso(from + seconds * 1000)).catch(() => []) : [];
    if (heart.length) streams = [{ type: 'time', data: heart.map(x => x[0]) }, { type: 'heartrate', data: heart.map(x => x[1]) }];
  }
  const stream = type => streams.find(s => s.type === type)?.data || [];
  const time = stream('time'), bpm = stream('heartrate'), watts = stream('watts').filter(v => v != null);
  const ride = /ride/i.test(String(p.type || ''));
  const ftp = ride ? rideFtpFor(thresholds || {}, /virtual/i.test(String(p.type || '')) ? 'indoor' : 'outdoor').ftp : null;
  const np = n(p.icu_weighted_avg_watts), hrs = bpm.filter(v => v > 0);
  const activity = {
    name: p.name || null, type: p.type || null, distance: n(p.distance), moving_time: n(p.moving_time),
    total_elevation_gain: n(p.total_elevation_gain),
    average_watts: n(p.icu_average_watts) ?? (watts.length ? Math.round(watts.reduce((a, b) => a + b, 0) / watts.length) : null),
    icu_normalized_watts: np, icu_weighted_avg_watts: np, icu_ftp: ftp,
    average_heartrate: n(p.average_heartrate) ?? (hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null),
    max_heartrate: hrs.length ? Math.max(...hrs) : null,
    average_cadence: n(p.average_cadence), icu_training_load: n(p.icu_training_load),
    icu_intensity: np && ftp ? Math.round(np / ftp * 100) / 100 : null,
    average_speed: n(p.average_speed), calories: n(p.calories)
  };
  for (const k of Object.keys(activity)) if (activity[k] == null) delete activity[k];
  const bounds = zoneBounds(hrZones);
  return {
    status: 'ok', activity, recoveryHours: activityRecoveryHours(activity),
    analysis: ride && watts.length ? { ...analyzeRide(activity, streams), source: 'wahoo' } : null,
    intervals: [],
    hrZones: heartRateZones({ icu_hr_zones: bounds, icu_hr_zone_times: zoneSeconds(bounds, time, bpm) }, time, bpm),
    streams: sampleActivityStreams(streams),
    hrr: heartRateRecovery(time, bpm, bounds.length >= 4 ? bounds[2] + 1 : null),
    watch: { source: 'wahoo', id: row.external_id },
    source: 'wahoo',
    origin: watchOrigin('wahoo')
  };
}
