import test from "node:test";
import assert from "node:assert/strict";
import { setMuscles, muscleFatigue, loadMuscleFatigue, MUSCLES, MAX_HOURS } from "../src/muscle-fatigue.js";
import { EXERCISES } from "../src/strength-generator.js";
import { withLang } from "../src/lang.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const today = "2026-10-08", now = Date.parse("2026-10-08T08:00:00Z"), hours = h => now - h * 3600000;
const sets = (exercise, n, { date = today, rpe = 8, at = "2026-10-08 07:00:00" } = {}) => Array.from({ length: n }, () => ({ workout_date: date, exercise, rpe, updated_at: at }));
const muscle = (r, id) => r.muscles.find(m => m.id === id);

test("a set works its catalogue muscle and the muscles that help", () => {
  assert.deepEqual(setMuscles("Barbell back squat"), { quads: 1, glutes: .5, adductors: .4 });
  assert.deepEqual(setMuscles("Leg extension Prime"), { quads: 1 });
  assert.deepEqual(setMuscles("DB bench press"), { chest: 1, triceps: .5, shoulders: .4 });
  assert.deepEqual(setMuscles("Low row"), { back: 1, biceps: .5, rear_delts: .4 });
  // A hinge led by the hamstrings does not count them twice.
  assert.deepEqual(setMuscles("DB Romanian deadlift"), { hamstrings: 1, glutes: .6, lower_back: .4 });
  assert.deepEqual(setMuscles("Hip thrust"), { glutes: 1, hamstrings: .4 });
  assert.deepEqual(setMuscles("Some machine nobody knows"), {});
  // Every muscle of the catalogue is on the screen.
  for (const def of Object.values(EXERCISES)) assert.ok(MUSCLES.includes(def.muscle), def.muscle);
});

test("recovery takes longer after more sets, to failure and for large muscles", () => {
  const at = list => muscleFatigue({ sets: list, now, today });
  // Three hard sets of squats just done: the thighs need more than a day.
  const three = muscle(at(sets("Barbell back squat", 3)), "quads");
  assert.equal(three.state, "fatigued");
  assert.ok(three.hours >= 24 && three.hours <= 36, String(three.hours));
  const six = muscle(at(sets("Barbell back squat", 6)), "quads");
  assert.ok(six.hours >= 60 && six.hours <= 75 && six.level >= .9, JSON.stringify(six));
  assert.ok(muscle(at(sets("Barbell back squat", 6, { rpe: 10 })), "quads").hours > six.hours);
  assert.equal(muscle(at(sets("Barbell back squat", 30)), "quads").hours, MAX_HOURS);
  // The same sets of curls: the biceps are back sooner.
  assert.ok(muscle(at(sets("DB curl", 3)), "biceps").hours < three.hours);
  // The helpers get their share: glutes tired, but less than the thighs.
  const glutes = muscle(at(sets("Barbell back squat", 6)), "glutes");
  assert.ok(glutes.hours > 0 && glutes.hours < six.hours);
  // Four days later the thighs are rested.
  const old = muscle(at(sets("Barbell back squat", 3, { date: "2026-10-04", at: "2026-10-04 16:00:00" })), "quads");
  assert.deepEqual([old.state, old.hours, old.readyAt], ["rested", 0, null]);
  // One easy set leaves nothing to wait for.
  assert.equal(muscle(at(sets("DB curl", 1, { rpe: 6 })), "biceps").state, "rested");
});

test("states, the order of the list and when the muscle is ready", () => {
  const r = muscleFatigue({ sets: [...sets("Barbell back squat", 5), ...sets("DB curl", 2)], now, today });
  assert.equal(r.muscles.length, MUSCLES.length);
  assert.equal(r.muscles[0].id, "quads");
  assert.deepEqual(r.muscles.map(m => m.hours), [...r.muscles.map(m => m.hours)].sort((a, b) => b - a));
  const biceps = muscle(r, "biceps");
  assert.equal(biceps.state, "recovering");
  assert.ok(biceps.hours > 0 && biceps.hours < 24);
  const quads = muscle(r, "quads");
  assert.equal(quads.readyAt, new Date(now + quads.hours * 3600000).toISOString());
  assert.ok(quads.readyDate > today);
  assert.equal(muscle(r, "chest").state, "rested");
  assert.equal(quads.estimated, false);
});

test("rides and runs tire the legs as an estimate, the upper body stays rested", () => {
  const run = { kind: "run", type: "Run", end: hours(14), tss: 90, distance: 14200, minutes: 75 };
  const ride = { ...run, kind: "ride", type: "Ride", distance: 60000, minutes: 120 };
  const afterRun = muscleFatigue({ activities: [run], now, today }), afterRide = muscleFatigue({ activities: [ride], now, today });
  assert.ok(muscle(afterRun, "calves").hours > 0 && muscle(afterRun, "calves").estimated);
  assert.ok(muscle(afterRun, "calves").hours > muscle(afterRide, "calves").hours);
  // A ride of the same load is mostly the thighs, at 70 % (concentric work).
  assert.ok(muscle(afterRide, "quads").hours >= muscle(afterRide, "calves").hours);
  assert.equal(muscle(afterRun, "chest").state, "rested");
  assert.deepEqual(afterRun.recent, [{ kind: "run", date: "2026-10-07", title: "Běh 14 km", day: "včera", estimated: true }]);
  // Without a training load the length counts; a planned one (in the future) does not.
  assert.ok(muscle(muscleFatigue({ activities: [{ kind: "run", type: "Run", end: hours(2), minutes: 90, durationHours: 1.5 }], now, today }), "calves").hours > 0);
  assert.equal(muscle(muscleFatigue({ activities: [{ ...run, end: now + 3600000 }], now, today }), "calves").state, "rested");
});

