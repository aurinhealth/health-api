import test from "node:test";
import assert from "node:assert/strict";

import { isIntensity } from "../src/strength-context.js";
import { normalizeExerciseName } from "../src/strength-normalization.js";
import { parseStrengthPlan } from "../src/strength-history.js";
import { estimateStartingLoad } from "../src/strength-intelligence.js";
import { EXERCISES, FOCUS_GROUPS, generateStrengthPlan, validateFocusMuscles, painfulExercises, normalizeGymFocus } from "../src/strength-generator.js";

test('focused gym validates the selected groups', () => {
  assert.deepEqual(validateFocusMuscles(['chest', 'upper_back']), ['chest', 'upper_back']);
  assert.equal(validateFocusMuscles([]), null);
  assert.equal(validateFocusMuscles(['chest', 'chest']), null);
  assert.equal(validateFocusMuscles(['unknown']), null);
  assert.equal(validateFocusMuscles(['chest', 'upper_back', 'front_delts', 'biceps', 'triceps', 'abs']), null);
});

test('focused gym only generates exercises for selected groups', () => {
  const context={date:'2026-09-28',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],nextRide:null},recovery:{},strength:{recentCompletedSets:[]}};
  const plan=generateStrengthPlan(context,{focusMuscles:['chest','upper_back','abs'],durationMinutes:60});
  const work=[...new Set(plan.rows.filter(row=>row[0]==='WORK').map(row=>row[1]))];
  // The hour is filled from the chosen groups only, more than one exercise each.
  assert.ok(work.length>3&&work.length<=6,String(work.length));
  for(const group of ['chest','upper_back','abs'])assert.ok(work.some(name=>FOCUS_GROUPS[group].exercises.includes(name)),group);
  assert.deepEqual(plan.focusMuscles,['chest','upper_back','abs']);
  assert.equal(plan.adaptive.volumeModifier,.9);
  for(const exercise of work)assert.ok(['chest','upper_back','abs'].some(group=>FOCUS_GROUPS[group].exercises.includes(EXERCISES[exercise].variantOf??exercise)),exercise);
  assert.ok(plan.planName.includes('Cílený trénink'));
});

test('short focused gym scales volume without adding unselected muscles', () => {
  const context={date:'2026-09-28',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],nextRide:null},recovery:{},strength:{recentCompletedSets:[]}};
  const plan=generateStrengthPlan(context,{focusMuscles:['front_delts','biceps','triceps','calves','abs'],durationMinutes:45});
  assert.equal(plan.adaptive.volumeModifier,.75);
  assert.equal([...new Set(plan.rows.filter(row=>row[0]==='WORK').map(row=>row[1]))].length,5);
  assert.ok(plan.rows.filter(row=>row[0]==='WORK').length<=10);
});

test('front, side and rear shoulders map to distinct exercises', () => {
  const context={date:'2026-09-28',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],nextRide:null},recovery:{},strength:{recentCompletedSets:[]}};
  const plan=generateStrengthPlan(context,{focusMuscles:['front_delts','side_delts','rear_delts']});
  const exercises=[...new Set(plan.rows.filter(row=>row[0]==='WORK').map(row=>row[1]))];
  assert.ok(exercises.length>=3);
  for(const group of ['front_delts','side_delts','rear_delts'])assert.ok(exercises.some(name=>FOCUS_GROUPS[group].exercises.includes(name)));
});

test('a long focused session gets several exercises per group, only from those groups', () => {
  const context={date:'2026-09-28',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],nextRide:null},recovery:{},strength:{recentCompletedSets:[]}};
  const plan=generateStrengthPlan(context,{focusMuscles:['hips','biceps','rear_delts'],durationMinutes:95});
  const work=[...new Set(plan.rows.filter(row=>row[0]==='WORK').map(row=>row[1]))];
  assert.ok(work.length>=6,String(work.length));
  for(const name of work)assert.ok(['hips','biceps','rear_delts'].some(group=>FOCUS_GROUPS[group].exercises.includes(name)),name);
  for(const group of ['hips','biceps','rear_delts'])assert.ok(work.filter(name=>FOCUS_GROUPS[group].exercises.includes(name)).length>=2,group);
});

test('focused legs preserve cycling protection', () => {
  const context={date:'2026-09-28',cycling:{recentRideTss:800,recentRideHours:10,recentActivities:[],nextRide:{intensity:true,durationHours:2}},recovery:{},strength:{recentCompletedSets:[]}};
  const plan=generateStrengthPlan(context,{focusMuscles:['quads']});
  assert.equal(plan.protectedLegs,true);
  assert.deepEqual([...new Set(plan.rows.filter(row=>row[0]==='WORK').map(row=>row[1]))],['Leg extension Prime']);
  assert.match(plan.rationale,/u nich držet rezervu/);
});
import { strengthPlanToIntervalsEvent } from "../src/intervals-strength.js";
import { buildNutritionPlan } from "../src/nutrition-intelligence.js";

