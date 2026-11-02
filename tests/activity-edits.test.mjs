import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import legacy from "../src/index.js";
import { KEEP_TYPE_SQL } from "../src/activity-type.js";
import { setActivityKcal, deleteActivity, deleteOptions } from "../src/activity-edits.js";
import { validateCoachActions, actionSummary } from "../src/coach-actions.js";

const ride = { source_family: "intervals", data_type: "activity", external_id: "i196923325", start_time: "2026-10-13T19:08:34", payload: { id: "i196923325", type: "VirtualRide", name: "Endurance", start_date_local: "2026-10-13T19:08:34", start_date: "2026-10-13T17:08:34Z", moving_time: 3453, elapsed_time: 3604, calories: 574 } };
const walk = { source_family: "google-wearables", data_type: "exercise", external_id: "g-walk", start_time: "2026-10-13T15:01:00Z", end_time: "2026-10-13T15:20:00Z", payload: { exercise: { exerciseType: "WALKING", displayName: "Walk", activeDuration: "1140s", metricsSummary: { caloriesKcal: 175, distanceMillimeters: 1600000 } } } };
const gym = { source_family: "intervals", data_type: "activity", external_id: "i196673917", start_time: "2026-10-13T12:00:00", payload: { id: "i196673917", type: "WeightTraining", name: "Gym", start_date_local: "2026-10-13T12:00:00", moving_time: 3600, elapsed_time: 3600 } };

function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = { DB: scopedDb(raw, 1), USER_ID: 1, CONNECTED_PROVIDERS: [], INTERVALS_API_KEY: "key" };
  const insert = row => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,?,?,?,?,?,?)")
    .run(row.source_family, row.data_type, row.external_id, row.start_time, row.end_time || null, JSON.stringify(row.payload));
  // The syncs' upsert, with what the source says now.
  const sync = row => raw.sqlite.prepare(`INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,?,?,?,?,?,?)
    ON CONFLICT(user_id,source_family,data_type,external_id) DO UPDATE SET ${KEEP_TYPE_SQL}`).run(row.source_family, row.data_type, row.external_id, row.start_time, row.end_time || null, JSON.stringify(row.payload));
  const stored = id => JSON.parse(raw.sqlite.prepare("SELECT payload_json FROM health_datapoints WHERE external_id=?").get(id)?.payload_json || "null");
  const role = id => ({ ...raw.sqlite.prepare("SELECT record_role, matched_activity_id FROM health_datapoints WHERE external_id=?").get(id) });
  const day = date => legacy.fetch(new Request("https://internal/analysis/daily?date=" + date), env, { waitUntil() {} }).then(r => r.json());
  return { raw, env, insert, sync, stored, role, day };
}

test("calories set in Aurin stay through the next sync and the source keeps its number", async () => {
  const { env, insert, sync, stored } = setup();
  insert(ride); insert(walk);
  const result = await setActivityKcal(env, { id: "i196923325", kcal: 520 });
  assert.deepEqual(result, { status: "ok", id: "i196923325", kcal: 520, device: 574, edited: true });
  sync(ride);
  assert.equal(stored("i196923325").calories, 520);
  assert.equal(stored("i196923325").aurinKcalDevice, 574);
  await setActivityKcal(env, { id: "g-walk", kcal: 70 });
  sync(walk);
  assert.equal(stored("g-walk").exercise.metricsSummary.caloriesKcal, 70);
  // Back to the device's number.
  await setActivityKcal(env, { id: "g-walk", kcal: null });
  assert.equal(stored("g-walk").exercise.metricsSummary.caloriesKcal, 175);
  assert.equal(stored("g-walk").aurinKcal, undefined);
  await assert.rejects(setActivityKcal(env, { id: "g-walk", kcal: 99999 }), /6000/);
});

test("a walk with calories set by hand is not flagged by the calorie check", async () => {
  const { env, insert, day } = setup();
  insert(walk);
  await setActivityKcal(env, { id: "g-walk", kcal: 70 });
  const completed = (await day("2026-10-13")).training.completed;
  assert.equal(completed[0].calories, 70);
  assert.equal(completed[0].energyCheck, undefined);
});

