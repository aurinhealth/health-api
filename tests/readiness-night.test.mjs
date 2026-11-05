import test from "node:test";
import assert from "node:assert/strict";
import { readinessFor, shortNight } from "../src/readiness.js";

// Today audit point 5: a missing or short night never raises the score.
const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 40 }, (_, i) => ({ id: day(i - 39), hrv: i === 39 ? 70 : 56 + (i % 5), restingHR: i === 39 ? 47 : 50 + (i % 3) }));
const nights = Array.from({ length: 19 }, (_, i) => {
  const date = day(i - 19);
  return { date, startTime: day(i - 20) + "T21:48:00Z", endTime: date + "T05:02:00Z", durationMin: 412, timeInBedMin: 434, stages: {} };
});
const tonight = minutes => ({ date: DATE, startTime: DATE + "T02:00:00Z", endTime: new Date(Date.parse(DATE + "T02:00:00Z") + minutes * 60000).toISOString(), durationMin: minutes, stages: {} });

test("a night under 3 hours counts and caps the day at yellow", () => {
  const full = readinessFor({ date: DATE, google: wellness, sessions: [...nights, tonight(430)] });
  assert.equal(full.zone, "green");
  const short = readinessFor({ date: DATE, google: wellness, sessions: [...nights, tonight(170)] });
  assert.equal(short.night.durationMin, 170);
  assert.ok(short.score <= 66 && short.zone !== "green", `${short.score} ${short.zone}`);
  assert.ok(short.flags.includes("short_night"));
  assert.ok(short.components.sleep, "the short night is in the score");
});

test("no night while nights are usually recorded: no number, HRV and resting HR still there", () => {
  const none = readinessFor({ date: DATE, google: wellness, sessions: nights });
  assert.equal(none.score, null);
  assert.equal(none.zone, null);
  assert.ok(none.flags.includes("no_night"));
  assert.ok(none.components.hrv && none.components.restingHR);
  // Nobody tracking sleep keeps the number from HRV and resting HR.
  assert.notEqual(readinessFor({ date: DATE, google: wellness, sessions: [] }).score, null);
});

test("a nap or an afternoon sleep is not the night", () => {
  assert.equal(shortNight([{ ...tonight(90), nap: true }], DATE), null);
  assert.equal(shortNight([{ date: DATE, startTime: DATE + "T13:00:00Z", endTime: DATE + "T14:30:00Z", durationMin: 90 }], DATE), null);
  assert.equal(shortNight([tonight(20)], DATE), null, "under 30 minutes is a fragment");
  assert.equal(shortNight([tonight(120), tonight(150)], DATE).durationMin, 150);
});
