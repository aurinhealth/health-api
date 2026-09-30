import test from "node:test";
import assert from "node:assert/strict";
import { RUNNING_WORKOUTS, generateWorkout, searchWorkoutLibrary, buildIntervalsEvent } from "../src/workout-library.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { classifyPlannedWorkout } from "../src/planned-workout.js";
import { stepRows } from "../src/workout-explanation.js";
import { renderForEnvironment } from "../src/workout-model.js";
import { estimateThresholdPace, paceZones, sanitizeTrainingProfile, parsePace, formatPace } from "../src/training-zones.js";
import { athleteThresholds } from "../src/intervals-athlete.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const week = days => ({ days: days.map(([date, planned = [], completed = []]) => ({ date, daily: { training: { planned, completed } } })) });
const wellness = { wellness: [{ id: "2026-09-30", ctl: 50, atl: 45 }] };

test("running catalog: unique ids, lengths match names, every system covered", () => {
  assert.ok(RUNNING_WORKOUTS.length >= 200);
  assert.equal(new Set(RUNNING_WORKOUTS.map(w => w.id)).size, RUNNING_WORKOUTS.length);
  for (const w of RUNNING_WORKOUTS) {
    assert.equal(w.sport, "run");
    const named = w.name.match(/· (\d+) min$/);
    if (named) assert.ok(Math.abs(w.duration_minutes - Number(named[1])) <= 1, w.id);
    assert.match(w.intervals_description, /% Pace/);
  }
  for (const system of ["recovery", "endurance", "tempo", "threshold", "vo2max", "anaerobic", "sprint"]) assert.ok(RUNNING_WORKOUTS.some(w => w.primary_system === system), system);
  assert.ok(!RUNNING_WORKOUTS.some(w => w.primary_system === "sweet_spot"));
  assert.ok(RUNNING_WORKOUTS.filter(w => w.source_kind === "research").every(w => w.citation));
});

test("threshold pace from races and tests", () => {
  assert.equal(estimateThresholdPace("race5k", { time: "20:00" }).formatted, "4:15");
  assert.equal(estimateThresholdPace("race10k", { time: "45:00" }).formatted, "4:34");
  assert.equal(estimateThresholdPace("test30", { pace20: "4:40" }).thresholdPace, 280);
  assert.equal(estimateThresholdPace("race", { distanceKm: "21,1", time: "1:40:00" }).formatted, estimateThresholdPace("half", { time: "1:40:00" }).formatted);
  assert.throws(() => estimateThresholdPace("race5k", { time: "5:00" }), /rozsah/);
  assert.equal(parsePace("4:05"), 245);
  assert.equal(formatPace(245), "4:05");
});

test("pace zones follow threshold speed and accept custom bounds", () => {
  const z = paceZones({}, 270);
  assert.equal(z.length, 7);
  assert.equal(z[0].paceSlow, null);
  assert.equal(formatPace(z[4].paceSlow), "4:30"); // Z5a starts at threshold
  assert.ok(z[1].paceSlow > z[1].paceFast); // slower pace is the larger number
  const p = sanitizeTrainingProfile({ runThresholdPace: "4:30", paceZoneModel: "custom", paceZoneBounds: [80, 90, 100], runLthr: 172 });
  assert.deepEqual([p.runThresholdPace, p.runLthr, p.paceZoneModel], [270, 172, "custom"]);
  assert.equal(paceZones(p, 270).length, 4);
  assert.throws(() => sanitizeTrainingProfile({ runThresholdPace: "1:30" }), /Prahové tempo/);
});

test("a manual threshold pace wins over Intervals.icu", async () => {
  const fetchImpl = async () => Response.json({ sportSettings: [{ types: ["Run"], threshold_pace: 3.7, lthr: 175 }] });
  const t = await athleteThresholds({ INTERVALS_API_KEY: "k" }, fetchImpl);
  assert.deepEqual([t.runThresholdPace, t.runPaceSource, t.runLthr], [270, "intervals-settings", 175]);
  assert.equal(t.paceZones.length, 7);
});

