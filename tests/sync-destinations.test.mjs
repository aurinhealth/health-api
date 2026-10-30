import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import {
  readSyncPrefs, saveSyncPrefs, normalizeSyncPrefs, allowedWellness, syncOverview, sendActivity, retrySend, activitySends,
  normalizeActivity, googleExercise, googleMissingScopes, retrySyncSends, sentByAurin
} from "../src/sync-destinations.js";
import { EXTRA_SCOPES, HEALTH_SCOPES } from "../src/google-scopes.js";
import { storeLocalEvent, syncLocalWorkout } from "../src/local-workouts.js";

const migration = readFileSync(new URL("../migrations/0019_sync_destinations.sql", import.meta.url), "utf8");
function db({ migrate = true } = {}) {
  const d = createD1();
  if (migrate) d.sqlite.exec(migration);
  d.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT, UNIQUE (user_id, source_family, data_type, external_id))");
  return d;
}
const activity = { key: "gym:2026-10-10", sport: "gym", name: "Push", date: "2026-10-10", start: "2026-10-10T16:05:00Z", minutes: 62, notes: "Bench 4 × 8", rpe: 7 };
function recorder(reply) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? (typeof opts.body === "string" ? JSON.parse(opts.body) : String(opts.body)) : null }); return reply(String(url), opts, calls.length); };
  return { calls, fetchImpl };
}

test("without a choice everything keeps today's behaviour", async () => {
  const d = db({ migrate: false });
  assert.deepEqual(await readSyncPrefs(d, 7, "intervals"), { pushPlanned: true, pushActivities: true, pullActivities: true, health: "all", stored: false });
  assert.deepEqual(await readSyncPrefs(d, 7, "apple"), { pushPlanned: false, pushActivities: false, pullActivities: false, health: [], stored: false });
  // Writing workouts to Google needs a permission nobody has yet: off until chosen.
  assert.equal((await readSyncPrefs(d, 7, "google")).pushActivities, false);
});

test("preferences are saved per user and destination, cleaned up", async () => {
  const d = db();
  const saved = await saveSyncPrefs(d, 7, "intervals", { pushPlanned: false, health: ["hrv", "sleep", "nonsense", "hrv"] });
  assert.deepEqual(saved, { pushPlanned: false, pushActivities: true, pullActivities: true, health: ["hrv", "sleep"] });
  assert.deepEqual(await readSyncPrefs(d, 7, "intervals"), { ...saved, stored: true });
  assert.equal((await readSyncPrefs(d, 8, "intervals")).health, "all");
  // A partial update keeps the rest; "all" again.
  assert.deepEqual(await saveSyncPrefs(d, 7, "intervals", { health: "all" }), { ...saved, health: "all" });
  // Apple Health has no plans.
  assert.equal(normalizeSyncPrefs("apple", { pushPlanned: true }).pushPlanned, false);
  await assert.rejects(saveSyncPrefs(d, 7, "garmin", {}), /Neznámá|Unknown/);
  // Strava is no destination any more.
  await assert.rejects(saveSyncPrefs(d, 7, "strava", {}), /Neznámá|Unknown/);
});

test("the wellness push sends only the chosen health data", () => {
  const updates = { "2026-10-01": { restingHR: 51, hrv: 64, steps: 8000, sleepSecs: 24000, avgSleepingHR: 52, spO2: 96 } };
  assert.deepEqual(allowedWellness(updates, { health: "all" }), updates);
  assert.deepEqual(allowedWellness(updates, { health: ["sleep", "hrv"] }), { "2026-10-01": { hrv: 64, sleepSecs: 24000, avgSleepingHR: 52 } });
  assert.deepEqual(allowedWellness(updates, { health: [] }), {});
});

