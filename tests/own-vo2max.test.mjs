import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { workoutEstimate, activityIndex, restingEstimate, fitnessAge, normVo2, compositeAge, rideFactor, estimateDay, inputsFromRows, sessionsFromRows, observedMaxHr, sleepHabits, DEFAULT_RIDE_FACTOR } from "../src/own-vo2max.js";
import { updateFitnessEstimate, latestFitnessEstimate, profileInputs, FITNESS_ESTIMATES_TABLE } from "../src/own-vo2max-store.js";
import { PERSONAL_TABLES } from "../src/tenancy.js";
import { withTimeZone } from "../src/user-time.js";
import { MODEL_VERSION } from "../src/own-vo2max.js";

const athlete = { restHr: 50, maxHr: 190, weight: 80 };
const near = (actual, expected, tolerance = 0.15) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

test("a ride: ACSM cycling VO2 at the average power, extrapolated by the heart-rate reserve", () => {
  // 200 W at 80 kg = 34 ml/kg/min; 60 % of the reserve: 3.5 + 30.5 / 0.6.
  const e = workoutEstimate({ date: "2026-10-01", kind: "ride", minutes: 60, avgHr: 134, avgPower: 200 }, athlete);
  assert.equal(e.sport, "ride");
  near(e.value, 54.3);
  assert.equal(e.quality, 1);
  // Uneven or drifting rides count less; too short, too easy or too hard not at all.
  assert.ok(workoutEstimate({ date: "2026-10-01", kind: "ride", minutes: 60, avgHr: 134, avgPower: 200, normPower: 250 }, athlete).quality < 0.6);
  assert.ok(workoutEstimate({ date: "2026-10-01", kind: "ride", minutes: 60, avgHr: 134, avgPower: 200, decoupling: 12 }, athlete).quality < 0.5);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "ride", minutes: 15, avgHr: 134, avgPower: 200 }, athlete), null);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "ride", minutes: 60, avgHr: 90, avgPower: 120 }, athlete), null);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "ride", minutes: 60, avgHr: 188, avgPower: 300 }, athlete), null);
  // Without power a ride says nothing here (it counts in the resting layer).
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "ride", minutes: 60, avgHr: 134 }, athlete), null);
});

test("a run or brisk walk: ACSM from speed and climb; a treadmill, a hilly run or an everyday walk not", () => {
  // 12 km/h = 200 m/min, flat: 0.93 × 40 + 3.5 = 40.7 ml/kg/min at 70 % of the reserve.
  const run = workoutEstimate({ date: "2026-10-01", kind: "run", minutes: 45, avgHr: 148, speed: 200 / 60, distance: 9000, gain: 0 }, athlete);
  assert.equal(run.sport, "run");
  near(run.value, 56.6);
  // Some climb raises the cost and the estimate, a lot of it drops the run.
  assert.ok(workoutEstimate({ date: "2026-10-01", kind: "run", minutes: 45, avgHr: 148, speed: 200 / 60, distance: 9000, gain: 90 }, athlete).value > run.value);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "run", minutes: 45, avgHr: 148, speed: 200 / 60, distance: 9000, gain: 300 }, athlete), null);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "run", minutes: 45, avgHr: 148, speed: 200 / 60, indoor: true }, athlete), null);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "walk", minutes: 45, avgHr: 100, speed: 1.2 }, athlete), null);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "walk", minutes: 45, avgHr: 125, speed: 1.7 }, athlete).sport, "walk");
  // Swim and Gym have no workout estimate.
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "swim", minutes: 45, avgHr: 140, speed: 1 }, athlete), null);
  assert.equal(workoutEstimate({ date: "2026-10-01", kind: "strength", minutes: 60, avgHr: 120 }, athlete), null);
});

const week = (kind, perWeek, extra = {}) => Array.from({ length: perWeek * 6 }, (_, i) => ({ date: "2026-10-" + String(1 + (i % 28)).padStart(2, "0"), kind, minutes: 60, ...extra }));

