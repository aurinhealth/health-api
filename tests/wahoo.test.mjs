import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import legacy from "../src/index.js";
import { handleWahooOAuth, handleWahooWebhook, wahooActivityRow, wahooPlan, syncWahoo, syncWahooWorkout, retryWahooExports, disconnectWahoo } from "../src/wahoo.js";
import { storeLocalEvent, syncLocalWorkout, editLocalWorkout } from "../src/local-workouts.js";
import { saveSyncPrefs, syncOverview } from "../src/sync-destinations.js";
import { connectionStatus } from "../src/connections.js";
import { withTimeZone } from "../src/user-time.js";
import { changeActivityType } from "../src/activity-type.js";
import { setActivityKcal } from "../src/activity-edits.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const rows = (raw, where = "1=1") => raw.sqlite.prepare(`SELECT * FROM health_datapoints WHERE ${where} ORDER BY id`).all().map(r => ({ ...r }));
const env = (db, tokens = { access_token: "a", refresh_token: "r", expires_at: 0, user_id: "55" }, extra = {}) => ({
  DB: db, USER_ID: 1, WAHOO_CLIENT_ID: "cid", WAHOO_CLIENT_SECRET: "s", WAHOO_TOKEN: tokens ? JSON.stringify(tokens) : undefined, CONNECTION_KEY: "x".repeat(32), ...extra
});
const NOW = Date.parse("2026-10-14T12:00:00Z");

// The shape of a /v1/workouts record (and of the webhook's workout_summary.workout).
const summary = extra => ({ id: 900, ascent_accum: "312.0", cadence_avg: "88.0", calories_accum: "812.0", distance_accum: "40123.5", duration_active_accum: "4980.0", duration_paused_accum: "120.0", duration_total_accum: "5100.0", heart_rate_avg: "141.0", power_bike_np_last: "231.0", power_bike_tss_last: "78.4", power_avg: "212.0", speed_avg: "8.06", work_accum: "1055000.0", time_zone: "Europe/Prague", ...extra });
const workout = (id, starts, extra = {}) => ({ id, starts, minutes: 85, name: "Sweet spot", workout_type_id: 61, plan_id: null, workout_token: null, workout_summary: summary(), ...extra });

function api(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url), method = opts.method || "GET";
    const body = opts.body ? Object.fromEntries(new URLSearchParams(String(opts.body))) : null;
    calls.push({ path: u.pathname + u.search, method, body, auth: opts.headers?.Authorization });
    const key = method + " " + u.pathname;
    if (handlers[key]) return handlers[key](u, body);
    if (u.pathname === "/oauth/token") return Response.json({ access_token: "a2", refresh_token: "r2", expires_in: 7200 });
    if (u.pathname === "/v1/user") return Response.json({ id: 55 });
    if (key === "POST /v1/plans") return Response.json({ id: 7001 });
    if (key === "POST /v1/workouts") return Response.json({ id: 8001 });
    if (method === "PUT") return Response.json({ id: 1 });
    if (method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({ workouts: [], total: 0 });
  };
  return { calls, fetchImpl };
}

test("a done Wahoo workout becomes an activity in the Intervals.icu shape, at its local time", () => {
  const row = wahooActivityRow(workout(900, "2026-10-13T16:05:00.000Z"));
  assert.equal(row.external_id, "wahoo:900");
  assert.equal(row.start_time, "2026-10-13T18:05:00");
  assert.equal(row.end_time, "2026-10-13T19:30:00");
  assert.deepEqual({ type: row.payload.type, moving: row.payload.moving_time, tss: row.payload.icu_training_load, np: row.payload.icu_weighted_avg_watts, hr: row.payload.average_heartrate, kcal: row.payload.calories, km: row.payload.distance },
    { type: "VirtualRide", moving: 4980, tss: 78, np: 231, hr: 141, kcal: 812, km: 40124 });
  // A planned workout (no summary yet) is not an activity.
  assert.equal(wahooActivityRow(workout(901, "2026-10-15T06:00:00Z", { workout_summary: null })), null);
  assert.equal(wahooActivityRow(workout(902, "2026-10-13T06:00:00Z", { workout_type_id: 1 })).payload.type, "Run");
});

