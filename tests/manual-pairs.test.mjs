import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchPlannedWorkouts } from "../src/index.js";
import { manualPairs, setManualPair, unpairedGymDays } from "../src/manual-pairs.js";
import { daySessions } from "../src/app-training.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { serverSource } from "./helpers/server-source.mjs";

const ride = { id: "planned:1", name: "Endurance", type: "Ride" };
const gym = { id: "planned:2", name: "Push", type: "WeightTraining" };
const bike = { id: "activity:a1", name: "Odpolední jízda", type: "Ride" };
const watch = { id: "google:w1", name: "Trénink", type: "Workout" };

test("a pairing made by hand wins over the automatic one, and an unpaired plan stays open", () => {
  const auto = matchPlannedWorkouts([ride, gym], [bike, watch]);
  assert.equal(auto.get(ride), bike);
  // The watch session was the gym session; the ride was somebody else's.
  const hand = matchPlannedWorkouts([ride, gym], [bike, watch], new Map(), new Map([["planned:2", "google:w1"], ["planned:1", ""]]));
  assert.equal(hand.get(gym), watch);
  assert.equal(hand.has(ride), false, "the user said this ride was not done");
  // An activity picked by hand for one plan is not taken by another automatically.
  const moved = matchPlannedWorkouts([ride, gym], [bike], new Map(), new Map([["planned:2", "activity:a1"]]));
  assert.equal(moved.get(gym), bike);
  assert.equal(moved.has(ride), false);
});

test("hand pairings are stored per plan, one plan per activity, and can be reset", async () => {
  const db = scopedDb(createD1(), 5);
  assert.equal((await setManualPair(db, 5, { plannedId: "planned:1", activityId: "activity:a1", date: "2026-10-10" })).status, "ok");
  await setManualPair(db, 5, { plannedId: "planned:2", activityId: "activity:a1", date: "2026-10-10" });
  let pairs = await manualPairs(db, 5, ["planned:1", "planned:2"]);
  assert.deepEqual([...pairs], [["planned:2", "activity:a1"]], "the activity moved to the other plan");
  await setManualPair(db, 5, { plannedId: "planned:1", activityId: null, date: "2026-10-10" });
  assert.equal((await manualPairs(db, 5, ["planned:1"])).get("planned:1"), "");
  await setManualPair(db, 5, { plannedId: "planned:1", reset: true, date: "2026-10-10" });
  assert.equal((await manualPairs(db, 5, ["planned:1"])).has("planned:1"), false);
  assert.equal((await setManualPair(db, 5, { plannedId: "activity:x", activityId: "a", date: "2026-10-10" })).code, 400);
});

test("a paired activity carries its plan's id so the app can undo the pairing", () => {
  const { sessions } = daySessions("2026-10-10", "2026-10-11", { planned: [], completed: [watch], matched: [{ planned: gym, actualId: "google:w1" }] });
  assert.equal(sessions[0].plannedId, "planned:2");
  assert.equal(sessions[0].title, "Push");
});

test("the app pairs through POST /app/api/training/pair", () => {
  const src = serverSource();
  assert.match(src, /url\.pathname==='\/app\/api\/training\/pair'/);
  assert.match(src, /setManualPair\(env\.DB,env\.USER_ID/);
});

test("a gym plan saved in the app is unpaired from the day's lifting session and paired back", async () => {
  const db = scopedDb(createD1(), 5);
  assert.equal((await setManualPair(db, 5, { plannedId: "gym:2026-10-28", activityId: null, date: "2026-10-28" })).status, "ok");
  assert.deepEqual([...await unpairedGymDays(db, 5, "2026-10-27", "2026-10-28")], ["2026-10-28"]);
  assert.equal((await setManualPair(db, 5, { plannedId: "gym:2026-10-28", activityId: "google:w1", date: "2026-10-28" })).code, 400, "a gym plan is only unpaired");
  await setManualPair(db, 5, { plannedId: "gym:2026-10-28", reset: true, date: "2026-10-28" });
  assert.equal((await unpairedGymDays(db, 5, "2026-10-27", "2026-10-28")).size, 0);
});

test("an unpaired gym plan and the day's lifting session show apart", () => {
  const lift = { id: "google:s1", name: "Strength training", type: "WeightTraining", durationHours: 0.3, start: "2026-10-28T11:29:00" };
  const plan = { name: "Upper body", exercises: ["Bench press"], sets: 13, logged: 3, compliance: 23, setsBy: { "Bench press": 13 }, done: { "Bench press": 3 } };
  const paired = daySessions("2026-10-28", "2026-10-28", { completed: [lift] }, plan).sessions;
  assert.equal(paired.length, 1);
  assert.equal(paired[0].pairedGym, true);
  const apart = daySessions("2026-10-28", "2026-10-28", { completed: [lift] }, { ...plan, unpaired: true }).sessions;
  assert.deepEqual(apart.map(s => s.id), ["google:s1", "gym:2026-10-28"]);
  assert.equal(apart[0].adherence, "offplan");
  assert.equal(apart[0].unpaired, true);
  assert.equal(apart[0].pairedGym, undefined);
});
