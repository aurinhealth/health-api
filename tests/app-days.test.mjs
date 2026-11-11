import test from "node:test";
import assert from "node:assert/strict";
import { buildDays, DAYS_MAX } from "../src/app-days.js";
import { buildHealth } from "../src/app-health.js";

const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 90 }, (_, i) => {
  const offset = i - 89, today = offset === 0;
  return { id: day(offset), hrv: today ? 70 : 56 + (i % 5), restingHR: 50 + (i % 3), steps: 8000, hrZoneMinutes: { light: 40, moderate: 20, vigorous: 5, peak: 0 } };
});
const sessions = Array.from({ length: 40 }, (_, i) => {
  const date = day(i - 39);
  return { date, startTime: day(i - 40) + "T21:48:00Z", endTime: date + "T05:02:00Z", durationMin: i === 30 ? 300 : 412, timeInBedMin: 434 };
});
const profile = { age: 38 };

test("Days: one entry per day up to today, each like Health shows it", () => {
  const { days, end } = buildDays({ start: day(-13), end: day(5), today: DATE, google: wellness, sessions, profile });
  assert.equal(end, DATE, "nothing after today");
  assert.equal(days.length, 14);
  assert.equal(days.at(-1).date, DATE);
  const health = buildHealth({ date: DATE, health: { wellness }, sleep: { sessions }, profile });
  assert.deepEqual(days.map(d => d.readiness?.score ?? null).filter(v => v != null), health.readiness.history.map(p => p.value), "the same readiness as Health's 14 days");
  const last = days.at(-1);
  assert.equal(last.hrv.band, "above", "70 ms is above the usual range");
  assert.equal(last.sleep.minutes, 412);
  assert.equal(last.sleep.percent, Math.round(100 * 412 / last.sleep.need));
  assert.ok(last.strain > 0);
  const short = days.find(d => d.date === day(-9));
  assert.equal(short.sleep.minutes, 300);
});

test("Days: at most a month, a day without data stays empty", () => {
  const { days } = buildDays({ start: day(-80), end: DATE, today: DATE, google: [], sessions: [], profile });
  assert.equal(days.length, DAYS_MAX);
  assert.deepEqual(days[0], { date: day(-80), readiness: null, sleep: null, strain: null, hrv: null });
});
