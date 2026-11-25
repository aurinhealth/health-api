import { trendAdjustment } from "./energy-profile.js";
import { refillMacros } from "./diet.js";
import { carbsPerHour } from "./workout-explanation.js";
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export const NUTRITION_DEFAULTS = {
  maintenanceCalories: 2500,
  calorieTarget: 2250,
  restCalorieTarget: 2250,
  targetLossKgPerWeekMin: 0.25,
  targetLossKgPerWeekMax: 0.50,
  proteinPerKg: 2.0,
  carbPerKgEasy: 2.0,
  carbPerKgHard: 3.0,
  carbPerKgLong: 3.5,
  trainingCalorieCoverage: 0.7,
  maxTrainingAdjustment: 1400,
  fatMinimumPerKg: 0.7,
  rideFluidMlPerHour: 700
};

// The same g/h as the workout card and the calendars (CARBS table): a hard
// ride reads as threshold, any other as endurance; 0 when water is enough.
export function rideCarbsPerHour(ride, experience = null) {
  if (!ride) return 0;
  return carbsPerHour(n(ride.durationHours) * 60, ride.intensity ? "threshold" : "endurance", "ride", experience) || 0;
}

// Without any weight of the athlete: a neutral reference adult, never the
// owner's own weight.
const FALLBACK_WEIGHT_KG = 70;
// From how many hours a session makes the day long, or hard without a
// telling name, per sport.
const LONG_HOURS = { ride: 2.5, run: 1.5, swim: 1.5 }, HARD_HOURS = { ride: 1.5, run: 1, swim: 1 };
const onDay = (w, date) => w && (!w.date || !date || String(w.date) === String(date));

// The day's planned rides, runs and swims (a session without a date is the
// day's): the next ride of a later day is not today's.
export function enduranceToday(context) {
  const date = context?.date;
  const of = (list, sport) => (list || []).filter(w => onDay(w, date)).map(w => ({ ...w, sport }));
  const rides = of(context?.cycling?.plannedWorkouts?.length ? context.cycling.plannedWorkouts : [context?.cycling?.nextRide].filter(Boolean), "ride");
  return [...rides, ...of(context?.running?.plannedWorkouts, "run"), ...of(context?.swimming?.plannedWorkouts, "swim")];
}

function classifyDay(context) {
  const today = enduranceToday(context);
  if (today.some(w => n(w.durationHours) >= LONG_HOURS[w.sport])) return "long";
  if (today.some(w => w.intensity || n(w.durationHours) >= HARD_HOURS[w.sport])) return "hard";
  if (today.length) return "easy";
  return context?.strength?.plannedWorkout ? "training" : "rest";
}

function recentActivityCalories(context) {
  return (context?.cycling?.recentActivities || []).slice(0, 3).reduce((sum, a) => sum + n(a.calories), 0);
}

function estimatePlannedRideCalories(ride, weightKg = 88) {
  if (!ride) return 0;
  const hours = n(ride.durationHours);
  if (!hours) return 0;
  const watts = n(ride.normalizedPower || ride.averagePower);
  if (watts > 0) return Math.round((watts * hours * 3600 / 4184) / 0.23);
  // Practical planning estimate for an 88 kg rider when future power is
  // absent, scaled to the athlete's weight.
  const kcalPerHour = (ride.intensity ? 600 : 500) * weightKg / 88;
  return Math.round(hours * kcalPerHour);
}

// A planned run or swim by METs (Ainsworth 2011 Compendium: running about
// 6 mph 9.8, hard 11.5; swimming laps moderate 7, vigorous 9.8).
const MET = { run: { easy: 9.8, hard: 11.5 }, swim: { easy: 7, hard: 9.8 } };
function estimateRunSwimCalories(sessions, weightKg) {
  return Math.round(sessions.filter(w => MET[w.sport]).reduce((sum, w) => sum + MET[w.sport][w.intensity ? "hard" : "easy"] * 3.5 * weightKg / 200 * n(w.durationHours) * 60, 0));
}

function estimateStrengthMinutes(plan) {
  if (!plan?.rows?.length) return 0;
  const workSets = plan.rows.filter(r => r?.[0] === "WORK").length;
  const warmupSets = plan.rows.filter(r => r?.[0] === "WARMUP").length;
  const exercises = new Set(plan.rows.filter(r => r?.[0] === "WORK" && r?.[1]).map(r => r[1])).size;
  return Math.round(clamp(workSets * 2.5 + warmupSets * 1.5 + exercises * 4, 35, 100));
}

