import { dayStartUtc, localToday } from './user-time.js';

// Google Health heart rate arrives as a sample every few seconds (~36k a day).
// The sync stores it as one row per 5 minutes (average, minimum, maximum, count),
// the step the night chart draws in (index.js); only a workout's own minutes keep
// every sample, for HEART_RATE_RAW_DAYS (and the samples stored before that
// change). Older samples become 5-minute rows here, and after
// HEART_RATE_FIVE_MIN_DAYS the 5-minute rows become one row per hour. History
// stays, the database stops growing with every user's samples (Petr chose a week
// of samples on 2026-10-30). Google's zone minutes (a row a minute) become a row
// per hour and zone after ZONE_MINUTE_DAYS, once nothing reads them by the minute
// (Today and the source choice read hour-summary.js).
export const HEART_RATE_RAW_DAYS = 7;
export const HEART_RATE_FIVE_MIN_DAYS = 30;
export const ZONE_MINUTE_DAYS = 35;
export const HEART_RATE_BUCKET_TYPE = 'heart-rate-5min';
export const HEART_RATE_HOUR_TYPE = 'heart-rate-1h';
// A Google workout's own heart rate, one row a workout, kept: 5-second averages in
// its payload ({ t0: seconds, step: 5, bpm: [..., null for none] }), read by
// watch-detail.js for the curve, the zones and the recovery (index.js workoutHeartRate).
export const WORKOUT_HEART_RATE_TYPE = 'heart-rate-workout';
export const WORKOUT_HEART_RATE_STEP = 5;
// Every compacted heart-rate type, for the readers that fall back to them.
export const HEART_RATE_COMPACT_TYPES = [HEART_RATE_BUCKET_TYPE, HEART_RATE_HOUR_TYPE];
export const BUCKET_SECONDS = 300;
// From the hour this first runs for a user (index.js), Google's 5-minute rows come
// as one row an hour (2026-11-26): its 12 five minutes in the payload ({ b: [null
// or { avg, min, max, n, first, last }] }), the hour's average as the value. A row
// a 5 minutes was ~1,300 D1 row writes a day per user, and as many again for the
// delete a month later; the hour row is written once and updated in place. After
// HEART_RATE_FIVE_MIN_DAYS it becomes the 1-hour row (compactHeartRateBundles).
export const HEART_RATE_BUNDLE_TYPE = 'heart-rate-5min-hour';
// The hour rows that can hold [from, to): from the full hour before `from`.
export const BUNDLE_QUERY = `SELECT sample_time, payload_json FROM health_datapoints WHERE user_id=? AND source_family='google-wearables' AND data_type='${HEART_RATE_BUNDLE_TYPE}' AND sample_time>=? AND sample_time<?`;
export const bundleFrom = time => new Date(Math.floor(Date.parse(time) / 3600e3) * 3600e3).toISOString().replace('.000Z', 'Z');
// The hour rows back as the 5-minute rows ({ bucket (seconds), avg, min, max, n })
// starting in [from, to) (ms, optional).
export function bundleBuckets(rows, from = -Infinity, to = Infinity) {
  const out = [];
  for (const row of rows || []) {
    let b;
    try { b = JSON.parse(row?.payload_json || '{}').b; } catch { continue; }
    const hour = Date.parse(row?.sample_time || '');
    if (!Array.isArray(b) || !Number.isFinite(hour)) continue;
    b.forEach((x, k) => {
      const at = hour + k * BUCKET_SECONDS * 1000;
      if (x && Number.isFinite(Number(x.avg)) && at >= from && at < to) out.push({ bucket: at / 1000, avg: Number(x.avg), min: x.min, max: x.max, n: Number(x.n) || 1 });
    });
  }
  return out;
}
// The same 5 minutes from the raw samples and from a stored row: the one made of
// more samples counts. A workout keeps its own samples, which inside it are the
// same as the stored row's, while at its edges they cover only part of the 5
// minutes. Rows: { bucket (seconds), avg, min, max, n }.
export function pickBuckets(raw, stored) {
  const out = new Map();
  for (const r of stored) if (r && Number.isFinite(Number(r.bucket))) out.set(Number(r.bucket), r);
  for (const r of raw) {
    const have = out.get(Number(r.bucket));
    if (!have || Number(r.n) >= Number(have.n || 1)) out.set(Number(r.bucket), r);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}
const WINDOW_MS = 6 * 3600 * 1000;

const bpm = "CAST(COALESCE(value_numeric, json_extract(payload_json, '$.heartRate.beatsPerMinute')) AS REAL)";
const bucket = `(CAST(strftime('%s', sample_time) AS INTEGER) / ${BUCKET_SECONDS}) * ${BUCKET_SECONDS}`;
const iso = seconds => `strftime('%Y-%m-%dT%H:%M:%SZ', ${seconds}, 'unixepoch')`;

// Midnight of the user's day `days` back, in their time zone.
const cutoffFor = (now, days) => dayStartUtc(new Date(Date.parse(localToday(new Date(now)) + 'T12:00:00Z') - days * 86400000).toISOString().slice(0, 10)) + 'Z';

// Compacts the oldest six hours of raw samples past the cutoff, in one
// transaction: the 5-minute rows are written and the samples deleted together.
// Returns the window it compacted, or null when nothing is left to do.

export async function compactHeartRate(db, userId, { now = Date.now() } = {}) {
  const cutoff = cutoffFor(now, HEART_RATE_RAW_DAYS);
  const oldest = await db.prepare("SELECT MIN(sample_time) AS t FROM health_datapoints WHERE user_id = ? AND data_type = 'heart-rate' AND source_family = 'google-wearables' AND sample_time < ?").bind(userId, cutoff).first();
  const first = Date.parse(oldest?.t || '');
  if (!Number.isFinite(first)) return null;
  const from = new Date(Math.floor(first / WINDOW_MS) * WINDOW_MS).toISOString().replace('.000Z', 'Z');
  const to = new Date(Math.min(Date.parse(from) + WINDOW_MS, Date.parse(cutoff))).toISOString().replace('.000Z', 'Z');
  const window = "source_family = 'google-wearables' AND data_type = 'heart-rate' AND sample_time >= ? AND sample_time < ?";
  // A bucket the sync already wrote (it stores 5-minute rows, index.js) holds
  // these samples too: it stays as it is.
  const [, deleted] = await db.batch([
    db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json)
      SELECT user_id, source_family, '${HEART_RATE_BUCKET_TYPE}', 'hr5:' || b, ${iso('b')}, ${iso('b')}, ${iso(`b + ${BUCKET_SECONDS}`)}, ROUND(avg, 1), 'bpm', json_object('avg', ROUND(avg, 1), 'min', mn, 'max', mx, 'n', n)
      FROM (SELECT user_id, source_family, ${bucket} AS b, AVG(${bpm}) AS avg, MIN(${bpm}) AS mn, MAX(${bpm}) AS mx, COUNT(*) AS n
        FROM health_datapoints WHERE user_id = ? AND ${window} AND ${bpm} BETWEEN 20 AND 250 GROUP BY b) WHERE true
      ON CONFLICT (user_id, source_family, data_type, external_id) DO NOTHING`).bind(userId, from, to),
    db.prepare(`DELETE FROM health_datapoints WHERE user_id = ? AND ${window}`).bind(userId, from, to)
  ]);
  return { from, to, deleted: Number(deleted?.meta?.changes || 0) };
}

// The 5-minute rows older than HEART_RATE_FIVE_MIN_DAYS become one row per hour, a
// UTC day per call, weighted by their sample counts. Returns the window or null.
const HOUR_WINDOW_MS = 24 * 3600 * 1000;
export async function compactHeartRateHours(db, userId, { now = Date.now() } = {}) {
  const cutoff = cutoffFor(now, HEART_RATE_FIVE_MIN_DAYS);
  const oldest = await db.prepare(`SELECT MIN(sample_time) AS t FROM health_datapoints WHERE user_id = ? AND data_type = '${HEART_RATE_BUCKET_TYPE}' AND source_family = 'google-wearables' AND sample_time < ?`).bind(userId, cutoff).first();
  const first = Date.parse(oldest?.t || '');
  if (!Number.isFinite(first)) return null;
  const from = new Date(Math.floor(first / HOUR_WINDOW_MS) * HOUR_WINDOW_MS).toISOString().replace('.000Z', 'Z');
  const to = new Date(Math.min(Date.parse(from) + HOUR_WINDOW_MS, Date.parse(cutoff))).toISOString().replace('.000Z', 'Z');
  const window = `source_family = 'google-wearables' AND data_type = '${HEART_RATE_BUCKET_TYPE}' AND sample_time >= ? AND sample_time < ?`;
  const n = "COALESCE(json_extract(payload_json, '$.n'), 1)";
  const hour = "(CAST(strftime('%s', sample_time) AS INTEGER) / 3600) * 3600";
  const merged = (a, b) => `ROUND((${a}.value_numeric * json_extract(${a}.payload_json, '$.n') + ${b}.value_numeric * json_extract(${b}.payload_json, '$.n')) / (json_extract(${a}.payload_json, '$.n') + json_extract(${b}.payload_json, '$.n')), 1)`;
  const [, deleted] = await db.batch([
    db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json)
      SELECT user_id, source_family, '${HEART_RATE_HOUR_TYPE}', 'hr60:' || b, ${iso('b')}, ${iso('b')}, ${iso('b + 3600')}, ROUND(avg, 1), 'bpm', json_object('avg', ROUND(avg, 1), 'min', mn, 'max', mx, 'n', cnt)
      FROM (SELECT user_id, source_family, ${hour} AS b, SUM(value_numeric * ${n}) / SUM(${n}) AS avg,
          MIN(COALESCE(json_extract(payload_json, '$.min'), value_numeric)) AS mn, MAX(COALESCE(json_extract(payload_json, '$.max'), value_numeric)) AS mx, SUM(${n}) AS cnt
        FROM health_datapoints WHERE user_id = ? AND ${window} AND value_numeric BETWEEN 20 AND 250 GROUP BY b) WHERE true
      ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET
        value_numeric = ${merged('health_datapoints', 'excluded')},
        payload_json = json_object('avg', ${merged('health_datapoints', 'excluded')},
          'min', MIN(json_extract(health_datapoints.payload_json, '$.min'), json_extract(excluded.payload_json, '$.min')),
          'max', MAX(json_extract(health_datapoints.payload_json, '$.max'), json_extract(excluded.payload_json, '$.max')),
          'n', json_extract(health_datapoints.payload_json, '$.n') + json_extract(excluded.payload_json, '$.n')),
        updated_at = CURRENT_TIMESTAMP`).bind(userId, from, to),
    db.prepare(`DELETE FROM health_datapoints WHERE user_id = ? AND ${window}`).bind(userId, from, to)
  ]);
  return { from, to, deleted: Number(deleted?.meta?.changes || 0) };
}

