import { buildAdaptiveDecision } from "./adaptive-engine.js";
import { trainingStatus } from './training-status.js';

export function buildDailyPlan({context, nutrition, food, recommendations}) {
  const policy=trainingStatus(context?.athleteState);
  const adaptive = context?.adaptive || buildAdaptiveDecision(context,{...food,nutritionTarget:nutrition});
  const ride = policy.paused?null:context?.cycling?.nextRide || null;
  const strength = policy.paused?null:context?.strength?.plannedWorkout || null;
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
      athleteState:policy.status,paused:policy.paused,statusNote:policy.note,
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
    recommendations: [...policy.guidance,...(recommendations?.suggestions || (policy.paused?[]:adaptive.recommendations) || [])]
  };
}
