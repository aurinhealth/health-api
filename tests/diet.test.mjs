import test from "node:test";
import assert from "node:assert/strict";
import { dayMacros, refillMacros, normalizeDiet, autoProteinPerKg, withoutProDiet, fitsEating, dietSummary, STYLES, FAT_FLOOR_PER_KG } from "../src/diet.js";
import { applyEnergyBudget } from "../src/energy-budget.js";
import { withAppTarget } from "../src/nutrition-intelligence.js";
import { targetsFor, buildNutrients, buildNutrientDetail, UPPER } from "../src/micronutrients.js";

const kcalOf = m => m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
const lose = { goal: "lose_0.5" };

test("balanced keeps the earlier split while losing weight", () => {
  // Before the diet: protein 2.0 g/kg, fat 0.9 on rest, 0.7 on endurance, 0.85 on the gym.
  for (const [context, fatPerKg] of [[{}, 0.9], [{ endurance: true }, 0.7], [{ preRide: true }, 0.7], [{ recoveryRide: true }, 0.75], [{ strength: true }, 0.85]]) {
    const m = dayMacros(80, 2400, context, lose);
    assert.equal(m.protein_g, 160);
    assert.equal(m.fat_g, Math.round(80 * fatPerKg));
    assert.equal(m.carbs_g, Math.round((2400 - 160 * 4 - m.fat_g * 9) / 4));
    assert.equal(m.fill, "carbs");
    assert.equal(m.carbs_max, false);
  }
});

test("auto protein follows the goal, the gym and a vegan diet", () => {
  assert.equal(autoProteinPerKg({ goal: "lose_0.5" }), 2.0);
  assert.equal(autoProteinPerKg({ goal: "maintain" }), 1.6);
  // No goal yet: the default deficit.
  assert.equal(autoProteinPerKg({}), 2.0);
  assert.equal(autoProteinPerKg({ goal: "gain_0.25" }), 1.8);
  assert.equal(autoProteinPerKg({ goal: "lose_0.5", mainSport: "strength" }), 2.2);
  assert.equal(autoProteinPerKg({ goal: "maintain", mainSport: "strength", dietEating: "vegan" }), 2.0);
  assert.equal(dayMacros(80, 2600, {}, { goal: "maintain", dietEating: "vegan" }).protein_per_kg, 1.8);
});

test("an own protein per kg replaces Auto in every style", () => {
  for (const style of STYLES) {
    const m = dayMacros(80, 2600, {}, { ...lose, dietStyle: style, proteinPerKg: 2.6 });
    assert.equal(m.protein_g, 208, style);
    assert.equal(m.protein_auto, false);
  }
});

test("high protein: 2.2 g/kg, 2.4 while losing weight, fat 0.7", () => {
  assert.equal(dayMacros(80, 2600, {}, { goal: "maintain", dietStyle: "high_protein" }).protein_g, 176);
  const m = dayMacros(80, 2600, {}, { ...lose, dietStyle: "high_protein" });
  assert.equal(m.protein_g, 192);
  assert.equal(m.fat_g, 56);
});

test("keto: a net carb limit, fat fills the calories, protein at least 1.6", () => {
  const m = dayMacros(80, 2400, {}, { goal: "maintain", dietStyle: "keto" });
  assert.equal(m.carbs_g, 30);
  assert.equal(m.protein_g, 128);
  assert.equal(m.fill, "fat");
  assert.ok(m.carbs_max && !m.net_carbs);
  assert.ok(Math.abs(kcalOf(m) - 2400) <= 9);
  assert.equal(dayMacros(80, 2400, {}, { dietStyle: "keto", netCarbLimit: 50 }).carbs_g, 50);
  // A training day keeps the carbs; the extra energy is fat.
  assert.equal(dayMacros(80, 3200, { endurance: true, totalEnduranceHours: 3 }, { dietStyle: "keto" }).carbs_g, 30);
});

test("lower carb: 100 g, up to 2 g/kg on a big training day", () => {
  assert.equal(dayMacros(80, 2400, {}, { dietStyle: "lower_carb" }).carbs_g, 100);
  assert.equal(dayMacros(80, 2400, { endurance: true, totalEnduranceHours: 1 }, { dietStyle: "lower_carb" }).carbs_g, 100);
  assert.equal(dayMacros(80, 2800, { endurance: true, totalEnduranceHours: 2 }, { dietStyle: "lower_carb" }).carbs_g, 160);
  assert.equal(dayMacros(80, 2800, { endurance: true, strength: true, totalEnduranceHours: 1 }, { dietStyle: "lower_carb" }).carbs_g, 160);
});