test("endurance ride is not marked intense because description contains interval", () => {
  assert.equal(
    isIntensity({
      name: "Endurance – Aerobic Base",
      type: "Ride",
      description: "structured workout; intensity=interval; 4x3 min cadence work"
    }),
    false
  );
});

test("semantic threshold workout is marked intense", () => {
  assert.equal(isIntensity({ name: "Threshold 3×15 min", type: "Ride" }), true);
});

test("explicit boolean intensity wins", () => {
  assert.equal(isIntensity({ name: "Endurance Ride", intensity: false, description: "interval" }), false);
  assert.equal(isIntensity({ name: "Recovery Ride", intensity: true }), true);
});

test("exercise aliases normalize to one canonical name", () => {
  assert.equal(normalizeExerciseName("Prime flat chest press"), "Chest flat press Prime");
  assert.equal(normalizeExerciseName("Leg Curl"), "Prone leg curl Prime");
  assert.equal(normalizeExerciseName("Leg extensions"), "Leg extension Prime");
  assert.equal(normalizeExerciseName("Stahovani triceps"), "Cable triceps extension");
});

test("sheet parser canonicalizes historical exercise names", () => {
  const values = [
    ["Datum", "2026-09-22"],
    ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"],
    ["WORK", "Prime flat chest press", "1", "40", "8–12", "40", "10", "7", "TRUE", "", ""]
  ];
  const parsed = parseStrengthPlan(values);
  assert.equal(parsed.rows[0].exercise, "Chest flat press Prime");
});

test("load estimator uses alias history as own history", () => {
  const estimate = estimateStartingLoad({
    exercise: "Prime flat chest press",
    history: [{
      workout_date: "2026-09-20",
      type: "WORK",
      exercise: "Prime flat chest press",
      actual_kg: 40,
      actual_reps: 10,
      rpe: 7,
      completed: 1,
      set_no: 1
    }],
    targetReps: "8–12",
    fallbackKg: 42.5,
    loadFactor: 1
  });
  assert.equal(estimate.source, "own-history");
  assert.equal(estimate.referenceExercise, "Chest flat press Prime");
});

test("load estimator uses multiple recent performances", () => {
  const estimate = estimateStartingLoad({
    exercise: "Prime flat chest press",
    history: [
      { workout_date: "2026-09-22", type: "WORK", exercise: "Prime flat chest press", actual_kg: 42.5, actual_reps: 10, rpe: 8, completed: 1, set_no: 1 },
      { workout_date: "2026-09-15", type: "WORK", exercise: "Prime flat chest press", actual_kg: 35, actual_reps: 11, rpe: 7.5, completed: 1, set_no: 1 },
      { workout_date: "2026-09-08", type: "WORK", exercise: "Prime flat chest press", actual_kg: 35, actual_reps: 9, rpe: 8, completed: 1, set_no: 1 }
    ],
    targetReps: "8–12",
    fallbackKg: 35,
    loadFactor: 1
  });
  // The latest session decides: 42.5 kg × 10 at RPE 8 stays at 42.5 kg
  // (older, lighter sessions no longer pull it back to 37.5 kg).
  assert.equal(estimate.source, "own-history");
  assert.equal(estimate.performanceCount, 3);
  assert.equal(estimate.kg, 42.5);
  assert.equal(estimate.progression, "hold");
});

test("a one-arm cable exercise starts at half the two-arm weight", () => {
  // 2026-10-23: 35 kg on the two-arm cable extension, yet 5 kg planned for the one-arm pushdown.
  const two = (kg, reps) => ({ workout_date: "2026-10-17", type: "WORK", exercise: "Cable triceps extension", actual_kg: kg, actual_reps: reps, completed: 1, set_no: 1 });
  const estimate = estimateStartingLoad({ exercise: "Cable Single Arm Rope Pushdown", history: [two(35, 12), two(35, 9)], targetReps: "8–12", fallbackKg: 6, today: "2026-10-23" });
  assert.equal(estimate.source, "cross-exercise-estimate");
  assert.equal(estimate.kg, 17.5);
  // A one-leg machine still doesn't take its weight from the two-leg one.
  const press = estimateStartingLoad({ exercise: "Single-Leg Press", history: [{ workout_date: "2026-10-17", type: "WORK", exercise: "Pivot leg press", actual_kg: 150, actual_reps: 10, completed: 1, set_no: 1 }], targetReps: "8–12", fallbackKg: 40, today: "2026-10-23" });
  assert.notEqual(press.source, "cross-exercise-estimate");
});

