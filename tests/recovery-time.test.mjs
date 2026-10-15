import test from "node:test";
import assert from "node:assert/strict";
import { sessionRecoveryHours, recoveryTime, morningSigns, activityRecoveryHours, MAX_HOURS } from "../src/recovery-time.js";
import { recoveryForCoach } from "../src/coach-assistant.js";
import { buildToday } from "../src/app-today.js";

const now = Date.parse("2026-10-15T08:00:00Z"), ago = h => now - h * 3600000;
const ride = (endHoursAgo, tss, intensity = 70, extra = {}) => ({ kind: "ride", type: "Ride", source: "intervals", name: "Kolo · tempo", tss, icu_intensity: intensity, minutes: 75, end: ago(endHoursAgo), ...extra });

test("training load sets the hours on the TrainingPeaks guide", () => {
  assert.equal(sessionRecoveryHours({ kind: "ride", tss: 150 }).hours, 24);
  assert.equal(sessionRecoveryHours({ kind: "ride", tss: 300 }).hours, 48);
  assert.equal(sessionRecoveryHours({ kind: "ride", tss: 900 }).hours, MAX_HOURS);
  // An easy short spin needs nothing.
  assert.equal(sessionRecoveryHours({ kind: "ride", tss: 20 }).hours, 0);
});

test("intensity keeps hard sessions apart even at a small load", () => {
  assert.equal(sessionRecoveryHours({ kind: "ride", tss: 84, intensity: 0.88 }).hours, 36);
  assert.equal(sessionRecoveryHours({ kind: "run", tss: 70, intensity: 0.97 }).hours, 48);
});

test("a watch workout without TSS is estimated from its minutes", () => {
  const r = sessionRecoveryHours({ kind: "run", minutes: 60 });
  assert.equal(r.estimated, true);
  assert.equal(r.tss, 54);
  assert.ok(r.hours >= 8 && r.hours <= 9);
});

test("Regenerace waits for the last session and adds the morning's signs", () => {
  const plain = recoveryTime({ activities: [ride(14, 84, 88)], now });
  assert.equal(plain.hours, 36 - 14);
  assert.equal(plain.causes[0].title, "Kolo · tempo");
  assert.equal(plain.causes[0].hours, 36);
  const signs = recoveryTime({ activities: [ride(14, 84, 88)], now, sleep: { minutes: 420, need: 480 }, hrv: { value: 40, low: 50, high: 70 }, restingHR: { value: 60, high: 55 } });
  assert.equal(signs.hours, 22 + 2 + 3 + 2);
  assert.deepEqual(signs.causes.slice(1).map(c => c.kind), ["sleep", "hrv", "restingHR"]);
  assert.ok(signs.progress > 0 && signs.progress < 1);
  assert.ok(Date.parse(signs.lightAt) < Date.parse(signs.readyAt));
});

test("nothing to recover from gives null", () => {
  assert.equal(recoveryTime({ activities: [ride(60, 84, 88)], now }), null);
  assert.equal(recoveryTime({ activities: [], now }), null);
  assert.deepEqual(morningSigns({ sleep: { minutes: 470, need: 480 } }), []);
});

test("a gym day lasts until the worked muscles are rested", () => {
  const sets = Array.from({ length: 8 }, () => ({ workout_date: "2026-10-14", exercise: "Back Squat", rpe: 9, updated_at: "2026-10-14 18:00:00" }));
  const r = recoveryTime({ sets, activities: [{ kind: "strength", type: "WeightTraining", end: Date.parse("2026-10-14T18:00:00Z") }], now });
  assert.ok(r);
  assert.equal(r.causes[0].kind, "gym");
  assert.match(r.causes[0].title, /nohy|legs/);
});

test("the activity detail and the coach read the same model", () => {
  assert.equal(activityRecoveryHours({ type: "Ride", icu_training_load: 84, icu_intensity: 88, moving_time: 4320 }), 36);
  assert.equal(activityRecoveryHours({ type: "WeightTraining", moving_time: 3600 }), null);
  const c = recoveryForCoach(recoveryTime({ activities: [ride(14, 84, 88)], now }));
  assert.match(c.hardFrom, /^2026-10-16 \d\d:\d\d$/);
  assert.match(c.causes[0], /Kolo · tempo/);
});

test("Today carries the resting heart rate range Regenerace reads", () => {
  const today = buildToday({ date: "2026-10-15", hour: 10 });
  assert.equal(today.recoveryTime, null);
});