test("custom: protein and fat or carbs, the other fills the calories", () => {
  const fat = dayMacros(80, 2450, {}, { ...lose, dietStyle: "custom", proteinPerKg: 2.0, customSet: "fat", customFatPerKg: 1.0 });
  assert.deepEqual([fat.protein_g, fat.fat_g, fat.fill], [160, 80, "carbs"]);
  assert.ok(Math.abs(kcalOf(fat) - 2450) <= 4);
  const carbs = dayMacros(80, 2450, {}, { ...lose, dietStyle: "custom", customSet: "carbs", customCarbs: 150 });
  assert.deepEqual([carbs.carbs_g, carbs.fill, carbs.carbs_max], [150, "fat", false]);
  assert.ok(Math.abs(kcalOf(carbs) - 2450) <= 9);
});

test("fat never drops below 0.5 g/kg: the carbs give way", () => {
  const m = dayMacros(80, 1400, {}, { ...lose, dietStyle: "custom", customSet: "carbs", customCarbs: 300 });
  assert.equal(m.fat_g, 40);
  assert.equal(m.carbs_g, Math.floor((1400 - 160 * 4 - 40 * 9) / 4));
});

test("every style, goal and sport day adds up to the calories with a fat floor", () => {
  const goals = ["lose_1", "lose_0.5", "maintain", "gain_0.5"];
  const days = [{}, { strength: true }, { endurance: true, totalEnduranceHours: 1 }, { endurance: true, totalEnduranceHours: 3 }, { preRide: true }, { endurance: true, strength: true, totalEnduranceHours: 1.5 }];
  const sports = ["cycling", "running", "triathlon", "strength", "general"];
  for (const dietStyle of STYLES) for (const goal of goals) for (const context of days) for (const mainSport of sports) for (const [kg, kcal] of [[60, 1800], [80, 2600], [95, 3600]]) {
    const m = dayMacros(kg, kcal, context, { goal, mainSport, dietStyle, customSet: "carbs", customCarbs: 180 });
    const label = `${dietStyle} ${goal} ${mainSport} ${JSON.stringify(context)} ${kg}`;
    assert.ok(m.fat_g >= Math.round(kg * FAT_FLOOR_PER_KG), label);
    assert.ok(m.carbs_g >= 0 && m.protein_g > 0, label);
    assert.ok(Math.abs(kcalOf(m) - kcal) <= 9, `${label}: ${kcalOf(m)} vs ${kcal}`);
    assert.ok(m.protein_per_meal_g >= 20 && m.protein_per_meal_g <= 40, label);
  }
});

test("a new calorie target moves the macro the diet fills", () => {
  const keto = dayMacros(80, 2400, {}, { dietStyle: "keto" });
  const up = refillMacros({ ...keto }, 3000);
  assert.equal(up.carbs_g, 30);
  assert.ok(Math.abs(kcalOf(up) - 3000) <= 9);
  const balanced = dayMacros(80, 2400, {}, lose);
  const more = refillMacros({ ...balanced }, 3000);
  assert.equal(more.fat_g, balanced.fat_g);
  assert.equal(more.carbs_g, balanced.carbs_g + 150);
  // Macros from before the diet (no fill) behave as before: carbs take the rest.
  assert.equal(refillMacros({ protein_g: 178, fat_g: 71 }, 4000).carbs_g, Math.round((4000 - 178 * 4 - 71 * 9) / 4));
});

test("the energy budget keeps keto carbs and raises fat", () => {
  const macros = dayMacros(89, 2600, {}, { goal: "lose_0.5", dietStyle: "keto" });
  const daily = applyEnergyBudget({ weight: { current: 89 }, calories: { target: 2600 }, nutrition: { calorieTarget: 2600, calorieBreakdown: { weightLossDeficit: 300 }, macros: { ...macros } } },
    { age: 30, height: 180, sex: "male" }, { today: { activeCalories: 2000 } });
  assert.equal(daily.nutrition.calorieTarget, 4000);
  assert.equal(daily.nutrition.macros.carbs_g, 30);
  assert.ok(daily.nutrition.macros.fat_g > macros.fat_g);
});

test("the ChatGPT plan keeps the diet's carbs", () => {
  const macros = dayMacros(80, 2400, {}, { dietStyle: "keto" });
  const plan = withAppTarget({ calorieTarget: 2200, macros: {} }, { nutrition: { calorieTarget: 2400, macros, diet: dietSummary({ dietStyle: "keto" }, macros) } });
  assert.equal(plan.macros.carbsGrams, 30);
  assert.equal(plan.diet.style, "keto");
});

