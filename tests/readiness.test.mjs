import test from "node:test";
import assert from "node:assert/strict";
import { readinessFor, readinessRows, sleepIndexFor } from "../src/readiness.js";
import { sourceBaseline, recoveryReadiness, mergeWellnessRows, sleepNeedFor } from "../src/recovery-model.js";
import { googleHealthSummary } from "../src/google-dashboard.js";
import { buildToday } from "../src/app-today.js";
import { buildHealth } from "../src/app-health.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { buildAdaptiveDecision } from "../src/adaptive-engine.js";
import { dayReadiness } from "../src/coach-review.js";

const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);

// 40 days of Google Health, a hard day yesterday (strain raises tonight's need),
// a short night and Intervals.icu filling oxygen and an older resting HR.
const google = Array.from({ length: 40 }, (_, i) => {
  const offset = i - 39;
  return { id: day(offset), hrv: offset === 0 ? 58 : 56 + (i % 5), hrvSource: "google-wearables", restingHR: offset === 0 ? 52 : 50 + (i % 3), restingHRSource: "google-wearables", hrZoneMinutes: { light: 40, moderate: offset === -1 ? 90 : 20, vigorous: offset === -1 ? 60 : 5, peak: 0 } };
});
const intervals = Array.from({ length: 90 }, (_, i) => ({ id: day(i - 89), spO2: 96, ...(i < 40 ? { restingHR: 49 } : {}) }));
const sessions = Array.from({ length: 20 }, (_, i) => {
  const date = day(i - 19), short = i === 19;
  return { date, startTime: day(i - 20) + "T22:00:00Z", endTime: date + "T06:00:00Z", durationMin: short ? 390 : 450, timeInBedMin: short ? 410 : 470 };
});
const profile = { age: 38, sleepGoal: 540 };

test("one readiness: Today, Health, the ride coach, the gym coach and the day review quote the same number", () => {
  for (const checkin of [null, "tired"]) {
    const r = readinessFor({ date: DATE, google, intervals, sessions, profile, checkin });
    assert.ok(r.score != null);
    const today = buildToday({ date: DATE, health: { wellness: google }, fitness: { wellness: intervals }, sleep: { sessions }, profile, checkin });
    const health = buildHealth({ date: DATE, health: { wellness: google }, fitness: { wellness: intervals }, sleep: { sessions }, profile, checkin });
    const ride = buildCyclingCoachV2({ date: DATE, week: { days: [] }, fitness: { wellness: intervals }, health: { wellness: google, sleep: sessions }, profile, checkin });
    const gym = buildAdaptiveDecision({ date: DATE, wellnessSeries: readinessRows(google, intervals, DATE), sleepSessions: sessions, profile, checkin, recovery: {}, cycling: {} });
    const review = dayReadiness({ date: DATE, fitness: { wellness: intervals }, health: { wellness: google, sleep: sessions }, profile, checkin });
    assert.equal(today.readiness.score, r.score);
    assert.equal(health.readiness.score, r.score);
    assert.equal(ride.readiness.score, r.score);
    assert.equal(gym.recovery.score, r.score);
    assert.equal(review.score, r.score);
    // The coach says the number Today shows.
    assert.ok(ride.readiness.reasons.some(x => new RegExp("(připravenost|readiness) " + r.score + " ").test(x)));
  }
});

test("the readiness uses the sleep goal and the strain of the day before", () => {
  const r = readinessFor({ date: DATE, google, intervals, sessions, profile });
  // Need from the goal (540) plus the hard day before, capped at 10 h.
  assert.ok(r.need.need > 540 && r.need.need <= 600);
  assert.equal(r.need.need, sleepNeedFor({ date: DATE, age: 38, goal: 540, rows: r.rows, sessions }).need);
  const noGoal = readinessFor({ date: DATE, google, intervals, sessions, profile: { age: 38 } });
  assert.ok(noGoal.need.need < r.need.need);
  // A larger need makes the same short night count for less.
  assert.ok(noGoal.components.sleep.performance > r.components.sleep.performance);
  assert.ok(noGoal.score >= r.score);
  // The night is the main night of the day, the rows stop at the day.
  assert.equal(r.night.durationMin, 390);
  assert.equal(r.rows.at(-1).id, DATE);
});

test("the sleep index falls back to the device's score (Intervals.icu sleepScore) without time in bed", () => {
  assert.equal(sleepIndexFor({ date: DATE, durationMin: 420, timeInBedMin: null, score: 81.6 }, 480), 82);
  assert.equal(sleepIndexFor({ date: DATE, durationMin: 420, timeInBedMin: null }, 480), null);
  assert.equal(sleepIndexFor({ date: DATE, durationMin: 420, timeInBedMin: 440, score: 10 }, 480) > 10, true, "the model's own index wins");
  const intervalsNight = { id: "intervals-sleep:" + DATE, date: DATE, startTime: null, endTime: null, timeInBedMin: null, durationMin: 420, score: 77, stages: {} };
  const today = buildToday({ date: DATE, health: { wellness: google }, sleep: { sessions: [intervalsNight] }, profile });
  assert.equal(today.sleep.index, 77);
  const health = buildHealth({ date: DATE, health: { wellness: google }, sleep: { sessions: [intervalsNight] }, profile });
  assert.equal(health.sleep.night.index, 77);
});

