import test from "node:test";
import assert from "node:assert/strict";

import { isIntensity } from "../src/strength-context.js";
import { normalizeExerciseName } from "../src/strength-normalization.js";
import { parseStrengthSheet } from "../src/strength-history.js";
import { estimateStartingLoad } from "../src/strength-intelligence.js";
import { FOCUS_GROUPS, generateStrengthPlan, validateFocusMuscles } from "../src/strength-generator.js";
import { gymFocusView } from "../src/gym-focus-view.js";

test('every focused muscle has a visual target and text choice', () => {
  const markup=gymFocusView();
  for(const id of Object.keys(FOCUS_GROUPS)){
    assert.match(markup,new RegExp('<path[^>]+data-muscle="'+id+'"'));
    assert.match(markup,new RegExp('<button[^>]+data-muscle="'+id+'"'));
  }
  assert.match(markup,/data-side="front"/);
  assert.match(markup,/data-side="back"/);
});

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
  assert.equal(work.length,3);
  assert.deepEqual(plan.focusMuscles,['chest','upper_back','abs']);
  assert.equal(plan.adaptive.volumeModifier,.9);
  for(const exercise of work)assert.ok(['chest','upper_back','abs'].some(group=>FOCUS_GROUPS[group].exercises.includes(exercise)));
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
  assert.equal(exercises.length,3);
  for(const group of ['front_delts','side_delts','rear_delts'])assert.ok(exercises.some(name=>FOCUS_GROUPS[group].exercises.includes(name)));
});

test('focused legs preserve cycling protection', () => {
  const context={date:'2026-09-28',cycling:{recentRideTss:800,recentRideHours:10,recentActivities:[],nextRide:{intensity:true,durationHours:2}},recovery:{},strength:{recentCompletedSets:[]}};
  const plan=generateStrengthPlan(context,{focusMuscles:['quads']});
  assert.equal(plan.protectedLegs,true);
  assert.deepEqual([...new Set(plan.rows.filter(row=>row[0]==='WORK').map(row=>row[1]))],['Leg extension Prime']);
  assert.match(plan.rationale,/rezervu u nohou/);
});
import { completedRowsAreSynced } from "../src/strength-sync-guard.js";
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
  const parsed = parseStrengthSheet(values);
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
  }, { focusMuscles: ["chest"], durationMinutes: 45, excludeExercises: ["Chest flat press Prime", "Barbell bench press", "DB incline press", "Pec deck", "Cable fly", "Low-to-high cable fly", "Smith machine incline press"] });
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

test("sync guard accepts blank actuals stored with planned weight", () => {
  const completed = [{
    sheetRow: 10,
    type: "WORK",
    exercise: "DB curl",
    setNo: 1,
    plannedKg: 10,
    plannedReps: "8–15",
    actualKg: null,
    actualReps: null,
    rpe: null
  }];
  const dbRows = [{
    sheet_row: 10,
    type: "WORK",
    exercise: "DB curl",
    set_no: 1,
    planned_kg: 10,
    planned_reps: "8–15",
    actual_kg: 10,
    actual_reps: null,
    rpe: null,
    completed: 1
  }];
  assert.equal(completedRowsAreSynced(completed, dbRows), true);
});

test("sync guard rejects mismatched completed row", () => {
  const completed = [{
    sheetRow: 10,
    type: "WORK",
    exercise: "DB curl",
    setNo: 1,
    plannedKg: 10,
    plannedReps: "8–15",
    actualKg: 10,
    actualReps: 12,
    rpe: 8
  }];
  const dbRows = [{
    sheet_row: 10,
    type: "WORK",
    exercise: "DB curl",
    set_no: 1,
    planned_kg: 10,
    planned_reps: "8–15",
    actual_kg: 10,
    actual_reps: 11,
    rpe: 8,
    completed: 1
  }];
  assert.equal(completedRowsAreSynced(completed, dbRows), false);
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
  assert.ok(plan.rows.some(row => row[0] === "WORK" && row[1] === "DB Bulgarian split squat"));
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
  const parsed = parseStrengthSheet(values);
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
  // With the athlete's weight the estimate is included.
  const withWeight = strengthPlanToIntervalsEvent({ date: "2026-09-24", rows: [] }, { weightKg: 80, durationMinutes: 60 });
  assert.match(withWeight.description, /Odhad výdeje: \d+ kcal · 60 min/);
  assert.ok(withWeight.calories > 0);
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


import { estimateEventCalories } from "../src/intervals-calories.js";

test("planned cycling workout gets a calorie estimate", () => {
  const kcal = estimateEventCalories({
    type: "Ride",
    moving_time: 3600,
    icu_intensity: 0.75
  }, { weightKg: 88, ftp: 260 });
  assert.ok(kcal > 0);
});

test("planned strength workout gets a calorie estimate", () => {
  const kcal = estimateEventCalories({
    type: "WeightTraining",
    moving_time: 3600
  }, { weightKg: 88 });
  assert.ok(kcal > 0);
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

test("on a phone, warm-up sets are labelled and each exercise is one block", async () => {
  const { readFileSync } = await import("node:fs");
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../src/workouts-hub-theme.js", import.meta.url), "utf8");
  // Rows carry their type and where an exercise starts and ends.
  assert.match(client, /data-type="'\+kind\+'" class="'\+\(prev\[1\]===exercise\?'':'gym-first '\)\+\(next\[1\]===exercise\?'':'gym-last'\)/);
  assert.match(theme, /tr\[data-type=WARMUP\] td:nth-child\(3\):before\{content:"rozcvička "\}/);
  assert.match(theme, /tr:not\(\.gym-first\) td:nth-child\(2\)/);
  // Workout mode counts warm-up and work sets separately.
  assert.match(client, /\(warm\(cur\)\?'Rozcvička ':'Série '\)\+k\+' z '\+same\.length/);
});
