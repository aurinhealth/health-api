import {initialImport,recentDashboardImport} from './account-sync.js';

import { trainingSetup } from './onboarding.js';
import { subscriptionStatus, assertAIAccess } from './subscription.js';
import { listRecipes, saveRecipe, deleteRecipe } from './personal-recipes.js';
import {deletePersonalFood} from './personal-foods.js';
import {retryWorkoutExports,syncLocalWorkout,completeLocalWorkout,storeLocalEvent} from './local-workouts.js';
import app from "./strength-gateway.js";
import { foodRecommend } from "./food-recommend.js";
import { buildCoachCouncil } from "./coach-engine.js";
import { connectionStatus } from "./connections.js";
import { connectionEnvironment, saveConnectionSecret, deleteConnectionSecret, missingProviders, migrateConnectionSecrets } from "./connection-secrets.js";
import { withIntervalsSleep } from './intervals-sleep.js';
import { cached, bumpCacheVersion } from './api-cache.js';
import { manualPairs } from './manual-pairs.js';
import { activityDetail } from './activity-detail.js';
import { useCookbookDatabase } from './cookbook.js';
import {googleDashboard} from './google-dashboard.js';
import {applyEnergyBudget} from './energy-budget.js';
import {buildToday} from './app-today.js';
import {withIdempotency} from './idempotency.js';
import {buildTraining, weekStart} from './app-training.js';
import {buildCalendar} from './app-calendar.js';
import {buildHealth} from './app-health.js';
import {buildFood} from './app-food.js';
import {normalizeProfile} from './energy-profile.js';
import {athleteFocus} from './athlete-focus.js';
import { loadProfiles, refreshSuggestions } from './profile-suggestions.js';
import {syncWeights} from './weight-sync.js';
import {syncWellnessToIntervals} from './wellness-sync.js';
import {askCoach,coachContext,lightModel,assistantTask,engineSport} from './coach-assistant.js';
import {assistantAppContext,selectedAssistantContext} from './assistant-app-context.js';
import { validateCoachActions, actionSafetyContext, actionsNote } from './coach-actions.js';
import { buildReviewInput, reviewDay, dayReadiness, usageCost } from "./coach-review.js";
import { trendFacts } from "./trend-facts.js";
import { createReflection, listReflections, activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { addLoads } from "./training-load.js";
import { savePersonalFood } from './personal-foods.js';
import { processFoodGoogle, backfillFoodGoogle } from './food-google-sync.js';
import { isFoodLogMessage, buildFoodDraft, foodDraftSummary } from "./food-chat.js";
import { loadRecoveryValidation } from "./recovery-validation.js";
import { handleGoogleOAuth } from "./google-oauth.js";
import { getStrengthHistory, parseStrengthPlan } from "./strength-history.js";
import { explainWorkout } from "./workout-explanation.js";
import { aiWorkoutPick } from "./ai-workout-pick.js";
import { getWorkout, searchWorkoutLibrary, parseWorkoutSearchFilters, getCapabilities, getScheduledWorkouts, recordWorkoutFeedback, scheduleWorkoutInIntervals, generateWorkout, scheduledLink, stepRows } from "./workout-library.js";
import { buildCyclingCoachV2 } from "./cycling-coach-v2.js";
import { athleteThresholds, rideFtpFor } from "./intervals-athlete.js";
import { renderForEnvironment } from "./workout-model.js";
import { plannedEventWorkout } from "./planned-detail.js";
import { getWeekPlan, saveWeekPlan, addWeekSport, resetWeekPlan, planWeekRoles, roleFor, weekTargets, targetFor, weekLoadsBefore, hrvWeekTrendDown, weeklyRunCap, capRunVolume } from "./week-planner.js";
import { availabilityOn, trainingBudget, validDay as validTrainingDay } from './training-availability.js';
import { getCheckin, saveCheckin } from './morning-checkin.js';
import { getChecks, upcomingTest } from './threshold-check.js';
import { getAthleteState, updateAthleteState, explicitPreference, assertTrainingAllowed, proactiveAdvice } from './athlete-state.js';
import { savePlanState, planChoice, planUndo, missedSession, proposalView, phaseLabel, planWeek, planWorkoutId, levelShift, systemOf, planTemplates, templateSummary, planSummary, planStart, planDays, startPlan, stopPlan, getTemplate } from './training-plans.js';
import { capWeekTargets, estimatedTargets, weekProposal, weekWeather, environmentFor, activityHistoryEstimate, indoorMinutes } from './adaptive-week.js';
import { movePlannedEvent, deletePlannedEvent } from "./planned-events.js";
import { loadFitnessInsights, exerciseMuscles } from "./fitness-insights.js";
import { readGymPlan, ensureGymPlans } from "./gym-plan-store.js";
import { listRecovery, addRecovery, updateRecovery } from "./recovery-plan.js";
import { screenText, SCREENS, markScreenTextsStale } from "./screen-texts.js";
import { nightDetail } from "./night-detail.js";
import { applyGymSwap } from './coach-gym-adjustment.js';
import { dashboardSyncStatus,startDashboardSync } from './dashboard-sync.js';
import { assistantStreamResponse } from './assistant-stream.js';
import legacyHealthApi, { googleToken, matchActivities } from "./index.js";
import { handleGoogleLogin } from "./google-login.js";
import { handleNativeConnect } from "./native-connect.js";
import { reviewRefusal, isReviewAccount } from "./app-review.js";
import { handleNativeAppleLogin } from "./apple-login.js";
import { chatContext, appendChatTurn, listChats, readChat, deleteChat } from "./assistant-chats.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { isPublicPath, resolvePrincipal, unauthorizedResponse, handleDashboardLogout, sessionSecret, foreignOriginChange, sessionMatchesUser, slidingSession } from "./dashboard-auth.js";
import { appleAppSiteAssociation } from "./apple-app-site-association.js";
import { wwwRedirect } from "./app-origin.js";
import { internalHeaders } from "./internal-auth.js";
import { deleteAccount, finishAccountDeletions, revokeGoogle, inactiveAccounts } from "./account-data.js";
import { handleIntervalsOAuth } from "./intervals-oauth.js";
import { handleStravaOAuth, disconnectStrava, syncStravaWeight } from "./strava.js";
import { sendActivity, retrySyncSends, readSyncPrefs, healthAllowed } from "./sync-destinations.js";
import { ensureTenancy, TenancyUpgradeInProgress, findUser, ownerUser, usersWithProviders, openSignup } from "./tenancy.js";
import { userDataEnvironment, deletionDatabase, UserDataUnavailable } from './user-data-shards.js';
import { FoodCatalogUnavailable, foodCatalogRequestPaused } from './food-catalog-storage.js';
import { handlePasskeyLogin } from "./passkeys.js";
import { handleEmailLogin } from "./email-login.js";
import { emailConfigured } from "./email-sender.js";
import { needsAIAccess } from "./ai-routes.js";
import { clearConnectionHealth, connectionProblems } from "./connection-health.js";
import { handleSupportReport } from "./support-report.js";
import { saveAppleHealth, appleHealthStatus, disconnectAppleHealth, appleBodyTooLarge } from "./apple-health.js";
import { handlePushToken, sendMorningReadiness, hasLastNight, pushConfigured } from "./push.js";
import { overviewPage, privacyPage, termsPage, supportPage } from './site-pages.js';
import { lang, withLang, storedLanguage, rememberLanguage, withUnits, storedUnits, rememberUnits, L } from "./lang.js";
import { appUpdateRequired } from "./app-version.js";
import { compactHeartRate } from "./heart-rate-compaction.js";
import { DEFAULT_TIME_ZONE, validTimeZone, withTimeZone, storedTimeZone, rememberTimeZone, localNow, localToday, localDate, localHour } from "./user-time.js";
import { shiftDate, googleHealthFor, dashboardProfile, mondayOfDate, dayStartSql, mapLimit, userWeekStart } from "./dashboard-shared.js";
import { recentCoachProposals, ensureCoachInboxTable } from "./coach-inbox.js";
import { recentWorkoutFeedback, reconcileWorkoutLibraryCompletions, matchScheduledActivity, writeIntervalsRpe } from "./library-workouts.js";
import { planningHistory, planForWeek, syncedPlans, planSportDates, todayPlace, trainingGymPlans } from "./plan-context.js";
import { rideReviewsForCoach, rideDetailsFor } from "./coach-ride-reviews.js";
import { ownFitness, watchOnlyFitness } from "./own-fitness.js";
import { handleStrengthAutomation, handleAdminApi } from "./routes-admin.js";
import { handleAccountApi } from "./routes-account.js";
import { handleSyncApi } from "./routes-sync.js";
import { handleGymToolsApi, handleGymPlanApi } from "./routes-gym.js";
import { handleTrainingEditsApi, handleThresholdApi } from "./routes-training.js";
import { handleFoodApi, queueFoodGoogleSafely } from "./routes-food.js";
import { ownerOnlyRefusal } from "./owner-only-routes.js";


// Requests that read or preview only and so keep the cache.
// The screen data the app just loaded, per user and path, for 30 s: the
// coach's text asks right after and compares the same state instead of
// building it again. Any write by the user drops it.
const SCREEN_PATHS = new Set(["/app/api/today", "/app/api/training", "/app/api/food-today"]);
const recentScreens = new Map();
function rememberScreen(userId, path, json) {
  if (recentScreens.size > 500) recentScreens.clear();
  recentScreens.set(userId + "|" + path, { at: Date.now(), json });
}
function recentScreen(userId, path) {
  const hit = recentScreens.get(userId + "|" + path);
  return hit && Date.now() - hit.at < 30000 ? hit.json : null;
}
function forgetScreens(userId) {
  for (const key of recentScreens.keys()) if (key.startsWith(userId + "|")) recentScreens.delete(key);
}
// Unlinking Apple (/app/api/me/apple), adding or removing passkeys and signing out everywhere change no training data.
const CACHE_NEUTRAL = /^\/app\/api\/(sync\/(prefs|activity|retry)|food\/(label|photo|search|ai-lookup)|workouts\/generate|gym\/generate|gym\/equipment\/detect|gym\/technique|training-profile\/estimate|assistant$|assistant\/stream|assistant\/chats|me\/apple$|account\/(email\/(start|verify)|sign-out-everywhere)$|support\/report$|push\/token$|passkeys$|passkeys\/options$)/;
const STATIC_PATHS = new Set(['/logo.svg','/','/privacy','/terms','/support']);

// Runs fn once per active user (with that user's env and credentials), for
// cron jobs and GitHub automations that act on everyone's data.
async function forEachUser(env, providers, fn) {
  const results = [];
  for (const user of await usersWithProviders(env.DB, env, providers)) {
    // The App Review demo account syncs with no third-party service (app-review.js).
    if (isReviewAccount(env, user)) continue;
    try {
      const scoped = await connectionEnvironment(await userDataEnvironment(env, user));
      // Texts written by a job (workouts sent to Intervals.icu, …) use the user's
      // app language, and its days the user's time zone.
      if (providers.some(p => (scoped.CONNECTED_PROVIDERS || []).includes(p))) {
        const [language, zone] = await Promise.all([storedLanguage(env.DB, user.id, { fresh: true }), storedTimeZone(env.DB, user.id, { fresh: true })]), unitsChoice = await storedUnits(env.DB, user.id);
        results.push({ userId: user.id, result: await withLang(language, () => withUnits(unitsChoice, () => withTimeZone(zone, () => fn(scoped, user)))) });
      }
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
    useCookbookDatabase(env.DB);
    // Data of deleted accounts that the delete request had no time for.
    if (controller.cron === "* * * * *") await finishAccountDeletions(env.DB, env.USER_DATA_ROUTING === 'true' || env.FOOD_CATALOG_ROUTING === 'true' ? { databaseForUser: id => deletionDatabase(env, id) } : {}).catch(error => console.error("Account deletion failed", error.message));
    // Accounts unused for two years go with their data (privacy policy). Tried
    // every ten minutes between 2:00 and 3:00 UTC, as a cron minute can be missed.
    if (controller.cron === "* * * * *" && new Date().getUTCHours() === 2 && new Date().getUTCMinutes() % 10 === 0) {
      for (const user of await inactiveAccounts(env.DB, env).catch(error => { console.error("Inactive accounts read failed", error.message); return []; })) {
        await deleteAccount(await connectionEnvironment(await userDataEnvironment(env, user)), user, { budgetMs: 1000 }).catch(error => console.error("Inactive account deletion failed", user.id, error.message));
      }
    }
    // After the user's midnight (0:00–6:00 in their zone), heart-rate samples
    // older than two weeks become 5-minute rows, six hours of samples a minute.
    await forEachUser(env, ["google", "intervals"], async scoped => {
      const result = await app.scheduled(controller, scoped, ctx);
      if (controller.cron === "* * * * *" && localHour() < 6 && (scoped.CONNECTED_PROVIDERS || []).includes("google")) await compactHeartRate(scoped.DB, scoped.USER_ID).catch(error => console.error("Heart-rate compaction failed", error.message));
      // The morning readiness push once the night's data has synced (push.js),
      // checked every five minutes; it goes out at most once a local day.
      if (controller.cron === "* * * * *" && new Date().getUTCMinutes() % 5 === 0) await morningPush(scoped, ctx).catch(error => console.error("Morning push failed", error.message));
      return result;
    });
    // Connection keys saved before CONNECTION_KEY existed get it (connection-secrets.js).
    if (controller.cron === "* * * * *" && new Date().getUTCMinutes() % 5 === 0) await migrateConnectionSecrets(env).then(result => { if (result.migrated || result.failed) console.log("Connection key migration", result); }).catch(error => console.error("Connection key migration failed", error.message));
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()%5===0)await forEachUser(env,['google'],async scoped=>{await backfillFoodGoogle(scoped.DB);return processFoodGoogle(scoped,{token:googleToken});});
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()%5===0)await forEachUser(env,['intervals'],async scoped=>{await retryWorkoutExports(scoped);});
    // Done activities whose send to Google Health, Intervals.icu or Strava did not go through (sync-destinations.js).
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()%5===0)await forEachUser(env,['google','intervals','strava'],scoped=>retrySyncSends(scoped,{googleToken}));
    // Hourly: the latest weight to Strava when it changed and the user sends it there.
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()===30)await forEachUser(env,['strava'],async scoped=>syncStravaWeight(scoped,{allowed:healthAllowed(await readSyncPrefs(scoped.DB,scoped.USER_ID,'strava'),'weight')}).catch(error=>({error:error.message})));
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
    const www = wwwRedirect(url);
    if (www) return www;
    // Static pages stay independent of storage availability.
    if (STATIC_PATHS.has(url.pathname) && request.method === 'GET') return staticRoute(url, request, env);
    try { await ensureTenancy(env.DB, env, { request }); }
    catch (error) {
      if (error instanceof TenancyUpgradeInProgress) return Response.json({status:"error",message:error.message},{status:503,headers:{"Retry-After":"30","Cache-Control":"no-store"}});
      throw error;
    }
    useCookbookDatabase(env.DB);
    const rawEnv = env;
    // Deny by default: only allowlisted routes are reachable without a session or API key.
    let principal = await resolvePrincipal(request, env);
    const isPublic = isPublicPath(url.pathname);
    if (!isPublic && !principal) {
      const response = unauthorizedResponse();
      if (env.USER_DATA_ROUTING === 'true') response.headers.set('X-Storage-Routing', '1');
      if (env.FOOD_CATALOG_ROUTING === 'true') response.headers.set('X-Food-Catalog-Routing', '1');
      return response;
    }
    let user = null;
    if (principal?.kind === "user") {
      user = await findUser(env.DB, principal.userId, env);
      // A cookie from before the user signed out everywhere (or changed the e-mail, removed a passkey or the Apple ID) is no cookie.
      if (user && !sessionMatchesUser(principal, user)) { user = null; principal = null; }
      if (!user && !isPublic) return unauthorizedResponse();
    } else if (principal?.kind === "owner" || principal?.kind === "system") {
      // The owner API key and GitHub automations act as the owner.
      user = await ownerUser(env.DB, env);
    }
    if (user) {
      try { env = await connectionEnvironment(await userDataEnvironment(rawEnv, user)); }
      catch (error) {
        if (error instanceof UserDataUnavailable || error instanceof FoodCatalogUnavailable) return Response.json({status:'storage_unavailable',message:error instanceof FoodCatalogUnavailable?error.message:withLang(request.headers.get('X-Interface-Language')||/(?:^|;\s*)lw-lang=(cs|en)/.exec(request.headers.get('cookie')||'')?.[1],()=>L('Úložiště je dočasně nedostupné. Zkus to prosím později.', 'Storage is temporarily unavailable. Please try again later.'))},{status:503,headers:{'Retry-After':'30','Cache-Control':'no-store'}});
        throw error;
      }
    }
    else env = { ...rawEnv, DB: null, RAW_DB: rawEnv.DB };
    // Everything written for the user in this request follows the app language:
    // the app sends it with each request; otherwise the remembered choice.
    const headerLang = request.headers.get('X-Interface-Language');
    const cookieLang = /(?:^|;\s*)lw-lang=(cs|en)/.exec(request.headers.get('cookie') || '')?.[1];
    if (user && headerLang) await rememberLanguage(rawEnv.DB, user.id, headerLang);
    const language = headerLang || cookieLang || (user ? await storedLanguage(rawEnv.DB, user.id) : 'cs');
    // Units the same way (X-Units: metric|imperial), remembered so cron jobs and e-mails use them.
    const headerUnits = /^(metric|imperial)$/i.test(String(request.headers.get('X-Units') || '').trim()) ? request.headers.get('X-Units').trim().toLowerCase() : null;
    if (user && headerUnits) await rememberUnits(rawEnv.DB, user.id, headerUnits, language);
    const unitsChoice = headerUnits || (user ? await storedUnits(rawEnv.DB, user.id) : 'metric');
    // Days follow the user's time zone: the browser's, sent with app requests; otherwise the remembered one.
    const headerZone = validTimeZone(request.headers.get('X-Time-Zone'));
    if (user && headerZone) await rememberTimeZone(rawEnv.DB, user.id, headerZone);
    const zone = headerZone || (user ? await storedTimeZone(rawEnv.DB, user.id) : DEFAULT_TIME_ZONE);
    return withLang(language, () => withUnits(unitsChoice, () => withTimeZone(zone, () => routeRequest(request, env, ctx, { url, rawEnv, principal, user, isPublic }))));
  }
};