test("the HUNT activity index is measured from every sport, Swim and Gym included", () => {
  assert.equal(activityIndex([], athlete).index, 0);
  // Gym four times a week, no heart rate: sweaty, almost daily, from 30 min.
  assert.deepEqual(activityIndex(week("strength", 4), athlete), { index: 9.5, frequency: 3, intensity: 5, duration: 1.5, perWeek: 4 });
  // Swims twice a week with one hard session a week.
  const swims = [...week("swim", 1, { avgHr: 130 }), ...week("swim", 1, { avgHr: 130, maxHr: 182 })];
  assert.equal(activityIndex(swims, athlete).index, 13.5);
  // Easy walks (no sweat) count as not active.
  assert.equal(activityIndex(week("walk", 5, { avgHr: 85 }), athlete).index, 0);
});

test("the resting layer: HUNT with BMI, Uth without height or weight", () => {
  const base = { age: 32, sex: "male", height: 180, weight: 87.5, restHr: 55, maxHr: 192, index: 14.5 };
  const male = restingEstimate(base);
  // 92.05 − 0.327·32 − 0.933·27.0 − 0.167·55 + 0.257·14.5 − 2 (calibration)
  near(male.value, 48.9, 0.2);
  assert.equal(male.model, "hunt");
  assert.ok(restingEstimate({ ...base, sex: "female" }).value < male.value);
  assert.ok(restingEstimate({ ...base, restHr: 65 }).value < male.value);
  assert.ok(restingEstimate({ ...base, index: 0 }).value < male.value);
  const uth = restingEstimate({ ...base, height: null });
  assert.equal(uth.model, "uth");
  near(uth.value, 15.3 * 192 / 55, 0.1);
  assert.equal(restingEstimate({ ...base, restHr: null }), null);
});

test("fitness age from the HUNT 3 norms", () => {
  // The line through the HUNT 3 means: men 43.95 at 50, 0.384 a year.
  assert.equal(fitnessAge(43.95, "male"), 50);
  assert.equal(fitnessAge(47.8, "male"), 40);
  assert.equal(fitnessAge(35.2, "female"), 50);
  assert.equal(fitnessAge(70, "male"), 20);
  assert.equal(fitnessAge(10, "female"), 90);
  // Older means lower, smoothly: 1 ml/kg/min is about 2.6 years for a man.
  near(fitnessAge(46.8, "male") - fitnessAge(47.8, "male"), 2.6, 0.1);
  // Unknown sex: the mean of both.
  near(fitnessAge(44, null), (fitnessAge(44, "male") + fitnessAge(44, "female")) / 2, 0.1);
  assert.equal(normVo2(50, "male"), 44);
  assert.equal(normVo2(25, "female"), 43.2);
});

test("composite age: half the fitness gap plus capped habits, at least three of them", () => {
  assert.equal(compositeAge({ age: 40, sex: "male", fitness: 30, steps: 12000, gymPerWeek: 2 }), null);
  const fit = compositeAge({ age: 40, sex: "male", fitness: 30, sleepHours: 8, sleepSpreadMin: 20, activityMinutes: 400, gymPerWeek: 2, steps: 12000, restHr: 50, bmi: 23 });
  // 40 + (30 − 40) / 2 − 0.5 − 1.5 − 1 − 1 − 1.
  assert.equal(fit.value, 30);
  const tired = compositeAge({ age: 40, sex: "male", fitness: 50, sleepHours: 5, sleepSpreadMin: 120, activityMinutes: 0, gymPerWeek: 0, steps: 2000, restHr: 80, bmi: 35 });
  // Habits are capped at +8 years: 40 + 5 + 8.
  assert.equal(tired.value, 53);
});

test("the ride factor is learned from both sports in the window, else carried over", () => {
  const est = (sport, value) => ({ sport, value });
  assert.deepEqual(rideFactor([est("run", 50), est("run", 51), est("run", 49), est("ride", 47), est("ride", 46), est("ride", 48)]), { value: 1.06, learned: true });
  // Never more than the 10 % cycling and running differ by.
  assert.deepEqual(rideFactor([est("run", 60), est("run", 60), est("run", 60), est("ride", 40), est("ride", 40), est("ride", 40)]), { value: 1.1, learned: true });
  assert.deepEqual(rideFactor([est("ride", 45)], 1.07), { value: 1.07, learned: false });
  assert.deepEqual(rideFactor([est("ride", 45)]), { value: DEFAULT_RIDE_FACTOR, learned: false });
});

