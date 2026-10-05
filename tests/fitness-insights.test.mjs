import test from "node:test";
import assert from "node:assert/strict";
import { exerciseMuscles, muscleEvents, muscleFreshness, muscularLoad, cardioFocus, strengthRecords, cardioRecords, loadFitnessInsights } from "../src/fitness-insights.js";
import { heartRateRecovery, activityIntervals } from "../src/activity-detail.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const today = "2026-10-01", ago = d => new Date(Date.parse(today + "T12:00:00Z") - d * 864e5).toISOString().slice(0, 10);
const sets = (date, exercise, kg, reps = 10, rpe = 8) => [1, 2, 3].map(() => ({ workout_date: date, exercise, actual_kg: kg, actual_reps: reps, rpe }));

test("exercises load their primary and secondary muscle groups", () => {
  assert.deepEqual(exerciseMuscles("DB bench press"), { chest: 1, triceps: .5, front_delts: .4 });
  assert.equal(exerciseMuscles("Pivot leg press").quads, 1);
  assert.ok(exerciseMuscles("Pivot leg press").hips > 0);
});

test("freshness drops after training, recovers with time and needs three training days", () => {
  const history = [21, 14, 7].flatMap(d => sets(ago(d), "Pivot leg press", 140));
  const rested = muscleFreshness(muscleEvents({ sets: history }), today).quads;
  assert.equal(rested.status, "recovered");
  const fresh = muscleFreshness(muscleEvents({ sets: [...history, ...sets(today, "Pivot leg press", 140)] }), today).quads;
  assert.ok(fresh.freshness < 75 && fresh.freshness < rested.freshness, String(fresh.freshness));
  assert.equal(muscleFreshness(muscleEvents({ sets: sets(today, "DB bench press", 20) }), today).chest.status, "calibrating");
  // A run tires the legs and leaves the upper body alone.
  const runs = [9, 6, 3, 0].map(d => ({ type: "Run", date: ago(d), tss: 70 }));
  const afterRun = muscleFreshness(muscleEvents({ activities: runs }), today);
  assert.ok(afterRun.calves.freshness < 75);
  assert.equal(afterRun.chest.status, "calibrating");
});

test("muscular load compares the last week with the six-week average", () => {
  const steady = Array.from({ length: 42 }, (_, d) => d % 3 === 0 ? { type: "Ride", date: ago(d), tss: 80 } : null).filter(Boolean);
  const r = muscularLoad(muscleEvents({ activities: steady }), today).overall;
  assert.equal(r.status, "productive");
  assert.ok(r.ratio > .8 && r.ratio < 1.3, String(r.ratio));
  const spike = muscularLoad(muscleEvents({ activities: [...steady, ...[0, 1, 2, 3, 4].map(d => ({ type: "Ride", date: ago(d), tss: 200 }))] }), today).overall;
  assert.equal(spike.status, "overtraining");
  assert.equal(r.series.length, 42);
});

test("cardio focus weights zone time by intensity", () => {
  const easy = { type: "Ride", date: ago(1), payload: { icu_hr_zone_times: [3600, 3600, 0, 0, 0] } };
  const hard = { type: "Ride", date: ago(2), payload: { icu_hr_zone_times: [600, 0, 0, 600, 900] } };
  const r = cardioFocus([easy, hard], today);
  assert.equal(r.activities, 2);
  assert.equal(r.percent.low + r.percent.high + r.percent.anaerobic >= 99, true);
  // 15 minutes in Z5 weigh more than their share of the time.
  assert.ok(r.percent.anaerobic > 900 / (3600 * 2 + 2100) * 100);
  assert.equal(cardioFocus([{ type: "Ride", date: ago(40), payload: { icu_hr_zone_times: [60] } }], today).activities, 0);
});

test("strength and cardio records", () => {
  const r = strengthRecords([...sets(ago(30), "Lat pulldown", 40), ...sets(ago(3), "Lat pulldown", 45, 8), { workout_date: ago(3), exercise: "Lat pulldown", actual_kg: 30, actual_reps: 20 }], today);
  const lat = r.find(x => x.exercise === "Lat pulldown");
  assert.equal(lat.heaviest.value, 45);
  assert.equal(lat.e1rm.value, 57); // 45 × (1 + 8/30); the 20-rep set is not used for 1RM
  assert.equal(lat.setReps.value, 20);
  assert.equal(lat.sessionVolume.value, 45 * 8 * 3 + 600);
  assert.ok(lat.recent.includes("heaviest"));
  const c = cardioRecords([{ type: "Ride", date: ago(5), distance: 92000, moving_time: 11000, total_elevation_gain: 1200, icu_weighted_avg_watts: 221 }, { type: "Run", date: ago(4), distance: 10000, moving_time: 2900 }]);
  assert.equal(c.longestRide.value, 92);
  assert.equal(c.fastestRun5k.value, 290);
});

