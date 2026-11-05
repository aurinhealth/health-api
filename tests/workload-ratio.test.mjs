// The acute:chronic workload ratio and Foster's monotony and strain
// (src/workload-ratio.js), on the Training screen, in the coach's facts and
// in the deterministic coach's morning summary.
import test from "node:test";
import assert from "node:assert/strict";
import { acwr, loadLevel, dailyLoadSeries, monotony, rowLoad, workloadCaution, workloadMetrics, loadLevelLabel } from "../src/workload-ratio.js";
import { trendFacts } from "../src/trend-facts.js";
import { buildTraining } from "../src/app-training.js";
import { buildCoachCouncil } from "../src/coach-engine.js";
import { screenFacts } from "../src/screen-texts.js";
import { withLang } from "../src/lang.js";

const DATE = "2026-10-12";
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
// Rows for the `loads` (oldest first, the last one DATE) under `key`.
const rows = (loads, key = "load") => loads.map((v, i) => ({ id: shift(DATE, i - loads.length + 1), [key]: v }));
const repeat = (n, v) => Array.from({ length: n }, () => v);

test("the daily load of a row: Intervals.icu's day load, else the app's own", () => {
  assert.equal(rowLoad({ ctlLoad: 80, atlLoad: 70, load: 10 }), 80);
  assert.equal(rowLoad({ atlLoad: 70 }), 70);
  assert.equal(rowLoad({ load: 36 }), 36);
  assert.equal(rowLoad({ ctl: 50 }), null);
  assert.equal(rowLoad({ load: -5 }), null);
});

test("the series is 42 days to the date, rest days and missing days 0, history from the first load", () => {
  const { series, historyDays } = dailyLoadSeries([{ id: shift(DATE, -10), load: 50 }, { id: shift(DATE, -3), ctlLoad: 40 }, { id: shift(DATE, -3), load: 0 }, { id: shift(DATE, 1), load: 999 }], DATE);
  assert.equal(series.length, 42);
  assert.equal(series[0].date, shift(DATE, -41));
  assert.equal(series.at(-1).date, DATE);
  assert.equal(series.find(d => d.date === shift(DATE, -10)).load, 50);
  // Two rows of a day add up; a row after the date is the future.
  assert.equal(series.find(d => d.date === shift(DATE, -3)).load, 40);
  assert.equal(series.reduce((s, d) => s + d.load, 0), 90);
  assert.equal(historyDays, 11);
  assert.deepEqual(dailyLoadSeries([], DATE).historyDays, 0);
  assert.deepEqual(dailyLoadSeries(null, "nope"), { series: [], historyDays: 0 });
});

test("ACWR is the 7-day mean over the 28-day mean", () => {
  // Three weeks at 50 a day, then a week at 100: acute 100, chronic 62.5.
  const r = acwr([...repeat(21, 50), ...repeat(7, 100)], 28);
  assert.deepEqual(r, { value: 1.6, level: "wellAbove", acute: 100, chronic: 62.5 });
  // A steady load is 1.
  assert.equal(acwr(repeat(42, 40), 42).value, 1);
  assert.equal(acwr(repeat(42, 40), 42).level, "usual");
  // Rest days count as 0: every other day trained.
  const alternate = Array.from({ length: 28 }, (_, i) => (i % 2 ? 60 : 0));
  assert.equal(acwr(alternate, 28).value, round2((60 * 4 / 7) / 30));
});
const round2 = v => Math.round(v * 100) / 100;

test("ACWR is null with under 21 days of history or no chronic load", () => {
  const loads = [...repeat(8, 0), ...repeat(20, 50)];
  assert.equal(acwr(loads, 20).value, null);
  assert.equal(acwr(loads, 20).level, null);
  // The means are still there to show.
  assert.equal(acwr(loads, 20).acute, 50);
  // The chronic mean over the 21 days since the first load, not 28 with a week of zeros.
  assert.equal(acwr(loads, 21).value, round2(50 / (1000 / 21)));
  assert.equal(acwr([...repeat(7, 0), ...repeat(21, 40)], 21).value, 1);
  // All zero.
  assert.deepEqual(acwr(repeat(28, 0), 40), { value: null, level: null, acute: 0, chronic: 0 });
  // Fewer than 28 days of series.
  assert.equal(acwr(repeat(10, 50), 30).value, null);
  // From rows: history counts from the first load, not the length of the series.
  assert.equal(workloadMetrics(rows([...repeat(22, 0), ...repeat(20, 50)]), DATE).acwr.value, null);
  // 21 days of the same load: no overload (it was 1.33 when the days before the first load counted as rest).
  assert.equal(workloadMetrics(rows([...repeat(21, 0), ...repeat(21, 50)]), DATE).acwr.value, 1);
});

test("the last 7 days against the usual 28 in words, no bands or risk (Today audit D4)", () => {
  assert.equal(loadLevel(0.69), "wellBelow");
  assert.equal(loadLevel(0.7), "below");
  assert.equal(loadLevel(0.9), "usual");
  assert.equal(loadLevel(1.15), "usual");
  assert.equal(loadLevel(1.42), "above");
  assert.equal(loadLevel(1.5), "above");
  assert.equal(loadLevel(1.51), "wellAbove");
  assert.equal(loadLevel(null), null);
  assert.equal(withLang("cs", () => loadLevelLabel("above")), "nad obvyklou");
  assert.equal(withLang("en", () => loadLevelLabel("wellAbove")), "well above");
  assert.equal(loadLevelLabel("sweetSpot"), null);
});

