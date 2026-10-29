import test from "node:test";
import assert from "node:assert/strict";
import { buildFoodWeek } from "../src/app-food-week.js";
import { dayCalories } from "../src/app-food.js";

const dates = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
const day = (i, kcal, target, bonus, everyday) => ({ date: dates[i], kcal, target, trainingBonus: bonus, everyday });

test("A week on Thursday: seven everyday intakes plus what training added", () => {
  const week = buildFoodWeek({ today: "2026-10-15", days: [
    day(0, 2480, 2550, 450, 2100), day(1, 2050, 2100, 0, 2100), day(2, 2760, 2720, 620, 2100), day(3, 1250, 2480, 380, 2100),
    day(4, 0, 2100, null, 2100), day(5, 300, 3000, 900, 2100), day(6, 0, 2400, 300, 2100)
  ] });
  assert.equal(week.base, 14700, "7 × 2100");
  assert.equal(week.exercise, 2650);
  assert.equal(week.target, 17350);
  assert.equal(week.eaten, 8540, "Saturday's planned meal is not eaten yet");
  assert.equal(week.byToday, 9850);
  assert.equal(week.left, 8810);
  assert.equal(week.over, 0);
  assert.equal(week.perDay, 2940, "the three days after today share what is left");
  assert.equal(week.days[5].eaten, null);
  assert.equal(week.days[5].ahead, true);
});

// Wednesday 28. 10.: the day target 1703 is the safe minimum 1592 plus 111
// that training really added (433 × 0.7 coverage lands only 111 above it);
// Monday and Tuesday were active days.
test("The daily intake is today's for all seven days, the rest is for the days after today", () => {
  const today = "2026-10-14";
  const days = [day(0, 2400, 2600, 300, 1592), day(1, 2523, 2511, 0, 1592), day(2, 2301, 1703, 111, 1592),
    day(3, 0, 1592, 0, 1592), day(4, 0, 1592, 0, 1592), day(5, 0, 1592, 0, 1592), day(6, 0, 1592, 0, 1592)];
  const week = buildFoodWeek({ today, days });
  assert.equal(week.base, 7 * 1592);
  assert.equal(week.exercise, 1008 + 919 + 111);
  assert.equal(week.target, 13182);
  assert.equal(week.byToday, 6814);
  assert.equal(week.left, 5958);
  assert.equal(week.perDay, 1490, "5958 over Thursday to Sunday, not 5 days with today");
  // After dinner the rest for the days ahead goes down with it.
  const later = buildFoodWeek({ today, days: days.map((d, i) => i === 2 ? { ...d, kcal: d.kcal + 500 } : d) });
  assert.equal(later.left, 5458);
  assert.equal(later.perDay, 1360);
});

test("Days gone by worked out with another everyday intake keep today's number", () => {
  const week = buildFoodWeek({ today: "2026-10-13", days: [day(0, 0, 1800, 0, 1800), day(1, 0, 1700, 0, 1700),
    ...dates.slice(2).map((d, i) => day(i + 2, 0, 1700, 0, 1700))] });
  assert.equal(week.base, 7 * 1700);
  assert.equal(week.exercise, 100, "Monday allowed 100 above the daily intake");
});

test("Eating more than the week allows", () => {
  const week = buildFoodWeek({ today: "2026-10-18", days: dates.map((d, i) => day(i, 2600, 2400, i === 2 ? 500 : 0)) });
  assert.equal(week.target, 16800);
  assert.equal(week.eaten, 18200);
  assert.equal(week.left, 0);
  assert.equal(week.over, 1400);
  assert.equal(week.perDay, null);
});

test("On Sunday there is no day after today to share the rest", () => {
  const week = buildFoodWeek({ today: "2026-10-18", days: dates.map((d, i) => day(i, 1000, 2000, 0, 2000)) });
  assert.equal(week.left, 7000);
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
  assert.equal(week.days[0].everyday, 0);
});

test("Training adds only what it raises the target by above the safe minimum", () => {
  const breakdown = { activityAdjustment: 619, trainingCoverage: 0.7, restIntakeTarget: 1270, sportDailyAverage: 0, minTarget: 1592 };
  assert.deepEqual(dayCalories({ calorieTarget: 1703, calorieBreakdown: breakdown }), { target: 1703, everyday: 1592, bonus: 111 });
  // Above the minimum the whole training part counts.
  assert.deepEqual(dayCalories({ calorieTarget: 2433, calorieBreakdown: { ...breakdown, restIntakeTarget: 2000 } }), { target: 2433, everyday: 2000, bonus: 433 });
  // An active day the Google Health budget raised: the day still shows only training.
  assert.deepEqual(dayCalories({ calorieTarget: 2600, calorieBreakdown: { ...breakdown, activityAdjustment: 0 } }), { target: 2600, everyday: 1592, bonus: 0 });
});
