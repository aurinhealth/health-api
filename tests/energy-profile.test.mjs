import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { energyBaseline, normalizeProfile, restingMetabolicRate, OWNER_CALIBRATION } from "../src/energy-profile.js";
import legacy from "../src/index.js";

const woman = { sex: "female", age: 30, height: 165, activity: "sedentary", goal: "lose_0.5" };

test("resting metabolism follows Mifflin-St Jeor", () => {
  assert.equal(restingMetabolicRate({ sex: "male", age: 30, height: 180 }, 80), 1780);
  assert.equal(restingMetabolicRate({ sex: "female", age: 30, height: 165 }, 60), 1320.25);
});

test("the baseline comes from sex, age, height, weight and everyday activity", () => {
  const b = energyBaseline(woman, 60);
  assert.equal(b.ready, true);
  assert.equal(b.source, "profile");
  assert.equal(b.bmr, 1320);
  assert.equal(b.baselineRestTDEE, Math.round(1320.25 * 1.2));
  assert.equal(b.deficit, 550);
  assert.equal(b.sportDaily, 0);
  // Never below resting metabolism.
  assert.equal(b.floor, 1320);
  const active = energyBaseline({ ...woman, activity: "heavy", goal: "maintain" }, 60);
  assert.equal(active.baselineRestTDEE, Math.round(1320.25 * 1.6));
  assert.equal(active.deficit, 0);
  assert.equal(energyBaseline({ ...woman, goal: "lose_0.25" }, 60).deficit, 275);
  assert.equal(energyBaseline({ ...woman, goal: "lose_0.75" }, 60).deficit, 825);
  assert.equal(energyBaseline({ ...woman, goal: "lose_1" }, 60).deficit, 1100);
});

test("weight is required for a calorie target, for everyone", () => {
  assert.deepEqual(energyBaseline(woman, null).missing, ["weight"]);
  assert.equal(energyBaseline(woman, null).ready, false);
  assert.equal(energyBaseline(woman, null, { isOwner: true }).ready, false);
});

test("an incomplete profile lists what is missing; the owner keeps the calibration", () => {
  const b = energyBaseline({ sex: "male" }, 85);
  assert.equal(b.ready, false);
  assert.deepEqual(b.missing, ["age", "height", "activity", "goal"]);
  const owner = energyBaseline({}, 85, { isOwner: true });
  assert.equal(owner.ready, true);
  assert.equal(owner.source, "owner-calibration");
  assert.equal(owner.baselineRestTDEE, OWNER_CALIBRATION.baselineRestTDEE);
  assert.equal(owner.deficit, 550);
  assert.equal(energyBaseline({ goal: "maintain" }, 85, { isOwner: true }).deficit, 0);
});

test("without a connected source, weekly sport is part of the estimate", () => {
  assert.deepEqual(energyBaseline(woman, 60, { activityTracked: false }).missing, ["sportHours"]);
  const b = energyBaseline({ ...woman, sportHours: "3-6" }, 60, { activityTracked: false });
  assert.equal(b.sportDaily, Math.round(4.5 * 60 * 6 / 7));
  // With a connected source, tracked activities count instead.
  assert.equal(energyBaseline({ ...woman, sportHours: "3-6" }, 60).sportDaily, 0);
});

test("the profile endpoint keeps only known values", () => {
  assert.deepEqual(normalizeProfile({ sex: "x", age: 12, height: 180, activity: "couch", sportHours: "3-6", goal: "lose_0.5", targetWeight: "72.5", extra: 1 }),
    { sex: "", birthDate: "", age: null, height: 180, hrmax: null, rhr: null, activity: "", sportHours: "3-6", goal: "lose_0.5", targetWeight: 72.5 });
});

