// Deník → "Co na tebe působí": how each journal item goes with the next
// morning. Pure: the routes (routes-journal.js) load the answers, the day's
// data and the mornings.
//
// - The impact of an item on a metric is the mean of the next morning's value
//   after ✓ days minus its mean after ✕ days, divided by the ✕ mean, in whole
//   percent. Resting heart rate is better lower, so its sign is turned: a
//   positive number always means "helps".
// - Only the last 90 days count, and an impact is shown only with at least
//   5 ✓ and 5 ✕ days that have the morning's value. Days of illness are left out.
// - Quantity items also get a threshold: at or above a cut against below it,
//   the cut with the largest effect where both sides have at least 5 days.
import { readinessFor, readinessRows, primaryNights } from "./readiness.js";

export const METRICS = ["readiness", "hrv", "sleep", "rhr"];
// The detail compares these too.
export const DETAIL_METRICS = ["readiness", "hrv", "rhr", "sleep", "deep"];
export const MIN_DAYS = 5;
export const WINDOW_DAYS = 90;
// A "Nový objev" needs at least this effect (percent, either way).
export const DISCOVERY_PERCENT = 5;
const LOWER_IS_BETTER = new Set(["rhr"]);

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
export const shiftDay = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const positive = v => (num(v) > 0 ? num(v) : null);

