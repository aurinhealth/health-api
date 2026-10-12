import test from "node:test";
import assert from "node:assert/strict";
import { appleRow } from "../src/apple-health.js";
import { googleHealthSummary } from "../src/google-dashboard.js";
import { recoveryReadiness, wristTempDeviation, wristTempPenalty } from "../src/recovery-model.js";
import { buildHealth, readinessParts } from "../src/app-health.js";
import { readinessFor } from "../src/readiness.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";

const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
// 40 days of steady HRV and resting heart rate (a readiness near 70), each
// night's wrist temperature from `temp(offset)` (offset 0 is today).
const rows = (temp = () => null, n = 40) => Array.from({ length: n }, (_, i) => {
  const offset = i - (n - 1), t = temp(offset);
  return { id: day(offset), hrv: 60 + (i % 3), restingHR: 50 + (i % 2), ...(t == null ? {} : { wristTemp: t }) };
});
// Baseline nights alternate 36.0 / 36.2 (median 36.1); today's night is 36.1 + rise.
const nightly = rise => offset => (offset === 0 ? Math.round((36.1 + rise) * 100) / 100 : offset % 2 ? 36.0 : 36.2);

test("Apple Health wrist temperature: one value a night in °C, implausible ones left out", () => {
  const r = appleRow({ type: "daily-wrist-temperature", id: "wt:2026-10-10", date: "2026-10-10", value: 35.87 }, Date.parse("2026-10-11T08:00:00Z"));
  assert.equal(r.data_type, "daily-wrist-temperature");
  assert.equal(r.sample_time, "2026-10-10");
  assert.equal(r.value_numeric, 35.87);
  assert.equal(r.value_unit, "°C");
  assert.deepEqual(r.payload.dailyWristTemperature, { date: { year: 2026, month: 10, day: 10 }, temperatureCelsius: 35.87 });
  const now = Date.parse("2026-10-11T08:00:00Z");
  for (const value of [29.9, 42.1, "", null, "warm"]) assert.equal(appleRow({ type: "daily-wrist-temperature", id: "wt:x", date: "2026-10-10", value }, now), null, String(value));
  assert.ok(appleRow({ type: "daily-wrist-temperature", id: "wt:y", date: "2026-10-10", value: 30 }, now));
  assert.ok(appleRow({ type: "daily-wrist-temperature", id: "wt:z", date: "2026-10-10", value: 42 }, now));
  // The stored row reads back as the day's wristTemp.
  const summary = googleHealthSummary([{ ...r, source_family: "apple-health", payload_json: JSON.stringify(r.payload) }], "2026-10-10");
  assert.equal(summary.today.wristTemp, 35.87);
});

test("wrist temperature deviation: last night against the median of the 28 nights before", () => {
  assert.equal(wristTempDeviation([], DATE), null);
  const w = wristTempDeviation(rows(nightly(0.6)), DATE);
  assert.equal(w.night, DATE);
  assert.equal(w.baseline, 36.1);
  assert.equal(w.deviation, 0.6);
  assert.equal(w.nights, 28, "at most 28 nights in the baseline");
  // The median: one feverish night in the baseline does not move it.
  const spike = wristTempDeviation(rows(o => (o === 0 ? 36.5 : o === -3 ? 38.5 : 36.0)), DATE);
  assert.equal(spike.baseline, 36.0);
  assert.equal(spike.deviation, 0.5);
  // Even count: the mean of the middle two.
  const even = wristTempDeviation([{ id: day(-8), wristTemp: 36 }, ...Array.from({ length: 7 }, (_, i) => ({ id: day(i - 7), wristTemp: 36 + i * 0.1 })), { id: DATE, wristTemp: 36.5 }], DATE);
  assert.equal(even.nights, 8);
  assert.equal(even.baseline, 36.25);
  assert.equal(even.deviation, 0.25);
  // Under 7 nights of baseline: the value without a deviation.
  const young = wristTempDeviation(rows(o => (o >= -6 ? 36.4 : null)), DATE);
  assert.equal(young.nights, 6);
  assert.equal(young.baseline, null);
  assert.equal(young.deviation, null);
  // The latest night up to the date; nights after it do not count.
  const before = wristTempDeviation(rows(o => (o === 1 ? 39 : o === 0 ? null : 36.1), 41), DATE);
  assert.equal(before.night, day(-1));
  assert.equal(before.deviation, 0);
  assert.equal(wristTempPenalty(0.49), 0);
  assert.equal(wristTempPenalty(0.5), 5);
  assert.equal(wristTempPenalty(1), 10);
  assert.equal(wristTempPenalty(-2), 0);
  assert.equal(wristTempPenalty(null), 0);
});

