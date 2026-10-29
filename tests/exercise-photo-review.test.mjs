import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_IDS, REPDB_IDS, exercisePhotos } from "../src/exercise-photos.js";
import { EXERCISES } from "../src/strength-generator.js";
import { techniqueFor } from "../src/exercise-technique.js";

// Photo review of 28 Oct 2026: wrong photos swapped or removed.
const SWAPPED = {
  "Abs bench crunch": "Ab_Crunch_Machine", "Dumbbell Windmill": "Kettlebell_Windmill", "Barbell Split Squat": "Barbell_Lunge",
  "Band Pull-Through": "Pull_Through", "DB rear delt fly": "Dumbbell_Lying_Rear_Lateral_Raise",
  "Cable lateral raise": "Standing_Low-Pulley_Deltoid_Raise", "Incline Machine Chest Press": "Leverage_Incline_Chest_Press",
  "Decline Machine Chest Press": "Leverage_Decline_Chest_Press", "Glute bridge": "Butt_Lift_Bridge", "Box step-up": "Dumbbell_Step_Ups",
  "Medicine ball slam": "Overhead_Slam", "Single-Arm Cable Fly": "Single-Arm_Cable_Crossover",
};
const REMOVED = ["Dumbbell Goblet Split Squat", "Dumbbell Deadlift", "Cable triceps kickback", "Dumbbell Push Press", "Dumbbell Overhead Squat",
  "Kettlebell Clean & Press (Double)", "Smith machine hip thrust", "Bodyweight Box Squat", "Eccentric Calf Lowers",
  "DB single-leg Romanian deadlift", "Single-Leg Press", "Single-leg calf raise", "Cable Standing Single Arm Chest Press"];

test("swapped exercises show the new Free Exercise DB photos", () => {
  for (const [name, id] of Object.entries(SWAPPED)) {
    assert.equal(PHOTO_IDS[name], id, name);
    assert.deepEqual(exercisePhotos(name), [0, 1].map(i => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${id}/${i}.jpg`), name);
  }
});

test("removed exercises have no Free Exercise DB photos but keep their video", () => {
  for (const name of REMOVED) {
    assert.equal(PHOTO_IDS[name], undefined, name);
    const t = techniqueFor(name);
    assert.ok(t.photos.every(url => !url.includes("free-exercise-db")), name);
    if (!REPDB_IDS[name]) assert.deepEqual(t.photos, [], name);
    assert.match(t.video?.id || "", /^[A-Za-z0-9_-]{11}$/, name + " video");
  }
});

// RepDB free tier, 29 Oct 2026: drawings only where Free Exercise DB has none.
test("exercises without a Free Exercise DB photo show RepDB drawings, square", () => {
  for (const [name, id] of Object.entries(REPDB_IDS)) {
    assert.ok(EXERCISES[name], name + " is a catalog exercise");
    assert.equal(PHOTO_IDS[name], undefined, name + " already has a photo");
    const slug = id.replace(/~$/, ""), ends = id.endsWith("~") ? ["peak", "start"] : ["start", "peak"];
    const t = techniqueFor(name);
    assert.deepEqual(t.photos, ends.map(end => `https://raw.githubusercontent.com/RepDB/exercise-dataset/main/images/flat/${slug}-${end}.webp`), name);
    assert.equal(t.photoAspect, 1, name);
  }
  // A Romanian deadlift starts standing; RepDB stores the hinge first.
  assert.match(exercisePhotos("DB single-leg Romanian deadlift")[0], /single-leg-romanian-deadlift-peak\.webp$/);
  assert.equal(techniqueFor("Low row").photoAspect, 1.5);
});