test("what tired the muscles in the last 3 days, in Czech and English", () => {
  const input = {
    sets: [...sets("Barbell back squat", 4, { date: "2026-10-05", at: "2026-10-05 16:00:00" }), ...sets("Standing calf raise", 3, { date: "2026-10-05", at: "2026-10-05 16:00:00" }),
      ...sets("DB bench press", 4, { date: "2026-10-03", at: "2026-10-03 16:00:00" })],
    activities: [{ kind: "run", type: "Run", end: hours(15), tss: 80, distance: 14000, minutes: 72 }, { kind: "walk", type: "Walk", end: hours(3), minutes: 20, distance: 1500 },
      { kind: "ride", type: "Ride", end: hours(40), tss: 70, minutes: 105 }],
    now, today
  };
  const r = muscleFatigue(input);
  // A short walk tired nothing worth naming; the bench day was 5 days ago.
  assert.deepEqual(r.recent.map(x => [x.title, x.day]), [["Běh 14 km", "včera"], ["Jízda 1 h 45 min", "úterý"], ["Posilovna, nohy", "pondělí"]]);
  assert.deepEqual(withLang("en", () => muscleFatigue(input)).recent.map(x => [x.title, x.day]), [["Run 14 km", "yesterday"], ["Ride 1 h 45 min", "Tuesday"], ["Gym, legs", "Monday"]]);
  assert.equal(withLang("en", () => muscleFatigue(input)).muscles[0].label, "Quads");
  assert.equal(r.muscles[0].label, "Přední stehna");
  assert.deepEqual(muscleFatigue({ sets: sets("DB bench press", 4), now, today }).recent.map(x => x.title), ["Posilovna, horní část těla"]);
});

test("loads the user's own sets and activities, a watch's copy of a run once, the gym time from the watch", async () => {
  const raw = createD1();
  raw.sqlite.exec(`CREATE TABLE strength_sets (user_id INTEGER, workout_date TEXT, exercise TEXT, rpe REAL, completed INTEGER, type TEXT, updated_at TEXT);
    CREATE TABLE health_datapoints (user_id INTEGER, source_family TEXT, data_type TEXT, start_time TEXT, end_time TEXT, payload_json TEXT, record_role TEXT);`);
  const addSet = raw.sqlite.prepare("INSERT INTO strength_sets VALUES(?,?,?,?,?,?,?)");
  for (let i = 0; i < 4; i++) addSet.run(1, "2026-10-07", "Barbell back squat", 8, 1, "WORK", "2026-10-07 18:40:00");
  addSet.run(1, "2026-10-07", "Barbell back squat", null, 1, "WARMUP", "2026-10-07 18:40:00");
  addSet.run(1, "2026-10-07", "DB curl", 8, 0, "WORK", "2026-10-07 18:40:00");
  for (let i = 0; i < 6; i++) addSet.run(2, "2026-10-07", "DB bench press", 9, 1, "WORK", "2026-10-07 18:40:00");
  const addRow = raw.sqlite.prepare("INSERT INTO health_datapoints VALUES(?,?,?,?,?,?,NULL)");
  addRow.run(1, "intervals", "activity", "2026-10-06T17:00:00", null, JSON.stringify({ type: "Run", start_date: "2026-10-06T15:00:00Z", start_date_local: "2026-10-06T17:00:00", moving_time: 3600, elapsed_time: 3700, distance: 12000, icu_training_load: 70 }));
  addRow.run(1, "apple-health", "exercise", "2026-10-06T15:01:00Z", "2026-10-06T16:02:00Z", JSON.stringify({ exercise: { exerciseType: "RUNNING", activeDuration: "3600s" } }));
  // The gym day as the watch recorded it: it ended at 16:00 UTC, before the sets were saved.
  addRow.run(1, "apple-health", "exercise", "2026-10-07T15:00:00Z", "2026-10-07T16:00:00Z", JSON.stringify({ exercise: { exerciseType: "STRENGTH_TRAINING", activeDuration: "3600s" } }));
  addRow.run(2, "intervals", "activity", "2026-10-07T07:00:00", null, JSON.stringify({ type: "Ride", start_date_local: "2026-10-07T07:00:00", moving_time: 7200, icu_training_load: 120 }));
  const r = await loadMuscleFatigue(scopedDb(raw, 1), { now });
  assert.deepEqual(r.recent.map(x => x.title), ["Posilovna, nohy", "Běh 12 km"]);
  assert.equal(muscle(r, "chest").state, "rested");
  assert.equal(muscle(r, "biceps").state, "rested");
  // Four hard sets 16 h before (the watch's end), not 13 h (the last save).
  const quads = muscle(r, "quads");
  const alone = muscle(muscleFatigue({ sets: sets("Barbell back squat", 4, { date: "2026-10-07", at: "2026-10-07 16:00:00" }), activities: [{ kind: "run", type: "Run", end: Date.parse("2026-10-06T16:01:40Z"), tss: 70, distance: 12000, minutes: 61.67 }], now, today }), "quads");
  assert.ok(Math.abs(quads.hours - alone.hours) <= 1, `${quads.hours} vs ${alone.hours}`);
  assert.equal(r.date, today);
});
