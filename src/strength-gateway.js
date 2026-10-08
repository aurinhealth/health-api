import { L } from './lang.js';
import app from "./index.js";
import { foodRecommend } from "./food-recommend.js";
import { timingSafeEqualString } from "./dashboard-auth.js";
import { isInternalCall } from "./internal-auth.js";
import { buildStrengthContext } from "./strength-context.js";
import { parseStrengthPlan } from "./strength-history.js";
import { generateStrengthPlan } from "./strength-generator.js";
import { readGymPlan, writeStrengthPlanToDb, syncGymPlanHistory } from "./gym-plan-store.js";
import { buildNutritionPlan, withAppTarget } from "./nutrition-intelligence.js";
import { applyEnergyBudget } from "./energy-budget.js";
import { googleDashboard } from "./google-dashboard.js";
import { loadEffectiveProfile } from "./profile-suggestions.js";
import { writeStrengthPlanToIntervals } from "./intervals-strength.js";
import { getAthleteState, assertTrainingAllowed } from './athlete-state.js';
import { getWeekPlan } from './week-planner.js';
import { availabilityOn, trainingBudget, parseTimeWindow } from './training-availability.js';
import { localToday } from "./user-time.js";


export default {
  async scheduled(controller, env, ctx) { return app.scheduled(controller, env, ctx); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/strength/")) {
      const auth = authorizeStrength(request, env);
      if (auth) return auth;
    }
    if (url.pathname === "/strength/write-plan" && request.method === "POST") return writeStrengthPlanRoute(env, request);
    if (url.pathname === "/strength/generate-plan" && request.method === "POST") return generateStrengthPlanRoute(env, request, url, ctx);
    if (url.pathname === "/food/recommend") return foodRecommend(env, url);
    return app.fetch(request, env, ctx);
  }
};

// The day's calorie target exactly as the app shows it: /analysis/daily plus
// the Google Health energy budget, the same steps as /app/api/daily. Without
// it (no profile or weight yet) the nutrition plan keeps its own estimate.
async function appDailyTarget(env, ctx, date) {
  try {
    const day = date || localToday();
    const response = await app.fetch(new Request("https://internal/analysis/daily?date=" + encodeURIComponent(day)), env, ctx);
    if (!response.ok) return null;
    const daily = await response.json();
    const profile = await loadEffectiveProfile(env.DB, env.USER_ID);
    if (profile) applyEnergyBudget(daily, profile, await googleDashboard(env.DB, day).catch(() => null));
    return daily;
  } catch (error) {
    console.error("App calorie target unavailable", error.message);
    return null;
  }
}
async function nutritionFor(env, ctx, context, options) {
  return withAppTarget(buildNutritionPlan(context, options), await appDailyTarget(env, ctx, context?.date));
}

// The app's own layers call with the internal token; API clients from outside
// with the owner key (STRENGTH_API_KEY).
function authorizeStrength(request, env) {
  if (isInternalCall(request)) return null;
  const authorization = request.headers.get("Authorization") || "";
  if (env.STRENGTH_API_KEY && timingSafeEqualString(authorization, `Bearer ${env.STRENGTH_API_KEY}`)) return null;
  return Response.json({ status: "error", step: "strength_auth", message: "Unauthorized" }, { status: 401 });
}


// The strength plan of a day from D1 (gym_plans).
async function fetchTodayValues(env, date = null) {
  const plan = await readGymPlan(env.DB, date || localToday());
  return { range: "d1:gym_plans/" + plan.date, values: plan.values, videoLinks: [], stored: plan.stored };
}

// Before a plan for a day is replaced, its completed sets are saved to the
// history, so nothing that was trained is lost.
async function ensureCurrentWorkoutSafeToReplace(env, date = null) {
  const data = await fetchTodayValues(env, date);
  const sync = await syncGymPlanHistory(env.DB, data.values);
  return { status: "ok", workoutDate: sync.parsed?.date || date, completedRows: sync.completedRows, synced: true };
}

