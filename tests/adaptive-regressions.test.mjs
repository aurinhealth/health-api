import test from "node:test";
import assert from "node:assert/strict";
import { buildAdaptiveDecision } from "../src/adaptive-engine.js";
import { buildNutritionPlan } from "../src/nutrition-intelligence.js";

test("adaptive decision protects legs before hard cycling", () => {
  const context={
    date:"2026-09-23",
    cycling:{
      recentRideTss:780,
      recentRideHours:10,
      recentActivities:[{intensity:true,tss:180},{intensity:true,tss:140}],
      nextRide:{intensity:true,durationHours:1.5,name:"Intervals"}
    },
    recovery:{sleep_duration:[{sampleTime:"2026-09-23T06:00:00",value:360}]}
  };
  const d=buildAdaptiveDecision(context);
  assert.equal(d.protectLegs,true);
  assert.ok(d.legReadiness<70);
  assert.ok(d.strengthVolumeModifier<1);
});

test("nutrition target adapts only after enough weight samples", () => {
  const base={date:"2026-09-23",cycling:{plannedWorkouts:[],recentActivities:[]},strength:{plannedWorkout:null}};
  const unchanged=buildNutritionPlan({...base,weightTrend:{samples:3,weeklyRateKg:0.2}},{weightKg:88});
  assert.equal(unchanged.adaptiveCalorieAdjustment,0);
  const reduced=buildNutritionPlan({...base,weightTrend:{samples:8,weeklyRateKg:0.05}},{weightKg:88});
  assert.equal(reduced.adaptiveCalorieAdjustment,-250);
});

test("nutrition target increases when weight loss is faster than range", () => {
  const base={date:"2026-09-23",cycling:{plannedWorkouts:[],recentActivities:[]},strength:{plannedWorkout:null}};
  const plan=buildNutritionPlan({...base,weightTrend:{samples:10,weeklyRateKg:-0.9}},{weightKg:88});
  assert.equal(plan.adaptiveCalorieAdjustment,225);
});
