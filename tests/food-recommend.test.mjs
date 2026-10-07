import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import gateway from "../src/strength-gateway.js";

// The week view's meal suggestions (/food/recommend in food-recommend.js) fit the
// personal target; a missing variable there once broke the whole week view.
function env(profile, weight) {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT);
    CREATE TABLE food_logs (id INTEGER PRIMARY KEY, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, recipe_title TEXT, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, fiber_g REAL, note TEXT, status TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  if (weight) db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (7, 'manual', 'weight', 'w', '2026-09-01T07:00:00Z', ?, '{}')").run(weight);
  if (profile) db.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify(profile));
  db.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,start_time,payload_json) VALUES(7,'intervals','activity',?,'{}')").run(new Date().toISOString());
  return { DB: db, USER_ID: 7, CONNECTED_PROVIDERS: ["google", "intervals"] };
}
const recommend = async e => (await gateway.fetch(new Request("https://internal/food/recommend?date=2099-01-05"), e, { waitUntil() {} })).json();

test("meal suggestions use the personal calorie target", async () => {
  const r = await recommend(env({ sex: "male", age: 30, height: 180, activity: "active", goal: "lose_0.5" }, 80));
  assert.equal(r.status, "ok");
  assert.equal(r.calorieTarget, Math.round(1780 * 1.45) - 550);
  assert.ok(Array.isArray(r.mealRecommendations));
});

test("without weight there are no meal suggestions, only what is missing", async () => {
  const r = await recommend(env({ sex: "male", age: 30, height: 180, activity: "active", goal: "lose_0.5" }));
  assert.equal(r.calorieTarget, null);
  assert.deepEqual(r.missing, ["weight"]);
});

test("a step tagged intensity=interval does not make an endurance ride an interval session", async () => {
  const e = env({ sex: "male", age: 30, height: 180, activity: "active", goal: "lose_0.5" }, 80);
  const planned = e.DB.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, payload_json) VALUES (7, 'intervals', 'planned-workout', ?, ?, ?)");
  planned.run("z2", "2099-01-05T09:00:00", JSON.stringify({ name: "Endurance Z2", type: "Ride", moving_time: 7200, description: "- 3x10m 70% intensity=interval" }));
  planned.run("ss", "2099-01-05T17:00:00", JSON.stringify({ name: "Sweet spot", type: "Ride", moving_time: 3600, description: "- 3x10m 90% intensity=interval" }));
  const r = await recommend(e);
  assert.equal(r.plannedEnduranceRideHours, 2);
  assert.equal(r.plannedRideCalories, 2 * 500 + 600);
});
