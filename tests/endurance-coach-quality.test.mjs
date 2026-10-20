import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2, wellnessTrend } from "../src/cycling-coach-v2.js";
import { buildToday } from "../src/app-today.js";
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
  for (const name of ["Endurance – Aerobic Base", "Endurance 3x20 Z2", "Lehký běh", "Long Endurance", "Dlouhý běh", "Morning Ride"]) assert.equal(qualityDomain(name), null, name);
  // Tempo is a quality session in both sports.
  assert.equal(qualityDomain("Tempo"), "moderate");
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
  assert.ok(result.readiness.reasons.some(r => /HRV 58 ms je pod tvým běžným pásmem 7\d–8\d ms/.test(r)));
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

test("a week's running grows at most 10 % over the recent weeks", async () => {
  const { weeklyRunCap, capRunVolume } = await import("../src/week-planner.js");
  const { weekProposal } = await import("../src/adaptive-week.js");
  const runDay = (date, minutes, type = "Run") => ({ date, daily: { training: { completed: [{ type, durationHours: minutes / 60 }] } } });
  // Last week 80 min, four-week average 49 min: the larger counts, +10 %.
  const history = [runDay("2026-09-08", 40), runDay("2026-09-15", 45), runDay("2026-09-22", 30), runDay("2026-09-29", 50), runDay("2026-10-01", 30), runDay("2026-10-02", 90, "Ride"), runDay("2026-10-03", 60, "Walk")];
  const cap = weeklyRunCap(history, "2026-10-05");
  assert.deepEqual(cap, { cap: 90, base: 80, weeks: [80, 30, 45, 40] });
  // Nothing run yet: a fresh start of 60 min a week is always allowed.
  assert.equal(weeklyRunCap([], "2026-10-05").cap, 60);
  const targets = { status: "ok", items: [{ sport: "run", role: "endurance", minutes: 60, tss: 61, intensity: .78 }, { sport: "run", role: "long", minutes: 70, tss: 71, intensity: .78 }, { sport: "ride", minutes: 90, tss: 70 }] };
  const capped = capRunVolume(targets, cap, 30);
  assert.deepEqual(capped.items.map(x => x.sport + ":" + x.minutes), ["run:30", "run:30", "ride:90"]);
  assert.equal(capped.items[0].tss, Math.round(30 / 60 * .78 * .78 * 100));
  assert.equal(capped.runCap.limited, true); assert.equal(capped.runCap.committed, 30);
  // Under the cap nothing changes.
  assert.deepEqual(capRunVolume(targets, { cap: 200, base: 180, weeks: [] }, 0).items, targets.items);
  // The week proposal applies it with the athlete's history, not without.
  const prefs = { days: [["run"], [], ["run"], [], [], ["run"], []], availability: Array.from({ length: 7 }, () => ({ minutes: 180, preferredSports: [] })), sessions: {} };
  const fitness = { wellness: [{ id: "2026-10-04", ctl: 60, tsb: 0 }] };
  const proposal = weekProposal({ prefs, start: "2026-10-05", today: "2026-10-05", week: { days: [] }, fitness, history });
  const runs = proposal.items.filter(x => x.sport === "run");
  assert.ok(runs.reduce((n, x) => n + x.minutes, 0) <= 90 + 5, JSON.stringify(runs));
  assert.equal(proposal.targets.runCap.limited, true);
  assert.equal(weekProposal({ prefs, start: "2026-10-05", today: "2026-10-05", week: { days: [] }, fitness }).targets.runCap, undefined);
});

