// Onboarding review points 2, 9 and 10 (2026-11-10): the race's distance sets
// the build and the taper, a race picks the main sport when none is chosen, and
// the stated weekly hours shape the first week without history.
import test from "node:test";
import assert from "node:assert/strict";
import { athleteFocus, normalizeFocus, raceClass, racePhase, withFocus } from "../src/athlete-focus.js";
import { eventPlan } from "../src/app-training.js";
import { focusGoal } from "../src/coach-assistant.js";
import { weekTargets } from "../src/week-planner.js";
import { effectiveProfile } from "../src/energy-profile.js";
import { activityHistoryEstimate, startWeek } from "../src/adaptive-week.js";

test("the race's distance picks its build weeks and taper days", () => {
  const cls = (s, km) => { const r = raceClass(s, km); return [r.key, r.buildDays / 7, r.taperDays]; };
  assert.deepEqual(cls("run", 5), ["5k", 6, 5]);
  assert.deepEqual(cls("run", 21.1), ["half", 10, 10]);
  assert.deepEqual(cls("run", 42.2), ["marathon", 12, 14]);
  assert.deepEqual(cls("run", 50), ["ultra", 14, 14]);
  assert.deepEqual(cls("ride", 100), ["short", 8, 7]);
  assert.deepEqual(cls("ride", 140), ["medium", 10, 10]);
  assert.deepEqual(cls("ride", 200), ["long", 12, 12]);
  assert.deepEqual(cls("swim", 3), ["short", 6, 5]);
  assert.deepEqual(cls("swim", 3.8), ["medium", 8, 7]);
  assert.deepEqual(cls("tri", 25.75), ["sprint", 6, 5]);
  assert.deepEqual(cls("tri", 51.5), ["olympic", 8, 7]);
  assert.deepEqual(cls("tri", 113), ["half", 12, 10]);
  assert.deepEqual(cls("tri", 226), ["full", 16, 14]);
});

test("a distance no race has is not saved", () => {
  assert.deepEqual(normalizeFocus({ eventName: "Půlmaraton", eventSport: "run", eventKm: 21.12 }).eventKm, 21.1);
  for (const p of [{ eventSport: "run", eventKm: 500 }, { eventSport: "swim", eventKm: 0.2 }, { eventSport: "row", eventKm: 10 }, { eventSport: "run" }, { eventKm: 10 }])
    assert.equal(normalizeFocus({ eventName: "Závod", ...p }).eventSport, undefined, JSON.stringify(p));
});

test("without a distance the phases stay 11 weeks of build and the final week taper", () => {
  assert.deepEqual([0, 1, 7, 8, 84, 85, -1, null].map(d => racePhase(d)), ["race", "taper", "taper", "build", "build", "base", null, null]);
  const marathon = { buildDays: 84, taperDays: 14 };
  assert.deepEqual([14, 15, 98, 99].map(d => racePhase(d, marathon)), ["taper", "build", "build", "base"]);
});

test("Training's phases and the coach's engine follow the distance", () => {
  const event = athleteFocus({ eventName: "Marathon", eventDate: "2027-04-04", eventSport: "run", eventKm: 42.2 }, "2027-01-01").event;
  assert.equal(event.daysLeft, 93);
  const plan = eventPlan(event, "2027-01-01");
  assert.equal(plan.phase, "build");
  assert.deepEqual(plan.phases.map(p => [p.key, p.from, p.to]), [["base", null, "2026-12-26"], ["build", "2026-12-27", "2027-03-20"], ["taper", "2027-03-21", "2027-04-03"]]);
  // The same 93 days without a distance are still base, and the engine agrees.
  assert.equal(eventPlan({ name: "Marathon", date: "2027-04-04" }, "2027-01-01").phase, "base");
  assert.equal(focusGoal({ event }).phase, "build");
  assert.equal(focusGoal({ event: { ...event, buildDays: undefined, taperDays: undefined } }).phase, "base");
});

