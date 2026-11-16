// Redesign part S2, the server's Training data (2026-11-16): Load balance and
// Muscle load in words, the plan overview, Log workout for every sport, the
// goal type, the return after illness and the coach details.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadBalance, muscleLoad, USUAL_BAND, MIN_HISTORY_DAYS } from "../src/workload-ratio.js";
import { buildTraining, withHeartRateLoad } from "../src/app-training.js";
import { gymSessions, strengthLoad } from "../src/training-load.js";
import { planOverview } from "../src/plan-overview.js";
import { getTemplate } from "../src/training-plans.js";
import { manualWorkoutType, MANUAL_SPORTS } from "../src/activity-type.js";
import { goalTypeOf, withGoalType, normalizeFocus } from "../src/athlete-focus.js";
import { illnessReturn, returnDay } from "../src/illness-return.js";
import { effortScale, intensityRpe } from "../src/gym-intensity.js";
import { stepRows } from "../src/workout-explanation.js";
import { gymAlternatives } from "../src/gym-catalog.js";

const date = "2026-11-16";
const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const days = (n, load, from = 0) => Array.from({ length: n }, (_, i) => ({ id: shift(date, from - n + 1 + i), load: typeof load === "function" ? load(i) : load }));
const squats = (day, rpe = 8) => Array.from({ length: 5 }, (_, k) => ({ workout_date: day, type: "WORK", exercise: "Barbell back squat", set_no: k + 1, actual_kg: 80, actual_reps: 8, rpe }));
const numbersIn = view => JSON.stringify({ ...view, series: undefined, band: undefined, historyDays: undefined, needsDays: undefined }).match(/\d+\.\d+/g);

test("Load balance is words, the usual band and a 14-day series, never a ratio as text", () => {
  const view = loadBalance(days(40, 50), date);
  assert.equal(view.level, "usual");
  assert.deepEqual(view.band, USUAL_BAND);
  assert.deepEqual(USUAL_BAND, { low: 0.9, high: 1.15 });
  assert.equal(view.needsDays, MIN_HISTORY_DAYS);
  assert.equal(view.series.length, 14);
  assert.equal(view.series.at(-1).date, date);
  assert.ok(view.text && view.label);
  // The only ratio is each point's plot, for the dial and the chart.
  assert.equal(numbersIn(view), null);
  assert.equal(view.series.at(-1).plot, 1);
  // A hard last week reads above, in words.
  assert.equal(loadBalance(days(40, i => (i >= 33 ? 90 : 50)), date).level, "above");
});

test("Load balance waits for 21 days of history and is null without any load", () => {
  assert.equal(loadBalance([], date), null);
  const learning = loadBalance(days(14, 50), date);
  assert.equal(learning.level, null);
  assert.equal(learning.text, null);
  assert.equal(learning.historyDays, 14);
  assert.equal(loadBalance(days(21, 50), date).level, "usual");
});

test("Muscle load counts only the gym's work sets and is empty, not 0, without a gym", () => {
  const sets = [];
  for (let i = 0; i < 35; i += 3) sets.push(...squats(shift(date, -i)));
  const view = muscleLoad(gymSessions(sets), date, strengthLoad);
  assert.ok(view.level);
  assert.equal(view.series.length, 14);
  // A swimmer without the gym: no dial value at all.
  assert.equal(muscleLoad([], date, strengthLoad), null);
  // Training → the card: rides and runs move Load balance, never Muscle load.
  const wellness = days(40, 60);
  const training = buildTraining({ date, fitness: { wellness }, gymSets: [] });
  assert.equal(training.loadBalance.level, "usual");
  assert.equal(training.muscleLoad, null);
  // An older caller that reads no sets gets no muscleLoad key (old builds unchanged).
  assert.equal("muscleLoad" in buildTraining({ date, fitness: { wellness } }), false);
  // Rows dated with a time still count by their day.
  const timed = sets.map(s => ({ ...s, workout_date: s.workout_date + "T18:00:00" }));
  assert.equal(buildTraining({ date, fitness: { wellness }, gymSets: timed }).muscleLoad.level, view.level);
});