test("double progression adds at least one real load step and takes one back after a miss", () => {
  const set = (kg, reps, rpe, date = "2026-09-22") => ({ workout_date: date, type: "WORK", exercise: "DB bench press", actual_kg: kg, actual_reps: reps, rpe, completed: 1, set_no: 1 });
  const estimate = history => estimateStartingLoad({ exercise: "DB bench press", history, targetReps: "6–10", fallbackKg: 16, today: "2026-09-25" });
  // Top of the range on every set: 20 kg × 1.025 used to round back to 20 kg.
  assert.equal(estimate([set(20, 10, 8), set(20, 10, 8.5)]).kg, 22.5);
  assert.equal(estimate([set(20, 10, 8), set(20, 10, 8.5)]).progression, "increase");
  // Easy and within range: also up.
  assert.equal(estimate([set(20, 8, 6.5), set(20, 8, 7)]).kg, 22.5);
  // In range, hard: hold and aim for a rep more.
  const hold = estimate([set(20, 8, 8), set(20, 7, 9)]);
  assert.equal(hold.kg, 20); assert.equal(hold.progression, "hold");
  // Missed the range: one step back.
  assert.equal(estimate([set(20, 4, 9.5)]).kg, 17.5);
  // Without RPE, reps alone decide.
  assert.equal(estimate([set(20, 10, null), set(20, 10, null)]).kg, 22.5);
  // A heavy machine moves by a larger step.
  const press = estimateStartingLoad({ exercise: "Pivot leg press", history: [{ workout_date: "2026-09-22", type: "WORK", exercise: "Pivot leg press", actual_kg: 160, actual_reps: 10, rpe: 6, completed: 1, set_no: 1 }], targetReps: "6–10", today: "2026-09-25" });
  assert.equal(press.kg, 167.5);
  // Poor recovery keeps the load; a long break starts lighter.
  assert.equal(estimateStartingLoad({ exercise: "DB bench press", history: [set(20, 10, 8)], targetReps: "6–10", loadFactor: .85, today: "2026-09-25" }).kg, 20);
  assert.equal(estimateStartingLoad({ exercise: "DB bench press", history: [set(20, 10, 8, "2026-08-20")], targetReps: "6–10", today: "2026-09-25" }).kg, 17.5);
});

test("the plan says what each load is based on", () => {
  const plan = generateStrengthPlan({
    date: "2026-09-25", cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {},
    strength: { recentCompletedSets: [1, 2, 3].map(n => ({ workout_date: "2026-09-21", exercise: "DB bench press", type: "WORK", completed: 1, actual_kg: 20, actual_reps: 10, rpe: 8, set_no: n })) }
  }, { focusMuscles: ["chest"], durationMinutes: 45, excludeExercises: ["Chest flat press Prime", "Barbell bench press", "DB incline press", "Pec deck", "Cable fly", "Low-to-high cable fly", "Smith machine incline press", "Smith Machine Bench Press", "Cable Bench Chest Fly", "Cable Bench Press", "Cable Chest Press", "Cable Decline Bench Press", "Cable High-to-Low Fly", "Cable Incline Bench Press", "Cable Standing Single Arm Chest Press", "Single-Arm Cable Fly", "Decline Machine Chest Press", "Incline Machine Chest Press", "Dumbbell Chest Fly", "Dumbbell Incline Chest Fly", "Dumbbell Neutral High Incline Bench Press", "Neutral-Grip Dumbbell Bench Press", "One Arm Dumbbell Bench Press", "Dumbbell Decline Bench Press", "Barbell Floor Press", "Reverse-Grip Barbell Bench Press", "Wide-Grip Barbell Bench Press", "Barbell High Incline Bench Press", "Decline Barbell Bench Press"] });
  const work = plan.rows.filter(r => r[0] === "WORK");
  assert.equal(work[0][1], "DB bench press"); assert.equal(work[0][3], "22,5");
  assert.match(work[0][9], /↑ minule 3× 10 op\. @ 20 kg, RPE 8 → \+2,5 kg/);
});

test("generator treats aliased recent leg curl as the same exercise", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-22",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      nextRide: null
    },
    recovery: {},
    strength: {
      recentCompletedSets: [{
        workout_date: "2026-09-21",
        exercise: "Leg Curl",
        type: "WORK",
        completed: 1,
        actual_kg: 40,
        actual_reps: 12,
        rpe: 7,
        set_no: 1
      }]
    }
  }, { focus: "lower", maxExercises: 4 });
  assert.ok(!plan.rows.some(row => row[0] === "WORK" && row[1] === "Prone leg curl Prime"));
});

