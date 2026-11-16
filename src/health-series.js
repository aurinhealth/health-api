// Health detail charts (GET /app/api/health/series, DATA-6): one metric over
// 30 days, 3, 6 or 12 months, each point with the user's usual band and a state
// worked out here, so Today, Health and the widgets never judge a value
// differently. Pure: the route loads the rows.
//
// The band is the personal normal range the readiness already uses: the mean
// ± 1 SD of the 60 days before the point (recovery-model.js; HRV and resting
// heart rate exactly as readiness weighs them, through recoveryReadiness). The
// state counts SDs from the mean as the readiness score does (one SD on the bad
// side 60, two 40, recoveryComponentScore) and as a raised breathing rate or
// skin temperature is flagged (2 SD): within 1 SD "within", up to 2 SD
// "slightly", beyond "far". No new thresholds.
//
// Over 90 days the points are weekly averages (Monday to Sunday). HRV comes
// from one source, the one of the newest morning (as /app/api/health), and
// `sources` says which source each stretch of days came from ("From WHOOP
// until Mar 3"). Readiness, Form, Fitness and Fatigue are not here: they have
// no usual range (SCI-4, SCI-5).
import { personalBaseline, recoveryReadiness } from "./recovery-model.js";

export const SERIES_RANGES = { "30d": 30, "3m": 91, "6m": 182, "1y": 365 };
// key: the merged wellness row's field (google-dashboard.js), types: the
// health_datapoints rows it comes from, digits: rounding as /app/api/health.
export const SERIES_METRICS = {
  hrv: { key: "hrv", types: ["daily-heart-rate-variability"], digits: 0 },
  restingHR: { key: "restingHR", types: ["daily-resting-heart-rate"], digits: 0 },
  respiration: { key: "respiration", types: ["daily-respiratory-rate"], digits: 1, sdFloor: 0.3 },
  oxygen: { key: "spO2", types: ["daily-oxygen-saturation"], digits: 1 },
  walkingHR: { key: "walkingHR", types: ["daily-walking-heart-rate"], digits: 0 },
  hrRecovery: { key: "hrRecovery", types: ["daily-heart-rate-recovery"], digits: 0 },
  steps: { key: "steps", steps: true, digits: 0 }
};
// Days of rows before the range the bands and the 90-day change need.
export const BASELINE_DAYS = 60, CHANGE_DAYS = 90;
export const WEEKLY_FROM_DAYS = 91;
export const loadDays = range => Math.max(SERIES_RANGES[range], CHANGE_DAYS + 7) + BASELINE_DAYS;

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// The state of a value `z` SDs from the user's mean.
export function bandState(z) {
  if (z == null || !Number.isFinite(z)) return null;
  const a = Math.abs(z);
  return a <= 1 ? "within" : a <= 2 ? "slightly" : "far";
}
const side = z => (z == null || Math.abs(z) <= 1 ? null : z > 0 ? "above" : "below");

// HRV from the source of the newest morning: a day of another source counts by
// its value in hrvBySource, else not at all (as /app/api/health).
function oneSourceHrv(rows, date) {
  const newest = rows.filter(r => r.id <= date && num(r.hrv) > 0).reduce((a, r) => (!a || r.id > a.id ? r : a), null);
  const source = newest?.hrvSource || "";
  return { source, rows: rows.map(r => (r.hrvSource || "") === source ? r : { ...r, hrv: r.hrvBySource?.[source] ?? null, hrvSource: source }) };
}

// One day's value with its band and z, or null.
function pointOn(rows, d, metric) {
  const m = SERIES_METRICS[metric], row = rows.find(r => r.id === d);
  const value = num(row?.[m.key]);
  if (value == null || (metric !== "steps" && value <= 0) || value < 0) return null;
  if (metric === "hrv" || metric === "restingHR") {
    const c = recoveryReadiness({ rows, date: d }).components?.[metric];
    if (!c) return { date: d, value, low: null, high: null, z: null };
    return { date: d, value, low: c.low, high: c.high, z: c.z };
  }
  const b = personalBaseline(rows, d, m.key);
  const sd = b.sd == null ? null : Math.max(b.sd, m.sdFloor || 0);
  if (b.mean == null || !(sd > 0)) return { date: d, value, low: null, high: null, z: null };
  return { date: d, value, low: b.mean - sd, high: b.mean + sd, z: (value - b.mean) / sd };
}

