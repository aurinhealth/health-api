import test from "node:test";
import assert from "node:assert/strict";
import { linkPlanned, followingTime } from "../src/planned-links.js";
import { movePlannedEvent, deletePlannedEvent } from "../src/planned-events.js";
import { storeLocalEvent } from "../src/local-workouts.js";
import { markBrick } from "../src/week-ai.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

async function setup() {
  const raw = createD1();
  raw.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, source_family TEXT, data_type TEXT, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, matched_activity_id TEXT, match_confidence REAL, updated_at TEXT, UNIQUE(user_id,source_family,data_type,external_id));
    CREATE TABLE workout_schedule_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, workout_id TEXT, scheduled_date TEXT, environment TEXT, intervals_external_id TEXT, intervals_event_id TEXT, status TEXT);`);
  const env = { DB: scopedDb(raw, 1) };
  const ride = await storeLocalEvent(env.DB, { external_id: "a", type: "Ride", name: "Long ride", start_date_local: "2026-11-07T08:00:00", moving_time: 6300 });
  const run = await storeLocalEvent(env.DB, { external_id: "b", type: "Run", name: "Brick run", start_date_local: "2026-11-07T00:00:00", moving_time: 900 });
  const gym = await storeLocalEvent(env.DB, { external_id: "c", type: "WeightTraining", name: "Gym", start_date_local: "2026-11-07T00:00:00" });
  const event = async id => JSON.parse(raw.sqlite.prepare("SELECT event_json FROM local_workouts WHERE id=?").get(id).event_json);
  const move = (id, date, time) => movePlannedEvent(env, { eventId: id, date, time }, async () => new Response("{}"), { links: false });
  return { raw, env, ride: ride.id, run: run.id, gym: gym.id, event, move };
}

test("the second leg starts when the first ends, with five minutes to change", () => {
  assert.equal(followingTime({ start_date_local: "2026-11-07T08:00:00", moving_time: 6300 }), "09:50");
  assert.equal(followingTime({ start_date_local: "2026-11-07T00:00:00", moving_time: 6300 }), null);
  assert.equal(followingTime({ start_date_local: "2026-11-07T23:30:00", moving_time: 3600 }), "23:59");
});

test("joining sets both sides and the run's time; apart again clears them", async () => {
  const { raw, env, ride, run, gym, event, move } = await setup();
  const r = await linkPlanned(env, { eventId: "planned:" + run, after: "planned:" + ride }, move);
  assert.equal(r.time, "09:50");
  assert.equal((await event(run)).after, ride);
  assert.equal((await event(ride)).next, run);
  assert.equal((await event(run)).start_date_local, "2026-11-07T09:50:00");
  // The projection the week reads carries the link too.
  assert.equal(JSON.parse(raw.sqlite.prepare("SELECT payload_json FROM health_datapoints WHERE external_id=?").get("planned:" + run).payload_json).after, ride);
  await assert.rejects(linkPlanned(env, { eventId: gym, after: ride }, move), /kolo, běh a plavání|Rides, runs and swims/);
  await linkPlanned(env, { eventId: run, after: null }, move);
  assert.equal((await event(run)).after, undefined);
  assert.equal((await event(ride)).next, undefined);
});

test("moving the ride takes the run along; moving the run alone splits the pair", async () => {
  const { env, ride, run, event, move } = await setup();
  await linkPlanned(env, { eventId: run, after: ride }, move);
  const fetchImpl = async () => new Response("{}");
  const r = await movePlannedEvent(env, { eventId: "planned:" + ride, date: "2026-11-08", time: "07:00" }, fetchImpl);
  assert.equal(r.followed, "planned:" + run);
  assert.equal((await event(run)).start_date_local, "2026-11-08T08:50:00");
  assert.equal((await event(run)).after, ride);
  await movePlannedEvent(env, { eventId: "planned:" + run, date: "2026-11-08", time: "18:30" }, fetchImpl);
  assert.equal((await event(run)).after, undefined);
  assert.equal((await event(ride)).next, undefined);
});

test("deleting one leg leaves the other on its own; another day can't join", async () => {
  const { env, ride, run, event, move } = await setup();
  await linkPlanned(env, { eventId: run, after: ride }, move);
  await deletePlannedEvent(env, { eventId: "planned:" + ride }, async () => new Response("{}"));
  assert.equal((await event(run)).after, undefined);
  const other = await storeLocalEvent(env.DB, { external_id: "d", type: "Run", name: "Run", start_date_local: "2026-11-09T00:00:00", moving_time: 900 });
  await assert.rejects(linkPlanned(env, { eventId: other.id, after: run }, move), /stejného dne|same day/);
});

test("the week's brick: the short run right after the longest ride", () => {
  const days = [
    { date: "2026-11-05", sport: "ride", minutes: 75 }, { date: "2026-11-05", sport: "run", minutes: 40 },
    { date: "2026-11-07", sport: "run", minutes: 20 }, { date: "2026-11-07", sport: "swim", minutes: 30 }, { date: "2026-11-07", sport: "ride", minutes: 120 },
    { date: "2026-11-08", sport: "run", minutes: 70 }
  ];
  const out = markBrick(days, { split: { brick: { minutes: 20 } } });
  const sat = out.filter(d => d.date === "2026-11-07");
  assert.deepEqual(sat.map(d => d.sport), ["swim", "ride", "run"]);
  assert.equal(sat[2].brick, true);
  assert.equal(out.filter(d => d.brick).length, 1);
  // No split and no plan brick: nothing joined.
  assert.equal(markBrick(days).some(d => d.brick), false);
  // The plan's brick day wins over a longer ride.
  const plan = markBrick(days, { planDays: [{ date: "2026-11-05", plan: { kind: "brick" } }] });
  assert.equal(plan.find(d => d.brick).date, "2026-11-05");
});

test("a duathlon's three race legs join in order, each starting when the one before ends", async () => {
  const { env, event, move } = await setup();
  const leg = (key, type, minutes, time = "00:00") => storeLocalEvent(env.DB, { external_id: key, type, name: key, start_date_local: "2026-11-08T" + time + ":00", moving_time: minutes * 60, race: true });
  const [run1, ride, run2] = [await leg("run1", "Run", 24, "09:00"), await leg("ride", "Ride", 33), await leg("run2", "Run", 13)].map(x => x.id);
  await linkPlanned(env, { eventId: "planned:" + ride, after: "planned:" + run1 }, move);
  await linkPlanned(env, { eventId: "planned:" + run2, after: "planned:" + ride }, move);
  assert.deepEqual([(await event(run1)).next, (await event(ride)).after, (await event(ride)).next, (await event(run2)).after], [ride, run1, run2, ride]);
  assert.equal((await event(ride)).start_date_local, "2026-11-08T09:29:00");
  assert.equal((await event(run2)).start_date_local, "2026-11-08T10:07:00");
  assert.equal((await event(run2)).race, true);
  // Moving the first run takes the ride and the second run along, each right after the one before.
  const fetchImpl = async () => new Response("{}");
  await movePlannedEvent(env, { eventId: "planned:" + run1, date: "2026-11-09", time: "10:00" }, fetchImpl);
  assert.deepEqual([(await event(ride)).start_date_local, (await event(run2)).start_date_local], ["2026-11-09T10:29:00", "2026-11-09T11:07:00"]);
  assert.equal((await event(run2)).after, ride);
  // Moving the ride on its own leaves all three apart.
  await movePlannedEvent(env, { eventId: "planned:" + ride, date: "2026-11-10", time: "08:00" }, fetchImpl);
  assert.deepEqual([(await event(run1)).next, (await event(ride)).after, (await event(ride)).next, (await event(run2)).after], [undefined, undefined, undefined, undefined]);
});
