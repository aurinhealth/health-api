import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { importGoogleFood, googleMeal, googleLocal } from "../src/google-food.js";
import { saveAppleFood } from "../src/apple-food.js";
import { listFluids } from "../src/fluids.js";
import { deleteFoodEntry } from "../src/food-entry-management.js";
import { queueFoodGoogle } from "../src/food-google-sync.js";
import { buildFood } from "../src/app-food.js";

const diary = raw => raw.sqlite.exec("CREATE TABLE IF NOT EXISTS food_logs (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL NOT NULL DEFAULT (1), kcal REAL NOT NULL DEFAULT (0), protein_g REAL NOT NULL DEFAULT (0), carbs_g REAL NOT NULL DEFAULT (0), fat_g REAL NOT NULL DEFAULT (0), fiber_g REAL NOT NULL DEFAULT (0), source TEXT NOT NULL DEFAULT ('manual'), note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), status TEXT)");
const today = new Date().toISOString().slice(0, 10);
const at = clock => today + "T" + clock + ":00Z";
const meal = (id, clock, name, extra = {}) => ({
  name: "users/1/dataTypes/nutrition-log/dataPoints/" + id,
  dataSource: { application: { packageName: "com.yazio.android" } },
  nutritionLog: { interval: { startTime: at(clock), startUtcOffset: "0s" }, foodDisplayName: name, mealType: "LUNCH", energy: { kcal: 320 },
    totalCarbohydrate: { grams: 40 }, totalFat: { grams: 9 }, nutrients: [{ nutrient: "PROTEIN", quantity: { grams: 18 } }, { nutrient: "SODIUM", quantity: { grams: 0.4 } }] },
  ...extra
});
const water = (id, clock, ml) => ({ name: "users/1/dataTypes/hydration-log/dataPoints/" + id, dataSource: {}, hydrationLog: { interval: { startTime: at(clock) }, amountConsumed: { milliliters: ml } } });
function google(pages) {
  const calls = [];
  const fetcher = async url => { calls.push(url); const type = /dataTypes\/([^/]+)/.exec(url)[1]; const body = pages[type];
    return body === 404 ? new Response("{}", { status: 404 }) : Response.json({ dataPoints: body || [] }); };
  return { fetcher, calls };
}

test("a Google time keeps the day and clock it was logged at", () => {
  assert.deepEqual(googleLocal({ startTime: "2026-10-12T22:30:00Z", startUtcOffset: "7200s" }), { date: "2026-10-13", time: "00:30" });
  const m = googleMeal(meal("a", "12:00", "Kuře s rýží"));
  assert.equal(m.app, "Yazio");
  assert.equal(m.salt, 1);
  assert.equal(m.protein, 18);
});

test("food and water from other apps in Google Health come into the diary, Aurin's own entries do not", async () => {
  const raw = createD1(), db = scopedDb(raw, 7);
  diary(raw);
  raw.sqlite.exec("CREATE TABLE food_google_exports (user_id INTEGER NOT NULL, entry_id INTEGER NOT NULL, desired_json TEXT, revision INTEGER NOT NULL DEFAULT 1, remote_name TEXT, operation_name TEXT, operation_revision INTEGER, operation_kind TEXT, status TEXT NOT NULL DEFAULT 'queued', message TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,entry_id))");
  raw.sqlite.exec("INSERT INTO food_google_exports(user_id,entry_id,remote_name) VALUES (7,99,'users/1/dataTypes/nutrition-log/dataPoints/own')");
  const env = { DB: db, USER_ID: 7, GOOGLE_CLIENT_ID: "aurin-client" };
  const { fetcher } = google({
    "nutrition-log": [meal("a", "12:00", "Kuře s rýží"), meal("own", "13:00", "Aurin oběd"),
      meal("web", "14:00", "Aurin svačina", { dataSource: { application: { googleWebClientId: "aurin-client" } } })],
    "hydration-log": [water("w1", "09:00", 500)]
  });
  const result = await importGoogleFood(env, { token: "t", fetcher });
  assert.equal(result.status, "ok");
  const rows = (await raw.prepare("SELECT id,recipe_title,source,note FROM food_logs WHERE user_id=7").all()).results;
  assert.deepEqual(rows.map(r => [r.recipe_title, r.source]), [["Kuře s rýží", "google-health"]]);
  assert.equal(JSON.parse(rows[0].note).mealType, "lunch");
  assert.deepEqual((await listFluids(db, today)).map(d => [d.ml, d.app]), [[500, "Google Health"]]);

  // Shown with the app's name; never sent back to Google.
  const food = buildFood({ date: today, food: { entries: [{ id: rows[0].id, recipe_title: "Kuře s rýží", kcal: 320, source: "google-health", note: rows[0].note, consumed_at: today + "T12:00:00" }] } });
  assert.equal(food.meals.flatMap(m => m.entries)[0].app, "Yazio");
  assert.deepEqual(await queueFoodGoogle(db, rows[0].id), { status: "skipped" });

  // Deleted in Aurin: gone and not brought back by the next import.
  await deleteFoodEntry(db, rows[0].id);
  await importGoogleFood(env, { token: "t", fetcher });
  assert.equal((await raw.prepare("SELECT COUNT(*) AS n FROM food_logs WHERE user_id=7").first()).n, 0);
});

test("without hydration in Google Health the drinks stay as they are; without the permission nothing is read", async () => {
  const raw = createD1(), db = scopedDb(raw, 7);
  diary(raw);
  await saveAppleFood(raw, 7, { from: today, to: today, drinks: [{ id: "g:old", date: today, ml: 250 }] }, { source: "google-health" });
  const { fetcher } = google({ "nutrition-log": [], "hydration-log": 404 });
  await importGoogleFood({ DB: db, USER_ID: 7 }, { token: "t", fetcher });
  assert.equal((await listFluids(db, today)).length, 1);

  const none = google({});
  assert.deepEqual(await importGoogleFood({ DB: db, USER_ID: 7, GOOGLE_SCOPES: ["x"] }, { token: "t", fetcher: none.fetcher }), { status: "skipped" });
  assert.equal(none.calls.length, 0);
});