async function routeRequest(request, env, ctx, { url, rawEnv, principal, user, isPublic }) {
    {
    // Every change made with the session cookie, whatever the route.
    if (foreignOriginChange(request, principal)) return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const signedIn = principal?.kind === "user" && Boolean(user);
    // Routes only the old web dashboard used: the owner's (owner-only-routes.js).
    const ownerOnly = ownerOnlyRefusal(url.pathname, { signedIn, user });
    if (ownerOnly) return ownerOnly;
    if(signedIn&&needsAIAccess(request.method,url.pathname)){
      try{await assertAIAccess(env);}catch(error){return error.consent?Response.json({status:'ai_consent_required',message:error.message},{status:403}):Response.json({status:'subscription_required',message:error.message},{status:402});}
    }


    // Legacy Google Health endpoints live in index.js. The deployed Worker
    // uses entrypoint.js, so expose these routes explicitly instead of letting
    // them fall through to the dashboard gateway.
    if (url.pathname === "/sync/google" || url.pathname === "/sync/google/status" || url.pathname === "/health/sleep") {
      return legacyHealthApi.fetch(request, env, ctx);
    }
    if (url.pathname === "/automation/strength") return handleStrengthAutomation(request, env, ctx);
    // Passkeys in the iPhone app: the app's associated domain (apple-app-site-association.js).
    const siteAssociation = appleAppSiteAssociation(request, rawEnv, url.pathname);
    if (siteAssociation) return siteAssociation;
    // The App Review demo account connects no third-party service and sends nothing out (app-review.js).
    const demoRefusal = reviewRefusal(rawEnv, user, request.method, url.pathname);
    if (demoRefusal) return demoRefusal;
    // Only if Apple asks for it when the Services ID is set up: the file's content as a secret.
    if ((url.pathname.startsWith('/oauth/google') || url.pathname.startsWith('/oauth/intervals') || url.pathname.startsWith('/oauth/strava')) && !signedIn) return new Response(L('Připojení vyžaduje přihlášení do dashboardu.', 'Connecting requires signing in to the app.'),{status:401});
    const googleOAuth = await handleGoogleOAuth(request, env, url.pathname);
    if (googleOAuth) {if(url.pathname==="/oauth/google/callback"&&googleOAuth.status===302){await clearConnectionHealth(env,'google');await dashboardSyncStatus(env.DB);await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name='initial_google'").bind(env.USER_ID).run();await initialImport(await connectionEnvironment(env),ctx);}return googleOAuth;}
    const intervalsOAuth = await handleIntervalsOAuth(request, env, url.pathname);
    // A new Intervals.icu connection imports its history, the same as a pasted key.
    if (intervalsOAuth) {if(url.pathname==="/oauth/intervals/callback"&&intervalsOAuth.status===302){await clearConnectionHealth(env,'intervals');await dashboardSyncStatus(env.DB);await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name='initial_intervals'").bind(env.USER_ID).run();await initialImport(await connectionEnvironment(env),ctx);}return intervalsOAuth;}
    // Strava is only a destination (Synchronizace): nothing to import after connecting.
    const stravaOAuth = await handleStravaOAuth(request, env, url.pathname);
    if (stravaOAuth) return stravaOAuth;
    if (url.pathname === "/app/logout" && request.method === "POST") return handleDashboardLogout();
    const nativeConnect = await handleNativeConnect(request, rawEnv, url, { user, signedIn });
    if (nativeConnect) return nativeConnect;
    // Sign in with Apple inside the iPhone app; the token that revokes it is kept with the user's keys.
    const nativeApple = await handleNativeAppleLogin(request, rawEnv, url.pathname, { saveRefreshToken: async (account, token) => saveConnectionSecret(await userDataEnvironment(rawEnv, account), "apple", token) });
    if (nativeApple) return nativeApple;
    const googleLogin = await handleGoogleLogin(request, rawEnv, url.pathname);
    if (googleLogin) return googleLogin;
    const passkeyLogin = await handlePasskeyLogin(request, rawEnv, url.pathname);
    if (passkeyLogin) return passkeyLogin;
    const emailLogin = await handleEmailLogin(request, rawEnv, url.pathname, ctx);
    if (emailLogin) return emailLogin;
    if (url.pathname.startsWith("/app/api/")) {
      if (!user) return unauthorizedResponse();
      if (foodCatalogRequestPaused(request, env, url.pathname)) return Response.json({status:'catalog_upgrade',message:new FoodCatalogUnavailable().message},{status:503,headers:{'Retry-After':'30','Cache-Control':'no-store'}});
      // Any change by the user lets the coach's texts answer it at once (screen-texts.js).
      const planChange = request.method !== "GET" && !CACHE_NEUTRAL.test(url.pathname);
      if (request.method !== "GET") forgetScreens(user.id);
      // A write the app replays after a lost signal is stored once (idempotency.js).
      const response = await withIdempotency(request, env, url, r => handleDashboardApi(r, env, ctx, url, { user, signedIn }));
      // A change by the user makes the cached coach inputs outdated.
      if (request.method !== "GET" && !CACHE_NEUTRAL.test(url.pathname)) await bumpCacheVersion(env.DB);
      // A changed plan makes the coach's text of the day outdated (screen-texts.js).
      if (planChange && response.ok) await markScreenTextsStale(env).catch(() => {});
      // Today's screen data, kept a moment for the coach's text that follows it.
      if (request.method === "GET" && response.ok && SCREEN_PATHS.has(url.pathname) && !url.searchParams.get("date")) {
        response.clone().json().then(json => rememberScreen(user.id, url.pathname, json)).catch(() => {});
      }
      // A session in use gets a fresh 30-day cookie once a day (dashboard-auth.js).
      return slidingSession(request, response, sessionSecret(rawEnv));
    }
    if (!user) return unauthorizedResponse();
    return app.fetch(request, env, ctx);
    }
}

export default {
  scheduled: worker.scheduled,
  async fetch(request, env, ctx) {
    // An installed iPhone app older than the API answers with 426 (app-version.js).
    const outdated = appUpdateRequired(request);
    if (outdated) return outdated;
    return worker.fetch(request, env, ctx);
  }
};

async function staticRoute(url, request, env) {
  if (url.pathname === "/") return overviewPage(request);
  if (url.pathname === "/privacy") return privacyPage(request, { apple: true, email: emailConfigured(env), open: openSignup(env) });
  if (url.pathname === "/terms") return termsPage(request);
  if (url.pathname === "/support") return supportPage(request, { apple: true, email: emailConfigured(env), open: openSignup(env) });
  return logoResponse();
}


// Today's readiness exactly as /app/api/today computes it (buildToday), from
// only the inputs it needs. fresh skips the short-lived cache: right after an
// Apple Health upload the cached copies are older than the night just sent.
async function todayReadiness(env, ctx, date, { fresh = false } = {}) {
  const internalAuth = internalHeaders();
  const read = path => app.fetch(new Request('https://internal' + path, { headers: internalAuth }), env, ctx).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const internal = path => handleDashboardApi(new Request('https://internal' + path), env, ctx, new URL('https://internal' + path)).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const from = shiftDate(date, -30), to = shiftDate(date, 1);
  const [health, fitness, sleep, profile, checkin] = await Promise.all([
    (fresh ? googleDashboard(env.DB, date) : googleHealthFor(env, ctx, date)).catch(() => ({})),
    (fresh ? internal('/app/api/fitness?days=90') : cached(env, ctx, 'fitness:90', () => internal('/app/api/fitness?days=90'))).catch(() => ({})),
    read('/health/sleep?start=' + from + '&end=' + to).then(d => withIntervalsSleep(env, d, from, to)).catch(() => ({})),
    dashboardProfile(env).catch(() => null),
    getCheckin(env.DB, date).catch(() => null)
  ]);
  return buildToday({ date, hour: localHour(), health, fitness, sleep, profile: profile || {}, checkin }).readiness;
}

// The morning readiness push (push.js); it computes the readiness only when a
// push may go out (5–11 local, a device token, nothing sent today).
function morningPush(env, ctx, options = {}) {
  if (!pushConfigured(env)) return Promise.resolve({ sent: 0, reason: 'not-configured' });
  return sendMorningReadiness(env, { readiness: date => todayReadiness(env, ctx, date, options) });
}

// Load targets of a week: CTL and daily load from Intervals.icu wellness, what
// is done or planned per day from D1, then the shared calculation.
const sportOfType=t=>{t=String(t||'').toLowerCase();return /weight|strength/.test(t)?'gym':/ride|cycl|bike/.test(t)?'ride':/run/.test(t)?'run':null;};
async function computeWeekTargets(env,ctx,start,prefs){
  const end=shiftDate(start,7),today=localToday();
  const fitness=await handleDashboardApi(new Request('https://internal/app/api/fitness?days=42'),env,ctx,new URL('https://internal/app/api/fitness?days=42')).then(r=>r.json()).catch(()=>({}));
  const wellness=(fitness.wellness||[]).filter(r=>r.id<=today),ctl=[...wellness].reverse().find(r=>Number(r.ctl)>0)?.ctl;
  const loadOn=date=>{const r=wellness.find(x=>x.id===date);return Number(r?.ctlLoad??r?.atlLoad)||0;};
  let lastWeekLoad=0;for(let i=-7;i<0;i++)lastWeekLoad+=loadOn(shiftDate(start,i));
  const rows=(await env.DB.prepare("SELECT data_type,source_family,start_time,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family IN ('intervals','local') AND data_type IN ('planned-workout','activity')) OR (source_family IN ('google-wearables','apple-health') AND data_type='exercise')) AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID,shiftDate(start,-1),shiftDate(end,1)).all().catch(()=>({results:[]}))).results||[];
  const gymDays=new Set(((await env.DB.prepare("SELECT DISTINCT workout_date FROM strength_sets WHERE user_id=? AND workout_date>=? AND workout_date<?").bind(env.USER_ID,start,end).all().catch(()=>({results:[]}))).results||[]).map(r=>r.workout_date));
  const days=Array.from({length:7},(_,i)=>({date:shiftDate(start,i),done:loadOn(shiftDate(start,i)),planned:0,sports:[]}));
  // Running this week so far: done runs, and planned ones still ahead.
  let runCommitted=0;
  for(const r of rows){let p={};try{p=JSON.parse(r.payload_json||'{}');}catch{}const d=days.find(x=>x.date===localDate(r.start_time));if(!d)continue;
    const sport=sportOfType((r.source_family==='google-wearables'||r.source_family==='apple-health')?{WEIGHTLIFTING:'weight',WEIGHTS:'weight',STRENGTH_TRAINING:'weight',RUNNING:'run',BIKING:'ride'}[p.exercise?.exerciseType]:p.type);
    if(r.data_type==='planned-workout'&&!/nutrition/i.test(String(p.name||'')+' '+String(p.category||''))){d.planned+=Number(p.icu_training_load)||0;}
    if(sport==='run')runCommitted+=r.data_type==='planned-workout'?(d.date>today?(Number(p.moving_time)||0)/60:0):activityFromRow(r)?.minutes||0;
    if(sport&&!/nutrition/i.test(String(p.name||'')))d.sports.push(sport);}
  for(const d of days)if(gymDays.has(d.date))d.sports.push('gym');
  // The forecast decides outdoor or indoor (and so the length) unless the athlete chose.
  const weather=await weekWeather(prefs.location,start).catch(()=>({}));
  const runCap=weeklyRunCap(await planningHistory(env,start,28).catch(()=>[]),start);
  const plan=await planForWeek(env,ctx,start),roles=planWeekRoles(prefs.days,plan.roles);
  let targets=weekTargets({roles,ctl,lastWeekLoad,weekLoads:weekLoadsBefore(wellness,start),hrvDown:hrvWeekTrendDown(wellness,start),rampRate:[...wellness].reverse().find(r=>Number.isFinite(Number(r.rampRate)))?.rampRate??null,days,today,weekStart:start,plan:plan.load});
  // A plan needs its sessions even before there is a fitness history.
  if(plan.plan&&targets.status!=='ok')targets=estimatedTargets(roles,start,today,days);
  return capWeekTargets(capRunVolume(plan.apply(targets),runCap,runCommitted),prefs,[],weather);
}
// What the active plan asks the athlete about now (training-plans.js): an
// answer pending (back from a break, last week's key sessions missed) or a key
// session of this week missed on a past day. In words, for Today's card.
async function planProposal(env,ctx){
  const today=localToday(),monday=mondayOfDate(today);
  const pf=await planForWeek(env,ctx,monday).catch(()=>null);
  const plan=pf?.plan??await syncedPlans(env,today).then(p=>p.active).catch(()=>null);
  if(!plan||plan.pauseFrom)return null;
  let proposal=plan.proposal||null;
  if(!proposal&&pf?.plan){
    const targets=await computeWeekTargets(env,ctx,monday).catch(()=>null);
    proposal=missedSession(targets,plan,monday,today,await planSportDates(env,plan.sport,monday,today).catch(()=>[]));
  }
  return proposal?{...proposalView(proposal,plan,today),raw:proposal}:null;
}

// Everything the coaches look at for one day: the day, fitness, three weeks
// around it, gym history, sleep and Google Health.
// Cached for a few minutes per user and day; any change the user makes resets it.
// What the coach's screen texts get beside the screen's own data
// (screen-texts.js): the long-term facts (trend-facts.js) for Today and
// Training, and for Training the recovery model's readiness of today, as the
// day review gets it (A2). Readiness is computed here and only here, so a
// shared readiness function can replace dayReadiness in one line.
async function coachTextExtras(env,ctx,internalAuth,screen){
  if(screen!=='today'&&screen!=='training')return {};
  const date=localToday(),from=shiftDate(date,-14);
  const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
  const [fitness,health,sleep,profile,checkin]=await Promise.all([
    cached(env,ctx,'fitness:90',()=>internal('/app/api/fitness?days=90').then(r=>r.json()).catch(()=>({}))).catch(()=>({})),
    googleHealthFor(env,ctx,date).catch(()=>({})),
    app.fetch(new Request('https://internal/health/sleep?start='+from+'&end='+shiftDate(date,1),{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({})).then(d=>withIntervalsSleep(env,d,from,shiftDate(date,1))).catch(()=>({})),
    dashboardProfile(env).catch(()=>null),
    screen==='training'?getCheckin(env.DB,date).catch(()=>null):null
  ]);
  const sessions=sleep?.sessions||[];
  const coachTrends=trendFacts({date,wellness:health?.wellness,intervals:fitness?.wellness,sessions,age:profile?.age??null});
  const readiness=screen==='training'?dayReadiness({date,fitness,health:{...health,sleep:sessions},profile,checkin}):null;
  return {...(coachTrends?{coachTrends}:{}),...(readiness?{readiness}:{})};
}
function loadCoachInputs(env,ctx,internalAuth,date){return cached(env,ctx,'coach-inputs:'+date,()=>loadCoachInputsFresh(env,ctx,internalAuth,date));}
async function loadCoachInputsFresh(env,ctx,internalAuth,date){
  const monday=iso=>shiftDate(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));
  const start=monday(date),weeks=[shiftDate(start,-7),start,shiftDate(start,7)];
  const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
  const json=r=>r.json().catch(()=>({}));
  const [dailyResponse,fitnessResponse,gymResponse,sleepResponse,health]=await Promise.all([
    app.fetch(new Request('https://internal/analysis/daily?date='+date,{headers:internalAuth}),env,ctx),
    cached(env,ctx,'fitness:90',()=>internal('/app/api/fitness?days=90').then(json)).then(d=>Response.json(d)),internal('/app/api/gym?date='+date),
    // The same 30 nights as Today: one readiness (readiness.js) needs the same inputs.
    app.fetch(new Request('https://internal/health/sleep?start='+shiftDate(date,-30)+'&end='+shiftDate(date,1),{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})).then(d=>withIntervalsSleep(env,d,shiftDate(date,-30),shiftDate(date,1))).then(d=>Response.json(d)),
    googleHealthFor(env,ctx,date).catch(()=>({}))
  ]);
  // The three weeks are the heavy part (every day's analysis, food and
  // recommendations). One week at a time, cached and shared by every day of
  // that week, so the database is never asked for all of them at once.
  const weekData=[];
  for(const w of weeks)weekData.push(await cached(env,ctx,'week:'+w,()=>internal('/app/api/week?start='+w).then(json)));
  const [daily,fitness,gym,sleep,profile]=await Promise.all([json(dailyResponse),json(fitnessResponse),json(gymResponse),json(sleepResponse),dashboardProfile(env)]);
  applyEnergyBudget(daily,profile,health);
  return {date,daily,fitness,gym,health:{...health,sleep:sleep.sessions||[]},week:{status:'ok',days:weekData.flatMap(w=>w.days||[])},focus:athleteFocus(profile,date),profile:profile?{sex:profile.sex,age:profile.age,height:profile.height,sleepGoal:profile.sleepGoal,training:await trainingSetup(env.DB)}:null,athleteState:await getAthleteState(env.DB),checkin:await getCheckin(env.DB,date).catch(()=>null),upcomingTest:await getChecks(env.DB).then(c=>upcomingTest(c,date)).catch(()=>null)};
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
      const state=await updateAthleteState(env.DB,{status:body.status,note:body.note,statusUntil:body.statusUntil,forget:body.forget,dismiss:body.dismiss});
      if(body.status!=null)await syncedPlans(env).catch(()=>null);
      return Response.json({status:'ok',state},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  // The morning check-in on Today (morning-checkin.js): one answer a day.
  if(url.pathname==='/app/api/morning-checkin'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      if(request.method==='GET'){const d=url.searchParams.get('date'),date=validTrainingDay(d)?d:localToday();return Response.json({status:'ok',date,feeling:await getCheckin(env.DB,date)},{headers:{'Cache-Control':'no-store'}});}
      if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json().catch(()=>({})),date=validTrainingDay(body.date)&&body.date<=localToday()?body.date:localToday();
      return Response.json({status:'ok',date,feeling:await saveCheckin(env.DB,date,body.feeling??null)},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  if(url.pathname==='/app/api/coach/check-in'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const date=localToday(),state=await getAthleteState(env.DB),inputs=await loadCoachInputs(env,ctx,internalAuth,date);
      return Response.json({status:'ok',state,advice:proactiveAdvice({...inputs,state})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/coach/week'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json(),start=validTrainingDay(body.start)?mondayOfDate(body.start):mondayOfDate(localToday());
      const today=localToday();
      const [prefs,state,inputs]=await Promise.all([getWeekPlan(env.DB,start),getAthleteState(env.DB),loadCoachInputs(env,ctx,internalAuth,today)]);
      if(!inputs.week.days.some(d=>d.date===start)){const extra=await handleDashboardApi(new Request('https://internal/app/api/week?start='+start),env,ctx,new URL('https://internal/app/api/week?start='+start));const data=await extra.json();inputs.week.days.push(...(data.days||[]));}
      const [weather,history]=await Promise.all([weekWeather(prefs.location,start),planningHistory(env,start<localToday()?start:localToday(),28)]),proposal=weekProposal({prefs,state,start,today:localToday(),week:inputs.week,fitness:inputs.fitness,focus:inputs.focus,weather,history,plan:await planForWeek(env,ctx,start)});
      // "Vygenerovat tréninky": the week's sessions to prepare. Reviewing the plan is the AI chat's job.
      return Response.json({status:'ok',start,proposal},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  {const r=await handleAccountApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
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
      if(completed&&date>localToday()||!completed&&date<localToday())throw new Error(L('Zkontroluj datum a zda je trénink dokončený.', 'Check the date and whether the workout is completed.'));
      if(!completed)assertTrainingAllowed(await getAthleteState(env.DB));
      const type=body.sport==='gym'?'WeightTraining':body.sport==='run'?'Run':'Ride';
      const requestId=/^[A-Za-z0-9_-]{10,80}$/.test(String(body.requestId||''))?String(body.requestId):crypto.randomUUID();
      const event={external_id:'manual:'+requestId,category:'WORKOUT',name,type,start_date_local:date+'T12:00:00',moving_time:minutes*60,description:String(body.notes||'').slice(0,1000)};
      const saved=await storeLocalEvent(env.DB,event);if(completed)await completeLocalWorkout(env.DB,saved.id,{minutes,rpe:body.rpe,notes:body.notes});
      if(!completed)return Response.json({status:'ok',eventId:'planned:'+saved.id,sync:await syncLocalWorkout(env,saved.id)});
      // Done: to every destination the user sends activities to (Synchronizace).
      const sent=await sendActivity(env,{key:'manual:'+saved.id,sport:body.sport,name,date,minutes,notes:body.notes,rpe:body.rpe},{googleToken}).catch(error=>{console.error('Activity send failed',error.message);return {key:'manual:'+saved.id,sends:[]};});
      return Response.json({status:'ok',eventId:'planned:'+saved.id,sync:{status:'not_exported'},activityKey:sent.key,sends:sent.sends});
    }catch(error){return Response.json({message:error.message},{status:400});}
  }
  {const r=await handleSyncApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  if (url.pathname.startsWith("/app/api/admin/")) return handleAdminApi(request, env, url, session, ctx);
  // Connections are optional: without them the dashboard works from manual
  // entries (weight, food) and the profile; missingProviders drives the
  // connection prompt in the client.
  {const r=await handleGymToolsApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  if(url.pathname==='/app/api/sync/recent'&&request.method==='POST')return legacyHealthApi.fetch(new Request('https://internal/sync/google/recent',{method:'POST',headers:internalAuth}),env,ctx);
  if(url.pathname==='/app/api/profile'){await env.DB.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY (user_id,id))").run();if(request.method==='POST'){const profile=normalizeProfile(await request.json().catch(()=>({})));await env.DB.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(env.USER_ID,JSON.stringify(profile)).run();return Response.json({status:'ok',profile});}const r=await env.DB.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1').bind(env.USER_ID).first();const suggestions=await refreshSuggestions(env,{googleToken}).catch(error=>{console.error('Profile suggestions failed',error.message);return null;});return Response.json({profile:r?JSON.parse(r.profile_json):null,suggestions});}
  {const r=await handleTrainingEditsApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  // "Revize dne": the coach checks one planned day in the context of the week.
  if(url.pathname==='/app/api/coach/review'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:L('AI není připojena (chybí OPENAI_API_KEY).', 'AI is not connected (OPENAI_API_KEY is missing).')},{status:503});
    try{
      const body=await request.json().catch(()=>({})),date=/^\d{4}-\d{2}-\d{2}$/.test(String(body.date||''))?body.date:localToday();
      const [inputs,gym,prefs,feedback,notes]=await Promise.all([loadCoachInputs(env,ctx,internalAuth,date),readGymPlan(env.DB,date).catch(()=>null),getWeekPlan(env.DB,date).catch(()=>null),recentWorkoutFeedback(env.DB,shiftDate(date,-21)).catch(()=>[]),listReflections(env.DB,{limit:3}).catch(()=>[])]);
      const gymRows=gym?.stored?parseStrengthPlan(gym.values).rows||[]:[];
      // The recovery model's readiness of the reviewed day, or today's for a day ahead (the inputs are already loaded and cached).
      const readinessDate=date<localToday()?date:localToday();
      const readiness=dayReadiness({date:readinessDate,fitness:inputs.fitness,health:inputs.health,profile:inputs.profile,checkin:readinessDate===date?inputs.checkin:await getCheckin(env.DB,readinessDate).catch(()=>null)});
      const input=buildReviewInput({date,today:localToday(),week:inputs.week,fitness:inputs.fitness,health:inputs.health,gymRows,roles:prefs?planWeekRoles(prefs.days):[],feedback,coachNotes:notes.map(r=>({date:r.date,text:r.text})),readiness});
      const state=await getAthleteState(env.DB);Object.assign(input,{athleteState:state.status,statusNote:state.note,preferenceMemory:state.memories,availability:availabilityOn(prefs,date)});
      const reviews=[await reviewDay(env,input,null,inputs.focus).catch(error=>({model:lightModel(env),error:error.message}))];
      return Response.json({status:'ok',date,reviews},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/night'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const date=/^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date')||''))?url.searchParams.get('date'):localToday();
    try{return Response.json(await nightDetail(env.DB,{date}),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.message},{status:500});}
  }
  // Recovery sessions (stretching, sauna) the athlete adds to a day from the
  // coach's note or from Today's "Regenerace na dnes" (done: true saves it as done).
  if(url.pathname==='/app/api/recovery'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!Number.isNaN(Date.parse(v+'T12:00:00Z'));
    try{
      if(request.method==='GET'){const from=day(url.searchParams.get('from'))?url.searchParams.get('from'):shiftDate(localToday(),-7),to=day(url.searchParams.get('to'))?url.searchParams.get('to'):shiftDate(localToday(),14);
        return Response.json({status:'ok',sessions:await listRecovery(env.DB,{from,to})},{headers:{'Cache-Control':'no-store'}});}
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json().catch(()=>({}));
      if(request.method==='POST'){
        if(!day(body.date)||body.date<shiftDate(localToday(),-1)||body.date>shiftDate(localToday(),14))return Response.json({message:L('Vyber den od včerejška do dvou týdnů dopředu.', 'Choose a day from yesterday up to two weeks ahead.')},{status:400});
        const sport=['ride','run','gym'].includes(body.sport)?body.sport:null,kind=body.kind==='sauna'?'sauna':'stretch';
        return Response.json({status:'ok',session:await addRecovery(env.DB,{date:body.date,sport,kind,done:body.done===true,focus:String(body.focus||'').slice(0,200),note:String(body.note||'').slice(0,1000)})},{headers:{'Cache-Control':'no-store'}});
      }
      const id=Number(body.id);if(!Number.isInteger(id)||id<1)return Response.json({message:L('Chybí záznam.', 'The entry is missing.')},{status:400});
      if(request.method==='PATCH'){await updateRecovery(env.DB,id,{done:Boolean(body.done)});return Response.json({status:'ok'});}
      if(request.method==='DELETE'){await updateRecovery(env.DB,id,{remove:true});return Response.json({status:'ok'});}
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // The coach's notes: listed per day; a POST asks for a note on a day now.
  if(url.pathname==='/app/api/coach/reflections'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const validDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&String(v)<=localToday();
    try{
      if(request.method==='GET'){const date=url.searchParams.get('date');
        // A day ahead has no notes yet; only a missing date lists the latest ones.
        if(date&&!validDay(date))return Response.json({status:'ok',reflections:[]},{headers:{'Cache-Control':'no-store'}});
        return Response.json({status:'ok',reflections:await listReflections(env.DB,{date:date||null,limit:10})},{headers:{'Cache-Control':'no-store'}});}
      if(request.method==='POST'){
        if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
        const body=await request.json().catch(()=>({})),date=validDay(body.date)?body.date:localToday();
        const notes=typeof body.notes==='string'&&body.notes.trim()?body.notes.trim().slice(0,1000):null,rpe=Number.isFinite(Number(body.rpe))&&Number(body.rpe)>=1&&Number(body.rpe)<=10?Number(body.rpe):null;
        // Without AI access (consent, subscription) the note is the rule-based one, never sent to OpenAI.
        const aiAllowed=(await subscriptionStatus(env).catch(()=>({aiAccess:false}))).aiAccess;
        const ruleEnv={...env};if(!aiAllowed)delete ruleEnv.OPENAI_API_KEY;
        const reflection=await createReflection(ruleEnv,{date,rpe,notes},day=>reflectionData(env,ctx,internalAuth,day));
        return Response.json({status:'ok',reflection},{headers:{'Cache-Control':'no-store'}});
      }
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // Does the recovery index track how training goes for this athlete?
  // (src/recovery-validation.js, docs/methodology.md)
  if(url.pathname==='/app/api/recovery-validation'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.','Sign in to the app.')},{status:401});
    try{
      const today=localToday(),days=Math.max(30,Math.min(120,Number(url.searchParams.get('days')||120))),from=shiftDate(today,-days);
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
    try{return Response.json(await loadFitnessInsights(env.DB,localToday()),{headers:{'Cache-Control':'no-store'}});}
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
      const monday=start?mondayOfDate(start):mondayOfDate(localToday());
      const targets=await computeWeekTargets(env,ctx,monday,prefs).catch(error=>({status:'error',message:error.message,items:[]}));
      const historyEstimate=activityHistoryEstimate(await planningHistory(env,localToday(),21),localToday());
      return Response.json({status:'ok',prefs,roles:planWeekRoles(prefs.days,(await planForWeek(env,ctx,monday)).roles),start:monday,targets,historyEstimate},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // Training plans (training-plans.js): the plans to choose from and the
  // active one; POST {action:'start',templateId,raceDate?,raceKm?} or {action:'stop'}.
  if(url.pathname==='/app/api/plans'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const today=localToday();let started=null;
      if(request.method==='POST'){
        if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
        const body=await request.json().catch(()=>({}));
        if(body.action==='stop')await stopPlan(env.DB,{gym:body.sport==='gym'});
        // The answer to the plan's proposal (planProposal), and undoing it.
        else if(body.action==='proposal'||body.action==='undo'){
          const plan=(await syncedPlans(env,today)).active;
          if(!plan)throw new Error(L('Nemáš aktivní plán.', 'You have no active plan.'));
          if(body.action==='undo')await savePlanState(env.DB,planUndo(plan));
          else{
            const proposal=plan.proposal||(await planProposal(env,ctx))?.raw;
            if(!proposal)throw new Error(L('Plán se mezitím změnil.', 'The plan changed in the meantime.'));
            const choice=String(body.choice||'keep');
            await savePlanState(env.DB,planChoice(plan,proposal,choice==='pick'?'move':choice,{today,date:body.date?String(body.date):null}));
          }
        }
        else if(body.action==='start'){
          const template=getTemplate(String(body.templateId||''));
          if(!template)throw new Error(L('Neznámý plán.', 'Unknown plan.'));
          const when=planStart(template,{today,raceDate:body.raceDate?String(body.raceDate):null});
          // Too few days of the plan's sport in the usual week: the freest days are added.
          const prefs=await getWeekPlan(env.DB),need=planDays(template,prefs);
          if(need.added.length)await saveWeekPlan(env.DB,{...prefs,days:need.days});
          await startPlan(env.DB,{templateId:template.id,startDate:when.startDate,raceDate:when.raceDate,raceKm:body.raceKm});
          started={firstWeek:when.firstWeek,addedDays:need.added};
        }
        else throw new Error(L('Neznámá akce.', 'Unknown action.'));
      }
      else if(request.method!=='GET')return Response.json({message:'Method not allowed'},{status:405});
      const {active,gym}=await syncedPlans(env,today);
      return Response.json({status:'ok',templates:planTemplates().map(templateSummary),active:active?planSummary(active,today):null,activeGym:gym?planSummary(gym,today):null,...(started?{started}:{})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // One week of the active ride or run plan: its sessions with their steps
  // (the plan detail's week, GET ?week=N).
  if(url.pathname==='/app/api/plans/week'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const plan=(await syncedPlans(env)).active,n=Number(url.searchParams.get('week'));
      if(!plan)throw new Error(L('Nemáš aktivní plán.', 'You have no active plan.'));
      const monday=shiftDate(plan.startDate,(Math.max(1,Math.round(n)||1)-1)*7),pw=planWeek(plan,monday);
      if(!pw)throw new Error(L('Tento týden v plánu není.', 'This week is not in the plan.'));
      const targets=await computeWeekTargets(env,ctx,monday).catch(()=>({items:[]}));
      const thresholds=await cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>({}));
      const sessions=[];
      for(const x of (targets.items||[]).filter(x=>x.sport===plan.sport&&(x.slot||0)===0&&x.plan?.workoutId)){
        const library=await getWorkout(env.DB,x.plan.workoutId).catch(()=>null);
        let workout=null;
        if(library){
          const w=renderForEnvironment(library,'outdoor');let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}
          w.steps=plan.sport==='run'?stepRows(structure,{environment:w.environment,sport:'run',thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones});
          workout={id:w.id,name:w.name,sport:w.sport,environment:w.environment,duration_minutes:w.duration_minutes,target_load:w.target_load,intensity_factor:w.intensity_factor,description:w.description,steps:w.steps};
        }
        sessions.push({date:x.date,label:x.label,kind:x.plan.kind,minutes:x.minutes,workoutId:x.plan.workoutId,workout});
      }
      return Response.json({status:'ok',week:pw.week,weeksCount:pw.weeks,monday,phaseLabel:pw.spec.gym?.name??phaseLabel(pw.spec.phase),sessions},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  {const r=await handleThresholdApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
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
      try{const draft=await buildFoodDraft(env,message,localToday());if(draft.items.length){const answer=foodDraftSummary(draft);return Response.json({status:'ok',kind:'food_draft',draft,answer,chatId:await remember(answer)},{headers:{'Cache-Control':'no-store'}});}}
      catch(error){console.error('Food sentence failed',error.message);}
    }
    // The chat so far decides the depth too: a follow-up keeps the topic's context.
    const date=localToday(),appContext=assistantAppContext(body.appContext,date),conversation=await chatContext(env.DB,body.chatId).catch(()=>[]);
    const task=assistantTask(message,body.appContext?appContext:null,conversation),started=Date.now();
    const availabilityMinutes=Number.isFinite(Number(body.availabilityMinutes))?Number(body.availabilityMinutes):null;
    const manualReadiness=Number.isFinite(Number(body.manualReadiness))?Number(body.manualReadiness):null;
    const goal=body.goal&&typeof body.goal==='object'?body.goal:null;
    const preferences=body.preferences&&typeof body.preferences==='object'?body.preferences:{};
    const reply=async (onAnswer,onProgress=()=>{})=>{
      let inputs={},coachCtx={date,now:localNow()},selected=null,focus=null;
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
        coachCtx=coachContext({...inputs,availabilityMinutes,manualReadiness,goal,preferences,capabilities,athleteFeedback,coachNotes,athleteState,thresholds,profile:inputs.profile,focus,sport:engineSport(focus,selected.appContext),now:localNow(),availabilityByDate:safety.availabilityByDate});
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
      await env.DB.prepare("UPDATE coach_inbox SET status='expired' WHERE user_id=? AND status='draft' AND created_at<? AND draft_json LIKE '%\"coach_action\"%'").bind(env.USER_ID,dayStartSql(date)).run().catch(error=>console.error('Draft expiry failed',error.message));
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
        if(a.type==='status'){result=await updateAthleteState(env.DB,{status:a.status,note:a.reason,statusUntil:a.statusUntil&&a.statusUntil>localToday()?a.statusUntil:null});await syncedPlans(env).catch(()=>null);}
        else if(a.type==='gym_swap'){
          if(!validTrainingDay(a.date)||a.date<localToday())throw new Error(L('Návrh je určený pro minulý den. Požádej o nový návrh.', 'The proposal is for a past day. Ask for a new proposal.'));
          assertTrainingAllowed(await getAthleteState(env.DB));
          const latest=await readGymPlan(env.DB,a.date),values=applyGymSwap(latest.values,a);
          const saved=await env.DB.prepare('UPDATE gym_plans SET values_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND workout_date=? AND values_json=?').bind(JSON.stringify(values),env.USER_ID,a.date,JSON.stringify(latest.values)).run();
          if(saved.meta?.changes!==1)throw new Error(L('Plán se mezitím změnil. Požádej o nový návrh.', 'The plan has changed in the meantime. Ask for a new proposal.'));
          result={status:'ok',date:a.date,values};
        }
        else if(a.type==='week_sport'){
          assertTrainingAllowed(await getAthleteState(env.DB));
          if(!validTrainingDay(a.date)||a.date<localToday())throw new Error(L('Do minulého dne už nelze přidat sport.', 'You can\'t add a sport to a past day.'));
          result={date:a.date,prefs:await addWeekSport(env.DB,a.date,a.sport)};
        }
        else if(a.type==='workout'){
          // The workout the chat showed is the one that gets planned.
          result=a.preview||await workoutPreview(env,ctx,a);
        }else{
          const id=a.eventId.replace(/^planned:/,''),event=await env.DB.prepare("SELECT start_time,payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND external_id=?").bind(env.USER_ID,'planned:'+id).first();
          const payload=event?JSON.parse(event.payload_json||'{}'):null;
          if(!event||String(event.start_time).slice(0,10)!==a.eventSnapshot.date||payload.name!==a.eventSnapshot.name||a.eventSnapshot.date<localToday())throw new Error(L('Plán se mezitím změnil. Požádej o nový návrh.', 'The plan has changed in the meantime. Ask for a new proposal.'));
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
  {const r=await handleFoodApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}

  // "Nahlásit problém": the user's report with a screenshot and diagnostics (support-report.js).
  if (url.pathname === "/app/api/support/report") return handleSupportReport(request, env, { signedIn: session.signedIn, origin: url.origin });
  // The phone's push token for the morning readiness (push.js): POST saves, DELETE removes.
  if (url.pathname === "/app/api/push/token") return handlePushToken(request, env, { signedIn: session.signedIn, origin: url.origin });
  if (url.pathname === "/app/api/connections" && request.method === "GET") {
    return Response.json(await connectionStatus(env), {headers:{"Cache-Control":"no-store"}});
  }
  if (url.pathname === '/app/api/connections' && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!session.signedIn) return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if (request.headers.get('Origin') !== url.origin) return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    if (request.method === 'DELETE') {
      if(body.provider==='apple'){await disconnectAppleHealth(env.DB,env.USER_ID);return Response.json({status:'ok',message:L('Připojení je odebrané.', 'The connection has been removed.')},{headers:{'Cache-Control':'no-store'}});}
      if(body.provider==='strava'){await disconnectStrava(env);return Response.json({status:'ok',message:L('Připojení je odebrané.', 'The connection has been removed.')},{headers:{'Cache-Control':'no-store'}});}
      if(!['google','intervals'].includes(body.provider)) return Response.json({message:L('Neznámé připojení.', 'Unknown connection.')},{status:400});
      // Loadwise also gives up its access at Google. The owner's token can be the shared Worker secret, which stays.
      if(body.provider==='google'&&!env.USER_IS_OWNER) await revokeGoogle(env);
      await deleteConnectionSecret(env,body.provider);
      if(body.provider==='google') await deleteConnectionSecret(env,'google_scopes');
      await clearConnectionHealth(env,body.provider);
      return Response.json({status:'ok',message:L('Připojení je odebrané.', 'The connection has been removed.')},{headers:{'Cache-Control':'no-store'}});
    }
    if(body.provider!=='intervals'||typeof body.key!=='string'||body.key.trim().length<8||body.key.length>512) return Response.json({message:L('Zadej platný API klíč Intervals.icu.', 'Enter a valid Intervals.icu API key.')},{status:400});
    const apiKey=body.key.trim();
    const check=await fetch('https://intervals.icu/api/v1/athlete/0',{headers:{Authorization:intervalsAuthorization(apiKey),Accept:'application/json'}});
    if(!check.ok) return Response.json({message:L('Intervals klíč nepřijal. Zkontroluj klíč v nastavení Intervals.', 'Intervals didn\'t accept the key. Check the key in your Intervals settings.')},{status:400});
    const athlete=await check.json().catch(()=>({}));
    await saveConnectionSecret(env,'intervals',apiKey);
    await clearConnectionHealth(env,'intervals');
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

  // The coach's sentence on the app's Today, Training and Food screens
  // (screen-texts.js): written by the AI from the screen's own data once a
  // day, else the screen's rule-based text.
  if(url.pathname==='/app/api/coach-text'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const screen=String(url.searchParams.get('screen')||'');
    if(!SCREENS.includes(screen))return Response.json({message:L('Neznámá obrazovka.', 'Unknown screen.')},{status:400});
    const path={today:'/app/api/today',training:'/app/api/training',food:'/app/api/food-today'}[screen];
    const kept=session.user?.id!=null?recentScreen(session.user.id,path):null;
    const screenData=()=>kept?Promise.resolve(kept):handleDashboardApi(new Request(url.origin+path,{headers:request.headers}),env,ctx,new URL(url.origin+path),session).then(r=>r.ok?r.json():null).catch(()=>null);
    // The screen's data plus what only the coach reads (long-term facts, Training's readiness).
    const load=()=>Promise.all([screenData(),coachTextExtras(env,ctx,internalAuth,screen).catch(()=>({}))]).then(([data,extra])=>data?{...data,...extra}:data);
    try{return Response.json(await screenText(env,{screen,load}),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.message},{status:500});}
  }

  // Everything the native app's Today screen shows, in one response (app-today.js).
  if(url.pathname==='/app/api/today'&&request.method==='GET'){
    try{
      const requested=url.searchParams.get('date'),date=validTrainingDay(requested)&&requested<=localToday()?requested:localToday();
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const api=path=>handleDashboardApi(new Request(url.origin+path,{headers:request.headers}),env,ctx,new URL(url.origin+path),session).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const from=shiftDate(date,-30),to=shiftDate(date,1),isToday=date===localToday();
      // Today only: yesterday's sessions and tomorrow's plan for "Regenerace na dnes" (recovery-today.js).
      const [daily,health,fitness,sleep,fluids,weight,coaches,profile,place,gym,yesterday,tomorrow,savedRecovery,checkin]=await Promise.all([
        read('/analysis/daily?date='+date),googleHealthFor(env,ctx,date).catch(()=>({})),
        cached(env,ctx,'fitness:90',()=>api('/app/api/fitness?days=90')).catch(()=>({})),
        read('/health/sleep?start='+from+'&end='+to).then(d=>withIntervalsSleep(env,d,from,to)).catch(()=>({})),
        api('/app/api/fluids?date='+date),read('/health/weight'),api('/app/api/coaches?date='+date),dashboardProfile(env).catch(()=>null),
        todayPlace(env,ctx,date),trainingGymPlans(env,isToday?shiftDate(date,-1):date,isToday?shiftDate(date,1):date).catch(()=>({})),
        isToday?read('/analysis/daily?date='+shiftDate(date,-1)):null,isToday?read('/analysis/daily?date='+shiftDate(date,1)):null,
        listRecovery(env.DB,{from:date,to:date}).catch(()=>[]),getCheckin(env.DB,date).catch(()=>null)
      ]);
      // The active training plan in one line (training-plans.js).
      const synced=await syncedPlans(env).catch(()=>({})),active=synced.active??synced.gym,summary=active?planSummary(active,date):null;
      const proposal=date===localToday()&&synced.active?await planProposal(env,ctx).catch(()=>null):null;
      const trainingPlan=summary?.started?{name:summary.name,week:summary.week,weeksCount:summary.weeksCount,phaseLabel:summary.phaseLabel,raceDate:summary.raceDate,paused:summary.paused,canUndo:Boolean(active.undo),proposal:proposal?{type:proposal.type,title:proposal.title,text:proposal.text,options:proposal.options,days:proposal.days||null,button:proposal.button}:null}:null;
      // Connected services that need the user (access refused, Google permissions missing), shown at the top of Today.
      const problems=connectionProblems(await connectionStatus(env).catch(()=>null));
      applyEnergyBudget(daily,profile,health);
      return Response.json(buildToday({date,hour:date===localToday()?localHour():null,daily,health,fitness,sleep,fluids,weight,coaches,profile:profile||{},connectionProblems:problems,location:place.location,forecast:place.forecast,gym:gym[date]||null,checkin,trainingPlan,
        recovery:{yesterday:yesterday?.training||{},tomorrow:tomorrow?tomorrow.training||{}:null,gym,saved:savedRecovery}}),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }

  // The native app's Food screen (app-food.js): the day's food log against the
  // same target as Today (energy budget), with water.
  if(url.pathname==='/app/api/food-today'&&request.method==='GET'){
    try{
      // Up to two weeks ahead: meals planned or copied into the coming days.
      const requested=url.searchParams.get('date'),date=validTrainingDay(requested)&&requested<=shiftDate(localToday(),14)?requested:localToday();
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const api=path=>handleDashboardApi(new Request(url.origin+path,{headers:request.headers}),env,ctx,new URL(url.origin+path),session).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const [daily,food,fluids,health,profile]=await Promise.all([
        read('/analysis/daily?date='+date),read('/food/log?date='+date),api('/app/api/fluids?date='+date),
        googleHealthFor(env,ctx,date).catch(()=>({})),dashboardProfile(env).catch(()=>null)
      ]);
      applyEnergyBudget(daily,profile,health);
      return Response.json(buildFood({date,hour:date===localToday()?localHour():null,daily,food,fluids,slots:profile?.meals}),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }

  // The native app's Health screen (app-health.js).
  if(url.pathname==='/app/api/health'&&request.method==='GET'){
    try{
      const requested=url.searchParams.get('date'),date=validTrainingDay(requested)&&requested<=localToday()?requested:localToday();
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const api=path=>handleDashboardApi(new Request(url.origin+path,{headers:request.headers}),env,ctx,new URL(url.origin+path),session).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const from=shiftDate(date,-30),to=shiftDate(date,1);
      const [health,fitness,sleep,weight,profile,checkin,muscle]=await Promise.all([
        googleHealthFor(env,ctx,date).catch(()=>({})),
        cached(env,ctx,'fitness:90',()=>api('/app/api/fitness?days=90')).catch(()=>({})),
        read('/health/sleep?start='+from+'&end='+to).then(d=>withIntervalsSleep(env,d,from,to)).catch(()=>({})),
        read('/health/weight'),dashboardProfile(env).catch(()=>null),getCheckin(env.DB,date).catch(()=>null),
        // Muscle mass from a scale through Apple Health (lean body mass).
        env.DB.prepare("SELECT sample_time,value_numeric FROM health_datapoints WHERE user_id=? AND data_type='lean-body-mass' AND record_role='primary' AND sample_time>=? ORDER BY sample_time LIMIT 400").bind(env.USER_ID,shiftDate(date,-60)).all().then(r=>r.results||[]).catch(()=>[])
      ]);
      return Response.json(buildHealth({date,hour:date===localToday()?localHour():null,health,fitness,sleep,weight,profile:profile||{},checkin,muscle}),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }

  // The native app's Training screen (app-training.js): the week Monday to
  // Sunday and the coming week for the next session, cached for two minutes.
  if(url.pathname==='/app/api/training'&&request.method==='GET'){
    try{
      const date=localToday(),start=weekStart(date),end=shiftDate(date,7)>shiftDate(start,6)?shiftDate(date,7):shiftDate(start,6);
      const dates=[];for(let d=start;d<=end;d=shiftDate(d,1))dates.push(d);
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const api=path=>handleDashboardApi(new Request(url.origin+path,{headers:request.headers}),env,ctx,new URL(url.origin+path),session).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const [days,gym,health,fitness,insights,coaches,profiles]=await Promise.all([
        cached(env,ctx,'training-days:'+start+':'+date,()=>mapLimit(dates,3,async d=>({date:d,daily:await read('/analysis/daily?date='+d)})),{ttl:120}),
        trainingGymPlans(env,start,end).catch(()=>({})),
        googleHealthFor(env,ctx,date).catch(()=>({})),
        cached(env,ctx,'fitness:180',()=>api('/app/api/fitness?days=180')).catch(()=>({})),
        loadFitnessInsights(env.DB,date).catch(()=>({})),
        api('/app/api/coaches?date='+date),loadProfiles(env.DB,env.USER_ID).catch(()=>({saved:null,effective:null}))
      ]);
      // The saved profile says whether the athlete has set a focus yet ("Nastav si zaměření a cíle").
      return Response.json(buildTraining({date,days,gym,health,fitness,insights,coaches,profile:profiles.effective||{},savedProfile:profiles.saved}),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }

  // Training → the day strip and the month: done and planned per day (app-calendar.js).
  if(url.pathname==='/app/api/training/calendar'&&request.method==='GET'){
    try{
      const today=localToday(),valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
      const start=valid(url.searchParams.get('start'))?url.searchParams.get('start'):shiftDate(today,-35);
      let end=valid(url.searchParams.get('end'))?url.searchParams.get('end'):shiftDate(today,14);
      if(end<start||end>shiftDate(start,92))end=shiftDate(start,92);
      const result=await cached(env,ctx,'training-calendar:'+start+':'+end+':'+today,async()=>{
        const rows=(await env.DB.prepare("SELECT data_type,source_family,external_id,start_time,end_time,value_numeric,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family IN ('intervals','local') AND data_type IN ('planned-workout','activity')) OR (source_family IN ('google-wearables','apple-health') AND data_type='exercise')) AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(env.USER_ID,shiftDate(start,-1),shiftDate(end,2)).all().catch(()=>({results:[]}))).results||[];
        // Past gym plans too: one nothing was done for shows as missed.
        const planned=rows.filter(r=>r.data_type==='planned-workout');
        const [gym,manual]=await Promise.all([trainingGymPlans(env,start,end).catch(()=>({})),manualPairs(env.DB,env.USER_ID,planned.map(r=>r.external_id))]);
        return buildCalendar({start,end,today,gym,manual,planned,
          activities:rows.filter(r=>r.data_type==='activity'),
          google:rows.filter(r=>r.data_type==='exercise')});
      },{ttl:120});
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }

  if(url.pathname==='/app/api/coaches'&&request.method==='GET'){
    try{
      // Up to two weeks ahead: the advisers then talk about the planned day.
      const requestedDate=url.searchParams.get('date'),date=validTrainingDay(requestedDate)&&requestedDate<=shiftDate(localToday(),14)?requestedDate:localToday(),ahead=date>localToday(),oldest=shiftDate(date,-14);
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const fitnessJob=env.INTERVALS_API_KEY?fetch('https://intervals.icu/api/v1/athlete/0/wellness?oldest='+oldest+'&newest='+date,{headers:{Authorization:intervalsAuthorization(env.INTERVALS_API_KEY),Accept:'application/json'}}).then(r=>r.ok?r.json():[]).catch(()=>[]):[];
      // A completed ride's intervals (one small Intervals.icu request, cached)
      // let its review compare every step with the plan.
      const dailyJob=read('/analysis/daily?date='+date);
      const rideJob=dailyJob.then(d=>rideDetailsFor(env,ctx,d.training)).catch(()=>({}));
      const [daily,yesterday,sleepData,rows,profile,athleteState,gym,thresholds,rideDetails]=await Promise.all([
        dailyJob,read('/analysis/daily?date='+shiftDate(date,-1)),
        read('/health/sleep?start='+oldest+'&end='+shiftDate(date,1)).then(d=>withIntervalsSleep(env,d,oldest,shiftDate(date,1))),fitnessJob,dashboardProfile(env),
        date>=localToday()?getAthleteState(env.DB):{status:'active',note:'',statusUntil:null},readGymPlan(env.DB,date).catch(()=>null),
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
      // Without Intervals.icu the load comes from the watch's workouts and the gym (training-load.js).
      if (!apiKey) return Response.json({status:"ok",source:"loadwise",connected:false,days,wellness:await ownFitness(env,isoDate(oldest),isoDate(newest))},{headers:{"Cache-Control":"no-store"}});
      const auth = intervalsAuthorization(apiKey);
      const target = "https://intervals.icu/api/v1/athlete/0/wellness?oldest="+encodeURIComponent(isoDate(oldest))+"&newest="+encodeURIComponent(isoDate(newest));
      const response = await fetch(target,{headers:{Authorization:auth,Accept:"application/json"}});
      const data = await response.json().catch(()=>[]);
      if (!response.ok) return Response.json({status:"error",message:"Intervals wellness HTTP "+response.status,data},{status:response.status});
      const intervalsRows = (Array.isArray(data)?data:[]).map(x=>({...x,tsb:Number.isFinite(Number(x.ctl))&&Number.isFinite(Number(x.atl))?Number(x.ctl)-Number(x.atl):null})).filter(x=>x.id).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      // Workouts only the watch recorded (not in Intervals.icu) count into CTL too.
      const watchExtra = await watchOnlyFitness(env,ctx,isoDate(oldest),isoDate(newest)).catch(error=>{console.error('Watch-only load',error.message);return null;});
      const wellness = watchExtra ? addLoads(intervalsRows,watchExtra) : intervalsRows;
      return Response.json({status:"ok",source:"intervals.icu",days,wellness},{headers:{"Cache-Control":"no-store"}});
    } catch (error) {
      return Response.json({status:"error",message:error.message},{status:502});
    }
  }


  // Apple Health from the iPhone app (apple-health.js): the phone reads
  // HealthKit and sends sums, nights and workouts; DELETE disconnects.
  if(url.pathname==='/app/api/health/apple'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      if(request.method==='GET')return Response.json({status:'ok',...await appleHealthStatus(env.DB,env.USER_ID)},{headers:{'Cache-Control':'no-store'}});
      if(request.method==='POST'){
        if(appleBodyTooLarge(request))return Response.json({message:L('Příliš velký požadavek.', 'The request is too large.')},{status:413});
        const body=await request.json().catch(()=>null);
        if(!body||typeof body!=='object')return Response.json({message:L('Neplatná data.', 'Invalid data.')},{status:400});
        const result=await saveAppleHealth(env.DB,env.USER_ID,body);
        if(result.code)return Response.json({message:result.message},{status:result.code});
        // Apple Watch workouts pair with Intervals.icu activities like Google's do.
        const from=Date.parse(body.windows?.exercise?.from||'');
        if(result.saved&&Number.isFinite(from))ctx.waitUntil(matchActivities(env,{days:Math.min(400,Math.ceil((Date.now()-from)/86400000)+1)}).catch(error=>console.error('Activity matching failed',error.message)));
        // New resting and maximum heart rate reach the profile's automatic values now, not the next day.
        if(result.saved)ctx.waitUntil(refreshSuggestions(env,{force:true}).catch(error=>console.error('Profile suggestions not refreshed',error.message)));
        // Last night arrived: the morning readiness push, once a day (push.js).
        if(result.saved&&hasLastNight(body.records))ctx.waitUntil(morningPush(env,ctx,{fresh:true}).catch(error=>console.error('Morning push failed',error.message)));
        return Response.json(result,{headers:{'Cache-Control':'no-store'}});
      }
      if(request.method==='DELETE')return Response.json(await disconnectAppleHealth(env.DB,env.USER_ID),{headers:{'Cache-Control':'no-store'}});
      return Response.json({message:'Method not allowed'},{status:405});
    }catch(error){console.error('Apple Health',error);return Response.json({message:error.message},{status:500});}
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

  {const r=await handleGymPlanApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  if (url.pathname === "/app/api/gym/generate" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    // Training time is set only in the week plan: the day's gym chip sets the
    // length (and upper/full body unless the request chose the focus), and the
    // day's available time caps it.
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date||"")) ? body.date : localToday();
    try {
      assertTrainingAllowed(await getAthleteState(env.DB));
      const prefs=await getWeekPlan(env.DB,day);
      if (body?.durationMinutes == null) {
        const chip = targetFor(await computeWeekTargets(env, ctx, mondayOfDate(day), prefs).catch(() => null), day, "gym");
        if (chip) { body.durationMinutes = chip.minutes; if (chip.role === "gym_upper" && !body?.focus && !body?.focusMuscles && !body?.forceProtectLegs) { body.focus = "upper"; body.focusSource = "week"; } }
      }
      const budget=trainingBudget(prefs,day,body.durationMinutes==null?null:Number(body.durationMinutes),{userInitiated:body.userInitiated===true});
      if(budget!=null&&budget<30)throw new Error(L('Na gym potřebuješ alespoň 30 minut dostupného času.', 'The gym needs at least 30 minutes of available time.'));
      if(budget!=null)body.durationMinutes=budget;
    }catch(error){return Response.json({message:error.message},{status:400})}
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
      : userWeekStart();
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
      const reads = Promise.all([
        app.fetch(new Request(dailyUrl, {method:"GET",headers:internalAuth}), env, ctx),
        app.fetch(new Request(foodUrl, {method:"GET",headers:internalAuth}), env, ctx)
      ].map(async response => { const r = await response; return { ok: r.ok, body: await r.json() }; }));
      // Meal recommendations (the costliest part) only for today and later:
      // nothing is eaten on a past day any more. They fit meals to the day's
      // calorie target and food log read here (before the energy budget below,
      // as /analysis/energy gives it), instead of computing the day again.
      const known = reads.then(([d, f]) => d.ok && f.ok ? { energy: { final: { calorieTarget: d.body.calories?.target ?? null, estimatedTDEE: d.body.calories?.estimatedTDEE ?? null }, energyProfile: { missing: d.body.nutrition?.missing || [] } }, food: f.body } : null);
      const [[{ body: daily }, { body: food }], recommendations] = await Promise.all([
        reads,
        date >= localToday() ? foodRecommend(env, recommendUrl, known).then(r => r.json()).catch(error => ({ status: "error", message: error.message })) : null
      ]);
      return {
        date,
        gymCancelled:cancelledGym.has(date),
        gymPlan:cancelledGym.has(date)?null:gymPlans.get(date)||null,
        daily: applyEnergyBudget(daily, profile, {today: health?.wellness?.find(w => w.id === date) || {}}),
        food,
        recommendations
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
    const start = url.searchParams.get("start") || shiftDate(localToday(), -30), end = url.searchParams.get("end") || shiftDate(localToday(), 1);
    return Response.json(await withIntervalsSleep(env, await response.json(), start, end), { headers: { "Cache-Control": "no-store" } });
  }

  const internal = new URL(target, request.url);
  for (const [key, value] of url.searchParams) internal.searchParams.set(key, value);
  const response = await app.fetch(new Request(internal, { method: "GET", headers: internalAuth }), env, ctx);
  if(url.pathname==='/app/api/daily'&&response.ok){const daily=await response.json();try{const date=url.searchParams.get('date')||localToday(),profile=await dashboardProfile(env);if(profile)applyEnergyBudget(daily,profile,await googleHealthFor(env,ctx,date));}catch(e){console.error('Energy budget unavailable',e.message);}return Response.json(daily,{headers:{'Cache-Control':'no-store'}});}
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
    if(url.pathname==='/app/api/workouts/search'&&request.method==='GET'){
      await cached(env,ctx,'reconcile:'+localToday(),async()=>{await reconcileWorkoutLibraryCompletions(env,ctx,internalAuth);return {done:true};});
      const date=validDate(url.searchParams.get('date'))?url.searchParams.get('date'):localToday();
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
      for(const w of result.workouts){let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}w.steps=sport==='run'?stepRows(structure,{environment:w.environment,sport,thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones});
        // How to ride or run it, fuelling and terrain, as the web's workout card explains it.
        try{const e=explainWorkout(w,{environment:w.environment||filters.environment,thresholds,sport});w.guide={title:e.title,how:e.how||[],fueling:e.fueling||[],environment:e.environment||[]};}catch{w.guide=null;}}
      return Response.json({...result,date,athlete:{ftp:thresholds.ftp,indoorFtp:rideFtpFor(thresholds,'indoor').ftp,indoorFtpEstimated:rideFtpFor(thresholds,'indoor').estimated,source:thresholds.source,runThresholdPace:thresholds.runThresholdPace,runPaceSource:thresholds.runPaceSource},rankingContext:{...context,tsb:coach.readiness.tsb,readinessScore:coach.readiness.score},sourcePolicy:sport==='run'?L('Vlastní PFD běžecké tréninky, publikované výzkumné protokoly (Helgerud, Billat, Seiler, Daniels) a veřejně popsané metody s uvedením zdroje. Placené plány a aplikace se nekopírují.', 'Own PFD running workouts, published research protocols (Helgerud, Billat, Seiler, Daniels) and publicly described methods with their source. Paid plans and apps are not copied.'):L('Vlastní PFD workouty, publikované výzkumné protokoly a veřejně popsané tréninky profi s uvedením zdroje. Proprietární knihovny (TrainerRoad, Xert, JOIN, Zwift, TrainerDay) se nekopírují.', 'Own PFD workouts, published research protocols and publicly described pro workouts with their source. Proprietary libraries (TrainerRoad, Xert, JOIN, Zwift, TrainerDay) are not copied.')},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/generate'&&request.method==='POST'){
      const body=await request.json().catch(()=>({}));
      const date=validDate(body.date)?body.date:localToday();
      if(date<localToday())return Response.json({status:'error',message:L('Vyber dnešní nebo budoucí datum.', 'Choose today or a future date.')},{status:400});
      let availabilityMinutes=Number.isFinite(Number(body.availabilityMinutes))&&Number(body.availabilityMinutes)>0?Number(body.availabilityMinutes):null;
      const genSport=body.sport==='run'?'run':'ride';
      const userInitiated=body.userInitiated===true||Boolean(body.workoutId&&Number(body.resizeTo)>0);
      // The weekly planner's role for this day (long, easy, quality) steers the coach.
      assertTrainingAllowed(await getAthleteState(env.DB));
      const prefs=await getWeekPlan(env.DB,date),plan=await planForWeek(env,ctx,mondayOfDate(date)),weekRole=roleFor(prefs,date,genSport,plan.roles);
      // The calendar chip's length is the default, so the proposal matches what the week plan shows.
      const chip=prefs&&(plan.plan||!availabilityMinutes&&!body.resizeTo)?targetFor(await computeWeekTargets(env,ctx,mondayOfDate(date),prefs).catch(()=>null),date,genSport):null;
      const weekTarget=!availabilityMinutes&&!body.resizeTo?chip:null;
      // The training plan's session for the day (training-plans.js), unless the
      // athlete picked a workout or asked for another option.
      const planned=!body.workoutId&&!(Number(body.variant)>0)?chip?.plan||null:null;
      if(weekTarget?.minutes)availabilityMinutes=weekTarget.minutes;
      availabilityMinutes=trainingBudget(prefs,date,availabilityMinutes,{userInitiated});
      if(availabilityMinutes!=null&&availabilityMinutes<(genSport==='run'?20:30))throw new Error(L('V tento den nemáš dost času na tento trénink.', 'You don\'t have enough time for this workout on this day.'));
      // The chip's place (the athlete's choice or the forecast) first, then the forecast.
      const weather=weekTarget?.environment?{}:await weekWeather(prefs.location,mondayOfDate(date)),suggestedEnvironment=weekTarget?.environment?{environment:weekTarget.environment,reason:weekTarget.reason}:environmentFor(date,genSport,weather[date]);
      const environment=body.environment==='auto'||!body.environment?suggestedEnvironment.environment:body.environment;
      // Indoor is shorter (the chip already is when it says indoor).
      if(!userInitiated&&environment==='indoor'&&weekTarget?.environment!=='indoor')availabilityMinutes=availabilityMinutes!=null?indoorMinutes(genSport,availabilityMinutes):genSport==='ride'?90:60;
      const planFocus=planned?({quality:systemOf(genSport,planned.family),test:'threshold',long:'long_endurance',easy:'endurance',recovery:'recovery'})[planned.kind]||null:null;
      const roleFocus=planFocus||weekRole?.focus;
      const goal=body.phase||roleFocus?{...(body.phase?{phase:String(body.phase)}:{}),...(roleFocus?{focus:roleFocus}:{})}:null;
      const coach=buildCyclingCoachV2({...await loadCoachInputs(env,ctx,internalAuth,date),availabilityMinutes,capabilities:await getCapabilities(env.DB,genSport),goal,sport:genSport});
      const thresholds=await cached(env,ctx,'thresholds',()=>athleteThresholds(env));
      const resizeTo=Number.isFinite(Number(body.resizeTo))&&Number(body.resizeTo)>0?trainingBudget(prefs,date,Number(body.resizeTo),{userInitiated}):null;
      if(resizeTo!=null&&resizeTo<(genSport==='run'?20:30))throw new Error(L('Na změnu délky nezbývá dost času.', 'There isn\'t enough time left to change the duration.'));
      // The free time is a limit, not a target: the coach may want less (an easy
      // day, a beginner, a run that grows slowly). A length typed by the athlete wins.
      const coachMinutes=Number(coach.recommendation?.session?.durationMinutes)||null;
      const sessionMinutes=!userInitiated&&availabilityMinutes!=null&&coachMinutes?Math.min(availabilityMinutes,coachMinutes):availabilityMinutes;
      // The plan's workout when the coach keeps the day's intensity: a key
      // session needs a hard day by the coach (a red or tired morning makes it
      // easy, and then the coach's own easy session stands), an easy one
      // anything but recovery. Tests and the race are the plan's whatever.
      const coachKind=coach.recommendation?.session?.kind,hardDay=['tempo','sweet_spot','threshold','vo2','vo2max','anaerobic','sprint'].includes(coachKind);
      const keeps=planned&&(planned.kind==='race'||planned.kind==='test'?true:planned.kind==='quality'?hardDay:coachKind!=='recovery'||planned.kind==='recovery');
      let planWorkout=null;
      if(keeps){
        const minutes=resizeTo??sessionMinutes??(Number(chip?.minutes)||null);
        const id=planned.kind==='race'||planned.kind==='test'?planned.workoutId:planWorkoutId(genSport,planned,minutes||chip?.minutes||60,planned.kind==='quality'?levelShift((await getCapabilities(env.DB,genSport))[systemOf(genSport,planned.family)]):0);
        const base=id?await getWorkout(env.DB,String(id).replace(/~\d+$/,'')):null;
        if(base)planWorkout={id:base.id,minutes:planned.kind==='race'||planned.kind==='test'?base.duration_minutes:(minutes||base.duration_minutes)};
      }
      let generated=planWorkout?await generateWorkout(env.DB,{sport:genSport,environment,date,coach,thresholds,workoutId:planWorkout.id,resizeTo:planWorkout.minutes}):await generateWorkout(env.DB,{sport:genSport,environment,date,coach,availabilityMinutes:resizeTo??sessionMinutes,variant:body.variant,thresholds,workoutId:body.workoutId?String(body.workoutId).slice(0,120):null,resizeTo});
      if(!planWorkout&&sessionMinutes&&resizeTo==null&&generated.workout?.duration_minutes>sessionMinutes)generated=await generateWorkout(env.DB,{sport:genSport,environment,date,coach,thresholds,workoutId:generated.workout.id,resizeTo:sessionMinutes});
      // Today's proposal in the library: the AI picks among the rules' safe
      // candidates for the morning and says why (ai-workout-pick.js).
      if(body.ai===true&&date===localToday()&&!planWorkout&&!body.workoutId&&!(Number(body.variant)>0)&&resizeTo==null&&generated.status==='ok'){
        const before=generated.workout?.id;
        generated=await aiWorkoutPick(env,generated,{sport:genSport,minutes:sessionMinutes,coach,today:{score:coach.readiness?.score,zone:coach.readiness?.status,feeling:await getCheckin(env.DB,date).catch(()=>null),sleep:coach.readiness?.sleepMinutes!=null?{minutes:coach.readiness.sleepMinutes}:null}});
        if(generated.workout?.id!==before)try{generated.explanation=explainWorkout(generated.workout,{coach,environment:generated.workout.environment||environment,thresholds,sport:genSport});}catch{}
      }
      const planInfo=planned&&plan.pw?{name:plan.pw.template.name,week:plan.pw.week,weeks:plan.pw.weeks,phase:plan.pw.spec.phase,kind:planned.kind,followed:Boolean(planWorkout)}:null;
      if(planInfo&&generated.explanation?.why){
        const head=planInfo.name+L(' · týden ',' · week ')+planInfo.week+'/'+planInfo.weeks;
        generated.explanation.why=[planWorkout?head+(planned.kind==='quality'?L(': klíčový trénink týdne.',': the key session of the week.'):planned.kind==='test'?L(': test na začátku a na konci plánu.',': the test at the start and end of the plan.'):planned.kind==='race'?L(': závod.',': race day.'):'.'):head+L(': klíčový trénink dnes nahrazuje lehčí, podle tvé připravenosti.',': today the key session gives way to an easier one, from your readiness.'),...generated.explanation.why];
      }
      return Response.json({...generated,weekRole,weekTarget,plan:planInfo,environmentReason:suggestedEnvironment.reason},{headers:{'Cache-Control':'no-store'}});
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
      if(manual){if(scheduledDate>localToday()||!Number.isFinite(minutes)||minutes<=0||minutes>1440)return Response.json({message:L('Zadej skutečnou délku dokončeného tréninku.', 'Enter the actual duration of the completed workout.')},{status:400});completedPercent=Math.min(100,Math.round(minutes/link.duration_minutes*100));}
      if(!Number.isFinite(completedPercent))return Response.json({status:'error',message:L('K tomuto workoutu jsem v Intervals.icu zatím nenašel dokončenou aktivitu. RPE zadáš, až bude aktivita nahraná a spárovaná s plánem.', 'I haven\'t found a completed activity for this workout in Intervals.icu yet. You can enter the RPE once the activity is uploaded and matched with the plan.')},{status:409});
      const notes=typeof body.notes==='string'&&body.notes.trim()?body.notes.trim().slice(0,1000):null,rpe=body.rpe==null||body.rpe===''?null:Number(body.rpe);
      const result=await recordWorkoutFeedback(env.DB,{workoutId,scheduledDate,completedPercent,rpe,survey:'completed',notes});
      if(manual)await completeLocalWorkout(env.DB,link.intervals_event_id,{minutes,rpe,notes});
      const intervals=rpe!=null?await writeIntervalsRpe(env,activityId,rpe):{status:'skipped'};
      // The coach's note is written in the background; the dashboard picks it up.
      // Without AI access (consent, subscription, no key) it is the rule-based note, never sent to OpenAI.
      const reflect=validDate(scheduledDate),aiAllowed=Boolean(env.OPENAI_API_KEY)&&(await subscriptionStatus(env).catch(()=>({aiAccess:false}))).aiAccess;
      const ruleEnv={...env};if(!aiAllowed)delete ruleEnv.OPENAI_API_KEY;
      if(reflect)ctx.waitUntil(createReflection(ruleEnv,{date:scheduledDate,workoutId,rpe,notes},day=>reflectionData(env,ctx,internalAuth,day,workoutId)).catch(error=>console.error('Coach reflection failed',error.message)));
      return Response.json({...result,completedPercent,intervals,reflection:reflect?'pending':'unavailable'},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/schedule'&&request.method==='POST'){
      const body=await request.json().catch(()=>({})),date=String(body.date||'');
      if(!validDate(date)||date<localToday())return Response.json({status:'error',message:L('Vyber dnešní nebo budoucí datum.', 'Choose today or a future date.')},{status:400});
      return Response.json(await scheduleWorkoutInIntervals(env,env.DB,{workoutId:String(body.workoutId||''),date,confirm:body.confirm===true,environment:body.environment}),{headers:{'Cache-Control':'no-store'}});
    }
  }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  return null;
}

function logoResponse() {
  // The Aurin mark (Rovnováha), the favicon of the public pages.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M6 46A36 36 0 0 1 78 46Z" fill="#F2B46B"/><path d="M22 54A36 36 0 0 0 94 54Z" fill="#3FA383"/></svg>`;
  return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}

