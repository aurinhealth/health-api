import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { logFood, updateFoodEntry } from "../src/food-log.js";

// The app's diary table as in production after migration 0007.
function setup() {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE food_logs (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL NOT NULL DEFAULT (1), kcal REAL NOT NULL DEFAULT (0), protein_g REAL NOT NULL DEFAULT (0), carbs_g REAL NOT NULL DEFAULT (0), fat_g REAL NOT NULL DEFAULT (0), fiber_g REAL NOT NULL DEFAULT (0), source TEXT NOT NULL DEFAULT ('manual'), note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), status TEXT)");
  return { raw, db: scopedDb(raw, 1) };
}
const rows = raw => raw.sqlite.prepare("SELECT * FROM food_logs ORDER BY id").all();
const appEaten = raw => raw.sqlite.prepare("SELECT COALESCE(SUM(kcal),0) AS kcal FROM food_logs WHERE status IS NULL OR status='eaten'").get().kcal;

test("food logged by the coach goes straight into the app's diary", async () => {
  const { raw, db } = setup();
  const meal = await logFood(db, { date: "2026-10-05", name: "Rýže s kuřetem", calories: 640, protein_g: 47, carbs_g: 78, fat_g: 15, mealType: "oběd", mealTime: "12:30", servings: null });
  // servings: null is one portion, not 0.01 of it.
  assert.equal(meal.servings, 1);
  const [row] = rows(raw);
  assert.equal(row.id, meal.id);
  assert.equal(row.recipe_title, "Rýže s kuřetem");
  assert.equal(row.kcal, 640);
  assert.equal(row.status, null);
  assert.equal(row.consumed_at, "2026-10-05T12:30:00");
  assert.equal(JSON.parse(row.note).mealType, "lunch");
  // A correction changes the same row.
  await updateFoodEntry(db, { id: meal.id, servings: 2 });
  assert.equal(rows(raw)[0].kcal, 1280);
  assert.equal(appEaten(raw), 1280);
});

test("a planned meal stays out of the app's totals until it is eaten", async () => {
  const { raw, db } = setup();
  const planned = await logFood(db, { date: "2026-10-05", name: "Tvaroh", calories: 200, protein_g: 30, status: "planned", servings: 2 });
  assert.equal(rows(raw)[0].status, "planned");
  assert.equal(appEaten(raw), 0);
  await updateFoodEntry(db, { id: planned.id, status: "eaten" });
  assert.equal(appEaten(raw), 400);
});