test("insights load from the user's own rows only", async () => {
  const raw = createD1();
  raw.sqlite.exec(`CREATE TABLE strength_sets (user_id INTEGER, workout_date TEXT, exercise TEXT, actual_kg REAL, actual_reps REAL, rpe REAL, completed INTEGER, type TEXT);
    CREATE TABLE health_datapoints (user_id INTEGER, source_family TEXT, data_type TEXT, start_time TEXT, payload_json TEXT, record_role TEXT);`);
  for (const [u, kg] of [[1, 50], [2, 99]]) raw.sqlite.prepare("INSERT INTO strength_sets VALUES(?,?,?,?,?,?,1,'WORK')").run(u, ago(2), "Lat pulldown", kg, 10, 8);
  raw.sqlite.prepare("INSERT INTO health_datapoints VALUES(1,'intervals','activity',?,?,NULL)").run(ago(1) + "T10:00:00", JSON.stringify({ type: "Ride", start_date_local: ago(1) + "T10:00:00", icu_training_load: 90, distance: 50000, moving_time: 6000, icu_hr_zone_times: [1200, 2400, 1200, 600, 0] }));
  const r = await loadFitnessInsights(scopedDb(raw, 1), today);
  assert.equal(r.records.strength[0].heaviest.value, 50);
  assert.equal(r.records.cardio.longestRide.value, 50);
  assert.equal(r.cardioFocus.activities, 1);
});

test("heart rate recovery and intervals from Intervals.icu data", () => {
  const time = [], hr = [];
  for (let t = 0; t < 600; t++) { time.push(t); hr.push(t < 460 ? 120 + t * .1 : Math.max(110, 170 - (t - 460) * .35)); }
  hr.fill(170, 400, 460);
  const r = heartRateRecovery(time, hr, 160);
  assert.equal(r.peak, 170);
  assert.ok(r.drop >= 40 && r.seconds <= 120, JSON.stringify(r));
  assert.equal(heartRateRecovery(time.slice(0, 20), hr.slice(0, 20), 160), null);
  assert.deepEqual(activityIntervals({ icu_intervals: [{ type: "WORK", moving_time: 240, average_watts: 310.4, average_heartrate: 165 }] })[0].watts, 310);
});

test("record trends: best in the period against the best before it, or the first session", async () => {
  const { recordTrends } = await import("../src/fitness-insights.js");
  const set = (d, kg, reps = 8) => ({ workout_date: ago(d), exercise: "Lat pulldown", actual_kg: kg, actual_reps: reps });
  const t = recordTrends({ today, sets: [set(400, 35), set(200, 40), set(60, 42.5), set(10, 47.5), set(3, 45)], activities: [
    { type: "Ride", date: ago(300), icu_ftp: 240 }, { type: "Ride", date: ago(100), icu_ftp: 250 }, { type: "Ride", date: ago(5), icu_ftp: 262 },
    { type: "Run", date: ago(150), distance: 5000, moving_time: 1500 }, { type: "Run", date: ago(20), distance: 10000, moving_time: 2800 }, { type: "Run", date: ago(8), distance: 3000, moving_time: 700 }] });
  const lat = t.strength[0];
  assert.deepEqual(lat.best, { kg: 47.5, reps: 8, date: ago(10) });
  // 12 weeks: 47.5 against 40 before (the 42.5 was 60 days ago, inside the period).
  assert.deepEqual([lat.change["12w"].delta, lat.change["12w"].from, lat.change["12w"].basis], [7.5, 40, "before"]);
  assert.deepEqual([lat.change.all.delta, lat.change.all.from, lat.change.all.basis], [12.5, 35, "first"]);
  // FTP: the value now against the one in force when the period started.
  assert.deepEqual([t.ftp.value, t.ftp.change["12w"].from, t.ftp.change["12w"].delta, t.ftp.change.all.delta], [262, 250, 12, 22]);
  // Pace: lower is better; runs under 5 km do not count.
  assert.deepEqual([t.runPace.change["12w"].value, t.runPace.change["12w"].from, t.runPace.change["12w"].delta], [280, 300, -20]);
  assert.equal(t.periods["12w"].start, ago(84));
});