test("runs and rides are told apart, also by name when the type is missing", () => {
  const runs = [["2026-09-28", [], [{ type: "Run", name: "Tempo run", tss: 70, durationHours: .9 }]], ["2026-09-29", [], [{ type: "", name: "Ranní běh", tss: 40, durationHours: .8 }]]];
  const run = buildCyclingCoachV2({ date: "2026-09-30", week: week(runs), fitness: wellness, sport: "run" });
  const ride = buildCyclingCoachV2({ date: "2026-09-30", week: week(runs), fitness: wellness });
  assert.equal(run.load.hardBikeDaysRolling7d, 1);
  assert.equal(ride.load.hardBikeDaysRolling7d, 0);
  assert.equal(run.sport, "run");
});

test("run coach: a week off brings you back with an easy run", () => {
  const coach = buildCyclingCoachV2({ date: "2026-09-30", week: week([["2026-09-20", [], [{ type: "Run", name: "Easy", durationHours: 1 }]]]), fitness: wellness, sport: "run" });
  assert.equal(coach.recommendation.session.kind, "endurance");
  assert.match(coach.rationale[0], /bez běhu/);
  assert.equal(coach.constraints.availableMinutes, 60);
});

test("a planned Intervals run is classified from its % Pace steps", () => {
  const planned = { name: "Intervaly", type: "Run", description: "- 15m 80% Pace\n\n5x\n- 4m 106% Pace\n- 3m 70% Pace\n\n- 10m 78% Pace" };
  const info = classifyPlannedWorkout(planned, "run");
  assert.equal(info.system, "vo2max");
  assert.equal(info.minutes, 60);
  assert.equal(classifyPlannedWorkout({ name: "Lehký", type: "Run", description: "- 45m Z2 Pace" }, "run").system, "endurance");
});

test("generate a run: follows the plan, shows paces and a treadmill Intervals event", async () => {
  const plan = { name: "Prahové úseky", type: "Run", description: "- 12m 78% Pace\n\n4x\n- 8m 99% Pace\n- 2m 72% Pace\n\n- 8m 76% Pace" };
  const health = { sleep: [{ type: "sleep", durationMin: 480, endTime: "2026-09-30T06:30:00" }] };
  const coach = buildCyclingCoachV2({ date: "2026-09-30", week: week([["2026-09-30", [plan]]]), fitness: wellness, health, sport: "run" });
  assert.equal(coach.readiness.status, "green");
  assert.equal(coach.recommendation.session.kind, "threshold");
  const db = scopedDb(createD1(), 1);
  const thresholds = { runThresholdPace: 270, paceZones: paceZones({}, 270) };
  const r = await generateWorkout(db, { sport: "run", date: "2026-09-30", coach, environment: "indoor", thresholds });
  assert.equal(r.sport, "run");
  assert.equal(r.workout.sport, "run");
  assert.equal(r.workout.primary_system, "threshold");
  assert.equal(r.explanation.thresholdPace, 270);
  const work = r.explanation.steps.flatMap(g => g.steps).find(x => x.percentLow >= 96);
  assert.ok(work.paceFast && work.paceSlow);
  assert.equal(work.wattsLow, null);
  assert.match(r.explanation.how[0], /4:30/);
  assert.equal(r.explanation.planned.system, "threshold");
  const event = buildIntervalsEvent(r.workout, "2026-10-01", "indoor");
  assert.equal(event.type, "VirtualRun");
  assert.equal(buildIntervalsEvent(r.workout, "2026-10-01", "outdoor").type, "Run");
});

test("run sweet spot maps to threshold; outdoor paces get a range and hill notes", async () => {
  const db = scopedDb(createD1(), 2);
  const r = await generateWorkout(db, { sport: "run", date: "2026-09-30", coach: { recommendation: { session: { kind: "sweet_spot" } } }, availabilityMinutes: 60 });
  assert.equal(r.system, "threshold");
  const hills = RUNNING_WORKOUTS.find(w => w.id === "run-hills-6x2-60");
  const outdoor = renderForEnvironment(hills, "outdoor");
  assert.match(outdoor.environment_notes[0], /kopec/);
  assert.match(renderForEnvironment(hills, "indoor").environment_notes[0], /sklon 6–8 %/);
  const rows = stepRows(JSON.parse(outdoor.structure_json), { environment: "outdoor", sport: "run", thresholdPace: 270 });
  const work = rows.find(g => g.repeats > 1 && g.steps[0].percentLow >= 100).steps[0];
  assert.equal(work.percentHigh - work.percentLow, 4);
  const search = await searchWorkoutLibrary(db, { sport: "run", system: "vo2max", durationMinutes: 45, limit: 5 });
  assert.ok(search.workouts.length > 0 && search.workouts.every(w => w.sport === "run"));
});
