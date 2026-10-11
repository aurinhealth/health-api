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

test("plans ahead, missed past plans, gym plans and rest days", () => {
  assert.equal(day("2026-10-05").primary, "rest");
  assert.equal(day("2026-10-05").plan, null);
  assert.equal(day("2026-10-06").primary, "ride", "a past plan nothing was done for is missed");
  assert.equal(day("2026-10-06").activities[0].status, "missed");
  assert.equal(day("2026-10-06").missed, 1);
  assert.equal(day("2026-10-06").planned, 0);
  assert.equal(day("2026-10-06").plan, "missed");
  assert.equal(day("2026-10-10").primary, "run");
  assert.equal(day("2026-10-10").activities[0].status, "planned");
  assert.equal(day("2026-10-10").activities[0].minutes, 80);
  assert.equal(day("2026-10-10").activities[0].eventId, "planned:55");
  assert.equal(day("2026-10-11").primary, "strength", "the Weekly note is no workout, the gym plan is");
  assert.equal(day("2026-10-11").planned, 1);
  assert.equal(day("2026-10-11").count, 0);
  assert.equal(day("2026-10-10").plan, "planned");
  assert.equal(day("2026-10-11").plan, "planned");
  // Done without a plan that day: outside the plan.
  assert.deepEqual(day("2026-10-07").activities.map(a => a.adherence), ["offplan", "offplan"]);
  assert.equal(day("2026-10-07").plan, "offplan");
});

// The week's pairing and adherence (plan-match.js, app-training.js daySessions).
test("done sessions paired with their plan: kept to it, done differently, missed", () => {
  const plan = (id, date, name, type, seconds, tss) => row("planned-workout", "intervals", id, date + "T00:00:00", null,
    { name, type, moving_time: seconds, icu_training_load: tss, start_date_local: date + "T00:00:00" });
  const act = (id, date, name, type, seconds, tss) => row("activity", "intervals", "activity:" + id, date + "T07:00:00", null,
    { id, type, name, moving_time: seconds, icu_training_load: tss, start_date_local: date + "T07:00:00" });
  const out = buildCalendar({
    start: "2026-10-05", end: "2026-10-09", today: "2026-10-09",
    planned: [plan("planned:1", "2026-10-05", "Sweet spot", "Ride", 3600, 70), plan("planned:2", "2026-10-06", "Tempo", "Ride", 5400, 90),
      plan("planned:3", "2026-10-07", "Běh", "Run", 2700, 40), plan("planned:4", "2026-10-09", "Kolo", "Ride", 3600, 50)],
    activities: [act("a1", "2026-10-05", "Sweet spot", "Ride", 3700, 72), act("a2", "2026-10-06", "Tempo", "Ride", 3600, 60)],
    gym: { "2026-10-08": { name: "Nohy", exercises: ["Dřep"], sets: 10, logged: 6 } }
  });
  const d = date => out.days.find(x => x.date === date);
  assert.equal(d("2026-10-05").plan, "good");
  assert.equal(d("2026-10-05").activities.length, 1, "the plan that was done is shown once, as done");
  assert.equal(d("2026-10-05").activities[0].adherence, "good");
  assert.equal(d("2026-10-05").activities[0].plannedId, "planned:1");
  assert.equal(d("2026-10-06").plan, "off");
  assert.equal(d("2026-10-06").activities[0].adherence, "off");
  assert.match(d("2026-10-06").activities[0].adherenceReason, /kratší než plán \(1 h 30\)/);
  assert.equal(d("2026-10-07").plan, "missed");
  assert.deepEqual(d("2026-10-07").activities.map(a => [a.status, a.eventId]), [["missed", "planned:3"]]);
  // A gym plan saved in the app with sets logged there: done, but too few of them.
  assert.equal(d("2026-10-08").activities[0].status, "done");
  assert.equal(d("2026-10-08").activities[0].adherence, "off");
  assert.equal(d("2026-10-08").plan, "off");
  assert.equal(d("2026-10-09").activities[0].status, "planned", "today's plan still waits");
  assert.equal(d("2026-10-09").plan, "planned");
});

test("a stub without a length shows when its plan names it; a hand pairing decides", () => {
  const plan = row("planned-workout", "intervals", "planned:9", "2026-10-06T00:00:00", null, { name: "Posilovna", type: "WeightTraining", moving_time: 3600, start_date_local: "2026-10-06T00:00:00" });
  const stub = row("activity", "intervals", "activity:s1", "2026-10-06T18:00:00", null, { id: "s1", source: "STRAVA", _note: "stub", start_date_local: "2026-10-06T18:00:00" });
  const walk = row("exercise", "google-wearables", "g9", "2026-10-06T10:00:00Z", "2026-10-06T10:40:00Z", { exercise: { exerciseType: "WALKING", activeDuration: "2400s" } });
  const auto = buildCalendar({ start: "2026-10-06", end: "2026-10-06", today: "2026-10-09", planned: [plan], activities: [stub] }).days[0];
  assert.deepEqual(auto.activities.map(a => [a.status, a.sport, a.title, a.plannedId]), [["done", "strength", "Posilovna", "planned:9"]]);
  assert.equal(auto.plan, "good");
  const hand = buildCalendar({ start: "2026-10-06", end: "2026-10-06", today: "2026-10-09", planned: [plan], google: [walk], manual: new Map([["planned:9", "g9"]]) }).days[0];
  assert.deepEqual(hand.activities.map(a => [a.sport, a.plannedId]), [["walk", "planned:9"]]);
});

test("the main sport: the longest workout, a walk only alone", () => {
  assert.equal(primarySport([]), "rest");
  assert.equal(primarySport([{ sport: "walk", status: "done", minutes: 90 }, { sport: "strength", status: "done", minutes: 45 }]), "strength");
  assert.equal(primarySport([{ sport: "walk", status: "done", minutes: 30 }]), "walk");
  assert.equal(primarySport([{ sport: "run", status: "planned", minutes: 60 }, { sport: "walk", status: "done", minutes: 20 }]), "run");
  assert.equal(sportOf("VirtualRide"), "ride");
  assert.equal(sportOf("WeightTraining"), "strength");
});

test("a watch session carries its summary for the app's detail", () => {
  const hike = row("exercise", "google-wearables", "g3", "2026-10-08T08:00:00Z", "2026-10-08T09:10:00Z",
    { exercise: { exerciseType: "HIKING", displayName: "Výšlap", activeDuration: "4200s",
      metricsSummary: { caloriesKcal: 420, steps: "8123", averageHeartRateBeatsPerMinute: 118.6, maxHeartRateBeatsPerMinute: { bpm: 152 },
        elevationGainMillimeters: 312000, heartRateZoneDurations: { x: 1 } } } });
  const out = buildCalendar({ start: "2026-10-08", end: "2026-10-08", today: "2026-10-09", google: [hike] });
  const a = out.days[0].activities[0];
  assert.equal(a.activityId, null);
  assert.deepEqual(a.summary, { source: "google", start: "10:00", end: "11:10", avgHr: 119, maxHr: 152, steps: 8123, elevationM: 312 });
  // Intervals.icu activities have their own detail and no summary.
  assert.equal(day("2026-10-07").activities[0].summary, undefined);
});