async function dailyFor({ profile, weight, isOwner = false, providers = ["google", "intervals"] }) {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, payload_json TEXT, record_role TEXT);
    CREATE TABLE food_logs (id INTEGER PRIMARY KEY, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  if (weight) db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (7, 'manual', 'weight', 'w1', '2026-09-01T07:00:00Z', ?, '{}')").run(weight);
  if (profile) db.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify(profile));
  const env = { DB: db, USER_ID: 7, USER_IS_OWNER: isOwner, CONNECTED_PROVIDERS: providers };
  const response = await legacy.fetch(new Request("https://internal/analysis/daily?date=2099-01-05"), env, { waitUntil() {} });
  return response.json();
}

test("the daily analysis uses the personal baseline on a rest day", async () => {
  const daily = await dailyFor({ profile: { sex: "male", age: 30, height: 180, activity: "active", goal: "lose_0.5" }, weight: 80 });
  const rest = Math.round(1780 * 1.45);
  assert.equal(daily.nutrition.calorieBreakdown.baselineRestTDEE, rest);
  assert.equal(daily.nutrition.calorieTarget, rest - 550);
  assert.equal(daily.nutrition.macros.protein_g, 160);
  assert.deepEqual(daily.nutrition.missing, []);
  // A deficit never takes the target below resting metabolism.
  const sedentary = await dailyFor({ profile: { sex: "male", age: 30, height: 180, activity: "sedentary", goal: "lose_0.5" }, weight: 80 });
  assert.equal(sedentary.nutrition.calorieTarget, 1780);
});

test("without weight the daily analysis has no target and says why", async () => {
  const daily = await dailyFor({ profile: { sex: "male", age: 30, height: 180, activity: "light", goal: "maintain" } });
  assert.equal(daily.status, "ok");
  assert.equal(daily.nutrition.calorieTarget, null);
  assert.equal(daily.nutrition.macros, null);
  assert.deepEqual(daily.nutrition.missing, ["weight"]);
  assert.match(daily.nutrition.reason, /váha/);
});

test("the owner without a complete profile keeps the calibrated 2000 kcal rest day", async () => {
  const daily = await dailyFor({ weight: 85, isOwner: true });
  assert.equal(daily.nutrition.calorieTarget, 2000);
  assert.equal(daily.nutrition.energySource, "owner-calibration");
});

test("the dashboard collects activity, sport, goal and target weight", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  for (const id of ["profileActivity", "profileSportHours", "profileGoal", "profileTargetWeight"]) assert.ok(client.includes(`['${id}',`), id);
  assert.match(client, /Kalorický cíl zatím nepočítám/);
  // Saving the base fields must not drop the new ones.
  assert.match(client, /JSON\.stringify\(\{\.\.\.savedProfile\(\),sex:\$\('profileSex'\)\.value,/);
});

test("without Google Health a manual weight is stored here and feeds the target", async () => {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT, UNIQUE (user_id, source_family, data_type, external_id));
    CREATE TABLE food_logs (id INTEGER PRIMARY KEY, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  db.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify({ sex: "female", age: 30, height: 165, activity: "light", sportHours: "3-6", goal: "lose_0.25" }));
  const env = { DB: db, USER_ID: 7, CONNECTED_PROVIDERS: [] };
  const saved = await legacy.fetch(new Request("https://internal/app/api/weight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kg: 60 }) }), env, { waitUntil() {} });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).google, null);
  const daily = await (await legacy.fetch(new Request("https://internal/analysis/daily?date=2099-01-05"), env, { waitUntil() {} })).json();
  // Rest baseline × light activity, plus 4.5 h of sport a week, minus 0.25 kg a week.
  const rest = Math.round(1320.25 * 1.3), sport = Math.round(4.5 * 60 * 6 / 7);
  assert.equal(daily.nutrition.calorieTarget, rest + sport - 275);
});

test("the dashboard works without connections", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /status:"onboarding"/);
  assert.match(entry, /source:"none",connected:false/);
  assert.match(client, /id="onboardingSkip"/);
  assert.match(client, /if\(!me\.missingProviders\?\.length\|\|onboardingSkipped\(\)\)load\(\)/);
});
