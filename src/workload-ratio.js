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
// acute week included). It is null with fewer than MIN_HISTORY_DAYS days since
// the first load on record (the 28-day mean is not representative yet) or
// with a chronic load of 0.
//   < 0.8 low · 0.8–1.3 sweet spot · 1.3–1.5 elevated · > 1.5 high
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

// The names of the metrics and the ACWR zones in the app language, for the
// coach's facts (trend-facts.js) and the "Proč?" lines (screen-texts.js).
export const WORKLOAD_LABELS = bilingual({
  acwr: "Poměr akutní a chronické zátěže",
  monotony: "Monotónnost tréninku (7 dní)",
  strain: "Tréninkový strain týdne",
  low: "nízká zátěž",
  sweetSpot: "optimální pásmo",
  elevated: "zvýšená zátěž",
  high: "vysoká zátěž, riziko přetížení"
}, {
  acwr: "Acute:chronic workload ratio",
  monotony: "Training monotony (7 days)",
  strain: "Weekly training strain",
  low: "low load",
  sweetSpot: "sweet spot",
  elevated: "elevated load",
  high: "high load, overload risk"
});
export const acwrZoneLabel = zone => (["low", "sweetSpot", "elevated", "high"].includes(zone) ? WORKLOAD_LABELS[zone] : null);

export function acwrZone(value) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < 0.8) return "low";
  if (value <= 1.3) return "sweetSpot";
  if (value <= 1.5) return "elevated";
  return "high";
}

// loads: daily loads, oldest first, the last one today.
export function acwr(loads, historyDays = loads?.length || 0) {
  const xs = (Array.isArray(loads) ? loads : []).map(v => num(v) || 0);
  if (xs.length < CHRONIC_DAYS) return { value: null, zone: null, acute: null, chronic: null };
  const acute = mean(xs.slice(-ACUTE_DAYS)), chronic = mean(xs.slice(-CHRONIC_DAYS));
  const value = historyDays >= MIN_HISTORY_DAYS && chronic > 0 ? round(acute / chronic, 2) : null;
  return { value, zone: acwrZone(value), acute: round(acute, 1), chronic: round(chronic, 1) };
}

export function monotony(loads, historyDays = loads?.length || 0) {
  const xs = (Array.isArray(loads) ? loads : []).map(v => num(v) || 0).slice(-ACUTE_DAYS);
  if (xs.length < ACUTE_DAYS || historyDays < ACUTE_DAYS) return { value: null, strain: null, high: false };
  const m = mean(xs), sd = Math.sqrt(mean(xs.map(v => (v - m) ** 2)));
  if (!(sd > 0)) return { value: null, strain: null, high: false };
  const value = m / sd, total = xs.reduce((s, v) => s + v, 0);
  return { value: round(value, 2), strain: Math.round(total * value), high: value > HIGH_MONOTONY };
}

// Both from fitness rows (GET /app/api/fitness wellness) as of `date`.
export function workloadMetrics(rows, date) {
  const { series, historyDays } = dailyLoadSeries(rows, date);
  const loads = series.map(d => d.load);
  return { acwr: acwr(loads, historyDays), monotony: monotony(loads, historyDays), historyDays };
}

// A cautionary line for the deterministic coach when the ratio is high or the
// week is monotonous, else null.
export function workloadCaution(metrics) {
  const ratio = metrics?.acwr?.value, mono = metrics?.monotony?.value;
  const dec = (v, d) => L(String(round(v, d)).replace(".", ","), String(round(v, d)));
  const parts = [];
  if (ratio != null && ratio > 1.5) parts.push(L(
    "Poměr akutní a chronické zátěže je " + dec(ratio, 2) + ": posledních 7 dní trénuješ výrazně víc, než na co tě připravily poslední 4 týdny. Zařaď pár lehčích dní, ať riziko přetížení klesne.",
    "Your acute:chronic workload ratio is " + dec(ratio, 2) + ": the last 7 days are well above what the past 4 weeks prepared you for. Take a few easier days to bring the risk of overload down."));
  if (mono != null && mono > HIGH_MONOTONY) parts.push(L(
    "Monotónnost tréninku je " + dec(mono, 2) + ": dny jsou si zátěží příliš podobné. Střídej těžší a lehčí dny a zařaď den volna.",
    "Training monotony is " + dec(mono, 2) + ": your days carry too similar a load. Alternate hard and easy days and add a rest day."));
  return parts.length ? parts.join(" ") : null;
}
