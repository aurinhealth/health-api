import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { planWeightSync, syncWeights } from "../src/weight-sync.js";
import { ageFrom, normalizeProfile, effectiveProfile } from "../src/energy-profile.js";

const both = { googleConnected: true, intervalsConnected: true };

test("a Google Health weight goes to Intervals.icu", () => {
  assert.deepEqual(planWeightSync({ google: { "2026-10-01": 80.4 } }, both), [{ target: "intervals", date: "2026-10-01", kg: 80.4 }]);
});

test("an Intervals.icu weight goes to Google Health, or to the app without Google", () => {
  assert.deepEqual(planWeightSync({ intervals: { "2026-10-01": 79.9 } }, both), [{ target: "google", date: "2026-10-01", kg: 79.9 }]);
  assert.deepEqual(planWeightSync({ intervals: { "2026-10-01": 79.9 } }, { googleConnected: false, intervalsConnected: true }), [{ target: "app", date: "2026-10-01", kg: 79.9 }]);
});

test("a manual app weight goes to Intervals.icu (Google got it when it was saved)", () => {
  assert.deepEqual(planWeightSync({ manual: { "2026-10-01": 81 } }, both), [{ target: "intervals", date: "2026-10-01", kg: 81 }]);
});

test("Google Health wins a same-day conflict; equal values and earlier writes do nothing", () => {
  assert.deepEqual(planWeightSync({ google: { d: 80 }, intervals: { d: 82 } }, both), [{ target: "intervals", date: "d", kg: 80 }]);
  assert.deepEqual(planWeightSync({ google: { d: 80 }, intervals: { d: 80.02 } }, both), []);
  // Written to Google an hour ago, Google sync not back yet: no second write.
  assert.deepEqual(planWeightSync({ intervals: { d: 79.9 }, written: { "google:d": 79.9 } }, both), []);
});

test("one sync pass writes, remembers, and does not repeat", async () => {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, UNIQUE (user_id, source_family, data_type, external_id))`);
  db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric) VALUES (7, 'google-sources', 'weight', 'g1', '2026-10-01T06:10:00Z', 80.4)").run();
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(`${opts.method || "GET"} ${url}`);
    if (url.includes("/wellness?")) return Response.json([{ id: "2026-09-30", weight: 80.9 }]);
    return Response.json({});
  };
  const env = { DB: db, USER_ID: 7, INTERVALS_API_KEY: "k", CONNECTED_PROVIDERS: ["google", "intervals"] };
  const deps = { googleToken: async () => "t", fetchImpl, now: Date.parse("2026-10-02T10:00:00Z") };
  const first = await syncWeights(env, deps);
  assert.deepEqual(first.written.map(a => `${a.target} ${a.date}`).sort(), ["google 2026-09-30", "intervals 2026-10-01"]);
  assert.ok(calls.includes("PUT https://intervals.icu/api/v1/athlete/0/wellness/2026-10-01"));
  assert.ok(calls.includes("POST https://health.googleapis.com/v4/users/me/dataTypes/weight/dataPoints"));
  calls.length = 0;
  assert.deepEqual((await syncWeights(env, deps)).written, []);
  assert.deepEqual(calls.filter(c => !c.startsWith("GET")), []);
});

test("age comes from the birth date and keeps itself current", () => {
  assert.equal(ageFrom("1990-10-03", Date.parse("2026-10-02T12:00:00Z")), 35);
  assert.equal(ageFrom("1990-10-02", Date.parse("2026-10-02T12:00:00Z")), 36);
  assert.equal(ageFrom("2015-01-01"), null);
  assert.equal(normalizeProfile({ birthDate: "1990-10-02", age: 20 }).birthDate, "1990-10-02");
  // A stored age goes stale; the birth date wins.
  assert.equal(effectiveProfile({ birthDate: "1990-10-02", age: 20 }, null).age, ageFrom("1990-10-02"));
});
