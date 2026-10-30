import test from "node:test";
import assert from "node:assert/strict";
import { SWIMMING_WORKOUTS, SWIMMING_WORKOUTS_EN } from "../src/swimming-workouts.js";
import { renderForEnvironment, totalMeters, flattenSteps } from "../src/workout-model.js";
import { cssFromTest, sanitizeTrainingProfile, swimZones, swimZoneBounds } from "../src/training-zones.js";
import { intervalsSportSettings } from "../src/intervals-zones.js";
import { cardioRecords } from "../src/fitness-insights.js";
import { muscleFatigue } from "../src/muscle-fatigue.js";
import { sessionRecoveryHours } from "../src/recovery-hours.js";
import { cleanEnduranceTemplate, enduranceStructure, ownLibraryWorkout } from "../src/endurance-templates.js";
import { sportExperience } from "../src/training-history.js";
import { sportOf } from "../src/adaptive-week.js";
import { plannedEventWorkout } from "../src/planned-detail.js";
import { sanitizeWeekPlan } from "../src/week-planner.js";
import { athleteSteps } from "../src/workout-explanation.js";

test("the swim catalogue: pool workouts in metres, both languages, beginners start with short lengths", () => {
  assert.ok(SWIMMING_WORKOUTS.length >= 30);
  assert.equal(SWIMMING_WORKOUTS_EN.length, SWIMMING_WORKOUTS.length);
  assert.equal(new Set(SWIMMING_WORKOUTS.map(w => w.id)).size, SWIMMING_WORKOUTS.length, "ids are unique");
  for (const w of SWIMMING_WORKOUTS) {
    assert.equal(w.sport, "swim", w.id);
    assert.ok(w.distance_meters > 0, w.id);
    assert.ok(w.duration_minutes >= 10 && w.duration_minutes <= 90, w.id + " " + w.duration_minutes);
  }
  const first = SWIMMING_WORKOUTS.find(w => w.family === "swim-first");
  assert.ok(flattenSteps(JSON.parse(first.structure_json)).filter(s => !s.rest).every(s => s.meters <= 100));
  assert.ok(SWIMMING_WORKOUTS_EN.find(w => w.id === first.id).name.startsWith("First lengths"));
});

test("a pool workout goes to Intervals.icu in metres with rests; open water by time, no rests", () => {
  const w = SWIMMING_WORKOUTS_EN.find(x => x.id === "swim-css-8x100");
  const pool = renderForEnvironment(w, "indoor");
  assert.equal(pool.intervals_type, "Swim");
  assert.match(pool.intervals_description, /100mtr 100% Pace/);
  assert.match(pool.intervals_description, /intensity=rest/);
  assert.equal(totalMeters(JSON.parse(pool.structure_json)), w.distance_meters);
  const open = renderForEnvironment(w, "outdoor");
  assert.equal(open.intervals_type, "OpenWaterSwim");
  assert.doesNotMatch(open.intervals_description, /mtr|intensity=rest/);
  assert.ok(open.environment_notes.some(x => /alone|sám/i.test(x)), "open water says never alone");
});

test("CSS from the 400 + 200 m test, the zones around it and the Swim settings for Intervals.icu", () => {
  assert.equal(cssFromTest("7:00", "3:20"), 110);
  assert.equal(cssFromTest("3:20", "7:00"), null, "the 400 m must be the longer time");
  const zones = swimZones(110);
  assert.equal(zones.length, 5);
  assert.equal(zones[3].paceSlow, "1:52");
  assert.equal(zones[3].paceFast, "1:48");
  const bounds = swimZoneBounds(110);
  assert.ok(bounds.every((b, i) => i === 0 || b > bounds[i - 1]), "rising % of CSS speed");
  const profile = sanitizeTrainingProfile({ swimCss: "1:50", poolLength: 50, openWater: "races" });
  assert.deepEqual([profile.swimCss, profile.poolLength, profile.openWater], [110, 50, "races"]);
  assert.equal(sanitizeTrainingProfile({ poolLength: 30, openWater: "always" }).poolLength, undefined);
  assert.equal(intervalsSportSettings({ profile: {} }).Swim, undefined, "no Swim settings without a CSS");
  const swim = intervalsSportSettings({ profile, swimZones: zones }).Swim;
  assert.equal(swim.pace_units, "SECS_100M");
  assert.equal(swim.threshold_pace, Math.round(100 / 110 * 1000) / 1000);
});

