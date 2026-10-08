import {initialImport,recentDashboardImport} from './account-sync.js';
import {reportFood} from './shared-foods.js';
import {onboardingStatus,completeOnboarding,trainingSetup,updateTrainingSetup} from './onboarding.js';
import {subscriptionStatus,markAiIntroSeen,assertAIAccess} from './subscription.js';
import {listRecipes,saveRecipe,deleteRecipe,searchRecipes} from './personal-recipes.js';
import {deletePersonalFood} from './personal-foods.js';
import {retryWorkoutExports,syncLocalWorkout,completeLocalWorkout,storeLocalEvent} from './local-workouts.js';
import app from "./strength-gateway.js";
import { buildCoachCouncil } from "./coach-engine.js";
import { buildRideReview } from "./ride-review.js";
import { buildRunReview } from "./run-review.js";
import { handleMcpCompat } from "./mcp-compat.js";
import { deleteDailyNutritionNotes } from "./intervals-nutrition-notes.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { dashboardPage } from "./dashboard.js";
import { connectionStatus } from "./connections.js";
import { connectionEnvironment, saveConnectionSecret, deleteConnectionSecret, missingProviders, migrateConnectionSecrets } from "./connection-secrets.js";
import { parseNutritionLabel, parseNutritionPortion, nutritionConsistency } from './food-label.js';
import { readFoodPhotoWithAI, readBarcodeWithAI } from './food-photo.js';
import { withIntervalsSleep } from './intervals-sleep.js';
import { cached, bumpCacheVersion } from './api-cache.js';
import { foodIntake } from './food-portions.js';
import {productFromLabel} from './food-sources.js';
import {activityDetail,rideIntervals} from './activity-detail.js';
import {getCookbookRecipeByPage} from './cookbook.js';
import {googleDashboard} from './google-dashboard.js';
import {applyEnergyBudget} from './energy-budget.js';
import {normalizeProfile} from './energy-profile.js';
import {athleteFocus} from './athlete-focus.js';
import {loadEffectiveProfile,refreshSuggestions} from './profile-suggestions.js';
import {syncWeights} from './weight-sync.js';
import {syncWellnessToIntervals} from './wellness-sync.js';
import {gymExerciseCatalog,gymAlternatives,gymLoadEstimate} from './gym-catalog.js';
import {askCoach,coachContext,lightModel,assistantTask,engineSport,pragueNow} from './coach-assistant.js';
import {assistantAppContext,selectedAssistantContext} from './assistant-app-context.js';
import {validateCoachActions,actionSafetyContext,actionsNote,actionSummary} from './coach-actions.js';
import {weekReviewContext,fallbackWeekReview,WEEK_REVIEW_REQUEST} from './weekly-plan-review.js';
import { buildReviewInput, reviewDay, usageCost } from "./coach-review.js";
import { createReflection, listReflections, activityFromRow, dedupeActivities } from "./coach-reflection.js";
import {savePersonalFood,searchFoodCatalog as searchPersonalFoods} from './personal-foods.js';
import {listPersonalFoods} from './personal-foods.js';
import {queueFoodGoogle,processFoodGoogle,foodGoogleStatus,retryFoodGoogle,backfillFoodGoogle} from './food-google-sync.js';
async function queueFoodGoogleSafely(env,ctx,id,options){
  try{
    const result=await queueFoodGoogle(env.DB,id,options);
    ctx.waitUntil(processFoodGoogle(env,{token:googleToken}).catch(error=>console.error('Food export',error.message)));
    return result;
  }catch{
    // The local write already succeeded. A retry must not create another meal.
    return {status:'error',message:L('Jídlo je uložené v aplikaci. Export do Google se nepodařilo připravit; zkus Odeslat znovu.', 'The meal is saved in the app. The export to Google couldn\'t be prepared; try Send again.')};
  }
}
import { lookupFoodWithAI } from "./food-ai.js";
import { addFluid, deleteFluid, listFluids, hydrationTarget, dayActivityHours, foodDrinks } from "./fluids.js";
import { isFoodLogMessage, buildFoodDraft, foodDraftSummary } from "./food-chat.js";
import dashboardClient from "./dashboard-client.js";
import { loadRecoveryValidation } from "./recovery-validation.js";
import { assetVersion, scriptCacheControl } from "./asset-version.js";

const CLIENT_VERSION = assetVersion(dashboardClient);
import { handleGoogleOAuth } from "./google-oauth.js";
import { importStrengthHistory, getStrengthHistory, parseStrengthPlan, removeManualSets } from "./strength-history.js";
import { searchCookbookRecipes, logFood, mealConsumedAt } from "./food-log.js";
import { getWorkout, searchWorkoutLibrary, parseWorkoutSearchFilters, getCapabilities, getScheduledWorkouts, recordWorkoutFeedback, scheduleWorkoutInIntervals, generateWorkout, pendingScheduledWorkouts, hasFeedback, markScheduleCompleted, scheduledLink, stepRows } from "./workout-library.js";
import { buildCyclingCoachV2 } from "./cycling-coach-v2.js";
import { athleteThresholds, rideFtpFor } from "./intervals-athlete.js";
import { renderForEnvironment } from "./workout-model.js";
import { plannedEventWorkout } from "./planned-detail.js";
import { getWeekPlan, saveWeekPlan, addWeekSport, resetWeekPlan, planWeekRoles, roleFor, weekTargets, targetFor, nightlyGymSkip, weekLoadsBefore, hrvWeekTrendDown, weeklyRunCap, capRunVolume } from "./week-planner.js";
import { availabilityOn, trainingBudget, validDay as validTrainingDay } from './training-availability.js';
import { getAthleteState, updateAthleteState, explicitPreference, assertTrainingAllowed, proactiveAdvice } from './athlete-state.js';
import { capWeekTargets, weekProposal, weekWeather, environmentFor, activityHistoryEstimate, indoorMinutes } from './adaptive-week.js';
import { movePlannedEvent, deletePlannedEvent, setPlannedEnvironment, isStrengthEvent } from "./planned-events.js";
import { loadFitnessInsights, exerciseMuscles } from "./fitness-insights.js";
import { adjustGymPlan, cleanGymRows, catalogNames } from "./gym-adjust.js";
import { saveTrainingProfile } from "./training-profile.js";
import { removePlannedEventCalories } from "./intervals-calories.js";
import { readGymPlan, cancelGymPlan, restoreGymPlan, ensureGymPlans, moveGymPlan } from "./gym-plan-store.js";
import { listRecovery, addRecovery, updateRecovery } from "./recovery-plan.js";
import { nightDetail } from "./night-detail.js";
import { applyGymSwap } from './coach-gym-adjustment.js';
import { dashboardSyncStatus,startDashboardSync } from './dashboard-sync.js';
import { assistantStreamResponse } from './assistant-stream.js';
import { writeStrengthPlanToIntervals } from './intervals-strength.js';
import { estimateFtp, estimateThresholdPace, FTP_METHODS, PACE_METHODS, POWER_ZONE_MODELS, PACE_ZONE_MODELS, HR_ZONE_MODELS } from "./training-zones.js";
import {updateFoodEntry,copyFoodEntry,deleteFoodEntry} from './food-entry-management.js';
import legacyHealthApi, { googleToken } from "./index.js";
import { handleGoogleLogin } from "./google-login.js";
import { chatContext, appendChatTurn, listChats, readChat, deleteChat } from "./assistant-chats.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { isStaging, markStaging } from "./staging.js";
import { techniqueFor, ownExerciseVideo, saveOwnExerciseVideo, storedTechnique, generateTechnique, exerciseInUse } from "./exercise-technique.js";
import { isPublicPath, resolvePrincipal, unauthorizedResponse, handleDashboardLogout, verifyDashboardSession, sessionSecret, foreignOriginChange } from "./dashboard-auth.js";
import { internalHeaders } from "./internal-auth.js";
import { aiAllowance } from "./ai-usage.js";
import { exportAccountData, deleteAccount, finishAccountDeletions } from "./account-data.js";
import { handleIntervalsOAuth } from "./intervals-oauth.js";
import { ensureTenancy, TenancyUpgradeInProgress, userEnv, findUser, ownerUser, usersWithProviders, listUsersAndInvites, inviteUser, removeInvite, setUserDisabled } from "./tenancy.js";
import { pragueToday } from './prague-date.js';
import { overviewPage, privacyPage, termsPage, supportPage } from './site-pages.js';
import { englishScript } from './i18n.js';
import { dateFormat } from "./date-format.js";
import { lang, withLang, storedLanguage, rememberLanguage, L } from "./lang.js";

const OPENAPI_URL = "https://raw.githubusercontent.com/shaarkyn/health-api/main/openapi.json";

// A month of Google Health samples summed per day: thousands of rows that only a
// sync changes (every five minutes, or the Obnovit button, which drops the cache).
const googleHealthFor = (env, ctx, date) => cached(env, ctx, "google-dashboard:" + date, () => googleDashboard(env.DB, date), { ttl: 120 });

// Requests that read or preview only and so keep the cache.
const CACHE_NEUTRAL = /^\/app\/api\/(food\/(label|photo|search|ai-lookup)|workouts\/generate|gym\/generate|gym\/technique|training-profile\/estimate|assistant$|assistant\/stream|assistant\/chats)/;
const STATIC_PATHS = new Set(['/app','/app/dashboard-client.js','/app/i18n-en.js','/manifest.webmanifest','/logo.svg','/','/privacy','/terms','/support','/mcp/health']);

// Runs fn once per active user (with that user's env and credentials), for
// cron jobs and GitHub automations that act on everyone's data.
async function forEachUser(env, providers, fn) {
  const results = [];
  for (const user of await usersWithProviders(env.DB, env, providers)) {
    try {
      const scoped = await connectionEnvironment(userEnv(env, user));
      // Texts written by a job (workouts sent to Intervals.icu, …) use the user's app language.
      if (providers.some(p => (scoped.CONNECTED_PROVIDERS || []).includes(p))) results.push({ userId: user.id, result: await withLang(await storedLanguage(env.DB, user.id, { fresh: true }), () => fn(scoped, user)) });
    } catch (error) {
      console.error("Per-user job failed", user.id, error.message);
      results.push({ userId: user.id, error: error.message });
    }
  }
  return results;
}


const worker = {
  async scheduled(controller, env, ctx) {
    await ensureTenancy(env.DB, env);
    // Data of deleted accounts that the delete request had no time for.
    if (controller.cron === "* * * * *") await finishAccountDeletions(env.DB).catch(error => console.error("Account deletion failed", error.message));
    await forEachUser(env, ["google", "intervals"], scoped => app.scheduled(controller, scoped, ctx));
    // Connection keys saved before CONNECTION_KEY existed get it (connection-secrets.js).
    if (controller.cron === "* * * * *" && new Date().getUTCMinutes() % 5 === 0) await migrateConnectionSecrets(env).then(result => { if (result.migrated || result.failed) console.log("Connection key migration", result); }).catch(error => console.error("Connection key migration failed", error.message));
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()%5===0)await forEachUser(env,['google'],async scoped=>{await backfillFoodGoogle(scoped.DB);return processFoodGoogle(scoped,{token:googleToken});});
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()%5===0)await forEachUser(env,['intervals'],async scoped=>{await retryWorkoutExports(scoped);});
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()%5===0)await forEachUser(env,['intervals'],scoped=>legacyHealthApi.fetch(new Request('https://internal/sync/intervals/recent',{method:'POST'}),scoped,ctx));
    // Hourly, half an hour after the Google Health sync: weight the same in the
    // app, Google Health and Intervals.icu, and Google wellness (sleep, steps,
    // heart rate, HRV, …) copied into Intervals.icu.
    if (controller.cron === "* * * * *" && new Date().getUTCMinutes() === 30) await forEachUser(env, ["intervals"], async scoped => ({
      weight: await syncWeights(scoped, { googleToken }).catch(error => ({ error: error.message })),
      wellness: await syncWellnessToIntervals(scoped, { sleepSessions: (from, to) => legacyHealthApi.fetch(new Request(`https://internal/health/sleep?start=${from}&end=${shiftDate(to, 1)}`), scoped, ctx).then(r => r.json()).then(d => d.sessions || []) }).catch(error => ({ error: error.message }))
    }));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Static pages stay independent of storage availability.
    if (STATIC_PATHS.has(url.pathname) && request.method === 'GET') return staticRoute(url, request, env);
    try { await ensureTenancy(env.DB, env, { request }); }
    catch (error) {
      if (error instanceof TenancyUpgradeInProgress) return Response.json({status:"error",message:error.message},{status:503,headers:{"Retry-After":"30","Cache-Control":"no-store"}});
      throw error;
    }
    const rawEnv = env;
    // Deny by default: only allowlisted routes are reachable without a session or API key.
    const principal = await resolvePrincipal(request, env);
    const isPublic = isPublicPath(url.pathname);
    if (!isPublic && !principal) return unauthorizedResponse();
    let user = null;
    if (principal?.kind === "user") {
      user = await findUser(env.DB, principal.userId, env);
      if (!user && !isPublic) return unauthorizedResponse();
    } else if (principal?.kind === "owner" || principal?.kind === "system" || url.pathname === "/mcp") {
      // The shared API key (MCP, API clients) and GitHub automations act as the owner.
      user = await ownerUser(env.DB, env);
    }
    if (user) env = await connectionEnvironment(userEnv(rawEnv, user));
    else env = { ...rawEnv, DB: null, RAW_DB: rawEnv.DB };
    // Everything written for the user in this request follows the app language:
    // the app sends it with each request; otherwise the remembered choice.
    const headerLang = request.headers.get('X-Interface-Language');
    const cookieLang = /(?:^|;\s*)lw-lang=(cs|en)/.exec(request.headers.get('cookie') || '')?.[1];
    if (user && headerLang) await rememberLanguage(rawEnv.DB, user.id, headerLang);
    const language = headerLang || cookieLang || (user ? await storedLanguage(rawEnv.DB, user.id) : 'cs');
    return withLang(language, () => routeRequest(request, env, ctx, { url, rawEnv, principal, user, isPublic }));
  }
};

