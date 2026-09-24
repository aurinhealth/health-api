import { buildStrengthContext } from "./strength-context.js";
import { buildNutritionPlan } from "./nutrition-intelligence.js";
import { getFoodDay, recommendFood } from "./food-log.js";

const BASE_URL = "https://intervals.icu/api/v1";
const auth = env => "Basic " + btoa("API_KEY:" + env.INTERVALS_API_KEY);
const addDays = (date, days) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function note(date, n, food) {
  const f = n.fueling?.plannedRide;
  return [
    "Daily nutrition target — Health & Strength",
    "",
    `Calories: ${n.calorieTarget} kcal`,
    `Protein: ${n.macros.proteinGrams} g`,
    `Carbohydrates: ${n.macros.carbsGrams} g`,
    `Fat: ${n.macros.fatGrams} g`,
    "",
    `Estimated training calories: ${n.training.estimatedTrainingCalories} kcal`,
    `Target strategy: ${n.reductionTarget?.strategy || "gradual weight loss"}`,
    n.training.strengthMinutes ? `Strength: ~${n.training.strengthMinutes} min / ~${n.training.strengthCalories} kcal` : "",
    n.training.cyclingTrainingCalories ? `Cycling: ~${n.training.cyclingTrainingCalories} kcal` : "",
    f ? `Ride fueling: ${f.carbsDuringRideGrams} g during (${f.carbsPerHourGrams} g/h), ~${f.fluidMl} ml fluid` : "",
    f?.preRideCarbsGrams ? `Pre-ride carbs: ~${f.preRideCarbsGrams} g` : "",
    "",
    `Day type: ${n.dayType}`,
    `Food eaten: ${food?.totals?.eaten?.calories ?? 0} kcal / ${food?.totals?.eaten?.protein_g ?? 0} g protein`,
    `Food remaining: ${food?.recommendations?.remaining?.calories ?? 0} kcal / ${food?.recommendations?.remaining?.protein_g ?? 0} g protein`,
    food?.recommendations?.suggestions?.[0]?.suggestion ? `Food recommendation: ${food.recommendations.suggestions[0].suggestion}` : ""
  ].filter(Boolean).join("\n");
}

async function listNutritionNotes(env, oldest, newest) {
  const response = await fetch(
    `${BASE_URL}/athlete/0/events?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}&category=NOTE`,
    { headers: { Authorization: auth(env), Accept: "application/json" } }
  );
  const text = await response.text();
  let events;
  try { events = JSON.parse(text); } catch { events = []; }
  if (!response.ok) throw new Error(`Intervals.icu HTTP ${response.status}: ${JSON.stringify(events)}`);
  return Array.isArray(events) ? events : [];
}

async function deleteEvent(env, id) {
  const response = await fetch(
    `${BASE_URL}/athlete/0/events/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: { Authorization: auth(env), Accept: "application/json" } }
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Intervals.icu delete HTTP ${response.status}: ${text}`);
  }
}

export async function deleteDailyNutritionNotes(env, options = {}) {
  const oldest = String(options.oldest);
  const newest = String(options.newest || oldest);
  const events = await listNutritionNotes(env, oldest, newest);
  const matches = events.filter(event =>
    /^Nutrition — \d{4}-\d{2}-\d{2}$/.test(String(event?.name || "")) ||
    String(event?.external_id || "").startsWith("health-nutrition-")
  );

  let deletedCount = 0;
  for (const event of matches) {
    if (!event?.id) continue;
    await deleteEvent(env, event.id);
    deletedCount++;
  }

  return { status: "ok", oldest, newest, deletedCount, matchedCount: matches.length };
}

export async function syncDailyNutritionNotes(env, options = {}) {
  const oldest = String(options.oldest);
  const newest = String(options.newest || oldest);
  let weightKg = Number(options.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) weightKg = 88;

  // Make the operation idempotent. Existing nutrition notes are updated in
  // place and duplicate notes for the same date are removed.
  const existing = await listNutritionNotes(env, oldest, newest);
  const byDate = new Map();

  for (const event of existing) {
    const match = String(event?.name || "").match(/^Nutrition — (\d{4}-\d{2}-\d{2})$/);
    if (!match) continue;
    const date = match[1];
    const list = byDate.get(date) || [];
    list.push(event);
    byDate.set(date, list);
  }

  const results = [];
  let updatedCount = 0;
  let createdCount = 0;
  let duplicateDeletedCount = 0;

  let date = oldest;
  while (date <= newest) {
    const context = await buildStrengthContext(env, date);
    if (context.status !== "ok") throw new Error(`Strength context not ready for ${date}`);

    const nutrition = buildNutritionPlan(context, { weightKg });
    const foodDay = await getFoodDay(env.DB, date);
    const food = {
      ...foodDay,
      recommendations: recommendFood({
        day: date,
        nutritionPlan: nutrition,
        entries: foodDay
      })
    };

    const payload = {
      external_id: `health-nutrition-${date}`,
      category: "NOTE",
      start_date_local: `${date}T00:00:00`,
      name: `Nutrition — ${date}`,
      description: note(date, nutrition, food)
    };

    const candidates = byDate.get(date) || [];
    let keeper = candidates.find(event => String(event.external_id || "") === payload.external_id) || candidates[0] || null;

    for (const duplicate of candidates) {
      if (!keeper || duplicate.id === keeper.id) continue;
      await deleteEvent(env, duplicate.id);
      duplicateDeletedCount++;
    }

    if (keeper?.id) {
      const put = await fetch(
        `${BASE_URL}/athlete/0/events/${encodeURIComponent(keeper.id)}`,
        {
          method: "PUT",
          headers: {
            Authorization: auth(env),
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ ...keeper, ...payload, id: keeper.id })
        }
      );
      const text = await put.text();
      if (!put.ok) throw new Error(`Intervals.icu update HTTP ${put.status}: ${text}`);
      updatedCount++;
      results.push({ id: keeper.id, date, action: "updated" });
    } else {
      const post = await fetch(
        `${BASE_URL}/athlete/0/events`,
        {
          method: "POST",
          headers: {
            Authorization: auth(env),
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      const text = await post.text();
      let data;
      try { data = JSON.parse(text); } catch { data = {}; }
      if (!post.ok) throw new Error(`Intervals.icu HTTP ${post.status}: ${text}`);
      createdCount++;
      results.push({ id: data?.id ?? null, date, action: "created" });
    }

    date = addDays(date, 1);
  }

  return {
    status: "ok",
    oldest,
    newest,
    weightKg,
    updatedCount,
    createdCount,
    duplicateDeletedCount,
    events: results
  };
}
