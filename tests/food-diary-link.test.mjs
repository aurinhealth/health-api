import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { logFood, getFoodDay, cancelFoodEntry, updateFoodEntry, consumePlannedFood, mirrorDayToDiary } from "../src/food-log.js";
import { deleteFoodEntry, copyFoodEntry } from "../src/food-entry-management.js";
import { buildWeeklyReview } from "../src/weekly-review.js";

// The app's diary table as the dashboard uses it.
function setup() {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE food_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, fiber_g REAL, source TEXT, note TEXT)");
  return { raw, db: scopedDb(raw, 1) };
}
const diary = raw => raw.sqlite.prepare("SELECT * FROM food_logs ORDER BY id").all();

test("food logged through ChatGPT appears in the app's diary and follows its changes", async () => {
  const { raw, db } = setup();
  const meal = await logFood(db, { date: "2026-10-05", name: "Rýže s kuřetem", calories: 640, protein_g: 47, carbs_g: 78, fat_g: 15, mealType: "oběd", mealTime: "12:30", servings: null });
  assert.equal(meal.diary, "added");
  // servings: null is one portion, not 0.01 of it.
  assert.equal(meal.servings, 1);
  let rows = diary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "food_log:" + meal.id);
  assert.equal(rows[0].kcal, 640);
  assert.equal(rows[0].consumed_at, "2026-10-05T12:30:00");
  assert.equal(JSON.parse(rows[0].note).mealType, "lunch");
  // A correction in ChatGPT updates the same diary row.
  await updateFoodEntry(db, { id: meal.id, servings: 2 });
  rows = diary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kcal, 1280);
  // Planned food is not in the diary until it is eaten.
  const planned = await logFood(db, { date: "2026-10-05", name: "Tvaroh", calories: 200, protein_g: 30, status: "planned" });
  assert.equal(diary(raw).length, 1);
  await consumePlannedFood(db, { id: planned.id });
  assert.equal(diary(raw).length, 2);
  // Cancelled in ChatGPT: gone from the diary.
  await cancelFoodEntry(db, meal.id);
  rows = diary(raw);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recipe_title, "Tvaroh");
});

test("ChatGPT's day counts what was logged in the app, once", async () => {
  const { raw, db } = setup();
  raw.sqlite.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,source,note) VALUES (1,'2026-10-05','2026-10-05T05:20:00.000Z','Ovesná kaše',1,430,18,70,9,'manual','{\"mealType\":\"breakfast\"}')").run();
  // Another user's meal never counts.
  raw.sqlite.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,source,note) VALUES (2,'2026-10-05','2026-10-05T06:00:00','Cizí',1,999,0,0,0,'manual','{}')").run();
  await logFood(db, { date: "2026-10-05", name: "Banán", calories: 100, protein_g: 1, carbs_g: 23, fat_g: 0 });
  const day = await getFoodDay(db, "2026-10-05");
  assert.equal(day.totals.eaten.calories, 530);
  const app = day.entries.find(e => e.source === "app");
  assert.equal(app.recipe_name, "Ovesná kaše");
  assert.equal(app.meal_time, "07:20");
  assert.equal(app.readOnly, true);
  // An app edit of a linked meal wins in ChatGPT's view.
  raw.sqlite.prepare("UPDATE food_logs SET kcal=150 WHERE source LIKE 'food_log:%'").run();
  assert.equal((await getFoodDay(db, "2026-10-05")).totals.eaten.calories, 580);
});

test("deleting or copying a linked meal in the app keeps both diaries consistent", async () => {
  const { raw, db } = setup();
  const meal = await logFood(db, { date: "2026-10-05", name: "Skyr", calories: 120, protein_g: 20 });
  const linked = diary(raw)[0];
  const copy = await copyFoodEntry(db, linked.id, "2026-10-06");
  assert.equal(diary(raw).find(r => r.id === copy.id).source, "manual");
  await deleteFoodEntry(db, linked.id);
  assert.equal(raw.sqlite.prepare("SELECT status FROM food_log WHERE id=?").get(meal.id).status, "cancelled");
  assert.equal((await getFoodDay(db, "2026-10-05")).totals.eaten.calories, 0);
});

test("older ChatGPT meals reach the diary when the day is read, and the weekly review counts each meal once", async () => {
  const { raw, db } = setup();
  await logFood(db, { date: "2026-10-04", name: "Starší jídlo", calories: 500, protein_g: 30 });
  raw.sqlite.exec("DELETE FROM food_logs");
  assert.equal(await mirrorDayToDiary(db, "2026-10-04"), 1);
  assert.equal(await mirrorDayToDiary(db, "2026-10-04"), 0);
  raw.sqlite.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,recipe_title,servings,kcal,protein_g,carbs_g,fat_g,source,note) VALUES (1,'2026-10-04','2026-10-04T18:00:00','Večeře',1,700,40,60,20,'manual','{}')").run();
  const review = await buildWeeklyReview({ DB: db, USER_ID: 1 }, { cycling: { recentActivities: [] }, strength: { recentCompletedSets: [] } }, "2026-10-05");
  assert.equal(review.nutrition.loggedDays, 1);
  assert.equal(review.nutrition.avgCalories, 1200);
});
