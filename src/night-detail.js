// Last night in detail for the morning card: the stage timeline (hypnogram),
// heart rate in 5-minute buckets with its spikes, HRV through the night and
// the previous nights for comparison, with their average heart rate. Reads
// only the signed-in user's rows.
import { sleepSessionFromRow, joinSplitNights } from "./sleep-sessions.js";
import { localDateTime } from "./user-time.js";

const n = v => v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
const ms = v => new Date(v).getTime();
const shift = (date, days) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
// Google's nights carry the clock offset the watch had ("7200s"); Apple's
// (apple-health.js) have none, so null stands for the user's own zone.
const offsetMin = v => { const m = /^(-?\d+)s$/.exec(String(v || "")); return m ? Number(m[1]) / 60 : null; };
// Minutes after local midnight, wrapped so that a bedtime after midnight stays next to one before it.
const clockMin = (iso, offset) => {
  const local = offset == null ? localDateTime(iso) : "", d = new Date(ms(iso) + (offset || 0) * 60000);
  const m = offset == null ? Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)) : d.getUTCHours() * 60 + d.getUTCMinutes();
  return m < 12 * 60 ? m + 24 * 60 : m;
};

function parsePayload(row) { try { const p = JSON.parse(row.payload_json || "{}"); return p.sleep || p; } catch { return {}; } }

// Consecutive stages of the same type are one block; minutes are counted from the start of the night.
export function nightSegments(stages, start) {
  const t0 = ms(start), out = [];
  for (const s of [...(stages || [])].sort((a, b) => ms(a.startTime) - ms(b.startTime))) {
    const a = (ms(s.startTime) - t0) / 60000, b = (ms(s.endTime) - t0) / 60000, type = String(s.type || "").toUpperCase();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || !["DEEP", "REM", "LIGHT", "AWAKE"].includes(type)) continue;
    const last = out.at(-1);
    if (last && last.type === type && Math.abs(last.e - a) < 0.5) last.e = Math.round(b);
    else out.push({ type, s: Math.round(a), e: Math.round(b) });
  }
  return out;
}

// Wake-ups are the awake blocks between falling asleep and the final wake-up.
export function nightStats(segments, hr = [], hrv = []) {
  const asleep = segments.filter(x => x.type !== "AWAKE");
  if (!asleep.length) return null;
  const onset = asleep[0].s, end = asleep.at(-1).e;
  const awake = segments.filter(x => x.type === "AWAKE" && x.s >= onset && x.e <= end);
  const avgs = hr.map(b => b.avg).filter(v => v != null), night = mean(avgs);
  const low = hr.filter(b => b.avg != null).sort((a, b) => a.avg - b.avg)[0] || null;
  // A spike: a 5-minute bucket whose peak is at least 15 bpm above the night's average.
  const spikes = night == null ? [] : hr.filter(b => b.max != null && b.max - night >= 15).map(b => ({ m: b.m, max: b.max }));
  const rmssd = hrv.map(x => x.ms).filter(v => v != null);
  return {
    latencyMin: onset, wakeups: awake.length, wasoMin: Math.round(awake.reduce((s, x) => s + x.e - x.s, 0)),
    avgHr: night == null ? null : Math.round(night), lowHr: low ? Math.round(low.avg) : null, lowHrAt: low ? low.m : null, spikes,
    hrv: rmssd.length ? Math.round(mean(rmssd)) : null, hrvLow: rmssd.length ? Math.round(Math.min(...rmssd)) : null, hrvHigh: rmssd.length ? Math.round(Math.max(...rmssd)) : null
  };
}