test("generator reduces leg dose while retaining strength work around hard rides", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 8,
      recentRideTss: 700,
      recentActivities: [
        { name: "Threshold", type: "Ride", tss: 100 },
        { name: "Endurance", type: "Ride", tss: 80 }
      ],
      plannedWorkouts: [
        { name: "Endurance", type: "Ride", durationHours: 1.5 },
        { name: "Threshold 3x15", type: "Ride", durationHours: 1.5 },
        { name: "VO2 intervals", type: "Ride", durationHours: 1.25 }
      ],
      nextRide: { name: "Endurance", type: "Ride", durationHours: 1.5 }
    },
    recovery: {},
    strength: { recentCompletedSets: [] }
  }, { maxExercises: 5 });
  assert.equal(plan.protectedLegs, true);
  assert.equal(plan.planName, "Full Body · s rezervou");
  assert.ok(plan.rows.length > 0);
  const legs=plan.loadEstimates.filter(x => ["Pivot leg press", "Pendulum squat", "Prone leg curl Prime", "Hip thrust", "DB Romanian deadlift", "DB Bulgarian split squat", "Leg extension Prime"].includes(x.exercise));
  assert.ok(legs.length>=2);assert.ok(legs.every(x=>x.reducedDose&&x.sets<=2));
  assert.ok(plan.rows.filter(r=>r[0]==='WORK'&&legs.some(x=>x.exercise===r[1])).every(r=>/3–4 opakování v rezervě/.test(r[9])));
});

test("lower-body plan includes a unilateral movement when fresh", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      plannedWorkouts: [],
      nextRide: null
    },
    recovery: {},
    strength: { recentCompletedSets: [] }
  }, { focus: "lower", maxExercises: 4 });
  assert.ok(plan.rows.some(row => row[0] === "WORK" && (EXERCISES[row[1]].variantOf ?? row[1]) === "DB Bulgarian split squat"));
});

test("generated plan survives sheet serialization round-trip", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      plannedWorkouts: [],
      nextRide: null
    },
    recovery: {},
    strength: { recentCompletedSets: [] }
  }, { focus: "upper", maxExercises: 5 });
  const values = [
    ["Datum", plan.date],
    ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"],
    ...plan.rows.map(row => row.slice(0, 11))
  ];
  const parsed = parseStrengthPlan(values);
  const workRows = plan.rows.filter(row => row[0] === "WORK");
  assert.equal(parsed.date, plan.date);
  assert.equal(parsed.rows.filter(row => row.type === "WORK").length, workRows.length);
  assert.deepEqual(
    parsed.rows.filter(row => row.type === "WORK").map(row => row.exercise),
    workRows.map(row => row[1])
  );
});


test("generator prefers muscles without completed work in the last 7 days", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      plannedWorkouts: [],
      nextRide: null
    },
    recovery: {},
    strength: {
      recentCompletedSets: [
        { workout_date: "2026-09-21", exercise: "Chest flat press Prime", type: "WORK", completed: 1, actual_kg: 40, actual_reps: 10, rpe: 7, set_no: 1 },
        { workout_date: "2026-09-21", exercise: "Standing rowing machine", type: "WORK", completed: 1, actual_kg: 40, actual_reps: 10, rpe: 7, set_no: 1 },
        { workout_date: "2026-09-21", exercise: "DB shoulder press", type: "WORK", completed: 1, actual_kg: 10, actual_reps: 8, rpe: 7, set_no: 1 },
        { workout_date: "2026-09-21", exercise: "DB curl", type: "WORK", completed: 1, actual_kg: 10, actual_reps: 10, rpe: 7, set_no: 1 },
        { workout_date: "2026-09-21", exercise: "Cable triceps extension", type: "WORK", completed: 1, actual_kg: 30, actual_reps: 10, rpe: 7, set_no: 1 }
      ]
    }
  }, { focus: "upper", maxExercises: 5 });
  const work = plan.rows.filter(row => row[0] === "WORK").map(row => row[1]);
  assert.ok(!work.includes("Chest flat press Prime"));
  assert.ok(!work.includes("Standing rowing machine"));
  assert.ok(!work.includes("DB shoulder press"));
  assert.ok(!work.includes("DB curl"));
  assert.ok(!work.includes("Cable triceps extension"));
});

test("generator uses semantic cycling intensity, not workout description keywords", () => {
  const plan = generateStrengthPlan({
    status: "ok",
    date: "2026-09-23",
    cycling: {
      recentRideHours: 2,
      recentRideTss: 100,
      recentActivities: [],
      plannedWorkouts: [],
      nextRide: {
        name: "Endurance",
        type: "Ride",
        intensity: false,
        description: "structured workout; intensity=interval; cadence drills"
      }
    },
    recovery: {},
    strength: { recentCompletedSets: [] }
  }, { maxExercises: 5 });
  assert.equal(plan.protectedLegs, false);
});


