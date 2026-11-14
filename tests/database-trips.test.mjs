// The account's database costs per trip, not per SQL (2026-11-14: Today, the
// workout pick and Me waited 4–14 s for some 50–90 trips with ~10 ms of SQL).
// Reads that do not need each other start side by side, so d1-batch.js sends
// them as one trip: these parts of Today, the pick and Me take one trip each.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { batchingD1 } from "../src/d1-batch.js";
import { timed } from "../src/request-timing.js";
import { connectionStatus } from "../src/connections.js";
import { getWeekPlan } from "../src/week-planner.js";
import { trainingHistory } from "../src/training-history.js";
import { onboardingStatus } from "../src/onboarding.js";
import { journalForCoach } from "../src/routes-journal.js";
import { readGymPlan } from "../src/gym-plan-store.js";
import { googleDashboard } from "../src/google-dashboard.js";
import { storedDetails, storeDetails } from "../src/coach-pick.js";
import { ensureOnboarding } from "../src/onboarding.js";
import { ensureCalendarFree } from "../src/calendar-free.js";
import { ensureJournal } from "../src/journal-store.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const schema = read("staging/schema.sql");
const migrations = readdirSync(new URL("../migrations/", import.meta.url)).filter(n => n.endsWith(".sql")).sort();

// A user's database as in production (the migrations and the tables handlers
// make on their first request) that counts its trips (one statement or one batch each).
async function counted() {
  const raw = createD1(); raw.sqlite.exec(schema);
  for (const name of migrations) { try { raw.sqlite.exec(read("migrations/" + name)); } catch { /* a column or table the schema already has */ } }
  for (const ensure of [ensureOnboarding, ensureCalendarFree, ensureJournal]) await ensure(scopedDb(raw, 1));
  let trips = 0;
  const prepare = raw.prepare, batch = raw.batch.bind(raw);
  const RAW = Symbol("raw");
  const wrap = s => ({ [RAW]: s, bind: (...v) => wrap(s.bind(...v)),
    first: () => { trips++; return s.first(); }, all: () => { trips++; return s.all(); }, run: () => { trips++; return s.run(); } });
  raw.prepare = sql => wrap(prepare(sql));
  raw.batch = statements => { trips++; return batch(statements.map(s => s[RAW] || s)); };
  const db = scopedDb(batchingD1(raw), 1);
  // Trips of one request; the tables are made by the first run (once per isolate).
  const tripsOf = async fn => { await timed(fn); trips = 0; await timed(fn); return trips; };
  return { raw, db, env: { DB: db, USER_ID: 1 }, tripsOf };
}

test("Today's connection check, week plan and gym day: one trip each", async () => {
  const { db, env, tripsOf } = await counted();
  assert.equal(await tripsOf(() => connectionStatus(env)), 1);
  assert.equal(await tripsOf(() => getWeekPlan(db, "2026-11-14")), 1, "no setup done: no training history either");
  assert.equal(await tripsOf(() => readGymPlan(db, "2026-11-14")), 1);
  assert.equal(await tripsOf(() => journalForCoach(db, "2026-11-14")), 2, "settings and findings together, then yesterday");
  assert.equal(await tripsOf(() => googleDashboard(db, "2026-11-14")), 2, "the hour summary's mark first, then the rest");
});

test("Me: the training history and the setup in one trip", async () => {
  const { raw, db, env, tripsOf } = await counted();
  // A ride three weeks back: the first ask stores the weeks, then they are read as they are.
  const day = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,sample_time,payload_json) VALUES(1,'intervals','activity','r1',?,?,?,?)")
    .run(day + "T08:00:00", day + "T09:00:00", day + "T08:00:00", JSON.stringify({ type: "Ride", moving_time: 3600 }));
  assert.equal(await tripsOf(() => trainingHistory(db)), 1);
  assert.equal(await tripsOf(() => onboardingStatus(env)), 1);
});

test("the pick's stored workouts are read alongside the signature", async () => {
  const { db } = await counted();
  await storeDetails(db, 1, "2026-11-14", "A", { ride: { minutes: 60 } });
  assert.deepEqual(await storedDetails(db, 1, "2026-11-14", Promise.resolve("A")), { ride: { minutes: 60 } });
  assert.equal(await storedDetails(db, 1, "2026-11-14", Promise.resolve("B")), null);
});