export async function nightDetail(db, { date }) {
  const rows = (await db.prepare(`SELECT external_id, source_family, start_time, end_time, payload_json FROM health_datapoints
    WHERE user_id=? AND source_family IN ('google-wearables','apple-health','ultrahuman','whoop') AND data_type='sleep' AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')
    ORDER BY start_time DESC LIMIT 120`).bind(db.userId, shift(date, -16), date + "T23:59:59Z").all()).results || [];
  const seen = new Set(), sessions = [];
  for (const row of rows) {
    const s = sleepSessionFromRow(row), key = s.startTime + "|" + s.endTime;
    if (!s.startTime || !s.endTime || seen.has(key)) continue;
    seen.add(key);
    sessions.push({ ...s, payload: parsePayload(row) });
  }
  // The rest of a night after a wake-up in the morning belongs to it.
  const nights = joinSplitNights(sessions).filter(s => !s.nap && n(s.durationMin) >= 180)
    .map(s => ({ ...s, offset: offsetMin(s.payload.interval?.startUtcOffset) }));
  // One main night per day: the longest.
  const byDay = new Map();
  for (const x of nights) if (!byDay.has(x.date) || x.durationMin > byDay.get(x.date).durationMin) byDay.set(x.date, x);
  const last = byDay.get(date);
  const history = [...byDay.values()].filter(x => x.date < date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)
    .map(x => ({ date: x.date, asleepMin: x.durationMin, inBedMin: x.timeInBedMin, stages: x.stages, bedClock: clockMin(x.startTime, x.offset), wakeClock: clockMin(x.endTime, x.offset) }));
  if (!last) return { status: "ok", date, night: null, history };
  const between = [db.userId, last.startTime, last.endTime];
  // The 13 nights before it, for the average heart rate night by night.
  const earlier = [...byDay.values()].filter(x => x.date < date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 13);
  const [hrRows, earlierHr, hrvRows] = await Promise.all([
    heartRateBuckets(db, [last]),
    earlier.length ? heartRateBuckets(db, earlier) : [],
    db.prepare(`SELECT sample_time, json_extract(payload_json, '$.heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds') AS rmssd
      FROM health_datapoints WHERE user_id=? AND data_type='heart-rate-variability' AND sample_time>=? AND sample_time<?
      ORDER BY sample_time LIMIT 400`).bind(...between).all().then(r => r.results || []).catch(() => [])
  ]);
  const t0 = ms(last.startTime), round = v => v == null ? null : Math.round(v * 10) / 10;
  const hr = hrRows.map(r => ({ m: Math.round((n(r.bucket) * 1000 - t0) / 60000), avg: round(n(r.avg)), min: n(r.min), max: n(r.max) })).filter(b => b.avg != null && b.avg > 20 && b.avg < 220);
  const hrv = hrvRows.map(r => ({ m: Math.round((ms(r.sample_time) - t0) / 60000), ms: round(n(r.rmssd)) })).filter(x => x.ms != null && x.ms > 0 && x.ms < 300);
  const segments = nightSegments(last.payload.stages || last.payload.sleepStages, last.startTime);
  const nightHr = x => {
    const a = ms(x.startTime) / 1000, b = ms(x.endTime) / 1000;
    const avgs = earlierHr.filter(r => n(r.bucket) >= a && n(r.bucket) < b).map(r => n(r.avg)).filter(v => v != null && v > 20 && v < 220);
    return avgs.length >= 12 ? Math.round(mean(avgs)) : null;
  };
  const stats = nightStats(segments, hr, hrv);
  const hrNights = [...earlier.map(x => ({ date: x.date, avgHr: nightHr(x) })).reverse(), { date, avgHr: stats?.avgHr ?? null }].filter(x => x.avgHr != null);
  const usual = key => mean(history.map(h => n(h[key])).filter(v => v != null));
  const usualStage = key => mean(history.map(h => n(h.stages?.[key])).filter(v => v != null));
  return {
    status: "ok", date, history,
    night: {
      start: last.startTime, end: last.endTime, offset: last.offset, inBedMin: last.timeInBedMin, asleepMin: last.durationMin, stages: last.stages,
      bedClock: clockMin(last.startTime, last.offset), wakeClock: clockMin(last.endTime, last.offset),
      segments, hr, hrv, stats, hrNights,
      usual: { asleepMin: usual("asleepMin"), bedClock: usual("bedClock"), wakeClock: usual("wakeClock"), deep: usualStage("DEEP"), rem: usualStage("REM"), nights: history.length }
    }
  };
}

// Heart rate in 5-minute buckets within the given nights: the raw samples, and
// for nights older than two weeks the 5-minute rows they were compacted into
// (heart-rate-compaction.js). A raw bucket wins over a compacted one.
async function heartRateBuckets(db, nights) {
  const within = nights.map(() => "(sample_time>=? AND sample_time<?)").join(" OR ");
  // The outer range keeps the scan on the index; the windows pick the nights in it.
  const from = nights.map(x => x.startTime).sort()[0], to = nights.map(x => x.endTime).sort().at(-1);
  const args = [db.userId, from, to, ...nights.flatMap(x => [x.startTime, x.endTime])];
  const [raw, compact] = await Promise.all([
    db.prepare(`SELECT (CAST(strftime('%s', sample_time) AS INTEGER) / 300) * 300 AS bucket,
        AVG(CAST(json_extract(payload_json, '$.heartRate.beatsPerMinute') AS REAL)) AS avg,
        MIN(CAST(json_extract(payload_json, '$.heartRate.beatsPerMinute') AS REAL)) AS min,
        MAX(CAST(json_extract(payload_json, '$.heartRate.beatsPerMinute') AS REAL)) AS max
      FROM health_datapoints WHERE user_id=? AND data_type='heart-rate' AND sample_time>=? AND sample_time<? AND (${within})
      GROUP BY bucket ORDER BY bucket`).bind(...args).all().then(r => r.results || []).catch(() => []),
    db.prepare(`SELECT CAST(strftime('%s', sample_time) AS INTEGER) AS bucket, value_numeric AS avg,
        json_extract(payload_json, '$.min') AS min, json_extract(payload_json, '$.max') AS max
      FROM health_datapoints WHERE user_id=? AND data_type='heart-rate-5min' AND sample_time>=? AND sample_time<? AND (${within})
      ORDER BY sample_time`).bind(...args).all().then(r => r.results || []).catch(() => [])
  ]);
  const buckets = new Map(compact.map(r => [n(r.bucket), r]));
  for (const r of raw) buckets.set(n(r.bucket), r);
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}