test("the coach reads the distance, and a short build when the race is close", () => {
  const text = (date, today) => withFocus("Jsi trenér Aurin.", athleteFocus({ eventName: "Půlmaraton", eventDate: date, eventSport: "run", eventKm: 21.1 }, today));
  assert.match(text("2027-03-20", "2027-01-01"), /21,1 km \(běh\)\. Rozvoj 10 týdnů, potom ladění 10 dní/);
  assert.doesNotMatch(text("2027-03-20", "2027-01-01"), /méně než 3 týdny/);
  assert.match(text("2027-01-26", "2027-01-01"), /méně než 3 týdny/);
  assert.doesNotMatch(withFocus("Jsi trenér Aurin.", athleteFocus({ eventName: "Půlmaraton", eventDate: "2027-03-20" }, "2027-01-01")), /Vzdálenost závodu/);
});

test("the week's volume goes down in the taper by the distance", () => {
  const args = { roles: [], ctl: 60, days: [], today: "2026-10-05", weekStart: "2026-10-05", weekLoads: [400] };
  // The race on Monday 2026-10-19: a 14-day taper covers this whole week, a 7-day one none of it.
  assert.equal(weekTargets({ ...args, eventDate: "2026-10-19", taperDays: 14 }).target, Math.round(420 * .55));
  assert.equal(weekTargets({ ...args, eventDate: "2026-10-19", taperDays: 7 }).target, Math.round(420 * 1.05));
  // The race on Sunday 2026-10-11 with a 7-day taper: Sunday is the race, six days taper.
  assert.equal(weekTargets({ ...args, eventDate: "2026-10-11", taperDays: 7 }).target, Math.round(420 * (1 - .45 * 6 / 7)));
});

test("a race picks the main sport only when none is main and the athlete does it", () => {
  const base = { sports: ["run", "strength"], mainSports: [], mainSport: "general", eventName: "Pražský půlmaraton", eventDate: "2099-04-01" };
  assert.equal(effectiveProfile(base, {}).mainSport, "running");
  assert.equal(effectiveProfile({ ...base, sports: ["ride", "strength"] }, {}).mainSport, "general", "running is not ticked");
  assert.equal(effectiveProfile({ ...base, mainSports: ["strength"], mainSport: "strength" }, {}).mainSport, "strength", "a chosen main sport stays");
  assert.equal(effectiveProfile({ ...base, eventDate: "2001-04-01" }, {}).mainSport, "general", "a race that is over");
  const tri = { ...base, sports: ["ride", "run", "swim"], eventName: "Můj závod", eventSport: "tri", eventKm: 51.5 };
  assert.equal(effectiveProfile(tri, {}).mainSport, "triathlon");
  assert.equal(effectiveProfile({ ...tri, sports: ["ride", "run"] }, {}).mainSport, "general", "swimming is not ticked");
  // "auto" reads the race's distance before its name.
  assert.equal(effectiveProfile({ mainSport: "auto", eventName: "Můj závod", eventDate: "2099-04-01", eventSport: "ride", eventKm: 120 }, {}).mainSport, "cycling");
});

test("the stated weekly hours shape the first week, discounted and capped", () => {
  assert.equal(startWeek(null), null);
  assert.equal(startWeek(0), null);
  assert.deepEqual(startWeek(1), { count: 2, minutes: { run: 25, swim: 25, ride: 30, gym: 25 } });
  assert.deepEqual(startWeek(5), { count: 3, minutes: { run: 40, swim: 30, ride: 75, gym: 60 } });
  assert.equal(startWeek(10).count, 5);
  assert.deepEqual(startWeek(40), { count: 5, minutes: { run: 40, swim: 30, ride: 75, gym: 60 } });
  const empty = activityHistoryEstimate([], "2026-10-05", 10);
  assert.equal(empty.count, 5);
  assert.match(empty.message, /5 aktivit týdně/);
  assert.equal(activityHistoryEstimate([], "2026-10-05").count, 3);
});