test("the overview lists the destinations the app can send to; never Strava", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "k", GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: HEALTH_SCOPES };
  let overview = await syncOverview(env);
  assert.deepEqual(overview.destinations.map(x => x.id), ["apple", "google", "intervals"]);
  const google = overview.destinations.find(x => x.id === "google");
  // Weight writing is the extra Google permission not given yet.
  assert.deepEqual(google.missingScopes, ["weightWrite"]);
  assert.deepEqual(google.healthTypes, ["weight", "nutrition"]);
  overview = await syncOverview({ ...env, STRAVA_CLIENT_ID: "183664", STRAVA_CLIENT_SECRET: "s", STRAVA_TOKEN: "{}" });
  assert.deepEqual(overview.destinations.map(x => x.id), ["apple", "google", "intervals"]);
  assert.deepEqual(googleMissingScopes({ GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite] }, { pushActivities: true, health: "all" }), ["activityWrite"]);
});

test("a done activity: the gym's own start in the user's zone, noon without one", () => {
  const a = normalizeActivity(activity);
  assert.equal(a.startLocal, "2026-10-10T18:05:00");
  assert.equal(a.startUtc, "2026-10-10T16:05:00.000Z");
  assert.equal(normalizeActivity({ ...activity, start: undefined }).startLocal, "2026-10-10T12:00:00");
  // A workout after midnight stays on its own day in Google Health: the offset goes with it.
  assert.deepEqual(googleExercise({ ...a, startUtc: "2026-10-23T23:17:00.000Z", minutes: 30 }).exercise.interval, { startTime: "2026-10-23T23:17:00.000Z", startUtcOffset: "7200s", endTime: "2026-10-23T23:47:00.000Z", endUtcOffset: "7200s" });
  assert.equal(googleExercise({ ...a, startUtc: null, startLocal: "2026-10-10T12:00:00" }).exercise.interval.startTime, "2026-10-10T10:00:00.000Z");
  assert.throws(() => normalizeActivity({ ...activity, minutes: 0 }));
  assert.deepEqual(googleExercise(a).exercise, { interval: { startTime: "2026-10-10T16:05:00.000Z", startUtcOffset: "7200s", endTime: "2026-10-10T17:07:00.000Z", endUtcOffset: "7200s" }, exerciseType: "STRENGTH_TRAINING", displayName: "Push", activeDuration: "3720s", notes: "Bench 4 × 8" });
});

test("Intervals.icu gets the activity as a manual one, recorded; a retry updates it", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "k" };
  const { calls, fetchImpl } = recorder((url, opts) => (opts.method || "GET") === "GET" ? Response.json([]) : Response.json({ id: "i777" }));
  const result = await sendActivity(env, activity, { fetchImpl });
  assert.deepEqual(result.sends, [{ destination: "intervals", status: "sent", remoteId: "i777" }]);
  // Before a first send Intervals.icu is asked whether the day already has this activity (a lost answer).
  assert.deepEqual([calls[0].method, calls[0].url], ["GET", "https://intervals.icu/api/v1/athlete/0/activities?oldest=2026-10-10&newest=2026-10-11"]);
  assert.equal(calls[1].url, "https://intervals.icu/api/v1/athlete/0/activities/manual");
  assert.deepEqual(calls[1].body, { start_date_local: "2026-10-10T18:05:00", type: "WeightTraining", name: "Push", moving_time: 3720, elapsed_time: 3720, description: "Bench 4 × 8", external_id: "aurin:7:gym:2026-10-10", icu_rpe: 7 });
  assert.equal(sentByAurin({ external_id: calls[1].body.external_id }), true);
  // The same activity again (edited): PUT on the known id, no lookup, no second copy.
  await sendActivity(env, { ...activity, name: "Push A" }, { fetchImpl });
  assert.deepEqual([calls[2].method, calls[2].url], ["PUT", "https://intervals.icu/api/v1/activity/i777"]);
  assert.equal(calls.length, 3);
  assert.deepEqual((await activitySends(env, activity.key)).map(s => [s.destination, s.status, s.remoteId]), [["intervals", "sent", "i777"]]);
});

const timeout = () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); };