test("deleting: an Intervals.icu activity is hidden here or deleted there on request; the matching leaves it hidden", async () => {
  const { env, insert, role, day, raw } = setup();
  insert(gym); insert(ride);
  assert.deepEqual(await deleteOptions(env, "i196673917"), { kind: "intervals" });
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([init.method, url]); return new Response("{}", { status: 200 }); };
  assert.deepEqual(await deleteActivity(env, { id: "i196673917" }, { fetchImpl }), { status: "ok", id: "i196673917", removed: ["aurin"] });
  assert.deepEqual(calls, []);
  assert.deepEqual(role("i196673917"), { record_role: "duplicate", matched_activity_id: "deleted" });
  await legacy.fetch(new Request("https://internal/sync/match", { method: "POST" }), env, { waitUntil() {} });
  assert.deepEqual(role("i196673917"), { record_role: "duplicate", matched_activity_id: "deleted" });
  assert.deepEqual((await day("2026-10-13")).training.completed.map(a => a.id), ["i196923325"]);
  // Everywhere: Intervals.icu deletes it, the row goes.
  await deleteActivity(env, { id: "i196923325", everywhere: true }, { fetchImpl });
  assert.deepEqual(calls, [["DELETE", "https://intervals.icu/api/v1/activity/i196923325"]]);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM health_datapoints WHERE external_id='i196923325'").get().n, 0);
});

test("the app's own copy in Intervals.icu is deleted there too; a watch's record only here", async () => {
  const { env, insert, role } = setup();
  insert({ ...gym, payload: { ...gym.payload, external_id: "loadwise:1:local-abc" } });
  insert(walk);
  assert.deepEqual(await deleteOptions(env, "i196673917"), { kind: "app" });
  assert.deepEqual(await deleteOptions(env, "g-walk"), { kind: "watch", source: "google" });
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(init.method); return new Response("", { status: 404 }); };
  assert.deepEqual((await deleteActivity(env, { id: "i196673917" }, { fetchImpl })).removed, ["aurin", "intervals"]);
  assert.deepEqual((await deleteActivity(env, { id: "g-walk", everywhere: true }, { fetchImpl })).removed, ["aurin"]);
  assert.deepEqual(calls, ["DELETE"]);
  assert.deepEqual(role("g-walk"), { record_role: "duplicate", matched_activity_id: "deleted" });
  await assert.rejects(deleteActivity(env, { id: "nothing" }, { fetchImpl }), /nebyla nalezena|wasn't found/);
});

test("a Strava activity Intervals.icu shows as a stub is only hidden: its API refuses to delete it (HTTP 422)", async () => {
  const { env, insert, role } = setup();
  const stub = { source_family: "intervals", data_type: "activity", external_id: "20698107994", start_time: "2026-10-23T08:22:02", payload: { id: "20698107994", start_date_local: "2026-10-23T08:22:02", source: "STRAVA", _note: "STRAVA activities are not available via the API" } };
  insert(stub);
  insert({ ...stub, external_id: "20676456041", payload: { id: "20676456041", start_date_local: "2026-10-21T16:23:07", _note: "STRAVA activities are not available via the API" } });
  assert.deepEqual(await deleteOptions(env, "20698107994"), { kind: "watch", source: "strava" });
  assert.deepEqual(await deleteOptions(env, "20676456041"), { kind: "watch", source: "strava" });
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push(init.method); return new Response("{}", { status: 422 }); };
  // An older app still offers "i v Intervals.icu": the stub is hidden here, nothing is sent.
  assert.deepEqual((await deleteActivity(env, { id: "20698107994", everywhere: true }, { fetchImpl })).removed, ["aurin"]);
  assert.deepEqual(calls, []);
  assert.deepEqual(role("20698107994"), { record_role: "duplicate", matched_activity_id: "deleted" });
});

test("the coach may set calories only of an activity it was shown", () => {
  const context = { week: [{ date: "2026-10-13", completed: [{ id: "i196923325", name: "Endurance", calories: 772 }] }] };
  const base = { eventId: "", sport: "", minutes: 0, status: "", statusUntil: "", fromExercise: "", toExercise: "", workoutId: "", reason: "Petr chce 574 kcal." };
  const [action] = validateCoachActions([{ ...base, type: "activity_kcal", activityId: "i196923325", kcal: 574, date: "2026-10-13" }], context, "2026-10-14", { userInitiated: true });
  assert.deepEqual(action, { type: "activity_kcal", activityId: "i196923325", kcal: 574, date: "2026-10-13", activityName: "Endurance", fromKcal: 772, reason: "Petr chce 574 kcal." });
  assert.match(actionSummary(action), /574 kcal/);
  assert.deepEqual(validateCoachActions([{ ...base, type: "activity_kcal", activityId: "other", kcal: 574, date: "2026-10-13" }], context, "2026-10-14"), []);
  assert.deepEqual(validateCoachActions([{ ...base, type: "activity_kcal", activityId: "i196923325", kcal: 0, date: "2026-10-13" }], context, "2026-10-14"), []);
});
