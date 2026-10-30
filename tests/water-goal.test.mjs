import test from "node:test";
import assert from "node:assert/strict";
import { buildUp, waterGoal, waterNudge, weekStep, loadBuild } from "../src/water-goal.js";
import { ensure } from "../src/fluids.js";
import { createD1 } from "./helpers/d1.mjs";
import { applyEnergyBudget } from "../src/energy-budget.js";
import { normalizeProfile } from "../src/energy-profile.js";

const week = (monday, ml) => Object.fromEntries(Array.from({ length: 7 }, (_, i) => [new Date(Date.parse(monday + "T12:00:00Z") + i * 864e5).toISOString().slice(0, 10), ml]));
const auto = { ml: 3700, baseMl: 3200, exerciseMl: 500 };

test("the automatic step follows how the week went", () => {
  assert.equal(weekStep(1), 250);
  assert.equal(weekStep(0.85), 100);
  assert.equal(weekStep(0.7), 0);
  assert.equal(weekStep(0.5), -250);
  assert.equal(weekStep(0.9, "500"), 500);
  assert.equal(weekStep(0.5, "100"), -100);
});

test("Build-up moves week by week, never above Auto nor under a litre", () => {
  const drunk = { ...week("2026-10-05", 2000), ...week("2026-10-12", 1700), ...week("2026-10-19", 1000) };
  const r = buildUp({ startMl: 2000, from: "2026-10-05", date: "2026-10-28", capMl: 3200, drunk });
  assert.deepEqual(r.weeks.map(w => w.targetMl), [2000, 2250, 2250]);
  assert.equal(r.targetMl, 2000);
  assert.equal(buildUp({ startMl: 3100, from: "2026-10-05", date: "2026-10-14", capMl: 3200, drunk: week("2026-10-05", 3100) }).targetMl, 3200);
  assert.equal(buildUp({ startMl: 1000, from: "2026-10-05", date: "2026-10-14", capMl: 3200, drunk: {} }).targetMl, 1000);
});

test("the day's goal: Custom and Build-up add the training on top, Auto keeps the target", () => {
  assert.equal(waterGoal(auto, {}).ml, 3700);
  assert.equal(waterGoal(auto, { waterMode: "custom", waterGoal: 2000 }).ml, 2500);
  const built = waterGoal(auto, { waterMode: "build", waterStart: 2000 }, { targetMl: 2250, weeks: [] });
  assert.equal(built.ml, 2750);
  assert.equal(built.autoMl, 3700);
  assert.equal(built.build.weekMl, 2250);
});

test("Build-up stores each finished week once, so a later day reads only those rows", async () => {
  const db = createD1(); db.userId = 1;
  await ensure(db);
  for (let i = 0; i < 7; i++) await db.prepare("INSERT INTO fluid_log(user_id,date,consumed_at,ml,kind) VALUES(1,?,?,2000,'water')").bind(`2026-10-${19 + i}`, `2026-10-${19 + i}T10:00`).run();
  const profile = { waterMode: "build", waterStart: 2000, waterStep: "auto", waterFrom: "2026-10-19" };
  const first = await loadBuild(db, profile, "2026-10-28", 3200);
  assert.equal(first.targetMl, 2250);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM water_build").get().n, 1);
  db.sqlite.exec("DELETE FROM fluid_log");
  const again = await loadBuild(db, profile, "2026-10-29", 3200);
  assert.equal(again.targetMl, 2250);
  assert.deepEqual(again.weeks.map(w => w.percent), [100]);
  // A new start begins a new run.
  assert.equal((await loadBuild(db, { ...profile, waterStart: 1500, waterFrom: "2026-10-29" }, "2026-10-29", 3200)).targetMl, 1500);
});

test("one push only on a day behind, at 14:00 and 18:00", () => {
  assert.ok(waterNudge({ hour: 14, drunkMl: 600, goalMl: 2000 }));
  assert.equal(waterNudge({ hour: 14, drunkMl: 1000, goalMl: 2000 }), null);
  assert.equal(waterNudge({ hour: 15, drunkMl: 0, goalMl: 2000 }), null);
});

test("an own calorie goal replaces the target and keeps the computed one", () => {
  const daily = { nutrition: { calorieTarget: 2450, macros: { protein_g: 150, fat_g: 70 } } };
  applyEnergyBudget(daily, { kcalGoal: 2200 }, null);
  assert.equal(daily.nutrition.calorieTarget, 2200);
  assert.equal(daily.nutrition.autoCalorieTarget, 2450);
  assert.equal(daily.nutrition.macros.carbs_g, Math.round((2200 - 600 - 630) / 4));
});

test("the profile keeps the goals only in range", () => {
  const p = normalizeProfile({ kcalGoal: 200, waterMode: "build", waterStart: 2000, waterStep: "250", waterFrom: "2026-10-26" });
  assert.equal(p.kcalGoal, null);
  assert.deepEqual([p.waterMode, p.waterStart, p.waterStep, p.waterFrom], ["build", 2000, "250", "2026-10-26"]);
  assert.equal(normalizeProfile({ waterMode: "x", waterStep: "7" }).waterStep, "auto");
});