test("strength plan is converted to an Intervals WeightTraining event with set details", () => {
  const event = strengthPlanToIntervalsEvent({
    date: "2026-09-24",
    planName: "Upper Body",
    rationale: "Protect legs for cycling",
    rows: [
      ["WARMUP", "Chest flat press Prime", "1", "17.5", "8", "", "", "", "FALSE", "[WARMUP]", ""],
      ["WORK", "Chest flat press Prime", "1", "42.5", "8–12", "", "", "", "FALSE", "", ""],
      ["WORK", "Chest flat press Prime", "2", "42.5", "8–12", "", "", "", "FALSE", "", ""],
      ["WORK", "Hammer curl", "1", "10", "8–15", "", "", "", "FALSE", "", ""]
    ]
  });
  assert.equal(event.type, "WeightTraining");
  assert.equal(event.category, "WORKOUT");
  assert.equal(event.start_date_local, "2026-09-24T00:00:00");
  // One line per exercise; paragraphs and lists separated by blank lines so
  // Intervals.icu does not run them together.
  assert.match(event.description, /^Proč tenhle trénink: Protect legs for cycling\n\nRozcvička:\n\n- Chest flat press Prime: 17,5 kg × 8\n\nPracovní série:\n\n/);
  assert.match(event.description, /1\. Chest flat press Prime: 2 × 8–12 @ 42,5 kg\n2\. Hammer curl: 1 × 8–15 @ 10 kg/);
  assert.doesNotMatch(event.description, /kcal/);
  assert.equal(event.calories, undefined);
  // No calories go to Intervals.icu, even with the athlete's weight.
  const withWeight = strengthPlanToIntervalsEvent({ date: "2026-09-24", rows: [] }, { weightKg: 80, durationMinutes: 60 });
  assert.doesNotMatch(withWeight.description, /kcal/);
  assert.equal(withWeight.calories, undefined);
});

test("nutrition plan increases daily target when a strength plan is present", () => {
  const context = {
    date: "2026-09-24",
    cycling: {
      plannedWorkouts: [],
      recentActivities: [],
      recentRideHours: 0,
      recentRideTss: 0
    }
  };
  const base = buildNutritionPlan(context);
  const withGym = buildNutritionPlan(context, {
    strengthPlan: {
      rows: [
        ["WORK", "Chest flat press Prime", "1", "42.5", "8–12"],
        ["WORK", "Chest flat press Prime", "2", "42.5", "8–12"],
        ["WORK", "Standing rowing machine", "1", "40", "8–12"],
        ["WORK", "Standing rowing machine", "2", "40", "8–12"]
      ]
    }
  });
  assert.ok(withGym.training.strengthMinutes > 0);
  assert.ok(withGym.training.strengthCalories > 0);
  assert.ok(withGym.calorieTarget >= base.calorieTarget);
  assert.equal(withGym.macros.proteinGrams, 176);
});


test("adaptive strength volume reduces sets under low readiness", async () => {
  const { generateStrengthPlan } = await import("../src/strength-generator.js");
  const context={
    date:"2026-09-23",
    cycling:{recentRideTss:800,recentRideHours:10,recentActivities:[{intensity:true,tss:180}],nextRide:{intensity:true,durationHours:2}},
    recovery:{sleep_duration:[{sampleTime:"2026-09-23T06:00:00",value:330}]},
    strength:{recentCompletedSets:[]},
    adaptive:{strengthVolumeModifier:0.75,recovery:{score:60},legReadiness:55}
  };
  const plan=generateStrengthPlan(context,{focus:"upper",maxExercises:3});
  const work=plan.rows.filter(r=>r[0]==="WORK");
  assert.ok(work.length<=9);
  assert.equal(plan.adaptive.volumeModifier,0.75);
});

test("after four solid weeks the fifth is a deload week, then training goes on", async () => {
  const { strengthDeload } = await import("../src/strength-generator.js");
  // Mondays and Thursdays, 15 work sets each, for the weeks before 2026-10-05.
  const session = (date, sets = 15, note = "") => Array.from({ length: sets }, (_, i) => ({ workout_date: date, exercise: "DB bench press", type: "WORK", completed: 1, set_no: i + 1, actual_kg: 20, actual_reps: 10, rpe: 8, note }));
  const weeks = (n, sets = [15, 15, 15, 15]) => Array.from({ length: n }, (_, k) => { const mon = new Date(Date.parse("2026-09-28T12:00:00Z") - k * 7 * 86400000), thu = new Date(mon.getTime() + 3 * 86400000); return [...session(mon.toISOString().slice(0, 10), sets[k]), ...session(thu.toISOString().slice(0, 10), sets[k])]; }).flat();
  assert.ok(strengthDeload(weeks(4), "2026-10-05"));
  assert.equal(strengthDeload(weeks(3), "2026-10-05"), null);
  // A lighter week among the four (the last deload) resets the count.
  assert.equal(strengthDeload(weeks(4, [15, 15, 10, 15]), "2026-10-05"), null);
  assert.equal(strengthDeload([...weeks(4), ...session("2026-09-29", 1, "Hlavní tlak; odlehčený týden: stejná váha")], "2026-10-05"), null);
  // One session a week is not a solid week.
  assert.equal(strengthDeload(weeks(4).filter(r => new Date(r.workout_date + "T12:00:00Z").getUTCDay() === 1), "2026-10-05"), null);
  const plan = generateStrengthPlan({ date: "2026-10-05", cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: weeks(4) } }, { durationMinutes: 60 });
  assert.match(plan.planName, /odlehčený týden/);
  assert.ok(plan.loadEstimates.every(x => x.sets <= 2));
  const bench = plan.loadEstimates.find(x => x.exercise === "DB bench press");
  if (bench) assert.equal(bench.kg, 20);
  assert.ok(plan.rows.every(r => r[11] !== "TRUE"));
});

