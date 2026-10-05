import test from "node:test";
import assert from "node:assert/strict";
import { parseIntervalsWorkoutText, classifyPlannedWorkout } from "../src/planned-workout.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { explainWorkout, stepRows } from "../src/workout-explanation.js";
import { athleteThresholds } from "../src/intervals-athlete.js";
import { CYCLING_WORKOUTS, generateWorkout } from "../src/workout-library.js";
import { renderForEnvironment } from "../src/workout-model.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

test("Intervals workout text parses zones, percentages, ramps and repeats", () => {
  const s = parseIntervalsWorkoutText("Warmup\n- 10m ramp 50-70%\n\nMain Set 4x\n- 4m 110%\n- 4m Z1\n\n- 1h Z2\n- 30s 150% 110rpm");
  assert.equal(s[0].ramp, true);
  assert.equal(s[1].repeats, 4);
  assert.equal(s[1].steps[0].power, 110);
  assert.equal(s[1].steps[1].power, 50);
  assert.equal(s[2].durationMinutes, 60);
  assert.equal(s[3].cadence, "110");
});

test("a Z1/Z2 plan is recovery, an interval plan is VO2 and load-only plans use IF", () => {
  const recovery = classifyPlannedWorkout({ name: "Recovery week ride", description: "- 48m Z1\n- 12m Z2" });
  assert.equal(recovery.system, "recovery");
  assert.equal(recovery.minutes, 60);
  assert.ok(recovery.intensityFactor < 0.6);
  assert.equal(classifyPlannedWorkout({ name: "Tuesday", description: "- 15m 60%\n5x\n- 4m 112%\n- 4m 50%\n- 10m 50%" }).system, "vo2max");
  assert.equal(classifyPlannedWorkout({ name: "Ride", durationHours: 1.5, tss: 125 }).system, "threshold");
});

const week = days => ({ days: days.map(([date, planned = [], completed = []]) => ({ date, daily: { training: { planned, completed } } })) });