const shape = (p, digits) => ({
  date: p.date, value: round(p.value, digits),
  low: p.low == null ? null : round(p.low, digits), high: p.high == null ? null : round(p.high, digits),
  state: bandState(p.z), ...(side(p.z) ? { side: side(p.z) } : {})
});

// Monday of the week of `d`.
const monday = d => shift(d, -((new Date(Date.parse(d + "T12:00:00Z")).getUTCDay() + 6) % 7));

// The latest day's state of a metric from rows already loaded (Health and Today use it for their cards).
export function latestState(rows, date, metric) {
  const list = metric === "hrv" ? oneSourceHrv(rows, date).rows : rows;
  const last = list.filter(r => r.id <= date && num(r[SERIES_METRICS[metric].key]) > 0).reduce((a, r) => (!a || r.id > a.id ? r : a), null);
  if (!last) return null;
  const p = pointOn(list, last.id, metric);
  return p ? { date: p.date, state: bandState(p.z), ...(side(p.z) ? { side: side(p.z) } : {}) } : null;
}

// rows: merged wellness rows (readinessRows) reaching loadDays(range) back.
export function buildHealthSeries({ metric, range, date, rows = [] }) {
  const m = SERIES_METRICS[metric], days = SERIES_RANGES[range];
  if (!m || !days) return null;
  let list = (Array.isArray(rows) ? rows : []).filter(r => r && r.id && r.id <= date);
  let sources = null;
  if (metric === "hrv") {
    const original = list;
    list = oneSourceHrv(list, date).rows;
    // Which source each stretch of the shown days was measured by.
    sources = [];
    for (const r of original.filter(r => r.id > shift(date, -days) && num(r.hrv) > 0).sort((a, b) => a.id.localeCompare(b.id))) {
      const s = (r.hrvSource || "").split(":")[0] || null, last = sources.at(-1);
      if (last && last.source === s) last.to = r.id; else sources.push({ source: s, from: r.id, to: r.id });
    }
  }
  const dates = Array.from({ length: days }, (_, i) => shift(date, i - days + 1));
  // Steps of today are a running total: today's point is shown, but without a
  // band or state, and the latest state and the change come from finished days.
  const partial = m.steps ? date : null;
  const daily = dates.map(d => pointOn(list, d, metric)).filter(Boolean).map(p => (p.date === partial ? { ...p, low: null, high: null, z: null } : p));
  let points;
  if (days < WEEKLY_FROM_DAYS) points = daily.map(p => shape(p, m.digits));
  else {
    // Weekly: the average value, band and distance from the mean of the week's days.
    const weeks = new Map();
    for (const p of daily) { const w = monday(p.date); (weeks.get(w) || weeks.set(w, []).get(w)).push(p); }
    points = [...weeks].map(([w, ps]) => {
      const banded = ps.filter(p => p.z != null);
      return shape({ date: w, value: mean(ps.map(p => p.value)), low: banded.length ? mean(banded.map(p => p.low)) : null, high: banded.length ? mean(banded.map(p => p.high)) : null, z: banded.length ? mean(banded.map(p => p.z)) : null }, m.digits);
    });
  }
  // The change over 90 days: the last 7 days' average against the 7 days 90 days before (as weight's 30-day change).
  const valueOf = d => { const v = num(list.find(r => r.id === d)?.[m.key]); return v != null && (metric === "steps" ? v >= 0 : v > 0) ? v : null; };
  const week = to => mean(Array.from({ length: 7 }, (_, i) => valueOf(shift(to, -i))).filter(v => v != null));
  const last = partial ? shift(date, -1) : date;
  const now = week(last), before = week(shift(last, -CHANGE_DAYS));
  const latest = daily.filter(p => p.date !== partial).at(-1);
  return {
    status: "ok", metric, range, date,
    weekly: days >= WEEKLY_FROM_DAYS,
    latest: latest ? shape(latest, m.digits) : null,
    change90: now != null && before != null ? round(now - before, m.digits) : null,
    points,
    ...(sources ? { sources } : {})
  };
}