// Google's zone minutes older than ZONE_MINUTE_DAYS become a row per hour, zone and
// role (the source choice keeps its marks), a UTC day per call: minutes summed, the
// interval as long as the minutes, as hour-summary.js and google-dashboard.js count
// them. The day reached is kept (sync_status 'zone_compaction'), so the hourly rows
// are not read again. Returns the window or null.
const ZONE_MARK = 'zone_compaction';
export async function compactZoneMinutes(db, userId, { now = Date.now() } = {}) {
  const cutoff = cutoffFor(now, ZONE_MINUTE_DAYS);
  const mark = await db.prepare('SELECT details_json FROM sync_status WHERE user_id = ? AND sync_name = ?').bind(userId, ZONE_MARK).first().catch(() => null);
  let done = '';
  try { done = JSON.parse(mark?.details_json || '{}')?.to || ''; } catch {}
  const oldest = await db.prepare("SELECT MIN(start_time) AS t FROM health_datapoints WHERE user_id = ? AND source_family = 'google-wearables' AND data_type = 'time-in-heart-rate-zone' AND start_time >= ? AND start_time < ?").bind(userId, done, cutoff).first();
  const first = Date.parse(oldest?.t || '');
  if (!Number.isFinite(first)) return null;
  const from = new Date(Math.floor(first / HOUR_WINDOW_MS) * HOUR_WINDOW_MS).toISOString().replace('.000Z', 'Z');
  const to = new Date(Math.min(Date.parse(from) + HOUR_WINDOW_MS, Date.parse(cutoff))).toISOString().replace('.000Z', 'Z');
  const window = "source_family = 'google-wearables' AND data_type = 'time-in-heart-rate-zone' AND start_time >= ? AND start_time < ?";
  const zone = "COALESCE(CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.timeInHeartRateZone.heartRateZoneType') END, '')";
  const hour = "substr(start_time, 1, 13) || ':00:00Z'";
  const minutes = "ROUND((julianday(end_time) - julianday(start_time)) * 86400) / 60.0";
  const end = "strftime('%Y-%m-%dT%H:%M:%SZ', h, '+' || ROUND(m * 60) || ' seconds')";
  const [, deleted] = await db.batch([
    db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json, record_role, matched_activity_id, match_confidence)
      SELECT user_id, source_family, data_type, 'zone1h:' || z || ':' || h || ':' || role || ':' || COALESCE(matched, ''), NULL, h, ${end}, v, 'min',
        json_object('timeInHeartRateZone', json_object('interval', json_object('startTime', h, 'endTime', ${end}), 'heartRateZoneType', z, 'durationMinutes', v)), role, matched, confidence
      FROM (SELECT user_id, source_family, data_type, ${zone} AS z, ${hour} AS h, COALESCE(record_role, 'primary') AS role, matched_activity_id AS matched, MIN(match_confidence) AS confidence,
          SUM(value_numeric) AS v, MIN(60, SUM(MAX(0, ${minutes}))) AS m
        FROM health_datapoints WHERE user_id = ? AND ${window} AND external_id NOT LIKE 'zone1h:%' GROUP BY z, h, role, matched) WHERE true
      ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET
        value_numeric = health_datapoints.value_numeric + excluded.value_numeric, end_time = excluded.end_time, payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP`).bind(userId, from, to),
    db.prepare(`DELETE FROM health_datapoints WHERE user_id = ? AND ${window} AND external_id NOT LIKE 'zone1h:%'`).bind(userId, from, to),
    db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,'ok',datetime('now'),?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET details_json=excluded.details_json,updated_at=excluded.updated_at")
      .bind(userId, ZONE_MARK, JSON.stringify({ to }))
  ]);
  return { from, to, deleted: Number(deleted?.meta?.changes || 0) };
}

// The hour rows of 5-minute heart rate older than HEART_RATE_FIVE_MIN_DAYS become
// the 1-hour row in place (one update, no delete): the hour's average, minimum,
// maximum and samples, the 12 five minutes dropped. Returns the rows changed or null.
export async function compactHeartRateBundles(db, userId, { now = Date.now() } = {}) {
  const cutoff = cutoffFor(now, HEART_RATE_FIVE_MIN_DAYS);
  const slot = k => `json_extract(j.value, '$.${k}')`;
  const result = await db.prepare(`UPDATE OR IGNORE health_datapoints SET data_type = '${HEART_RATE_HOUR_TYPE}', external_id = 'hr60:' || CAST(strftime('%s', sample_time) AS INTEGER),
      payload_json = (SELECT json_object('avg', ROUND(SUM(${slot('avg')} * ${slot('n')}) / SUM(${slot('n')}), 1), 'min', MIN(${slot('min')}), 'max', MAX(${slot('max')}), 'n', SUM(${slot('n')}))
        FROM json_each(health_datapoints.payload_json, '$.b') j WHERE j.type = 'object'), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND source_family = 'google-wearables' AND data_type = '${HEART_RATE_BUNDLE_TYPE}' AND sample_time < ?`).bind(userId, cutoff).run();
  const changed = Number(result?.meta?.changes || 0);
  return changed ? { to: cutoff, changed } : null;
}

// One step of whichever compaction has work left, in this order; null when none has.
export async function compactOldData(db, userId, { now = Date.now() } = {}) {
  for (const step of [compactHeartRate, compactHeartRateHours, compactHeartRateBundles, compactZoneMinutes]) {
    const done = await step(db, userId, { now });
    if (done) return { step: step.name, ...done };
  }
  return null;
}
