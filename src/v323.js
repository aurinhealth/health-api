import legacy from "./index.js";
import { getCookbook } from "./cookbook.js";

const V323 = "final-5-cookbook-v3.2.3";
const BASELINE_REST_TDEE = 2450;
const DEFICIT = 550;
const MIN_TARGET = 2000;
const MAX_TARGET = 3200;
const PROTEIN_PER_KG = 2.0;
const FAT_PER_KG = 0.8;
const ENDURANCE_CARB_PER_KG = 5.0;
const TRAINING_CARB_PER_KG = 4.0;
const REST_CARB_PER_KG = 3.0;
const ENDURANCE_RIDE_KCAL_H = 500;
const INTENSE_RIDE_KCAL_H = 600;

function activityNumber(payload, keys) {
  for (const key of keys) {
    const value = Number(payload?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function durationHours(payload, start = null, end = null) {
  let duration = activityNumber(payload, ["duration", "duration_seconds", "moving_time", "elapsed_time"]);
  if (duration && duration > 1000) duration /= 3600;
  if (!duration && start && end) {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (Number.isFinite(a) && Number.isFinite(b)) duration = Math.max(0, (b - a) / 3600000);
  }
  if (duration && duration > 12) duration /= 3600;
  return duration || null;
}

function plannedInfo(row) {
  const payload = JSON.parse(row.payload_json || "{}");
  const type = payload.type || payload.activity_type || payload.category || "";
  const name = payload.name || payload.title || payload.description || "";
  const text = `${type} ${name} ${payload.description || ""}`.toLowerCase();
  const cycling = ["ride", "bike", "cycling", "cycle", "gravel", "mountain bike", "mtb", "road cycling", "indoor cycling"]
    .some(x => text.includes(x));
  const intensity = [
    "tempo", "sweet spot", "threshold", "interval", "intervals", "vo2", "vo2max",
    "sprint", "anaerobic", "over-under", "over under", "race", "race pace", "ftp"
  ].some(x => text.includes(x));
  const enduranceOnly = cycling && text.includes("endurance") && !intensity;
  return {
    id: row.external_id,
    start: row.start_time || payload.start_date_local || payload.start_date || payload.date || null,
    end: row.end_time || payload.end_date_local || payload.end_date || null,
    durationHours: durationHours(payload, row.start_time, row.end_time),
    type,
    name,
    cycling,
    intensity,
    enduranceOnly,
    kcalPerHour: enduranceOnly ? ENDURANCE_RIDE_KCAL_H : INTENSE_RIDE_KCAL_H,
    payload
  };
}

function activityInfo(row) {
  const payload = JSON.parse(row.payload_json || "{}");
  const text = `${row.data_type || ""} ${payload.type || ""} ${payload.name || ""} ${payload.category || ""}`.toLowerCase();
  return {
    id: row.external_id,
    start: row.start_time,
    end: row.end_time,
    type: payload.type || payload.category || "Unknown",
    name: payload.name || payload.title || payload.description || "",
    calories: Number(payload.calories_kcal ?? payload.calories ?? payload.icu_calories ?? row.value_numeric ?? 0),
    durationHours: durationHours(payload, row.start_time, row.end_time),
    pairedIds: [payload.paired_event_id, payload.pairedEventId, payload.event_id, payload.eventId, payload.paired_activity_id, payload.pairedActivityId, payload.activity_id, payload.activityId]
      .filter(Boolean).map(String),
    cycling: ["ride", "bike", "cycling", "cycle", "gravel", "mountain bike", "mtb", "road cycling", "indoor cycling"].some(x => text.includes(x)),
    strength: ["weight", "strength", "gym", "lifting", "bodybuilding"].some(x => text.includes(x)),
    payload
  };
}

async function loadTrainingContext(env, date) {
  const plannedRows = await env.DB.prepare(`
    SELECT external_id, start_time, end_time, payload_json
    FROM health_datapoints
    WHERE source_family = 'intervals'
      AND data_type = 'planned-workout'
      AND start_time LIKE ?
    ORDER BY start_time
  `).bind(date + "%").all();

  const activityRows = await env.DB.prepare(`
    SELECT external_id, start_time, end_time, payload_json
    FROM health_datapoints
    WHERE source_family = 'intervals'
      AND data_type = 'activity'
      AND start_time LIKE ?
      AND (record_role IS NULL OR record_role != 'duplicate')
    ORDER BY start_time
  `).bind(date + "%").all();

  const actual = (activityRows.results || []).map(activityInfo);
  const completedIds = new Set(actual.flatMap(a => a.pairedIds));
  const planned = (plannedRows.results || []).map(plannedInfo);
  const unmatched = planned.filter(p => !completedIds.has(String(p.id)));

  const cyclingActual = actual.filter(a => a.cycling);
  const cyclingPlanned = unmatched.filter(p => p.cycling);
  const latestRide = cyclingActual
    .filter(a => a.end)
    .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0] || null;
  const hoursSinceRide = latestRide?.end ? Math.max(0, (Date.now() - new Date(latestRide.end).getTime()) / 3600000) : null;

  return {
    actual,
    planned,
    unmatched,
    cycling: cyclingActual.length > 0 || cyclingPlanned.length > 0,
    strength: actual.some(a => a.strength) || unmatched.some(p => ["weight", "strength", "gym", "lifting", "bodybuilding"].some(x => `${p.type} ${p.name}`.toLowerCase().includes(x))),
    totalEnduranceHours: cyclingActual.reduce((s, a) => s + Number(a.durationHours || 0), 0) + cyclingPlanned.reduce((s, p) => s + Number(p.durationHours || 0), 0),
    postRide: Boolean(latestRide && hoursSinceRide != null && hoursSinceRide <= 2.5),
    latestRideEnd: latestRide?.end || null,
    hoursSinceRide: hoursSinceRide == null ? null : Math.round(hoursSinceRide * 100) / 100,
    plannedRideCalories: Math.round(cyclingPlanned.reduce((s, p) => s + Number(p.durationHours || 0) * p.kcalPerHour, 0)),
    plannedRideHours: Math.round(cyclingPlanned.reduce((s, p) => s + Number(p.durationHours || 0), 0) * 100) / 100,
    plannedEnduranceRideHours: Math.round(cyclingPlanned.filter(p => p.enduranceOnly).reduce((s, p) => s + Number(p.durationHours || 0), 0) * 100) / 100
  };
}

function macroTargets(weightKg, calorieTarget, context) {
  const kg = Number(weightKg) || 85.8;
  const protein = Math.round(kg * PROTEIN_PER_KG);
  const fat = Math.round(kg * FAT_PER_KG);
  const carbPerKg = context.endurance ? ENDURANCE_CARB_PER_KG : context.training ? TRAINING_CARB_PER_KG : REST_CARB_PER_KG;
  const floorCarbs = Math.round(kg * carbPerKg);
  const derivedCarbs = Math.round(Math.max(0, (Number(calorieTarget) - protein * 4 - fat * 9) / 4));
  return { protein_g: protein, carbs_g: Math.max(floorCarbs, derivedCarbs), fat_g: fat };
}

function recipeMinutes(recipe) {
  return Number(String(recipe.time || "").match(/\d+/)?.[0] || 60);
}

function scoreRecipe(recipe, remaining, targets, context, maxMinutes) {
  const kcal = Number(recipe.kcal || 0);
  const protein = Number(recipe.protein_g || 0);
  const carbs = Number(recipe.carbs_g || 0);
  const fat = Number(recipe.fat_g || 0);
  if (!Number.isFinite(kcal) || kcal <= 0) return -9999;

  let score = 0;

  // 1) Calorie fit is the primary constraint.
  if (remaining.kcal > 0) {
    const ratio = kcal / remaining.kcal;
    score += Math.max(-45, 50 - Math.abs(1 - ratio) * 50);
    if (kcal <= remaining.kcal) score += 20;
    else score -= Math.min(70, (kcal - remaining.kcal) * 0.35);
  } else {
    score += kcal <= 150 ? 40 : kcal <= 250 ? 10 : -Math.min(120, (kcal - 150) * 0.75);
  }

  // 2) Strong penalty when the meal overshoots the remaining fat budget.
  if (remaining.fat_g > 0) {
    const fatRatio = fat / remaining.fat_g;
    if (fatRatio <= 1) score += 16 * fatRatio;
    else score -= Math.min(55, (fat - remaining.fat_g) * 1.8);
  } else {
    score -= Math.min(55, fat * 1.8);
  }

  // 3) Training-dependent carbohydrate priority.
  if (remaining.carbs_g > 0) {
    const carbRatio = carbs / remaining.carbs_g;
    score += context.endurance ? Math.min(35, carbRatio * 35) : Math.min(24, carbRatio * 24);
    if (context.postRide) score += Math.min(20, carbs * 0.25);
  }

  // 4) Protein is important, but should not dominate the recommendation.
  if (remaining.protein_g > 0) score += Math.min(20, (protein / remaining.protein_g) * 20);

  // 5) Practicality is a secondary factor.
  if (maxMinutes) score += recipeMinutes(recipe) <= maxMinutes ? 8 : -Math.min(20, (recipeMinutes(recipe) - maxMinutes) * 0.8);
  if (recipe.meal_prep) score += 4;
  if (recipe.level === "Easy") score += 3;

  return Math.round(score * 10) / 10;
}

function recommendationReason(recipe, remaining, context, maxMinutes) {
  const reasons = [];
  if (context.postRide && Number(recipe.carbs_g || 0) >= 40) reasons.push("sacharidy po kole");
  else if (context.endurance && Number(recipe.carbs_g || 0) >= Math.max(40, remaining.carbs_g * 0.25)) reasons.push("vhodné sacharidy pro vytrvalost");
  if (remaining.fat_g <= 20 && Number(recipe.fat_g || 0) <= remaining.fat_g) reasons.push("vejde se do tuku");
  if (remaining.protein_g > 0 && Number(recipe.protein_g || 0) >= Math.min(40, remaining.protein_g * 0.35)) reasons.push("dobrý příjem bílkovin");
  if (maxMinutes && recipeMinutes(recipe) <= maxMinutes) reasons.push("rychlá příprava");
  if (recipe.meal_prep) reasons.push("Meal Prep");
  if (remaining.kcal <= 0 && Number(recipe.kcal || 0) <= 150) reasons.push("malá svačina bez velkého navýšení kcal");
  return reasons.slice(0, 3).join(", ");
}

async function foodRecommendV323(env, url) {
  const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  const [energyResponse, foodResponse] = await Promise.all([
    legacy.fetch(new Request(new URL(`/analysis/energy?date=${encodeURIComponent(date)}`, url).toString()), env),
    legacy.fetch(new Request(new URL(`/food/today?date=${encodeURIComponent(date)}`, url).toString()), env)
  ]);
  const energy = await energyResponse.json();
  const food = await foodResponse.json();
  const context = await loadTrainingContext(env, date);
  context.endurance = context.cycling || context.totalEnduranceHours >= 1;
  context.training = context.actual.length > 0 || context.unmatched.length > 0;

  // The legacy engine assumes 600 kcal/h for every planned ride. V3.2.3
  // corrects only unmatched planned Endurance rides to 500 kcal/h. Actual
  // activities continue to use their actual calories and suppress the plan.
  const enduranceHours = context.plannedEnduranceRideHours;
  const adjustedTDEE = Math.round(Number(energy.final?.estimatedTDEE || BASELINE_REST_TDEE) - enduranceHours * (INTENSE_RIDE_KCAL_H - ENDURANCE_RIDE_KCAL_H));
  const calorieTarget = Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.round(adjustedTDEE - DEFICIT)));

  const weightRow = await env.DB.prepare(`
    SELECT value_numeric FROM health_datapoints
    WHERE data_type = 'weight' AND value_numeric IS NOT NULL
    ORDER BY sample_time DESC, id DESC LIMIT 1
  `).first();
  const currentWeight = weightRow ? Number(weightRow.value_numeric) : null;
  const targets = macroTargets(currentWeight, calorieTarget, context);
  const calorieDelta = calorieTarget - Number(food.totals?.kcal || 0);
  const remaining = {
    kcal: Math.max(0, calorieDelta),
    protein_g: Math.max(0, targets.protein_g - Number(food.totals?.protein_g || 0)),
    carbs_g: Math.max(0, targets.carbs_g - Number(food.totals?.carbs_g || 0)),
    fat_g: Math.max(0, targets.fat_g - Number(food.totals?.fat_g || 0))
  };

  const explicitPostRide = url.searchParams.get("post_ride");
  const postRide = explicitPostRide === "1" || (explicitPostRide !== "0" && context.postRide);
  context.postRide = postRide;
  const maxMinutes = Number(url.searchParams.get("max_minutes") || 0);
  const category = (url.searchParams.get("category") || "").trim().toLowerCase();
  const limit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") || 5)));
  const overCalories = calorieDelta < 0;
  const heavilyOverCalories = calorieDelta < -300;

  const cookbookData = await getCookbook();
  const cookbook = Array.isArray(cookbookData) ? cookbookData : (cookbookData?.recipes || []);
  let candidates = cookbook.filter(recipe => {
    const kcal = Number(recipe.kcal);
    if (!Number.isFinite(kcal) || kcal <= 0) return false;
    if (category && String(recipe.category || "").toLowerCase() !== category) return false;
    if (maxMinutes && recipeMinutes(recipe) > maxMinutes) return false;
    if (heavilyOverCalories && kcal > 150) return false;
    if (overCalories && !heavilyOverCalories && kcal > 250) return false;
    return true;
  });

  candidates = candidates
    .map(recipe => ({ recipe, score: scoreRecipe(recipe, remaining, targets, context, maxMinutes) }))
    .filter(x => x.score > -9000)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => ({
      ...x.recipe,
      recommendation_score: x.score,
      recommendation_reason: recommendationReason(x.recipe, remaining, context, maxMinutes)
    }));

  let coaching = "";
  if (heavilyOverCalories) coaching = "Kaloricky jsi už výrazně nad dnešním cílem. Plnohodnotné jídlo teď nedoporučuji; pokud máš hlad nebo řešíš recovery po kole, drž se malé sacharidové svačiny.";
  else if (overCalories) coaching = "Kalorický cíl už je splněný/překročený. Pokud máš hlad, vybírej spíš malou svačinovou porci; další plnohodnotné jídlo není nutné jen kvůli makrům.";
  else if (postRide) coaching = "Jsi krátce po vytrvalostním tréninku. Pokud budeš ještě jíst, preferuj sacharidy a rozumný příjem bílkovin.";
  else if (context.endurance) coaching = "Dnes máš vytrvalostní zátěž, takže při dalším jídle mají vyšší prioritu sacharidy.";

  return Response.json({
    status: "ok",
    version: V323,
    date,
    foodTotals: food.totals,
    calorieTarget,
    calorieDelta,
    estimatedTDEE: adjustedTDEE,
    macroTargets: targets,
    remaining,
    nutritionContext: context,
    plannedRideCalories: context.plannedRideCalories,
    plannedRideHours: context.plannedRideHours,
    plannedEnduranceRideHours: context.plannedEnduranceRideHours,
    coaching,
    recommendations: candidates
  });
}

