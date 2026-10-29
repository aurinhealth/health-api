import test from "node:test";
import assert from "node:assert/strict";
import { PHOTO_IDS, exercisePhotos } from "../src/exercise-photos.js";
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

test("removed exercises have no photos but keep their video", () => {
  for (const name of REMOVED) {
    assert.equal(PHOTO_IDS[name], undefined, name);
    const t = techniqueFor(name);
    assert.deepEqual(t.photos, [], name);
    assert.match(t.video?.id || "", /^[A-Za-z0-9_-]{11}$/, name + " video");
  }
});
