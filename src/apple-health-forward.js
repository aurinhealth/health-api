// Health data from other apps the iPhone writes to Apple Health (Zdroje dat →
// Apple Health → Aurin posílá → Zdravotní data → From your other apps):
// sleep, heart rate, resting heart rate, blood oxygen, breathing and steps
// that Google Health sent to Aurin. Only what a watch measured
// (source_family google-wearables), never what came from Apple Health, so
// nothing goes round in a circle. WHOOP's and Ultrahuman's data stay out:
// their API terms forbid passing it on. HRV stays out too: Google's is RMSSD,
// Apple's is SDNN, a different number.
//
// Google's terms let its data go elsewhere only as the user asks for it: the
// list is empty until the user said yes on the iPhone (consent:health@ in
// sync-destinations.js), and starts at the moment of that yes, or 14 days
// before it when the user also wanted the last two weeks (from:health@).
import { readSyncPrefs, healthAllowed, othersSince, OTHER_TYPES } from './sync-destinations.js';
import { pickBuckets } from './heart-rate-compaction.js';

const MAX_DAYS = 14;
const n = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const parse = row => { try { return JSON.parse(row.payload_json || '{}'); } catch { return {}; } };
// A daily value's own date ({year, month, day}) or the day its row starts.
const dayOf = (obj, row) => obj?.date?.year ? `${obj.date.year}-${String(obj.date.month).padStart(2, '0')}-${String(obj.date.day).padStart(2, '0')}` : String(row.start_time || row.sample_time || '').slice(0, 10) || null;
const STAGE = { DEEP: 'deep', REM: 'rem', LIGHT: 'core', AWAKE: 'awake' };

// The daily types: health_datapoints type → [list name, payload field, lowest, highest].
const DAILY = {
  restingHR: ['daily-resting-heart-rate', 'beatsPerMinute', 25, 140],
  spO2: ['daily-oxygen-saturation', 'percentage', 70, 100],
  respiration: ['daily-respiratory-rate', 'breathsPerMinute', 4, 40]
};

// GET /app/api/sync/forward/apple/health?days=2: what is due, by type.
export async function appleHealthForward(env, { days = 2, now = Date.now() } = {}) {
  const db = env.DB, userId = env.USER_ID ?? db.userId;
  const prefs = await readSyncPrefs(db, userId, 'apple');
  const types = OTHER_TYPES.filter(type => healthAllowed(prefs, type));
  const start = await othersSince(db, userId);
  if (!types.length || !start) return {};
  const floor = Math.max(Date.parse(start), now - Math.min(MAX_DAYS, Math.max(1, Number(days) || 2)) * 86400000);
  const since = new Date(floor).toISOString();
  const rows = (type, extra = '') => db.prepare(`SELECT data_type, external_id, sample_time, start_time, end_time, value_numeric, payload_json FROM health_datapoints
    WHERE user_id = ? AND source_family = 'google-wearables' AND data_type = ? AND COALESCE(start_time, sample_time) >= ? AND (record_role IS NULL OR record_role != 'duplicate') ${extra}
    ORDER BY COALESCE(start_time, sample_time) LIMIT 5000`).bind(userId, type, since).all().then(r => r.results || []).catch(() => []);
  const out = {};
  const want = new Set(types);
  if (want.has('sleep')) {
    out.sleep = [];
    for (const row of await rows('sleep')) {
      const p = parse(row), s = p.sleep || p, startTime = iso(row.start_time || s.interval?.startTime), endTime = iso(row.end_time || s.interval?.endTime);
      if (!startTime || !endTime || endTime <= startTime) continue;
      const stages = (s.stages || []).map(x => ({ type: STAGE[String(x.type || '').toUpperCase()], start: iso(x.startTime), end: iso(x.endTime) }))
        .filter(x => x.type && x.start && x.end && x.end > x.start);
      out.sleep.push({ key: startTime, start: startTime, end: endTime, stages });
    }
  }
  for (const [name, [type, field, low, high]] of Object.entries(DAILY)) {
    if (!want.has(name)) continue;
    out[name] = [];
    for (const row of await rows(type)) {
      const p = parse(row), camel = type.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), obj = p[camel] || p;
      const value = n(row.value_numeric) ?? n(obj[field]), date = dayOf(obj, row);
      if (value != null && value >= low && value <= high && date) out[name].push({ date, value: Math.round(value * 10) / 10 });
    }
  }
  if (want.has('steps')) {
    out.steps = [];
    for (const row of await rows('steps')) {
      const p = parse(row), obj = p.steps || p, value = n(row.value_numeric) ?? n(obj.count);
      const a = iso(row.start_time || obj.interval?.startTime), b = iso(row.end_time || obj.interval?.endTime);
      if (value > 0 && a && b && b > a) out.steps.push({ start: a, end: b, value: Math.round(value) });
    }
  }
  if (want.has('heartRate')) {
    // Five-minute averages: the samples, or the rows they were packed into (heart-rate-compaction.js).
    const [raw, packed] = await Promise.all([
      db.prepare(`SELECT (CAST(strftime('%s', sample_time) AS INTEGER) / 300) * 300 AS bucket, AVG(CAST(COALESCE(value_numeric, json_extract(payload_json, '$.heartRate.beatsPerMinute')) AS REAL)) AS avg, COUNT(*) AS n
        FROM health_datapoints WHERE user_id = ? AND source_family = 'google-wearables' AND data_type = 'heart-rate' AND sample_time >= ? GROUP BY bucket ORDER BY bucket LIMIT 5000`)
        .bind(userId, since).all().then(r => r.results || []).catch(() => []),
      db.prepare(`SELECT CAST(strftime('%s', sample_time) AS INTEGER) AS bucket, value_numeric AS avg, json_extract(payload_json, '$.n') AS n
        FROM health_datapoints WHERE user_id = ? AND source_family = 'google-wearables' AND data_type = 'heart-rate-5min' AND sample_time >= ? ORDER BY sample_time LIMIT 5000`)
        .bind(userId, since).all().then(r => r.results || []).catch(() => [])
    ]);
    out.heartRate = pickBuckets(raw, packed).map(b => ({ start: new Date(Number(b.bucket) * 1000).toISOString(), value: Math.round(n(b.avg) * 10) / 10 }))
      .filter(b => b.value >= 25 && b.value <= 230);
  }
  return out;
}