test("the Muscle load query stays on the strength_sets date index", () => {
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const sql = source.match(/SELECT workout_date,type,exercise,set_no,actual_kg,actual_reps,rpe FROM strength_sets WHERE user_id=\? AND completed=1 AND type IN \('WORK','DROP'\) AND workout_date>=\? AND workout_date<=\?/)[0];
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(1, "2026-10-06", date + "~").map(r => r.detail).join(" | ");
  assert.match(plan, /USING INDEX idx_strength_sets_user_date \(user_id=\? AND workout_date>\? AND workout_date<\?\)/, plan);
});

test("the plan overview lists done, current and coming weeks with the race day last", () => {
  const template = getTemplate("run-half");
  assert.ok(template, "the half marathon plan exists");
  const start = shift("2026-11-16", -14), plan = { id: "p1", templateId: template.id, startDate: start, raceDate: shift(start, template.weeks.length * 7 - 1), raceKm: 21.1 };
  const view = planOverview(plan, { today: date, doneDates: [shift(start, 1), shift(start, 3), shift(start, 8), date], days: [1, 3, 5] });
  assert.equal(view.weeks.length, template.weeks.length);
  assert.deepEqual(view.weeks.slice(0, 4).map(w => w.status), ["done", "done", "current", "future"]);
  assert.equal(view.week, 3);
  assert.equal(view.weeks[0].doneDays, 2);
  assert.equal(view.weeks[2].doneDays, 1);
  assert.equal(view.weeks[3].doneDays, undefined);
  assert.equal(typeof view.weeks[0].completion, "number");
  assert.equal(view.weeks[2].completion, undefined);
  assert.equal(view.raceDay.date, plan.raceDate);
  // Taper weeks carry the plan's own volume against the usual week (M-TRI-1).
  const taper = view.weeks.filter(w => w.phase === "taper");
  assert.ok(taper.length && taper.every(w => w.volumePercent > 0 && w.volumePercent < 100), JSON.stringify(taper));
  assert.ok(view.weeks.filter(w => !["taper", "race"].includes(w.phase)).every(w => w.volumePercent == null));
  assert.equal(planOverview(null, { today: date }), null);
});

test("a triathlon plan's taper week says about 70 % and its race week half", () => {
  const template = getTemplate("tri-olympic") || getTemplate("tri-sprint");
  const plan = { templateId: template.id, startDate: "2026-09-07", raceDate: shift("2026-09-07", template.weeks.length * 7 - 1) };
  const view = planOverview(plan, { today: date });
  const byPhase = Object.fromEntries(view.weeks.filter(w => w.volumePercent).map(w => [w.phase, w.volumePercent]));
  assert.deepEqual(byPhase, { taper: 72, race: 50 });
});

test("Log workout takes every sport and keeps the type for Apple Health and Google Health", () => {
  assert.deepEqual(MANUAL_SPORTS, ["ride", "run", "swim", "gym", "other"]);
  assert.equal(manualWorkoutType("ride"), "Ride");
  assert.equal(manualWorkoutType("run"), "Run");
  assert.equal(manualWorkoutType("gym"), "WeightTraining");
  assert.equal(manualWorkoutType("swim"), "Swim");
  assert.equal(manualWorkoutType("swim", "OpenWaterSwim"), "OpenWaterSwim");
  assert.equal(manualWorkoutType("run", "TrailRun"), "TrailRun");
  // A type of another sport does not change the sport picked.
  assert.equal(manualWorkoutType("run", "Swim"), "Run");
  assert.equal(manualWorkoutType("other", "Yoga"), "Yoga");
  assert.equal(manualWorkoutType("other", "Rowing"), "Rowing");
  assert.equal(manualWorkoutType("other", "NotAType"), "Workout");
  assert.equal(manualWorkoutType("other"), "Workout");
  assert.equal(manualWorkoutType("chess"), null);
});

