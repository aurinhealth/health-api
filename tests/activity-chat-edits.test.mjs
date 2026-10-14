import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import legacy from "../src/index.js";
import { withTimeZone } from "../src/user-time.js";
import { hideActivity, mergeActivities, setActivityTime, undoActivityChange } from "../src/activity-chat-edits.js";
import { validateCoachActions, actionSummary } from "../src/coach-actions.js";

// A morning run the watch split at a traffic light, in Prague (UTC+2).
const part = (id, start, end, seconds, mm, kcal) => ({ source_family: "google-wearables", data_type: "exercise", external_id: id, start_time: start, end_time: end,
  payload: { exercise: { exerciseType: "RUNNING", displayName: "Běh", activeDuration: seconds + "s", metricsSummary: { caloriesKcal: kcal, distanceMillimeters: mm } } } });
const first = part("g-run-1", "2026-10-14T05:02:00Z", "2026-10-14T05:26:00Z", 1440, 4100000, 300);
const second = part("g-run-2", "2026-10-14T05:31:00Z", "2026-10-14T05:58:00Z", 1620, 5600000, 400);
const evening = part("g-run-3", "2026-10-14T16:00:00Z", "2026-10-14T16:30:00Z", 1800, 5000000, 350);
const typed = { source_family: "local", data_type: "activity", external_id: "activity:local-gym", start_time: "2026-10-14T17:30:00",
  payload: { type: "WeightTraining", name: "Posilovna", start_date_local: "2026-10-14T17:30:00", moving_time: 3600 } };

function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = { DB: scopedDb(raw, 1), USER_ID: 1, CONNECTED_PROVIDERS: [] };
  const insert = row => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json,record_role) VALUES(1,?,?,?,?,?,?,'primary')")
    .run(row.source_family, row.data_type, row.external_id, row.start_time, row.end_time || null, JSON.stringify(row.payload));
  const day = date => withTimeZone("Europe/Prague", () => legacy.fetch(new Request("https://internal/analysis/daily?date=" + date), env, { waitUntil() {} }).then(r => r.json()));
  const row = id => raw.sqlite.prepare("SELECT * FROM health_datapoints WHERE external_id=?").get(id);
  return { env, insert, day, row };
}
const prague = fn => withTimeZone("Europe/Prague", fn);

test("two parts of one run become one activity in Aurin, and Vrátit brings the parts back", async () => {
  const { env, insert, day, row } = setup();
  insert(first); insert(second);
  const result = await prague(() => mergeActivities(env, ["g-run-2", "g-run-1"]));
  assert.equal(result.merged.start, "2026-10-14T07:02:00");
  assert.equal(result.merged.end, "2026-10-14T07:58:00");
  assert.equal(result.merged.distanceM, 9700);
  const merged = JSON.parse(row(result.id).payload_json);
  assert.equal(merged.moving_time, 3060);
  assert.equal(merged.calories, 700);
  assert.equal(merged.type, "Run");
  let completed = (await day("2026-10-14")).training.completed;
  assert.deepEqual(completed.map(a => a.id), [result.id]);
  await undoActivityChange(env, result.undo);
  completed = (await day("2026-10-14")).training.completed;
  assert.deepEqual(completed.map(a => a.id).sort(), ["g-run-1", "g-run-2"]);
  assert.equal(row(result.id), undefined);
  await assert.rejects(undoActivityChange(env, result.undo), /vrátit/);
});

test("a morning and an evening run stay two sessions", async () => {
  const { env, insert } = setup();
  insert(first); insert(evening);
  await assert.rejects(prague(() => mergeActivities(env, ["g-run-1", "g-run-3"])), /90 minut/);
});

test("deleting from the chat hides the watch's record and can be undone", async () => {
  const { env, insert, day, row } = setup();
  insert(evening);
  const result = await hideActivity(env, "g-run-3");
  assert.equal(row("g-run-3").matched_activity_id, "deleted");
  assert.equal((await day("2026-10-14")).training.completed.length, 0);
  await undoActivityChange(env, result.undo);
  assert.equal(row("g-run-3").record_role, "primary");
  assert.equal(row("g-run-3").matched_activity_id, null);
});

test("the time moves only for an activity typed into Aurin", async () => {
  const { env, insert, row } = setup();
  insert(typed); insert(evening);
  const result = await prague(() => setActivityTime(env, "activity:local-gym", "18:00"));
  assert.deepEqual([result.from, result.to], ["17:30", "18:00"]);
  assert.equal(row("activity:local-gym").start_time, "2026-10-14T18:00:00");
  assert.equal(JSON.parse(row("activity:local-gym").payload_json).start_date_local, "2026-10-14T18:00:00");
  await undoActivityChange(env, result.undo);
  assert.equal(row("activity:local-gym").start_time, "2026-10-14T17:30:00");
  await assert.rejects(prague(() => setActivityTime(env, "g-run-3", "18:00")), /hodinky/);
});

test("the coach may propose these only for activities it was shown", () => {
  const context = { week: [{ date: "2026-10-14", completed: [{ id: "g-run-1", name: "Běh", start: "07:02", source: "google-wearables" }, { id: "g-run-2", name: "Běh", start: "07:31", source: "google-wearables" }, { id: "activity:local-gym", name: "Posilovna", start: "17:30", source: "local" }] }] };
  const base = { eventId: "", date: "2026-10-14", sport: "", minutes: 0, status: "", statusUntil: "", fromExercise: "", toExercise: "", workoutId: "", kind: "", kcal: 0, reason: "Rozdělené hodinkami", otherActivityId: "", time: "" };
  const [merge] = validateCoachActions([{ ...base, type: "activity_merge", activityId: "g-run-1", otherActivityId: "g-run-2" }], context, "2026-10-14");
  assert.equal(merge.otherName, "Běh 07:31");
  assert.match(actionSummary(merge), /Sloučit Běh 07:02 \+ Běh 07:31/);
  assert.deepEqual(validateCoachActions([{ ...base, type: "activity_merge", activityId: "g-run-1", otherActivityId: "nope" }], context, "2026-10-14"), []);
  assert.deepEqual(validateCoachActions([{ ...base, type: "activity_time", activityId: "g-run-1", time: "08:00" }], context, "2026-10-14"), []);
  const [time] = validateCoachActions([{ ...base, type: "activity_time", activityId: "activity:local-gym", time: "18:00" }], context, "2026-10-14");
  assert.equal(time.fromTime, "17:30");
  assert.equal(validateCoachActions([{ ...base, type: "activity_delete", activityId: "g-run-2" }], context, "2026-10-14")[0].type, "activity_delete");
});
