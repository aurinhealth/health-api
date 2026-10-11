// Google Health heart rate arrives as a sample every few seconds (~50k rows a
// day). The last HEART_RATE_RAW_DAYS keep every sample; older samples become one
// row per 5 minutes (average, minimum, maximum, count), the step the night chart
// already draws in. History stays, the database stops growing by ~25 MB a day.
export const HEART_RATE_RAW_DAYS = 14;
export const HEART_RATE_BUCKET_TYPE = 'heart-rate-5min';
const BUCKET_SECONDS = 300;
const WINDOW_MS = 6 * 3600 * 1000;

const bpm = "CAST(COALESCE(value_numeric, json_extract(payload_json, '$.heartRate.beatsPerMinute')) AS REAL)";
const bucket = `(CAST(strftime('%s', sample_time) AS INTEGER) / ${BUCKET_SECONDS}) * ${BUCKET_SECONDS}`;
const iso = seconds => `strftime('%Y-%m-%dT%H:%M:%SZ', ${seconds}, 'unixepoch')`;

// Compacts the oldest six hours of raw samples past the cutoff, in one
// transaction: the 5-minute rows are written and the samples deleted together.
// Returns the window it compacted, or null when nothing is left to do.
export async function compactHeartRate(db, userId, { now = Date.now() } = {}) {
  const cutoff = new Date(now - HEART_RATE_RAW_DAYS * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z';
  const oldest = await db.prepare("SELECT MIN(sample_time) AS t FROM health_datapoints WHERE user_id = ? AND data_type = 'heart-rate' AND source_family = 'google-wearables' AND sample_time < ?").bind(userId, cutoff).first();
  const first = Date.parse(oldest?.t || '');
  if (!Number.isFinite(first)) return null;
  const from = new Date(Math.floor(first / WINDOW_MS) * WINDOW_MS).toISOString().replace('.000Z', 'Z');
  const to = new Date(Math.min(Date.parse(from) + WINDOW_MS, Date.parse(cutoff))).toISOString().replace('.000Z', 'Z');
  const window = "source_family = 'google-wearables' AND data_type = 'heart-rate' AND sample_time >= ? AND sample_time < ?";
  // A bucket already compacted (a late sample) is merged into, weighted by count.
  const [, deleted] = await db.batch([
    db.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time, end_time, value_numeric, value_unit, payload_json)
      SELECT user_id, source_family, '${HEART_RATE_BUCKET_TYPE}', 'hr5:' || b, ${iso('b')}, ${iso('b')}, ${iso(`b + ${BUCKET_SECONDS}`)}, ROUND(avg, 1), 'bpm', json_object('avg', ROUND(avg, 1), 'min', mn, 'max', mx, 'n', n)
      FROM (SELECT user_id, source_family, ${bucket} AS b, AVG(${bpm}) AS avg, MIN(${bpm}) AS mn, MAX(${bpm}) AS mx, COUNT(*) AS n
        FROM health_datapoints WHERE user_id = ? AND ${window} AND ${bpm} BETWEEN 20 AND 250 GROUP BY b) WHERE true
      ON CONFLICT (user_id, source_family, data_type, external_id) DO UPDATE SET
        value_numeric = ROUND((health_datapoints.value_numeric * json_extract(health_datapoints.payload_json, '$.n') + excluded.value_numeric * json_extract(excluded.payload_json, '$.n')) / (json_extract(health_datapoints.payload_json, '$.n') + json_extract(excluded.payload_json, '$.n')), 1),
        payload_json = json_object(
          'avg', ROUND((health_datapoints.value_numeric * json_extract(health_datapoints.payload_json, '$.n') + excluded.value_numeric * json_extract(excluded.payload_json, '$.n')) / (json_extract(health_datapoints.payload_json, '$.n') + json_extract(excluded.payload_json, '$.n')), 1),
          'min', MIN(json_extract(health_datapoints.payload_json, '$.min'), json_extract(excluded.payload_json, '$.min')),
          'max', MAX(json_extract(health_datapoints.payload_json, '$.max'), json_extract(excluded.payload_json, '$.max')),
          'n', json_extract(health_datapoints.payload_json, '$.n') + json_extract(excluded.payload_json, '$.n')),
        updated_at = CURRENT_TIMESTAMP`).bind(userId, from, to),
    db.prepare(`DELETE FROM health_datapoints WHERE user_id = ? AND ${window}`).bind(userId, from, to)
  ]);
  return { from, to, deleted: Number(deleted?.meta?.changes || 0) };
}
