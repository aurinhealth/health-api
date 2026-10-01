import app from "./v400.js";
import { buildStrengthContext } from "./strength-context.js";
import { getStrengthHistory, parseStrengthSheet, importStrengthHistory } from "./strength-history.js";
import { generateStrengthPlan, EXERCISES } from "./strength-generator.js";
import { analyzeCompletedWorkout, findExerciseAlternatives, estimateStartingLoad, EXERCISE_INTELLIGENCE } from "./strength-intelligence.js";
import { readGymPlan, writeStrengthPlanToDb, syncGymPlanHistory } from "./gym-plan-store.js";
import { buildNutritionPlan } from "./nutrition-intelligence.js";
import { buildAdaptiveDecision } from "./adaptive-engine.js";
import { buildWeeklyReview } from "./weekly-review.js";
import { buildDailyPlan } from "./daily-plan.js";
import { getCyclingContext } from "./cycling-context.js";
import { writeStrengthPlanToIntervals } from "./intervals-strength.js";
import { searchCookbookRecipes, getCookbookRecipe, logFood, getFoodDay, recommendFood, resolveAndCacheFood, lookupCachedFood, logResolvedFood, consumePlannedFood, updateFoodEntry, cancelFoodEntry, getFoodFavorites } from "./food-log.js";


export default {
  async scheduled(controller, env, ctx) { return app.scheduled(controller, env, ctx); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/test/google-sheets-auth") return SHEETS_RETIRED();
    if (url.pathname.startsWith("/strength/")) {
      const auth = authorizeStrength(request, env);
      if (auth) return auth;
    }
    if (url.pathname === "/strength/sheet/today" && request.method === "GET") return readTodaySheet(env, url);
    if (url.pathname === "/strength/sheet/write" && request.method === "POST") return SHEETS_RETIRED();
    if (url.pathname === "/strength/sheet/write-plan" && request.method === "POST") return writeStrengthPlanRoute(env, request);
    if (url.pathname === "/strength/sheet/simplify" && request.method === "POST") return SHEETS_RETIRED();
    if (url.pathname === "/strength/generate-plan" && request.method === "POST") return generateStrengthPlanRoute(env, request, url);
    if (url.pathname === "/strength/sync" && request.method === "POST") return syncStrength(env);
    if (url.pathname === "/strength/history/import" && request.method === "POST") return importStrengthHistoryRoute(env, request);
    if (url.pathname === "/strength/sheets/maintenance" && request.method === "POST") return maintainStrengthSheetsRoute(env, request);
    if (url.pathname === "/strength/history" && request.method === "GET") return strengthHistory(env, url);
    if (url.pathname === "/strength/context" && request.method === "GET") return strengthContext(env, url);
    if (url.pathname === "/strength/analyze" && request.method === "POST") return analyzeStrengthRoute(env, request);
    if (url.pathname === "/strength/alternatives" && request.method === "POST") return alternativesRoute(env, request);
    if (url.pathname === "/strength/substitute" && request.method === "POST") return substituteRoute(env, request);
    if (url.pathname === "/nutrition/plan" && request.method === "POST") return nutritionPlanRoute(env, request);
    if (url.pathname === "/cookbook/search" && request.method === "GET") return cookbookSearchRoute(env, url);
    if (url.pathname === "/cookbook/recipe" && request.method === "GET") return cookbookRecipeRoute(env, url);
    if (url.pathname === "/nutrition/log-meal" && request.method === "POST") return logMealRoute(env, request);
    if (url.pathname === "/nutrition/day" && request.method === "GET") return nutritionDayRoute(env, url);
    if (url.pathname === "/nutrition/recommend" && request.method === "POST") return nutritionRecommendRoute(env, request);
    if (url.pathname === "/decision/daily" && request.method === "POST") return dailyDecisionRoute(env, request);
    if (url.pathname === "/daily/plan" && request.method === "GET") return dailyPlanRoute(env, url);
    if (url.pathname === "/training/weekly-review" && request.method === "GET") return weeklyReviewRoute(env, url);
    if (url.pathname === "/food/resolve" && request.method === "POST") return foodResolveRoute(env, request);
    if (url.pathname === "/food/product" && request.method === "GET") return foodProductRoute(env, url);
    if (url.pathname === "/food/favorites" && request.method === "GET") return foodFavoritesRoute(env, url);
    if (url.pathname === "/nutrition/log-product" && request.method === "POST") return logProductRoute(env, request);
    if (url.pathname === "/nutrition/consume" && request.method === "POST") return consumeFoodRoute(env, request);
    if (url.pathname === "/nutrition/food/update" && request.method === "POST") return updateFoodRoute(env, request);
    if (url.pathname === "/nutrition/food/cancel" && request.method === "POST") return cancelFoodRoute(env, request);
    if (url.pathname === "/cycling/context" && request.method === "GET") return cyclingContextRoute(env, url);
    return app.fetch(request, env, ctx);
  }
};

