import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2, wellnessTrend } from "../src/cycling-coach-v2.js";
import { qualityDomain } from "../src/session-intensity.js";
import { weekTargets, planWeekRoles } from "../src/week-planner.js";
import { buildAdaptiveDecision } from "../src/adaptive-engine.js";

const date = "2026-10-08";
const day = offset => new Date(Date.parse(date + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = (today = {}) => [...Array.from({ length: 20 }, (_, i) => ({ id: day(-20 + i), ctl: 70, atl: 72, hrv: 80, restingHR: 48 })), { id: date, ctl: 70, atl: 75, hrv: 80, restingHR: 48, ...today }];
const sleep = { sleep: [{ type: "sleep", durationMin: 470, endTime: date + "T06:30:00" }] };
const week = (completed = []) => ({ days: completed.map(a => ({ date: a.date, daily: { training: { completed: [a] } } })) });
const coach = args => buildCyclingCoachV2({ date, week: week([{ date: day(-3), type: "Ride", name: "Endurance", tss: 60, durationHours: 1.25 }]), fitness: { wellness: wellness() }, health: sleep, gym: { history: [] }, ...args });

test("library interval sessions count as quality, easy ones do not", () => {
  for (const name of ["Billat 30-30", "Norský 4×4", "Seiler 4×8 min", "Rønnestad 30/15 · 3×13", "Pro-inspired · Langvad VO₂ 7×3", "Prahové úseky", "Daniels cruise intervals 5×6 min", "UAE-style 40/20 Over-Unders"]) assert.ok(qualityDomain(name), name);
  for (const name of ["Endurance – Aerobic Base", "Endurance 3x20 Z2", "Lehký běh", "Long Endurance", "Dlouhý běh", "Morning Ride", "Tempo"]) assert.equal(qualityDomain(name), null, name);
  assert.equal(qualityDomain("Tempo", "run"), "moderate");
  assert.equal(qualityDomain("Norský double threshold · odpolední 10×1000 m"), "moderate");
  // Two library interval rides this week use up the quality budget.
  const result = coach({ week: week([{ date: day(-4), type: "Ride", name: "Norský 4×4", tss: 80, durationHours: 1.2 }, { date: day(-2), type: "Ride", name: "Seiler 4×8 min", tss: 85, durationHours: 1.3 }]) });
  assert.equal(result.load.hardBikeDaysRolling7d, 2);
  assert.ok(!["vo2", "threshold", "sweet_spot"].includes(result.recommendation.session.kind));
});

test("deep fatigue with a falling HRV is not green and gets no sweet spot", () => {
  const result = coach({ fitness: { wellness: wellness({ atl: 100, tsb: -30, hrv: 58 }) } });
  assert.notEqual(result.readiness.status, "green");
  assert.ok(result.readiness.reasons.some(r => /HRV 58 ms je o 28 % pod tvým průměrem/.test(r)));
  assert.ok(["endurance", "recovery"].includes(result.recommendation.session.kind));
  // HRV and resting HR are judged against the athlete's own baseline.
  assert.deepEqual(wellnessTrend({ wellness: wellness({ hrv: 58 }) }, date, "hrv"), { today: 58, baseline: 80, deltaPct: -27.5, delta: -22 });
  const rhr = coach({ fitness: { wellness: wellness({ tsb: -5, restingHR: 57, hrv: 70 }) } });
  assert.ok(rhr.readiness.reasons.some(r => /klidový tep 57 je o 9 tepů nad tvým průměrem/.test(r)));
  assert.ok(rhr.readiness.reasons.some(r => /HRV i klidový tep zároveň/.test(r)));
  // A fresh athlete at their usual HRV stays green.
  assert.equal(coach({ fitness: { wellness: wellness({ tsb: 2 }) } }).readiness.status, "green");
});

test("the time available is a limit: an easy run does not fill two hours and runs grow by 10 %", () => {
  const runs = week([{ date: day(-2), type: "Run", name: "Lehký běh", durationHours: 0.75, tss: 45 }, { date: day(-5), type: "Run", name: "Lehký běh", durationHours: 0.5, tss: 30 }]);
  const recovery = coach({ sport: "run", week: runs, goal: { focus: "recovery" }, availabilityMinutes: 120 });
  assert.equal(recovery.recommendation.session.kind, "recovery");
  assert.ok(recovery.recommendation.session.durationMinutes <= 40);
  const easy = coach({ sport: "run", week: runs, goal: { focus: "endurance" }, availabilityMinutes: 120 });
  assert.equal(easy.recommendation.session.durationMinutes, 50);
  assert.ok(easy.rationale.some(r => /Nejdelší běh za poslední 2 týdny měl 45 min, dnes proto nejvýš 50 min/.test(r)));
  // A ride is not limited that way, but a recovery ride stays short.
  assert.ok(coach({ goal: { focus: "recovery" }, availabilityMinutes: 180 }).recommendation.session.durationMinutes <= 60);
});

test("the main event steers the phase: build, taper, openers and race day", () => {
  const focus = daysLeft => ({ event: { name: "Krušnoton", date: day(daysLeft), daysLeft } });
  assert.ok(coach({ focus: focus(40) }).rationale.some(r => /zbývá 6 týdnů: fáze rozvoje/.test(r)));
  const taper = coach({ focus: focus(5), availabilityMinutes: 120 });
  assert.equal(taper.constraints.phase, "taper");
  assert.equal(taper.week.recoveryWeek, false);
  assert.ok(taper.recommendation.session.durationMinutes <= 80);
  assert.ok(taper.rationale.some(r => /ladění formy/.test(r)));
  const openers = coach({ focus: focus(1) });
  assert.equal(openers.recommendation.session.kind, "openers");
  assert.ok(openers.recommendation.session.durationMinutes <= 45);
  // Race day stays race day even when the readiness is low.
  const race = coach({ focus: focus(0), fitness: { wellness: wellness({ tsb: -32, hrv: 55 }) } });
  assert.equal(race.recommendation.session.kind, "race");
  // Auto length in the taper is shorter than without it.
  assert.ok(coach({ focus: focus(4) }).recommendation.session.durationMinutes < coach({}).recommendation.session.durationMinutes);
});

test("a run chip gets the running intensity, so the same load is a shorter run", () => {
  const roles = planWeekRoles([["ride"], ["run"], ["ride"], [], ["ride"], ["ride"], ["run"]]);
  const targets = weekTargets({ roles, ctl: 60, days: [], today: "2026-10-05", weekStart: "2026-10-05" });
  const run = targets.items.find(x => x.sport === "run" && x.role === "endurance") || targets.items.find(x => x.sport === "run");
  assert.ok(run.intensity >= 0.7);
  assert.ok(run.minutes <= 75, "run minutes " + run.minutes);
});

test("the daily readiness uses HRV and resting HR only against the athlete's own baseline", () => {
  const base = { date, cycling: {}, recovery: { "daily-heart-rate-variability": [{ sampleTime: date, value: 45, baseline: 46 }], "daily-resting-heart-rate": [{ sampleTime: date, value: 44, baseline: 45 }] } };
  // An HRV of 45 is this athlete's normal: no penalty.
  assert.equal(buildAdaptiveDecision(base).recovery.score, 100);
  const tired = { ...base, recovery: { "daily-heart-rate-variability": [{ sampleTime: date, value: 34, baseline: 46 }], "daily-resting-heart-rate": [{ sampleTime: date, value: 53, baseline: 45 }] } };
  assert.ok(buildAdaptiveDecision(tired).recovery.score <= 75);
});

test("a plan for weeks, a month or up to the race is a training block", async () => {
  const { assistantTask } = await import("../src/coach-assistant.js");
  for (const m of ["Udělej mi plán na 8 týdnů do závodu", "Připrav mi rozpis na měsíc", "Plán do závodu"]) assert.equal(assistantTask(m), "block", m);
  for (const m of ["Naplánuj mi tento týden", "Plán na 2 týdny", "Kolik mám dát na bench?"]) assert.equal(assistantTask(m), "planning", m);
});

test("the week plan is a recovery week only after a heavy week or three solid weeks, never because little is planned yet", async () => {
  const { recoveryWeek, weekLoadsBefore } = await import("../src/week-planner.js");
  const roles = planWeekRoles([["gym"], ["ride"], ["ride"], [], ["gym"], ["ride"], ["ride", "gym"]]);
  // The real week 41: CTL 66.8, last week 283 TSS, 131 TSS done and planned on Monday.
  const days = [{ date: "2026-10-05", done: 0, planned: 0, sports: ["gym"] }, { date: "2026-10-06", done: 0, planned: 64, sports: ["ride"] }, { date: "2026-10-07", done: 0, planned: 26, sports: ["ride"] }, { date: "2026-10-10", done: 0, planned: 41, sports: ["ride"] }];
  const week41 = weekTargets({ roles, ctl: 66.8, lastWeekLoad: 283, days, today: "2026-10-05", weekStart: "2026-10-05" });
  assert.equal(week41.recovery, false);
  assert.equal(week41.target, Math.round(468 * 1.05));
  assert.equal(weekTargets({ roles, ctl: 66.8, lastWeekLoad: 600, days, today: "2026-10-05", weekStart: "2026-10-05" }).recoveryReason, "heavy_last_week");
  assert.equal(weekTargets({ roles, ctl: 66.8, lastWeekLoad: 480, weekLoads: [480, 470, 500], days, today: "2026-10-05", weekStart: "2026-10-05" }).recoveryReason, "three_weeks");
  // After the recovery week the series starts again.
  assert.equal(recoveryWeek({ base: 468, weekLoads: [330, 480, 500] }).recovery, false);
  // Loads per week from the wellness, last week first.
  const wellness = Array.from({ length: 21 }, (_, i) => ({ id: new Date(Date.parse("2026-09-14T12:00:00Z") + i * 86400000).toISOString().slice(0, 10), ctlLoad: i < 7 ? 10 : i < 14 ? 20 : 30 }));
  assert.deepEqual(weekLoadsBefore(wellness, "2026-10-05"), [210, 140, 70]);
});
