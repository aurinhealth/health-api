import { buildAdaptiveDecision } from "./adaptive-engine.js";

export function buildDailyPlan({context, nutrition, food, recommendations}) {
  const adaptive = context?.adaptive || buildAdaptiveDecision(context,{...food,nutritionTarget:nutrition});
  const ride = context?.cycling?.nextRide || null;
  const strength = context?.strength?.plannedWorkout || null;
  const meals = recommendations?.mealSchedule || [];
  const actions = [];
  if (ride) actions.push({
    type:"cycling",
    priority: ride.intensity || Number(ride.durationHours)>=2.5 ? "high" : "normal",
    name: ride.name || "Planned ride",
    durationHours: ride.durationHours || null,
    tss: ride.tss || null,
    intensity: !!ride.intensity,
    fueling: nutrition?.fueling?.plannedRide || null
  });
  if (strength) actions.push({
    type:"strength",
    priority: adaptive.protectLegs ? "reduced" : "normal",
    plan: strength,
    volumeModifier: adaptive.strengthVolumeModifier ?? 1,
    legReadiness: adaptive.legReadiness ?? null
  });
  return {
    status:"ok",
    date: context?.date || null,
    readiness: {
      recoveryScore: adaptive.recovery?.score ?? null,
      legReadiness: adaptive.legReadiness ?? null,
      protectLegs: !!adaptive.protectLegs
    },
    training: {
      actions,
      nextRide: ride,
      strength: strength
    },
    nutrition: {
      calorieTarget: nutrition?.calorieTarget ?? null,
      macros: nutrition?.macros || null,
      fueling: nutrition?.fueling || null,
      adaptiveAdjustment: nutrition?.adaptiveCalorieAdjustment ?? 0,
      adaptiveReason: nutrition?.adaptiveCalorieReason || null
    },
    food: {
      eaten: food?.totals?.eaten || {},
      planned: food?.totals?.planned || {},
      remaining: recommendations?.remaining || {}
    },
    meals,
    recommendations: recommendations?.suggestions || adaptive.recommendations || []
  };
}