async function cyclingContextRoute(env, url) {
  try {
    const context = await getCyclingContext(env, {
      date: url.searchParams.get("date") || undefined,
      lat: url.searchParams.get("lat") || undefined,
      lon: url.searchParams.get("lon") || undefined,
      rideType: url.searchParams.get("ride_type") || undefined,
      durationMinutes: url.searchParams.get("duration_minutes") || undefined,
      startTime: url.searchParams.get("start_time") || undefined
    });
    return Response.json(context);
  } catch (error) {
    return Response.json({ status: "error", step: "cycling_context", message: error.message }, { status: 502 });
  }
}

function authorizeStrength(request, env) {
  if (!env.STRENGTH_API_KEY) return Response.json({ status: "error", step: "strength_auth", message: "STRENGTH_API_KEY is not configured" }, { status: 503 });
  const authorization = request.headers.get("Authorization") || "";
  if (authorization !== `Bearer ${env.STRENGTH_API_KEY}`) return Response.json({ status: "error", step: "strength_auth", message: "Unauthorized" }, { status: 401 });
  return null;
}


// The strength plan of a day from D1 (gym_plans). The name stays from the
// Google Sheets era; Sheets are no longer read or written.
function pragueDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
async function fetchTodayValues(env, date = null) {
  const plan = await readGymPlan(env.DB, date || pragueDate());
  return { range: "d1:gym_plans/" + plan.date, values: plan.values, videoLinks: [], stored: plan.stored };
}
const SHEETS_RETIRED = () => Response.json({ status: "gone", message: "Google Sheets se už nepoužívá – silový plán je v databázi aplikace." }, { status: 410 });

async function readTodaySheet(env, url) {
  try {
    const date = url.searchParams.get("date");
    const data = await fetchTodayValues(env, /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : null);
    return Response.json({ status: "ok", storage: "d1", range: data.range, values: data.values, videoLinks: data.videoLinks, stored: data.stored });
  } catch (error) { return Response.json({ status: "error", step: "strength_plan_read", message: error.message }, { status: 500 }); }
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

async function generateStrengthPlanRoute(env, request, url) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = String(body?.date || url.searchParams.get("date") || "").trim() || null;
    const context = await buildStrengthContext(env, date);
    if (context.status !== "ok") throw new Error("Strength context is not ready");
    const options = {
      focus: body?.focus ? String(body.focus) : undefined,
      focusSource: body?.focusSource === "week" ? "week" : undefined,
      forceProtectLegs: body?.forceProtectLegs === true,
      durationMinutes: body?.durationMinutes == null ? undefined : Number(body.durationMinutes),
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
        const parsedToday = parseStrengthSheet(today.values);
        const currentExercises = [...new Set((parsedToday.rows || [])
          .filter(r => r.type === "WORK" && r.exercise)
          .map(r => String(r.exercise)))];
        options.excludeExercises = [...new Set([...options.excludeExercises, ...currentExercises])];
      } catch (_) {
        // Regeneration can still proceed from context if today's sheet cannot
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
      protectedLegs: plan.protectedLegs,
      loadFactor: plan.loadFactor
    });

    let intervals = { status: "skipped", reason: "INTERVALS_API_KEY is not configured" };
    try {
      intervals = await writeStrengthPlanToIntervals(env, plan, {
        startTime: body?.startTime || "00:00",
        durationMinutes: body?.durationMinutes || 60
      });
    } catch (error) {
      intervals = { status: "error", message: error.message };
    }

    const nutrition = buildNutritionPlan(context, { ...body, strengthPlan: plan });
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

async function syncStrength(env) {
  try {
    const data = await fetchTodayValues(env);
    const { parsed, ...result } = await syncGymPlanHistory(env.DB, data.values);
    return Response.json({ ...result, workoutDate: parsed?.date || null, sourceRange: data.range });
  } catch (error) { return Response.json({ status: "error", step: "strength_sync", message: error.message }, { status: 500 }); }
}

async function importStrengthHistoryRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await importStrengthHistory(env.DB, body);
    return Response.json(result);
  } catch (error) {
    return Response.json({ status: "error", step: "strength_history_import", message: error.message }, { status: 500 });
  }
}