// "21:15" → minutes after noon (21:15 → 555, 00:30 → 750), so evening and
// night times sort in the order they happen.
export function timeLevel(time) {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2]) - 720 + 1440) % 1440;
}
export function levelTime(level) {
  const m = (Math.round(level) + 720) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

// The morning values of each day from `from` to `to`: readiness (the body's
// own score, without the check-in), HRV, resting heart rate, sleep and deep
// sleep in minutes. Inputs as /app/api/health loads them.
export function morningMetrics({ from, to, health = {}, fitness = {}, sleep = {}, profile = {} }) {
  const google = Array.isArray(health?.wellness) ? health.wellness : [];
  const intervals = Array.isArray(fitness?.wellness) ? fitness.wellness : [];
  const rows = readinessRows(google, intervals, to);
  const sessions = Array.isArray(sleep?.sessions) ? sleep.sessions : [];
  const nights = primaryNights(sessions);
  const byId = new Map(rows.map(r => [r.id, r]));
  const out = {};
  for (let d = from; d <= to; d = shiftDay(d, 1)) {
    const row = byId.get(d) || {}, night = nights.get(d) || null;
    const values = {
      readiness: num(readinessFor({ date: d, rows, sessions, profile: profile || {} }).score),
      hrv: positive(row.hrv),
      rhr: positive(row.restingHR),
      sleep: positive(night?.durationMin),
      deep: positive(night?.stages?.DEEP)
    };
    if (Object.values(values).some(v => v != null)) out[d] = values;
  }
  return out;
}

// One day of an item: yes (true ✓, false ✕, null unanswered) and level (the
// amount, the time as timeLevel or the 1–5 scale; 0 on ✕ for amounts).
// The athlete's own answer wins over the day's data.
export function dayState(item, entry, auto) {
  if (entry && entry.answer != null) {
    if (Number(entry.answer) === 0) return { yes: false, level: item.type === "amount" ? 0 : null };
    if (item.type === "amount") { const a = num(entry.amount); return { yes: a == null || a > 0, level: a }; }
    if (item.type === "scale") { const a = num(entry.amount); return a == null ? { yes: null, level: null } : { yes: a >= 4, level: a }; }
    if (item.type === "time") { const t = timeLevel(entry.time); return { yes: t == null || !item.late || t >= timeLevel(item.late), level: t }; }
    return { yes: true, level: null };
  }
  if (!auto) return { yes: null, level: null };
  if (auto.fixed) return { yes: !!auto.yes, level: item.type === "amount" ? num(auto.amount) : null };
  if (item.type === "amount") { const a = num(auto.amount); return a == null ? { yes: null, level: null } : { yes: a > 0, level: a }; }
  if (item.type === "time") { const t = timeLevel(auto.time); return t == null ? { yes: null, level: null } : { yes: !item.late || t >= timeLevel(item.late), level: t }; }
  return auto.yes == null ? { yes: null, level: null } : { yes: !!auto.yes, level: null };
}

// ✓ against ✕ in percent, "helps" positive; null without a ✕ mean.
export function percentEffect(yesMean, noMean, metric) {
  if (yesMean == null || !noMean) return null;
  const raw = (yesMean - noMean) / noMean * 100, signed = LOWER_IS_BETTER.has(metric) ? -raw : raw;
  // Half away from zero, the same both ways: −12.5 → −13 like +12.5 → +13.
  return Math.sign(signed) * Math.round(Math.abs(signed)) + 0;
}

// The next morning's values after the item's ✓ and ✕ days. `days` are
// {date, yes} (journal days), `mornings` keyed by the morning's date.
function split(days, metric, mornings, excluded) {
  const yes = [], no = [];
  for (const d of days) {
    if (d.yes == null || excluded.has(d.date)) continue;
    const v = num(mornings[shiftDay(d.date, 1)]?.[metric]);
    if (v == null) continue;
    (d.yes ? yes : no).push(v);
  }
  return { yes, no };
}

export function impactOf(days, metric, mornings, { excluded = new Set() } = {}) {
  const { yes, no } = split(days, metric, mornings, excluded);
  const enough = yes.length >= MIN_DAYS && no.length >= MIN_DAYS;
  return { yes: yes.length, no: no.length, effect: enough ? percentEffect(mean(yes), mean(no), metric) : null, yesMean: mean(yes), noMean: mean(no) };
}

// The cut of a quantity (or time) item with the largest effect, both sides
// with at least 5 mornings: {cut, effect, above, below} or null.
export function thresholdOf(days, metric, mornings, { excluded = new Set() } = {}) {
  const points = [];
  for (const d of days) {
    if (d.level == null || excluded.has(d.date)) continue;
    const v = num(mornings[shiftDay(d.date, 1)]?.[metric]);
    if (v != null) points.push({ level: d.level, value: v });
  }
  const cuts = [...new Set(points.map(p => p.level))].sort((a, b) => a - b).slice(1);
  let best = null;
  for (const cut of cuts) {
    const above = points.filter(p => p.level >= cut).map(p => p.value), below = points.filter(p => p.level < cut).map(p => p.value);
    if (above.length < MIN_DAYS || below.length < MIN_DAYS) continue;
    const effect = percentEffect(mean(above), mean(below), metric);
    if (effect != null && (!best || Math.abs(effect) > Math.abs(best.effect))) best = { cut, effect, above: above.length, below: below.length };
  }
  return best;
}

// The impact screen for one metric. `series` is [{key, days}] in the order to
// keep among equals. ranked: effect from most helpful to most harmful;
// waiting: items with answers but not yet 5 ✓ and 5 ✕ mornings.
export function rankImpacts(series, metric, mornings, { excluded = new Set() } = {}) {
  const ranked = [], waiting = [];
  for (const s of series) {
    const r = impactOf(s.days, metric, mornings, { excluded });
    if (r.effect != null) ranked.push({ key: s.key, effect: r.effect, yes: r.yes, no: r.no });
    else if (r.yes + r.no > 0) waiting.push({ key: s.key, yes: r.yes, no: r.no, needYes: Math.max(0, MIN_DAYS - r.yes), needNo: Math.max(0, MIN_DAYS - r.no) });
  }
  ranked.sort((a, b) => b.effect - a.effect);
  waiting.sort((a, b) => (a.needYes + a.needNo) - (b.needYes + b.needNo));
  return { ranked, waiting };
}

// The first item (largest effect either way) that crossed the evidence line
// with at least 5 % and was not announced before.
export function newDiscovery(ranked, announced = []) {
  const seen = new Set(announced);
  return ranked.filter(r => Math.abs(r.effect) >= DISCOVERY_PERCENT && !seen.has(r.key))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0] || null;
}

// One item in detail: the next-morning metrics with and without (means when
// both sides have 5 mornings), and the chosen metric over the last 30 mornings
// with the ✓ days marked.
export function itemDetail(days, metric, mornings, { today, excluded = new Set() } = {}) {
  const compare = DETAIL_METRICS.map(m => {
    const { yes, no } = split(days, m, mornings, excluded);
    const enough = yes.length >= MIN_DAYS && no.length >= MIN_DAYS;
    return { metric: m, yes: enough ? mean(yes) : null, no: enough ? mean(no) : null };
  });
  const byDate = new Map(days.map(d => [d.date, d.yes]));
  const chart = [];
  for (let i = 29; i >= 0; i--) {
    const morning = shiftDay(today, -i), value = num(mornings[morning]?.[metric]);
    if (value == null) continue;
    const day = shiftDay(morning, -1);
    chart.push({ date: morning, value, yes: excluded.has(day) ? null : byDate.get(day) ?? null });
  }
  return { impact: impactOf(days, metric, mornings, { excluded }), compare, chart };
}
