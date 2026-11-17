// The rows GET /app/api/health/series reads for one metric (health-series.js).
//
// Reads (D1 rows) per open, kept two minutes (a sync bumps the cache version): a daily metric is one row a day
// and source (the daily values' (user, source, type, day) index), about 160
// for 30 days and 425 for a year with one watch, twice that with two. Steps
// come from the hourly summary (hour-summary.js), up to 24 rows a day and
// source: about 3,800 for 30 days, 10,200 for a year; only the days the
// summary already covers (it fills back 40 days and then grows).
import { googleHealthSummary } from "./google-dashboard.js";
import { summaryFrom } from "./hour-summary.js";
import { readinessRows } from "./readiness.js";
import { SERIES_METRICS, loadDays } from "./health-series.js";

const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const DAILY_SOURCES = ["google-wearables", "apple-health", "ultrahuman", "whoop"];
// The expression of the (user, source, type, day) index exactly, so the window seeks instead of reading every day of the type.
const recent = "COALESCE(sample_time,end_time,start_time)";

// Merged wellness rows (as readiness reads them) for `metric` from
// loadDays(range) before `date`. `intervals` is Intervals.icu wellness the
// caller already has (90 days, /app/api/fitness), merged in for the daily metrics.
export async function seriesRows(db, userId, { metric, range, date, intervals = [] }) {
  const m = SERIES_METRICS[metric], from = shift(date, -loadDays(range)), end = shift(date, 1);
  if (m.steps) {
    const ready = await summaryFrom(db, userId).catch(() => null);
    if (!ready) return [];
    // The first covered UTC day can be a part of a local day: it starts a day later.
    const start = ready > from ? shift(ready, 1) : from;
    // Hours are UTC: a day more at the end keeps the evening of a local day west of UTC (later local days are cut below).
    const hours = (await db.prepare("SELECT hour, source_family, steps FROM health_hour_summary WHERE user_id = ? AND hour >= ? AND hour < ? AND steps IS NOT NULL").bind(userId, start, shift(end, 1)).all()).results || [];
    const rows = hours.map(h => ({ data_type: "steps", source_family: h.source_family, sample_time: null, start_time: h.hour + ":00:00Z", end_time: null, value_numeric: Number(h.steps), payload_json: "{}" }));
    return googleHealthSummary(rows, date).wellness.filter(r => r.id >= start && r.id <= date && r.steps != null);
  }
  const rows = (await db.prepare(`SELECT data_type,source_family,sample_time,start_time,end_time,value_numeric,payload_json FROM health_datapoints WHERE user_id = ? AND source_family IN (${DAILY_SOURCES.map(() => "?").join(",")}) AND data_type IN (${m.types.map(() => "?").join(",")}) AND record_role='primary' AND ${recent}>=? AND ${recent}<? ORDER BY id LIMIT 40000`).bind(userId, ...DAILY_SOURCES, ...m.types, from, end).all()).results || [];
  return readinessRows(googleHealthSummary(rows, date).wellness, (Array.isArray(intervals) ? intervals : []).filter(r => r && r.id >= from), date);
}