// Z6: a new source (Apple Watch, SDNN) after two months of Google (RMSSD).
const switched = (overlap, ownDays) => Array.from({ length: 60 }, (_, i) => {
  const offset = i - 60, rmssd = 60 + (i % 5) - 2, sdnn = Math.round(rmssd * 0.75 * 10) / 10;
  const apple = offset >= -ownDays, both = apple && offset < -ownDays + overlap;
  if (!apple) return { id: day(offset), hrv: rmssd, hrvSource: "google-wearables" };
  return { id: day(offset), hrv: sdnn, hrvSource: "apple-health:sdnn", ...(both ? { hrvBySource: { "google-wearables": rmssd, "apple-health:sdnn": sdnn } } : {}) };
});

test("a new HRV source borrows the old baseline shifted by the offset learned on the overlap", () => {
  const rows = [...switched(6, 6), { id: DATE, hrv: 45, hrvSource: "apple-health:sdnn" }];
  const b = sourceBaseline(rows, DATE, "hrv", "apple-health:sdnn", { log: true });
  assert.ok(b.carried);
  assert.equal(b.carried.from, "google-wearables");
  assert.equal(b.carried.overlap, 6);
  assert.equal(b.carried.own, 6);
  assert.ok(Math.abs(b.carried.offset - Math.log(0.75)) < 0.01, "SDNN sits at 0.75 of RMSSD here");
  assert.ok(Math.abs(Math.exp(b.mean) - 45) < 1, "the baseline is on the new source's scale");
  const r = recoveryReadiness({ rows, date: DATE });
  assert.ok(r.score != null);
  assert.equal(r.provisional, true);
  assert.ok(r.flags.includes("provisional"));
  assert.ok(Math.abs(r.components.hrv.z) < 0.5, "an ordinary SDNN day is an ordinary day");
});

test("no overlap keeps today's behaviour; 14 days of its own end the provisional number", () => {
  const few = [...switched(4, 6), { id: DATE, hrv: 45, hrvSource: "apple-health:sdnn" }];
  assert.equal(sourceBaseline(few, DATE, "hrv", "apple-health:sdnn", { log: true }).mean, null);
  const r = recoveryReadiness({ rows: few, date: DATE });
  assert.equal(r.score, null);
  assert.equal(r.provisional, false);
  const settled = [...switched(6, 20), { id: DATE, hrv: 45, hrvSource: "apple-health:sdnn" }];
  const s = recoveryReadiness({ rows: settled, date: DATE });
  assert.ok(s.score != null);
  assert.equal(s.provisional, false);
  assert.ok(!s.flags.includes("provisional"));
});

test("resting HR: a carried baseline instead of the mixed one when the sources overlap", () => {
  const rows = Array.from({ length: 50 }, (_, i) => {
    const offset = i - 50, apple = offset >= -6;
    return apple
      ? { id: day(offset), restingHR: 55 + (i % 2), restingHRSource: "apple-health", restingHRBySource: { "google-wearables": 50 + (i % 2), "apple-health": 55 + (i % 2) } }
      : { id: day(offset), restingHR: 50 + (i % 2), restingHRSource: "google-wearables" };
  });
  const r = recoveryReadiness({ rows: [...rows, { id: DATE, restingHR: 55, restingHRSource: "apple-health" }], date: DATE });
  assert.ok(Math.abs(r.components.restingHR.baseline - 55.5) < 0.3);
  assert.equal(r.provisional, true);
  assert.ok(!r.flags.includes("restingHRMixed"));
  // Without the overlap days the mixed baseline stays.
  const plain = rows.map(({ restingHRBySource, ...x }) => x);
  const m = recoveryReadiness({ rows: [...plain, { id: DATE, restingHR: 55, restingHRSource: "apple-health" }], date: DATE });
  assert.ok(m.flags.includes("restingHRMixed"));
  assert.equal(m.provisional, false);
});

test("every source's value of a day is kept for the overlap", () => {
  const hrv = (source, date, value, metric) => ({ data_type: "daily-heart-rate-variability", source_family: source, sample_time: date, value_numeric: value, payload_json: JSON.stringify({ dailyHeartRateVariability: { date: { year: 2026, month: 10, day: Number(date.slice(8)) }, ...(metric ? { metric } : {}) } }) });
  const s = googleHealthSummary([hrv("google-wearables", "2026-10-07", 60), hrv("apple-health", "2026-10-07", 45, "sdnn"), hrv("google-wearables", "2026-10-06", 58)], DATE);
  const both = s.wellness.find(r => r.id === "2026-10-07"), one = s.wellness.find(r => r.id === "2026-10-06");
  assert.equal(both.hrvSource, "apple-health:sdnn");
  assert.deepEqual(both.hrvBySource, { "google-wearables": 60, "apple-health:sdnn": 45 });
  assert.equal(one.hrvBySource, undefined);
  // Intervals.icu beside Google: resting HR "intervals", an untagged HRV "".
  const merged = mergeWellnessRows([{ id: DATE, hrv: 60, hrvSource: "google-wearables", restingHR: 50, restingHRSource: "google-wearables" }], [{ id: DATE, hrv: 70, restingHR: 48 }]);
  assert.deepEqual(merged[0].hrvBySource, { "google-wearables": 60, "": 70 });
  assert.deepEqual(merged[0].restingHRBySource, { "google-wearables": 50, intervals: 48 });
  assert.equal(merged[0].hrv, 60);
});

test("Today and Health expose the provisional readiness without anything new on screen", () => {
  const wellness = [...switched(6, 6), { id: DATE, hrv: 45, hrvSource: "apple-health:sdnn" }];
  const today = buildToday({ date: DATE, health: { wellness }, profile });
  assert.equal(today.readiness.provisional, true);
  assert.ok(today.readiness.flags.includes("provisional"));
  assert.equal(buildHealth({ date: DATE, health: { wellness }, profile }).readiness.provisional, true);
  assert.equal(buildToday({ date: DATE, health: { wellness: google }, profile }).readiness.provisional, false);
});