const day = "2026-10-20";
const rest = Array.from({ length: 30 }, (_, i) => ({ data_type: "daily-resting-heart-rate", value_numeric: 50, sample_time: shift(day, -i) }));
function shift(date, days) { return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10); }
const ride = (date, watts, hr, minutes = 60) => ({ data_type: "activity", source_family: "intervals", start_time: date + "T17:00:00", payload_json: JSON.stringify({ type: "Ride", moving_time: minutes * 60, elapsed_time: minutes * 60, average_heartrate: hr, max_heartrate: 185, icu_average_watts: watts, icu_weighted_avg_watts: watts, start_date_local: date + "T17:00:00", start_date: date + "T15:00:00Z" }) });
const profile = { sex: "male", birthDate: "1986-05-01", height: 180, hrmax: 190 };

test("a day's estimate fuses the layers and never reads the watch's own VO2max", () => {
  const rides = Array.from({ length: 8 }, (_, i) => ride(shift(day, -i * 4), 200, 134));
  const weight = [{ data_type: "weight", value_numeric: 80, sample_time: "2026-10-01T07:00:00Z" }];
  const input = inputsFromRows({ date: day, profile, activityRows: rides, dailyRows: [...rest, ...weight] });
  const result = estimateDay(input);
  assert.equal(result.confidence, "high");
  assert.equal(result.details.workouts.ride.count, 8);
  // Rides (54.3 × 1.05) outweigh the resting layer.
  assert.ok(result.vo2max > 52 && result.vo2max < 58, String(result.vo2max));
  assert.equal(result.fitnessAge, 20);
  // A watch's daily-vo2-max among the rows changes nothing.
  const withWatch = estimateDay(inputsFromRows({ date: day, profile, activityRows: rides, dailyRows: [...rest, ...weight, { data_type: "daily-vo2-max", value_numeric: 30, sample_time: day }] }));
  assert.deepEqual(withWatch, result);
  // Real VO2max moves slowly: a day after 45.0 it is at most 1/7 higher.
  const next = estimateDay({ ...input, previous: { date: shift(day, -1), vo2max: 45, confidence: "high", model: MODEL_VERSION, rideFactor: 1.05 } });
  near(next.vo2max, 45.1, 0.05);
  // Not held back by a row from weaker data, another model version or a month ago.
  assert.equal(estimateDay({ ...input, previous: { date: shift(day, -1), vo2max: 45, confidence: "low", model: MODEL_VERSION } }).vo2max, result.vo2max);
  assert.equal(estimateDay({ ...input, previous: { date: shift(day, -1), vo2max: 45, confidence: "high", model: MODEL_VERSION - 1 } }).vo2max, result.vo2max);
  assert.equal(estimateDay({ ...input, previous: { date: shift(day, -40), vo2max: 45, confidence: "high", model: MODEL_VERSION } }).vo2max, result.vo2max);
  // The age counts full years: one more from the birthday on.
  assert.equal(inputsFromRows({ date: "2026-05-01", profile }).age, 40);
  assert.equal(inputsFromRows({ date: "2026-04-30", profile }).age, 39);
});

test("a swimmer or gym-goer without rides or runs gets the resting layer, with less confidence", () => {
  const gym = Array.from({ length: 12 }, (_, i) => ({ data_type: "activity", source_family: "local", start_time: shift(day, -i * 3) + "T10:00:00", payload_json: JSON.stringify({ type: "WeightTraining", moving_time: 3600, elapsed_time: 3600, start_date_local: shift(day, -i * 3) + "T10:00:00" }) }));
  const result = estimateDay(inputsFromRows({ date: day, profile: { ...profile, hrmax: null }, activityRows: gym, dailyRows: [...rest, { data_type: "weight", value_numeric: 80, sample_time: "2026-10-01" }] }));
  assert.equal(result.details.resting.model, "hunt");
  assert.equal(result.details.resting.activityIndex.frequency, 2);
  assert.deepEqual(result.details.workouts, {});
  assert.equal(result.confidence, "low");
  assert.equal(result.vo2max, result.details.resting.value);
  // Nothing without a resting heart rate.
  assert.equal(estimateDay(inputsFromRows({ date: day, profile, activityRows: gym, dailyRows: [] })), null);
});

