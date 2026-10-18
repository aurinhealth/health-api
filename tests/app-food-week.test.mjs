import test from "node:test";
import assert from "node:assert/strict";
import { buildFoodWeek } from "../src/app-food-week.js";

const dates = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
const day = (i, kcal, target, bonus) => ({ date: dates[i], kcal, target, trainingBonus: bonus });

test("A week on Thursday: the targets add up, the days ahead have nothing eaten", () => {
  const week = buildFoodWeek({ today: "2026-10-15", days: [
    day(0, 2480, 2550, 450), day(1, 2050, 2100, 0), day(2, 2760, 2720, 620), day(3, 1250, 2480, 380),
    day(4, 0, 2100, null), day(5, 300, 3000, 900), day(6, 0, 2400, 300)
  ] });
  assert.equal(week.target, 17350);
  assert.equal(week.exercise, 2650);
  assert.equal(week.base, 14700);
  assert.equal(week.eaten, 8540, "Saturday's planned meal is not eaten yet");
  assert.equal(week.byToday, 9850);
  assert.equal(week.left, 8810);
  assert.equal(week.over, 0);
  assert.equal(week.perDay, 2200, "today and the three days ahead share what is left");
  assert.equal(week.days[5].eaten, null);
  assert.equal(week.days[5].ahead, true);
});

test("Eating more than the week allows", () => {
  const week = buildFoodWeek({ today: "2026-10-18", days: dates.map((d, i) => day(i, 2600, 2400, i === 2 ? 500 : 0)) });
  assert.equal(week.target, 16800);
  assert.equal(week.eaten, 18200);
  assert.equal(week.left, 0);
  assert.equal(week.over, 1400);
  assert.equal(week.perDay, null);
});

test("Without a calorie target there is no week to fill", () => {
  const week = buildFoodWeek({ today: "2026-10-15", days: dates.map((d, i) => day(i, 1000, null, null)) });
  assert.equal(week.target, null);
  assert.equal(week.eaten, 4000);
});

test("The training part never exceeds the day's target", () => {
  const week = buildFoodWeek({ today: "2026-10-15", days: [day(0, 0, 1800, 2500)] });
  assert.equal(week.days[0].exercise, 1800);
  assert.equal(week.days[0].base, 0);
});