async function maintainStrengthSheetsRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.historyImport?.date && Array.isArray(body.historyImport.sets)) await importStrengthHistory(env.DB, body.historyImport);
    // Nothing to maintain any more: plans and history are in D1.
    return Response.json({ status: "ok", storage: "d1", skipped: "Google Sheets se už nepoužívá." });
  } catch (error) {
    return Response.json({ status: "error", step: "strength_sheet_maintenance", message: error.message }, { status: 500 });
  }
}

async function strengthHistory(env, url) {
  try {
    const limit = url.searchParams.get("limit") || "100";
    const rows = await getStrengthHistory(env.DB, limit);
    return Response.json({ status: "ok", count: rows.length, rows });
  } catch (error) { return Response.json({ status: "error", step: "strength_history", message: error.message }, { status: 500 }); }
}

async function strengthContext(env, url) {
  try {
    const date = url.searchParams.get("date") || null;
    return Response.json(await buildStrengthContext(env, date));
  } catch (error) { return Response.json({ status: "error", step: "strength_context", message: error.message }, { status: 500 }); }
}

async function analyzeStrengthRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await fetchTodayValues(env);
    const parsed = parseStrengthSheet(data.values);
    const { parsed: _p, ...sync } = await syncGymPlanHistory(env.DB, data.values);
    const history = await getStrengthHistory(env.DB, 300);
    const analysis = analyzeCompletedWorkout(parsed, history);
    return Response.json({ status: "ok", command: body?.command || "analyze", sync, analysis });
  } catch (error) { return Response.json({ status: "error", step: "strength_analyze", message: error.message }, { status: 500 }); }
}

async function alternativesRoute(env, request) {
  try {
    const body = await request.json();
    const exercise = String(body?.exercise || "").trim();
    const muscle = String(body?.muscle || "").trim() || null;
    if (!exercise && !muscle) return Response.json({ status: "error", message: "Provide exercise or muscle" }, { status: 400 });
    const history = await getStrengthHistory(env.DB, 300);
    const alternatives = findExerciseAlternatives(exercise, history, muscle);
    return Response.json({ status: "ok", exercise: exercise || null, muscle: muscle || EXERCISE_INTELLIGENCE[exercise]?.muscle || null, alternatives });
  } catch (error) { return Response.json({ status: "error", step: "strength_alternatives", message: error.message }, { status: 500 }); }
}


async function nutritionPlanRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = String(body?.date || "").trim() || null;
    const context = await buildStrengthContext(env, date);
    if (context.status !== "ok") throw new Error("Shared daily context is not ready");

    let strengthPlan = body?.strengthPlan || null;
    if (!strengthPlan) {
      try {
        const sheet = await fetchTodayValues(env, date);
        const parsed = parseStrengthSheet(sheet.values);
        if (!date || parsed.date === date) {
          const rows = (parsed.rows || []).map(r => [
            r.type, r.exercise, r.setNo == null ? "" : String(r.setNo),
            r.plannedKg == null ? "" : String(r.plannedKg),
            r.plannedReps || "", "", "", "", "FALSE", r.note || "", r.video || ""
          ]);
          if (rows.some(r => r[0] === "WORK")) {
            strengthPlan = { date: parsed.date, rows };
          }
        }
      } catch (_) {
        // Nutrition remains available even if the optional sheet read fails.
      }
    }

    const plan = buildNutritionPlan(context, { ...body, strengthPlan, weightTrend: context.weightTrend });
    return Response.json({ status: "ok", plan });
  } catch (error) {
    return Response.json({ status: "error", step: "nutrition_plan", message: error.message }, { status: 500 });
  }
}

