import test from "node:test";
import assert from "node:assert/strict";
import { productFromLabel, calculateAmount, normalizeBarcode } from "../src/food-sources.js";
import { remainingNutrition, recommendFood } from "../src/food-log.js";

test("package label is the highest-priority source", () => {
  const p = productFromLabel({
    name: "Milbona High Protein Pudding",
    brand: "Milbona",
    calories_100g: 81,
    protein_100g: 10,
    carbs_100g: 6.4,
    fat_100g: 1.6,
    fiber_100g: 0.7,
    salt_100g: 0.28
  });
  assert.equal(p.source, "package_label");
  assert.equal(p.confidence, "highest");
  assert.equal(p.calories_100g, 81);
  assert.equal(p.protein_100g, 10);
  assert.equal(p.fiber_100g, 0.7);
  assert.equal(p.salt_100g, 0.28);
});

test("200 g label values are calculated exactly", () => {
  const p = productFromLabel({calories_100g:81,protein_100g:10,carbs_100g:6.4,fat_100g:1.6,fiber_100g:0.7,salt_100g:0.28});
  const x = calculateAmount(p, 200);
  assert.deepEqual(x, {
    grams:200, calories:162, protein_g:20, carbs_g:12.8, fat_g:3.2, fiber_g:1.4, salt_g:0.56
  });
});

test("barcode normalization keeps EAN-13 stable", () => {
  assert.equal(normalizeBarcode("4056489918325"), "4056489918325");
});

test("remaining nutrition never goes negative", () => {
  const r = remainingNutrition({
    calorieTarget: 2250,
    macros: {proteinGrams:176,carbsGrams:250,fatGrams:60}
  }, {calories:2400,protein_g:190,carbs_g:300,fat_g:80});
  assert.deepEqual(r, {calories:0,protein_g:0,carbs_g:0,fat_g:0});
});

test("recommendation prefers planned food before generic food", () => {
  const result = recommendFood({
    day:"2026-09-23",
    nutritionPlan:{
      calorieTarget:2250,
      macros:{proteinGrams:176,carbsGrams:250,fatGrams:60},
      training:{cyclingTrainingCalories:800},
      fueling:{plannedRide:null}
    },
    entries:{
      totals:{eaten:{calories:1500,protein_g:110,carbs_g:150,fat_g:35}},
      entries:[
        {id:7,status:"planned",recipe_name:"Kuřecí kari",servings:1,calories:500,protein_g:40,carbs_g:55,fat_g:12}
      ]
    }
  });
  assert.equal(result.plannedFoodOptions[0].id, 7);
  assert.equal(result.suggestions[0].reason, "use_planned_food");
  assert.equal(result.suggestions.some(x=>x.reason==="post_ride_recovery"), true);
});
