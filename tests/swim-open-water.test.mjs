import test from "node:test";
import assert from "node:assert/strict";
import { environmentFor, openWaterDue, withOpenWater, weekProposal } from "../src/adaptive-week.js";
import { sanitizeWeekPlan } from "../src/week-planner.js";
import { swimTss } from "../src/training-zones.js";
import { intervalsSportSettings } from "../src/intervals-zones.js";
import { activityFromRow } from "../src/coach-reflection.js";

test("swims are in the pool; open water once a week by the athlete's choice", () => {
  assert.equal(environmentFor("2026-07-01", "swim", { max: 28 }).environment, "indoor");
  assert.equal(openWaterDue("2026-07-06", "off"), false);
  assert.equal(openWaterDue("2026-07-06", "season"), true);
  assert.equal(openWaterDue("2026-11-02", "season"), false);
  assert.equal(openWaterDue("2026-11-02", "races", 40), true);
  assert.equal(openWaterDue("2026-11-02", "races", 90), false);
  const items = [{ date: "2026-07-07", sport: "swim", minutes: 30, environment: "indoor" }, { date: "2026-07-11", sport: "swim", minutes: 45, environment: "indoor" }, { date: "2026-07-09", sport: "swim", minutes: 60, environment: "indoor", chosenEnvironment: true }];
  const out = withOpenWater(items, { start: "2026-07-06", openWater: "season", weather: {} });
  assert.deepEqual(out.map(x => x.environment), ["indoor", "outdoor", "indoor"], "the longest not chosen by hand");
  assert.match(out[1].reason, /sám|alone/);
  const stormy = withOpenWater(items, { start: "2026-07-06", openWater: "season", weather: { "2026-07-11": { max: 22, code: 95 } } });
  assert.equal(stormy[1].environment, "indoor");
  assert.equal(stormy[0].environment, "outdoor");
});

test("a swimmer's rule week puts one swim in open water in season", () => {
  const prefs = sanitizeWeekPlan({ weeklyActivities: 3, availability: [60, 0, 60, 0, 60, 0, 0].map(minutes => ({ minutes, preferredSports: ["swim"] })) });
  const p = weekProposal({ prefs, start: "2026-07-06", today: "2026-07-06", state: { status: "active" }, focus: { sport: "swimming" }, openWater: "season" });
  const swims = p.items.filter(x => x.sport === "swim");
  assert.ok(swims.length >= 2);
  assert.equal(swims.filter(x => x.environment === "outdoor").length, 1);
  const off = weekProposal({ prefs, start: "2026-07-06", today: "2026-07-06", state: { status: "active" }, focus: { sport: "swimming" }, openWater: "off" });
  assert.ok(off.items.every(x => x.environment === "indoor"));
});

test("swim load from pace (sTSS), never from wrist heart rate", () => {
  assert.equal(swimTss({ meters: 2000, seconds: 2200, thresholdSpeed: 100 / 110 }), 61);
  assert.equal(swimTss({ meters: 0, seconds: 100, thresholdSpeed: 1 }), null);
  const swim = intervalsSportSettings({ profile: { swimCss: 110 }, swimZones: [] }).Swim;
  assert.equal(swim.pace_load_type, "SWIM");
  assert.equal(swim.load_order, "PACE_HR_POWER");
  const row = { start_time: "2026-10-01T07:00:00Z", payload_json: JSON.stringify({ type: "Swim", name: "Pool", distance: 2000, moving_time: 2200, threshold_pace: 100 / 110 }) };
  assert.equal(activityFromRow(row).tss, 61);
  const loaded = { ...row, payload_json: JSON.stringify({ type: "Swim", distance: 2000, moving_time: 2200, threshold_pace: 1, icu_training_load: 40 }) };
  assert.equal(activityFromRow(loaded).tss, 40, "Intervals.icu's own load wins");
});
