import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { generateWorkout, RUNNING_WORKOUTS, resizeStructure } from "../src/workout-library.js";
import { athleteThresholds } from "../src/intervals-athlete.js";
import { explainWorkout } from "../src/workout-explanation.js";
import { weekProposal } from "../src/adaptive-week.js";
import { sanitizeWeekPlan } from "../src/week-planner.js";

const week = days => ({ days: days.map(([date, planned = [], completed = []]) => ({ date, daily: { training: { planned, completed } } })) });
const ride = (date, minutes) => [date, [], [{ type: "Ride", name: "Endurance", durationHours: minutes / 60, tss: Math.round(minutes / 60 * 45) }]];
const rested = date => ({ sleep: [{ type: "sleep", durationMin: 480, endTime: date + "T06:30:00" }] });
const date = "2026-10-01";
const history = [ride("2026-09-22", 45), ride("2026-09-24", 45), ride("2026-09-26", 40), ride("2026-09-29", 45)];
const coachAt = (ctl, extra = {}) => buildCyclingCoachV2({ date, week: week(history), fitness: { wellness: [{ id: date, ctl, atl: ctl - 2 }] }, health: rested(date), ...extra });

test("a fresh beginner gets an aerobic ride, not intervals; a fit athlete with the same week gets quality", () => {
  const beginner = coachAt(10), fit = coachAt(55);
  assert.equal(beginner.constraints.novice, true);
  assert.equal(beginner.readiness.status, "green");
  assert.equal(beginner.recommendation.session.kind, "endurance");
  assert.ok(beginner.rationale.some(r => /aerobní základ bez intervalů/.test(r)));
  assert.equal(fit.constraints.novice, false);
  assert.ok(["sweet_spot", "threshold", "vo2"].includes(fit.recommendation.session.kind));
  // Even a build phase picks no quality for a beginner.
  assert.equal(coachAt(10, { goal: { phase: "build" } }).recommendation.session.kind, "endurance");
});

test("a beginner's ride grows at most 10 % over the longest ride of the last two weeks", () => {
  const free = coachAt(10, { availabilityMinutes: 180 });
  assert.equal(free.constraints.availableMinutes, 60);
  assert.ok(free.rationale.some(r => /začátečník: nejdelší jízda za 2 týdny měla 45 min/.test(r)));
  const longer = buildCyclingCoachV2({ date, week: week([...history, ride("2026-09-30", 90)]), fitness: { wellness: [{ id: date, ctl: 12, atl: 10 }] }, health: rested(date), availabilityMinutes: 180 });
  assert.equal(longer.constraints.availableMinutes, 100);
  // Without fitness data and with two short rides: the length line says why.
  const few = buildCyclingCoachV2({ date, week: week([ride("2026-09-27", 40), ride("2026-09-29", 40)]), health: rested(date), manualReadiness: 80 });
  assert.equal(few.constraints.novice, true);
  assert.equal(few.constraints.availableMinutes, 60);
  assert.match(few.rationale.at(-1), /^Délka 60 min: .*začátečník: nejdelší jízda za 2 týdny měla 40 min, nejvýš 60 min/);
  // A beginner is not sent into a recovery week by the load rule.
  assert.equal(coachAt(12).week.recoveryWeek, false);
});

test("too little data is said as such, not as fatigue", () => {
  const none = buildCyclingCoachV2({ date, week: week([]) });
  assert.equal(none.readiness.status, "red");
  assert.deepEqual(none.recommendation.adaptations, ["zatím málo dat: držím lehkou intenzitu"]);
  const tired = buildCyclingCoachV2({ date, week: week(history), fitness: { wellness: [{ id: date, ctl: 50, atl: 85 }] }, health: { sleep: [{ type: "sleep", durationMin: 300, endTime: date + "T06:30:00" }] }, manualReadiness: 10 });
  assert.equal(tired.readiness.status, "red");
  assert.ok(tired.recommendation.adaptations.includes("vysoká únava: bez intenzity"));
});

test("without LTHR the heart-rate zones come from the max and resting heart rate in the profile", async () => {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));");
  raw.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify({ sex: "female", age: 30, hrmax: 190, rhr: 60 }));
  const t = await athleteThresholds({ DB: scopedDb(raw, 7), USER_ID: 7 });
  assert.equal(t.hrModel, "karvonen");
  assert.equal(t.hrZones.find(z => z.zone === 2).bpmHigh, Math.round(60 + 130 * 0.7));
  assert.equal(t.runHrZones.find(z => z.zone === 2).bpmHigh, Math.round(60 + 130 * 0.7));
  const easyRun = RUNNING_WORKOUTS.find(w => w.id === "run-easy-40");
  assert.match(explainWorkout(easyRun, { sport: "run", thresholds: t }).how.join(" "), /Tep drž do 151 bpm \(Z2 z tepové rezervy/);
  // An easy ride without FTP is steered by heart rate too.
  const easyRide = { primary_system: "endurance", duration_minutes: 60, structure_json: "[]", sport: "ride" };
  assert.match(explainWorkout(easyRide, { thresholds: t }).how.join(" "), /Tep drž do 151 bpm/);
});

test("a beginning runner gets run/walk within the run cap, and run/walk grows by cycles", async () => {
  const runCoach = buildCyclingCoachV2({ date, week: week([]), sport: "run" });
  assert.equal(runCoach.constraints.novice, true);
  assert.ok(runCoach.recommendation.session.durationMinutes <= 30);
  const generated = await generateWorkout(scopedDb(createD1(), 7), { sport: "run", environment: "outdoor", date, coach: runCoach });
  assert.equal(generated.workout.family, "run-walk");
  assert.ok(generated.workout.duration_minutes <= 35);
  const walks = RUNNING_WORKOUTS.filter(w => w.family === "run-walk");
  assert.ok(walks.length >= 15);
  for (const w of walks) assert.match(w.intervals_description, /% Pace/);
  const base = JSON.parse(walks.find(w => w.id === "run-walk-2-2-30").structure_json);
  const longer = resizeStructure(base, 40, { sport: "run", system: "endurance" });
  assert.equal(longer.structure[1].repeats, base[1].repeats + 3);
  assert.ok(!longer.structure.some(b => /klus/.test(b.note || "")));
});

test("without fitness data the week plan keeps a beginner's running under the weekly floor", () => {
  const prefs = sanitizeWeekPlan({ weeklyActivities: 3, availability: Array(7).fill({ minutes: 60, preferredSports: ["run"] }) });
  const p = weekProposal({ prefs, start: "2026-10-05", today: "2026-10-05", state: { status: "active" }, focus: { sport: "running" }, history: [] });
  const runs = p.items.filter(x => x.sport === "run");
  assert.equal(p.targets.status, "estimated");
  assert.ok(runs.length >= 2);
  assert.ok(runs.reduce((n, x) => n + x.minutes, 0) <= 60);
});

test("with no watts, pace or heart rate an easy session is steered by breathing", () => {
  const easyRide = { primary_system: "endurance", duration_minutes: 60, structure_json: "[]", sport: "ride" };
  assert.match(explainWorkout(easyRide, { thresholds: {} }).how.join(" "), /mluvit v celých větách/);
  const easyRun = RUNNING_WORKOUTS.find(w => w.id === "run-easy-40");
  assert.match(explainWorkout(easyRun, { sport: "run", thresholds: {} }).how.join(" "), /mluvit v celých větách/);
});
