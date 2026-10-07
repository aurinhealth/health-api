import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import legacy from "../src/index.js";
import { proteinReferenceKg, trendAdjustment } from "../src/energy-profile.js";
import { withAppTarget } from "../src/nutrition-intelligence.js";
import { pragueToday } from "../src/prague-date.js";

const ctx = { waitUntil() {} };

function db() {
  const d = createD1();
  d.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT);
    CREATE TABLE food_logs (id INTEGER PRIMARY KEY, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  return d;
}
const point = (d, family, type, id, { start = null, sample = null, value = null, payload = {} }) =>
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, sample_time, value_numeric, payload_json) VALUES (7, ?, ?, ?, ?, ?, ?, ?)").run(family, type, id, start, sample, value, JSON.stringify(payload));
const profile = (d, p) => d.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify(p));
const daily = async (d, date = "2099-01-05") => (await legacy.fetch(new Request("https://internal/analysis/daily?date=" + date), { DB: d, USER_ID: 7, CONNECTED_PROVIDERS: ["google", "intervals"] }, ctx)).json();
const man = { sex: "male", age: 30, height: 180, activity: "light", goal: "lose_0.5", sportHours: "0" };

test("every Intervals.icu sport counts once, and a Google copy of the same run is dropped", async () => {
  const d = db();
  profile(d, man);
  point(d, "manual", "weight", "w", { sample: "2098-12-30T07:00:00Z", value: 80 });
  point(d, "intervals", "activity", "run", { start: "2099-01-05T07:00:00", payload: { type: "Run", name: "Ranní běh", calories: 500, moving_time: 3600 } });
  point(d, "intervals", "activity", "gym", { start: "2099-01-05T17:00:00", payload: { type: "WeightTraining", name: "Posilovna", calories: 200, moving_time: 2700 } });
  // The watch's copy of the morning run, in UTC (07:05 in Prague).
  point(d, "google-wearables", "exercise", "g-run", { start: "2099-01-05T06:05:00Z", payload: { exercise: { exerciseType: "RUNNING", displayName: "Běh", activeDuration: "3500s", metricsSummary: { caloriesKcal: 480 } } } });
  const day = await daily(d);
  assert.deepEqual(day.training.completed.map(a => [a.type, a.source]), [["Run", "intervals"], ["WeightTraining", "intervals"]]);
  assert.ok(day.nutrition.calorieBreakdown.activityAdjustment >= 700);
});

test("running without measured calories is costed by body weight", async () => {
  const at = async kg => {
    const d = db();
    profile(d, man);
    point(d, "manual", "weight", "w", { sample: "2098-12-30T07:00:00Z", value: kg });
    point(d, "intervals", "activity", "run", { start: "2099-01-05T07:00:00", payload: { type: "Run", name: "Běh", moving_time: 3600 } });
    return (await daily(d)).nutrition.calorieBreakdown.activityAdjustment;
  };
  // 650 kcal/h at 88 kg.
  assert.equal(await at(88), 650);
  assert.equal(await at(66), Math.round(650 * 66 / 88));
});

test("protein above BMI 30 uses the weight at BMI 27", async () => {
  assert.equal(proteinReferenceKg(80, 180), 80);
  assert.equal(proteinReferenceKg(107, 175), 82.7);
  assert.equal(proteinReferenceKg(107, null), 107);
  const d = db();
  profile(d, { ...man, height: 175 });
  point(d, "manual", "weight", "w", { sample: "2098-12-30T07:00:00Z", value: 107 });
  const day = await daily(d);
  assert.equal(day.nutrition.macros.protein_g, Math.round(82.7 * 2));
  assert.equal(day.nutrition.protein, Math.round(82.7 * 2));
});