// The same goal-aware trend correction as the app's calorie target.
function adaptiveBaseCalories(defaults, weightTrend, goal) {
  const base=Number(defaults.restCalorieTarget);
  const {adjustment,reason}=trendAdjustment(goal,weightTrend);
  return {target:base+adjustment,adjustment,reason};
}

function estimateStrengthCalories(weightKg, minutes) {
  if (!minutes) return 0;
  // Moderate-to-vigorous resistance training estimate; deliberately reported
  // as an estimate rather than pretending the value is a measured expenditure.
  const met = 5.0;
  return Math.round((met * 3.5 * weightKg / 200) * minutes);
}

export function buildNutritionPlan(context, options = {}) {
  const weightTrend = options.weightTrend || context?.weightTrend || null;
  // The athlete's own latest weight; a neutral 70 kg only when nothing is
  // known, so protein and carbs fit every user.
  const weightKg = n(options.weightKg, n(context?.weightKg, n(weightTrend?.latestKg, FALLBACK_WEIGHT_KG)));
  const defaults = { ...NUTRITION_DEFAULTS, ...(options.defaults || {}) };
  const dayType = classifyDay(context);
  const adaptiveBase = adaptiveBaseCalories(defaults, weightTrend, options.goal || context?.goal);
  const next = context?.cycling?.nextRide || null;
  // Calories count only what is planned for this day.
  const today = enduranceToday(context);
  const rideToday = onDay(next, context?.date) ? next : null;
  const durationHours = n(next?.durationHours);
  const rideRate = rideCarbsPerHour(next, options.experience ?? context?.experience ?? null);
  const plannedRideCarbs = Math.round(durationHours * rideRate);
  const weightKnown = [options.weightKg, context?.weightKg, weightTrend?.latestKg].some(v => Number(v) > 0);
  const protein = Math.round(weightKg * defaults.proteinPerKg);
  const fatMin = Math.round(weightKg * defaults.fatMinimumPerKg);
  const carbPerKg = dayType === "long"
    ? defaults.carbPerKgLong
    : dayType === "hard"
      ? defaults.carbPerKgHard
      : defaults.carbPerKgEasy;
  const carbs = Math.round(weightKg * carbPerKg);
  const fatFromMacros = Math.round(fatMin);
  const minimumMacroCalories = protein * 4 + carbs * 4 + fatFromMacros * 9;
  const calorieTarget = Math.max(adaptiveBase.target, defaults.calorieTarget, minimumMacroCalories);
  const carbsFromCalories = Math.max(0, (calorieTarget - protein * 4 - fatFromMacros * 9) / 4);
  const dailyCarbs = Math.round(Math.max(carbs, carbsFromCalories));
  const preRideCarbs = plannedRideCarbs ? Math.round(Math.min(1.0 * weightKg, Math.max(60, durationHours * 0.5 * rideRate))) : 0;
  const strengthPlan = options?.strengthPlan || context?.strength?.plannedWorkout || null;
  const strengthMinutes = Number(options?.strengthMinutes || estimateStrengthMinutes(strengthPlan));
  const strengthCalories = estimateStrengthCalories(weightKg, strengthMinutes);
  const cyclingTrainingCalories = Math.round((context?.cycling?.recentActivities || [])
    .filter(a => String(a.date || "") === String(context.date || ""))
    .reduce((sum, a) => sum + n(a.calories), 0));
  const completedCyclingCalories = cyclingTrainingCalories;
  const plannedCyclingCalories = rideToday && !context?.cycling?.recentActivities?.some(a => String(a.date || "") === String(context.date || ""))
    ? estimatePlannedRideCalories(rideToday, weightKg)
    : 0;
  const plannedRunSwimCalories = estimateRunSwimCalories(today, weightKg);
  const trainingCalories = strengthCalories + completedCyclingCalories;
  const planningTrainingCalories = strengthCalories + completedCyclingCalories + plannedCyclingCalories + plannedRunSwimCalories;
  // Base intake is the user's chosen reduction baseline. On training days we
  // return only part of the estimated training expenditure, keeping a deficit
  // while providing enough energy to support the session. Ride fueling is part
  // of this same daily target, never an extra allowance on top of it.
  const rawTrainingAdjustment = Math.round(planningTrainingCalories * defaults.trainingCalorieCoverage);
  const trainingAdjustment = Math.min(defaults.maxTrainingAdjustment, rawTrainingAdjustment);
  const adjustedCalorieTarget = Math.max(
    calorieTarget,
    adaptiveBase.target + trainingAdjustment
  );
  const adjustedCarbsFromCalories = Math.max(
    dailyCarbs,
    Math.round((adjustedCalorieTarget - protein * 4 - fatFromMacros * 9) / 4)
  );
  const finalCaloriesFromMacros = protein * 4 + adjustedCarbsFromCalories * 4 + fatFromMacros * 9;
  const recentCalories = Math.round(recentActivityCalories(context));
  return {
    date: context.date,
    dayType,
    weightSource: weightKnown ? "athlete" : "default",
    calorieTarget: adjustedCalorieTarget,
    maintenanceReference: defaults.maintenanceCalories,
    weightTrend,
    adaptiveCalorieAdjustment: adaptiveBase.adjustment,
    adaptiveCalorieReason: adaptiveBase.reason,
    reductionTarget: {
      minLossKgPerWeek: defaults.targetLossKgPerWeekMin,
      maxLossKgPerWeek: defaults.targetLossKgPerWeekMax,
      strategy: "Target a 0.25–0.50 kg/week trend and adjust from rolling weight trend over time"
    },
    training: {
      strengthMinutes,
      strengthCalories,
      cyclingTrainingCalories: completedCyclingCalories,
      plannedCyclingCalories,
      plannedRunSwimCalories,
      estimatedTrainingCalories: trainingCalories,
      plannedTrainingCalories: planningTrainingCalories,
      estimateMethod: "strength: 5 MET resistance-training estimate; cycling: observed calories when available or planned-power/500–600 kcal/h estimate at 88 kg, scaled to weight; run and swim: Compendium METs"
    },
    macros: { proteinGrams: protein, carbsGrams: adjustedCarbsFromCalories, fatGrams: fatFromMacros, caloriesFromMacros: finalCaloriesFromMacros },
    fueling: {
      plannedRide: next ? { name: next.name, durationHours, intensity: !!next.intensity, carbsDuringRideGrams: plannedRideCarbs, carbsPerHourGrams: rideRate, preRideCarbsGrams: preRideCarbs, fluidMl: durationHours ? Math.round(durationHours * defaults.rideFluidMlPerHour) : 0 } : null
    },
    context: { recentCyclingCaloriesLast3: recentCalories, recentRideHours: context?.cycling?.recentRideHours || 0, recentRideTss: context?.cycling?.recentRideTss || 0 }
  };
}