test("the coach follows today's planned recovery ride and explains why", () => {
  const plan = { name: "Recovery", type: "Ride", durationHours: 1, tss: 28, description: "- 48m Z1\n- 12m Z2" };
  const coach = buildCyclingCoachV2({ date: "2026-09-30", week: week([["2026-09-30", [plan]]]), fitness: { wellness: [{ id: "2026-09-30", ctl: 60, atl: 55 }] } });
  assert.equal(coach.recommendation.session.kind, "recovery");
  assert.equal(coach.constraints.availableMinutes, 60);
  assert.match(coach.rationale.join(" "), /naplánováno „Recovery“ \(60 min, IF 0\.5/);
});

test("a light plan early in the week is not a recovery week; three solid weeks are", () => {
  const ride = (date, tss) => ({ name: "Ride", type: "Ride", durationHours: 2, tss });
  // Last week 450 TSS at CTL 60 (107 % of maintenance), little planned yet:
  // the coach used to call this a recovery week and lower the target.
  const w = week([["2026-09-21", [], [ride("2026-09-21", 150)]], ["2026-09-23", [], [ride("2026-09-23", 150)]], ["2026-09-25", [], [ride("2026-09-25", 150)]], ["2026-09-29", [], [ride("2026-09-29", 40)]], ["2026-10-01", [ride("2026-10-01", 50)]]]);
  const light = buildCyclingCoachV2({ date: "2026-09-30", week: w, fitness: { wellness: [{ id: "2026-09-30", ctl: 60, atl: 50 }] }, goal: null });
  assert.equal(light.week.recoveryWeek, false);
  // Three weeks in a row at maintenance (CTL 60 × 7 = 420) or more: 3 + 1.
  const days = Array.from({ length: 21 }, (_, i) => ({ id: new Date(Date.parse("2026-09-07T12:00:00Z") + i * 86400000).toISOString().slice(0, 10), ctl: 60, atl: 60, ctlLoad: 64 }));
  const block = buildCyclingCoachV2({ date: "2026-09-30", week: w, fitness: { wellness: [...days, { id: "2026-09-30", ctl: 60, atl: 50 }] }, goal: null });
  assert.equal(block.week.recoveryWeek, true);
  assert.equal(block.constraints.phase, "recovery");
  assert.match(block.rationale[0], /tři týdny v řadě nad udržovací zátěží \(448, 448, 448 TSS/);
});

test("the explanation lists why, how, fuelling and a step table in watts", () => {
  const w = renderForEnvironment(CYCLING_WORKOUTS.find(x => x.id === "pfd-thr-3x12-90"), "outdoor");
  const x = explainWorkout(w, { environment: "outdoor", thresholds: { ftp: 300, source: "intervals-settings" }, coach: { readiness: { status: "green", score: 85, tsb: -5 }, rationale: ["plán"] } });
  assert.ok(x.why.length >= 2 && x.how.length >= 3 && x.fueling.length >= 1);
  const block = x.steps.find(g => g.repeats === 3);
  assert.equal(block.steps[0].percentLow, 95);
  assert.equal(block.steps[0].wattsLow, 285);
  assert.equal(block.steps[0].wattsHigh, 303);
  assert.equal(x.ftp, 300);
  const indoor = stepRows([{ durationMinutes: 5, power: 100 }], { ftp: 250 });
  assert.equal(indoor[0].steps[0].wattsLow, 250);
  assert.equal(explainWorkout(w, {}).steps[0].steps[0].wattsLow, null);
});

test("FTP comes from Intervals sport settings, indoor FTP included", async () => {
  const fetchImpl = async () => Response.json({ sportSettings: [{ types: ["Run"], threshold_pace: 3.9 }, { types: ["Ride", "VirtualRide"], ftp: 290, indoor_ftp: 275, lthr: 168 }] });
  const t = await athleteThresholds({ INTERVALS_API_KEY: "k" }, fetchImpl);
  assert.deepEqual([t.ftp, t.indoorFtp, t.lthr, t.runThresholdPace, t.source], [290, 275, 168, 256, "intervals-settings"]);
  assert.equal(t.runPaceSource, "intervals-settings");
  assert.equal((await athleteThresholds({})).ftp, null);
});

test("generate on a planned recovery day returns a recovery ride with the plan attached", async () => {
  const plan = { name: "Recovery", type: "Ride", durationHours: 1, tss: 28, description: "- 48m Z1\n- 12m Z2" };
  const coach = buildCyclingCoachV2({ date: "2026-09-30", week: week([["2026-09-30", [plan]]]), fitness: { wellness: [{ id: "2026-09-30", ctl: 60, atl: 55 }] } });
  const r = await generateWorkout(scopedDb(createD1(), 1), { date: "2026-09-30", coach, environment: "outdoor", thresholds: { ftp: 280 } });
  assert.equal(r.workout.primary_system, "recovery");
  assert.ok(Math.abs(r.workout.duration_minutes - 60) <= 15);
  assert.equal(r.explanation.planned.system, "recovery");
  assert.equal(r.explanation.planned.steps[0].steps[0].wattsLow, 112);
  assert.equal(r.explanation.planned.steps[0].steps[0].wattsHigh, 154);
  assert.match(r.explanation.why[0], /naplánováno/);
});

test("easy rides keep their length outdoors and get fitting tips", () => {
  const rec = renderForEnvironment(CYCLING_WORKOUTS.find(x => x.id === "pfd-recovery-60"), "outdoor");
  assert.equal(rec.duration_minutes, 60);
  assert.equal(rec.environment_notes.some(x => /sprint|prahem/i.test(x)), false);
  const thr = renderForEnvironment(CYCLING_WORKOUTS.find(x => x.id === "pfd-thr-3x12-90"), "outdoor");
  assert.ok(thr.environment_notes.some(x => /prahem/.test(x)));
});