test("a logged swim or other workout with heart rate gets its strain from the heart rate, as the gym does", () => {
  const profile = { age: 40, rhr: 50, hrmax: 182 };
  const training = { completed: [
    { type: "Swim", durationHours: 0.75, payload: { average_heartrate: 140 } },
    { type: "Yoga", durationHours: 1, payload: { average_heartrate: 95 } },
    { type: "WeightTraining", durationHours: 1, payload: {} }
  ] };
  const out = withHeartRateLoad(training, [], profile, date).completed;
  assert.ok(out[0].tss > 0 && out[0].tssFromHeartRate);
  assert.ok(out[1].tss > 0 && out[1].tssFromHeartRate);
  assert.ok(out[2].tss > 0 && out[2].tssFromLength);
});

test("goalType reads the old Czech goal words and leaving Lose weight resets the calorie goal", () => {
  assert.equal(goalTypeOf({ sportGoal: "zhubnout" }), "lose");
  assert.equal(goalTypeOf({ sportGoal: "Závod" }), "race");
  assert.equal(goalTypeOf({ sportGoal: "Ironman under 11 hours" }), "");
  assert.equal(normalizeFocus({ goalType: "fitness" }).goalType, "fitness");
  assert.equal("goalType" in normalizeFocus({ goalType: "nonsense" }), false);
  const saved = { goalType: "lose", sportGoal: "zhubnout", goal: "lose_0.5" };
  // The new app picks Race: the unchanged losing goal becomes maintain, the old words follow.
  const race = withGoalType({ ...saved, goalType: "race" }, saved);
  assert.equal(race.goal, "maintain");
  assert.equal(race.goalType, "race");
  assert.equal(race.sportGoal, "závod");
  // A losing goal the athlete changed in the same save stays.
  assert.equal(withGoalType({ ...saved, goalType: "race", goal: "lose_0.25" }, saved).goal, "lose_0.25");
  // An older app only changes the words and sends the key back: the words win.
  const old = withGoalType({ ...saved, sportGoal: "zlepšit kondici" }, saved);
  assert.equal(old.goalType, "fitness");
  assert.equal(old.goal, "maintain");
  // An older build saving anything else sends no key: the saved one stays.
  const own = { goalType: "race", sportGoal: "Sub 3 marathon", goal: "maintain" };
  assert.equal(withGoalType(normalizeFocus({ sportGoal: "Sub 3 marathon" }), own, undefined).goalType, "race");
  // Own words stay as they are.
  assert.equal(withGoalType({ goalType: "race", sportGoal: "Prague half under 1:45", goal: "maintain" }, {}).sportGoal, "Prague half under 1:45");
});

test("the return after illness: 3 easy days, a week after more than 7 days ill, then the doctor sentence", () => {
  const short = { status: "active", recoveredAt: "2026-11-14", sickFrom: "2026-11-10" };
  const card = illnessReturn(short, date);
  assert.equal(card.easyDays, 3);
  assert.equal(card.day, 3);
  assert.equal(card.until, "2026-11-16");
  assert.equal(card.doctor, null);
  assert.equal(illnessReturn(short, "2026-11-17"), null);
  assert.equal(returnDay(short, "2026-11-14"), 0);
  const long = { status: "active", recoveredAt: "2026-11-14", sickFrom: "2026-11-01" };
  const week = illnessReturn(long, date);
  assert.equal(week.easyDays, 7);
  assert.equal(week.until, "2026-11-20");
  assert.ok(week.doctor);
  assert.equal(illnessReturn(long, "2026-11-21"), null);
  // Still Sick, or never ill: no card, and no speed choice anywhere.
  assert.equal(illnessReturn({ ...long, status: "sick" }, date), null);
  assert.equal(illnessReturn({ status: "active" }, date), null);
  assert.equal(JSON.stringify(week).match(/slow|quick|balanced/i), null);
});

