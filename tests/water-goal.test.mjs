import test from "node:test";
import assert from "node:assert/strict";
import { nextBase, waterGoal, waterNudge, loadBuild, forgetWaterFrom } from "../src/water-goal.js";
import { ensure } from "../src/fluids.js";
import { createD1 } from "./helpers/d1.mjs";
import { applyEnergyBudget } from "../src/energy-budget.js";
import { normalizeProfile } from "../src/energy-profile.js";

const auto = { ml: 3700, baseMl: 3200, exerciseMl: 500 };

const d = (drunkMl, goalMl, extraMl = 0) => ({ drunkMl, goalMl, extraMl, logged: drunkMl > 0 });

test("Build-up follows what the athlete drinks two days in a row", () => {
  // Mon 1.3, Tue 1.5, Wed 1.5 at 1.5 → Thursday 1.6.
  assert.equal(nextBase(1500, [d(1300, 1500), d(1500, 1500), d(1500, 1500)]), 1600);
  // Thu 2.0 at 1.6 → Friday 1.7 (the smaller day is Wednesday's 1.5).
  assert.equal(nextBase(1600, [d(1300, 1500), d(1500, 1500), d(1500, 1500), d(2000, 1600)]), 1700);
  // Fri 1.7 at 1.7 → Saturday 1.8.
  assert.equal(nextBase(1700, [d(1500, 1500), d(2000, 1600), d(1700, 1700)]), 1800);
  // Fri 2.2, Sat 2.3 at 1.8 → Sunday 2.1, at most 0.3 l a day.
  assert.equal(nextBase(1800, [d(2200, 1800), d(2300, 1800)]), 2100);
  // One weak day (71 %) keeps it; a second under 80 % takes 0.1 l off; under 60 % at once.
  assert.equal(nextBase(1700, [d(2000, 1600), d(1200, 1700)]), 1700);
  assert.equal(nextBase(1700, [d(1200, 1700), d(1300, 1700)]), 1600);
  assert.equal(nextBase(1700, [d(2000, 1600), d(900, 1700)]), 1600);
  // A day with nothing logged keeps it.
  assert.equal(nextBase(1700, [d(1700, 1700), d(0, 1700)]), 1700);
  // A training day is judged against its goal with the training extra.
  assert.equal(nextBase(1500, [d(1500, 1500), d(2000, 2000, 500)]), 1600);
  // Never above the Auto base.
  assert.equal(nextBase(3100, [d(3500, 3100), d(3500, 3100)], { capMl: 3200 }), 3200);
});

test("the day's goal: Custom and Build-up add the training on top, Auto keeps the target", () => {
  assert.equal(waterGoal(auto, {}).ml, 3700);
  assert.equal(waterGoal(auto, { waterMode: "custom", waterGoal: 2000 }).ml, 2500);
  const built = waterGoal(auto, { waterMode: "build", waterStart: 2000 }, { baseMl: 2200, days: [] });
  assert.equal(built.ml, 2700);
  assert.equal(built.autoMl, 3700);
  assert.equal(built.build.baseMl, 2200);
});

test("Build-up stores each finished day once and counts a day again after a late drink", async () => {
  const db = createD1(); db.userId = 1;
  await ensure(db);
  const drink = (date, ml) => db.prepare("INSERT INTO fluid_log(user_id,date,consumed_at,ml,kind) VALUES(1,?,?,?,'water')").bind(date, date + "T10:00", ml).run();
  await drink("2026-10-26", 1300); await drink("2026-10-27", 1500); await drink("2026-10-28", 1500);
  const profile = { waterMode: "build", waterStart: 1500, waterFrom: "2026-10-26" }, autoT = { baseMl: 3200, exerciseMl: 0 };
  assert.equal((await loadBuild(db, profile, "2026-10-29", autoT)).baseMl, 1600);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM water_build").get().n, 3);
  // The next request of the day reads only the stored rows.
  db.sqlite.exec("DELETE FROM fluid_log");
  assert.equal((await loadBuild(db, profile, "2026-10-29", autoT)).baseMl, 1600);
  // Wednesday's drinks were wrong: it counts again from the log.
  await forgetWaterFrom(db, "2026-10-28", "2026-10-29");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM water_build").get().n, 2);
  assert.equal((await loadBuild(db, profile, "2026-10-29", autoT)).baseMl, 1500);
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
  const p = normalizeProfile({ kcalGoal: 200, waterMode: "build", waterStart: 2000, waterFrom: "2026-10-26" });
  assert.equal(p.kcalGoal, null);
  assert.deepEqual([p.waterMode, p.waterStart, p.waterFrom], ["build", 2000, "2026-10-26"]);
  assert.equal(normalizeProfile({ waterMode: "x" }).waterMode, "");
});
