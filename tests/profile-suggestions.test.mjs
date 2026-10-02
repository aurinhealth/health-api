import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { activityFromSteps, averageDailySteps, googleHeightCm, refreshSuggestions, loadEffectiveProfile, averageRestingHeartRate, observedMaxHeartRate, activityMaxHeartRate } from "../src/profile-suggestions.js";
import { effectiveProfile } from "../src/energy-profile.js";
import legacy from "../src/index.js";

const NOW = Date.parse("2026-10-02T10:00:00Z");

function db() {
  const d = createD1();
  d.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT);
    CREATE TABLE food_logs (id INTEGER PRIMARY KEY, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  return d;
}
function steps(d, perDay, days = 14) {
  for (let i = 1; i <= days; i++) {
    const day = new Date(NOW - i * 86400000).toISOString().slice(0, 10);
    // Two samples a day; the second one a duplicate that must not count.
    d.sqlite.prepare("INSERT INTO health_datapoints (user_id, data_type, start_time, value_numeric, record_role) VALUES (7, 'steps', ?, ?, 'primary'), (7, 'steps', ?, ?, 'primary'), (7, 'steps', ?, ?, 'duplicate')")
      .run(day + "T08:00:00Z", perDay / 2, day + "T18:00:00Z", perDay / 2, day + "T18:00:00Z", 99999);
  }
}

test("average steps map to everyday activity", () => {
  assert.equal(activityFromSteps(null), null);
  assert.equal(activityFromSteps(4000), "sedentary");
  assert.equal(activityFromSteps(6400), "light");
  assert.equal(activityFromSteps(9000), "active");
  assert.equal(activityFromSteps(14000), "heavy");
});

test("average steps skip duplicates and days without the watch, and need a week", async () => {
  const d = db();
  steps(d, 8000, 10);
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, data_type, start_time, value_numeric, record_role) VALUES (7, 'steps', '2026-09-20T09:00:00Z', 200, 'primary')").run();
  assert.equal(await averageDailySteps(d, 7, NOW), 8000);
  const few = db(); steps(few, 8000, 5);
  assert.equal(await averageDailySteps(few, 7, NOW), null);
});

test("the latest Google Health height, in cm", async () => {
  const fake = body => async () => new Response(JSON.stringify(body), { status: 200 });
  assert.equal(await googleHeightCm("t", fake({ dataPoints: [
    { height: { heightMillimeters: "1800", sampleTime: { physicalTime: "2024-01-01T00:00:00Z" } } },
    { height: { heightMillimeters: "1824", sampleTime: { physicalTime: "2026-05-01T00:00:00Z" } } }
  ] })), 182);
  assert.equal(await googleHeightCm("t", fake({})), null);
  assert.equal(await googleHeightCm("t", async () => new Response("{}", { status: 403 })), null);
});

test("suggestions are stored once a day and never override saved values", async () => {
  const d = db();
  steps(d, 6400);
  let calls = 0;
  const env = { DB: d, USER_ID: 7, GOOGLE_REFRESH_TOKEN: "r" };
  const deps = { googleToken: async () => "t", fetchImpl: async () => { calls++; return new Response(JSON.stringify({ dataPoints: [{ height: { heightMillimeters: "1650", sampleTime: { physicalTime: "2026-01-01T00:00:00Z" } } }] })); }, now: NOW };
  const s = await refreshSuggestions(env, deps);
  assert.deepEqual([s.height, s.activity, s.averageSteps], [165, "light", 6400]);
  await refreshSuggestions(env, { ...deps, now: NOW + 3600000 });
  assert.equal(calls, 1);
  assert.deepEqual(effectiveProfile({ height: 170, activity: "" }, s), { height: 170, activity: "light" });
  d.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify({ sex: "female", age: 30, goal: "maintain" }));
  assert.deepEqual(await loadEffectiveProfile(d, 7), { sex: "female", age: 30, goal: "maintain", height: 165, activity: "light" });
});

test("with height and activity from Google, only sex, age and goal are asked", async () => {
  const d = db();
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (7, 'google-sources', 'weight', 'w', '2026-09-01T07:00:00Z', 60, '{}')").run();
  d.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 2, ?)").run(JSON.stringify({ height: 165, activity: "light" }));
  const env = { DB: d, USER_ID: 7, CONNECTED_PROVIDERS: ["google"] };
  const daily = async () => (await legacy.fetch(new Request("https://internal/analysis/daily?date=2099-01-05"), env, { waitUntil() {} })).json();
  assert.deepEqual((await daily()).nutrition.missing, ["sex", "age", "goal"]);
  d.sqlite.prepare("INSERT INTO dashboard_profile VALUES (7, 1, ?)").run(JSON.stringify({ sex: "female", age: 30, goal: "maintain" }));
  assert.equal((await daily()).nutrition.calorieTarget, Math.round(1320.25 * 1.3));
});

test("resting heart rate is the 30-day Google Health average", async () => {
  const d = db();
  const add = (daysAgo, bpm, json = false) => d.sqlite.prepare("INSERT INTO health_datapoints (user_id, data_type, sample_time, value_numeric, payload_json) VALUES (7, 'daily-resting-heart-rate', ?, ?, ?)")
    .run(new Date(NOW - daysAgo * 86400000).toISOString(), json ? null : bpm, json ? JSON.stringify({ dailyRestingHeartRate: { beatsPerMinute: bpm } }) : "{}");
  add(1, 50); add(2, 52); add(3, 54, true); add(40, 90);
  assert.equal(await averageRestingHeartRate(d, 7, NOW), 52);
});

test("maximum heart rate is the highest in Intervals and Google activities over six months", async () => {
  const d = db();
  const add = (source, type, daysAgo, payload) => d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, start_time, payload_json) VALUES (7, ?, ?, ?, ?)")
    .run(source, type, new Date(NOW - daysAgo * 86400000).toISOString(), JSON.stringify(payload));
  add("intervals", "activity", 10, { max_heartrate: 183 });
  add("intervals", "activity", 20, { max_heartrate: 176 });
  add("google-wearables", "exercise", 30, { exercise: { metricsSummary: { maxHeartRateBeatsPerMinute: 187 } } });
  add("intervals", "activity", 300, { max_heartrate: 199 });
  assert.equal(await observedMaxHeartRate(d, 7, NOW), 187);
  // A lone spike far above every other activity is a sensor artefact.
  add("intervals", "activity", 5, { max_heartrate: 214 });
  assert.equal(await observedMaxHeartRate(d, 7, NOW), 187);
  assert.equal(activityMaxHeartRate({ average_heartrate: 150 }), null);
});