async function cookbookSearchRoute(env, url) {
  try {
    return Response.json(await searchCookbookRecipes({ page:url.searchParams.get("page"), name:url.searchParams.get("name"), limit:url.searchParams.get("limit") || 10 }));
  } catch (error) { return Response.json({ status:"error", step:"cookbook_search", message:error.message }, { status:500 }); }
}
async function cookbookRecipeRoute(env, url) {
  try {
    const recipe=await getCookbookRecipe({ page:url.searchParams.get("page"), name:url.searchParams.get("name"), recipeId:url.searchParams.get("recipe_id") });
    if (!recipe) return Response.json({ status:"error", message:"Recipe not found" }, { status:404 });
    return Response.json({ status:"ok", recipe });
  } catch (error) { return Response.json({ status:"error", step:"cookbook_recipe", message:error.message }, { status:500 }); }
}
async function logMealRoute(env, request) {
  try { return Response.json(await logFood(env.DB, await request.json().catch(()=>({})))); }
  catch (error) { return Response.json({ status:"error", step:"nutrition_log_meal", message:error.message }, { status:400 }); }
}
async function nutritionDayRoute(env, url) {
  try {
    const date=url.searchParams.get("date") || new Date().toISOString().slice(0,10);
    const context=await buildStrengthContext(env,date);
    const plan=buildNutritionPlan(context,{});
    const food=await getFoodDay(env.DB,date);
    const recommendations=recommendFood({day:date,nutritionPlan:plan,entries:food});
    const adaptive=buildAdaptiveDecision(context,{...food,nutritionTarget:plan});
    return Response.json({ status:"ok", date, plan, food, recommendations, adaptive });
  } catch (error) { return Response.json({ status:"error", step:"nutrition_day", message:error.message }, { status:500 }); }
}
async function nutritionRecommendRoute(env, request) {
  try {
    const body=await request.json().catch(()=>({})), date=String(body.date || new Date().toISOString().slice(0,10));
    const context=await buildStrengthContext(env,date), plan=buildNutritionPlan(context,{...body,weightTrend:context.weightTrend});
    const food=await getFoodDay(env.DB,date);
    return Response.json({...recommendFood({day:date,nutritionPlan:plan,entries:food}),adaptive:buildAdaptiveDecision(context,{...food,nutritionTarget:plan})});
  } catch (error) { return Response.json({ status:"error", step:"nutrition_recommend", message:error.message }, { status:500 }); }
}

async function dailyDecisionRoute(env, request) {
  try {
    const body=await request.json().catch(()=>({}));
    const date=String(body.date||"").trim()||null;
    const context=await buildStrengthContext(env,date);
    const plan=buildNutritionPlan(context,{...body,weightTrend:context.weightTrend});
    const food=await getFoodDay(env.DB,context.date);
    return Response.json({...buildAdaptiveDecision(context,{...food,nutritionTarget:plan}),nutrition:plan,food});
  } catch(error) { return Response.json({status:"error",step:"daily_decision",message:error.message},{status:500}); }
}
async function dailyPlanRoute(env,url) {
  try {
    const date=String(url.searchParams.get("date")||"").trim()||null;
    const context=await buildStrengthContext(env,date);
    const nutrition=buildNutritionPlan(context,{weightTrend:context.weightTrend});
    const food=await getFoodDay(env.DB,context.date);
    const recommendations=recommendFood({day:context.date,nutritionPlan:nutrition,entries:food});
    return Response.json(buildDailyPlan({context,nutrition,food,recommendations}));
  } catch(error) { return Response.json({status:"error",step:"daily_plan",message:error.message},{status:500}); }
}
async function weeklyReviewRoute(env,url) {
  try {
    const date=String(url.searchParams.get("date")||"").trim()||null;
    const context=await buildStrengthContext(env,date);
    return Response.json(await buildWeeklyReview(env,context,context.date));
  } catch(error) { return Response.json({status:"error",step:"weekly_review",message:error.message},{status:500}); }
}

async function foodResolveRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const cached = await lookupCachedFood(env.DB, body);
    if (cached) return Response.json({ ...cached, cached: true });
    const result = await resolveAndCacheFood(env.DB, body);
    return Response.json(result, { status: result.status === "not_found" ? 404 : 200 });
  } catch (error) { return Response.json({ status:"error", step:"food_resolve", message:error.message }, { status:502 }); }
}
async function foodProductRoute(env, url) {
  try {
    const barcode = url.searchParams.get("barcode");
    const name = url.searchParams.get("name");
    const cached = await lookupCachedFood(env.DB, { barcode, name });
    if (cached) return Response.json(cached);
    const result = await resolveAndCacheFood(env.DB, { barcode, name });
    return Response.json(result, { status: result.status === "not_found" ? 404 : 200 });
  } catch (error) { return Response.json({ status:"error", step:"food_product", message:error.message }, { status:502 }); }
}
async function foodFavoritesRoute(env,url) {
  try { return Response.json(await getFoodFavorites(env.DB,url.searchParams.get("limit")||20)); }
  catch(error) { return Response.json({status:"error",step:"food_favorites",message:error.message},{status:500}); }
}
async function logProductRoute(env, request) {
  try { return Response.json(await logResolvedFood(env.DB, await request.json().catch(()=>({})))); }
  catch (error) { return Response.json({ status:"error", step:"nutrition_log_product", message:error.message }, { status:400 }); }
}