test("the plan file: FTP targets with a range outside, repeats, cadence; effort without an FTP", () => {
  const description = "Sweet spot ve dvou blocích.\n\nWarmup\n- 10m ramp 50-75% 90rpm\n\n3x\n- 8m 90% 90rpm\n- 4m 55%\n\n- 10m 50%";
  const indoor = wahooPlan({ type: "VirtualRide", name: "Sweet spot 3×8", description, moving_time: 3600 }, { ftp: 250 });
  assert.deepEqual(indoor.header, { name: "Sweet spot 3×8", version: "1.0.0", description: "Sweet spot ve dvou blocích.", workout_type_family: 0, workout_type_location: 0, ftp: 250 });
  // The ramp as steps of a few minutes, rising.
  const ramp = indoor.intervals.filter(i => i.intensity_type === "wu");
  assert.equal(ramp.length, 6);
  assert.deepEqual(ramp.map(i => i.targets[0].low), [0.52, 0.56, 0.6, 0.65, 0.69, 0.73]);
  const block = indoor.intervals.find(i => i.exit_trigger_type === "repeat");
  assert.equal(block.exit_trigger_value, 2);
  assert.deepEqual(block.intervals[0], { exit_trigger_type: "time", exit_trigger_value: 480, intensity_type: "lt", targets: [{ type: "ftp", low: 0.9, high: 0.9 }, { type: "rpm", low: 90, high: 90 }] });
  assert.equal(block.intervals[1].intensity_type, "rest");
  assert.equal(indoor.intervals.at(-1).intensity_type, "cd");
  const outdoor = wahooPlan({ type: "Ride", name: "Venku", description }, { ftp: 250 });
  assert.equal(outdoor.header.workout_type_location, 1);
  assert.deepEqual(outdoor.intervals.find(i => i.exit_trigger_type === "repeat").intervals[0].targets[0], { type: "ftp", low: 0.87, high: 0.93 });
  const unknown = wahooPlan({ type: "VirtualRide", name: "x", description });
  assert.equal(unknown.header.ftp, undefined);
  assert.deepEqual(unknown.intervals.find(i => i.exit_trigger_type === "repeat").intervals[0].targets[0], { type: "rpe", low: 6, high: 6 });
  const run = wahooPlan({ type: "Run", name: "Tempo", description: "- 20m 92% Pace" }, { thresholdPace: 250 });
  assert.equal(run.header.threshold_speed, 4);
  assert.equal(run.intervals[0].targets[0].type, "threshold_speed");
  // Typed in by hand, without steps: its length.
  assert.deepEqual(wahooPlan({ type: "Ride", name: "Vyjížďka", moving_time: 5400 }).intervals, [{ exit_trigger_type: "time", exit_trigger_value: 5400, intensity_type: "active", targets: [] }]);
});

test("connecting stores the tokens with the Wahoo user id; the import refreshes and keeps the new pair", async () => {
  const { db, raw } = setup();
  const e = env(db, null);
  const start = await handleWahooOAuth(new Request("https://aurin.health/oauth/wahoo"), e, "/oauth/wahoo");
  const to = new URL(start.headers.get("Location"));
  assert.equal(to.origin + to.pathname, "https://api.wahooligan.com/oauth/authorize");
  assert.match(to.searchParams.get("scope"), /workouts_read .*plans_write .*offline_data/);
  const state = to.searchParams.get("state"), cookie = start.headers.get("Set-Cookie").split(";")[0];
  const { fetchImpl, calls } = api({
    "GET /v1/workouts": u => Response.json({ workouts: u.searchParams.get("page") === "1" ? [workout(1, "2026-10-13T16:00:00Z"), workout(2, "2026-10-14T05:00:00Z", { workout_summary: null })] : [] })
  });
  const done = await handleWahooOAuth(new Request("https://aurin.health/oauth/wahoo/callback?code=c&state=" + state, { headers: { Cookie: cookie } }), e, "/oauth/wahoo/callback", fetchImpl);
  assert.match(done.headers.get("Location"), /wahoo/);
  assert.deepEqual(JSON.parse(e.WAHOO_TOKEN).user_id, "55");

  const later = env(db, { access_token: "old", refresh_token: "r2", expires_at: 1, user_id: "55" });
  const result = await syncWahoo(later, { days: 5, fetchImpl, now: NOW });
  assert.deepEqual(result, { status: "ok", saved: 1 });
  assert.equal(JSON.parse(later.WAHOO_TOKEN).access_token, "a2");
  assert.equal(JSON.parse(later.WAHOO_TOKEN).user_id, "55");
  assert.equal(calls.filter(c => c.path.startsWith("/v1/workouts")).at(-1).auth, "Bearer a2");
  assert.equal(rows(raw, "source_family='wahoo' AND data_type='activity'").length, 1);
  // Stahovat → Hotové aktivity off: nothing is fetched.
  await saveSyncPrefs(db, 1, "wahoo", { pullActivities: false });
  assert.equal((await syncWahoo(later, { fetchImpl, now: NOW })).status, "off");
});

