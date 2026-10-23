import test from "node:test";
import assert from "node:assert/strict";
import { watchType, typeName, groupOfType } from "../src/activity-type.js";
import { googleExerciseActivity } from "../src/index.js";
import { appleRow } from "../src/apple-health.js";
import { watchActivity } from "../src/watch-forward.js";

const row = (exerciseType, family = "apple-health") => ({ source_family: family, external_id: "w1", start_time: "2026-10-23T10:00:00Z", end_time: "2026-10-23T11:00:00Z", payload_json: JSON.stringify({ exercise: { exerciseType } }) });

test("a watch's sport becomes the app's type, named in words", () => {
  for (const [watch, type, group] of [["SWIMMING", "Swim", "swim"], ["OPEN_WATER_SWIMMING", "OpenWaterSwim", "swim"], ["TENNIS", "Tennis", "other"],
    ["TABLE_TENNIS", "TableTennis", "other"], ["HIIT", "HighIntensityIntervalTraining", "other"], ["YOGA", "Yoga", "other"], ["ROWING", "Rowing", "other"],
    ["MOUNTAIN_BIKING", "MountainBikeRide", "ride"], ["STATIONARY_BIKING", "VirtualRide", "ride"], ["STRENGTH_TRAINING", "WeightTraining", "strength"],
    ["ROCK_CLIMBING", "RockClimbing", "other"], ["CROSS_COUNTRY_SKIING", "NordicSki", "other"], ["Tennis", "Tennis", "other"]]) {
    assert.equal(watchType(watch), type, watch);
    assert.equal(groupOfType(type), group, watch);
  }
  for (const unknown of ["EXERCISE", "AEROBIC_WORKOUT", "", undefined]) assert.equal(watchType(unknown), null);
});

test("Google and Apple workouts carry the type, so the day list says Tenis and not TENNIS", () => {
  assert.equal(googleExerciseActivity(row("TENNIS")).type, "Tennis");
  assert.equal(typeName(googleExerciseActivity(row("TENNIS", "google-wearables")).type), "Tenis");
  assert.equal(googleExerciseActivity(row("SWIMMING")).type, "Swim");
  // No sport at all: a workout, never "EXERCISE".
  assert.equal(googleExerciseActivity(row("EXERCISE")).type, "Workout");
});

test("the iPhone's new sports are kept, open water swims too", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  const of = activity => JSON.parse(JSON.stringify(appleRow({ type: "exercise", id: "a1", start: "2026-10-23T10:00:00Z", end: "2026-10-23T11:00:00Z", activity }, now).payload)).exercise.exerciseType;
  assert.equal(of("openWaterSwimming"), "OPEN_WATER_SWIMMING");
  assert.equal(of("squash"), "SQUASH");
  assert.equal(of("climbing"), "ROCK_CLIMBING");
  // A sport HealthKit adds later is kept by its name, and is a workout until Aurin knows it.
  assert.equal(of("somethingNew"), "SOMETHING_NEW");
  assert.equal(watchType("SOMETHING_NEW"), null);
  assert.equal(of("other"), "EXERCISE");
  assert.equal(of("bad name!"), "EXERCISE");
});

test("an Apple Watch squash goes to Intervals.icu as squash", () => {
  const a = watchActivity({ external_id: "apple:x", start_time: "2026-10-23T10:00:00Z", end_time: "2026-10-23T11:00:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "SQUASH" } }) });
  assert.equal(a.type, "Squash");
  assert.equal(a.name, "Squash");
});

test("Apple Health's other sports are Aurin's own types and go to Intervals.icu as a workout", async () => {
  const { intervalsActivity } = await import("../src/sync-destinations.js");
  const { intervalsTypeOf } = await import("../src/activity-type.js");
  const now = Date.parse("2026-10-23T12:00:00Z");
  const ex = appleRow({ type: "exercise", id: "b1", start: "2026-10-23T10:00:00Z", end: "2026-10-23T11:00:00Z", activity: "americanFootball" }, now).payload.exercise;
  assert.equal(ex.exerciseType, "AMERICAN_FOOTBALL");
  assert.equal(watchType(ex.exerciseType), "AmericanFootball");
  assert.equal(watchType("BASKETBALL"), "Basketball");
  assert.equal(typeName("Basketball"), "Basketbal");
  assert.equal(watchType("SOCIAL_DANCE"), "Dance");
  assert.equal(intervalsTypeOf("Basketball"), "Workout");
  assert.equal(intervalsTypeOf("Tennis"), "Tennis");
  const body = intervalsActivity(1, { key: "k", sport: "", type: "Boxing", name: "Box", startLocal: "2026-10-23T10:00:00", minutes: 60 });
  assert.equal(body.type, "Workout");
  assert.equal(body.name, "Box");
});
