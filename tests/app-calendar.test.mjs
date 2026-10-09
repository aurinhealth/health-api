import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, primarySport, sportOf } from "../src/app-calendar.js";

const row = (data_type, source_family, external_id, start_time, end_time, payload) =>
  ({ data_type, source_family, external_id, start_time, end_time, value_numeric: null, payload_json: JSON.stringify(payload) });

const ride = row("activity", "intervals", "activity:i101", "2026-10-07T07:00:00", "2026-10-07T08:30:00",
  { id: "i101", type: "Ride", name: "Ranní kolo", moving_time: 5400, distance: 42300, calories: 1100, start_date: "2026-10-07T05:00:00Z", start_date_local: "2026-10-07T07:00:00" });
// The same ride from the watch: counted once.
const rideCopy = row("exercise", "google-wearables", "g1", "2026-10-07T05:01:00Z", "2026-10-07T06:29:00Z",
  { exercise: { exerciseType: "BIKING", displayName: "Kolo", activeDuration: "5280s", metricsSummary: { caloriesKcal: 980 } } });
const walk = row("exercise", "google-wearables", "g2", "2026-10-07T15:00:00Z", "2026-10-07T15:35:00Z",
  { exercise: { exerciseType: "WALKING", displayName: "Chůze", activeDuration: "2100s", metricsSummary: { caloriesKcal: 150, distanceMillimeters: 3100000 } } });
const planned = row("planned-workout", "intervals", "planned:55", "2026-10-10T00:00:00", null,
  { name: "Dlouhý běh", type: "Run", moving_time: 4800, start_date_local: "2026-10-10T00:00:00" });
const note = row("planned-workout", "intervals", "planned:56", "2026-10-11T00:00:00", null, { name: "Weekly", start_date_local: "2026-10-11T00:00:00" });
const pastPlan = row("planned-workout", "intervals", "planned:50", "2026-10-06T00:00:00", null, { name: "Intervaly", type: "Ride", moving_time: 3600, start_date_local: "2026-10-06T00:00:00" });

const calendar = buildCalendar({
  start: "2026-10-05", end: "2026-10-12", today: "2026-10-09",
  activities: [ride], google: [rideCopy, walk], planned: [planned, note, pastPlan],
  gym: { "2026-10-11": { name: "Horní tělo", exercises: ["Bench press", "Přítahy"] } }
});
const day = d => calendar.days.find(x => x.date === d);

test("every day of the range, done activities counted once", () => {
  assert.equal(calendar.days.length, 8);
  const d = day("2026-10-07");
  assert.equal(d.count, 2);
  assert.deepEqual(d.activities.map(a => a.sport), ["ride", "walk"]);
  assert.equal(d.primary, "ride");
  assert.equal(d.minutes, 90 + 35);
  assert.equal(d.kcal, 1100 + 150);
  assert.equal(d.activities[0].km, 42.3);
  assert.equal(d.activities[0].activityId, "i101");
  assert.equal(d.activities[1].km, 3.1);
});

test("plans from today on, gym plans and rest days", () => {
  assert.equal(day("2026-10-06").primary, "rest", "a missed past plan is not shown");
  assert.equal(day("2026-10-10").primary, "run");
  assert.equal(day("2026-10-10").activities[0].status, "planned");
  assert.equal(day("2026-10-10").activities[0].minutes, 80);
  assert.equal(day("2026-10-10").activities[0].eventId, "planned:55");
  assert.equal(day("2026-10-11").primary, "strength", "the Weekly note is no workout, the gym plan is");
  assert.equal(day("2026-10-11").planned, 1);
  assert.equal(day("2026-10-11").count, 0);
});

test("the main sport: the longest workout, a walk only alone", () => {
  assert.equal(primarySport([]), "rest");
  assert.equal(primarySport([{ sport: "walk", status: "done", minutes: 90 }, { sport: "strength", status: "done", minutes: 45 }]), "strength");
  assert.equal(primarySport([{ sport: "walk", status: "done", minutes: 30 }]), "walk");
  assert.equal(primarySport([{ sport: "run", status: "planned", minutes: 60 }, { sport: "walk", status: "done", minutes: 20 }]), "run");
  assert.equal(sportOf("VirtualRide"), "ride");
  assert.equal(sportOf("WeightTraining"), "strength");
});
