import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { storeLocalEvent, syncLocalWorkout } from "../src/local-workouts.js";
import { plannedDestinations, sendPlanned } from "../src/planned-send.js";
import { saveSyncPrefs } from "../src/sync-destinations.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const env = (db, extra = {}) => ({
  DB: db, USER_ID: 1, WAHOO_CLIENT_ID: "cid", WAHOO_CLIENT_SECRET: "s", CONNECTION_KEY: "x".repeat(32),
  WAHOO_TOKEN: JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 4102444800, user_id: "55" }), ...extra
});
const ride = db => storeLocalEvent(db, { external_id: "manual:ride123456", category: "WORKOUT", name: "Recovery", type: "Ride", start_date_local: "2099-01-01T17:00:00", moving_time: 2400, description: "- 8m 50%" });

function api(handlers = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url), method = opts.method || "GET", key = method + " " + u.pathname;
    calls.push(key);
    if (handlers[key]) return handlers[key]();
    if (key === "POST /v1/plans") return Response.json({ id: 7001 });
    if (key === "POST /v1/workouts") return Response.json({ id: 8001 });
    if (key === "POST /api/v1/athlete/0/events/bulk") return Response.json([{ id: 501 }]);
    if (method === "PUT") return Response.json({ id: 1 });
    return Response.json({});
  };
  return { calls, fetchImpl };
}

test("a Wahoo send that failed is shown and goes out again by hand, even after the retries gave up", async () => {
  const { db, raw } = setup();
  const local = await ride(db);
  await syncLocalWorkout(env(db), local.id, api({ "POST /v1/plans": () => new Response("{}", { status: 500 }) }).fetchImpl);
  raw.sqlite.prepare("UPDATE workout_exports SET status='failed',attempts=8 WHERE provider='wahoo'").run();
  assert.deepEqual((await plannedDestinations(env(db), "planned:" + local.id)).destinations, [{ id: "wahoo", status: "failed" }]);
  const { calls, fetchImpl } = api();
  const sent = await sendPlanned(env(db), { eventId: local.id, destination: "wahoo" }, fetchImpl);
  assert.equal(sent.sent, true);
  assert.equal(sent.destinations[0].status, "sent");
  assert.match(sent.destinations[0].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(calls.filter(c => c.includes("/v1/")), ["POST /v1/plans", "POST /v1/workouts"]);
  // Sent again while Wahoo has it: changed in place; deleted there: made anew.
  const again = api({ "PUT /v1/plans/7001": () => new Response("{}", { status: 404 }) });
  assert.equal((await sendPlanned(env(db), { eventId: local.id, destination: "wahoo" }, again.fetchImpl)).sent, true);
  assert.deepEqual(again.calls.filter(c => c.includes("/v1/")), ["PUT /v1/plans/7001", "POST /v1/plans", "POST /v1/workouts"]);
});

test("Send again reaches Intervals.icu even with Plánované tréninky off, and an event deleted there is made anew", async () => {
  const { db } = setup();
  const e = env(db, { INTERVALS_API_KEY: "k", WAHOO_TOKEN: undefined });
  const local = await ride(db);
  await saveSyncPrefs(db, 1, "intervals", { pushPlanned: false });
  assert.equal((await syncLocalWorkout(e, local.id, api().fetchImpl)).status, "off");
  assert.deepEqual((await plannedDestinations(e, local.id)).destinations, [{ id: "intervals", status: "notSent" }]);
  const first = api();
  assert.equal((await sendPlanned(e, { eventId: local.id, destination: "intervals" }, first.fetchImpl)).destinations[0].status, "sent");
  assert.deepEqual(first.calls, ["POST /api/v1/athlete/0/events/bulk"]);
  const gone = api({ "PUT /api/v1/athlete/0/events/501": () => new Response("{}", { status: 404 }) });
  assert.equal((await sendPlanned(e, { eventId: local.id, destination: "intervals" }, gone.fetchImpl)).sent, true);
  assert.deepEqual(gone.calls, ["PUT /api/v1/athlete/0/events/501", "POST /api/v1/athlete/0/events/bulk"]);
});

test("a plan from the Intervals.icu calendar is only shown there; nothing unconnected is offered", async () => {
  const { db } = setup();
  assert.deepEqual(await plannedDestinations(env(db, { INTERVALS_API_KEY: "k" }), "planned:98765"), { status: "ok", own: false, destinations: [{ id: "intervals", status: "origin" }] });
  await assert.rejects(sendPlanned(env(db, { INTERVALS_API_KEY: "k" }), { eventId: "98765", destination: "intervals" }));
  const local = await ride(db);
  assert.deepEqual((await plannedDestinations(env(db, { WAHOO_TOKEN: undefined }), local.id)).destinations, []);
  await assert.rejects(sendPlanned(env(db, { WAHOO_TOKEN: undefined }), { eventId: local.id, destination: "wahoo" }), /Wahoo/);
  // A gym session never goes to Wahoo.
  const gym = await storeLocalEvent(db, { external_id: "manual:gym1234567", category: "WORKOUT", name: "Gym", type: "WeightTraining", start_date_local: "2099-01-01T17:00:00", moving_time: 3600 });
  assert.deepEqual((await plannedDestinations(env(db), gym.id)).destinations, []);
});