test("the profile keeps only known diet values", () => {
  assert.deepEqual(normalizeDiet({ dietEating: "carnivore", dietStyle: "paleo", proteinPerKg: 5, netCarbLimit: 33, customSet: "x", customCarbs: -4, customFatPerKg: 0.2, nutrientTargets: { fe: "25", "bad key": 4, zn: -1 } }),
    { dietEating: "everything", dietStyle: "balanced", proteinPerKg: null, netCarbLimit: 35, customSet: "fat", customCarbs: null, customFatPerKg: null, nutrientTargets: { fe: 25 } });
  assert.equal(normalizeDiet({ proteinPerKg: "2.27" }).proteinPerKg, 2.3);
  assert.deepEqual(withoutProDiet({ dietStyle: "custom", proteinPerKg: 2.4, nutrientTargets: { fe: 20 }, dietEating: "vegan" }),
    { dietStyle: "balanced", proteinPerKg: null, nutrientTargets: {}, dietEating: "vegan" });
});

test("meals that suit what the athlete eats", () => {
  const cases = [["Kuřecí maso + rýže", "vegetarian", false], ["Tuňák + těstoviny", "pescatarian", true], ["Tuňák + těstoviny", "vegetarian", false],
    ["Skyr + banán", "vegetarian", true], ["Skyr + banán", "vegan", false], ["Ovesné vločky + sójový jogurt", "vegan", true], ["Toast with peanut butter", "vegan", true],
    ["Rybízový koláč", "vegetarian", true], ["Eggplant curry", "vegan", true], ["Eggs + bread", "vegan", false], ["Hamburger", "vegetarian", false],
    ["Kokosové mléko a tofu", "vegan", true], ["Chicken + rice", "everything", true], ["Chicken + rice", undefined, true]];
  for (const [text, eating, ok] of cases) assert.equal(fitsEating(text, eating), ok, `${text} / ${eating}`);
});

test("vegetarians get more iron and zinc, never above the upper limit", () => {
  const omni = targetsFor({ sex: "female" }), veg = targetsFor({ sex: "female", dietEating: "vegetarian" });
  assert.equal(omni.fe, 16);
  assert.equal(veg.fe, 28.8);
  assert.equal(veg.zn, 12);
  assert.equal(targetsFor({ sex: "male", dietEating: "vegan" }).zn, 16.5);
  assert.equal(veg.vitd, omni.vitd);
});

test("own nutrient targets: Pro only, capped by the EFSA upper limit", () => {
  const profile = { sex: "male", nutrientTargets: { fe: 25, vitd: 500, vitc: 1000, salt: 4 } };
  const own = targetsFor(profile);
  assert.deepEqual([own.fe, own.vitd, own.vitc, own.salt], [25, UPPER.vitd, 1000, 4]);
  assert.deepEqual(own.own.sort(), ["fe", "salt", "vitc", "vitd"]);
  const free = buildNutrients({ days: [], profile, pro: false }).items.find(i => i.key === "salt");
  assert.equal(free.target, 5);
  const pro = buildNutrients({ days: [], profile, pro: true }).items.find(i => i.key === "fe");
  assert.equal(pro.target, 25);
  const detail = buildNutrientDetail({ key: "fe", today: {}, week: [], profile: { ...profile, dietEating: "vegan" }, pro: true });
  assert.equal(buildNutrientDetail({ key: "fe", today: {}, week: [], profile }).custom, false);
  assert.deepEqual([detail.target, detail.autoTarget, detail.custom, detail.upperLimit, detail.autoBasis], [25, 19.8, true, 40, "vegan"]);
});

test("the Food screen shows keto carbs as a limit and the diet", async () => {
  const { buildFood } = await import("../src/app-food.js");
  const macros = dayMacros(80, 2400, {}, { dietStyle: "keto" });
  const food = buildFood({ date: "2026-10-30", daily: { nutrition: { calorieTarget: 2400, macros, diet: dietSummary({ dietStyle: "keto" }, macros) } }, food: { entries: [] } });
  assert.deepEqual(food.macros.carbs, { eaten: 0, target: 30, limit: true });
  assert.equal(food.diet.style, "keto");
  assert.equal(food.diet.carbsLimitG, 30);
  const plain = buildFood({ date: "2026-10-30", daily: { nutrition: { calorieTarget: 2400, macros: { protein_g: 160, carbs_g: 300, fat_g: 70 } } }, food: { entries: [] } });
  assert.deepEqual(plain.macros.carbs, { eaten: 0, target: 300 });
  assert.equal(plain.diet, null);
});

test("a plant word hides only the dairy after it, never meat or fish", () => {
  for (const meal of ["Kokosové kuře s rýží", "Coconut chicken curry", "Mandlový losos", "Peanut chicken stir-fry"]) assert.equal(fitsEating(meal, "vegetarian"), false, meal);
  for (const meal of ["Ovesná kaše s mandlovým mlékem", "Toast with peanut butter", "Sójový jogurt s ovocem", "Coconut milk curry with tofu"]) assert.equal(fitsEating(meal, "vegan"), true, meal);
});