test("the webhook needs our token and saves the workout for whoever has that Wahoo account", async () => {
  const { db, raw } = setup();
  const user = env(db);
  const forUser = async (id, fn) => id === "55" ? fn(user) : null;
  const post = body => handleWahooWebhook(new Request("https://aurin.health/webhooks/wahoo", { method: "POST", body: JSON.stringify(body) }), { WAHOO_WEBHOOK_TOKEN: "tok" }, forUser);
  const { id, ...rest } = summary(); void id;
  const event = token => ({ event_type: "workout_summary", webhook_token: token, user: { id: 55 }, workout_summary: { id: 4, ...rest, workout: { id: 300, starts: "2026-10-14T05:30:00Z", minutes: 85, name: "Ráno", workout_type_id: 0 } } });
  assert.equal((await post(event("bad"))).status, 401);
  assert.equal(rows(raw).length, 0);
  assert.equal((await post(event("tok"))).status, 200);
  const saved = rows(raw, "source_family='wahoo'");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].start_time, "2026-10-14T07:30:00");
  assert.equal(JSON.parse(saved[0].payload_json).type, "Ride");
  // Someone we do not know: acknowledged, nothing saved.
  assert.equal((await post({ ...event("tok"), user: { id: 99 } })).status, 200);
  assert.equal(rows(raw).length, 1);
});

test("a planned ride goes to Wahoo as a plan and a workout, follows edits and goes on deletion", async () => {
  const { db } = setup();
  const e = env(db, { access_token: "a", refresh_token: "r", expires_at: 0, user_id: "55" });
  const local = await storeLocalEvent(db, { external_id: "pfd-library:ss:2026-10-16", category: "WORKOUT", name: "Sweet spot", type: "VirtualRide", start_date_local: "2026-10-16T00:00:00", moving_time: 3600, description: "3x\n- 8m 90%\n- 4m 55%" });
  const { calls, fetchImpl } = api();
  const thresholds = { ftp: 260, indoorFtp: 250 };
  const first = await withTimeZone("Europe/Prague", () => syncWahooWorkout(e, local.id, { fetchImpl, now: NOW, thresholds }));
  assert.deepEqual(first, { status: "synced", eventId: "7001:8001" });
  const [plan, made] = calls.filter(c => c.method === "POST");
  assert.equal(plan.path, "/v1/plans");
  assert.equal(plan.body["plan[external_id]"], local.id);
  const file = JSON.parse(Buffer.from(plan.body["plan[file]"].replace("data:application/json;base64,", ""), "base64").toString());
  assert.equal(file.header.ftp, 250);
  assert.deepEqual({ ...made.body }, { "workout[name]": "Sweet spot", "workout[workout_type_id]": "61", "workout[starts]": "2026-10-16T04:00:00.000Z", "workout[minutes]": "60", "workout[workout_token]": local.id, "workout[plan_id]": "7001" });
  // Nothing changed: nothing is sent again.
  assert.equal((await syncWahooWorkout(e, local.id, { fetchImpl, now: NOW })).status, "synced");
  assert.equal(calls.length, 2);
  // Moved to another day: the plan and the workout are changed in place.
  await editLocalWorkout({ DB: db, USER_ID: 1 }, local.id, { start_date_local: "2026-10-17T00:00:00" }, fetchImpl);
  await syncWahooWorkout(e, local.id, { fetchImpl, now: NOW });
  assert.deepEqual(calls.slice(2).map(c => c.method + " " + c.path), ["PUT /v1/plans/7001", "PUT /v1/workouts/8001"]);
  await editLocalWorkout({ DB: db, USER_ID: 1 }, local.id, { deleted: true }, fetchImpl);
  await syncWahooWorkout(e, local.id, { fetchImpl, now: NOW });
  assert.deepEqual(calls.slice(4).map(c => c.method + " " + c.path), ["DELETE /v1/workouts/8001", "DELETE /v1/plans/7001"]);
});