test("Intervals.icu: a first send without an answer is 'unknown'; the retry finds the activity by external_id and updates it", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "k" };
  const lost = recorder((url, opts) => (opts.method || "GET") === "GET" ? Response.json([]) : timeout());
  const result = await sendActivity(env, activity, { fetchImpl: lost.fetchImpl });
  assert.equal(result.sends[0].status, "unknown");
  assert.match(result.sends[0].message, /už tam může být|may already be there/);
  assert.deepEqual(lost.calls.map(c => c.method), ["GET", "POST"]);
  assert.deepEqual((await activitySends(env, activity.key)).map(s => [s.status, s.remoteId]), [["unknown", null]]);
  // The cron tries again: the lookup finds the copy Intervals.icu made, so it is updated, never posted again;
  // also one sent before 2026-11 under its loadwise:… id.
  d.sqlite.exec("UPDATE sync_sends SET updated_at = datetime('now', '-10 minutes')");
  const found = recorder((url, opts) => (opts.method || "GET") === "GET" ? Response.json([{ id: 4242, external_id: "loadwise:7:gym:2026-10-10" }, { id: 1, external_id: null }]) : Response.json({ id: 4242 }));
  assert.deepEqual(await retrySyncSends(env, { fetchImpl: found.fetchImpl }), [{ destination: "intervals", status: "sent", remoteId: "4242" }]);
  assert.deepEqual(found.calls.map(c => [c.method, c.url]), [["GET", "https://intervals.icu/api/v1/athlete/0/activities?oldest=2026-10-10&newest=2026-10-11"], ["PUT", "https://intervals.icu/api/v1/activity/4242"]]);
  // A lookup that fails is an ordinary error (nothing was sent), tried again later.
  const d2 = db(), env2 = { DB: d2, USER_ID: 7, INTERVALS_API_KEY: "k" };
  const broken = recorder((url, opts) => (opts.method || "GET") === "GET" ? timeout() : Response.json({ id: 1 }));
  assert.equal((await sendActivity(env2, activity, { fetchImpl: broken.fetchImpl })).sends[0].status, "error");
  assert.deepEqual(broken.calls.map(c => c.method), ["GET"]);
  // A lost answer to an update (the id is known) is an error too: the update is simply repeated.
  d.sqlite.exec("UPDATE sync_sends SET updated_at = datetime('now', '-10 minutes'), attempts = 0");
  const lostUpdate = recorder(() => timeout());
  assert.equal((await retrySend(env, activity.key, "intervals", { fetchImpl: lostUpdate.fetchImpl })).status, "error");
  assert.deepEqual(lostUpdate.calls.map(c => c.method), ["PUT"]);
});

test("a failed send is recorded with a message and goes out on 'Zkusit znovu'", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "k" };
  let ok = false;
  const { fetchImpl } = recorder(() => ok ? Response.json({ id: 5 }) : new Response("no", { status: 500 }));
  const first = await sendActivity(env, activity, { fetchImpl });
  assert.equal(first.sends[0].status, "error");
  assert.match(first.sends[0].message, /Zkus to znovu|Try again/);
  ok = true;
  assert.deepEqual(await retrySend(env, activity.key, "intervals", { fetchImpl }), { destination: "intervals", status: "sent", remoteId: "5" });
  await assert.rejects(retrySend(env, "nothing:here", "intervals", { fetchImpl }), /nenašlo|find/);
});

test("switched off or not connected: nothing is sent", async () => {
  const d = db();
  const { calls, fetchImpl } = recorder(() => Response.json({ id: 1 }));
  await saveSyncPrefs(d, 7, "intervals", { pushActivities: false });
  assert.deepEqual((await sendActivity({ DB: d, USER_ID: 7, INTERVALS_API_KEY: "k" }, activity, { fetchImpl })).sends, []);
  assert.deepEqual((await sendActivity({ DB: d, USER_ID: 8 }, activity, { fetchImpl })).sends, []);
  assert.equal(calls.length, 0);
});