test("sessions: one workout from two sources once; HRmax skips a sensor spike", () => {
  const google = { data_type: "exercise", source_family: "google-wearables", start_time: day + "T15:00:30Z", end_time: day + "T16:00:30Z", payload_json: JSON.stringify({ exercise: { exerciseType: "BIKING", activeDuration: "3600s", metricsSummary: { averageHeartRateBeatsPerMinute: "134" } } }) };
  const sessions = sessionsFromRows([ride(day, 200, 134), google]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].avgPower, 200);
  assert.equal(observedMaxHr([{ maxHr: 230 }, { maxHr: 188 }, { maxHr: 185 }]), 188);
  assert.equal(sleepHabits([{ date: day, durationMin: 400 }]).hours, null);
  // 23:00–07:00 in Prague every night across the change to winter time: no spread.
  const nights = Array.from({ length: 20 }, (_, i) => shift("2026-10-15", i)).filter(d => d !== "2026-10-25").map(d => { const summer = d < "2026-10-25"; const startZ = summer ? "21:00" : "22:00", endZ = summer ? "05:00" : "06:00"; return { date: d, startTime: shift(d, -1) + "T" + startZ + ":00Z", endTime: d + "T" + endZ + ":00Z", durationMin: 480 }; });
  assert.equal(withTimeZone("Europe/Prague", () => sleepHabits(nights)).spreadMin, 0);
});

test("the profile's HRmax counts only when typed or seen in workouts", () => {
  assert.equal(profileInputs({ saved: { hrmax: 185 }, suggested: { hrmax: 192, sources: { hrmax: "activities-6m" } } }).hrmax, 185);
  assert.equal(profileInputs({ saved: {}, suggested: { hrmax: 192, sources: { hrmax: "activities-6m" } } }).hrmax, 192);
  assert.equal(profileInputs({ saved: {}, suggested: { hrmax: 187, sources: { hrmax: "age-estimate" } } }).hrmax, null);
});

test("the daily job stores one row a day and is exported and deleted with the account", async () => {
  assert.deepEqual(PERSONAL_TABLES.fitness_estimates, { pk: ["user_id", "date"] });
  const db = createD1();
  db.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, payload_json TEXT, record_role TEXT); CREATE TABLE dashboard_profile (user_id INTEGER, id INTEGER, profile_json TEXT, PRIMARY KEY (user_id, id));");
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, start_time, end_time, sample_time, value_numeric, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  for (const r of rest) insert.run(7, "apple-health", r.data_type, null, null, r.sample_time, r.value_numeric, null);
  insert.run(7, "apple-health", "weight", null, null, "2026-10-10T07:00:00Z", 80, null);
  insert.run(7, "apple-health", "daily-vo2-max", null, null, day, 30, null);
  // Weighed daily after the day: a later run for that day still finds the weight before it.
  for (const d of ["2026-10-30", "2026-10-31", "2026-11-01"]) insert.run(7, "apple-health", "weight", null, null, d + "T07:00:00Z", 95, null);
  for (let i = 0; i < 6; i++) { const r = ride(shift(day, -i * 5), 200, 134); insert.run(7, "intervals", "activity", r.start_time, null, null, null, r.payload_json); }
  // Another user's rows stay out.
  insert.run(8, "apple-health", "daily-resting-heart-rate", null, null, day, 90, null);
  db.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify(profile));
  const env = { DB: db, USER_ID: 7 };
  const first = await withTimeZone("Europe/Prague", () => updateFitnessEstimate(env, { date: day }));
  assert.equal(first.status, "saved");
  assert.equal(first.estimate.details.restHr, 50);
  assert.equal(first.estimate.details.resting.bmi, 24.7);
  assert.equal((await updateFitnessEstimate(env, { date: day })).status, "done");
  const stored = await latestFitnessEstimate(db, 7);
  assert.equal(stored.date, day);
  assert.equal(stored.vo2max, first.estimate.vo2max);
  assert.equal(stored.details.workouts.ride.count, 6);
  // The next day starts from the stored row.
  const second = await withTimeZone("Europe/Prague", () => updateFitnessEstimate(env, { date: shift(day, 1) }));
  assert.ok(Math.abs(second.estimate.vo2max - first.estimate.vo2max) <= 1 / 7 + 0.05);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM fitness_estimates").get().n, 2);
  assert.match(FITNESS_ESTIMATES_TABLE, /PRIMARY KEY \(user_id, date\)/);
  assert.equal(await latestFitnessEstimate(db, 8), null);
});