test("the gym deloads in the shared recovery week; its own four-week count is only a fallback", async () => {
  const session = (date) => Array.from({ length: 15 }, (_, i) => ({ workout_date: date, exercise: "DB bench press", type: "WORK", completed: 1, set_no: i + 1, actual_kg: 20, actual_reps: 10, rpe: 8 }));
  const solid = ["2026-09-07", "2026-09-10", "2026-09-14", "2026-09-17", "2026-09-21", "2026-09-24", "2026-09-28", "2026-10-01"].flatMap(session);
  const base = { date: "2026-10-05", cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: [] } };
  const shared = generateStrengthPlan({ ...base, recoveryWeek: { recovery: true, reason: "three_weeks", known: true } }, { durationMinutes: 60 });
  assert.match(shared.planName, /odlehčený týden/);
  assert.match(shared.rationale, /Regenerační týden pro celý trénink \(po třech týdnech/);
  // Known loads and no recovery week: four solid gym weeks do not deload on their own.
  const normal = generateStrengthPlan({ ...base, strength: { recentCompletedSets: solid }, recoveryWeek: { recovery: false, known: true } }, { durationMinutes: 60 });
  assert.doesNotMatch(normal.planName, /odlehčený/);
  const fallback = generateStrengthPlan({ ...base, strength: { recentCompletedSets: solid } }, { durationMinutes: 60 });
  assert.match(fallback.planName, /odlehčený týden/);
});

test("an exercise three sessions without progress makes way for another variant, with the reason", async () => {
  const { stalledExercises } = await import("../src/strength-generator.js");
  const session = (date, reps = 8) => [1, 2, 3].map(n => ({ workout_date: date, exercise: "DB bench press", type: "WORK", completed: 1, actual_kg: 20, actual_reps: reps, rpe: 8, set_no: n }));
  const stuck = [...session("2026-09-18"), ...session("2026-09-14"), ...session("2026-09-10")];
  assert.deepEqual([...stalledExercises(stuck, "2026-09-25")], ["DB bench press"]);
  // One more rep last time is progress, not a stall.
  assert.equal(stalledExercises([...session("2026-09-18", 9), ...session("2026-09-14"), ...session("2026-09-10")], "2026-09-25").size, 0);
  // The machine press was done three days ago, so without the stall the bench press would be next.
  const machine = [1, 2].map(n => ({ workout_date: "2026-09-22", exercise: "Chest flat press Prime", type: "WORK", completed: 1, actual_kg: 40, actual_reps: 10, rpe: 8, set_no: n }));
  const context = { date: "2026-09-25", cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: [...machine, ...stuck] } };
  const others = ["Barbell bench press", "DB incline press", "Pec deck", "Cable fly", "Low-to-high cable fly", "Smith machine incline press", "Smith Machine Bench Press", "Cable Bench Chest Fly", "Cable Bench Press", "Cable Chest Press", "Cable Decline Bench Press", "Cable High-to-Low Fly", "Cable Incline Bench Press", "Cable Standing Single Arm Chest Press", "Single-Arm Cable Fly", "Decline Machine Chest Press", "Incline Machine Chest Press", "Dumbbell Chest Fly", "Dumbbell Incline Chest Fly", "Dumbbell Neutral High Incline Bench Press", "Neutral-Grip Dumbbell Bench Press", "One Arm Dumbbell Bench Press", "Dumbbell Decline Bench Press", "Barbell Floor Press", "Reverse-Grip Barbell Bench Press", "Wide-Grip Barbell Bench Press", "Barbell High Incline Bench Press", "Decline Barbell Bench Press"];
  const plan = generateStrengthPlan(context, { focusMuscles: ["chest"], durationMinutes: 45, excludeExercises: others });
  const work = plan.rows.filter(r => r[0] === "WORK");
  assert.equal(work[0][1], "Chest flat press Prime");
  assert.match(work[0][9], /místo DB bench press: 3 tréninky bez posunu/);
  assert.match(plan.rationale, /Po třech trénincích bez posunu nová varianta: DB bench press → Chest flat press Prime/);
  // The only variant left: it stays, with the stall note asking for a rep more.
  const only = generateStrengthPlan(context, { focusMuscles: ["chest"], durationMinutes: 45, excludeExercises: [...others, "Chest flat press Prime"] });
  const kept = only.rows.filter(r => r[0] === "WORK");
  assert.equal(kept[0][1], "DB bench press");
  assert.match(kept[0][9], /3× bez posunu/);
  assert.doesNotMatch(only.rationale, /nová varianta/);
});

