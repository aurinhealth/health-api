import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import {
  readSyncPrefs, saveSyncPrefs, normalizeSyncPrefs, allowedWellness, syncOverview, sendActivity, retrySend, activitySends,
  normalizeActivity, googleExercise, googleMissingScopes, retrySyncSends, sentByLoadwise
} from "../src/sync-destinations.js";
import { EXTRA_SCOPES, HEALTH_SCOPES } from "../src/google-scopes.js";
import { handleStravaOAuth, syncStravaWeight, stravaAccessToken } from "../src/strava.js";
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
  // Strava is never read: its download switch stays off; Apple Health has no plans.
  assert.equal(normalizeSyncPrefs("strava", { pullActivities: true }).pullActivities, false);
  assert.equal(normalizeSyncPrefs("apple", { pushPlanned: true }).pushPlanned, false);
  assert.deepEqual(normalizeSyncPrefs("strava", { health: ["weight", "hrv"] }).health, ["weight"]);
  await assert.rejects(saveSyncPrefs(d, 7, "garmin", {}), /Neznámá|Unknown/);
});

test("the wellness push sends only the chosen health data", () => {
  const updates = { "2026-10-01": { restingHR: 51, hrv: 64, steps: 8000, sleepSecs: 24000, avgSleepingHR: 52, spO2: 96 } };
  assert.deepEqual(allowedWellness(updates, { health: "all" }), updates);
  assert.deepEqual(allowedWellness(updates, { health: ["sleep", "hrv"] }), { "2026-10-01": { hrv: 64, sleepSecs: 24000, avgSleepingHR: 52 } });
  assert.deepEqual(allowedWellness(updates, { health: [] }), {});
});

test("the overview lists the destinations the app can send to; Strava only when configured", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, INTERVALS_API_KEY: "k", GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: HEALTH_SCOPES };
  let overview = await syncOverview(env);
  assert.deepEqual(overview.destinations.map(x => x.id), ["apple", "google", "intervals"]);
  const google = overview.destinations.find(x => x.id === "google");
  // Weight writing is the extra Google permission not given yet.
  assert.deepEqual(google.missingScopes, ["weightWrite"]);
  assert.deepEqual(google.healthTypes, ["weight", "nutrition"]);
  overview = await syncOverview({ ...env, STRAVA_CLIENT_ID: "183664", STRAVA_CLIENT_SECRET: "s" });
  const strava = overview.destinations.find(x => x.id === "strava");
  assert.deepEqual([strava.connected, strava.supports.pullActivities, strava.healthTypes], [false, false, ["weight"]]);
  assert.deepEqual(googleMissingScopes({ GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite] }, { pushActivities: true, health: "all" }), ["activityWrite"]);
});

test("a done activity: the gym's own start in the user's zone, noon without one", () => {
  const a = normalizeActivity(activity);
  assert.equal(a.startLocal, "2026-10-10T18:05:00");
  assert.equal(a.startUtc, "2026-10-10T16:05:00.000Z");
  assert.equal(normalizeActivity({ ...activity, start: undefined }).startLocal, "2026-10-10T12:00:00");
  assert.throws(() => normalizeActivity({ ...activity, minutes: 0 }));
  assert.deepEqual(googleExercise(a).exercise, { interval: { startTime: "2026-10-10T16:05:00.000Z", endTime: "2026-10-10T17:07:00.000Z" }, exerciseType: "STRENGTH_TRAINING", displayName: "Push", activeDuration: "3720s", notes: "Bench 4 × 8" });
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
  assert.deepEqual(calls[1].body, { start_date_local: "2026-10-10T18:05:00", type: "WeightTraining", name: "Push", moving_time: 3720, elapsed_time: 3720, description: "Bench 4 × 8", external_id: "loadwise:7:gym:2026-10-10", icu_rpe: 7 });
  assert.equal(sentByLoadwise({ external_id: calls[1].body.external_id }), true);
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
  // The cron tries again: the lookup finds the copy Intervals.icu made, so it is updated, never posted again.
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

const strava = (tokens, extra = {}) => ({ STRAVA_CLIENT_ID: "183664", STRAVA_CLIENT_SECRET: "s", STRAVA_TOKEN: JSON.stringify(tokens), CONNECTION_KEY: "x".repeat(32), ...extra });

test("Strava: a manual activity, with the access token refreshed when it ran out", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, ...strava({ access_token: "old", refresh_token: "r1", expires_at: 1 }) };
  const { calls, fetchImpl } = recorder(url => url.endsWith("/oauth/token") ? Response.json({ access_token: "new", refresh_token: "r2", expires_at: 9e9 }) : Response.json({ id: 123 }));
  const result = await sendActivity(env, activity, { fetchImpl });
  assert.deepEqual(result.sends, [{ destination: "strava", status: "sent", remoteId: "123" }]);
  assert.equal(calls[0].url, "https://www.strava.com/oauth/token");
  assert.match(calls[0].body, /grant_type=refresh_token/);
  assert.deepEqual(calls[1].body, { name: "Push", sport_type: "WeightTraining", start_date_local: "2026-10-10T18:05:00", elapsed_time: 3720, external_id: "loadwise:7:gym:2026-10-10", description: "Bench 4 × 8" });
  assert.equal(JSON.parse(env.STRAVA_TOKEN).refresh_token, "r2");
  // The refreshed token is good: no second refresh.
  assert.equal(await stravaAccessToken(env, { fetchImpl }), "new");
  assert.equal(calls.length, 2);
  // An edit updates the known activity; the external_id is set once, on creation.
  await sendActivity(env, { ...activity, name: "Push B" }, { fetchImpl });
  assert.deepEqual([calls[2].method, calls[2].url, calls[2].body], ["PUT", "https://www.strava.com/api/v3/activities/123", { name: "Push B", sport_type: "WeightTraining", description: "Bench 4 × 8" }]);
});

