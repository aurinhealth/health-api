import { activityTelemetryEnergy } from './activity-energy-check.js';

// A workout typed in afterwards (Zapsat trénink): the heart rate the watch
// recorded between its start and end, and the calories. Google Health keeps
// every sample for two weeks and 5-minute rows after (heart-rate-compaction.js);
// the phone reads Apple Health itself and sends what it found.
const bpm = "CAST(COALESCE(value_numeric, json_extract(payload_json, '$.heartRate.beatsPerMinute')) AS REAL)";
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');

export async function heartRateWindow(db, userId, { start, end, weightKg = null, profile = {} }) {
  const from = Date.parse(start), to = Date.parse(end);
  if (!(to > from && to - from <= 12 * 3600000)) return null;
  const between = [userId, iso(from), iso(to)];
  const [raw, buckets, energy] = await Promise.all([
    db.prepare(`SELECT AVG(${bpm}) AS avg, MAX(${bpm}) AS max, COUNT(*) AS n FROM health_datapoints
      WHERE user_id=? AND data_type='heart-rate' AND sample_time>=? AND sample_time<? AND ${bpm} BETWEEN 20 AND 250`).bind(...between).first().catch(() => null),
    db.prepare(`SELECT value_numeric AS avg, json_extract(payload_json, '$.max') AS max, json_extract(payload_json, '$.n') AS n FROM health_datapoints
      WHERE user_id=? AND data_type='heart-rate-5min' AND sample_time>=? AND sample_time<?`).bind(...between).all().then(r => r.results || []).catch(() => []),
    db.prepare(`SELECT start_time,end_time,value_numeric FROM health_datapoints WHERE user_id=? AND source_family='google-wearables' AND data_type='active-energy-burned'
      AND end_time>? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time`).bind(...between).all().then(r => r.results || []).catch(() => [])
  ]);
  const parts = [...(Number(raw?.n) > 0 ? [raw] : []), ...buckets].map(r => ({ avg: Number(r.avg), max: Number(r.max), n: Number(r.n) || 1 })).filter(r => r.avg > 20 && r.avg < 250);
  const count = parts.reduce((s, r) => s + r.n, 0);
  const avgHr = count ? Math.round(parts.reduce((s, r) => s + r.avg * r.n, 0) / count) : null;
  const maxHr = parts.length ? Math.round(Math.max(...parts.map(r => r.max || r.avg))) : null;
  const measured = activityTelemetryEnergy({ start: iso(from), end: iso(to) }, energy);
  const minutes = (to - from) / 60000;
  const kcal = measured?.kcal ?? heartRateKcal({ avgHr, minutes, weightKg, age: profile.age, sex: profile.sex });
  return { avgHr, maxHr, samples: count, kcal, kcalSource: measured ? 'energy' : kcal != null ? 'heart-rate' : null };
}

// Active calories from the average heart rate (Keytel et al. 2005, J Sports
// Sci 23:289), less the resting burn of about 1 kcal per kg and hour. Without
// weight or a plausible exercise heart rate there is no estimate.
export function heartRateKcal({ avgHr, minutes, weightKg, age, sex }) {
  const hr = Number(avgHr), m = Number(minutes), w = Number(weightKg), a = Number(age) > 0 ? Number(age) : 35;
  if (!(hr >= 80 && hr < 230 && m > 0 && w >= 30 && w <= 300)) return null;
  const perMinute = sex === 'female' ? (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * a) / 4.184 : (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * a) / 4.184;
  return Math.max(0, Math.round((perMinute - w / 60) * m));
}