test("athlete steps: metres, rests and the pace per 100 m from the CSS", () => {
  const w = SWIMMING_WORKOUTS.find(x => x.id === "swim-css-8x100");
  const rows = athleteSteps(JSON.parse(w.structure_json), "swim", "indoor", { swimCss: 100 });
  const set = rows.find(b => b.repeats === 8);
  assert.equal(set.steps[0].meters, 100);
  assert.equal(set.steps[0].paceFast, "1:38");
  assert.equal(set.steps[1].rest, true);
});

test("swim records come from pool swims; open water counts only for the longest", () => {
  const r = cardioRecords([
    { type: "Swim", date: "2026-10-01", distance: 1500, moving_time: 1650, name: "Pool" },
    { type: "OpenWaterSwim", date: "2026-10-02", distance: 3000, moving_time: 2700, name: "Lake" }
  ]);
  assert.equal(r.swimPace400.value, 110);
  assert.equal(r.swimPace1500.value, 110);
  assert.equal(r.longestSwim.value, 3000);
});

test("a swim tires the back and shoulders, not the legs, and counts in Regenerace", () => {
  const today = "2026-10-08", now = Date.parse("2026-10-08T08:00:00Z");
  const r = muscleFatigue({ activities: [{ kind: "swim", type: "Swim", end: now - 2 * 3600000, tss: 80, minutes: 60, durationHours: 1 }], now, today });
  const of = id => r.muscles.find(m => m.id === id);
  assert.ok(of("back").hours > 0);
  assert.equal(of("quads").level, 0);
  assert.ok(sessionRecoveryHours({ kind: "swim", minutes: 60 }).hours > 0);
});

test("own swim workouts: metres at % of CSS and rests at the wall", () => {
  const t = cleanEnduranceTemplate({ sport: "swim", name: "8×100", blocks: [{ repeats: 8, steps: [{ meters: 100, low: 99, high: 101 }, { rest: true, seconds: 15 }] }] });
  assert.deepEqual(t.blocks[0].steps[1], { label: "", rest: true, seconds: 15 });
  const structure = enduranceStructure(t, { swimCss: 100 });
  assert.equal(structure[0].steps[0].meters, 100);
  assert.equal(structure[0].steps[0].durationMinutes, 1.67);
  assert.equal(structure[0].steps[1].power, 0);
  assert.equal(ownLibraryWorkout({ id: 1, sport: "swim", name: "x", structure_json: JSON.stringify(structure) }).sport, "swim");
  assert.throws(() => cleanEnduranceTemplate({ sport: "swim", name: "x", blocks: [{ repeats: 1, steps: [{ meters: 10, low: 90, high: 90 }] }] }));
});

test("swimming experience comes only from swimming", () => {
  const months = n => Array.from({ length: n }, (_, m) => Array.from({ length: 4 }, (__, d) => ({ kind: "ride", date: `2024-${String(m % 12 + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}` }))).flat();
  const out = sportExperience({ activities: months(30) });
  assert.notEqual(out.ride, "beginner");
  assert.equal(out.swim, "beginner");
});

test("swims are a sport of the week plan and of planned events", () => {
  assert.equal(sportOf({ type: "Swim" }), "swim");
  assert.equal(sportOf({ type: "OpenWaterSwim" }), "swim");
  assert.deepEqual(sanitizeWeekPlan({ days: [["gym", "swim", "ride"]] }).days[0], ["ride", "swim", "gym"]);
  assert.equal(plannedEventWorkout({ type: "Swim", name: "CSS" }).environment, "indoor");
  assert.equal(plannedEventWorkout({ type: "OpenWaterSwim", name: "Lake" }).environment, "outdoor");
  assert.equal(plannedEventWorkout({ type: "Swim", name: "CSS" }).sport, "swim");
});
