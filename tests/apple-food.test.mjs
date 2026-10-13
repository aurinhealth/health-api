import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { saveAppleFood, mealTypeOfName } from "../src/apple-food.js";
import { listFluids, deleteFluid } from "../src/fluids.js";
import { updateFoodEntry, deleteFoodEntry, copyFoodEntry } from "../src/food-entry-management.js";
import { queueFoodGoogle } from "../src/food-google-sync.js";
import { buildFood } from "../src/app-food.js";

// ensureFoodLogTable creates the table once per Worker; each test has a new database.
const diary = raw => raw.sqlite.exec("CREATE TABLE IF NOT EXISTS food_logs (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL NOT NULL DEFAULT (1), kcal REAL NOT NULL DEFAULT (0), protein_g REAL NOT NULL DEFAULT (0), carbs_g REAL NOT NULL DEFAULT (0), fat_g REAL NOT NULL DEFAULT (0), fiber_g REAL NOT NULL DEFAULT (0), source TEXT NOT NULL DEFAULT ('manual'), note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), status TEXT)");
const window = { from: "2026-10-12", to: "2026-10-13" };
const yogurt = { id: "A1", date: "2026-10-13", time: "12:40", name: "Řecký jogurt", app: "Yazio", kcal: 205, protein: 13, carbs: 6, fat: 14, sugar: 5.6 };

test("food and water other apps wrote to Apple Health land in the diary and stay in step", async () => {
  const raw = createD1(), db = scopedDb(raw, 7);
  diary(raw);
  assert.deepEqual(await saveAppleFood(raw, 7, { ...window, meals: [yogurt, { id: "A2", date: "2026-10-12", name: "Breakfast", app: "MyFitnessPal", kcal: 430 }], drinks: [{ id: "W1", date: "2026-10-13", time: "09:30", ml: 300, app: "Yazio" }] }), { saved: 3, removed: 0 });
  const rows = (await raw.prepare("SELECT * FROM food_logs WHERE user_id=7 ORDER BY consumed_date").all()).results;
  assert.equal(rows.length, 2);
  assert.equal(JSON.parse(rows[0].note).mealType, "breakfast");
  assert.equal(rows[1].source, "apple-health");
  assert.equal(JSON.parse(rows[1].note).sugar_g, 5.6);
  const drinks = await listFluids(db, "2026-10-13");
  assert.deepEqual(drinks.map(d => [d.ml, d.app]), [[300, "Yazio"]]);

  // Sent again with a change and without the breakfast: updated in place, the breakfast gone.
  const result = await saveAppleFood(raw, 7, { ...window, meals: [{ ...yogurt, kcal: 210 }], drinks: [] });
  assert.deepEqual(result, { saved: 1, removed: 2 });
  const after = (await raw.prepare("SELECT id,kcal FROM food_logs WHERE user_id=7").all()).results;
  assert.deepEqual(after, [{ id: rows[1].id, kcal: 210 }]);
  assert.equal((await listFluids(db, "2026-10-13")).length, 0);
});

test("other apps' food is not edited here and not sent on to Google; a copy is the athlete's own", async () => {
  const raw = createD1(), db = scopedDb(raw, 7);
  diary(raw);
  await saveAppleFood(raw, 7, { ...window, meals: [yogurt], drinks: [{ id: "W1", date: "2026-10-13", ml: 300 }] });
  const id = (await raw.prepare("SELECT id FROM food_logs WHERE user_id=7").first()).id;
  await assert.rejects(updateFoodEntry(db, id, { name: "Jogurt" }), /jiné aplikace/);
  await assert.rejects(deleteFoodEntry(db, id), /jiné aplikace/);
  assert.deepEqual(await queueFoodGoogle(db, id), { status: "skipped" });
  const copy = await copyFoodEntry(db, id, "2026-10-14");
  const copied = await raw.prepare("SELECT source,note FROM food_logs WHERE id=?").bind(copy.id).first();
  assert.equal(copied.source, "manual");
  assert.equal(JSON.parse(copied.note).app, undefined);
  const drink = (await listFluids(db, "2026-10-13"))[0];
  await deleteFluid(db, drink.id);
  assert.equal((await listFluids(db, "2026-10-13")).length, 1, "another app's drink stays");
});

test("the food screen names the app an entry came from", () => {
  const food = buildFood({ date: "2026-10-13", food: { entries: [{ id: 1, consumed_at: "2026-10-13T12:40:00", recipe_title: "Řecký jogurt", kcal: 205, source: "apple-health", note: JSON.stringify({ app: "Yazio" }) }, { id: 2, consumed_at: "2026-10-13T08:00:00", recipe_title: "Kaše", kcal: 300, source: "manual", note: "{}" }] },
    fluids: { entries: [{ id: 5, kind: "water", ml: 300, consumedAt: "2026-10-13T09:30", app: "Yazio" }] } });
  const entries = food.meals.flatMap(m => m.entries);
  assert.equal(entries.find(e => e.id === 1).app, "Yazio");
  assert.equal(entries.find(e => e.id === 2).app, undefined);
  assert.equal(food.water.drinks[0].app, "Yazio");
  assert.equal(mealTypeOfName("Oběd"), "lunch");
  assert.equal(mealTypeOfName("Kuře s rýží"), null);
});
