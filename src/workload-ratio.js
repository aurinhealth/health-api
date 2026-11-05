// The acute:chronic workload ratio (ACWR) and Foster's training monotony and
// strain, from one daily load series per athlete.
//
// The daily load is the one CTL and ATL are built on (GET /app/api/fitness):
// - with Intervals.icu connected, its day load (ctlLoad, else atlLoad), which
//   already holds the workouts only the watch recorded (training-load.js
//   addLoads);
// - without it, the app's own load (training-load.js: TSS from power, hrTSS
//   from the watch's heart rate, session RPE × minutes for the gym), `load`.
// Days without a row or without a load count as rest days, 0.
//
// ACWR (Hulin et al. 2014, Gabbett 2016) here is the rolling-average variant,
// not the exponentially weighted one: the mean daily load of the last 7 days
// (acute, today included) over the mean of the last 28 days (chronic, the
// acute week included); with less history, the mean of the days since the first
// load, so 21 days of the same load are 1.0 and not 1.33 (the days before
// anything was recorded are no rest days). It is null with fewer than MIN_HISTORY_DAYS days since
// the first load on record (the 28-day mean is not representative yet) or
// with a chronic load of 0.
// It is shown only in words, the last 7 days against the usual 28 (Today
// audit D4, 2026-11-05): no ratio number, no bands, no "sweet spot" and no
// "risk", since the ratio predicts no injuries (Impellizzeri 2021,
// docs/methodology.md):
//   < 0.7 well below · 0.7–0.9 below · 0.9–1.15 usual · 1.15–1.5 above · > 1.5 well above
//
// Monotony (Foster 1998) is the mean daily load of the last 7 days over its
// standard deviation (population SD of the 7 days); null with fewer than 7
// days of history or no variation at all (SD 0, which includes a week of
// rest). Strain is the week's total load × monotony. Monotony above 2.0 is
// high: the same load day after day, the pattern Foster linked to illness
// and overtraining.
import { L, bilingual } from "./lang.js";

export const ACUTE_DAYS = 7;
export const CHRONIC_DAYS = 28;
export const SERIES_DAYS = 42;
export const MIN_HISTORY_DAYS = 21;
export const HIGH_MONOTONY = 2.0;

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length;
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

// The load of one fitness row (Intervals.icu or the app's own), or null.
export function rowLoad(row) {
  const v = num(row?.ctlLoad ?? row?.atlLoad ?? row?.load);
  return v != null && v >= 0 ? v : null;
}

// The daily loads of the `days` days up to `date` (oldest first, rest days 0)
// and how many days of history there are: from the first day with a load in
// `rows` to `date`, both included (0 without any load).
export function dailyLoadSeries(rows, date, days = SERIES_DAYS) {
  if (!isDate(date)) return { series: [], historyDays: 0 };
  const byDay = new Map();
  let first = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String(r?.id || r?.date || "").slice(0, 10);
    if (!isDate(id) || id > date) continue;
    const load = rowLoad(r);
    if (load == null) continue;
    byDay.set(id, (byDay.get(id) || 0) + load);
    if (load > 0 && (first == null || id < first)) first = id;
  }
  const series = Array.from({ length: days }, (_, i) => {
    const d = shift(date, i - days + 1);
    return { date: d, load: byDay.get(d) || 0 };
  });
  return { series, historyDays: first ? daysBetween(first, date) + 1 : 0 };
}

// The names of the metrics and the levels in the app language, for the
// coach's facts (trend-facts.js) and the "Proč?" lines (screen-texts.js).
export const WORKLOAD_LABELS = bilingual({
  acwr: "Posledních 7 dní vs. obvyklých 28",
  monotony: "Monotónnost tréninku (7 dní)",
  strain: "Tréninkový strain týdne",
  wellBelow: "výrazně pod obvyklou",
  below: "pod obvyklou",
  usual: "obvyklá",
  above: "nad obvyklou",
  wellAbove: "výrazně nad obvyklou"
}, {
  acwr: "Last 7 days vs your usual 28",
  monotony: "Training monotony (7 days)",
  strain: "Weekly training strain",
  wellBelow: "well below",
  below: "below",
  usual: "usual",
  above: "above",
  wellAbove: "well above"
});
export const LOAD_LEVELS = ["wellBelow", "below", "usual", "above", "wellAbove"];
export const loadLevelLabel = level => (LOAD_LEVELS.includes(level) ? WORKLOAD_LABELS[level] : null);

export function loadLevel(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return value < 0.7 ? "wellBelow" : value < 0.9 ? "below" : value <= 1.15 ? "usual" : value <= 1.5 ? "above" : "wellAbove";
}

// loads: daily loads, oldest first, the last one today.
export function acwr(loads, historyDays = loads?.length || 0) {
  const xs = (Array.isArray(loads) ? loads : []).map(v => num(v) || 0);
  if (xs.length < CHRONIC_DAYS) return { value: null, level: null, acute: null, chronic: null };
  const span = Math.min(CHRONIC_DAYS, Math.max(ACUTE_DAYS, historyDays));
  const acute = mean(xs.slice(-ACUTE_DAYS)), chronic = mean(xs.slice(-span));
  const value = historyDays >= MIN_HISTORY_DAYS && chronic > 0 ? round(acute / chronic, 2) : null;
  return { value, level: loadLevel(value), acute: round(acute, 1), chronic: round(chronic, 1) };
}

export function monotony(loads, historyDays = loads?.length || 0) {
  const xs = (Array.isArray(loads) ? loads : []).map(v => num(v) || 0).slice(-ACUTE_DAYS);
  if (xs.length < ACUTE_DAYS || historyDays < ACUTE_DAYS) return { value: null, strain: null, high: false };
  const m = mean(xs), sd = Math.sqrt(mean(xs.map(v => (v - m) ** 2)));
  // Float rounding leaves a tiny SD for equal decimal loads (7 × 33.3): that is no variation either.
  if (!(sd > 1e-9 * Math.max(1, m))) return { value: null, strain: null, high: false };
  const value = m / sd, total = xs.reduce((s, v) => s + v, 0);
  return { value: round(value, 2), strain: Math.round(total * value), high: value > HIGH_MONOTONY };
}

// Both from fitness rows (GET /app/api/fitness wellness) as of `date`.
export function workloadMetrics(rows, date) {
  const { series, historyDays } = dailyLoadSeries(rows, date);
  const loads = series.map(d => d.load);
  return { acwr: acwr(loads, historyDays), monotony: monotony(loads, historyDays), historyDays };
}

// A cautionary line for the deterministic coach when the last 7 days are well
// above the usual 28 or the week is monotonous, else null. In words, no ratio
// and no risk (Today audit D4).
export function workloadCaution(metrics) {
  const level = metrics?.acwr?.level, mono = metrics?.monotony?.value;
  const dec = (v, d) => L(String(round(v, d)).replace(".", ","), String(round(v, d)));
  const parts = [];
  if (level === "wellAbove") parts.push(L(
    "Posledních 7 dní bylo výrazně nad tvými obvyklými 28. Tento týden střídej těžší a lehčí dny.",
    "The last 7 days were well above your usual 28. Alternate harder and easier days this week."));
  if (mono != null && mono > HIGH_MONOTONY) parts.push(L(
    "Monotónnost tréninku je " + dec(mono, 2) + ": dny jsou si zátěží příliš podobné. Střídej těžší a lehčí dny a zařaď den volna.",
    "Training monotony is " + dec(mono, 2) + ": your days carry too similar a load. Alternate hard and easy days and add a rest day."));
  return parts.length ? parts.join(" ") : null;
}