test("grip and traps take a turn among the small muscles once the others had theirs", () => {
  const recent = (exercise, date) => [1, 2, 3].map(n => ({ workout_date: date, exercise, type: "WORK", completed: 1, actual_kg: 10, actual_reps: 12, rpe: 7, set_no: n }));
  const fresh = { date: "2026-09-25", cycling: { recentRideHours: 0, recentRideTss: 0, recentActivities: [], plannedWorkouts: [], nextRide: null }, recovery: {}, strength: { recentCompletedSets: [] } };
  const small = /wrist|reverse curl|shrug|upright row/i;
  // Nothing done yet: the usual small muscles first, no grip or traps.
  assert.equal(generateStrengthPlan(fresh, { durationMinutes: 75 }).rows.some(r => small.test(r[1])), false);
  // Arms, shoulders, core and calves trained twice in the last two weeks: now grip or traps get a slot.
  const sets = ["DB curl", "Cable triceps extension", "Cable lateral raise", "Face pull", "Cable crunch", "Standing calf raise"].flatMap(ex => [...recent(ex, "2026-09-15"), ...recent(ex, "2026-09-19")]);
  const plan = generateStrengthPlan({ ...fresh, strength: { recentCompletedSets: sets } }, { durationMinutes: 75 });
  assert.ok(plan.rows.some(r => small.test(r[1])), plan.rows.map(r => r[1]).join(", "));
});

test("a variant of a lifted exercise gets a load, an unrelated new one does not", async () => {
  const { gymLoadEstimate } = await import("../src/gym-catalog.js");
  const set = (exercise, kg, reps) => ({ workout_date: "2026-10-01", type: "WORK", exercise, actual_kg: kg, actual_reps: reps, rpe: 8, completed: 1, set_no: 1 });
  const history = [set("Barbell back squat", 80, 8), set("DB bench press", 25, 8)];
  // Smith squat from the free-bar squat, a little lighter.
  assert.deepEqual(gymLoadEstimate("Smith machine squat", history), { kg: 72.5, source: "cross-exercise-estimate", reference: "Barbell back squat" });
  // A dumbbell (per hand) carries over to the barbell twice.
  assert.equal(gymLoadEstimate("Barbell bench press", history).kg, 50);
  // A leg press is not a heavier squat, and a never-trained muscle has nothing to go by.
  assert.equal(gymLoadEstimate("Pivot leg press", history), null);
  assert.equal(gymLoadEstimate("Hip thrust", history), null);
});

test('a pain the coach remembers leaves out the exercises that load it (Revize 2026-10-16, nález 24)', () => {
  const ctx=memories=>({date:'2026-09-28',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],nextRide:null},recovery:{},strength:{recentCompletedSets:[]},athleteState:{status:'active',memories}});
  const names=plan=>[...new Set(plan.rows.filter(r=>r[0]==='WORK').map(r=>r[1]))];
  const knee=names(generateStrengthPlan(ctx(['Koleno bolí při dřepech']),{focus:'lower',durationMinutes:75}));
  assert.ok(knee.length,'some lower-body work stays');
  assert.ok(!knee.some(n=>/squat|lunge|leg press|step-up|leg extension/i.test(n)),knee.join(', '));
  const back=generateStrengthPlan(ctx(['Lower back pain after deadlifts']),{focus:'lower',durationMinutes:75});
  assert.ok(!names(back).some(n=>/deadlift|good morning/i.test(n)),names(back).join(', '));
  assert.match(back.rationale,/bolest|pain/);
  const shoulder=names(generateStrengthPlan(ctx(['Bolí mě pravé rameno']),{focus:'upper',durationMinutes:75}));
  assert.ok(!shoulder.some(n=>/press|dip/i.test(n)&&!/pallof/i.test(n)),shoulder.join(', '));
  // "Už nebolí" and a memory with no pain change nothing.
  assert.equal(painfulExercises(['Koleno už nebolí','Rád dřepuji']).avoid.size,0);
  assert.ok(painfulExercises(['knee hurts']).avoid.has('Barbell back squat'));
});