test("Strava: a first send without an answer is 'unknown'; the retry's repeated external_id counts as sent", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, ...strava({ access_token: "a", refresh_token: "r", expires_at: 9e9 }) };
  const lost = recorder(() => timeout());
  const result = await sendActivity(env, activity, { fetchImpl: lost.fetchImpl });
  assert.deepEqual([result.sends[0].status, lost.calls.length], ["unknown", 1]);
  d.sqlite.exec("UPDATE sync_sends SET updated_at = datetime('now', '-10 minutes')");
  // Strava already has it: 409 with the activity named.
  const named = recorder(() => Response.json({ message: "Resource Already Exists", id: 555 }, { status: 409 }));
  assert.deepEqual(await retrySyncSends(env, { fetchImpl: named.fetchImpl }), [{ destination: "strava", status: "sent", remoteId: "555" }]);
  assert.deepEqual(named.calls.map(c => [c.method, c.body.external_id]), [["POST", "loadwise:7:gym:2026-10-10"]]);
  // 409 without an id: sent, with no id to update later.
  const d2 = db(), env2 = { ...env, DB: d2 };
  await sendActivity(env2, activity, { fetchImpl: lost.fetchImpl });
  d2.sqlite.exec("UPDATE sync_sends SET updated_at = datetime('now', '-10 minutes')");
  const nameless = recorder(() => Response.json({ message: "Resource Already Exists", errors: [{ resource: "Activity", field: "external_id", code: "already exists" }] }, { status: 409 }));
  assert.deepEqual(await retrySyncSends(env2, { fetchImpl: nameless.fetchImpl }), [{ destination: "strava", status: "sent", remoteId: null }]);
  assert.deepEqual((await activitySends(env2, activity.key)).map(s => [s.status, s.remoteId]), [["sent", null]]);
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

test("Strava: the latest weight once, again only when it changes", async () => {
  const d = db();
  const env = { DB: d, USER_ID: 7, ...strava({ access_token: "a", refresh_token: "r", expires_at: 9e9 }) };
  d.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric) VALUES (7, 'manual', 'weight', 'w1', datetime('now'), 82.46)").run();
  const { calls, fetchImpl } = recorder(() => Response.json({}));
  assert.deepEqual(await syncStravaWeight(env, { fetchImpl }), { status: "ok", written: 82.5 });
  assert.deepEqual([calls[0].method, calls[0].url], ["PUT", "https://www.strava.com/api/v3/athlete?weight=82.5"]);
  assert.deepEqual(await syncStravaWeight(env, { fetchImpl }), { status: "ok", written: null });
  assert.equal((await syncStravaWeight(env, { fetchImpl, allowed: false })).status, "skipped");
  assert.equal(calls.length, 1);
});

test("Strava OAuth asks only to write; a full Strava app says so", async () => {
  const env = { ...strava({}), APP_ORIGIN: "https://petrfitnessdata.eu" };
  const start = await handleStravaOAuth(new Request("https://petrfitnessdata.eu/oauth/strava?return=native"), env, "/oauth/strava");
  const to = new URL(start.headers.get("Location"));
  assert.equal(to.searchParams.get("scope"), "activity:write,profile:write");
  const cookie = start.headers.get("Set-Cookie").split(";")[0];
  const state = to.searchParams.get("state");
  const callback = new Request("https://petrfitnessdata.eu/oauth/strava/callback?code=c&state=" + state, { headers: { Cookie: cookie } });
  const full = await handleStravaOAuth(callback, env, "/oauth/strava/callback", async () => Response.json({ message: "Limit of connected athletes exceeded" }, { status: 403 }));
  assert.equal(full.headers.get("Location"), "loadwise://connected?event=strava-full");
  // Without the app registered nothing is offered.
  assert.match((await handleStravaOAuth(new Request("https://petrfitnessdata.eu/oauth/strava?return=native"), {}, "/oauth/strava")).headers.get("Location"), /strava-failed/);
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