async function routeRequest(request, env, ctx, { url, rawEnv, principal, user, isPublic }) {
    {
    // Every change made with the session cookie, whatever the route.
    if (foreignOriginChange(request, principal)) return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const signedIn = principal?.kind === "user" && Boolean(user);
    if(env.AI_PAYWALL_ENABLED==='true'&&/^\/app\/api\/(assistant(?:\/stream)?$|gym\/adjust$|food\/(ai-lookup|photo|chat)$|review(?:\/|$))/.test(url.pathname)){
      try{await assertAIAccess(env);}catch(error){return Response.json({status:'subscription_required',message:error.message},{status:402});}
    }


    // Legacy Google Health endpoints live in index.js. The deployed Worker
    // uses entrypoint.js, so expose these routes explicitly instead of letting
    // them fall through to the dashboard gateway.
    if (url.pathname === "/sync/intervals" && principal?.kind === "system" && request.method === "POST") {
      return Response.json({status:"ok",users:await forEachUser(rawEnv,["intervals"],scoped=>legacyHealthApi.fetch(request.clone(),scoped,ctx).then(r=>r.json().catch(()=>({status:r.status}))))});
    }
    if (url.pathname === "/sync/google" || url.pathname === "/sync/google/status" || url.pathname === "/health/sleep") {
      return legacyHealthApi.fetch(request, env, ctx);
    }
    if (url.pathname === "/automation/strength") return handleStrengthAutomation(request, env, ctx);
    if (url.pathname === "/automation/nutrition") return handleNutritionAutomation(request, env, ctx);
    if (url.pathname === "/automation/nutrition-notes") return handleNutritionNotesAutomation(request, rawEnv);
    if (url.pathname === "/automation/planned-calories") return handlePlannedCaloriesAutomation(request, rawEnv);
    if (url.pathname === "/mcp") return handleMcpCompat(request, env);
    if (url.pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
      if (!env.OPENAI_APP_CHALLENGE) return new Response("Not configured", { status: 404 });
      return new Response(env.OPENAI_APP_CHALLENGE, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    if ((url.pathname.startsWith('/oauth/google') || url.pathname.startsWith('/oauth/intervals')) && !signedIn) return new Response(L('Připojení vyžaduje přihlášení do dashboardu.', 'Connecting requires signing in to the app.'),{status:401});
    const googleOAuth = await handleGoogleOAuth(request, env, url.pathname);
    if (googleOAuth) {if(url.pathname==="/oauth/google/callback"&&googleOAuth.status===302){await dashboardSyncStatus(env.DB);await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name='initial_google'").bind(env.USER_ID).run();await initialImport(await connectionEnvironment(env),ctx);}return googleOAuth;}
    const intervalsOAuth = await handleIntervalsOAuth(request, env, url.pathname);
    // A new Intervals.icu connection imports its history, the same as a pasted key.
    if (intervalsOAuth) {if(url.pathname==="/oauth/intervals/callback"&&intervalsOAuth.status===302){await dashboardSyncStatus(env.DB);await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name='initial_intervals'").bind(env.USER_ID).run();await initialImport(await connectionEnvironment(env),ctx);}return intervalsOAuth;}
    if (url.pathname === "/app/logout" && request.method === "POST") return handleDashboardLogout();
    const googleLogin = await handleGoogleLogin(request, rawEnv, url.pathname);
    if (googleLogin) return googleLogin;
    if (url.pathname.startsWith("/app/api/")) {
      if (!user) return unauthorizedResponse();
      const response = await handleDashboardApi(request, env, ctx, url, { user, signedIn });
      // A change by the user makes the cached coach inputs outdated.
      if (request.method !== "GET" && !CACHE_NEUTRAL.test(url.pathname)) await bumpCacheVersion(env.DB);
      return response;
    }
    if (url.pathname === "/openapi.json" && request.method === "GET") {
      const response = await fetch(OPENAPI_URL, { cf: { cacheTtl: 60 } });
      if (!response.ok) return new Response(JSON.stringify({ status: "error", message: "OpenAPI schema unavailable" }), { status: 502, headers: { "content-type": "application/json" } });
      const text = await response.text();
      return new Response(text, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
    }
    if (!user) return unauthorizedResponse();
    return app.fetch(request, env, ctx);
    }
}

export default {
  scheduled: worker.scheduled,
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    return isStaging(env) ? markStaging(response) : response;
  }
};

async function staticRoute(url, request, env) {
  if (url.pathname === "/mcp/health") return Response.json({ status: "ok", service: "health-api-mcp", version: "1.1.0", endpoint: "/mcp", protocol: "2026-07-28+legacy" });
  if (url.pathname === "/app") return dashboardPage({ clientVersion: CLIENT_VERSION, account: (await verifyDashboardSession(request, sessionSecret(env)))?.uid ?? "" });
  if (url.pathname === "/app/i18n-en.js") return englishScript(url);
  if (url.pathname === "/app/dashboard-client.js") return new Response(dashboardClient, { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": scriptCacheControl(url, CLIENT_VERSION) } });
  if (url.pathname === "/") return overviewPage(request);
  if (url.pathname === "/privacy") return privacyPage(request);
  if (url.pathname === "/terms") return termsPage(request);
  if (url.pathname === "/support") return supportPage(request);
  if (url.pathname === "/logo.svg") return logoResponse();
  return Response.json({name:"Loadwise",short_name:"Loadwise",start_url:"/app",scope:"/app",display:"standalone",background_color:"#0a0d12",theme_color:"#0d131a",icons:[{src:"/logo.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]},{headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"public, max-age=3600"}});
}


// The dashboard profile (age, height, sex, …) with height and activity from
// Google Health and steps filling the gaps; null when there is nothing yet.
async function dashboardProfile(env) {
  return loadEffectiveProfile(env.DB, env.USER_ID);
}

async function ensureCoachInboxTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS coach_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    message TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coach_inbox_user_0 ON coach_inbox(user_id, created_at DESC)`).run();
}

function coachChannel(value, message) {
  const requested=String(value||"").toLowerCase();
  if (["cycling","gym","nutrition","food"].includes(requested)) return requested;
  const t=String(message||"").toLowerCase();
  if (/j[ií]d|recept|kalori|protein|sachar|sni?d|ob[eě]d|ve[cč]eř|zapsat/.test(t)) return "nutrition";
  if (/posil|gym|dřep|drep|bench|mrtv|s[eé]ri/.test(t)) return "gym";
  return "cycling";
}

async function createCoachDraft(env, ctx, internalAuth, body) {
  const message=String(body?.message||"").trim();
  if(!message) throw new Error(L("Napiš zprávu pro trenéra.", "Write a message for the coach."));
  const channel=coachChannel(body?.channel,message), date=String(body?.date||pragueToday()).slice(0,10);
  let reply="", action={type:"advice",date};
  if(channel==="gym") {
    const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date,preview:true})}),env,ctx);
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.status!=="ok") throw new Error(d.message||L("Gym plán se nepodařilo připravit.", "The gym plan couldn't be prepared."));
    const rows=(d.plan?.rows||[]).filter(x=>String(x.type||"").toUpperCase()==="WORK");
    reply=L(`Připravil jsem návrh ${d.plan?.planName||"silového tréninku"}: ${[...new Set(rows.map(x=>x.exercise))].slice(0,4).join(" · ")}. Je postavený podle regenerace, cyklistiky a tvé historie.`, `I've prepared ${d.plan?.planName||"a strength workout"}: ${[...new Set(rows.map(x=>x.exercise))].slice(0,4).join(" · ")}. It's built around your recovery, cycling and your history.`);
    action={type:"gym_generate",date};
  } else if(channel==="nutrition") {
    const page=Number((message.match(/(?:str(?:ana|\.)?|page)\s*(\d{1,3})/i)||[])[1]);
    const recipes=await searchCookbookRecipes({page:Number.isFinite(page)&&page>0?page:undefined,name:Number.isFinite(page)&&page>0?undefined:message,limit:3});
    const recipe=recipes.recipes?.[0]||null;
    if(recipe) {
      reply=L(`Našel jsem v kuchařce „${recipe.name}“${recipe.page?` (str. ${recipe.page})`:""}: ${Math.round(Number(recipe.calories||0))} kcal · B ${Math.round(Number(recipe.protein_g||0))} g · S ${Math.round(Number(recipe.carbs_g||0))} g · T ${Math.round(Number(recipe.fat_g||0))} g. Potvrzením ho zapíšeš do dnešní výživy.`, `I found “${recipe.name}” in the cookbook${recipe.page?` (p. ${recipe.page})`:""}: ${Math.round(Number(recipe.calories||0))} kcal · P ${Math.round(Number(recipe.protein_g||0))} g · C ${Math.round(Number(recipe.carbs_g||0))} g · F ${Math.round(Number(recipe.fat_g||0))} g. Confirm to log it in today's nutrition.`);
      action={type:"food_log",date,page:recipe.page,name:recipe.name};
    } else reply=L("V kuchařce jsem nenašel jednoznačný recept. Napiš název receptu nebo číslo strany a připravím zápis.", "I didn't find a clear match in the cookbook. Write the recipe name or page number and I'll prepare the entry.");
  } else {
    reply=channel==="cycling"?L("Cyklistický trenér bere kolo jako hlavní prioritu. Pro přesný návrh napiš délku, typ jízdy a zda chceš plán nebo kontrolu existující jednotky.", "The cycling coach treats the bike as the main priority. For a precise proposal, write the duration, the type of ride and whether you want a plan or a check of an existing session."):L("Připravil jsem doporučení.", "I've prepared a recommendation.");
  }
  const draft={channel,message,date,reply,action};
  const ins=await env.DB.prepare("INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)").bind(env.USER_ID,channel,message,JSON.stringify(draft)).run();
  return {status:"ok",draftId:ins.meta?.last_row_id,draft};
}

async function handleCoachInbox(request, env, ctx, internalAuth) {
  try {
    await ensureCoachInboxTable(env.DB);
    if(request.method==="GET") {
      const rows=await env.DB.prepare("SELECT id,channel,message,draft_json,status,created_at,confirmed_at FROM coach_inbox WHERE user_id=? ORDER BY id DESC LIMIT 30").bind(env.USER_ID).all();
      return Response.json({status:"ok",items:(rows.results||[]).map(r=>({...r,draft:JSON.parse(r.draft_json||"{}")}))},{headers:{"Cache-Control":"no-store"}});
    }
    const body=await request.json().catch(()=>({}));
    if(body?.action!=="confirm") return Response.json(await createCoachDraft(env,ctx,internalAuth,body),{headers:{"Cache-Control":"no-store"}});
    const id=Number(body?.draftId); if(!id) return Response.json({status:"error",message:L("Chybí návrh k potvrzení.", "The proposal to confirm is missing.")},{status:400});
    const row=await env.DB.prepare("SELECT * FROM coach_inbox WHERE id=? AND user_id=?").bind(id,env.USER_ID).first();
    if(!row) return Response.json({status:"error",message:L("Návrh už neexistuje.", "The proposal no longer exists.")},{status:404});
    if(row.status==="confirmed") return Response.json({status:"ok",message:L("Tento návrh už je potvrzený.", "This proposal is already confirmed.")});
    const draft=JSON.parse(row.draft_json||"{}"); let result={status:"ok"};
    if(draft.kind)return Response.json({status:'error',message:L('Tento návrh potvrď v osobním asistentovi nebo v náhledu gymu.', 'Confirm this proposal in the personal assistant or in the gym preview.')},{status:400});
    if(draft.action?.type==="gym_generate") {
      const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date:draft.date})}),env,ctx);
      result=await r.json().catch(()=>({status:"error",message:L("Neplatná odpověď Gymu", "Invalid response from the gym planner")})); if(!r.ok||result.status!=="ok") throw new Error(result.message||L("Gym plán se nepodařilo uložit.", "The gym plan couldn't be saved."));
    }
    if(draft.action?.type==="food_log") result=await logFood(env.DB,{date:draft.date,page:draft.action.page,name:draft.action.name,source:"cookbook",note:L("Zapsáno ze schránky trenérů", "Logged from the coaches' inbox")});
    await env.DB.prepare("UPDATE coach_inbox SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,env.USER_ID).run();
    return Response.json({status:"ok",message:draft.action?.type==="food_log"?L("Jídlo je zapsané ve výživě.", "The meal is logged in Nutrition."):draft.action?.type==="gym_generate"?L("Gym plán je uložený a odeslaný do tréninku.", "The gym plan is saved and sent to your training."):L("Doporučení potvrzeno.", "Recommendation confirmed."),result},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return Response.json({status:"error",message:error.message},{status:500}); }
}

// Marks scheduled library workouts as done once Intervals.icu shows the ride.
// Capability only changes with the athlete's own feedback (see calculateCapabilityUpdate).
// The completed activity paired with a scheduled library workout, and how
// much of it was done (time, or training load when both are known).
async function matchScheduledActivity(env,ctx,internalAuth,link){
  const response=await app.fetch(new Request('https://internal/analysis/daily?date='+link.scheduled_date,{headers:internalAuth}),env,ctx);
  if(!response.ok)return null;const daily=await response.json().catch(()=>({})),matched=daily.training?.matched||[],completed=daily.training?.completed||[];
  const match=matched.find(m=>String(m.planned?.id||'')===String(link.intervals_event_id||'')||String(m.planned?.name||'').trim().toLowerCase()===String(link.name||'').trim().toLowerCase());
  if(!match)return null;
  const actual=completed.find(a=>String(a.id||'')===String(match.actualId||''))||completed.find(a=>String(a.pairedEventId||a.plannedEventId||'')===String(link.intervals_event_id||''));
  if(!actual)return null;
  const actualMinutes=Number(actual.durationHours)>0?Number(actual.durationHours)*60:null;
  if(actualMinutes==null)return null;
  const plannedTss=Number(match.planned?.tss),actualTss=Number(actual.tss);
  const ratio=plannedTss>0&&actualTss>0?actualTss/plannedTss:actualMinutes/Math.max(1,Number(link.duration_minutes));
  const rawRpe=actual.rpe??actual.payload?.icu_rpe??actual.payload?.rpe;
  return {actual,activityId:actual.source==='intervals'?String(actual.payload?.id||actual.id||''):null,completedPercent:Math.round(Math.max(0,Math.min(120,ratio*100))),rpe:Number.isFinite(Number(rawRpe))&&Number(rawRpe)>=1&&Number(rawRpe)<=10?Number(rawRpe):null};
}
async function reconcileWorkoutLibraryCompletions(env,ctx,internalAuth){
  try{
    for(const link of await pendingScheduledWorkouts(env.DB,pragueToday())){
      if(await hasFeedback(env.DB,link.workout_id,link.scheduled_date)){await markScheduleCompleted(env.DB,link.id);continue}
      const m=await matchScheduledActivity(env,ctx,internalAuth,link);
      if(!m)continue;
      await recordWorkoutFeedback(env.DB,{workoutId:link.workout_id,scheduledDate:link.scheduled_date,completedPercent:m.completedPercent,rpe:m.rpe,survey:"auto_completed",notes:L("Automaticky spárováno s dokončenou aktivitou v Intervals.icu", "Automatically matched with a completed activity in Intervals.icu")});
    }
  }catch(error){console.error("Workout capability reconciliation failed",error)}
}
// RPE on the completed activity in Intervals.icu (whole numbers 1–10).
async function writeIntervalsRpe(env,activityId,rpe){
  if(!env.INTERVALS_API_KEY||!activityId)return {status:'skipped'};
  try{
    const r=await fetch('https://intervals.icu/api/v1/activity/'+encodeURIComponent(activityId),{method:'PUT',headers:{Authorization:intervalsAuthorization(env.INTERVALS_API_KEY),Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({icu_rpe:Math.round(Number(rpe))}),signal:AbortSignal.timeout(10000)});
    return r.ok?{status:'ok'}:{status:'error',message:L('Intervals.icu odpovědělo HTTP ', 'Intervals.icu answered HTTP ')+r.status};
  }catch(error){return {status:'error',message:error.message}}
}

// Load targets of a week: CTL and daily load from Intervals.icu wellness, what
// is done or planned per day from D1, then the shared calculation.
const sportOfType=t=>{t=String(t||'').toLowerCase();return /weight|strength/.test(t)?'gym':/ride|cycl|bike/.test(t)?'ride':/run/.test(t)?'run':null;};
async function computeWeekTargets(env,ctx,start,prefs){
  const end=shiftDate(start,7),today=pragueToday();
  const fitness=await handleDashboardApi(new Request('https://internal/app/api/fitness?days=42'),env,ctx,new URL('https://internal/app/api/fitness?days=42')).then(r=>r.json()).catch(()=>({}));
  const wellness=(fitness.wellness||[]).filter(r=>r.id<=today),ctl=[...wellness].reverse().find(r=>Number(r.ctl)>0)?.ctl;
  const loadOn=date=>{const r=wellness.find(x=>x.id===date);return Number(r?.ctlLoad??r?.atlLoad)||0;};
  let lastWeekLoad=0;for(let i=-7;i<0;i++)lastWeekLoad+=loadOn(shiftDate(start,i));
  const rows=(await env.DB.prepare("SELECT data_type,source_family,start_time,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family IN ('intervals','local') AND data_type IN ('planned-workout','activity')) OR (source_family='google-wearables' AND data_type='exercise')) AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID,start,end).all().catch(()=>({results:[]}))).results||[];
  const gymDays=new Set(((await env.DB.prepare("SELECT DISTINCT workout_date FROM strength_sets WHERE user_id=? AND workout_date>=? AND workout_date<?").bind(env.USER_ID,start,end).all().catch(()=>({results:[]}))).results||[]).map(r=>r.workout_date));
  const days=Array.from({length:7},(_,i)=>({date:shiftDate(start,i),done:loadOn(shiftDate(start,i)),planned:0,sports:[]}));
  // Running this week so far: done runs, and planned ones still ahead.
  let runCommitted=0;
  for(const r of rows){let p={};try{p=JSON.parse(r.payload_json||'{}');}catch{}const d=days.find(x=>x.date===String(r.start_time||'').slice(0,10));if(!d)continue;
    const sport=sportOfType(r.source_family==='google-wearables'?{WEIGHTLIFTING:'weight',STRENGTH_TRAINING:'weight',RUNNING:'run',BIKING:'ride'}[p.exercise?.exerciseType]:p.type);
    if(r.data_type==='planned-workout'&&!/nutrition/i.test(String(p.name||'')+' '+String(p.category||''))){d.planned+=Number(p.icu_training_load)||0;}
    if(sport==='run')runCommitted+=r.data_type==='planned-workout'?(d.date>today?(Number(p.moving_time)||0)/60:0):activityFromRow(r)?.minutes||0;
    if(sport&&!/nutrition/i.test(String(p.name||'')))d.sports.push(sport);}
  for(const d of days)if(gymDays.has(d.date))d.sports.push('gym');
  // The forecast decides outdoor or indoor (and so the length) unless the athlete chose.
  const weather=await weekWeather(prefs.location,start).catch(()=>({}));
  const runCap=weeklyRunCap(await planningHistory(env,start,28).catch(()=>[]),start);
  return capWeekTargets(capRunVolume(weekTargets({roles:planWeekRoles(prefs.days),ctl,lastWeekLoad,weekLoads:weekLoadsBefore(wellness,start),hrvDown:hrvWeekTrendDown(wellness,start),rampRate:[...wellness].reverse().find(r=>Number.isFinite(Number(r.rampRate)))?.rampRate??null,days,today,weekStart:start}),runCap,runCommitted),prefs,[],weather);
}
const mondayOfDate=iso=>shiftDate(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));

// Everything the coaches look at for one day: the day, fitness, three weeks
// around it, gym history, sleep and Google Health.
// Cached for a few minutes per user and day; any change the user makes resets it.
function loadCoachInputs(env,ctx,internalAuth,date){return cached(env,ctx,'coach-inputs:'+date,()=>loadCoachInputsFresh(env,ctx,internalAuth,date));}
// The recorded intervals of a day's completed rides and runs, keyed by activity id (one
// small Intervals.icu request per ride, cached).
const isRideType=a=>/^(Ride|VirtualRide|EBikeRide|Cycling|MountainBikeRide|GravelRide|Run|VirtualRun|TrailRun|Treadmill)$/i.test(a?.type||'');
async function rideDetailsFor(env,ctx,training){
  return Object.fromEntries(await Promise.all((training?.completed||[]).filter(isRideType).slice(0,3).map(a=>{
    const id=String(a.payload?.id||String(a.id).replace(/^activity:/,''));
    return cached(env,ctx,'ride-intervals:'+id,()=>rideIntervals(env,id),{ttl:21600}).then(x=>[a.id,x],()=>[a.id,null]);
  })));
}
// The same ride and run reviews the Today screen shows, compact, for the AI coach.
async function rideReviewsForCoach(env,ctx,training,date,wellness,thresholds=null){
  const rides=(training?.completed||[]).filter(isRideType).slice(0,3);if(!rides.length)return [];
  const details=await rideDetailsFor(env,ctx,training).catch(()=>({})),rows=Array.isArray(wellness)?wellness:[],latest=rows.filter(r=>String(r.id||'')<=date).at(-1)||{};
  const tsb=latest.ctl!=null&&latest.atl!=null?Number(latest.ctl)-Number(latest.atl):null;
  return rides.map(a=>{
    const plan=(training.matched||[]).find(m=>String(m.actualId)===String(a.id))?.planned||null;
    const input={activity:a,detail:details[a.id],plan,wellness:rows,fitness:{tsb},date},r=/run|treadmill/i.test(a.type||'')?buildRunReview({...input,thresholdPace:thresholds?.runThresholdPace}):buildRideReview(input);
    return {date,type:a.type||null,name:a.name||null,plan:plan?.name||null,verdict:r.verdict,target:r.target,blocks:r.table,findings:Object.fromEntries(r.sections.map(x=>[x.kind,x.items]))};
  });
}
async function loadCoachInputsFresh(env,ctx,internalAuth,date){
  const monday=iso=>shiftDate(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));
  const start=monday(date),weeks=[shiftDate(start,-7),start,shiftDate(start,7)];
  const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
  const json=r=>r.json().catch(()=>({}));
  const [dailyResponse,fitnessResponse,gymResponse,sleepResponse,health]=await Promise.all([
    app.fetch(new Request('https://internal/analysis/daily?date='+date,{headers:internalAuth}),env,ctx),
    cached(env,ctx,'fitness:90',()=>internal('/app/api/fitness?days=90').then(json)).then(d=>Response.json(d)),internal('/app/api/gym?date='+date),
    app.fetch(new Request('https://internal/health/sleep?start='+shiftDate(date,-7)+'&end='+shiftDate(date,1),{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})).then(d=>withIntervalsSleep(env,d,shiftDate(date,-7),shiftDate(date,1))).then(d=>Response.json(d)),
    googleHealthFor(env,ctx,date).catch(()=>({}))
  ]);
  // The three weeks are the heavy part (every day's analysis, food and
  // recommendations). One week at a time, cached and shared by every day of
  // that week, so the database is never asked for all of them at once.
  const weekData=[];
  for(const w of weeks)weekData.push(await cached(env,ctx,'week:'+w,()=>internal('/app/api/week?start='+w).then(json)));
  const [daily,fitness,gym,sleep,profile]=await Promise.all([json(dailyResponse),json(fitnessResponse),json(gymResponse),json(sleepResponse),dashboardProfile(env)]);
  applyEnergyBudget(daily,profile,health);
  return {date,daily,fitness,gym,health:{...health,sleep:sleep.sessions||[]},week:{status:'ok',days:weekData.flatMap(w=>w.days||[])},focus:athleteFocus(profile,date),profile:profile?{sex:profile.sex,age:profile.age,height:profile.height,training:await trainingSetup(env.DB)}:null,athleteState:await getAthleteState(env.DB)};
}

async function planningHistory(env,date,days=84){
  const from=shiftDate(date,-days),to=shiftDate(date,1);
  const [rows,gymDays]=await Promise.all([
    env.DB.prepare("SELECT start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(env.USER_ID,from,to).all().then(r=>r.results||[]).catch(()=>[]),
    env.DB.prepare('SELECT DISTINCT workout_date FROM strength_sets WHERE user_id=? AND workout_date>=? AND workout_date<?').bind(env.USER_ID,from,to).all().then(r=>r.results||[]).catch(()=>[])
  ]);
  const activities=dedupeActivities(rows.map(activityFromRow)),byDate=new Map();
  for(const a of activities){if(!byDate.has(a.date))byDate.set(a.date,[]);byDate.get(a.date).push({name:a.name,type:a.kind==='strength'?'WeightTraining':a.kind,durationHours:a.minutes==null?null:a.minutes/60,tss:a.tss});}
  for(const g of gymDays){if(!byDate.has(g.workout_date))byDate.set(g.workout_date,[]);if(!byDate.get(g.workout_date).some(a=>a.type==='WeightTraining'))byDate.get(g.workout_date).push({type:'WeightTraining',name:'Gym'});}
  return [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,completed])=>({date,daily:{training:{completed}}}));
}


// The athlete's recent RPE and notes on library workouts, newest first.
async function recentWorkoutFeedback(db,since,limit=10){
  const rows=(await db.prepare("SELECT scheduled_date,workout_id,sport,rpe,notes,completed_percent FROM workout_feedback WHERE user_id=? AND survey<>'auto_completed' AND scheduled_date>=? ORDER BY scheduled_date DESC,id DESC LIMIT ?").bind(db.userId,since,limit).all().catch(()=>({results:[]}))).results||[];
  const out=[];
  for(const r of rows){const w=await getWorkout(db,r.workout_id).catch(()=>null);out.push({date:r.scheduled_date,workoutId:r.workout_id,name:w?.name||r.workout_id,system:w?.primary_system||null,sport:r.sport,rpe:r.rpe,notes:r.notes||null,completedPercent:r.completed_percent});}
  return out;
}

// Everything the coach's note looks at for one day: 5 weeks of activities
// (to know the usual routine), form, sleep, the day's food and recent feedback.
async function reflectionData(env,ctx,internalAuth,date,workoutId=null){
  const from=shiftDate(date,-35),to=shiftDate(date,1);
  const activityRows=(await env.DB.prepare(`SELECT start_time,end_time,payload_json FROM health_datapoints
    WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<?
      AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time`).bind(env.USER_ID,from,to).all().catch(()=>({results:[]}))).results||[];
  const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
  const [fitness,sleep,food,recentFeedback,workout,profile]=await Promise.all([
    internal('/app/api/fitness?days=42').then(r=>r.json()).catch(()=>({})),
    app.fetch(new Request('https://internal/health/sleep?start='+shiftDate(date,-21)+'&end='+to,{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})).then(d=>withIntervalsSleep(env,d,shiftDate(date,-21),to)),
    env.DB.prepare("SELECT consumed_at,recipe_title,kcal,carbs_g FROM food_logs WHERE user_id=? AND consumed_date=? AND (status IS NULL OR status='eaten') ORDER BY consumed_at").bind(env.USER_ID,date).all().then(r=>r.results||[]).catch(()=>[]),
    recentWorkoutFeedback(env.DB,shiftDate(date,-21)),
    workoutId?getWorkout(env.DB,workoutId).catch(()=>null):null,
    dashboardProfile(env).catch(()=>null)
  ]);
  // The next two days' plan, so the coach knows whether tomorrow is a rest day or a hard session.
  const nextDays=await Promise.all([1,2].map(async k=>{const d=shiftDate(date,k);
    const [daily,gym]=await Promise.all([app.fetch(new Request('https://internal/analysis/daily?date='+d,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({})),readGymPlan(env.DB,d).catch(()=>null)]);
    const planned=(daily.training?.planned||[]).filter(p=>!/nutrition|note/i.test(String(p.category||''))).map(p=>({name:p.name||null,type:p.type||null,minutes:Number(p.durationHours)>0?Math.round(Number(p.durationHours)*60):null,tss:Number(p.tss)>0?Math.round(Number(p.tss)):null}));
    const gymName=gym?.stored?String(gym.values?.[2]?.[3]||'Posilovna'):null;
    if(gymName&&!planned.some(p=>/weight|strength|gym/i.test(String(p.type||''))))planned.push({name:gymName,type:'WeightTraining',minutes:null,tss:null});
    return {date:d,planned,restDay:!planned.length};}));
  // One night per day: the longest session ending that day.
  const nights=new Map();for(const s of sleep.sessions||[]){const d=s.date||String(s.endTime||'').slice(0,10);if(d&&(!nights.has(d)||Number(s.durationMin)>Number(nights.get(d).durationMin)))nights.set(d,{date:d,durationMin:Number(s.durationMin)||null});}
  return {
    workout:workout?{id:workout.id,name:workout.name,system:workout.primary_system,sport:workout.sport,durationMinutes:workout.duration_minutes}:null,
    activities:dedupeActivities(activityRows.map(activityFromRow)),
    wellness:fitness.wellness||[],sleep:[...nights.values()],food,recentFeedback,nextDays,focus:athleteFocus(profile,date),athleteState:await getAthleteState(env.DB)
  };
}

// Earlier proposals of the assistant from the last week and what became of them.
async function recentCoachProposals(env){
  await ensureCoachInboxTable(env.DB);
  const rows=(await env.DB.prepare("SELECT draft_json,status,created_at FROM coach_inbox WHERE user_id=? AND status IN ('draft','confirmed','rejected') AND created_at>=datetime('now','-7 days') AND draft_json LIKE '%\"coach_action\"%' ORDER BY id DESC LIMIT 12").bind(env.USER_ID).all()).results||[];
  const label={draft:L('čeká na rozhodnutí', 'waiting for a decision'),confirmed:L('potvrzeno', 'confirmed'),rejected:L('odmítnuto', 'rejected')};
  return rows.map(r=>{let d={};try{d=JSON.parse(r.draft_json||'{}');}catch{/* skipped */}return d.kind==='coach_action'&&d.action?{proposal:actionSummary(d.action),status:label[r.status],createdAt:String(r.created_at).slice(0,16)}:null;}).filter(Boolean);
}
// Midnight of a Prague day as a UTC timestamp in SQLite's format.
function pragueDayStartUtc(date){
  for(const hours of [1,2]){const at=new Date(Date.parse(date+'T00:00:00Z')-hours*3600e3);if(dateFormat('sv-SE',{timeZone:'Europe/Prague',hour:'2-digit',hourCycle:'h23'}).format(at)==='00')return at.toISOString().slice(0,19).replace('T',' ');}
  return date+' 00:00:00';
}

async function handleDashboardApi(request, env, ctx, url, session = {}) {
  env={...env,INTERFACE_LANGUAGE:lang()};
  const internalAuth = internalHeaders();
  if(url.pathname==='/app/api/athlete-state'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      if(request.method==='GET')return Response.json({status:'ok',state:await getAthleteState(env.DB)},{headers:{'Cache-Control':'no-store'}});
      if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json();
      return Response.json({status:'ok',state:await updateAthleteState(env.DB,{status:body.status,note:body.note,statusUntil:body.statusUntil,forget:body.forget,dismiss:body.dismiss})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  if(url.pathname==='/app/api/coach/check-in'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const date=pragueToday(),state=await getAthleteState(env.DB),inputs=await loadCoachInputs(env,ctx,internalAuth,date);
      return Response.json({status:'ok',state,advice:proactiveAdvice({...inputs,state})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/coach/week'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json(),start=validTrainingDay(body.start)?mondayOfDate(body.start):mondayOfDate(pragueToday());
      const today=pragueToday();
      const [prefs,state,inputs,athleteFeedback,coachNotes]=await Promise.all([getWeekPlan(env.DB,start),getAthleteState(env.DB),loadCoachInputs(env,ctx,internalAuth,today),recentWorkoutFeedback(env.DB,shiftDate(today,-21)),listReflections(env.DB,{limit:5}).catch(()=>[])]);
      if(!inputs.week.days.some(d=>d.date===start)){const extra=await handleDashboardApi(new Request('https://internal/app/api/week?start='+start),env,ctx,new URL('https://internal/app/api/week?start='+start));const data=await extra.json();inputs.week.days.push(...(data.days||[]));}
      const [weather,history]=await Promise.all([weekWeather(prefs.location,start),planningHistory(env,start<pragueToday()?start:pragueToday(),28)]),proposal=weekProposal({prefs,state,start,today:pragueToday(),week:inputs.week,fitness:inputs.fitness,focus:inputs.focus,weather,history});
      const context=weekReviewContext({inputs,prefs,state,start,today,proposal,weather,history,athleteFeedback,coachNotes});
      const weeks=[...new Set(inputs.week.days.filter(d=>d.date>=today&&d.date<=context.reviewScope.end).map(d=>mondayOfDate(d.date)))];
      const effectiveWeeks=new Map(await Promise.all(weeks.map(async w=>[w,await getWeekPlan(env.DB,w)])));
      context.availabilityByDate=Object.fromEntries(inputs.week.days.filter(d=>d.date>=today&&d.date<=context.reviewScope.end).map(d=>[d.date,effectiveWeeks.get(mondayOfDate(d.date)).availability[(new Date(d.date+'T12:00:00Z').getUTCDay()+6)%7]]));
      if(start<today)context.weatherUpcoming=await weekWeather(prefs.location,today);
      let review=fallbackWeekReview(context),aiError=null;
      // "Vygenerovat tréninky" only needs the week's sessions; the AI review is the chat's.
      if(body.review===false)return Response.json({status:'ok',start,proposal,actions:[]},{headers:{'Cache-Control':'no-store'}});
      if(env.OPENAI_API_KEY){try{
        review={...await askCoach(env,WEEK_REVIEW_REQUEST,context,{focus:inputs.focus,task:'planning',actions:true,concise:true}),source:'ai'};
      }catch(error){aiError=error.message}}
      context.userMessage=L('Zkontroluj budoucí plán a navrhni změny.', 'Review the upcoming plan and suggest changes.');
      const actions=validateCoachActions(review.actions,context,today),drafts=[];await ensureCoachInboxTable(env.DB);
      for(const action of actions){const ins=await env.DB.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)').bind(env.USER_ID,'cycling',L('Revize budoucího plánu od ', 'Review of the upcoming plan from ')+today,JSON.stringify({kind:'coach_action',action})).run();drafts.push({...action,draftId:ins.meta?.last_row_id});}
      return Response.json({status:'ok',start,proposal,review:{...review,actions:drafts},actions:drafts,reviewScope:context.reviewScope,reviewedCount:context.remainingPlanned.length,aiError},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  if (url.pathname === "/app/api/me" && request.method === "GET") {
    const [onboarding,ai]=await Promise.all([onboardingStatus(env),session.signedIn&&env.OPENAI_API_KEY?aiAllowance(env).catch(error=>{console.error('AI usage read failed',error.message);return null;}):null]);
    return Response.json({status:"ok",user:session.user||null,missingProviders:missingProviders(env),onboarding,ai},{headers:{"Cache-Control":"no-store"}});
  }
  // The user's own data: download everything, or delete the account with it.
  if(url.pathname==='/app/api/account/export'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const data=await exportAccountData(env,session.user);
    return new Response(JSON.stringify(data,null,1),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="loadwise-data-'+pragueToday()+'.json"','Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/account/delete'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    if(String(body.confirm||'').trim().toUpperCase()!=='SMAZAT')return Response.json({message:'Pro potvrzení napiš SMAZAT.'},{status:400});
    try{
      const result=await deleteAccount(await connectionEnvironment(env),session.user);
      // The session cookie goes too.
      return Response.json(result,{headers:{'Cache-Control':'no-store','Set-Cookie':handleDashboardLogout().headers.get('Set-Cookie')}});
    }catch(error){return Response.json({message:error.message},{status:400});}
  }
  if(url.pathname==='/app/api/subscription'&&request.method==='GET')return Response.json(await subscriptionStatus(env),{headers:{'Cache-Control':'no-store'}});
  if(url.pathname==='/app/api/subscription/intro'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    return Response.json(await markAiIntroSeen(env),{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/training-setup'){
    if(request.method==='GET')return Response.json({status:'ok',training:await trainingSetup(env.DB)},{headers:{'Cache-Control':'no-store'}});
    if(request.method==='PATCH'){
      if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      try{const training=await updateTrainingSetup(env.DB,await request.json());await bumpCacheVersion(env.DB);return Response.json({status:'ok',training});}catch(error){return Response.json({message:error.message},{status:400});}
    }
  }
  if(url.pathname==='/app/api/onboarding'){
    if(request.method==='GET')return Response.json(await onboardingStatus(env),{headers:{'Cache-Control':'no-store'}});
    if(request.method==='POST'){
      if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      try{const result=await completeOnboarding(env,await request.json());await bumpCacheVersion(env.DB);const sync=await initialImport(env,ctx);return Response.json({...result,sync});}
      catch(error){return Response.json({message:error.message},{status:400});}
    }
  }
  if(url.pathname==='/app/api/food/report'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{return Response.json(await reportFood(env.DB,await request.json()));}catch(error){return Response.json({message:error.message},{status:400});}
  }
  if(url.pathname==='/app/api/food/recipes'){
    if(request.method==='GET')return Response.json({status:'ok',recipes:await listRecipes(env.DB)},{headers:{'Cache-Control':'no-store'}});
    if(['POST','PATCH','DELETE'].includes(request.method)){
      if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      try{const body=await request.json();if(request.method==='DELETE'){await deleteRecipe(env.DB,body.id);return Response.json({status:'ok'});}return Response.json({status:'ok',recipe:await saveRecipe(env.DB,body)});}catch(error){return Response.json({message:error.message},{status:400});}
    }
  }
  if(url.pathname==='/app/api/food/personal'&&['PATCH','DELETE'].includes(request.method)){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{const body=await request.json();if(!body.id)throw new Error(L('Chybí potravina.', 'The food is missing.'));if(request.method==='DELETE'){await deletePersonalFood(env.DB,body.id);return Response.json({status:'ok'});}return Response.json({status:'ok',product:await savePersonalFood(env.DB,body)});}catch(error){return Response.json({message:error.message},{status:400});}
  }
  if(url.pathname==='/app/api/workouts/manual'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json(),minutes=Number(body.minutes),name=String(body.name||'').trim().slice(0,180),date=String(body.date||''),completed=body.completed===true;
      if(!validTrainingDay(date)||!name||!Number.isFinite(minutes)||minutes<=0||minutes>1440||!['ride','run','gym'].includes(body.sport))throw new Error(L('Vyplň název, datum, sport a délku.', 'Fill in the name, date, sport and duration.'));
      if(completed&&date>pragueToday()||!completed&&date<pragueToday())throw new Error(L('Zkontroluj datum a zda je trénink dokončený.', 'Check the date and whether the workout is completed.'));
      if(!completed)assertTrainingAllowed(await getAthleteState(env.DB));
      const type=body.sport==='gym'?'WeightTraining':body.sport==='run'?'Run':'Ride';
      const requestId=/^[A-Za-z0-9_-]{10,80}$/.test(String(body.requestId||''))?String(body.requestId):crypto.randomUUID();
      const event={external_id:'manual:'+requestId,category:'WORKOUT',name,type,start_date_local:date+'T12:00:00',moving_time:minutes*60,description:String(body.notes||'').slice(0,1000)};
      const saved=await storeLocalEvent(env.DB,event);if(completed)await completeLocalWorkout(env.DB,saved.id,{minutes,rpe:body.rpe,notes:body.notes});
      return Response.json({status:'ok',eventId:'planned:'+saved.id,sync:completed?{status:'not_exported'}:await syncLocalWorkout(env,saved.id)});
    }catch(error){return Response.json({message:error.message},{status:400});}
  }
  if(url.pathname==='/app/api/workouts/export'&&request.method==='POST'){
    if(!session.signedIn||request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json();return Response.json({status:'ok',sync:await syncLocalWorkout(env,String(body.eventId||'').replace(/^planned:/,''))});
  }
  if (url.pathname.startsWith("/app/api/admin/")) return handleAdminApi(request, env, url, session);
  // Connections are optional: without them the dashboard works from manual
  // entries (weight, food) and the profile; missingProviders drives the
  // connection prompt in the client.
  if(url.pathname==='/app/api/gym/exercises'&&request.method==='GET')return Response.json({status:'ok',exercises:gymExerciseCatalog()},{headers:{'Cache-Control':'no-store'}});
  // Replacements for one exercise of a day's plan (workout mode, gym table).
  if(url.pathname==='/app/api/gym/alternatives'&&request.method==='GET'){
    const date=/^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date')||''))?url.searchParams.get('date'):pragueToday(),exercise=String(url.searchParams.get('exercise')||'').slice(0,120);
    const [plan,history]=await Promise.all([readGymPlan(env.DB,date).catch(()=>null),getStrengthHistory(env.DB,500).catch(()=>[])]);
    const inPlan=[...new Set((plan?.values||[]).slice(7).map(r=>r?.[1]).filter(Boolean))];
    return Response.json({status:'ok',exercise,alternatives:gymAlternatives(exercise,history,inPlan)},{headers:{'Cache-Control':'no-store'}});
  }
  // Loads for exercises added by hand, or a plan's sets left without a weight.
  if(url.pathname==='/app/api/gym/estimate'&&request.method==='GET'){
    let names=[];try{names=JSON.parse(url.searchParams.get('names')||'[]');}catch{}
    const list=(Array.isArray(names)?names:[]).slice(0,30).map(n=>String(n).slice(0,120)).filter(Boolean);
    const history=await getStrengthHistory(env.DB,500).catch(()=>[]);
    return Response.json({status:'ok',estimates:Object.fromEntries(list.map(name=>[name,gymLoadEstimate(name,history)]).filter(([,e])=>e))},{headers:{'Cache-Control':'no-store'}});
  }
  // Muscles of exercises added to a proposal (its body figure).
  if(url.pathname==='/app/api/gym/muscles'&&request.method==='GET'){
    let names=[];try{names=JSON.parse(url.searchParams.get('names')||'[]');}catch{}
    const list=(Array.isArray(names)?names:[]).slice(0,30).map(n=>String(n).slice(0,120)).filter(Boolean);
    return Response.json({status:'ok',muscles:Object.fromEntries(list.map(name=>[name,exerciseMuscles(name)]))},{headers:{'Cache-Control':'no-store'}});
  }
  // A plan changed by the athlete's words in its preview; nothing is saved here.
  if(url.pathname==='/app/api/gym/adjust'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({message:L('AI není připojena (chybí OPENAI_API_KEY).', 'AI is not connected (OPENAI_API_KEY is missing).')},{status:503});
    try{
      const body=await request.json().catch(()=>({})),text=String(body.request||'').trim().slice(0,300);
      if(!text)throw new Error(L('Napiš, co v tréninku změnit.', 'Write what to change in the workout.'));
      const rows=cleanGymRows(body.rows,new Set([...catalogNames(),...(Array.isArray(body.rows)?body.rows:[]).map(r=>String(r?.[1]??'').trim()).filter(Boolean)]));
      const history=await getStrengthHistory(env.DB,300).catch(()=>[]);
      const result=await adjustGymPlan(env,{rows,request:text,history});
      const muscles=Object.fromEntries([...new Set(result.rows.map(r=>r[1]))].map(name=>[name,exerciseMuscles(name)]));
      return Response.json({status:'ok',...result,muscles},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.limit?error.message:error.ai?L('AI úprava se nepovedla: ', 'The AI edit failed: ')+error.message:error.message},{status:error.limit?(error.status||429):error.ai?502:400})}
  }
  if(url.pathname==='/app/api/sync/recent'&&request.method==='POST')return legacyHealthApi.fetch(new Request('https://internal/sync/google/recent',{method:'POST',headers:internalAuth}),env,ctx);
  if(url.pathname==='/app/api/profile'){await env.DB.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY (user_id,id))").run();if(request.method==='POST'){const profile=normalizeProfile(await request.json().catch(()=>({})));await env.DB.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(env.USER_ID,JSON.stringify(profile)).run();return Response.json({status:'ok',profile});}const r=await env.DB.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1').bind(env.USER_ID).first();const suggestions=await refreshSuggestions(env,{googleToken}).catch(error=>{console.error('Profile suggestions failed',error.message);return null;});return Response.json({profile:r?JSON.parse(r.profile_json):null,suggestions});}
  if(url.pathname==='/app/api/google-health'&&request.method==='GET'){
    const date=url.searchParams.get('date')||pragueToday();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>pragueToday())return Response.json({message:L('Neplatné datum.', 'Invalid date.')},{status:400});
    return Response.json(await googleHealthFor(env,ctx,date),{headers:{'Cache-Control':'no-store'}});
  }
  // Planned workouts: move (drag between days) or delete, in Intervals.icu and locally.
  if(url.pathname==='/app/api/planned/move'||url.pathname==='/app/api/planned/delete'||url.pathname==='/app/api/planned/environment'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json().catch(()=>({}));
      if(url.pathname.endsWith('/move')&&String(body.date||'')<pragueToday())return Response.json({status:'error',message:'Trénink jde přesunout jen na dnešek nebo pozdější den.'},{status:400});
      if(url.pathname.endsWith('/environment')){const result=await setPlannedEnvironment(env,body);return Response.json(result,{headers:{'Cache-Control':'no-store'}});}
      return Response.json(url.pathname.endsWith('/move')?await movePlannedEvent(env,body):await deletePlannedEvent(env,body),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // "Revize dne": the coach checks one planned day in the context of the week.
  if(url.pathname==='/app/api/coach/review'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:L('AI není připojena (chybí OPENAI_API_KEY).', 'AI is not connected (OPENAI_API_KEY is missing).')},{status:503});
    try{
      const body=await request.json().catch(()=>({})),date=/^\d{4}-\d{2}-\d{2}$/.test(String(body.date||''))?body.date:pragueToday();
      const [inputs,gym,prefs,feedback,notes]=await Promise.all([loadCoachInputs(env,ctx,internalAuth,date),readGymPlan(env.DB,date).catch(()=>null),getWeekPlan(env.DB,date).catch(()=>null),recentWorkoutFeedback(env.DB,shiftDate(date,-21)).catch(()=>[]),listReflections(env.DB,{limit:3}).catch(()=>[])]);
      const gymRows=gym?.stored?parseStrengthPlan(gym.values).rows||[]:[];
      const input=buildReviewInput({date,today:pragueToday(),week:inputs.week,fitness:inputs.fitness,health:inputs.health,gymRows,roles:prefs?planWeekRoles(prefs.days):[],feedback,coachNotes:notes.map(r=>({date:r.date,text:r.text}))});
      const state=await getAthleteState(env.DB);Object.assign(input,{athleteState:state.status,statusNote:state.note,preferenceMemory:state.memories,availability:availabilityOn(prefs,date)});
      const reviews=[await reviewDay(env,input,null,inputs.focus).catch(error=>({model:lightModel(env),error:error.message}))];
      return Response.json({status:'ok',date,reviews},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // Recovery sessions (stretching) the athlete adds to a day from the coach's note.
  if(url.pathname==='/app/api/night'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const date=/^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date')||''))?url.searchParams.get('date'):pragueToday();
    try{return Response.json(await nightDetail(env.DB,{date}),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.message},{status:500});}
  }
  if(url.pathname==='/app/api/recovery'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!Number.isNaN(Date.parse(v+'T12:00:00Z'));
    try{
      if(request.method==='GET'){const from=day(url.searchParams.get('from'))?url.searchParams.get('from'):shiftDate(pragueToday(),-7),to=day(url.searchParams.get('to'))?url.searchParams.get('to'):shiftDate(pragueToday(),14);
        return Response.json({status:'ok',sessions:await listRecovery(env.DB,{from,to})},{headers:{'Cache-Control':'no-store'}});}
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json().catch(()=>({}));
      if(request.method==='POST'){
        if(!day(body.date)||body.date<shiftDate(pragueToday(),-1)||body.date>shiftDate(pragueToday(),14))return Response.json({message:L('Vyber den od včerejška do dvou týdnů dopředu.', 'Choose a day from yesterday up to two weeks ahead.')},{status:400});
        const sport=['ride','run','gym'].includes(body.sport)?body.sport:null;
        return Response.json({status:'ok',session:await addRecovery(env.DB,{date:body.date,sport,focus:String(body.focus||'').slice(0,200),note:String(body.note||'').slice(0,1000)})},{headers:{'Cache-Control':'no-store'}});
      }
      const id=Number(body.id);if(!Number.isInteger(id)||id<1)return Response.json({message:L('Chybí záznam.', 'The entry is missing.')},{status:400});
      if(request.method==='PATCH'){await updateRecovery(env.DB,id,{done:Boolean(body.done)});return Response.json({status:'ok'});}
      if(request.method==='DELETE'){await updateRecovery(env.DB,id,{remove:true});return Response.json({status:'ok'});}
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // The coach's notes: listed per day; a POST asks for a note on a day now.
  if(url.pathname==='/app/api/coach/reflections'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const validDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&String(v)<=pragueToday();
    try{
      if(request.method==='GET'){const date=url.searchParams.get('date');
        // A day ahead has no notes yet; only a missing date lists the latest ones.
        if(date&&!validDay(date))return Response.json({status:'ok',reflections:[]},{headers:{'Cache-Control':'no-store'}});
        return Response.json({status:'ok',reflections:await listReflections(env.DB,{date:date||null,limit:10})},{headers:{'Cache-Control':'no-store'}});}
      if(request.method==='POST'){
        if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
        const body=await request.json().catch(()=>({})),date=validDay(body.date)?body.date:pragueToday();
        const notes=typeof body.notes==='string'&&body.notes.trim()?body.notes.trim().slice(0,1000):null,rpe=Number.isFinite(Number(body.rpe))&&Number(body.rpe)>=1&&Number(body.rpe)<=10?Number(body.rpe):null;
        const reflection=await createReflection(env,{date,rpe,notes},day=>reflectionData(env,ctx,internalAuth,day));
        return Response.json({status:'ok',reflection},{headers:{'Cache-Control':'no-store'}});
      }
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // Does the recovery index track how training goes for this athlete?
  // (src/recovery-validation.js, docs/methodology.md)
  if(url.pathname==='/app/api/recovery-validation'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.','Sign in to the app.')},{status:401});
    try{
      const today=pragueToday(),days=Math.max(30,Math.min(120,Number(url.searchParams.get('days')||120))),from=shiftDate(today,-days);
      const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
      const [fitness,sleep]=await Promise.all([
        internal('/app/api/fitness?days=180').then(r=>r.json()).catch(()=>({})),
        app.fetch(new Request('https://internal/health/sleep?start='+from+'&end='+shiftDate(today,1),{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})).then(d=>withIntervalsSleep(env,d,from,shiftDate(today,1)))
      ]);
      return Response.json(await loadRecoveryValidation(env.DB,{today,days,intervalsWellness:fitness.wellness||[],sleepSessions:sleep.sessions||[]}),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/fitness-insights'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{return Response.json(await loadFitnessInsights(env.DB,pragueToday()),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/week-plan'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      let prefs;
      const start=url.searchParams.get('start');
      if(start&&!validTrainingDay(start))throw new Error(L('Neplatné datum týdne.', 'Invalid week date.'));
      if(request.method==='POST'){if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});prefs=await saveWeekPlan(env.DB,await request.json(),start);}
      else if(request.method==='DELETE'){if(!start)throw new Error(L('Vyber týden.', 'Choose a week.'));if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});prefs=await resetWeekPlan(env.DB,start);}
      else if(request.method==='GET')prefs=await getWeekPlan(env.DB,start);
      else return Response.json({message:'Method not allowed'},{status:405});
      const monday=start?mondayOfDate(start):mondayOfDate(pragueToday());
      const targets=await computeWeekTargets(env,ctx,monday,prefs).catch(error=>({status:'error',message:error.message,items:[]}));
      const historyEstimate=activityHistoryEstimate(await planningHistory(env,pragueToday(),21),pragueToday());
      return Response.json({status:'ok',prefs,roles:planWeekRoles(prefs.days),start:monday,targets,historyEstimate},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  if(url.pathname==='/app/api/training-profile'||url.pathname==='/app/api/training-profile/estimate'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      if(request.method==='POST'&&url.pathname.endsWith('/estimate')){const body=await request.json().catch(()=>({}));return Response.json({status:'ok',...(body.kind==='pace'?estimateThresholdPace(String(body.method||''),body.inputs||{}):estimateFtp(String(body.method||''),body.inputs||{}))});}
      if(request.method==='POST'){await saveTrainingProfile(env.DB,await request.json().catch(()=>({})));}
      else if(request.method!=='GET')return Response.json({message:'Method not allowed'},{status:405});
      const t=await athleteThresholds(env);
      return Response.json({status:'ok',profile:t.profile,resolved:{ftp:t.ftp,ftpSource:t.source,indoorFtp:t.indoorFtp,intervalsFtp:t.intervalsFtp,latestRideFtp:t.latestRideFtp,lthr:t.lthr,maxHr:t.maxHr,restHr:t.restHr,runThresholdPace:t.runThresholdPace,runPaceSource:t.runPaceSource,intervalsRunPace:t.intervalsRunPace,runLthr:t.runLthr},powerZones:t.powerZones,hrZones:t.hrZones,paceZones:t.paceZones,runHrZones:t.runHrZones,
        ftpMethods:Object.entries(FTP_METHODS).map(([id,m])=>({id,label:m.label,inputs:m.inputs.map(([key,label])=>({key,label}))})),
        paceMethods:Object.entries(PACE_METHODS).map(([id,m])=>({id,label:m.label,inputs:m.inputs.map(([key,label])=>({key,label}))})),
        paceZoneModels:Object.entries(PACE_ZONE_MODELS).map(([id,m])=>({id,label:m.label,bounds:m.bounds})),
        powerZoneModels:Object.entries(POWER_ZONE_MODELS).map(([id,m])=>({id,label:m.label,bounds:m.bounds})),hrZoneModels:Object.entries(HR_ZONE_MODELS).map(([id,m])=>({id,label:m.label,reference:m.reference}))},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  if(url.pathname.startsWith('/app/api/workouts/')){
    const r=await handleWorkoutsApi(request,env,ctx,url,session,internalAuth);
    if(r)return r;
  }

  if(url.pathname==='/app/api/assistant'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({})),message=String(body.message||'').trim();
    if(!message||message.length>4000)return Response.json({message:L('Zadej požadavek do 4000 znaků.', 'Enter a request of up to 4,000 characters.')},{status:400});
    // A lasting preference is saved only once the request has been answered.
    const memory=explicitPreference(message),athleteState=await getAthleteState(env.DB);
    const saveMemory=()=>memory?updateAthleteState(env.DB,{memory}).catch(error=>{console.error('Preference save failed',error.message);}):null;
    // Each answer belongs to a chat; without a known chat id a new chat starts.
    const remember=async answer=>appendChatTurn(env.DB,body.chatId,message,answer).catch(error=>{console.error('Chat save failed',error.message);return null;});
    if(!env.OPENAI_API_KEY){if(!memory)return Response.json({status:'unavailable',message:L('AI není připojena (chybí OPENAI_API_KEY).', 'AI is not connected (OPENAI_API_KEY is missing).')},{status:503});await saveMemory();return Response.json({status:'ok',answer:'Zapamatoval jsem si: '+memory,memorySaved:memory,chatId:await remember('Zapamatoval jsem si: '+memory)});}
    // "Měl jsem snickers": a draft of food entries to confirm, not a coach answer.
    if(body.mode!=='coach'&&isFoodLogMessage(message)){
      try{const draft=await buildFoodDraft(env,message,pragueToday());if(draft.items.length){const answer=foodDraftSummary(draft);return Response.json({status:'ok',kind:'food_draft',draft,answer,chatId:await remember(answer)},{headers:{'Cache-Control':'no-store'}});}}
      catch(error){console.error('Food sentence failed',error.message);}
    }
    // The chat so far decides the depth too: a follow-up keeps the topic's context.
    const date=pragueToday(),appContext=assistantAppContext(body.appContext,date),conversation=await chatContext(env.DB,body.chatId).catch(()=>[]);
    const task=assistantTask(message,body.appContext?appContext:null,conversation),started=Date.now();
    const availabilityMinutes=Number.isFinite(Number(body.availabilityMinutes))?Number(body.availabilityMinutes):null;
    const manualReadiness=Number.isFinite(Number(body.manualReadiness))?Number(body.manualReadiness):null;
    const goal=body.goal&&typeof body.goal==='object'?body.goal:null;
    const preferences=body.preferences&&typeof body.preferences==='object'?body.preferences:{};
    const reply=async (onAnswer,onProgress=()=>{})=>{
      let inputs={},coachCtx={date,now:pragueNow()},selected=null,focus=null;
      onProgress(L('Trenér připravuje odpověď…', 'The coach is preparing an answer…'));
      if(task!=='simple'){
        ctx.waitUntil(reconcileWorkoutLibraryCompletions(env,ctx,internalAuth).catch(error=>console.error('Assistant reconciliation failed',error.message)));
        const [loaded,capabilities,athleteFeedback,notes,prefs,blockHistory,thresholds,earlierProposals]=await Promise.all([
          loadCoachInputs(env,ctx,internalAuth,date),getCapabilities(env.DB),recentWorkoutFeedback(env.DB,shiftDate(date,-28)),listReflections(env.DB,{limit:5}).catch(()=>[]),
          getWeekPlan(env.DB,date).then(async prefs=>({...prefs,weather:task==='adjustment'?null:await weekWeather(prefs.location,mondayOfDate(date))})),
          task==='block'?planningHistory(env,date,84):null,
          cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>null),
          recentCoachProposals(env).catch(()=>[])
        ]);
        const internalJson=async path=>{const response=await handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));if(!response.ok)throw new Error(L('Vybraný trénink se nepodařilo načíst.', 'The selected workout couldn\'t be loaded.'));return response.json();};
        selected=await selectedAssistantContext(appContext,loaded,{loadGym:date=>internalJson('/app/api/gym?date='+date),loadWeek:start=>internalJson('/app/api/week?start='+start),loadPrefs:start=>getWeekPlan(env.DB,start)});
        loaded.week=selected.week;
        inputs=loaded;focus=loaded.focus;Object.assign(preferences,{...prefs,...preferences});
        // Each day's time budget comes from its own week's plan.
        const thisWeek=mondayOfDate(date),mondays=[...new Set(selected.week.days.filter(d=>d.date>=date).map(d=>mondayOfDate(d.date)))];
        const plans=new Map(await Promise.all(mondays.map(async w=>[w,w===thisWeek?prefs:await getWeekPlan(env.DB,w).catch(()=>null)])));
        const safety=actionSafetyContext(selected.week.days,date,day=>plans.get(mondayOfDate(day)));
        // The forecast for the open week too, when it is not this one.
        const openWeekWeather=task!=='adjustment'&&selected.appContext.weekStart!==thisWeek?await weekWeather(prefs.location,selected.appContext.weekStart).catch(()=>({})):{};
        const coachNotes=notes.map(r=>({date:r.date,text:r.text}));
        coachCtx=coachContext({...inputs,availabilityMinutes,manualReadiness,goal,preferences,capabilities,athleteFeedback,coachNotes,athleteState,thresholds,profile:inputs.profile,focus,sport:engineSport(focus,selected.appContext),now:pragueNow(),availabilityByDate:safety.availabilityByDate});
        Object.assign(coachCtx,{availability:prefs.availability,weeklyActivities:prefs.weeklyActivities,weather:{...(prefs.weather||{}),...openWeekWeather},coachProposals:earlierProposals},safety);
        Object.assign(coachCtx,{appContext:selected.appContext,selectedGym:selected.selectedGym,selectedDay:selected.selectedDay,selectedWeek:selected.selectedWeek});
        const reviewDay=selected.appContext.date<=date&&selected.selectedDay?selected.appContext.date:date;
        const reviews=await rideReviewsForCoach(env,ctx,reviewDay===date?inputs.daily?.training:selected.selectedDay,reviewDay,inputs.fitness?.wellness,thresholds).catch(()=>[]);
        if(reviews.length)coachCtx.completedRideReviews=reviews;
        if(blockHistory)Object.assign(coachCtx,{blockHistory,blockFitness:inputs.fitness.wellness||[],historyPeriod:{from:shiftDate(date,-84),to:date,source:'cached activities; missing records remain unknown'}});
      }else focus=await dashboardProfile(env).then(profile=>athleteFocus(profile,date)).catch(()=>null);
      Object.assign(coachCtx,{userInitiated:true,athleteState:athleteState.status,statusNote:athleteState.note,statusUntil:athleteState.statusUntil,preferenceMemory:memory?[...new Set([...(athleteState.memories||[]),memory])]:athleteState.memories,conversation});
      const sport=engineSport(focus,selected?.appContext||appContext),rec=coachCtx.cyclingCoachV2?.recommendation?.session||{},kind=rec.kind==="long_endurance"?"endurance":rec.kind==="vo2"?"vo2max":rec.kind;
      const library=task==='planning'||task==='block'?athleteState.status==='active'?await searchWorkoutLibrary(env.DB,{sport,system:kind,durationMinutes:rec.durationMinutes||availabilityMinutes||90,durationTolerance:20,limit:8},{
        readiness:coachCtx.cyclingCoachV2?.readiness?.status,
        hardBikeDaysRolling7d:coachCtx.cyclingCoachV2?.load?.hardBikeDaysRolling7d,
        phase:coachCtx.cyclingCoachV2?.constraints?.phase
      }):{workouts:[]}:{workouts:[]};
      coachCtx.workoutLibraryRecommendations=(library.workouts||[]).map(w=>({id:w.id,name:w.name,sport:w.sport||sport,source:w.source_name,sourceKind:w.source_kind,system:w.primary_system,durationMinutes:w.duration_minutes,targetLoad:w.target_load,difficulty:w.difficulty,suitability:w.suitability,challengeGap:w.challenge_gap,structure:w.intervals_description,reasons:w.reasons}));
      const contextMs=Date.now()-started,answer=await askCoach(env,message,coachCtx,{focus,actions:true,task,onAnswer});
      onProgress(L('Kontroluji návrhy pro aplikaci…', 'Checking the proposals for the app…'));
      coachCtx.userMessage=message;coachCtx.appContext=coachCtx.appContext||appContext;coachCtx.gymPlan=appContext.sport==='gym'?selected?.gymPlan:inputs.gym;
      const actions=validateCoachActions(answer.actions,coachCtx,date,{userInitiated:true}),proposals=[];await ensureCoachInboxTable(env.DB);
      // A proposed workout is prepared right away, so the chat shows it (profile,
      // exercises) and confirming plans exactly this one.
      for(const a of actions)if(a.type==='workout'){onProgress(L('Připravuji náhled tréninku…', 'Preparing the workout preview…'));a.preview=await workoutPreview(env,ctx,a).catch(error=>{console.error('Workout preview failed',error.message);return null;});}
      await saveMemory();
      // The chat keeps a one-line summary of the proposals, so later turns can refer to them.
      const note=actionsNote(actions),chatId=await remember(answer.answer+(note?'\n\n'+note:''));
      // Proposals from earlier days no longer show up as open.
      await env.DB.prepare("UPDATE coach_inbox SET status='expired' WHERE user_id=? AND status='draft' AND created_at<? AND draft_json LIKE '%\"coach_action\"%'").bind(env.USER_ID,pragueDayStartUtc(date)).run().catch(error=>console.error('Draft expiry failed',error.message));
      for(const action of actions){const draft={kind:'coach_action',action,chatId};const ins=await env.DB.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)').bind(env.USER_ID,'cycling',message,JSON.stringify(draft)).run();proposals.push({...action,draftId:ins.meta?.last_row_id});}
      return {...answer,chatId,actions:proposals,memorySaved:memory,costUsd:usageCost(answer.model,answer.usage),timings:{contextMs,modelMs:answer.ms,totalMs:Date.now()-started}};
    };
    if(body.stream)return assistantStreamResponse(reply);
    try{return Response.json(await reply(null),{headers:{'Cache-Control':'no-store'}});}
    catch(error){if(error.limit)return Response.json({message:error.message},{status:error.status||429});console.error('Assistant request failed',error);return Response.json({message:L('AI odpověď se nepodařilo připravit.', 'The AI answer couldn\'t be prepared.')},{status:502});}
  }
  // The list of chats, one chat with its messages, and deleting a chat.
  if(url.pathname==='/app/api/assistant/chats'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    return Response.json({status:'ok',chats:await listChats(env.DB)},{headers:{'Cache-Control':'no-store'}});
  }
  const chatPath=url.pathname.match(/^\/app\/api\/assistant\/chats\/(\d+)$/);
  if(chatPath){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method==='DELETE'){
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      await deleteChat(env.DB,chatPath[1]);return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});
    }
    const chat=await readChat(env.DB,chatPath[1]);
    return chat?Response.json({status:'ok',chat},{headers:{'Cache-Control':'no-store'}}):Response.json({message:'Chat neexistuje.'},{status:404});
  }
  if(url.pathname==='/app/api/assistant/action'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json();await ensureCoachInboxTable(env.DB);
      const row=await env.DB.prepare('SELECT * FROM coach_inbox WHERE user_id=? AND id=?').bind(env.USER_ID,Number(body.draftId)).first();
      if(!row)throw new Error(L('Návrh neexistuje.', 'The proposal doesn\'t exist.'));
      const draft=JSON.parse(row.draft_json);if(draft.kind!=='coach_action')throw new Error(L('Neplatný návrh.', 'Invalid proposal.'));
      if(row.status!=='draft')return Response.json({status:'ok',message:L('Návrh už byl vyřízen.', 'The proposal has already been handled.')});
      if(!['confirm','reject'].includes(body.decision))throw new Error(L('Potvrď nebo odmítni návrh.', 'Confirm or reject the proposal.'));
      let result=null;
      if(body.decision==='confirm'){
        const a=draft.action;
        // A proposed end date applies only while it is still in the future.
        if(a.type==='status')result=await updateAthleteState(env.DB,{status:a.status,note:a.reason,statusUntil:a.statusUntil&&a.statusUntil>pragueToday()?a.statusUntil:null});
        else if(a.type==='gym_swap'){
          if(!validTrainingDay(a.date)||a.date<pragueToday())throw new Error(L('Návrh je určený pro minulý den. Požádej o nový návrh.', 'The proposal is for a past day. Ask for a new proposal.'));
          assertTrainingAllowed(await getAthleteState(env.DB));
          const latest=await readGymPlan(env.DB,a.date),values=applyGymSwap(latest.values,a);
          const saved=await env.DB.prepare('UPDATE gym_plans SET values_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND workout_date=? AND values_json=?').bind(JSON.stringify(values),env.USER_ID,a.date,JSON.stringify(latest.values)).run();
          if(saved.meta?.changes!==1)throw new Error(L('Plán se mezitím změnil. Požádej o nový návrh.', 'The plan has changed in the meantime. Ask for a new proposal.'));
          result={status:'ok',date:a.date,values};
        }
        else if(a.type==='week_sport'){
          assertTrainingAllowed(await getAthleteState(env.DB));
          if(!validTrainingDay(a.date)||a.date<pragueToday())throw new Error(L('Do minulého dne už nelze přidat sport.', 'You can\'t add a sport to a past day.'));
          result={date:a.date,prefs:await addWeekSport(env.DB,a.date,a.sport)};
        }
        else if(a.type==='workout'){
          // The workout the chat showed is the one that gets planned.
          result=a.preview||await workoutPreview(env,ctx,a);
        }else{
          const id=a.eventId.replace(/^planned:/,''),event=await env.DB.prepare("SELECT start_time,payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND external_id=?").bind(env.USER_ID,'planned:'+id).first();
          const payload=event?JSON.parse(event.payload_json||'{}'):null;
          if(!event||String(event.start_time).slice(0,10)!==a.eventSnapshot.date||payload.name!==a.eventSnapshot.name||a.eventSnapshot.date<pragueToday())throw new Error(L('Plán se mezitím změnil. Požádej o nový návrh.', 'The plan has changed in the meantime. Ask for a new proposal.'));
          if(!id.startsWith('local-')){
            if(!env.INTERVALS_API_KEY)throw new Error(L('Nejprve připoj Intervals.icu.', 'Connect Intervals.icu first.'));
            const latest=await fetch('https://intervals.icu/api/v1/athlete/0/events/'+encodeURIComponent(id),{headers:{Authorization:intervalsAuthorization(env.INTERVALS_API_KEY),Accept:'application/json'}});
            if(!latest.ok)throw new Error(L('Aktuální trénink se nepodařilo ověřit v Intervals.icu.', 'The current workout couldn\'t be verified in Intervals.icu.'));
            const live=await latest.json();if(live.name!==a.eventSnapshot.name||String(live.start_date_local).slice(0,10)!==a.eventSnapshot.date)throw new Error(L('Trénink se v Intervals.icu změnil. Požádej o nový návrh.', 'The workout has changed in Intervals.icu. Ask for a new proposal.'));
          }
          if(a.type==='move')result=await movePlannedEvent(env,a);
          else if(a.type==='rest')result=await deletePlannedEvent(env,a);
        }
      }
      await env.DB.prepare('UPDATE coach_inbox SET status=?,confirmed_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?').bind(body.decision==='confirm'?'confirmed':'rejected',env.USER_ID,row.id).run();
      return Response.json({status:'ok',message:body.decision==='reject'?L('Návrh odmítnut.', 'Proposal rejected.'):L('Návrh potvrzen.', 'Proposal confirmed.'),action:draft.action,result},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:409})}
  }
  if(url.pathname==='/app/api/food/personal'&&request.method==='POST'){try{return Response.json({status:'ok',product:await savePersonalFood(env.DB,await request.json())});}catch(e){return Response.json({message:e.message},{status:400});}}
  if(url.pathname==='/app/api/food/personal'&&request.method==='GET')return Response.json({status:'ok',products:await listPersonalFoods(env.DB)},{headers:{'Cache-Control':'no-store'}});
  if(url.pathname==='/app/api/food/sync'){
    if(request.method==='POST'){
      try{const body=await request.json();await retryFoodGoogle(env.DB,body.id);ctx.waitUntil(processFoodGoogle(env,{token:googleToken}).catch(error=>console.error('Food export',error.message)));return Response.json({status:'queued'});}
      catch(error){return Response.json({message:error.message},{status:400});}
    }
    if(request.method==='GET')return Response.json({entries:await foodGoogleStatus(env.DB)},{headers:{'Cache-Control':'no-store'}});
  }

  if(url.pathname==='/app/api/food/entry'&&['PATCH','POST','DELETE'].includes(request.method)){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const body=await request.json(),id=body.id;
      const result=request.method==='PATCH'?await updateFoodEntry(env.DB,id,body):request.method==='POST'?await copyFoodEntry(env.DB,id,body.targetDate):await deleteFoodEntry(env.DB,id);
      const google=await queueFoodGoogleSafely(env,ctx,result.id,{deleted:request.method==='DELETE'});
      result.google=google;
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }

  if(url.pathname==='/app/api/food/day'&&request.method==='GET'){
    const target=new URL('/food/log',request.url);target.searchParams.set('date',url.searchParams.get('date')||pragueToday());
    const response=await legacyHealthApi.fetch(new Request(target,{headers:internalAuth}),env,ctx);
    if(!response.ok)return response;
    const data=await response.json(),exports=await foodGoogleStatus(env.DB);
    data.entries=(data.entries||[]).map(entry=>({...entry,google:exports.find(e=>Number(e.id)===Number(entry.id))||{status:'not_exported'}}));
    return Response.json(data,{headers:{'Cache-Control':'no-store'}});
  }

  if(url.pathname==='/app/api/food/search'&&request.method==='POST'){
    // Private saved foods first, then the common food-label catalogue.
    try {const body=await request.json(),name=String(body.name||'').slice(0,180),barcode=String(body.barcode||'').slice(0,24),candidates=[...await searchPersonalFoods(env.DB,name,barcode),...(!barcode?await searchRecipes(env.DB,name):[])];return Response.json({status:'ok',candidates,product:candidates[0]||null},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:L('Uložené potraviny se nepodařilo načíst. Zkus to znovu nebo zadej hodnoty z etikety.', 'Saved foods couldn\'t be loaded. Try again or enter the values from the label.'),detail:String(error.message).slice(0,160)},{status:500});}
  }
  // A food not saved yet: AI looks up its label values on the web. Only a
  // proposal; the user confirms it and the app saves it with the barcode.
  if(url.pathname==='/app/api/food/ai-lookup'&&request.method==='POST'){
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:L('AI není připojena (chybí OPENAI_API_KEY). Zadej hodnoty z etikety.', 'AI is not connected (OPENAI_API_KEY is missing). Enter the values from the label.')},{status:503});
    try{
      const body=await request.json().catch(()=>({})),name=String(body.name||'').slice(0,180),barcode=String(body.barcode||'').slice(0,24);
      const r=await lookupFoodWithAI(env,{name,barcode,language:env.INTERFACE_LANGUAGE});
      if(!r.product)return Response.json({status:'not_found',message:L('AI výrobek s jistotou nenašla. Zadej hodnoty z etikety (nebo ji vyfoť).', 'The AI couldn\'t find the product with certainty. Enter the values from the label (or take a photo of it).')},{headers:{'Cache-Control':'no-store'}});
      return Response.json({status:'ok',product:{...r.product,name:r.product.name||name},model:r.model},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.limit?error.message:L('Dohledání přes AI selhalo: ', 'The AI lookup failed: ')+String(error.message).slice(0,160)},{status:error.limit?(error.status||429):502});}
  }
  if(url.pathname==='/app/api/food/label'&&request.method==='POST'){
    const body=await request.json().catch(()=>({})),text=String(body.text||'').slice(0,12000),parsed=body.mode==='portion'?parseNutritionPortion(text):{values:parseNutritionLabel(text)};
    return Response.json({status:'ok',...parsed,warning:nutritionConsistency(parsed.values)});
  }
  // A label, a portion summary or a meal photographed: AI vision reads the
  // values as a draft for the food editor. Without AI the client uses OCR.
  if(url.pathname==='/app/api/food/photo'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:L('AI není připojena; fotku přečtu na zařízení.', 'AI is not connected; I\'ll read the photo on the device.')},{status:503});
    try{
      const body=await request.json().catch(()=>({}));
      if(body.mode==='barcode'){const b=await readBarcodeWithAI(env,{image:body.image});return Response.json(b.barcode?{status:'ok',barcode:b.barcode}:{status:'unreadable',message:L('Číslo pod čárovým kódem se nepodařilo přečíst. Vyfoť kód zblízka, nebo číslo opiš.', 'The number under the barcode couldn\'t be read. Take a close-up photo of the code or type the number.')},{headers:{'Cache-Control':'no-store'}});}
      const r=await readFoodPhotoWithAI(env,{image:body.image,mode:body.mode==='portion'?'portion':'label',language:env.INTERFACE_LANGUAGE});
      if(!r.result)return Response.json({status:'unreadable',message:L('Na fotce jsem hodnoty nepřečetl. Vyfoť tabulku zblízka a rovně, nebo hodnoty zadej ručně.', 'I couldn\'t read the values in the photo. Take a close, straight photo of the table or enter the values by hand.')},{headers:{'Cache-Control':'no-store'}});
      return Response.json({status:'ok',...r.result,model:r.model},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.limit?error.message:L('Čtení fotky přes AI selhalo: ', 'Reading the photo with AI failed: ')+String(error.message).slice(0,160)},{status:error.limit?(error.status||429):/JPG|PNG/.test(error.message)?400:502});}
  }
  // Cookbook by recipe name (the page lookup is below).
  if(url.pathname==='/app/api/food/recipes'&&request.method==='GET'){
    const q=String(url.searchParams.get('q')||'').trim().slice(0,120);
    if(q.length<2)return Response.json({status:'ok',recipes:[]},{headers:{'Cache-Control':'no-store'}});
    return Response.json(await searchCookbookRecipes({name:q,limit:8}),{headers:{'Cache-Control':'no-store'}});
  }
  // Drinks of a day with the day's target (body weight and training).
  if(url.pathname==='/app/api/fluids'){
    const validDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
    try{
      if(request.method==='GET'){
        const date=validDay(url.searchParams.get('date'))?url.searchParams.get('date'):pragueToday();
        const [logged,fromFood,weight,profile,hours]=await Promise.all([listFluids(env.DB,date),foodDrinks(env.DB,env.USER_ID,date),
          env.DB.prepare("SELECT value_numeric FROM health_datapoints WHERE user_id=? AND data_type='weight' AND value_numeric IS NOT NULL AND COALESCE(sample_time,start_time,end_time)<=? ORDER BY COALESCE(sample_time,start_time,end_time) DESC LIMIT 1").bind(env.USER_ID,date+'T23:59:59').first().catch(()=>null),
          dashboardProfile(env).catch(()=>null),dayActivityHours(env.DB,env.USER_ID,date)]);
        const target=hydrationTarget({weightKg:weight?.value_numeric,sex:profile?.sex,...hours});
        // Drinks from the food diary are listed with the logged ones and counted (alcohol not).
        const entries=[...logged,...fromFood].sort((a,b)=>String(a.consumedAt).localeCompare(String(b.consumedAt)));
        return Response.json({status:'ok',date,entries,totalMl:entries.reduce((s,e)=>s+e.ml,0),target},{headers:{'Cache-Control':'no-store'}});
      }
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      if(request.method==='POST'){const body=await request.json().catch(()=>({}));return Response.json({status:'ok',entry:await addFluid(env.DB,{date:validDay(body.date)?body.date:pragueToday(),ml:body.ml,kind:body.kind,at:body.at})},{headers:{'Cache-Control':'no-store'}});}
      if(request.method==='DELETE'){await deleteFluid(env.DB,url.searchParams.get('id'));return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});}
      return Response.json({message:'Method not allowed'},{status:405});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400});}
  }
  if(url.pathname==='/app/api/food/recipe'&&request.method==='GET'){
    const recipe=await getCookbookRecipeByPage(url.searchParams.get('page'));
    return Response.json(recipe?{recipe}:{message:L('Na této stránce není známý recept.', 'There\'s no known recipe on this page.')},{status:recipe?200:404,headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/food/log'&&request.method==='POST'){
    try {const body=await request.json(),p=body.product||{};
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||!String(p.name||'').trim()) return Response.json({message:L('Zkontroluj název a datum.', 'Check the name and date.')},{status:400});
      for(const field of ['calories_100g','protein_100g','carbs_100g','fat_100g'])if(p[field]==null||p[field]===''||!Number.isFinite(Number(p[field]))||Number(p[field])<0||Number(p[field])>(field==='calories_100g'?(p.nutrition_basis==='portion'?10000:1000):(p.nutrition_basis==='portion'?1000:100)))return Response.json({message:L('Doplň energii i všechna tři makra pro zvolený základ tabulky.', 'Fill in the energy and all three macros for the chosen table basis.')},{status:400});
      let amount;try{amount=foodIntake(p,body.quantity??body.grams,body.unit||(p.nutrition_basis==='portion'?'portion':p.nutrition_basis==='ml'?'ml':'g'),{pieceAmount:body.pieceAmount,pieceUnit:body.pieceUnit,density:body.density});}catch(error){return Response.json({message:error.message},{status:400});}
      const ingredients=Array.isArray(body.ingredients)?body.ingredients.slice(0,50).map(a=>({name:String(a.name||'').slice(0,180),amount:Number(a.amount)||null,unit:['g','ml','portion'].includes(a.unit)?a.unit:'g'})):[];
      const saved=await legacyHealthApi.fetch(new Request(new URL('/food/log',request.url),{method:'POST',headers:{...internalAuth,'Content-Type':'application/json'},body:JSON.stringify({date:body.date,consumed_at:mealConsumedAt(body.date,body.mealType)||undefined,name:String(p.name).slice(0,180),kcal:amount.calories,protein_g:amount.protein_g,carbs_g:amount.carbs_g,fat_g:amount.fat_g,fiber_g:amount.fiber_g,source:'package_label',note:JSON.stringify({product:productFromLabel(p),amount:amount.amount,unit:amount.unit,enteredQuantity:body.quantity??body.grams,enteredUnit:body.unit||'g',barcode:p.barcode||null,brand:p.brand||null,mealType:body.mealType||'snack',salt_g:amount.salt_g,source_url:p.source_url||null,ingredients})})}),env,ctx);
      const result=await saved.json();if(!saved.ok)throw new Error(L('Uložení selhalo.', 'Saving failed.'));
      let personal=null,warning=null;
      if(p.source!=='composed'){try{personal=await savePersonalFood(env.DB,p);}catch(error){warning=L('Jídlo je zapsané, ale potravinu pro příště se nepodařilo uložit: ', 'The meal is logged, but the food couldn\'t be saved for next time: ')+error.message;}}
      const google=await queueFoodGoogleSafely(env,ctx,result.id);
      warning ||= google.status==='error'?google.message:null;
      return Response.json({...result,google,personal,warning,message:warning||L('Jídlo je zapsané', 'The meal is logged')+(personal?L(' a potravina uložená pro příště', ' and the food is saved for next time'):'')+'.'},{headers:{'Cache-Control':'no-store'}});
    }catch{return Response.json({message:L('Jídlo se nepodařilo uložit. Zkontroluj hodnoty a zkus to znovu.', 'The meal couldn\'t be saved. Check the values and try again.')},{status:500});}
  }

  if (url.pathname === "/app/api/connections" && request.method === "GET") {
    return Response.json(await connectionStatus(env), {headers:{"Cache-Control":"no-store"}});
  }
  if (url.pathname === '/app/api/connections' && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!session.signedIn) return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if (request.headers.get('Origin') !== url.origin) return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    if (request.method === 'DELETE') {
      if(!['google','intervals'].includes(body.provider)) return Response.json({message:L('Neznámé připojení.', 'Unknown connection.')},{status:400});
      await deleteConnectionSecret(env,body.provider);
      if(body.provider==='google') await deleteConnectionSecret(env,'google_scopes');
      return Response.json({status:'ok',message:L('Připojení je odebrané.', 'The connection has been removed.')},{headers:{'Cache-Control':'no-store'}});
    }
    if(body.provider!=='intervals'||typeof body.key!=='string'||body.key.trim().length<8||body.key.length>512) return Response.json({message:L('Zadej platný API klíč Intervals.icu.', 'Enter a valid Intervals.icu API key.')},{status:400});
    const apiKey=body.key.trim();
    const check=await fetch('https://intervals.icu/api/v1/athlete/0',{headers:{Authorization:intervalsAuthorization(apiKey),Accept:'application/json'}});
    if(!check.ok) return Response.json({message:L('Intervals klíč nepřijal. Zkontroluj klíč v nastavení Intervals.', 'Intervals didn\'t accept the key. Check the key in your Intervals settings.')},{status:400});
    const athlete=await check.json().catch(()=>({}));
    await saveConnectionSecret(env,'intervals',apiKey);
    await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name='initial_intervals'").bind(env.USER_ID).run();
    await initialImport(await connectionEnvironment(env),ctx);
    return Response.json({status:'ok',athleteId:athlete.id||null,message:'Intervals.icu je připojené'+(athlete.name?' ('+athlete.name+')':'')+'.'},{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/activity-detail'&&request.method==='GET'){
    const id=url.searchParams.get('id');
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||''))return Response.json({message:L('Neplatná aktivita.', 'Invalid activity.')},{status:400});
    const known=await env.DB.prepare("SELECT external_id FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND external_id=? LIMIT 1").bind(env.USER_ID,'activity:'+id).first();
    if(!known)return Response.json({message:L('Aktivita není v tvé synchronizované historii.', 'The activity isn\'t in your synced history.')},{status:404});
    return activityDetail(request,env,id,true);
  }
  if (url.pathname === "/app/api/inbox") return handleCoachInbox(request, env, ctx, internalAuth);

  if(url.pathname==='/app/api/coaches'&&request.method==='GET'){
    try{
      // Up to two weeks ahead: the advisers then talk about the planned day.
      const requestedDate=url.searchParams.get('date'),date=validTrainingDay(requestedDate)&&requestedDate<=shiftDate(pragueToday(),14)?requestedDate:pragueToday(),ahead=date>pragueToday(),oldest=shiftDate(date,-14);
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const fitnessJob=env.INTERVALS_API_KEY?fetch('https://intervals.icu/api/v1/athlete/0/wellness?oldest='+oldest+'&newest='+date,{headers:{Authorization:intervalsAuthorization(env.INTERVALS_API_KEY),Accept:'application/json'}}).then(r=>r.ok?r.json():[]).catch(()=>[]):[];
      // A completed ride's intervals (one small Intervals.icu request, cached)
      // let its review compare every step with the plan.
      const dailyJob=read('/analysis/daily?date='+date);
      const rideJob=dailyJob.then(d=>rideDetailsFor(env,ctx,d.training)).catch(()=>({}));
      const [daily,yesterday,sleepData,rows,profile,athleteState,gym,thresholds,rideDetails]=await Promise.all([
        dailyJob,read('/analysis/daily?date='+shiftDate(date,-1)),
        read('/health/sleep?start='+oldest+'&end='+shiftDate(date,1)).then(d=>withIntervalsSleep(env,d,oldest,shiftDate(date,1))),fitnessJob,dashboardProfile(env),
        date>=pragueToday()?getAthleteState(env.DB):{status:'active',note:'',statusUntil:null},readGymPlan(env.DB,date).catch(()=>null),
        cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>null),rideJob
      ]);
      // The gym review compares logged sets with earlier sessions of the same exercises.
      const strengthHistory=(gym?.values||[]).slice(7).some(r=>/^(true|1)$/i.test(String(r?.[8]??'')))?await getStrengthHistory(env.DB,500).catch(()=>[]):[];
      const latest=Array.isArray(rows)&&rows.length?rows.filter(r=>String(r.id||'')<=date).at(-1)||{}:{};
      const fitness={...latest,tsb:latest.ctl!=null&&latest.atl!=null?Number(latest.ctl)-Number(latest.atl):null};
      const council=buildCoachCouncil({strengthHistory,date,daily,yesterday,fitness,sleepSessions:sleepData.sessions||[],athleteState,focus:athleteFocus(profile,date),gym,thresholds,ahead,rideDetails,wellness:Array.isArray(rows)?rows:[]});
      return Response.json({status:'ok',date,...council,athleteState:{status:athleteState.status,note:athleteState.note,statusUntil:athleteState.statusUntil}},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500});}
  }

  if (url.pathname === "/app/api/weight" && request.method === "POST") {
    const body = await request.text();
    return app.fetch(new Request(new URL("/app/api/weight", request.url), {
      method:"POST",
      headers:{...internalAuth,"Content-Type":"application/json"},
      body
    }), env, ctx);
  }

  if (url.pathname === "/app/api/nutrition/log" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const entries = Array.isArray(body?.entries) ? body.entries : [body];
      if (!entries.length) return Response.json({status:"error",message:"entries is required"},{status:400});
      const results = [];
      for (const entry of entries) {
        let note={};try{note=JSON.parse(entry.note||'{}');}catch{note={text:String(entry.note||'').slice(0,1000)};}
        const foodBody = {
          date: entry.date || null,
          consumed_at: entry.consumed_at || null,
          name: entry.name || "Manual entry",
          kcal: Number(entry.kcal || 0),
          protein_g: Number(entry.protein_g || 0),
          carbs_g: Number(entry.carbs_g || 0),
          fat_g: Number(entry.fat_g || 0),
          fiber_g: Number(entry.fiber_g || 0),
          source: entry.source || "dashboard",
          note: JSON.stringify({...note,mealType:String(entry.mealType||note.mealType||'snack').toLowerCase()})
        };
        const foodResponse = await app.fetch(new Request(new URL("/food/log", request.url), {
          method:"POST",
          headers:{...internalAuth,"Content-Type":"application/json"},
          body:JSON.stringify(foodBody)
        }), env, ctx);
        const foodResult = await foodResponse.json().catch(()=>({}));
        if (!foodResponse.ok) throw new Error(foodResult.message || "Food log write failed");
        let googleResult=null;
        if (entry.google !== false) {
          googleResult=await queueFoodGoogleSafely(env,ctx,foodResult.id);
        }
        results.push({food:foodResult,google:googleResult});
      }
      return Response.json({status:"ok",count:results.length,results},{headers:{"Cache-Control":"no-store"}});
    } catch (error) {
      return Response.json({status:"error",message:error.message},{status:500});
    }
  }

  if (url.pathname === "/app/api/fitness" && request.method === "GET") {
    try {
      const days = Math.max(42, Math.min(180, Number(url.searchParams.get("days") || 90)));
      const newest = new Date();
      const oldest = new Date(newest.getTime() - days * 86400000);
      const isoDate = d => d.toISOString().slice(0,10);
      const apiKey = String(env.INTERVALS_API_KEY || "");
      if (!apiKey) return Response.json({status:"ok",source:"none",connected:false,days,wellness:[]},{headers:{"Cache-Control":"no-store"}});
      const auth = intervalsAuthorization(apiKey);
      const target = "https://intervals.icu/api/v1/athlete/0/wellness?oldest="+encodeURIComponent(isoDate(oldest))+"&newest="+encodeURIComponent(isoDate(newest));
      const response = await fetch(target,{headers:{Authorization:auth,Accept:"application/json"}});
      const data = await response.json().catch(()=>[]);
      if (!response.ok) return Response.json({status:"error",message:"Intervals wellness HTTP "+response.status,data},{status:response.status});
      const wellness = (Array.isArray(data)?data:[]).map(x=>({...x,tsb:Number.isFinite(Number(x.ctl))&&Number.isFinite(Number(x.atl))?Number(x.ctl)-Number(x.atl):null})).filter(x=>x.id).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      return Response.json({status:"ok",source:"intervals.icu",days,wellness},{headers:{"Cache-Control":"no-store"}});
    } catch (error) {
      return Response.json({status:"error",message:error.message},{status:502});
    }
  }

  if(url.pathname==='/app/api/connections/intervals/sync'&&['POST','GET'].includes(request.method)){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method==='GET')return Response.json(await dashboardSyncStatus(env.DB,'initial_intervals'),{headers:{'Cache-Control':'no-store'}});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!(env.CONNECTED_PROVIDERS||[]).includes('intervals'))return Response.json({message:L('Nejdřív připoj Intervals.icu.', 'Connect Intervals.icu first.')},{status:409});
    const run=await initialImport(env,ctx,{provider:'intervals',force:true});
    return Response.json(run,{status:202,headers:{'Cache-Control':'no-store'}});
  }

  if(url.pathname==='/app/api/sync'&&['POST','GET'].includes(request.method)){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method==='GET')return Response.json(await dashboardSyncStatus(env.DB),{headers:{'Cache-Control':'no-store'}});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(missingProviders(env).length===2)return Response.json({status:'idle',message:L('Žádná služba není propojená.', 'No service is connected.')});
    await initialImport(env,ctx);
    const run=await startDashboardSync(env.DB,ctx,()=>recentDashboardImport(env,ctx));
    return Response.json({...run,status:'accepted'},{status:202,headers:{'Cache-Control':'no-store'}});
  }

  if (url.pathname === "/app/api/gym") {
    if (request.method === "GET") {
      // The day's plan and the history both live in D1.
      const date=/^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date')||''))?url.searchParams.get('date'):pragueToday();
      let data={status:"ok",values:[],videoLinks:[]};
      try { const plan=await readGymPlan(env.DB,date); data={status:"ok",date,values:plan.stored?plan.values:[],videoLinks:[],stored:plan.stored,cancelled:plan.cancelled,recoverable:plan.recoverable}; }
      catch(error) { console.error("Gym plan read failed",error); data={status:"partial",values:[],videoLinks:[],message:L("Plán se nepodařilo načíst.", "The plan couldn't be loaded.")}; }
      let history=[];
      try { history=await getStrengthHistory(env.DB,500); } catch(error) { console.error("Gym history read failed",error); }
      // Muscles each exercise of the day loads (plan and saved sets), for the body figure.
      const names=new Set([...(data.values||[]).slice(7).map(r=>r?.[1]),...history.filter(r=>String(r.workout_date||'').slice(0,10)===date).map(r=>r.exercise)].filter(Boolean));
      const muscles=Object.fromEntries([...names].map(name=>[name,exerciseMuscles(name)]));
      return Response.json({...data,history,muscles,storage:"d1"},{headers:{"Cache-Control":"no-store"}});
    }
    if (request.method === "POST") {
      try {
      const body = await request.json().catch(() => ({}));
      const date = body?.date || pragueToday();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return Response.json({message:L('Neplatné datum.', 'Invalid date.')},{status:400});
      // A saved plan without its Intervals.icu event, dragged to another day in the week.
      if(body.action==='move'){
        const to=String(body.to||'');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<pragueToday())return Response.json({message:L('Gym jde přesunout jen na dnešek nebo pozdější den.', 'The gym session can only be moved to today or a later day.')},{status:400});
        const moved=await moveGymPlan(env.DB,date,to);
        if(!moved.moved)return Response.json({message:L('Gym se nepodařilo přesunout: cílový den už má gym plán, nebo jsou v tréninku zapsané série.', 'The gym session couldn\'t be moved: the target day already has a gym plan, or the workout has logged sets.')},{status:409});
        return Response.json({status:'ok',date:to,message:L('Gym je přesunutý.', 'The gym session has been moved.')},{headers:{'Cache-Control':'no-store'}});
      }
      if(body.action==='cancel'){
        const rows=(await env.DB.prepare("SELECT external_id,payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND start_time>=? AND start_time<?").bind(env.USER_ID,date,shiftDate(date,1)).all()).results||[];
        for(const row of rows){let event;try{event=JSON.parse(row.payload_json)}catch{continue}if(isStrengthEvent(event))await deletePlannedEvent(env,{eventId:row.external_id});}
        await cancelGymPlan(env.DB,date);
        return Response.json({status:'ok',date,cancelled:true,message:L('Posilovna je zrušená. Původní plán a výsledky zůstaly uložené.', 'The gym session is cancelled. The original plan and results stay saved.')},{headers:{'Cache-Control':'no-store'}});
      }
      // Gym put back on the day in the week plan: only the cancellation goes,
      // nothing is written to Intervals.icu until a plan is saved or confirmed.
      if(body.action==='uncancel'){
        await restoreGymPlan(env.DB,date);
        return Response.json({status:'ok',date,cancelled:false,message:L('Gym je na tento den znovu v plánu.', 'The gym session is back in the plan for this day.')},{headers:{'Cache-Control':'no-store'}});
      }
      if(body.action==='restore'){
        assertTrainingAllowed(await getAthleteState(env.DB));
        const plan=await readGymPlan(env.DB,date,{includeCancelled:true});
        if(!plan.cancelled||!plan.stored)return Response.json({message:L('Není tu zrušený plán k obnovení.', 'There\'s no cancelled plan to restore.')},{status:409});
        const event=plan.cancelledEvent;
        let intervals=null;
        if(env.INTERVALS_API_KEY)intervals=await writeStrengthPlanToIntervals(env,{date,rows:plan.values.slice(7),planName:plan.values[2]?.[3]||'Gym',rationale:plan.values[3]?.[1]||''},{durationMinutes:event?.moving_time?event.moving_time/60:60,startTime:String(event?.start_date_local||'').slice(11,16)||'00:00'});
        await restoreGymPlan(env.DB,date);
        return Response.json({status:'ok',date,intervals,message:L('Původní plán obnoven.', 'Original plan restored.')},{headers:{'Cache-Control':'no-store'}});
      }
      const storedPlan=await readGymPlan(env.DB,date);
      if(storedPlan.cancelled)return Response.json({message:L('Tento plán je zrušený. Nejdřív jej obnov, nebo vytvoř nový.', 'This plan is cancelled. Restore it first or create a new one.')},{status:409});
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gym_plans (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, workout_date))`).run();

      if (body?.action === "plan") {
        const values = Array.isArray(body?.values) ? body.values : null;
        if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
        await env.DB.prepare(`INSERT INTO gym_plans(user_id,workout_date,values_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(env.USER_ID,date,JSON.stringify(values)).run();
        return Response.json({status:"ok",storage:"d1",message:L("Plán uložen.", "Plan saved.")},{headers:{"Cache-Control":"no-store"}});
      }

      const values = Array.isArray(body?.values) ? body.values : null;
      if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
      const completedSets = rows => rows.map((r,i)=>({
        type:String(r?.[0]||"WORK").toUpperCase(), exercise:r?.[1]||"", setNo:r?.[2],
        plannedKg:r?.[3], plannedReps:r?.[4], actualKg:r?.[5], actualReps:r?.[6],
        rpe:r?.[7], completed:["TRUE","true","1","ANO","ano","✓","☑"].includes(String(r?.[8]??"")), note:r?.[9]||"",toFailure:r?.[11]||false,superset:r?.[12]||''
      })).filter(x=>x.exercise && /^(WARMUP|WORK)$/.test(x.type) && x.completed);
      const sets = completedSets(values);
      let historyResult=null;
      if(sets.length) historyResult=await importStrengthHistory(env.DB,{date,sets});
      // A saved set or exercise taken out of the day leaves the history too
      // (only the keys this day's own saves wrote).
      const before = storedPlan.stored ? completedSets(storedPlan.values.slice(7)).length : 0;
      if(before>sets.length) await removeManualSets(env.DB,date,sets.length,before);
      // Keep the editable workout snapshot together with the completed-set
      // history.  The UI can then be safely reloaded after every autosave.
      const storedValues = Array.isArray(body?.fullValues) ? body.fullValues : values;
      await env.DB.prepare(`INSERT INTO gym_plans(user_id,workout_date,values_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(env.USER_ID,date,JSON.stringify(storedValues)).run();
      const history=await getStrengthHistory(env.DB,500);
      return Response.json({status:"ok",storage:"d1",values:storedValues,history,historySaved:historyResult,message:sets.length?L("Workout uložen do interní databáze.", "Workout saved to the app database."):L("Změny plánu jsou uložené; dokončené série označ Hotovo.", "Plan changes are saved; mark completed sets as Done.")},{headers:{"Cache-Control":"no-store"}});
      } catch(error) {
        console.error("Gym save failed", error);
        return Response.json({status:"error",message:"Gym save: "+(error?.message||"unknown error")},{status:500,headers:{"Cache-Control":"no-store"}});
      }
    }
    return Response.json({status:"error",message:"Method not allowed"},{status:405});
  }

  if(url.pathname==='/app/api/gym/confirm'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      assertTrainingAllowed(await getAthleteState(env.DB));
      const body=await request.json();await ensureCoachInboxTable(env.DB);
      const row=await env.DB.prepare('SELECT * FROM coach_inbox WHERE user_id=? AND id=?').bind(env.USER_ID,Number(body.draftId)).first();
      if(!row)throw new Error(L('Návrh už neexistuje.', 'The proposal no longer exists.'));
      if(row.status==='confirmed')return Response.json({status:'ok',message:L('Návrh už je uložený.', 'The proposal is already saved.')});
      const draft=JSON.parse(row.draft_json),plan=draft.plan;
      if(draft.kind!=='gym_preview'||!plan||plan.date<pragueToday())throw new Error(L('Neplatný nebo starý návrh.', 'Invalid or outdated proposal.'));
      // The proposal as changed in its preview (exercises from the catalog or the proposal itself).
      if(Array.isArray(body.rows))plan.rows=cleanGymRows(body.rows,new Set([...catalogNames(),...(plan.rows||[]).map(r=>r?.[1]).filter(Boolean)]));
      if((await readGymPlan(env.DB,plan.date)).stored)throw new Error(L('Na tento den již existuje gym plán. Otevři jej a uprav ho.', 'A gym plan already exists for this day. Open it and edit it.'));
      const r=await app.fetch(new Request('https://internal/strength/write-plan',{method:'POST',headers:{...internalAuth,'Content-Type':'application/json'},body:JSON.stringify(plan)}),env,ctx);
      if(!r.ok)throw new Error(L('Gym plán se nepodařilo uložit.', 'The gym plan couldn\'t be saved.'));
      const intervals=await writeStrengthPlanToIntervals(env,plan,{durationMinutes:draft.minutes,startTime:draft.startTime||'00:00'}).catch(error=>({status:'error',message:error.message}));
      await env.DB.prepare("UPDATE coach_inbox SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(env.USER_ID,row.id).run();
      return Response.json({status:'ok',intervals,eventId:intervals?.eventId!=null?'planned:'+intervals.eventId:null,message:L('Gym plán je uložený.', 'The gym plan is saved.')},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:409})}
  }
  // Technique card of one exercise (text and video), plus the athlete's own video link.
  if(url.pathname==='/app/api/gym/technique'){
    if(request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json().catch(()=>({}));
      try{await saveOwnExerciseVideo(env.DB,body.exercise,body.url);}catch(error){return Response.json({message:error.message},{status:400});}
      return Response.json({status:'ok',technique:techniqueFor(body.exercise,await ownExerciseVideo(env.DB,body.exercise))},{headers:{'Cache-Control':'no-store'}});
    }
    const exercise=String(url.searchParams.get('exercise')||'').slice(0,120),own=exercise?await ownExerciseVideo(env.DB,exercise).catch(()=>null):null;
    let technique=techniqueFor(exercise,own);
    // Outside the catalog: the stored card, or one written now (once) and kept.
    if(exercise&&!technique?.steps?.length){
      let stored=await storedTechnique(env.DB,exercise).catch(()=>null);
      if(!stored&&env.OPENAI_API_KEY&&await exerciseInUse(env.DB,exercise))stored=await generateTechnique(env,exercise).catch(error=>{console.error('Technique generation failed',error.message);return null;});
      if(stored)technique=techniqueFor(exercise,own,stored);
    }
    return technique?Response.json({status:'ok',technique},{headers:{'Cache-Control':'no-store'}}):Response.json({message:L('Cvik není v databázi.', 'The exercise isn\'t in the database.')},{status:404});
  }
  if (url.pathname === "/app/api/gym/generate" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    // The week plan's gym chip for that day sets the length and upper/full body,
    // unless the request chose them.
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date||"")) ? body.date : pragueToday();
    try {
      assertTrainingAllowed(await getAthleteState(env.DB));
      const prefs=await getWeekPlan(env.DB,day),budget=trainingBudget(prefs,day,body.durationMinutes==null?null:Number(body.durationMinutes),{userInitiated:body.userInitiated===true});
      if(budget!=null&&budget<30)throw new Error(L('Na gym potřebuješ alespoň 30 minut dostupného času.', 'The gym needs at least 30 minutes of available time.'));
      if(budget!=null)body.durationMinutes=budget;
    }catch(error){return Response.json({message:error.message},{status:400})}
    if (body?.durationMinutes == null && !body?.focus && !body?.focusMuscles && !body?.forceProtectLegs) {
      const prefs = await getWeekPlan(env.DB,day).catch(() => null);
      const chip = prefs ? targetFor(await computeWeekTargets(env, ctx, mondayOfDate(day), prefs).catch(() => null), day, "gym") : null;
      if (chip) { body.durationMinutes = chip.minutes; if (chip.role === "gym_upper") { body.focus = "upper"; body.focusSource = "week"; } }
    }
    const internal = new URL("/strength/generate-plan", request.url);
    const response = await app.fetch(new Request(internal,{
      method:"POST",
      headers:{...internalAuth,"Content-Type":"application/json"},
      body:JSON.stringify({...body,date:body?.date||null})
    }),env,ctx);
    const data=await response.json().catch(()=>({status:"error",message:"Invalid response"}));
    if(body.preview===true&&data.plan&&response.ok){
      await ensureCoachInboxTable(env.DB);
      const draft={kind:'gym_preview',plan:data.plan,minutes:body.durationMinutes||60,startTime:body.startTime||null};
      const saved=await env.DB.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)').bind(env.USER_ID,'gym',L('Návrh z týdenního plánu', 'Proposal from the week plan'),JSON.stringify(draft)).run();
      data.draftId=saved.meta?.last_row_id;
      data.muscles=Object.fromEntries([...new Set(data.plan.rows.map(r=>r?.[1]).filter(Boolean))].map(name=>[name,exerciseMuscles(name)]));
    }
    return Response.json(data,{status:response.status,headers:{"Cache-Control":"no-store"}});
  }

  if (request.method !== "GET") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });

  if (url.pathname === "/app/api/week") {
    const requestedStart = url.searchParams.get("start");
    const start = requestedStart && /^\d{4}-\d{2}-\d{2}$/.test(requestedStart)
      ? requestedStart
      : pragueWeekStart();
    const dates = Array.from({length:7}, (_, i) => shiftDate(start, i));
    // Seven days of analysis, food and recommendations are the slowest read of
    // the app; it is cached for two minutes and dropped by any change the user
    // makes (the cache version), so a new ride still shows up soon.
    const week = await cached(env, ctx, 'week-api:' + start, async () => {
    await ensureGymPlans(env.DB);
    const cancelledGym=new Set((await env.DB.prepare('SELECT workout_date FROM gym_plan_cancellations WHERE user_id=? AND workout_date>=? AND workout_date<=?').bind(env.USER_ID,start,dates[6]).all()).results.map(r=>r.workout_date));
    // Gym plans saved for the week (generated, confirmed or built by hand), so a
    // day shows its plan even before or without an Intervals.icu event.
    const gymPlans=new Map(((await env.DB.prepare('SELECT workout_date,values_json FROM gym_plans WHERE user_id=? AND workout_date>=? AND workout_date<=?').bind(env.USER_ID,start,dates[6]).all().catch(()=>({results:[]}))).results||[]).map(r=>{let v=[];try{v=JSON.parse(r.values_json);}catch{}const rows=(Array.isArray(v)?v.slice(7):[]).filter(x=>x?.[1]);return [r.workout_date,rows.length?{name:String(v[2]?.[3]||'').slice(0,120),exercises:new Set(rows.map(x=>x[1])).size,sets:rows.filter(x=>String(x[0]||'WORK').toUpperCase()==='WORK').length}:null];}).filter(([,p])=>p));
    // Same calorie target as the day view: one Google Health read covers the week.
    const profile = await dashboardProfile(env);
    const health = profile ? await googleHealthFor(env, ctx, dates[6]).catch(error => { console.error("Energy budget unavailable", error.message); return null; }) : null;
    // D1 runs one query at a time: three days at once keep its queue short
    // (all seven at once overloaded it when several weeks were asked together).
    const days = await mapLimit(dates, 3, async date => {
      const dailyUrl = new URL("/analysis/daily", request.url);
      dailyUrl.searchParams.set("date", date);
      const foodUrl = new URL("/food/log", request.url);
      foodUrl.searchParams.set("date", date);
      const recommendUrl = new URL("/food/recommend", request.url);
      recommendUrl.searchParams.set("date", date);
      // Meal recommendations (the costliest part) only for today and later:
      // nothing is eaten on a past day any more.
      const [dailyResponse, foodResponse, recommendResponse] = await Promise.all([
        app.fetch(new Request(dailyUrl, {method:"GET",headers:internalAuth}), env, ctx),
        app.fetch(new Request(foodUrl, {method:"GET",headers:internalAuth}), env, ctx),
        date >= pragueToday() ? app.fetch(new Request(recommendUrl, {method:"GET",headers:internalAuth}), env, ctx) : null
      ]);
      return {
        date,
        gymCancelled:cancelledGym.has(date),
        gymPlan:cancelledGym.has(date)?null:gymPlans.get(date)||null,
        daily: applyEnergyBudget(await dailyResponse.json(), profile, {today: health?.wellness?.find(w => w.id === date) || {}}),
        food: await foodResponse.json(),
        recommendations: recommendResponse ? await recommendResponse.json() : null
      };
    });
    return {status:"ok",start,end:dates[6],days};
    }, { ttl: 120 });
    return Response.json(week,{headers:{"Cache-Control":"no-store"}});
  }

  const routes = {
    "/app/api/daily": "/analysis/daily",
    "/app/api/weight": "/health/weight",
    "/app/api/activities": "/health/activities",
    "/app/api/nutrition": "/health/nutrition",
    "/app/api/sleep": "/health/sleep"
  };
  const target = routes[url.pathname];
  if (!target) return Response.json({ status: "error", message: "Not found" }, { status: 404 });
  // Sleep: Google Health nights, and the nights only Intervals.icu has (Apple Health, Garmin…).
  if (url.pathname === "/app/api/sleep") {
    const internal = new URL(target, request.url);for (const [key, value] of url.searchParams) internal.searchParams.set(key, value);
    const response = await app.fetch(new Request(internal, { method: "GET", headers: internalAuth }), env, ctx);
    if (!response.ok) return response;
    const start = url.searchParams.get("start") || shiftDate(pragueToday(), -30), end = url.searchParams.get("end") || shiftDate(pragueToday(), 1);
    return Response.json(await withIntervalsSleep(env, await response.json(), start, end), { headers: { "Cache-Control": "no-store" } });
  }

  const internal = new URL(target, request.url);
  for (const [key, value] of url.searchParams) internal.searchParams.set(key, value);
  const response = await app.fetch(new Request(internal, { method: "GET", headers: internalAuth }), env, ctx);
  if(url.pathname==='/app/api/daily'&&response.ok){const daily=await response.json();try{const date=url.searchParams.get('date')||pragueToday(),profile=await dashboardProfile(env);if(profile)applyEnergyBudget(daily,profile,await googleHealthFor(env,ctx,date));}catch(e){console.error('Energy budget unavailable',e.message);}return Response.json(daily,{headers:{'Cache-Control':'no-store'}});}
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

// The concrete workout of a proposed 'workout' action (library workout or
// gym plan, not yet in the calendar); a gym plan carries the muscles of its exercises.
async function workoutPreview(env,ctx,a){
  const path=a.sport==='gym'?'/app/api/gym/generate':'/app/api/workouts/generate';
  // The library workout named in the answer, at the proposed length; without one the coach picks.
  const exact=a.workoutId&&a.sport!=='gym'?{workoutId:a.workoutId,resizeTo:a.minutes}:{};
  const internalUrl=new URL('https://internal'+path),response=await handleDashboardApi(new Request(internalUrl,{method:'POST',headers:{Origin:internalUrl.origin,'Content-Type':'application/json'},body:JSON.stringify({date:a.date,sport:a.sport,durationMinutes:a.minutes,availabilityMinutes:a.minutes,environment:'auto',preview:true,userInitiated:true,...exact})}),env,ctx,internalUrl,{signedIn:true});
  const result=await response.json();if(!response.ok||result.status!=='ok')throw new Error(result.message||L('Trénink se nepodařilo připravit.', 'The workout couldn\'t be prepared.'));
  if(a.sport==='gym'&&result.plan?.rows)result.muscles=Object.fromEntries([...new Set(result.plan.rows.map(r=>r?.[1]).filter(Boolean))].map(name=>[name,exerciseMuscles(name)]));
  return result;
}
// Workout library: search, generate, schedule, feedback, capabilities.
async function handleWorkoutsApi(request,env,ctx,url,session,internalAuth){
  if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
  const sport=url.searchParams.get('sport')==='run'?'run':'ride';
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  try{
    if(url.pathname==='/app/api/workouts/capabilities'&&request.method==='GET')return Response.json({status:'ok',sport,capabilities:await getCapabilities(env.DB,sport)},{headers:{'Cache-Control':'no-store'}});
    if(url.pathname==='/app/api/workouts/scheduled'&&request.method==='GET')return Response.json({status:'ok',workouts:await getScheduledWorkouts(env.DB)},{headers:{'Cache-Control':'no-store'}});
    // One library workout as ridden outdoors or indoors (steps, watts, notes).
    // A planned event of the week drawn like a library workout: the library
    // workout it was scheduled from, or the structure of the Intervals.icu event.
    if(url.pathname==='/app/api/workouts/planned'&&request.method==='GET'){
      const id=String(url.searchParams.get('id')||'').replace(/^planned:/,'');
      if(!id)return Response.json({status:'error',message:L('Chybí trénink.', 'The workout is missing.')},{status:400});
      const row=await env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND external_id=?").bind(env.USER_ID,'planned:'+id).first();
      let event=null;try{event=JSON.parse(row?.payload_json||'null');}catch{event=null;}
      const link=await env.DB.prepare('SELECT workout_id,environment FROM workout_schedule_links WHERE user_id=? AND intervals_event_id=? ORDER BY id DESC LIMIT 1').bind(env.USER_ID,id).first().catch(()=>null);
      const library=link?await getWorkout(env.DB,link.workout_id).catch(()=>null):null;
      if(!event&&!library)return Response.json({status:'error',message:L('Trénink nebyl nalezen.', 'The workout wasn\'t found.')},{status:404});
      const thresholds=await cached(env,ctx,'thresholds',()=>athleteThresholds(env)),w=library?renderForEnvironment(library,link.environment==='indoor'?'indoor':'outdoor'):plannedEventWorkout(event),kind=w.sport==='run'?'run':'ride';
      let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}
      w.steps=kind==='run'?stepRows(structure,{environment:w.environment,sport:'run',thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones});
      return Response.json({status:'ok',source:library?'library':'intervals',workout:w,athlete:{ftp:thresholds.ftp,indoorFtp:rideFtpFor(thresholds,'indoor').ftp,indoorFtpEstimated:rideFtpFor(thresholds,'indoor').estimated,runThresholdPace:thresholds.runThresholdPace}},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/render'&&request.method==='GET'){
      const workout=await getWorkout(env.DB,String(url.searchParams.get('id')||''));
      if(!workout)return Response.json({status:'error',message:'Workout nebyl nalezen.'},{status:404});
      const environment=url.searchParams.get('environment')==='indoor'?'indoor':'outdoor',thresholds=await cached(env,ctx,'thresholds',()=>athleteThresholds(env)),w=renderForEnvironment(workout,environment),kind=w.sport==='run'?'run':'ride';
      let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}
      w.steps=kind==='run'?stepRows(structure,{environment:w.environment,sport:'run',thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones});
      return Response.json({status:'ok',workout:w,athlete:{ftp:thresholds.ftp,indoorFtp:rideFtpFor(thresholds,'indoor').ftp,indoorFtpEstimated:rideFtpFor(thresholds,'indoor').estimated,runThresholdPace:thresholds.runThresholdPace}},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/search'&&request.method==='GET'){
      await cached(env,ctx,'reconcile:'+pragueToday(),async()=>{await reconcileWorkoutLibraryCompletions(env,ctx,internalAuth);return {done:true};});
      const date=validDate(url.searchParams.get('date'))?url.searchParams.get('date'):pragueToday();
      const coach=buildCyclingCoachV2({...await loadCoachInputs(env,ctx,internalAuth,date),capabilities:await getCapabilities(env.DB,sport),sport});
      const context={readiness:coach.readiness.status,hardBikeDaysRolling7d:coach.load.hardBikeDaysRolling7d,phase:String(url.searchParams.get('phase')||'')};
      // Without a length the list is ranked by the length the coach would pick
      // for the day (50 min or 4 h alike); no length is filtered out.
      const filters=parseWorkoutSearchFilters(url.searchParams),autoDuration=filters.durationMinutes==null&&Number(coach.constraints?.availableMinutes)>0?{durationMinutes:Number(coach.constraints.availableMinutes)}:null;
      if(autoDuration)Object.assign(filters,{durationMinutes:autoDuration.durationMinutes,durationSoft:true});
      // With no type chosen, the type the coach recommends for the day ranks first.
      const coachKind=coach.recommendation?.session?.kind;if(!filters.system&&coachKind)filters.preferredSystem=coachKind==='long_endurance'?'endurance':coachKind==='vo2'?'vo2max':coachKind;
      const [result,thresholds]=await Promise.all([searchWorkoutLibrary(env.DB,filters,context),cached(env,ctx,'thresholds',()=>athleteThresholds(env))]);
      result.autoDuration=autoDuration;result.coachPick={system:filters.preferredSystem||null,durationMinutes:autoDuration?.durationMinutes||null};
      // Step rows with watts or paces for each card.
      for(const w of result.workouts){let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}w.steps=sport==='run'?stepRows(structure,{environment:w.environment,sport,thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones});}
      return Response.json({...result,date,athlete:{ftp:thresholds.ftp,indoorFtp:rideFtpFor(thresholds,'indoor').ftp,indoorFtpEstimated:rideFtpFor(thresholds,'indoor').estimated,source:thresholds.source,runThresholdPace:thresholds.runThresholdPace,runPaceSource:thresholds.runPaceSource},rankingContext:{...context,tsb:coach.readiness.tsb,readinessScore:coach.readiness.score},sourcePolicy:sport==='run'?L('Vlastní PFD běžecké tréninky, publikované výzkumné protokoly (Helgerud, Billat, Seiler, Daniels) a veřejně popsané metody s uvedením zdroje. Placené plány a aplikace se nekopírují.', 'Own PFD running workouts, published research protocols (Helgerud, Billat, Seiler, Daniels) and publicly described methods with their source. Paid plans and apps are not copied.'):L('Vlastní PFD workouty, publikované výzkumné protokoly a veřejně popsané tréninky profi s uvedením zdroje. Proprietární knihovny (TrainerRoad, Xert, JOIN, Zwift, TrainerDay) se nekopírují.', 'Own PFD workouts, published research protocols and publicly described pro workouts with their source. Proprietary libraries (TrainerRoad, Xert, JOIN, Zwift, TrainerDay) are not copied.')},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/generate'&&request.method==='POST'){
      const body=await request.json().catch(()=>({}));
      const date=validDate(body.date)?body.date:pragueToday();
      if(date<pragueToday())return Response.json({status:'error',message:L('Vyber dnešní nebo budoucí datum.', 'Choose today or a future date.')},{status:400});
      let availabilityMinutes=Number.isFinite(Number(body.availabilityMinutes))&&Number(body.availabilityMinutes)>0?Number(body.availabilityMinutes):null;
      const genSport=body.sport==='run'?'run':'ride';
      const userInitiated=body.userInitiated===true||Boolean(body.workoutId&&Number(body.resizeTo)>0);
      // The weekly planner's role for this day (long, easy, quality) steers the coach.
      assertTrainingAllowed(await getAthleteState(env.DB));
      const prefs=await getWeekPlan(env.DB,date),weekRole=roleFor(prefs,date,genSport);
      // The calendar chip's length is the default, so the proposal matches what the week plan shows.
      const weekTarget=prefs&&!availabilityMinutes&&!body.resizeTo?targetFor(await computeWeekTargets(env,ctx,mondayOfDate(date),prefs).catch(()=>null),date,genSport):null;
      if(weekTarget?.minutes)availabilityMinutes=weekTarget.minutes;
      availabilityMinutes=trainingBudget(prefs,date,availabilityMinutes,{userInitiated});
      if(availabilityMinutes!=null&&availabilityMinutes<(genSport==='run'?20:30))throw new Error(L('V tento den nemáš dost času na tento trénink.', 'You don\'t have enough time for this workout on this day.'));
      // The chip's place (the athlete's choice or the forecast) first, then the forecast.
      const weather=weekTarget?.environment?{}:await weekWeather(prefs.location,mondayOfDate(date)),suggestedEnvironment=weekTarget?.environment?{environment:weekTarget.environment,reason:weekTarget.reason}:environmentFor(date,genSport,weather[date]);
      const environment=body.environment==='auto'||!body.environment?suggestedEnvironment.environment:body.environment;
      // Indoor is shorter (the chip already is when it says indoor).
      if(!userInitiated&&environment==='indoor'&&weekTarget?.environment!=='indoor')availabilityMinutes=availabilityMinutes!=null?indoorMinutes(genSport,availabilityMinutes):genSport==='ride'?90:60;
      const goal=body.phase||weekRole?.focus?{...(body.phase?{phase:String(body.phase)}:{}),...(weekRole?.focus?{focus:weekRole.focus}:{})}:null;
      const coach=buildCyclingCoachV2({...await loadCoachInputs(env,ctx,internalAuth,date),availabilityMinutes,capabilities:await getCapabilities(env.DB,genSport),goal,sport:genSport});
      const thresholds=await cached(env,ctx,'thresholds',()=>athleteThresholds(env));
      const resizeTo=Number.isFinite(Number(body.resizeTo))&&Number(body.resizeTo)>0?trainingBudget(prefs,date,Number(body.resizeTo),{userInitiated}):null;
      if(resizeTo!=null&&resizeTo<(genSport==='run'?20:30))throw new Error(L('Na změnu délky nezbývá dost času.', 'There isn\'t enough time left to change the duration.'));
      // The free time is a limit, not a target: the coach may want less (an easy
      // day, a beginner, a run that grows slowly). A length typed by the athlete wins.
      const coachMinutes=Number(coach.recommendation?.session?.durationMinutes)||null;
      const sessionMinutes=!userInitiated&&availabilityMinutes!=null&&coachMinutes?Math.min(availabilityMinutes,coachMinutes):availabilityMinutes;
      let generated=await generateWorkout(env.DB,{sport:genSport,environment,date,coach,availabilityMinutes:resizeTo??sessionMinutes,variant:body.variant,thresholds,workoutId:body.workoutId?String(body.workoutId).slice(0,120):null,resizeTo});
      if(sessionMinutes&&resizeTo==null&&generated.workout?.duration_minutes>sessionMinutes)generated=await generateWorkout(env.DB,{sport:genSport,environment,date,coach,thresholds,workoutId:generated.workout.id,resizeTo:sessionMinutes});
      return Response.json({...generated,weekRole,weekTarget,environmentReason:suggestedEnvironment.reason},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/feedback'&&request.method==='POST'){
      // Completion comes from the activity paired in Intervals.icu; the athlete adds RPE (and a note).
      const body=await request.json().catch(()=>({})),workoutId=String(body.workoutId||''),scheduledDate=String(body.scheduledDate||'');
      let completedPercent=Number(body.completedPercent),activityId=null;
      const link=validDate(scheduledDate)?await scheduledLink(env.DB,workoutId,scheduledDate):null;
      const m=link?await matchScheduledActivity(env,ctx,internalAuth,link):null;
      if(m){activityId=m.activityId;if(!Number.isFinite(completedPercent))completedPercent=m.completedPercent;}
      const manual=link?.intervals_event_id?.startsWith('local-')&&body.manualComplete===true;
      const minutes=Number(body.minutes);
      if(manual){if(scheduledDate>pragueToday()||!Number.isFinite(minutes)||minutes<=0||minutes>1440)return Response.json({message:L('Zadej skutečnou délku dokončeného tréninku.', 'Enter the actual duration of the completed workout.')},{status:400});completedPercent=Math.min(100,Math.round(minutes/link.duration_minutes*100));}
      if(!Number.isFinite(completedPercent))return Response.json({status:'error',message:L('K tomuto workoutu jsem v Intervals.icu zatím nenašel dokončenou aktivitu. RPE zadáš, až bude aktivita nahraná a spárovaná s plánem.', 'I haven\'t found a completed activity for this workout in Intervals.icu yet. You can enter the RPE once the activity is uploaded and matched with the plan.')},{status:409});
      const notes=typeof body.notes==='string'&&body.notes.trim()?body.notes.trim().slice(0,1000):null,rpe=body.rpe==null||body.rpe===''?null:Number(body.rpe);
      const result=await recordWorkoutFeedback(env.DB,{workoutId,scheduledDate,completedPercent,rpe,survey:'completed',notes});
      if(manual)await completeLocalWorkout(env.DB,link.intervals_event_id,{minutes,rpe,notes});
      const intervals=rpe!=null?await writeIntervalsRpe(env,activityId,rpe):{status:'skipped'};
      // The coach's note is written in the background; the dashboard picks it up.
      const reflect=validDate(scheduledDate)&&Boolean(env.OPENAI_API_KEY)&&(await subscriptionStatus(env)).aiAccess;
      if(reflect)ctx.waitUntil(createReflection(env,{date:scheduledDate,workoutId,rpe,notes},day=>reflectionData(env,ctx,internalAuth,day,workoutId)).catch(error=>console.error('Coach reflection failed',error.message)));
      return Response.json({...result,completedPercent,intervals,reflection:reflect?'pending':'unavailable'},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/schedule'&&request.method==='POST'){
      const body=await request.json().catch(()=>({})),date=String(body.date||'');
      if(!validDate(date)||date<pragueToday())return Response.json({status:'error',message:L('Vyber dnešní nebo budoucí datum.', 'Choose today or a future date.')},{status:400});
      return Response.json(await scheduleWorkoutInIntervals(env,env.DB,{workoutId:String(body.workoutId||''),date,confirm:body.confirm===true,environment:body.environment}),{headers:{'Cache-Control':'no-store'}});
    }
  }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  return null;
}

async function handleAdminApi(request, env, url, session) {
  const user = session.user;
  if (!session.signedIn || !user?.isAdmin) return Response.json({status:"error",message:L("Jen pro správce.", "Admins only.")},{status:403});
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return Response.json({message:L("Neplatný původ požadavku.", "Invalid request origin.")},{status:403});
  const db = env.RAW_DB;
  try {
    if (url.pathname === "/app/api/admin/users" && request.method === "GET") return Response.json({status:"ok",...await listUsersAndInvites(db)},{headers:{"Cache-Control":"no-store"}});
    const body = await request.json().catch(() => ({}));
    if (url.pathname === "/app/api/admin/invites" && request.method === "POST") return Response.json({status:"ok",email:await inviteUser(db, body.email, user.id),message:L("Pozvánka je uložená. Uživatel se může přihlásit přes Google.", "The invitation is saved. The user can sign in with Google.")});
    if (url.pathname === "/app/api/admin/invites" && request.method === "DELETE") { await removeInvite(db, body.email); return Response.json({status:"ok",message:L("Pozvánka je zrušená.", "The invitation is cancelled.")}); }
    if (url.pathname === "/app/api/admin/users" && request.method === "POST") { await setUserDisabled(db, env, body.id, body.disabled === true); return Response.json({status:"ok",message:body.disabled===true?L("Přístup je zablokovaný.", "Access is blocked."):L("Přístup je obnovený.", "Access is restored.")}); }
  } catch (error) { return Response.json({status:"error",message:error.message},{status:400}); }
  return Response.json({status:"error",message:"Not found"},{status:404});
}

async function handleStrengthAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? null : String(body.date).trim();
    const action = String(body?.action || "generate").toLowerCase();
    const preview = body?.preview === true;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });

    const routes = {
      generate: "/strength/generate-plan",
      regenerate: "/strength/generate-plan",
      adjust: "/strength/generate-plan",
      shorten: "/strength/generate-plan",
      protect_legs: "/strength/generate-plan",
      focus_upper: "/strength/generate-plan",
      focus_lower: "/strength/generate-plan",
      substitute: "/strength/substitute",
      import_history: "/strength/history/import",
      sync: "/strength/sync"
    };
    const route = routes[action];
    if (!route) return Response.json({ status: "error", message: `Unknown strength action: ${action}` }, { status: 400 });

    // The nightly run follows the week plan: no gym that day, no plan; a plan
    // already there (made or edited by the athlete) is kept.
    if (body?.nightly === true && action === "generate") {
      const day = date || pragueToday(), skip = await nightlyGymSkip(env.DB, day);
      if (skip) return Response.json({ status: "skipped", action, date: day, reason: skip });
    }
    const internalUrl = new URL(route, request.url);
    const payload = { ...body, date, preview, action };
    if (action === "protect_legs" || action === "focus_upper") payload.forceProtectLegs = true;
    if (action === "shorten" && payload.durationMinutes == null) payload.durationMinutes = 60;
    if (action === "substitute") {
      if (!payload.from) return Response.json({ status: "error", message: "substitute requires 'from'" }, { status: 400 });
      if (!payload.to && !payload.muscle) return Response.json({ status: "error", message: "substitute requires 'to' or 'muscle'" }, { status: 400 });
    }

    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: { ...internalHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json({ ...result, action }, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}


async function handleNutritionAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? null : String(body.date).trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });
    const internalUrl = new URL("/nutrition/plan", request.url);
    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: { ...internalHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, date })
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json(result, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}

function logoResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#111827"/><path d="M68 132h32l18-54 30 100 20-46h20" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="68" cy="132" r="8" fill="#fff"/></svg>`;
  return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}


// Calories are not written to Intervals.icu. These automations remove what
// the app wrote there before: the calorie lines in planned workouts and the
// daily "Nutrition — date" notes, from today on.
async function handlePlannedCaloriesAutomation(request, rawEnv) {
  if (request.method !== "POST") return Response.json({status:"error",message:"Method not allowed"},{status:405});
  try { await verifyGitHubActionsToken(request); }
  catch (error) { return Response.json({status:"error",step:"github_actions_auth",message:error.message},{status:401}); }
  try {
    const body=await request.json().catch(()=>({}));
    const today=pragueToday(),oldest=String(body?.oldest||today),newest=String(body?.newest||shiftDate(today,60));
    const users=await forEachUser(rawEnv,["intervals"],env=>removePlannedEventCalories(env,{oldest,newest}));
    return Response.json({status:"ok",users});
  } catch (error) { return Response.json({status:"error",step:"planned_calories",message:error.message},{status:500}); }
}

async function handleNutritionNotesAutomation(request, rawEnv) {
  if (request.method !== "POST") return Response.json({status:"error",message:"Method not allowed"},{status:405});
  try {
    await verifyGitHubActionsToken(request);
    const body=await request.json().catch(()=>({}));
    const today=pragueToday(), oldest=String(body?.oldest||today), newest=String(body?.newest||shiftDate(today,14));
    const users=await forEachUser(rawEnv,["intervals"],env=>deleteDailyNutritionNotes(env,{oldest,newest}));
    const failed=users.filter(u=>u.error);
    return Response.json({status:failed.length&&failed.length===users.length?"error":"ok",users},{status:failed.length&&failed.length===users.length?500:200});
  } catch(error){ return Response.json({status:"error",step:"nutrition_notes",message:error.message},{status:500}); }
}


function pragueWeekStart() {
  const now = new Date();
  const parts = dateFormat("en-GB", {timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(now);
  const y = Number(parts.find(x=>x.type==="year").value);
  const m = Number(parts.find(x=>x.type==="month").value);
  const d = Number(parts.find(x=>x.type==="day").value);
  const weekday = parts.find(x=>x.type==="weekday").value;
  const index = {Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[weekday] ?? 0;
  return shiftDate(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`, -index);
}
// Like Promise.all over items, with at most `limit` running at a time; keeps order.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}
function shiftDate(date, days) {
  const p = String(date).slice(0,10).split("-").map(Number);
  const d = new Date(Date.UTC(p[0],p[1]-1,p[2]+Number(days)));
  return d.toISOString().slice(0,10);
}
