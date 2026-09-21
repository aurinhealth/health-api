const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export const NUTRITION_DEFAULTS = {
  maintenanceCalories: 1993,
  calorieTarget: 1800,
  proteinGrams: 176,
  proteinPerKg: 2.0,
  carbPerKgEasy: 3.0,
  carbPerKgHard: 5.0,
  fatMinimumPerKg: 0.7,
  rideFuelingThresholdHours: 1.5,
  rideCarbsPerHourEasy: 60,
  rideCarbsPerHourHard: 90,
  rideFluidMlPerHour: 700
};

function activityCarbsPerHour(ride) {
  if (!ride) return 0;
  return ride.intensity ? NUTRITION_DEFAULTS.rideCarbsPerHourHard : NUTRITION_DEFAULTS.rideCarbsPerHourEasy;
}

function classifyDay(context) {
  const rides = context?.cycling?.plannedWorkouts || [];
  const next = context?.cycling?.nextRide;
  const hours = n(next?.durationHours);
  if (next && hours >= 2.5) return "long";
  if (next && (next.intensity || hours >= 1.5)) return "hard";
  if (next) return "easy";
  return rides.length ? "training" : "rest";
}

function recentActivityCalories(context) {
  return (context?.cycling?.recentActivities || []).slice(0, 3).reduce((sum, a) => sum + n(a.calories), 0);
}

export function buildNutritionPlan(context, options = {}) {
  const weightKg = n(options.weightKg, n(context?.weightKg, 88));
  const defaults = { ...NUTRITION_DEFAULTS, ...(options.defaults || {}) };
  const dayType = classifyDay(context);
  const next = context?.cycling?.nextRide || null;
  const durationHours = n(next?.durationHours);
  const plannedRideCarbs = durationHours >= defaults.rideFuelingThresholdHours
    ? Math.round(durationHours * activityCarbsPerHour(next))
    : 0;
  const protein = Math.round(Math.max(defaults.proteinGrams, weightKg * defaults.proteinPerKg));
  const fatMin = Math.round(weightKg * defaults.fatMinimumPerKg);
  const carbPerKg = dayType === "long" || dayType === "hard" ? defaults.carbPerKgHard : defaults.carbPerKgEasy;
  const carbs = Math.round(weightKg * carbPerKg);
  const fuelingCalories = plannedRideCarbs * 4;
  const fatFromMacros = Math.round(fatMin);
  const minimumMacroCalories = protein * 4 + carbs * 4 + fatFromMacros * 9;
  const calorieTarget = Math.max(defaults.calorieTarget + fuelingCalories, minimumMacroCalories);
  const carbsFromCalories = Math.max(0, (calorieTarget - protein * 4 - fatFromMacros * 9) / 4);
  const dailyCarbs = Math.round(Math.max(carbs, carbsFromCalories));
  const caloriesFromMacros = protein * 4 + dailyCarbs * 4 + fatFromMacros * 9;
  const preRideCarbs = plannedRideCarbs ? Math.round(Math.min(1.0 * weightKg, Math.max(60, durationHours * 0.5 * activityCarbsPerHour(next)))) : 0;
  const recentCalories = Math.round(recentActivityCalories(context));
  return {
    date: context.date,
    dayType,
    calorieTarget,
    maintenanceReference: defaults.maintenanceCalories,
    macros: { proteinGrams: protein, carbsGrams: dailyCarbs, fatGrams: fatFromMacros, caloriesFromMacros },
    fueling: {
      plannedRide: next ? { name: next.name, durationHours, intensity: !!next.intensity, carbsDuringRideGrams: plannedRideCarbs, carbsPerHourGrams: plannedRideCarbs && durationHours ? Math.round(plannedRideCarbs / durationHours) : 0, preRideCarbsGrams: preRideCarbs, fluidMl: durationHours ? Math.round(durationHours * defaults.rideFluidMlPerHour) : 0 } : null
    },
    context: { recentCyclingCaloriesLast3: recentCalories, recentRideHours: context?.cycling?.recentRideHours || 0, recentRideTss: context?.cycling?.recentRideTss || 0 }
  };
}

// Deployment marker: nutrition endpoint requires the current Worker revision.