test("monotony is the 7-day mean over its SD, strain the week's load × monotony", () => {
  // 100, 50, 100, 50, 100, 50, 0: mean 64.29, SD 34.99.
  const week = [100, 50, 100, 50, 100, 50, 0];
  const m = 450 / 7, sd = Math.sqrt(week.reduce((s, v) => s + (v - m) ** 2, 0) / 7);
  const r = monotony([...repeat(20, 30), ...week], 27);
  assert.deepEqual(r, { value: round2(m / sd), strain: Math.round(450 * m / sd), high: false });
  // Nearly the same load every day is high.
  const flat = monotony([60, 62, 58, 61, 59, 60, 60], 7);
  assert.equal(flat.high, true);
  assert.ok(flat.value > 2);
  // No variation (all zero or all equal) and short history are null.
  assert.deepEqual(monotony(repeat(7, 0), 30), { value: null, strain: null, high: false });
  assert.deepEqual(monotony(repeat(7, 50), 30), { value: null, strain: null, high: false });
  assert.deepEqual(monotony(repeat(7, 33.3), 30), { value: null, strain: null, high: false }, "equal decimal loads are no variation, not a monotony of 10^15");
  assert.deepEqual(monotony(week, 6), { value: null, strain: null, high: false });
  assert.deepEqual(monotony([50, 60], 30), { value: null, strain: null, high: false });
});

test("the Training screen carries acwr and monotony from the fitness rows", () => {
  // Every other day 60 (Intervals.icu's day load), today trained.
  const wellness = Array.from({ length: 100 }, (_, i) => ({ id: shift(DATE, i - 99), ctl: 40, atl: 45, ctlLoad: i % 2 ? 60 : 0 }));
  const t = buildTraining({ date: DATE, fitness: { wellness } });
  // In words only: no ratio or loads for the app.
  assert.deepEqual(t.acwr, { level: "usual" });
  assert.equal(t.monotony.high, false);
  assert.equal(t.monotony.value, 1.15);
  assert.equal(t.monotony.strain, 277);
  // No load on record: both null.
  const none = buildTraining({ date: DATE, fitness: { wellness: [] } });
  assert.equal(none.acwr, null);
  assert.equal(none.monotony, null);
  // The training screen's "Proč?" lists both.
  const facts = withLang("en", () => screenFacts("training", { ...t, form: null }));
  assert.ok(facts.basis.some(b => b.label === "Last 7 days vs your usual 28" && b.value === "usual"));
  assert.ok(facts.basis.some(b => b.label === "Monotony" && /^1\.15, strain 277$/.test(b.value)));
});

test("the coach's trend facts carry acwr and monotony with Czech and English labels", () => {
  const intervals = rows([...repeat(35, 50), ...repeat(7, 100)], "ctlLoad");
  const cs = withLang("cs", () => trendFacts({ date: DATE, intervals }));
  // The level only, never the ratio, the mean loads or a risk.
  assert.deepEqual(cs.acwr, { label: "Posledních 7 dní vs. obvyklých 28", level: "wellAbove", levelLabel: "výrazně nad obvyklou" });
  // A week at a constant 100 has no variation: no monotony fact.
  assert.equal(cs.monotony, undefined);
  const varied = rows([...repeat(35, 50), 90, 100, 95, 100, 90, 100, 95], "ctlLoad");
  const en = withLang("en", () => trendFacts({ date: DATE, intervals: varied }));
  assert.equal(en.acwr.label, "Last 7 days vs your usual 28");
  assert.equal(en.monotony.label, "Training monotony (7 days)");
  assert.equal(en.monotony.strainLabel, "Weekly training strain");
  assert.equal(en.monotony.high, true);
  // Too little history: left out.
  assert.equal(trendFacts({ date: DATE, intervals: rows(repeat(14, 50), "ctlLoad") }), null);
});

test("the deterministic coach warns when the last 7 days are well above the usual 28 or monotony above 2.0", () => {
  const high = { acwr: { level: "wellAbove" }, monotony: { value: 1.2, high: false } };
  assert.equal(withLang("cs", () => workloadCaution(high)), "Posledních 7 dní bylo výrazně nad tvými obvyklými 28. Tento týden střídej těžší a lehčí dny.");
  assert.equal(withLang("en", () => workloadCaution(high)), "The last 7 days were well above your usual 28. Alternate harder and easier days this week.");
  assert.doesNotMatch(withLang("en", () => workloadCaution(high)), /risk|ratio|\d\.\d/);
  const flat = { acwr: { level: "usual" }, monotony: { value: 2.34, high: true } };
  assert.match(withLang("cs", () => workloadCaution(flat)), /^Monotónnost tréninku je 2,34: .*den volna\.$/);
  assert.match(withLang("en", () => workloadCaution(flat)), /^Training monotony is 2\.34: .*rest day\.$/);
  // Both: two lines; at the limits or without data: nothing.
  assert.match(withLang("en", () => workloadCaution({ acwr: { level: "wellAbove" }, monotony: { value: 2.1 } })), /usual 28\. .* monotony is 2\.1: /);
  assert.equal(workloadCaution({ acwr: { level: "above" }, monotony: { value: 2 } }), null);
  assert.equal(workloadCaution({ acwr: { level: null }, monotony: { value: null } }), null);
  assert.equal(workloadCaution(null), null);

  // In the morning summary, in the app language.
  const en = withLang("en", () => buildCoachCouncil({ date: DATE, fitness: { tsb: -5 }, workload: high }).morningSummary);
  assert.match(en.text, /Current form -5\. The last 7 days were well above your usual 28/);
  const cs = withLang("cs", () => buildCoachCouncil({ date: DATE, workload: flat }).morningSummary);
  assert.match(cs.text, /Monotónnost tréninku je 2,34/);
  // Without the warning and without other facts there is no summary.
  assert.equal(buildCoachCouncil({ date: DATE, workload: { acwr: { level: "usual" }, monotony: { value: 1.5 } } }).morningSummary, null);
});