test("only rides and runs still ahead go out, and Plánované tréninky off keeps them in the app", async () => {
  const { db } = setup();
  const e = env(db);
  const { calls, fetchImpl } = api();
  const gym = await storeLocalEvent(db, { external_id: "manual:gym1234567", category: "WORKOUT", name: "Posilovna", type: "WeightTraining", start_date_local: "2026-10-16T17:00:00", moving_time: 3600 });
  const past = await storeLocalEvent(db, { external_id: "manual:old1234567", category: "WORKOUT", name: "Včera", type: "Ride", start_date_local: "2026-10-13T17:00:00", moving_time: 3600 });
  assert.equal((await syncWahooWorkout(e, gym.id, { fetchImpl, now: NOW })).status, "skipped");
  assert.equal((await syncWahooWorkout(e, past.id, { fetchImpl, now: NOW })).status, "off");
  await saveSyncPrefs(db, 1, "wahoo", { pushPlanned: false });
  const ride = await storeLocalEvent(db, { external_id: "manual:new1234567", category: "WORKOUT", name: "Zítra", type: "Ride", start_date_local: "2026-10-15T17:00:00", moving_time: 3600 });
  assert.equal((await syncWahooWorkout(e, ride.id, { fetchImpl, now: NOW })).status, "off");
  assert.equal(calls.length, 0);
  // Turned on again: the retry sends what is ahead, nothing else.
  await saveSyncPrefs(db, 1, "wahoo", { pushPlanned: true });
  const sent = await retryWahooExports(e, { fetchImpl, now: NOW, thresholds: {} });
  assert.ok(sent.some(r => r.status === "synced"));
  assert.deepEqual(calls.filter(c => c.method === "POST").map(c => c.path), ["/v1/plans", "/v1/workouts"]);
});

test("without Intervals.icu the app hears Wahoo's answer; a full Sandbox waits for the retry", async () => {
  const { db, raw } = setup();
  const local = await storeLocalEvent(db, { external_id: "manual:abc1234567", category: "WORKOUT", name: "Tempo", type: "Ride", start_date_local: "2099-01-01T12:00:00", moving_time: 3600 });
  const busy = api({ "POST /v1/plans": () => new Response("{}", { status: 429 }) });
  const result = await syncLocalWorkout(env(db), local.id, busy.fetchImpl);
  assert.equal(result.status, "error");
  assert.equal(result.destination, "wahoo");
  assert.deepEqual({ ...raw.sqlite.prepare("SELECT status, attempts FROM workout_exports WHERE provider='wahoo'").get() }, { status: "error", attempts: 1 });
  // The plan went in, the workout did not: the next try makes only the workout.
  const half = api({ "POST /v1/workouts": () => new Response("{}", { status: 500 }) });
  assert.equal((await syncLocalWorkout(env(db), local.id, half.fetchImpl)).status, "error");
  const ok = api();
  const done = await syncLocalWorkout(env(db), local.id, ok.fetchImpl);
  assert.deepEqual([done.status, done.destination, done.eventId], ["synced", "wahoo", "7001:8001"]);
  assert.deepEqual(ok.calls.filter(c => c.path.startsWith("/v1/")).map(c => c.method + " " + c.path), ["PUT /v1/plans/7001", "POST /v1/workouts"]);
});

test("a type and calories changed in Aurin stay after the next Wahoo sync", async () => {
  const { db, raw } = setup();
  const e = env(db, { access_token: "a", refresh_token: "r", expires_at: NOW + 3600000, user_id: "55" });
  let name = "Sweet spot";
  const { fetchImpl } = api({ "GET /v1/workouts": u => Response.json({ workouts: u.searchParams.get("page") === "1" ? [workout(1, "2026-10-13T16:00:00Z", { name, workout_type_id: 1 })] : [] }) });
  assert.equal((await syncWahoo(e, { days: 5, fetchImpl, now: NOW })).saved, 1);
  await changeActivityType(e, { id: "wahoo:1", type: "Walk" });
  await setActivityKcal(e, { id: "wahoo:1", kcal: 250 });
  name = "Evening";
  await syncWahoo(e, { days: 5, fetchImpl, now: NOW });
  const p = JSON.parse(rows(raw, "source_family='wahoo'")[0].payload_json);
  assert.deepEqual([p.type, p.loadwiseType, p.calories, p.loadwiseKcal, p.loadwiseKcalDevice, p.name], ["Walk", "Walk", 250, 250, 812, "Evening"]);
});