test("proposed runs that do not fit 20 min under the running cap are left out", async () => {
  const { capRunVolume } = await import("../src/week-planner.js");
  const run = (minutes, role = "endurance") => ({ sport: "run", role, minutes, tss: minutes, intensity: .78 });
  const targets = { status: "ok", items: [run(60), run(40, "recovery"), run(70, "long"), { sport: "ride", minutes: 90, tss: 70 }] };
  const minutesOf = t => t.items.map(x => x.sport + ":" + x.minutes);
  // No room left: no run, the ride stays.
  const none = capRunVolume(targets, { cap: 90 }, 90);
  assert.deepEqual(minutesOf(none), ["ride:90"]);
  assert.equal(none.runCap.proposed, 0);
  // 45 min left: the shortest run would get 10 min, the other two share it.
  assert.deepEqual(minutesOf(capRunVolume(targets, { cap: 90 }, 45)), ["run:20", "run:25", "ride:90"]);
  // 30 min left: one run gets all of it.
  const one = capRunVolume(targets, { cap: 90 }, 60);
  assert.deepEqual(minutesOf(one), ["run:30", "ride:90"]);
  assert.equal(one.items[0].role, "long");
  // Whatever the room, the runs stay within it and at least 20 min each.
  for (let room = 0; room <= 170; room++) {
    const runs = capRunVolume(targets, { cap: 200 }, 200 - room).items.filter(x => x.sport === "run");
    assert.ok(runs.reduce((n, x) => n + x.minutes, 0) <= room && runs.every(x => x.minutes >= 20), room + ": " + JSON.stringify(runs));
  }
});

test("a run planned for today counts against the running cap until it is done, then once", async () => {
  const { committedRunMinutes } = await import("../src/week-planner.js");
  const { weekProposal } = await import("../src/adaptive-week.js");
  assert.equal(committedRunMinutes("2026-10-07", "2026-10-07", 45, 0), 45);
  assert.equal(committedRunMinutes("2026-10-07", "2026-10-07", 45, 50), 50);
  assert.equal(committedRunMinutes("2026-10-06", "2026-10-07", 45, 0), 0);
  assert.equal(committedRunMinutes("2026-10-08", "2026-10-07", 45, 30), 45);
  const history = [{ date: "2026-09-29", daily: { training: { completed: [{ type: "Run", durationHours: 1.5 }] } } }];
  const prefs = { days: [[], [], [], [], ["run"], [], []], availability: Array.from({ length: 7 }, () => ({ minutes: 180, preferredSports: [] })), sessions: {} };
  const fitness = { wellness: [{ id: "2026-10-06", ctl: 60, tsb: 0 }] };
  const today = done => ({ date: "2026-10-07", daily: { training: { planned: [{ type: "Run", durationHours: .75 }], completed: done ? [{ type: "Run", durationHours: done / 60 }] : [] } } });
  const proposal = done => weekProposal({ prefs, start: "2026-10-05", today: "2026-10-07", week: { days: [today(done)] }, fitness, history });
  assert.equal(proposal(0).targets.runCap.committed, 45);
  assert.equal(proposal(50).targets.runCap.committed, 50);
});

test("the ride coach's readiness is the Today screen's, from Google or Apple Health without Intervals.icu", () => {
  const day = "2026-10-11", shift = (d, k) => new Date(Date.parse(d + "T12:00:00Z") + k * 86400000).toISOString().slice(0, 10);
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: shift(day, i - 29), hrv: 60 + (i % 3), restingHR: 50 + (i % 2) }));
  const night = { date: day, durationMin: 470, endTime: day + "T06:40:00Z" };
  const today = buildToday({ date: day, health: { wellness: rows }, sleep: { sessions: [night] } });
  const ride = buildCyclingCoachV2({ date: day, week: { days: [] }, health: { wellness: rows, sleep: [night] } });
  assert.equal(today.readiness.score, ride.readiness.score);
  assert.equal(today.readiness.zone, ride.readiness.status);
  assert.equal(ride.readiness.status, "green");
  // Deep training fatigue still lowers it.
  const tired = buildCyclingCoachV2({ date: day, week: { days: [] }, fitness: { wellness: [{ id: day, ctl: 60, atl: 95, tsb: -35 }] }, health: { wellness: rows, sleep: [night] } });
  assert.equal(tired.readiness.score, today.readiness.score);
  assert.equal(tired.readiness.status, "red");
});

test("without Intervals.icu the weeks' load comes from the app's own rows", async () => {
  const { weekLoadsBefore } = await import("../src/week-planner.js");
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: new Date(Date.UTC(2026, 8, 21 + i)).toISOString().slice(0, 10), ctl: 40, atl: 45, load: 60 }));
  assert.deepEqual(weekLoadsBefore(rows, "2026-10-12"), [420, 420, 420]);
});