// Deployment marker: nutrition endpoint requires the current Worker revision.

// ChatGPT plans meals against the number the app shows. The app's day target
// (profile, training and the Google Health energy budget) replaces the
// estimate above; protein follows the app and the macro the diet fills takes the rest.
export function withAppTarget(plan, daily) {
  const target = Math.round(Number(daily?.nutrition?.calorieTarget));
  if (!plan || !(target > 0)) return plan;
  const m = daily.nutrition.macros || {}, own = plan.macros || {};
  const pick = (...values) => values.filter(v => v != null && v !== "").map(Number).find(v => Number.isFinite(v) && v >= 0);
  const protein = Math.round(pick(m.protein_g, m.proteinGrams, own.proteinGrams) ?? 0);
  // The diet's own split (diet.js): on keto the carbs stay and fat fills.
  const split = refillMacros({ ...m, protein_g: protein, fat_g: Math.round(pick(m.fat_g, m.fatGrams, own.fatGrams) ?? 0), carbs_g: Math.round(pick(m.carbs_g) ?? 0) }, target);
  const fat = split.fat_g, carbs = split.carbs_g;
  return {
    ...plan,
    calorieTarget: target,
    estimatedCalorieTarget: plan.calorieTarget,
    targetSource: daily.nutrition.ownTarget ? "athlete's own goal" : daily.nutrition.energyBudget ? "app (Google Health energy budget)" : "app",
    // The app's target carries its own trend correction; report that one.
    adaptiveCalorieAdjustment: Number(daily.nutrition.calorieBreakdown?.trendAdjustment) || 0,
    adaptiveCalorieReason: daily.nutrition.calorieBreakdown?.trendReason || "app_target",
    macros: { proteinGrams: protein, carbsGrams: carbs, fatGrams: fat, caloriesFromMacros: protein * 4 + carbs * 4 + fat * 9 },
    ...(daily.nutrition.diet ? { diet: daily.nutrition.diet } : {})
  };
}