async function analysisEnergyV323(env, url) {
  const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  const response = await legacy.fetch(new Request(new URL(`/analysis/energy?date=${encodeURIComponent(date)}`, url).toString()), env);
  const data = await response.json();
  const context = await loadTrainingContext(env, date);
  const adjustedTDEE = Math.round(Number(data.final?.estimatedTDEE || BASELINE_REST_TDEE) - context.plannedEnduranceRideHours * 100);
  const calorieTarget = Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.round(adjustedTDEE - DEFICIT)));
  return Response.json({
    ...data,
    version: V323,
    final: {
      ...data.final,
      estimatedTDEE: adjustedTDEE,
      calorieTarget,
      estimatedPlannedRideCalories: context.plannedRideCalories,
      plannedRideHours: context.plannedRideHours,
      plannedEnduranceRideHours: context.plannedEnduranceRideHours
    },
    trainingContext: context
  });
}

export default {
  async scheduled(controller, env, ctx) {
    return legacy.scheduled(controller, env, ctx);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return Response.json({ status: "ok", service: "health-api", version: V323 });
    }
    if (url.pathname === "/food/recommend") return await foodRecommendV323(env, url);
    if (url.pathname === "/analysis/energy") return await analysisEnergyV323(env, url);
    return legacy.fetch(request, env);
  }
};