test("Google Health: workouts only with the workout-writing permission, as an exercise", async () => {
  const d = db();
  await saveSyncPrefs(d, 7, "google", { pushActivities: true });
  const { calls, fetchImpl } = recorder(() => Response.json({ name: "users/me/dataTypes/exercise/dataPoints/abc" }));
  const googleToken = async () => "token";
  const without = await sendActivity({ DB: d, USER_ID: 7, GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: HEALTH_SCOPES }, activity, { fetchImpl, googleToken });
  assert.deepEqual([without.sends[0].status, without.sends[0].needsScope], ["error", "activityWrite"]);
  assert.equal(calls.length, 0);
  const env = { DB: d, USER_ID: 7, GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.activityWrite] };
  const sent = await sendActivity(env, activity, { fetchImpl, googleToken });
  assert.deepEqual(sent.sends, [{ destination: "google", status: "sent", remoteId: "users/me/dataTypes/exercise/dataPoints/abc" }]);
  assert.deepEqual([calls[0].method, calls[0].url], ["POST", "https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints"]);
  assert.equal(calls[0].body.exercise.exerciseType, "STRENGTH_TRAINING");
  await sendActivity(env, activity, { fetchImpl, googleToken });
  assert.deepEqual([calls[1].method, calls[1].url], ["PATCH", "https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints/abc"]);
});

test("Google Health: a first send without an answer is sent again only by hand", async () => {
  const d = db();
  await saveSyncPrefs(d, 7, "google", { pushActivities: true });
  const env = { DB: d, USER_ID: 7, GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.activityWrite] }, googleToken = async () => "token";
  const lost = recorder(() => timeout());
  const result = await sendActivity(env, activity, { fetchImpl: lost.fetchImpl, googleToken });
  assert.deepEqual([result.sends[0].status, lost.calls.length], ["unknown", 1]);
  // Neither the cron nor saving the activity again (an edit) posts a possible second copy.
  d.sqlite.exec("UPDATE sync_sends SET updated_at = datetime('now', '-10 minutes')");
  const ok = recorder(() => Response.json({ name: "users/me/dataTypes/exercise/dataPoints/abc" }));
  assert.deepEqual(await retrySyncSends(env, { fetchImpl: ok.fetchImpl, googleToken }), []);
  const edited = await sendActivity(env, { ...activity, name: "Push B" }, { fetchImpl: ok.fetchImpl, googleToken });
  assert.equal(edited.sends[0].status, "unknown");
  assert.equal(ok.calls.length, 0);
  assert.deepEqual((await activitySends(env, activity.key)).map(s => s.status), ["unknown"]);
  // "Zkusit znovu" is the user's decision: the record is posted and then patched like any other.
  assert.deepEqual(await retrySend(env, activity.key, "google", { fetchImpl: ok.fetchImpl, googleToken }), { destination: "google", status: "sent", remoteId: "users/me/dataTypes/exercise/dataPoints/abc" });
  assert.deepEqual(ok.calls.map(c => c.method), ["POST"]);
  await sendActivity(env, { ...activity, name: "Push C" }, { fetchImpl: ok.fetchImpl, googleToken });
  assert.deepEqual(ok.calls.map(c => c.method), ["POST", "PATCH"]);
});

