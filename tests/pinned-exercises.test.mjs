import test from "node:test";
import assert from "node:assert/strict";
import { parsePinned, pinnedExercises, savePinnedExercises } from "../src/pinned-exercises.js";
import { strengthRecords, recordTrends } from "../src/fitness-insights.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";

test("pinned exercises are a list of at most five names", () => {
  assert.deepEqual(parsePinned({ pinned: ["Lat pulldown", "Lat pulldown", " "] }), ["Lat pulldown"]);
  assert.deepEqual(parsePinned({ pinned: [] }), []);
  assert.throws(() => parsePinned({}));
  assert.throws(() => parsePinned({ pinned: ["a", "b", "c", "d", "e", "f"] }), /5/);
});

test("pins are stored per user in their order and replaced as a whole", async () => {
  const raw = createD1(), db = scopedDb(raw, 3), other = scopedDb(raw, 4);
  assert.deepEqual(await pinnedExercises(db), [], "nothing before the first pin");
  await savePinnedExercises(db, { pinned: ["Lat pulldown", "DB curl"] });
  assert.deepEqual(await pinnedExercises(db), ["Lat pulldown", "DB curl"]);
  assert.deepEqual(await pinnedExercises(other), []);
  await savePinnedExercises(db, { pinned: ["DB curl"] });
  assert.deepEqual(await pinnedExercises(db), ["DB curl"]);
  assert.ok(PERSONAL_TABLES.pinned_exercises, "deleted and exported with the account");
});

test("strength records carry the last training day; ride trends carry time and power", () => {
  const sets = [
    { workout_date: "2026-09-01", exercise: "Lat pulldown", actual_kg: 60, actual_reps: 8 },
    { workout_date: "2026-09-20", exercise: "Lat pulldown", actual_kg: 55, actual_reps: 10 },
    { workout_date: "2026-09-10", exercise: "Pull-up", actual_kg: 0, actual_reps: 12 }
  ];
  const records = strengthRecords(sets, "2026-10-01");
  assert.equal(records.find(r => r.exercise === "Lat pulldown").last, "2026-09-20");
  assert.equal(records.find(r => r.exercise === "Pull-up").last, "2026-09-10");
  const t = recordTrends({ today: "2026-10-01", activities: [{ type: "Ride", date: "2026-09-15", distance: 80000, moving_time: 9000, icu_weighted_avg_watts: 230 }] });
  assert.equal(t.cardio.longestRideTime.change.all.value, 150);
  assert.equal(t.cardio.bestRidePower.change.all.value, 230);
});
