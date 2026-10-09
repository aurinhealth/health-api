import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFood, entryTime, mealOf } from "../src/app-food.js";

const DATE = "2026-10-08";
const entry = (id, title, at, kcal, note = {}) => ({ id, recipe_title: title, consumed_at: at, kcal, protein_g: kcal / 20, carbs_g: kcal / 8, fat_g: kcal / 40, note: JSON.stringify(note) });
const input = {
  date: DATE,
  hour: 15,
  daily: { nutrition: { calorieTarget: 2650, macros: { protein_g: 150, carbs_g: 330, fat_g: 80 }, calorieBreakdown: { activityAdjustment: 500, trainingCoverage: 0.7 } } },
  food: {
    entries: [
      entry(1, "Ovesná kaše s jogurtem", DATE + "T07:30:00", 430, { mealType: "breakfast", enteredQuantity: 1, enteredUnit: "portion" }),
      entry(2, "Rýže s kuřecím masem", DATE + "T10:30:00Z", 640, { mealType: "lunch" }),
      entry(3, "Banán", DATE + "T08:10:00", 105),
      { ...entry(4, "Plánovaná večeře", DATE + "T19:00:00", 800, { mealType: "dinner" }), status: "planned" }
    ],
    totals: { kcal: 1175, protein_g: 58.8, carbs_g: 146.9, fat_g: 29.4 }
  },
  fluids: { totalMl: 1800, target: { ml: 2500 }, entries: [{ id: 1, ml: 500, kind: "water" }, { id: "food:2", ml: 200, kind: "food" }] }
};

test("Entry times and meal slots", () => {
  assert.equal(entryTime(DATE + "T07:30:00"), "07:30", "local time as typed");
  assert.equal(entryTime(DATE + "T10:30:00Z"), "12:30", "UTC to Prague summer time");
  assert.equal(entryTime(null), null);
  assert.equal(mealOf({ mealType: "snack" }, "09:00"), "snack_am");
  assert.equal(mealOf({ mealType: "snack" }, "15:00"), "snack_pm");
  assert.equal(mealOf({}, "08:10"), "breakfast");
  assert.equal(mealOf({}, "13:00"), "lunch");
  assert.equal(mealOf({}, "20:00"), "dinner");
});

test("Food: eaten against the target, macros and meals in their slots", () => {
  const f = buildFood(input);
  assert.equal(f.kcal, 1175);
  assert.equal(f.target, 2650);
  assert.equal(f.trainingBonus, 350);
  assert.match(f.sentence, /^Tréninkový den: o 350 kcal víc\. Zbývá 1475 kcal/);
  assert.deepEqual(f.macros.protein, { eaten: 59, target: 150 });
  const types = f.meals.map(m => m.type);
  assert.deepEqual(types, ["breakfast", "lunch", "snack_pm", "dinner"], "the morning snack slot is past and empty");
  const breakfast = f.meals[0];
  assert.equal(breakfast.entries.length, 2, "the banana at 8:10 is breakfast");
  assert.equal(breakfast.kcal, 535);
  assert.equal(breakfast.entries[0].amount, "1 porce");
  assert.equal(f.meals[1].time, "12:30");
  assert.ok(!f.meals.some(m => m.entries.some(e => e.name === "Plánovaná večeře")), "planned food is not eaten");
  const snack = f.meals[2], dinner = f.meals[3];
  assert.equal(snack.suggestion.kcal, Math.round(1475 * 0.1 / 0.35 / 10) * 10);
  assert.equal(dinner.suggestion.kcal, Math.round(1475 * 0.25 / 0.35 / 10) * 10);
  assert.equal(f.water.ml, 1800);
  assert.equal(f.water.entries, 1);
});

test("A past day has no suggestions for the empty slots it still has", () => {
  const f = buildFood({ ...input, hour: null, food: { entries: [], totals: {} }, daily: { nutrition: { calorieTarget: 2000 } } });
  assert.equal(f.meals.length, 5, "without the hour every empty slot gets a share");
  assert.equal(f.meals[0].suggestion.kcal, 500);
});

test("Food stays usable without data", () => {
  const f = buildFood({ date: DATE });
  assert.equal(f.target, null);
  assert.equal(f.sentence, null);
  assert.deepEqual(f.meals, []);
  assert.equal(f.water.ml, null);
});

test("The server answers GET /app/api/food-today with buildFood", () => {
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname==='\/app\/api\/food-today'&&request\.method==='GET'/);
  assert.match(src, /buildFood\(\{date,hour:date===localToday\(\)\?localHour\(\):null,daily,food,fluids\}\)/);
});
