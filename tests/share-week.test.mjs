import test from "node:test";
import assert from "node:assert/strict";
import { buildShareWeek, mondayOf } from "../src/share-week.js";

const intervals = (id, date, type, distance, minutes = 60, tss = 50) => ({ source_family: "intervals", external_id: id, start_time: date + "T07:00:00", end_time: null, payload_json: JSON.stringify({ id, type, distance, moving_time: minutes * 60, icu_training_load: tss, start_date_local: date + "T07:00:00" }) });
const day = (date, offset) => new Date(Date.parse(date + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 50 }, (_, i) => ({ id: day("2026-10-15", i - 49), hrv: 56 + (i % 5), restingHR: 50 + (i % 3), respiration: 14 }));
const sessions = Array.from({ length: 30 }, (_, i) => {
  const date = day("2026-10-15", i - 29);
  return { date, startTime: day(date, -1) + "T22:00:00Z", endTime: date + "T05:00:00Z", durationMin: 420, timeInBedMin: 440, stages: { DEEP: 80, REM: 90, LIGHT: 240, AWAKE: 10 } };
});

test("mondayOf finds the week's Monday", () => {
  assert.equal(mondayOf("2026-10-15"), "2026-10-12");
  assert.equal(mondayOf("2026-10-12"), "2026-10-12");
  assert.equal(mondayOf("2026-10-18"), "2026-10-12");
});

test("the week per day and against the week before, walks left out", () => {
  const rows = [
    intervals("r1", "2026-10-12", "Run", 10000, 50, 60),
    intervals("b1", "2026-10-14", "Ride", 40000, 90, 80),
    intervals("b2", "2026-10-14", "Run", 3000, 20, 20),
    intervals("w1", "2026-10-13", "Walk", 4000, 60, 10),
    intervals("b0", "2026-10-07", "Ride", 30000, 60, 50)
  ];
  const w = buildShareWeek({ date: "2026-10-15", today: "2026-10-15", rows, gymDays: ["2026-10-15"], google: wellness, sessions });
  assert.equal(w.start, "2026-10-12");
  assert.equal(w.end, "2026-10-18");
  assert.equal(w.days.length, 7);
  assert.deepEqual(w.days.map(d => d.sport), ["run", null, "ride", "strength", null, null, null]);
  assert.deepEqual(w.days.map(d => d.sessions), [1, 0, 2, 1, 0, 0, 0]);
  assert.equal(w.days[2].minutes, 110);
  assert.deepEqual({ minutes: w.week.minutes, sessions: w.week.sessions, tss: w.week.tss, rideKm: w.week.rideKm, runKm: w.week.runKm }, { minutes: 160, sessions: 4, tss: 160, rideKm: 40, runKm: 13 });
  assert.deepEqual({ minutes: w.previous.minutes, sessions: w.previous.sessions, rideKm: w.previous.rideKm }, { minutes: 60, sessions: 1, rideKm: 30 });
  // Readiness up to today, nothing after it.
  assert.ok(w.days.slice(0, 4).every(d => d.readiness != null && d.zone));
  assert.ok(w.days.slice(4).every(d => d.readiness == null && d.zone == null));
  assert.equal(w.week.sleepMinutes, 420);
  assert.ok(w.week.readiness > 0 && w.previous.readiness > 0);
});

test("a later date shows this week", () => {
  const w = buildShareWeek({ date: "2026-10-30", today: "2026-10-15" });
  assert.equal(w.start, "2026-10-12");
  assert.equal(w.week.minutes, 0);
  assert.equal(w.week.readiness, null);
});