test("the effort letters carry reps-left anchors from the one RPE table", () => {
  const scale = effortScale();
  assert.deepEqual(scale.map(s => s.letter), ["E", "M", "H", "F"]);
  for (const s of scale) assert.equal(s.rpe, intensityRpe(s.letter));
  assert.deepEqual(scale.map(s => s.repsLeft), [{ min: 4, max: null }, { min: 2, max: 3 }, { min: 1, max: 1 }, { min: 0, max: 0 }]);
});

test("a run without a threshold pace gets effort words and no paces", () => {
  const structure = [{ durationMinutes: 10, power: 70 }, { repeats: 4, steps: [{ durationMinutes: 4, power: 98 }, { durationMinutes: 2, power: 60 }] }, { durationMinutes: 8, power: 70 }];
  const rows = stepRows(structure, { sport: "run" });
  const flat = rows.flatMap(b => b.steps);
  assert.ok(flat.every(s => s.paceSlow == null && s.paceFast == null));
  assert.deepEqual(flat.map(s => s.effort), ["easy", "threshold", "easy", "easy"]);
  // With a threshold pace: paces, no effort word.
  const paced = stepRows(structure, { sport: "run", thresholdPace: 270 }).flatMap(b => b.steps);
  assert.ok(paced.every(s => s.paceSlow && s.effort == null));
});

test("a swapped-in exercise's weight is only suggested and a main lift gets one warm-up set", () => {
  const alternatives = gymAlternatives("Barbell back squat", [], [], {}, () => true, { sex: "male", experience: "intermediate" });
  assert.ok(alternatives.length);
  for (const a of alternatives) assert.ok(["suggested", "start-light"].includes(a.weight));
  // Without any history every weight is a start-light one.
  assert.ok(alternatives.every(a => a.weight === "start-light"));
  const lift = alternatives.find(a => a.warmup && a.kg > 0);
  assert.ok(lift, "a main lift among the squat's alternatives");
  assert.equal(lift.warmupSet.reps, 5);
  assert.ok(lift.warmupSet.kg < lift.kg);
  assert.ok(alternatives.filter(a => !a.warmup).every(a => a.warmupSet == null));
});

test("the plan's done days seek the workout index by date", () => {
  const source = readFileSync(new URL("../src/plan-context.js", import.meta.url), "utf8");
  const sql = source.match(/export async function planSportDates[\s\S]*?prepare\("([^"]+)"\)/)[1];
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(1, "2026-10-01", "2026-11-17").map(r => r.detail).join(" | ");
  assert.match(plan, /idx_health_datapoints_user_1 \(user_id=\? AND source_family=\? AND data_type=\? AND start_time>\? AND start_time<\?\)/, plan);
});

test("the first gym day is one seek on the date index, and a lifter back from a break is not learning", () => {
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const sql = source.match(/SELECT workout_date AS d FROM strength_sets WHERE user_id=\? AND completed=1 ORDER BY workout_date LIMIT 1/)[0];
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(1).map(r => r.detail).join(" | ");
  assert.match(plan, /idx_strength_sets_user_date \(user_id=\?\)/, plan);
  assert.doesNotMatch(plan, /TEMP B-TREE/, plan);
  const back = [];
  for (let i = 0; i < 10; i += 2) back.push(...squats(shift(date, -i)));
  assert.equal(muscleLoad(gymSessions(back), date, strengthLoad).state, "learning");
  const returning = muscleLoad(gymSessions(back), date, strengthLoad, "2026-03-01");
  assert.equal(returning.state, "ready");
  assert.equal(returning.level, "wellAbove");
  // History but nothing in the last 28 days: quiet, not learning.
  assert.equal(loadBalance([{ id: shift(date, -35), load: 50 }], date).state, "quiet");
});