async function consumeFoodRoute(env, request) {
  try { return Response.json(await consumePlannedFood(env.DB, await request.json().catch(()=>({})))); }
  catch (error) { return Response.json({ status:"error", step:"nutrition_consume", message:error.message }, { status:400 }); }
}
async function updateFoodRoute(env, request) {
  try { return Response.json(await updateFoodEntry(env.DB, await request.json().catch(()=>({})))); }
  catch (error) { return Response.json({ status:"error", step:"nutrition_food_update", message:error.message }, { status:400 }); }
}
async function cancelFoodRoute(env, request) {
  try {
    const body=await request.json().catch(()=>({}));
    return Response.json(await cancelFoodEntry(env.DB, body.id));
  } catch (error) { return Response.json({ status:"error", step:"nutrition_food_cancel", message:error.message }, { status:400 }); }
}

async function substituteRoute(env, request) {
  try {
    const body = await request.json();
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const muscle = String(body?.muscle || "").trim() || null;
    if (!from) return Response.json({ status: "error", message: "Missing from exercise" }, { status: 400 });
    if (!to && !muscle) return Response.json({ status: "error", message: "Provide to exercise or muscle" }, { status: 400 });

    const target = to || findExerciseAlternatives(from, [], muscle)[0]?.name;
    if (!target || !EXERCISES[target] || !EXERCISE_INTELLIGENCE[target]) return Response.json({ status: "error", message: `Replacement exercise is not in the active catalogue: ${target || "none"}` }, { status: 400 });
    if (!EXERCISES[from] && !EXERCISE_INTELLIGENCE[from]) return Response.json({ status: "error", message: `Original exercise is not in the active catalogue: ${from}` }, { status: 400 });

    const data = await fetchTodayValues(env);
    const parsed = parseStrengthSheet(data.values);
    if (!parsed.date) return Response.json({ status: "error", message: "Workout date not found in sheet" }, { status: 400 });
    const history = await getStrengthHistory(env.DB, 300);
    const context = await buildStrengthContext(env, parsed.date);
    const factor = Number(context?.cycling ? 1 : 1);
    const def = EXERCISES[target];
    const estimate = estimateStartingLoad({ exercise: target, history, targetReps: def.reps, fallbackKg: def.baseKg, loadFactor: factor });

    const sourceRows = parsed.rows.filter(r => r.exercise === from);
    if (!sourceRows.length) return Response.json({ status: "error", message: `Exercise not found in today's sheet: ${from}` }, { status: 404 });
    const sourceWork = sourceRows.filter(r => r.type === "WORK");
    const firstIndex = parsed.rows.findIndex(r => r.exercise === from);
    const before = parsed.rows.slice(0, firstIndex).filter(r => r.exercise !== from);
    const after = parsed.rows.slice(firstIndex).filter(r => r.exercise !== from);
    const replacementRows = [];
    const fmt = x => x == null ? "" : String(x).replace(".", ",");
    if (def.warmup) {
      const kg = estimate.kg ?? def.baseKg;
      replacementRows.push(["WARMUP", target, "1", fmt(Math.max(2, Math.round(kg * 0.4 * 2) / 2)), "8", "", "", "", "FALSE", "[WARMUP]", "🎥 Video"]);
      replacementRows.push(["WARMUP", target, "2", fmt(Math.max(2, Math.round(kg * 0.65 * 2) / 2)), "5", "", "", "", "FALSE", "[WARMUP]", ""]);
      replacementRows.push(["WARMUP", target, "3", fmt(Math.max(2, Math.round(kg * 0.8 * 2) / 2)), "3", "", "", "", "FALSE", "[WARMUP]", ""]);
    }
    const workCount = sourceWork.length || def.sets;
    for (let i = 0; i < workCount; i++) replacementRows.push(["WORK", target, String(i + 1), estimate.kg == null ? "" : fmt(estimate.kg), def.reps, "", "", "", "FALSE", "", ""]);

    const replacementPlan = [...before.map(r => [r.type, r.exercise, r.setNo == null ? "" : String(r.setNo), r.plannedKg == null ? "" : fmt(r.plannedKg), r.plannedReps, "", "", "", "FALSE", r.note, r.video]), ...replacementRows, ...after.map(r => [r.type, r.exercise, r.setNo == null ? "" : String(r.setNo), r.plannedKg == null ? "" : fmt(r.plannedKg), r.plannedReps, "", "", "", "FALSE", r.note, r.video])];
    await syncGymPlanHistory(env.DB, data.values);
    const result = await writeStrengthPlanToDb(env.DB, { date: parsed.date, rows: replacementPlan });
    return Response.json({ ...result, replaced: from, replacement: target, estimate });
  } catch (error) { return Response.json({ status: "error", step: "strength_substitute", message: error.message }, { status: 500 }); }
}
