import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { saveWeekPlan } from "../src/week-planner.js";
import { todayPlace } from "../src/plan-context.js";
import { localToday } from "../src/user-time.js";

// Open-Meteo (no WeatherKit key): the week and the day's hours, two reads.
async function withPlace(fetchImpl, run) {
  const db = scopedDb(createD1(), 1);
  await saveWeekPlan(db, { days: [[], [], [], [], [], [], []], location: { name: "Praha", latitude: 50.08, longitude: 14.42, source: "search" } });
  const plain = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try { return await run({ DB: db, USER_ID: 1 }); } finally { globalThis.fetch = plain; }
}

test("Today does not wait for a weather service that does not answer", async () => {
  const kept = [];
  const started = Date.now();
  const place = await withPlace(() => new Promise(() => {}), env => todayPlace(env, { waitUntil: p => kept.push(p) }, localToday(), { waitMs: 50 }));
  assert.ok(Date.now() - started < 1000);
  assert.equal(place.location.name, "Praha");
  assert.equal(place.forecast, null);
  // The reads go on after the answer, so a late forecast still fills the cache.
  assert.equal(kept.length, 1);
});

test("the weather reads go side by side, not one after another", async () => {
  let open = 0, most = 0;
  const date = localToday();
  const fetchImpl = async url => {
    open++; most = Math.max(most, open);
    await new Promise(resolve => setTimeout(resolve, 30));
    open--;
    const hourly = String(url).includes("hourly=");
    const body = hourly
      ? { hourly: { time: [date + "T08:00"], temperature_2m: [7], weather_code: [3] } }
      : { daily: { time: [date], weather_code: [3], temperature_2m_max: [9], temperature_2m_min: [2], precipitation_probability_max: [10], precipitation_sum: [0], wind_speed_10m_max: [12] } };
    return new Response(JSON.stringify(body));
  };
  const place = await withPlace(fetchImpl, env => todayPlace(env, null, date));
  assert.equal(most, 2);
  assert.equal(place.forecast.max, 9);
  assert.deepEqual(place.forecast.hours, [{ hour: 8, temp: 7, code: 3 }]);
});