test("a hard run yesterday keeps today's ride easy and a watch workout counts by heart rate", () => {
  const fresh = { fitness: { wellness: wellness({ tsb: 2 }) } };
  const ride = { date: day(-3), type: "Ride", name: "Endurance", tss: 60, durationHours: 1.25 }, easyRun = { date: day(-3), type: "Run", name: "Lehký běh", tss: 45, durationHours: 0.75 };
  const afterRun = coach({ ...fresh, week: week([ride, { date: day(-1), type: "Run", name: "Norský 4×4", tss: 70, durationHours: 1 }]) });
  assert.ok(!["vo2", "threshold", "sweet_spot"].includes(afterRun.recommendation.session.kind));
  assert.ok(afterRun.rationale.some(r => /Tvrdý běh byl včera – jízda dnes lehce/.test(r)));
  // The run waits after a hard ride the same way.
  const afterRide = coach({ ...fresh, sport: "run", week: week([easyRun, { date: day(-1), type: "Ride", name: "Seiler 4×8 min", tss: 85, durationHours: 1.3 }]) });
  assert.ok(afterRide.rationale.some(r => /Tvrdá jízda byla včera – běh dnes lehce/.test(r)));
  // A run recorded only by the watch has no TSS: its heart rate makes it hard.
  const health = { ...sleep, wellness: Array.from({ length: 10 }, (_, i) => ({ id: day(-i), restingHR: 50 })) };
  const watchRun = { date: day(-1), type: "Run", name: "Běh", durationHours: 1, averageHeartRate: 172 };
  const byHeart = coach({ ...fresh, health, profile: { age: 35, sex: "male" }, week: week([ride, watchRun]) });
  assert.ok(byHeart.rationale.some(r => /Tvrdý běh byl včera/.test(r)));
  // An easy watch run stays easy.
  const easy = coach({ ...fresh, health, profile: { age: 35, sex: "male" }, week: week([ride, { ...watchRun, averageHeartRate: 128 }]) });
  assert.ok(!easy.rationale.some(r => /Tvrdý běh byl včera/.test(r)));
});

test("the first three days after Nemoc stay easy, the first one only recovery", () => {
  const fresh = { fitness: { wellness: wellness({ tsb: 2 }) }, goal: { focus: "threshold" } };
  assert.equal(coach(fresh).recommendation.session.kind, "threshold");
  const first = coach({ ...fresh, athleteState: { status: "active", recoveredAt: date } });
  assert.equal(first.recommendation.session.kind, "recovery");
  assert.ok(first.recommendation.adaptations.some(a => /první den po nemoci/.test(a)));
  const third = coach({ ...fresh, athleteState: { status: "active", recoveredAt: day(-2) } });
  assert.equal(third.recommendation.session.kind, "endurance");
  assert.ok(third.recommendation.adaptations.some(a => /třetí den bez intenzity/.test(a)));
  assert.equal(coach({ ...fresh, athleteState: { status: "active", recoveredAt: day(-3) } }).recommendation.session.kind, "threshold");
});

test("the main race shapes the week's chips: no gym the day before, a reserve 2–3 days before, race day alone", () => {
  const roles = planWeekRoles([["ride"], ["gym"], ["gym", "ride"], ["ride"], ["ride"], ["ride"], ["ride"]]);
  const all = weekTargets({ roles, ctl: 60, days: [], today: "2026-10-05", weekStart: "2026-10-05" });
  const race = weekTargets({ roles, ctl: 60, days: [], today: "2026-10-05", weekStart: "2026-10-05", eventDate: "2026-10-10" });
  const on = (t, date) => t.items.filter(x => x.date === date);
  assert.ok(on(all, "2026-10-10").length > 0);
  assert.equal(on(race, "2026-10-10").length, 0);
  assert.ok(on(race, "2026-10-09").every(x => x.sport !== "gym" && x.role === "recovery"));
  assert.ok(on(race, "2026-10-07").filter(x => x.sport === "gym").every(x => x.role === "gym_upper"));
  assert.ok(!race.items.some(x => x.date >= "2026-10-07" && x.date <= "2026-10-10" && x.role === "long"));
  // After the race, nothing changes.
  assert.deepEqual(on(race, "2026-10-11").map(x => x.role), on(all, "2026-10-11").map(x => x.role));
});