test("Google Health: a write answered with an operation is polled, and one still running is not posted again", async () => {
  const d = db();
  await saveSyncPrefs(d, 7, "google", { pushActivities: true });
  const env = { DB: d, USER_ID: 7, GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.activityWrite] }, googleToken = async () => "token";
  const record = "users/me/dataTypes/exercise/dataPoints/abc";
  // Done on the first poll: the record's name is kept, not the operation's.
  const quick = recorder((url, opts) => (opts.method || "GET") === "POST" ? Response.json({ name: "operations/op0", done: false }) : Response.json({ name: "operations/op0", done: true, response: { name: record } }));
  const first = await sendActivity(env, activity, { fetchImpl: quick.fetchImpl, googleToken, pollMs: 0 });
  assert.deepEqual(first.sends[0], { destination: "google", status: "sent", remoteId: record });
  assert.deepEqual(quick.calls.map(c => [c.method, c.url.replace("https://health.googleapis.com/v4/", "")]), [["POST", "users/me/dataTypes/exercise/dataPoints"], ["GET", "operations/op0"]]);

  // Still running after the polls: waiting, with the operation kept.
  const other = { ...activity, key: "gym:2026-10-11", date: "2026-10-11", start: "2026-10-11T16:05:00Z" };
  const slow = recorder((url, opts) => (opts.method || "GET") === "POST" ? Response.json({ name: "operations/op1", done: false }) : Response.json({ name: "operations/op1", done: false }));
  const waiting = await sendActivity(env, other, { fetchImpl: slow.fetchImpl, googleToken, pollMs: 0 });
  assert.equal(waiting.sends[0].status, "pending");
  assert.equal((await activitySends(env, other.key))[0].remoteId, "operations/op1");
  assert.deepEqual(slow.calls.map(c => c.method), ["POST", "GET", "GET", "GET"]);
  // The cron asks the operation first, then patches the record it made: no second POST.
  d.sqlite.exec("UPDATE sync_sends SET updated_at = datetime('now', '-10 minutes')");
  const later = recorder((url, opts) => (opts.method || "GET") === "GET" ? Response.json({ name: "operations/op1", done: true, response: { name: record + "2" } }) : Response.json({ name: record + "2" }));
  assert.deepEqual((await retrySyncSends(env, { fetchImpl: later.fetchImpl, googleToken })).map(r => [r.status, r.remoteId]), [["sent", record + "2"]]);
  assert.deepEqual(later.calls.map(c => [c.method, c.url.replace("https://health.googleapis.com/v4/", "")]), [["GET", "operations/op1"], ["PATCH", record + "2"]]);

  // An operation that failed made nothing: the activity is sent anew.
  d.sqlite.exec("UPDATE sync_sends SET status = 'pending', remote_id = 'operations/op2' WHERE activity_key = 'gym:2026-10-11'");
  const failed = recorder((url, opts) => (opts.method || "GET") === "GET" ? Response.json({ name: "operations/op2", done: true, error: { code: 13 } }) : Response.json({ name: record + "3" }));
  assert.equal((await retrySend(env, other.key, "google", { fetchImpl: failed.fetchImpl, googleToken })).remoteId, record + "3");
  assert.deepEqual(failed.calls.map(c => c.method), ["GET", "POST"]);
});

test("the cron retries only what failed a few times", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "k" };
  const { fetchImpl } = recorder(() => new Response("", { status: 502 }));
  await sendActivity(env, activity, { fetchImpl });
  d.sqlite.exec("UPDATE sync_sends SET updated_at = datetime('now', '-10 minutes')");
  const ok = recorder(() => Response.json({ id: 9 }));
  assert.deepEqual((await retrySyncSends(env, { fetchImpl: ok.fetchImpl })).map(r => r.status), ["sent"]);
  d.sqlite.exec("UPDATE sync_sends SET status = 'error', attempts = 3, updated_at = datetime('now', '-10 minutes')");
  assert.deepEqual(await retrySyncSends(env, { fetchImpl: ok.fetchImpl }), []);
});

test("Plánované tréninky off: a new plan stays in the app", async () => {
  const d = db();
  const scoped = { ...d, userId: 7 };
  await saveSyncPrefs(scoped, 7, "intervals", { pushPlanned: false });
  const saved = await storeLocalEvent(scoped, { external_id: "manual:abc1234567", category: "WORKOUT", name: "Tempo", type: "Ride", start_date_local: "2099-01-01T12:00:00", moving_time: 3600 });
  const { calls, fetchImpl } = recorder(() => Response.json([{ id: 1 }]));
  const result = await syncLocalWorkout({ DB: scoped, USER_ID: 7, INTERVALS_API_KEY: "k" }, saved.id, fetchImpl);
  assert.equal(result.status, "off");
  assert.equal(calls.length, 0);
  await saveSyncPrefs(scoped, 7, "intervals", { pushPlanned: true });
  assert.equal((await syncLocalWorkout({ DB: scoped, USER_ID: 7, INTERVALS_API_KEY: "k" }, saved.id, fetchImpl)).status, "synced");
});