test("readiness: a raised wrist temperature lowers it a little, more from +1 °C, never raises it", () => {
  const score = rise => recoveryReadiness({ rows: rows(rise == null ? undefined : nightly(rise)), date: DATE });
  const plain = score(null);
  assert.ok(plain.score > 40 && plain.score < 90);
  for (const rise of [-1.5, -0.4, 0, 0.3, 0.49]) {
    const r = score(rise);
    assert.equal(r.score, plain.score, "no effect at " + rise);
    assert.ok(r.components.wristTemp, "the deviation is kept at " + rise);
    assert.equal(r.components.wristTemp.points, 0);
    assert.ok(!r.flags.includes("wrist_temp_elevated"));
  }
  const raised = score(0.6);
  assert.equal(raised.score, plain.score - 5);
  assert.equal(raised.components.wristTemp.points, -5);
  assert.ok(!raised.flags.includes("wrist_temp_elevated"), "+0.5 °C lowers it without the illness flag");
  const high = score(1.2);
  assert.equal(high.score, plain.score - 10);
  assert.ok(high.flags.includes("wrist_temp_elevated"));
  assert.deepEqual(readinessParts(high).find(p => p.key === "wristTemp"), { key: "wristTemp", points: -10 });
  assert.equal(readinessParts(score(0.2)).find(p => p.key === "wristTemp"), undefined);
  // Never above the number without the temperature, at any deviation.
  for (let rise = -3; rise <= 3; rise += 0.25) assert.ok(score(rise).score <= plain.score, String(rise));
  // Only last night counts: a raised night two days ago leaves today alone.
  const stale = rows(o => (o === 0 ? null : o === -2 ? 38 : 36.1));
  assert.equal(recoveryReadiness({ rows: stale, date: DATE }).score, plain.score);
  // Under 7 nights of baseline: no effect.
  assert.equal(recoveryReadiness({ rows: rows(o => (o >= -5 ? (o === 0 ? 38 : 36) : null)), date: DATE }).score, plain.score);
  // Google's skin temperature flagged too: one temperature cost, the larger.
  const both = rows(nightly(1.2));
  both.at(-1).skinTempDeviation = 0.9;
  const skinOnly = rows();
  skinOnly.at(-1).skinTempDeviation = 0.9;
  const b = recoveryReadiness({ rows: both, date: DATE }), s = recoveryReadiness({ rows: skinOnly, date: DATE });
  assert.equal(s.score, plain.score - 10);
  assert.equal(b.score, s.score);
  assert.equal(b.components.wristTemp.points, 0);
});

test("readiness everywhere: the shared function, Health and the coach see the wrist temperature", () => {
  const google = rows(nightly(1.1));
  const r = readinessFor({ date: DATE, google });
  assert.equal(r.score, readinessFor({ date: DATE, google: rows() }).score - 10);
  assert.ok(r.flags.includes("wrist_temp_elevated"));

  const h = buildHealth({ date: DATE, health: { wellness: google } });
  assert.equal(h.wristTemp.value, 37.2);
  assert.equal(h.wristTemp.deviation, 1.1);
  assert.equal(h.wristTemp.series.length, 30);
  assert.deepEqual(h.wristTemp.series.at(-1), { date: DATE, value: 37.2 });
  // The card's bars: each of the last 14 nights against its own baseline.
  assert.equal(h.wristTemp.deviations.length, 14);
  assert.deepEqual(h.wristTemp.deviations.at(-1), { date: DATE, value: 1.1 });
  assert.ok(h.wristTemp.deviations.slice(0, -1).every(p => Math.abs(p.value) <= 0.2), "baseline nights sit near 0");
  assert.ok(h.readiness.parts.some(p => p.key === "wristTemp" && p.points === -10));
  assert.equal(buildHealth({ date: DATE, health: { wellness: rows() } }).wristTemp, null, "no data, no object");
  const young = buildHealth({ date: DATE, health: { wellness: rows(o => (o >= -3 ? 36.3 : null)) } });
  assert.equal(young.wristTemp.value, 36.3);
  assert.equal(young.wristTemp.deviation, null, "under 7 nights of baseline");
  assert.deepEqual(young.wristTemp.deviations, [], "no bars without a baseline");

  const coach = buildCyclingCoachV2({ date: DATE, week: { days: [] }, fitness: { wellness: [] }, health: { wellness: google, sleep: [] }, gym: { history: [] }, availabilityMinutes: 60 });
  assert.equal(coach.readiness.wristTempDeviation, 1.1);
  assert.ok(coach.readiness.flags.includes("wrist_temp_elevated"));
  assert.ok(coach.readiness.reasons.some(t => /zápěstí|wrist/.test(t)), coach.readiness.reasons.join(" | "));
  const calm = buildCyclingCoachV2({ date: DATE, week: { days: [] }, fitness: { wellness: [] }, health: { wellness: rows(nightly(0.1)), sleep: [] }, gym: { history: [] }, availabilityMinutes: 60 });
  assert.equal(calm.readiness.wristTempDeviation, 0.1);
  assert.ok(!calm.readiness.reasons.some(t => /zápěstí|wrist/.test(t)));
});
