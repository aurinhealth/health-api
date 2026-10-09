import test from "node:test";
import assert from "node:assert/strict";
import { saveWeekPlan, getWeekPlan, resetWeekPlan, weekOverride, sanitizeWeekPlan } from "../src/week-planner.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const time = minutes => minutes.map(m => ({ minutes: m }));

test("a week keeps only what differs from the usual week", () => {
  const usual = sanitizeWeekPlan({ days: [["ride"], [], [], [], [], [], []], availability: time([60, 0, 60, 0, 60, 120, 120]), availabilityMode: "manual" });
  assert.deepEqual(weekOverride(usual, usual), {});
  const week = sanitizeWeekPlan({ ...usual, days: [["run"], [], [], [], [], [], []], sessions: { "0|run|0": { minutes: 45 } } });
  const own = weekOverride(week, usual);
  assert.deepEqual(Object.keys(own).sort(), ["days", "sessions"]);
  assert.deepEqual(own.sessions, { "0|run|0": { minutes: 45 } });
  const busy = sanitizeWeekPlan({ ...usual, availability: time([0, 0, 60, 0, 60, 120, 120]) });
  assert.deepEqual(Object.keys(weekOverride(busy, usual)).sort(), ["availability", "availabilityMode"]);
});

test("a later change of the usual week reaches a week with its own plan", async () => {
  const db = scopedDb(createD1(), 1), monday = "2026-10-12";
  await saveWeekPlan(db, { days: [["ride"], [], [], [], [], [], []], availability: time([60, 60, 60, 60, 60, 120, 120]), availabilityMode: "manual" });
  // The week's own days (as preparing the coach's proposal saves them)...
  const saved = await saveWeekPlan(db, { ...(await getWeekPlan(db, monday)), days: [["run"], [], ["ride"], [], [], [], []] }, monday);
  assert.equal(saved.source, "week");
  // ...and then less time on Tuesdays in the usual week.
  await saveWeekPlan(db, { ...(await getWeekPlan(db)), availability: time([60, 0, 60, 60, 60, 120, 120]) });
  const week = await getWeekPlan(db, monday);
  assert.equal(week.source, "week");
  assert.deepEqual(week.days[0], ["run"]);
  assert.equal(week.availability[1].minutes, 0);
  // Time set for the week alone stays the week's.
  await saveWeekPlan(db, { ...week, availability: time([30, 0, 60, 60, 60, 120, 120]) }, monday);
  await saveWeekPlan(db, { ...(await getWeekPlan(db)), availability: time([90, 0, 60, 60, 60, 120, 120]) });
  assert.equal((await getWeekPlan(db, monday)).availability[0].minutes, 30);
  assert.equal((await getWeekPlan(db, "2026-10-19")).availability[0].minutes, 90);
  assert.equal((await resetWeekPlan(db, monday)).source, "default");
});

test("saving a week equal to the usual week leaves no week of its own", async () => {
  const db = scopedDb(createD1(), 1), monday = "2026-10-12";
  await saveWeekPlan(db, { days: [["ride"], [], [], [], [], [], []], availability: time([60, 60, 60, 60, 60, 120, 120]), availabilityMode: "manual" });
  assert.equal((await saveWeekPlan(db, await getWeekPlan(db, monday), monday)).source, "default");
  assert.equal((await getWeekPlan(db, monday)).source, "default");
});