async function writeStrengthPlanRoute(env, request) {
  try {
    const body = await request.json();
    const guard = await ensureCurrentWorkoutSafeToReplace(env, body?.date);
    if (guard.status !== "ok") return Response.json(guard, { status: 409 });
    return Response.json(await writeStrengthPlanToDb(env.DB, body));
  } catch (error) { return Response.json({ status: "error", step: "strength_write_plan", message: error.message }, { status: 500 }); }
}

async function generateStrengthPlanRoute(env, request, url, ctx) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = String(body?.date || url.searchParams.get("date") || "").trim() || null;
    const context = await buildStrengthContext(env, date);
    if (context.status !== "ok") throw new Error("Strength context is not ready");
    // Diagnostic previews remain available to deployment checks; actual
    // generation through MCP/automation observes the same personal limits.
    const prefs = await getWeekPlan(env.DB, context.date);
    if (body?.preview !== true) assertTrainingAllowed(await getAthleteState(env.DB));
    const duration = body?.preview === true ? body?.durationMinutes : trainingBudget(prefs, context.date, body?.durationMinutes == null ? 60 : Number(body.durationMinutes), { userInitiated: body?.userInitiated === true });
    if (body?.preview !== true && duration < 30) throw new Error(L('Na posilovnu nezbývá alespoň 30 minut.', 'There aren\'t at least 30 minutes left for the gym.'));
    const options = {
      diagnosticPreview: body?.preview === true,
      focus: body?.focus ? String(body.focus) : undefined,
      focusSource: body?.focusSource === "week" ? "week" : undefined,
      forceProtectLegs: body?.forceProtectLegs === true,
      durationMinutes: duration == null ? undefined : Number(duration),
      maxExercises: body?.maxExercises == null ? undefined : Number(body.maxExercises),
      focusMuscles: body?.focusMuscles,
      excludeExercises: Array.isArray(body?.excludeExercises) ? body.excludeExercises.map(String) : []
    };

    // "regenerate" means create a genuinely different workout, not write the
    // same deterministic plan again. Read today's current plan and exclude
    // its exercises from the regenerated candidate pool.
    if (String(body?.action || "").toLowerCase() === "regenerate") {
      try {
        const today = await fetchTodayValues(env, context.date);
        const parsedToday = parseStrengthPlan(today.values);
        const currentExercises = [...new Set((parsedToday.rows || [])
          .filter(r => r.type === "WORK" && r.exercise)
          .map(r => String(r.exercise)))];
        options.excludeExercises = [...new Set([...options.excludeExercises, ...currentExercises])];
      } catch (_) {
        // Regeneration can still proceed from context if today's plan cannot
        // be read; the normal generation path will handle the result.
      }
    }

    const plan = generateStrengthPlan(context, options);
    if (body?.preview === true) return Response.json({ status: "ok", preview: true, context, plan });
    const guard = await ensureCurrentWorkoutSafeToReplace(env, plan.date);
    if (guard.status !== "ok") return Response.json(guard, { status: 409 });
    const result = await writeStrengthPlanToDb(env.DB, {
      date: plan.date,
      rows: plan.rows,
      planName: plan.planName,
      rationale: plan.rationale,
      timing: plan.timing,
      protectedLegs: plan.protectedLegs,
      loadFactor: plan.loadFactor
    });

    let intervals = { status: "skipped", reason: "INTERVALS_API_KEY is not configured" };
    try {
      intervals = await writeStrengthPlanToIntervals(env, plan, {
        startTime: parseTimeWindow(availabilityOn(prefs, context.date).window)?.start || body?.startTime || "00:00",
        durationMinutes: options.durationMinutes || 60
      });
    } catch (error) {
      intervals = { status: "error", message: error.message };
    }

    const nutrition = await nutritionFor(env, ctx, context, { ...body, strengthPlan: plan });
    return Response.json({
      ...result,
      planName: plan.planName,
      rationale: plan.rationale,
      loadFactor: plan.loadFactor,
      loadEstimates: plan.loadEstimates,
      intervals,
      nutrition
    });
  } catch (error) { return Response.json({ status: "error", step: "strength_generate_plan", message: error.message }, { status: 500 }); }
}