test('legs spared for a key session hold the load and keep at most 2 sets (Revize 2026-10-16, nález 26)', () => {
  const set=(exercise,kg,n)=>({exercise,workout_date:'2026-09-21',type:'WORK',set_no:n,actual_kg:kg,actual_reps:8,rpe:7,completed:1});
  const legMuscles=new Set(['quads','hamstrings','glutes','adductors','abductors','calves']);
  const history=[1,2,3].flatMap(n=>[set('Prone leg curl Prime',40,n),set('Barbell hip thrust',80,n)]);
  const ctx={date:'2026-09-28',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],nextRide:null},recovery:{},strength:{recentCompletedSets:history},trainingSetup:{goal:'strength',experience:'experienced'}};
  for(const [keep,kg] of [['Prone leg curl Prime','40'],['Barbell hip thrust','80']]){
    const plan=generateStrengthPlan(ctx,{durationMinutes:90,focus:'upper',focusSource:'week',excludeExercises:Object.keys(EXERCISES).filter(n=>legMuscles.has(EXERCISES[n].muscle)&&n!==keep)});
    const work=plan.rows.filter(r=>r[0]==='WORK'&&r[1]===keep);
    assert.equal(plan.protectedLegs,true);
    assert.ok(work.length>=1&&work.length<=2,keep+': '+work.length+' sets');
    for(const r of work)assert.deepEqual([r[3],r[4]],[kg,'8–12'],keep);
    assert.doesNotMatch(work[0][9],/↑|\+2,5 kg/,keep);
  }
});

test('a swap\'s warm-ups follow the equipment step and the focus understands "legs" (Revize 2026-10-16, nález 28)', async () => {
  const { prepareGymSwap } = await import('../src/coach-gym-adjustment.js');
  const { planValues } = await import('../src/gym-plan-store.js');
  const date='2026-10-04',row=['WORK','Goblet squat','1','20','8–12','','','','FALSE','Pozn','','FALSE',''];
  const gym={values:planValues({date,rows:[row]}),history:[{exercise:'Barbell back squat',workout_date:'2026-09-30',type:'WORK',set_no:1,actual_kg:42.5,actual_reps:6,rpe:8,completed:1}]};
  // 40 % of 42,5 kg on a bar is 17,5 kg, not 17.
  assert.deepEqual(prepareGymSwap(gym,'Goblet squat','Barbell back squat','x').replacementRows.map(r=>r[0]+' '+r[3]),['WARMUP 17.5','WARMUP 27.5','WARMUP 35','WORK 42.5']);
  assert.equal(normalizeGymFocus('legs'),'lower');
  assert.equal(normalizeGymFocus('Upper body'),'upper');
  assert.equal(normalizeGymFocus('Nohy'),'lower');
  assert.equal(normalizeGymFocus('full_body'),undefined);
  assert.equal(normalizeGymFocus(undefined),undefined);
  assert.throws(()=>normalizeGymFocus('brain'),/zaměření|focus/);
  const context={date:'2026-09-28',cycling:{recentRideTss:100,recentRideHours:2,recentActivities:[],nextRide:null},recovery:{},strength:{recentCompletedSets:[]}};
  assert.equal(generateStrengthPlan(context,{focus:'legs',durationMinutes:60}).planName,'Lower Body');
  assert.throws(()=>generateStrengthPlan(context,{focus:'brain',durationMinutes:60}),/zaměření|focus/);
});

test('the classic hyperextension is called so, trains the lower back and keeps the old Roman chair history', () => {
  assert.equal(normalizeExerciseName('Roman chair'), 'Hyperextension');
  assert.equal(EXERCISES['Roman chair'], undefined);
  assert.equal(EXERCISES.Hyperextension.muscle, 'lower_back');
  assert.ok(FOCUS_GROUPS.lower_back.exercises.includes('Hyperextension'));
  // A core slot after a week of crunches: the hyperextension of the gym, not supermans on the floor.
  const crunches = ['2026-10-21', '2026-10-24'].flatMap(workout_date => ['Abs bench crunch', 'Cable crunch', 'Pallof press'].map(exercise => ({ exercise, workout_date, type: 'WORK', reps: 12, kg: 20 })));
  const plan = generateStrengthPlan({ date: '2026-10-28', trainingSetup: { equipment: 'gym' }, strength: { recentCompletedSets: crunches, plannedSessions: [] }, profile: {} }, { durationMinutes: 90, focus: 'lower' });
  const names = plan.rows.map(r => r[1]);
  assert.ok(names.includes('Hyperextension') || names.includes('Dumbbell Back Extension'));
  assert.ok(!names.includes('Supermans') && !names.includes('Dumbbell Superman'));
});
