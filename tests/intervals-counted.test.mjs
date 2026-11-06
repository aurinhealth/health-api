import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { watchOnlyActivities } from "../src/own-fitness.js";
import { sentIntervalsIds, countedStatement, countedByIntervals, ensureSyncTables, saveSyncPrefs } from "../src/sync-destinations.js";
import { forwardWatchWorkouts } from "../src/watch-forward.js";

const watchRow = (id, start, end, extra = {}) => ({
  source_family: extra.family || "apple-health", external_id: id, start_time: start, end_time: end, matched_activity_id: extra.matched || null,
  payload_json: JSON.stringify({ exercise: { interval: { startTime: start, endTime: end }, exerciseType: extra.type || "RUNNING", activeDuration: "3000s", metricsSummary: { averageHeartRateBeatsPerMinute: 150 } } })
});
// An Intervals.icu activity of another day: the watch's workouts count only after its first one (training-load.js watchOnly).
const intervalsRow = { source_family: "intervals", external_id: "activity:i0", start_time: "2026-11-01T07:00:00", end_time: "2026-11-01T08:00:00", payload_json: JSON.stringify({ type: "Ride", start_date_local: "2026-11-01T07:00:00", moving_time: 3600, icu_training_load: 60 }) };

test("the watch's load is added only for workouts Intervals.icu does not count itself", () => {
  const rows = [
    intervalsRow,
    // Only the watch has it: added.
    watchRow("apple:ALONE", "2026-11-03T06:00:00Z", "2026-11-03T06:52:00Z"),
    // Aurin sent it there and Intervals.icu counts its load: not again.
    watchRow("apple:SENT", "2026-11-04T06:00:00Z", "2026-11-04T06:52:00Z"),
    // Paired with a Strava activity Intervals.icu shows only as a stub: it counts it.
    watchRow("apple:STRAVA", "2026-11-05T06:00:00Z", "2026-11-05T06:52:00Z", { matched: "intervals:activity:i9" }),
    // Wahoo's ride sent there as its FIT file.
    { source_family: "wahoo", external_id: "wahoo:77", start_time: "2026-11-05T17:00:00", end_time: "2026-11-05T18:00:00", payload_json: JSON.stringify({ type: "Ride", start_date: "2026-11-05T16:00:00Z", start_date_local: "2026-11-05T17:00:00", moving_time: 3600, elapsed_time: 3600 }) }
  ];
  assert.deepEqual(watchOnlyActivities(rows).map(a => a.date), ["2026-11-03", "2026-11-04", "2026-11-05"]);
  assert.deepEqual(watchOnlyActivities(rows, new Set(["apple:SENT", "wahoo:77"])).map(a => a.date), ["2026-11-03"]);
});

test("the import keeps whether Intervals.icu counts a forwarded workout, writing only on a change", async () => {
  const d = createD1();
  await ensureSyncTables(d);
  d.sqlite.prepare("INSERT INTO sync_sends (user_id, activity_key, destination, status, remote_id, payload_json) VALUES (7, 'apple:A', 'intervals', 'sent', 'i1', '{\"key\":\"apple:A\"}'), (7, 'wahoo:W', 'intervals', 'sent', 'i2', '{}'), (7, 'local:manual:3', 'intervals', 'sent', 'i3', '{}'), (7, 'apple:B', 'intervals', 'same', NULL, '{}'), (7, 'apple:C', 'intervals', 'error', NULL, '{}')").run();
  let sent = await sentIntervalsIds(d, 7);
  assert.deepEqual([...sent.keys()].sort(), ["i1", "i2", "i3"]);
  assert.deepEqual([...(await countedByIntervals(d, 7))], ["apple:B"]);
  // A manual activity Intervals.icu could not tell the load of: nothing to write.
  assert.equal(countedStatement(d, 7, sent.get("i1"), { id: "i1", icu_training_load: null }), null);
  // Aurin's own workouts keep counting as before.
  assert.equal(countedStatement(d, 7, sent.get("i3"), { id: "i3", icu_training_load: 40 }), null);
  await d.batch([countedStatement(d, 7, sent.get("i1"), { icu_training_load: 35 }), countedStatement(d, 7, sent.get("i2"), { icu_training_load: 80 })]);
  assert.deepEqual([...(await countedByIntervals(d, 7))].sort(), ["apple:A", "apple:B", "wahoo:W"]);
  assert.equal(JSON.parse(d.sqlite.prepare("SELECT payload_json FROM sync_sends WHERE activity_key = 'apple:A'").get().payload_json).key, "apple:A");
  sent = await sentIntervalsIds(d, 7);
  assert.equal(countedStatement(d, 7, sent.get("i1"), { icu_training_load: 36 }), null);
  // Its load gone there (the athlete cleared it): counted by Aurin again.
  await countedStatement(d, 7, sent.get("i1"), { icu_training_load: 0 }).run();
  assert.deepEqual([...(await countedByIntervals(d, 7))].sort(), ["apple:B", "wahoo:W"]);
});

test("no sync_sends table yet: nothing is counted there", async () => {
  assert.deepEqual([...(await countedByIntervals(createD1(), 7))], []);
});

test("two Apple Health records of one workout: one goes in a pass, the other is there", async () => {
  const d = createD1();
  d.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, matched_activity_id TEXT, UNIQUE (user_id, source_family, data_type, external_id))`);
  for (const [id, start] of [["apple:X1", "2026-10-16T06:00:00Z"], ["apple:X2", "2026-10-16T06:01:00Z"]])
    d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role) VALUES (7, 'apple-health', 'exercise', ?, ?, '2026-10-16T06:52:00Z', ?, 'primary')")
      .run(id, start, JSON.stringify({ exercise: { exerciseType: "RUNNING", activeDuration: "3000s" } }));
  const posts = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "POST") { posts.push(JSON.parse(init.body)); return Response.json({ id: "i" + posts.length }); }
    return Response.json([]);
  };
  await saveSyncPrefs(d, 7, "intervals", { health: ["workouts"] });
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "Bearer t", CONNECTED_PROVIDERS: ["intervals"] };
  const result = await forwardWatchWorkouts(env, { now: Date.parse("2026-10-16T12:00:00Z"), fetchImpl });
  assert.deepEqual(result.sent, [{ key: "apple:X1", status: "sent" }, { key: "apple:X2", status: "same" }]);
  assert.equal(posts.length, 1);
});