test("the same ride from Wahoo and Intervals.icu counts once; Wahoo's ride stands over the watch's", async () => {
  const { db, raw } = setup();
  const e = { DB: db, USER_ID: 1, CONNECTED_PROVIDERS: [] };
  const insert = (family, type, id, start, end, payload) => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,?,?,?,?,?,?)").run(family, type, id, start, end, JSON.stringify(payload));
  const w = wahooActivityRow(workout(1, "2026-10-13T16:05:00Z")), w2 = wahooActivityRow(workout(2, "2026-10-12T15:00:00Z", { workout_type_id: 0 }));
  for (const r of [w, w2]) insert("wahoo", "activity", r.external_id, r.start_time, r.end_time, r.payload);
  insert("intervals", "activity", "activity:i1", "2026-10-13T18:05:30", null, { id: "i1", type: "VirtualRide", start_date: "2026-10-13T16:05:30Z", start_date_local: "2026-10-13T18:05:30", moving_time: 4980, elapsed_time: 5100, source: "WAHOO" });
  insert("google-wearables", "exercise", "g1", "2026-10-13T16:03:00Z", "2026-10-13T17:31:00Z", { exercise: { exerciseType: "BIKING", activeDuration: "5280s" } });
  insert("google-wearables", "exercise", "g2", "2026-10-12T15:01:00Z", "2026-10-12T16:24:00Z", { exercise: { exerciseType: "BIKING", activeDuration: "4980s" } });
  await legacy.fetch(new Request("https://internal/sync/match", { method: "POST" }), e, { waitUntil() {} });
  const role = id => raw.sqlite.prepare("SELECT record_role FROM health_datapoints WHERE external_id=?").get(id).record_role;
  assert.deepEqual(["activity:i1", "wahoo:1", "g1", "wahoo:2", "g2"].map(role), ["primary", "duplicate", "duplicate", "primary", "duplicate"]);
  // Disconnecting deletes the Wahoo rides; the watch's ride counts again.
  await disconnectWahoo(env(db), { fetchImpl: api().fetchImpl });
  assert.equal(rows(raw, "source_family='wahoo'").length, 0);
  assert.equal(role("g2"), "primary");
});

test("Wahoo is offered in Zdroje dat and Synchronizace once its app is registered", async () => {
  const { db } = setup();
  const off = await connectionStatus({ DB: db, USER_ID: 1 });
  assert.equal(off.providers.some(p => p.id === "wahoo"), false);
  const on = await connectionStatus(env(db));
  assert.deepEqual((({ connected, connectUrl }) => ({ connected, connectUrl }))(on.providers.find(p => p.id === "wahoo")), { connected: true, connectUrl: "/oauth/wahoo" });
  const sync = (await syncOverview(env(db))).destinations.find(d => d.id === "wahoo");
  assert.deepEqual([sync.connected, sync.prefs, sync.supports], [true, { pushPlanned: true, pushActivities: false, pullActivities: true, health: [] }, { pushPlanned: true, pushActivities: false, pullActivities: true, health: false }]);
});

test("a failing export waits longer after each try and stops after eight", async () => {
  const { db, raw } = setup();
  const local = await storeLocalEvent(db, { external_id: "manual:retry12345", category: "WORKOUT", name: "Tempo", type: "Ride", start_date_local: "2099-01-01T12:00:00", moving_time: 3600 });
  const broken = api({ "POST /v1/plans": () => new Response("{}", { status: 500 }) });
  await syncLocalWorkout(env(db), local.id, broken.fetchImpl);
  // Just failed: not due yet.
  assert.equal((await retryWahooExports(env(db), { fetchImpl: broken.fetchImpl })).length, 0);
  for (let i = 0; i < 8; i++) {
    raw.sqlite.prepare("UPDATE workout_exports SET updated_at=datetime('now','-7 hours') WHERE provider='wahoo'").run();
    await retryWahooExports(env(db), { fetchImpl: broken.fetchImpl });
  }
  assert.deepEqual({ ...raw.sqlite.prepare("SELECT status, attempts FROM workout_exports WHERE provider='wahoo'").get() }, { status: "failed", attempts: 8 });
  raw.sqlite.prepare("UPDATE workout_exports SET updated_at=datetime('now','-7 hours') WHERE provider='wahoo'").run();
  assert.equal((await retryWahooExports(env(db), { fetchImpl: broken.fetchImpl })).length, 0);
});

test("the plan's step kinds (intensity=) decide Wahoo's warm-up, rests and cool-down", () => {
  const description = "Zaměření: VO2max na trenažéru, 30 min.\n\nWarmup\n- 6m 55% intensity=warmup\n\nMain Set 4x\n- 3m 110% intensity=interval\n- 2m 50% intensity=recovery\n\nCooldown\n- 4m 50% intensity=cooldown";
  const plan = wahooPlan({ type: "VirtualRide", name: "VO2max 4×3", description }, { ftp: 260 });
  assert.equal(plan.header.description, "Zaměření: VO2max na trenažéru, 30 min.");
  assert.deepEqual(plan.intervals.map(i => i.intensity_type || i.intervals.map(x => x.intensity_type).join("/")), ["wu", "map/rest", "cd"]);
  assert.equal(plan.intervals[1].exit_trigger_value, 3);
});