test("when the safety floor holds the target up, the reason says the pace will be slower", async () => {
  const d = db();
  profile(d, { sex: "female", age: 30, height: 160, activity: "sedentary", goal: "lose_1", sportHours: "0" });
  point(d, "manual", "weight", "w", { sample: "2098-12-30T07:00:00Z", value: 55 });
  const day = await daily(d);
  const floor = Math.round(10 * 55 + 6.25 * 160 - 5 * 30 - 161);
  assert.equal(day.nutrition.calorieTarget, floor);
  assert.equal(day.nutrition.calorieBreakdown.floorApplied, true);
  assert.match(day.nutrition.reason, new RegExp(`bezpečné minimum ${floor} kcal`));
  // Maintaining stays above the floor: no message.
  const kept = db();
  profile(kept, { sex: "female", age: 30, height: 160, activity: "sedentary", goal: "maintain", sportHours: "0" });
  point(kept, "manual", "weight", "w", { sample: "2098-12-30T07:00:00Z", value: 55 });
  const maintain = await daily(kept);
  assert.equal(maintain.nutrition.calorieBreakdown.floorApplied, false);
  assert.doesNotMatch(maintain.nutrition.reason, /bezpečné minimum/);
});

test("the weight trend corrects the target by energy balance against the chosen goal", async () => {
  const trend = (rate, extra = {}) => ({ samples: 5, weeklyRateKg: rate, spanDays: 28, ...extra });
  assert.equal(trendAdjustment("lose_0.5", trend(0.1)).adjustment, -250);
  assert.equal(trendAdjustment("lose_0.5", trend(-0.4)).adjustment, 0);
  assert.equal(trendAdjustment("lose_0.5", trend(-0.9)).adjustment, 225);
  assert.equal(trendAdjustment("lose_0.25", trend(-0.2)).adjustment, 0);
  assert.equal(trendAdjustment("maintain", trend(0.3)).adjustment, -175);
  assert.equal(trendAdjustment("maintain", trend(-0.3)).adjustment, 175);
  assert.equal(trendAdjustment("maintain", trend(0.1)).adjustment, 0);
  assert.equal(trendAdjustment("lose_0.5", trend(0.1, { samples: 3 })).adjustment, 0);
  assert.equal(trendAdjustment("lose_0.5", trend(0.1, { spanDays: 14 })).adjustment, 0);
  // Slightly off the goal: a small step, proportional to the gap.
  assert.equal(trendAdjustment("lose_0.5", trend(-0.2)).adjustment, -175);

  // Five weigh-ins over four weeks, slightly up while trying to lose: 250 kcal less today.
  const today = pragueToday(), back = days => new Date(Date.parse(today + "T07:00:00Z") - days * 86400000).toISOString();
  const run = async weights => {
    const d = db();
    profile(d, man);
    weights.forEach((kg, i) => point(d, "manual", "weight", "w" + i, { sample: back(28 - i * 7), value: kg }));
    return (await daily(d, today)).nutrition;
  };
  const flat = await run([80]), rising = await run([80, 80.1, 80.2, 80.3, 80.4]);
  assert.equal(rising.calorieBreakdown.trendAdjustment, -250);
  assert.match(rising.reason, /Podle vývoje váhy/);
  assert.equal(flat.calorieBreakdown.trendAdjustment, 0);
  // The app's correction is what the ChatGPT plan reports.
  assert.equal(withAppTarget({ calorieTarget: 2250, macros: {} }, { nutrition: rising }).adaptiveCalorieAdjustment, -250);
});

test("the weekly weight rate is a least-squares slope, not two end points", async () => {
  const { d1WeightTrend } = await import("../src/strength-context.js");
  const today = pragueToday(), back = days => new Date(Date.parse(today + "T07:00:00Z") - days * 86400000).toISOString();
  const d = db();
  // A steady 0.5 kg/week loss with a water-heavy last morning (+1 kg).
  const kgs = [82, 81.5, 81, 80.5, 81];
  kgs.forEach((kg, i) => point(d, "manual", "weight", "s" + i, { sample: back(28 - i * 7), value: kg }));
  const trend = await d1WeightTrend({ DB: d, USER_ID: 7 }, today);
  // The end points alone would say −0.25 kg/week.
  assert.equal(trend.weeklyRateKg, -0.3);
});
