import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyPlan } from "../src/daily-plan.js";

test("daily plan composes training, nutrition, food and meal schedule", () => {
  const out=buildDailyPlan({
    context:{date:"2026-09-23",adaptive:{recovery:{score:84},legReadiness:78,protectLegs:false},cycling:{nextRide:{name:"Endurance Z2",durationHours:2,intensity:false}},strength:{plannedWorkout:{rows:[["WORK","Chest flat press Prime","1",42.5,"10"]]}}},
    nutrition:{calorieTarget:2900,macros:{proteinGrams:176,carbsGrams:350,fatGrams:70},fueling:{plannedRide:{carbsDuringRideGrams:120}}},
    food:{totals:{eaten:{calories:900,protein_g:60},planned:{calories:700,protein_g:50}}},
    recommendations:{remaining:{calories:2000,protein_g:116},mealSchedule:[{phase:"pre_ride",timing:"1–3 h před kolem"}],suggestions:["Použij připravené jídlo."]}
  });
  assert.equal(out.status,"ok");
  assert.equal(out.training.actions.length,2);
  assert.equal(out.nutrition.calorieTarget,2900);
  assert.equal(out.food.eaten.calories,900);
  assert.equal(out.meals[0].phase,"pre_ride");
});
