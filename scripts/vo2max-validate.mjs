#!/usr/bin/env node
// Validation of Aurin's own VO2max (src/own-vo2max.js) against the watches'
// values, offline, on one consenting person's exported data (never part of the
// repository): node scripts/vo2max-validate.mjs export.json [--from 2026-07-14] [--to 2026-11-03] [--json out.json]
//
// export.json = { profile: { sex, birthDate | age, height, hrmax?, averageSteps? },
//   rows: health_datapoints rows (data_type, source_family, start_time, end_time,
//   sample_time, value_numeric, payload_json, record_role) of the activities,
//   daily resting heart rate, weight, body fat, sleep and daily-vo2-max,
//   references?: [{ source, date, value }] (e.g. Garmin through Intervals.icu) }
//
// The estimate runs day by day as the daily job would, each day with only the
// data up to that day and the previous day's row; the watches' values are
// compared with it, never fed into it. Prints a Markdown summary.
import { readFileSync, writeFileSync } from "node:fs";
import { estimateDay, inputsFromRows, observedMaxHr, sessionsFromRows, MODEL_VERSION } from "../src/own-vo2max.js";
import { sleepSessionFromRow, joinSplitNights } from "../src/sleep-sessions.js";

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
const file = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
if (!file) { console.error("usage: node scripts/vo2max-validate.mjs export.json [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json out.json]"); process.exit(2); }
const data = JSON.parse(readFileSync(file, "utf8"));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const day = r => String(r.sample_time || r.start_time || "").slice(0, 10);

const rows = data.rows || [];
const activityRows = rows.filter(r => r.data_type === "activity" || r.data_type === "exercise");
const dailyRows = rows.filter(r => ["daily-resting-heart-rate", "weight", "body-fat"].includes(r.data_type));
const nights = joinSplitNights(rows.filter(r => r.data_type === "sleep").map(sleepSessionFromRow));
const references = [
  ...rows.filter(r => r.data_type === "daily-vo2-max" && Number(r.value_numeric) > 0).map(r => ({ source: r.source_family, date: day(r), value: Number(r.value_numeric) })),
  ...(data.references || [])
];
const allSessions = sessionsFromRows(activityRows);
const from = opt("from") || references.map(r => r.date).sort()[0];
const to = opt("to") || references.map(r => r.date).sort().at(-1);

// HRmax as the profile would hold it that day: the six months of workouts before it.
const series = [];
let previous = null;
for (let d = from; d <= to; d = shift(d, 1)) {
  const window = activityRows.filter(r => day(r) >= shift(d, -60) && day(r) <= d);
  const hrmax = observedMaxHr(allSessions.filter(s => s.date >= shift(d, -183) && s.date <= d)) ?? data.profile?.hrmax ?? null;
  const result = estimateDay(inputsFromRows({ date: d, profile: { ...data.profile, hrmax }, activityRows: window, dailyRows, nights, previous }));
  if (result) { series.push(result); previous = { date: d, vo2max: result.vo2max, confidence: result.confidence, model: MODEL_VERSION, rideFactor: result.rideFactor }; }
}

const round1 = v => (v == null ? null : Math.round(v * 10) / 10);
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const byDate = new Map(series.map(r => [r.date, r]));
const layer = (r, name) => name === "aurin" ? r.vo2max : name === "resting" ? r.details.resting?.value ?? null : r.details.workouts[name]?.mean ?? null;
const sources = [...new Set(references.map(r => r.source))];
const report = { from, to, days: series.length, sources: {} };
for (const source of sources) {
  // A watch repeats its last value until it makes a new one (Apple Watch only
  // from outdoor walks and runs): "fresh" days are the days its value changed.
  const own = references.filter(r => r.source === source).sort((a, b) => a.date.localeCompare(b.date));
  const fresh = new Set(own.filter((r, i) => i === 0 || Math.abs(r.value - own[i - 1].value) >= 0.05).map(r => r.date));
  const refs = own.filter(r => byDate.has(r.date));
  const out = { days: refs.length, layers: {} };
  for (const name of ["aurin", "resting", "ride", "run", "walk"]) {
    const pairs = refs.map(r => ({ date: r.date, ours: layer(byDate.get(r.date), name), device: r.value })).filter(p => p.ours != null);
    if (!pairs.length) continue;
    const diffs = pairs.map(p => p.ours - p.device), worst = pairs.reduce((w, p) => Math.abs(p.ours - p.device) > Math.abs(w.ours - w.device) ? p : w);
    // Direction over four weeks: both up, both down, or both within ±0.5.
    const trend = pairs.map(p => { const back = pairs.find(q => q.date === shift(p.date, -28)); if (!back) return null; const s = x => (Math.abs(x) <= 0.5 ? 0 : Math.sign(x)); return s(p.ours - back.ours) === s(p.device - back.device); }).filter(v => v != null);
    const freshDiffs = pairs.filter(p => fresh.has(p.date)).map(p => p.ours - p.device);
    out.layers[name] = { days: pairs.length, freshDays: freshDiffs.length, freshBias: round1(mean(freshDiffs)), freshMae: round1(mean(freshDiffs.map(Math.abs))), bias: round1(mean(diffs)), mae: round1(mean(diffs.map(Math.abs))), worst: { date: worst.date, ours: round1(worst.ours), device: round1(worst.device), diff: round1(worst.ours - worst.device) }, trendAgreement: trend.length ? Math.round(100 * trend.filter(Boolean).length / trend.length) : null };
  }
  report.sources[source] = out;
}
const confidence = {};
for (const r of series) confidence[r.confidence] = (confidence[r.confidence] || 0) + 1;
report.confidence = confidence;
report.last = series.at(-1) || null;

const lines = [`# VO2max validation ${from} – ${to}`, "", `${series.length} days estimated; confidence ${Object.entries(confidence).map(([k, v]) => `${k} ${v}`).join(", ")}.`, ""];
for (const [source, out] of Object.entries(report.sources)) {
  lines.push(`## ${source} (${out.days} days)`, "", "| layer | days | bias | MAE | fresh days | bias fresh | MAE fresh | worst day | 4-week trend agrees |", "|---|---|---|---|---|---|---|---|---|");
  for (const [name, l] of Object.entries(out.layers)) lines.push(`| ${name} | ${l.days} | ${l.bias} | ${l.mae} | ${l.freshDays} | ${l.freshBias ?? "–"} | ${l.freshMae ?? "–"} | ${l.worst.date}: ${l.worst.ours} vs ${l.worst.device} | ${l.trendAgreement ?? "–"} % |`);
  lines.push("");
}
if (report.last) lines.push(`Last day ${report.last.date}: VO2max ${report.last.vo2max} (${report.last.confidence}), fitness age ${report.last.fitnessAge}, composite age ${report.last.compositeAge}, ride factor ${report.last.rideFactor}.`);
console.log(lines.join("\n"));
if (opt("json")) writeFileSync(opt("json"), JSON.stringify({ report, series }, null, 1));
