import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyEnergyBudget } from "../src/energy-budget.js";

const profile = { age: 30, height: 180, sex: "male" };
const day = () => ({
  weight: { current: 89 },
  calories: { target: 2600 },
  nutrition: { calorieTarget: 2600, calorieBreakdown: { weightLossDeficit: 300 }, macros: { protein_g: 178, fat_g: 71 } }
});

test("the energy budget replaces the calorie target and recomputes carbs", () => {
  const daily = applyEnergyBudget(day(), profile, { today: { activeCalories: 2000 } });
  assert.equal(daily.nutrition.calorieTarget, 4000);
  assert.equal(daily.calories.target, 4000);
  assert.equal(daily.nutrition.energyBudget.source, "google-health");
  assert.equal(daily.nutrition.macros.carbs_g, Math.round((4000 - 178 * 4 - 71 * 9) / 4));
});

test("without a profile or the day's active calories the legacy target stays", () => {
  assert.equal(applyEnergyBudget(day(), null, { today: { activeCalories: 2000 } }).nutrition.calorieTarget, 2600);
  assert.equal(applyEnergyBudget(day(), profile, { today: {} }).nutrition.calorieTarget, 2600);
  assert.equal(applyEnergyBudget(day(), profile, null).nutrition.calorieTarget, 2600);
  assert.deepEqual(applyEnergyBudget({}, profile, { today: { activeCalories: 2000 } }), {});
});

test("day view, week view and coaches all apply the same energy budget", () => {
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  // Day view, each day of the week view, and the coach inputs.
  assert.equal(source.match(/applyEnergyBudget\(/g).length, 3);
  assert.match(source, /daily: applyEnergyBudget\(await dailyResponse\.json\(\), profile,/);
});

test("early in the day the expected day from the profile is the floor of the target", () => {
  // Morning: 150 kcal of active energy so far gives a running budget far below
  // a normal day; the profile's expected day (2600 here) holds.
  const morning = applyEnergyBudget(day(), profile, { today: { activeCalories: 150 } });
  assert.equal(morning.nutrition.calorieTarget, 2600);
  assert.equal(morning.nutrition.energyBudget.basis, "profile");
  assert.equal(morning.nutrition.energyBudget.expectedTarget, 2600);
  // A very active day: the measured energy takes over.
  const busy = applyEnergyBudget(day(), profile, { today: { activeCalories: 2000 } });
  assert.equal(busy.nutrition.calorieTarget, 4000);
  assert.equal(busy.nutrition.energyBudget.basis, "google-health");
});
