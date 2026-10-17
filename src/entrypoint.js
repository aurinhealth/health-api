import {initialImport,recentDashboardImport} from './account-sync.js';
import { recordOpsEvent, routeName, sendDailyOpsReport, withOpsScope } from "./ops-report.js";
import { trainingSetup } from './onboarding.js';
import { subscriptionStatus, assertAIAccess } from './subscription.js';
import { buildNutrients, buildNutrientDetail, nutrientFavorites, saveNutrientFavorites, microTop, FREE_KEYS } from './micronutrients.js';
import { listRecipes, saveRecipe, deleteRecipe } from './personal-recipes.js';
import {deletePersonalFood} from './personal-foods.js';
import {retryWorkoutExports,syncLocalWorkout,completeLocalWorkout,storeLocalEvent} from './local-workouts.js';
import {heartRateWindow,heartRateKcal,watchWorkoutIn} from './manual-heart-rate.js';
import {latestStoredWeight} from './athlete-weight.js';
import app from "./strength-gateway.js";
import { foodRecommend } from "./food-recommend.js";
import { buildCoachCouncil } from "./coach-engine.js";
import { connectionStatus } from "./connections.js";
import { saveSourcePriority } from "./source-priority.js";
import { connectionEnvironment, saveConnectionSecret, deleteConnectionSecret, missingProviders, migrateConnectionSecrets } from "./connection-secrets.js";
import { withIntervalsSleep, intervalsWellness } from './intervals-sleep.js';
import { cached, bumpCacheVersion } from './api-cache.js';
import { manualPairs } from './manual-pairs.js';
import { activityDetail, rideIntervals } from './activity-detail.js';
import { watchDetail, withWatch } from './watch-detail.js';
import { useCookbookDatabase } from './cookbook.js';
import {googleDashboard} from './google-dashboard.js';
import {applyEnergyBudget} from './energy-budget.js';
import {buildToday} from './app-today.js';
import {withIdempotency} from './idempotency.js';
import {buildTraining, weekStart} from './app-training.js';
import {buildCalendar} from './app-calendar.js';
import {buildMilestones} from './app-milestones.js';
import { buildShareWeek, mondayOf } from './share-week.js';
import { buildShareMilestones, intervalsRecord } from './share-milestone.js';
import {buildHealth} from './app-health.js';
import {buildFood} from './app-food.js';
import {normalizeProfile} from './energy-profile.js';
import {athleteFocus} from './athlete-focus.js';
import { loadProfiles, refreshSuggestions } from './profile-suggestions.js';
import {syncWeights} from './weight-sync.js';
import {syncWellnessToIntervals} from './wellness-sync.js';
import {forwardWatchWorkouts} from './watch-forward.js';
import {askCoach,coachContext,lightModel,assistantTask,engineSport} from './coach-assistant.js';
import {assistantAppContext,selectedAssistantContext} from './assistant-app-context.js';
import { validateCoachActions, actionSafetyContext, actionsNote } from './coach-actions.js';
import { buildReviewInput, reviewDay, dayReadiness, usageCost } from "./coach-review.js";
import { trendFacts } from "./trend-facts.js";
import { workloadMetrics } from "./workload-ratio.js";
import { createReflection, listReflections, activityFromRow, dedupeActivities, fillWellness } from "./coach-reflection.js";
import { addLoads } from "./training-load.js";
import { savePersonalFood } from './personal-foods.js';
import { processFoodGoogle, backfillFoodGoogle } from './food-google-sync.js';
import { recentWorkoutRatings, workoutRatings } from "./exercise-feedback.js";
import { isFoodLogMessage, buildFoodDraft, foodDraftSummary } from "./food-chat.js";
import { loadRecoveryValidation } from "./recovery-validation.js";
import { handleGoogleOAuth } from "./google-oauth.js";
import { getStrengthHistory, parseStrengthPlan } from "./strength-history.js";
import { explainWorkout } from "./workout-explanation.js";
import { aiWorkoutPick } from "./ai-workout-pick.js";
import { composeWorkout, poorFit } from "./ai-workout-compose.js";
import { rankOptions, recentKinds, pickState, savePick, lessKinds, setLess, pickSignature, storedDetails, storeDetails, workoutLines, gymLines } from "./coach-pick.js";
import { activityKindOf } from "./activity-match.js";
import { getWorkout, searchWorkoutLibrary, parseWorkoutSearchFilters, getCapabilities, getScheduledWorkouts, recordWorkoutFeedback, scheduleWorkoutInIntervals, generateWorkout, scheduledLink, stepRows } from "./workout-library.js";
import { buildCyclingCoachV2 } from "./cycling-coach-v2.js";
import { athleteThresholds, rideFtpFor } from "./intervals-athlete.js";
import { grantedExtras } from "./google-scopes.js";
import { renderForEnvironment } from "./workout-model.js";
import { plannedEventWorkout } from "./planned-detail.js";
import { getWeekPlan, saveWeekPlan, addWeekSport, resetWeekPlan, planWeekRoles, roleFor, ROLE_FOCUS, weekTargets, targetFor, weekLoadsBefore, hrvWeekTrendDown, hrvSourceRows, weeklyRunCap, capRunVolume } from "./week-planner.js";
import { availabilityOn, trainingBudget, validDay as validTrainingDay } from './training-availability.js';
import { getCheckin, readinessCheckin, saveCheckin } from './morning-checkin.js';
import { getChecks, upcomingTest } from './threshold-check.js';
import { getAthleteState, updateAthleteState, explicitPreference, assertTrainingAllowed, proactiveAdvice, memoryList, memoryCheck, memoryChanges } from './athlete-state.js';
import { savePlanState, planChoice, planUndo, missedSession, proposalView, phaseLabel, planWeek, planWorkoutId, levelShift, systemOf, planTemplates, templateSummary, planSummary, planStart, planDays, startPlan, stopPlan, getTemplate, planName, planEdit, planWeekDays, planPreview, planCompletion, finishedPlan, closePlanResult } from './training-plans.js';
import { capWeekTargets, estimatedTargets, weekProposal, weekWeather, environmentFor, activityHistoryEstimate, indoorMinutes, sessionsOn, sportOf } from './adaptive-week.js';
import { chatLibraryQuery } from './chat-ask.js';
import { proposeWeekAI, adjustByChip, adjustByText, kindOfSystem, KINDS, FOCUS_OF, WEEK_SPORTS, HARD_KINDS } from './week-ai.js';
import { reviseWeek, rulesRevision, revisionSignature, readRevision, saveRevision, decideRevision, shownRevision } from './week-revision.js';
import { movePlannedEvent, deletePlannedEvent } from "./planned-events.js";
import { illnessWarning, illnessSigns } from './illness-check.js';
import { readinessFor } from './readiness.js';
import { lockReadiness } from "./readiness-lock.js";
import { loadFitnessInsights, exerciseMuscles } from "./fitness-insights.js";
import { loadMuscleFatigue, loadTrainingDoses } from "./muscle-fatigue.js";
import { loadMuscleDetail } from "./muscle-detail.js";
import { recoveryTime } from "./recovery-time.js";
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
import { intervalsAuthorization, INTERVALS_TOKEN_PREFIX } from "./intervals-auth.js";
import { isStaging, markStaging } from "./staging.js";
import { coachEvalPrincipal, handleCoachEval } from "./coach-eval.js";
import { isPublicPath, resolvePrincipal, unauthorizedResponse, handleDashboardLogout, sessionSecret, foreignOriginChange, sessionMatchesUser, slidingSession } from "./dashboard-auth.js";
import { appleAppSiteAssociation } from "./apple-app-site-association.js";
import { handleWorkoutTemplatesApi, publicSharePage } from "./workout-templates.js";
import { wwwRedirect } from "./app-origin.js";
import { internalHeaders } from "./internal-auth.js";
import { deleteAccount, finishAccountDeletions, revokeGoogle, inactiveAccounts } from "./account-data.js";
import { handleIntervalsOAuth, disconnectIntervalsApp } from "./intervals-oauth.js";
import { handleIntervalsWebhook } from "./intervals-webhook.js";
import { intervalsChanged, intervalsReads } from "./intervals-reads.js";
import { handleStravaOAuth, disconnectStrava, syncStravaWeight } from "./strava.js";
import { handleUltrahumanOAuth, disconnectUltrahuman, syncUltrahuman, FIRST_IMPORT_DAYS } from "./ultrahuman.js";
import { handleWhoopOAuth, disconnectWhoop, syncWhoop, FIRST_IMPORT_DAYS as WHOOP_FIRST_DAYS } from "./whoop.js";
import { handleWahooOAuth, handleWahooWebhook, disconnectWahoo, syncWahoo, retryWahooExports, readWahooTokens, FIRST_IMPORT_DAYS as WAHOO_FIRST_DAYS } from "./wahoo.js";
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
import { handlePushToken, sendMorningReadiness, hasLastNight, pushConfigured, listPushTokens, sendPush, deletePushToken, MORNING_READINESS } from "./push.js";
import { coachNudge, swapOffer, zoneShiftHours, COACH_PUSH, COACH_SWAP_CATEGORY, COACH_FROM_HOUR, COACH_TO_HOUR, EVENING_FROM_HOUR } from "./coach-push.js";
import { overviewPage, privacyPage, termsPage, supportPage, robotsTxt, sitemapXml } from './site-pages.js';
import { lang, withLang, storedLanguage, rememberLanguage, withUnits, storedUnits, rememberUnits, L } from "./lang.js";
import { appUpdateRequired } from "./app-version.js";
import { compactHeartRate } from "./heart-rate-compaction.js";
import { DEFAULT_TIME_ZONE, validTimeZone, withTimeZone, storedTimeZone, rememberTimeZone, localNow, localToday, localDate, localHour, timeZone, zoneOffsetMs } from "./user-time.js";
import { shiftDate, googleHealthFor, dashboardProfile, mondayOfDate, dayStartSql, mapLimit, userWeekStart } from "./dashboard-shared.js";
import { recentCoachProposals, ensureCoachInboxTable } from "./coach-inbox.js";
import { recentWorkoutFeedback, reconcileWorkoutLibraryCompletions, matchScheduledActivity, writeIntervalsRpe } from "./library-workouts.js";
import { planningHistory, planForWeek, syncedPlans, planSportDates, planSportMinutes, todayPlace, trainingGymPlans } from "./plan-context.js";
import { rideReviewsForCoach, rideDetailsFor } from "./coach-ride-reviews.js";
import { ownFitness, watchOnlyFitness } from "./own-fitness.js";
import { handleStrengthAutomation, handleAdminApi } from "./routes-admin.js";
import { handleAccountApi } from "./routes-account.js";
import { handleSyncApi } from "./routes-sync.js";
import { handleGymToolsApi, handleGymPlanApi } from "./routes-gym.js";
import { handleTrainingEditsApi, handleThresholdApi } from "./routes-training.js";
import { handleFoodApi, queueFoodGoogleSafely } from "./routes-food.js";
import { handleCycleApi } from "./routes-cycle.js";
import { handleJournalApi, journalForCoach } from "./routes-journal.js";
import { muscleModelResponse } from "./muscle-model.js";
import { morningMetrics } from "./journal-impact.js";
import { cycleForCoach } from "./cycle-model.js";
import { ownerOnlyRefusal } from "./owner-only-routes.js";
import { setActivityKcal } from "./activity-edits.js";
import { hideActivity, mergeActivities, setActivityTime, undoActivityChange } from "./activity-chat-edits.js";
import { loadThresholdSessions } from "./threshold-check-state.js";
import { performanceTrends, intervalsCurves, recentIntervals } from "./performance-trends.js";
const numOrNull=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const isPro=env=>subscriptionStatus(env).then(s=>s.plan==='ai').catch(()=>false);


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
const CACHE_NEUTRAL = /^\/app\/api\/(sync\/(prefs|activity|retry)|food\/(label|photo|search|ai-lookup)|workouts\/generate|gym\/generate|gym\/equipment\/detect|gym\/technique|training-profile\/estimate|assistant$|assistant\/stream|assistant\/chats|me\/apple$|health\/apple$|account\/(email\/(start|verify)|sign-out-everywhere)$|support\/report$|push\/token$|passkeys$|passkeys\/options$)/;
const STATIC_PATHS = new Set(['/logo.svg','/','/privacy','/terms','/support','/robots.txt','/sitemap.xml']);

// An OAuth connection to Intervals.icu skips a scheduled job except at minute
// 40 (or the job's own minute) of every sixth hour (UTC).
function intervalsOAuthQuiet(env, minute = 40, now = new Date()) {
  if (!String(env.INTERVALS_API_KEY || "").startsWith(INTERVALS_TOKEN_PREFIX)) return false;
  return !(now.getUTCHours() % 6 === 0 && now.getUTCMinutes() === minute);
}
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


// The background jobs of one user, by the services they connected and the
// minute (UTC) they are due. One cron run used to go through every user in
// turn and hit the 1000 database queries a run may make (users with a higher
// account number then silently stopped syncing); now each user's due jobs run
// in an invocation of their own (UserJobs, user-jobs-entrypoint.js).
const minute = (cron, now, test) => cron === "* * * * *" && test(now.getUTCMinutes(), now.getUTCHours());
const every5 = (cron, now) => minute(cron, now, m => m % 5 === 0);
const USER_JOBS = [
  // After the user's midnight (0:00–6:00 in their zone), heart-rate samples
  // older than two weeks become 5-minute rows, six hours of samples a minute.
  { name: "sync", providers: ["google", "intervals"], due: () => true, run: async (scoped, ctx, controller) => {
    await app.scheduled(controller, scoped, ctx);
    if (controller.cron === "* * * * *" && localHour() < 6 && (scoped.CONNECTED_PROVIDERS || []).includes("google")) await compactHeartRate(scoped.DB, scoped.USER_ID).catch(error => console.error("Heart-rate compaction failed", error.message));
    // The morning readiness push once the night's data has synced (push.js),
    // checked every five minutes; it goes out at most once a local day.
    if (every5(controller.cron, new Date(controller.scheduledTime || Date.now()))) {
      await morningPush(scoped, ctx).catch(error => console.error("Morning push failed", error.message));
      await coachPush(scoped, ctx).catch(error => console.error("Coach push failed", error.message));
    }
  } },
  { name: "google-food", providers: ["google"], due: every5, run: async scoped => { await backfillFoodGoogle(scoped.DB); await processFoodGoogle(scoped, { token: googleToken }); } },
  { name: "intervals-exports", providers: ["intervals"], due: every5, run: scoped => retryWorkoutExports(scoped) },
  // Done activities whose send to Google Health, Intervals.icu or Strava did not go through (sync-destinations.js).
  { name: "sync-sends", providers: ["google", "intervals", "strava"], due: every5, run: scoped => retrySyncSends(scoped, { googleToken }) },
  // Every hour at :20: the ring's last three days from Ultrahuman (the night lands in the morning).
  { name: "ultrahuman", providers: ["ultrahuman"], due: (cron, now) => minute(cron, now, m => m === 20), run: async scoped => { const r = await syncUltrahuman(scoped, { days: 3 }); if (r.saved) await bumpCacheVersion(scoped.DB); } },
  // Wahoo: plans not sent yet every five minutes; done workouts come by the webhook, and every
  // three hours a look in case one was missed (the Sandbox allows 250 requests a day for the app).
  { name: "wahoo-exports", providers: ["wahoo"], due: every5, run: scoped => retryWahooExports(scoped) },
  { name: "wahoo", providers: ["wahoo"], due: (cron, now) => minute(cron, now, (m, h) => m === 35 && h % 3 === 0), run: async scoped => { const r = await syncWahoo(scoped, { days: 2, maxPages: 1 }); if (r.saved) { await matchActivities(scoped, { days: 3 }).catch(() => null); await bumpCacheVersion(scoped.DB); } } },
  { name: "whoop", providers: ["whoop"], due: (cron, now) => minute(cron, now, m => m === 25), run: async scoped => { const r = await syncWhoop(scoped, { days: 3 }); if (r.saved) await bumpCacheVersion(scoped.DB); } },
  // Hourly: the latest weight to Strava when it changed and the user sends it there.
  { name: "strava-weight", providers: ["strava"], due: (cron, now) => minute(cron, now, m => m === 30), run: async scoped => syncStravaWeight(scoped, { allowed: healthAllowed(await readSyncPrefs(scoped.DB, scoped.USER_ID, "strava"), "weight") }) },
  // Every 5 minutes for a personal API key; an OAuth connection gets
  // webhooks (/webhooks/intervals), so only a look every 6 hours in case
  // one was lost (an OAuth app has 100 requests per athlete a day).
  // After it, Apple Health workouts no other source brought go to Intervals.icu (watch-forward.js).
  { name: "intervals-recent", providers: ["intervals"], due: every5, run: async (scoped, ctx, controller) => {
    if (intervalsOAuthQuiet(scoped, 40, new Date(controller.scheduledTime || Date.now()))) return;
    await legacyHealthApi.fetch(new Request("https://internal/sync/intervals/recent", { method: "POST" }), scoped, ctx);
    await forwardWatchWorkouts(scoped).catch(error => console.error("Watch workout forward failed", error.message));
  } },
  // Hourly, half an hour after the Google Health sync: weight the same in the
  // app, Google Health and Intervals.icu, and Google wellness (sleep, steps,
  // heart rate, HRV, …) copied into Intervals.icu.
  { name: "intervals-wellness", providers: ["intervals"], due: (cron, now) => minute(cron, now, m => m === 30), run: async (scoped, ctx, controller) => {
    if (intervalsOAuthQuiet(scoped, 30, new Date(controller.scheduledTime || Date.now()))) return;
    await syncWeights(scoped, { googleToken }).catch(error => console.error("Weight sync failed", error.message));
    await syncWellnessToIntervals(scoped, { sleepSessions: (from, to) => legacyHealthApi.fetch(new Request(`https://internal/health/sleep?start=${from}&end=${shiftDate(to, 1)}`), scoped, ctx).then(r => r.json()).then(d => d.sessions || []) }).catch(error => console.error("Wellness sync failed", error.message));
  } }
];
export function dueUserJobs(cron, now) { return USER_JOBS.filter(job => job.due(cron, now)).map(job => job.name); }

// One user's due jobs, in the user's language, units and time zone; a failing
// job does not stop the next one.
export async function runUserJobs(env, ctx, { cron, scheduledTime }, user, names) {
  const scoped = await connectionEnvironment(await userDataEnvironment(env, user));
  const connected = scoped.CONNECTED_PROVIDERS || [];
  const jobs = USER_JOBS.filter(job => names.includes(job.name) && job.providers.some(p => connected.includes(p)));
  if (!jobs.length) return;
  const [language, zone] = await Promise.all([storedLanguage(env.DB, user.id, { fresh: true }), storedTimeZone(env.DB, user.id, { fresh: true })]), unitsChoice = await storedUnits(env.DB, user.id);
  const controller = { cron, scheduledTime };
  await withLang(language, () => withUnits(unitsChoice, () => withTimeZone(zone, async () => {
    for (const job of jobs) {
      try { await withOpsScope(env.DB, job.name, () => job.run(scoped, ctx, controller)); }
      catch (error) { console.error("Per-user job failed", user.id, job.name, error.message); }
    }
  })));
}
// The UserJobs entrypoint (user-jobs-entrypoint.js): a fresh invocation for one user.
export async function runUserJobsInvocation(env, ctx, { user, names, cron, scheduledTime }) {
  await ensureTenancy(env.DB, env);
  useCookbookDatabase(env.DB);
  await runUserJobs(env, ctx, { cron, scheduledTime }, user, names);
}
// Ten users at a time through the USER_JOBS binding. Without the binding (tests,
// local runs), or when it fails before any user went through, the jobs run here.
export async function fanOutUserJobs(env, ctx, controller, { concurrency = 10 } = {}) {
  const scheduledTime = controller.scheduledTime || Date.now();
  const names = dueUserJobs(controller.cron, new Date(scheduledTime));
  if (!names.length) return { users: 0, names };
  const providers = [...new Set(USER_JOBS.filter(job => names.includes(job.name)).flatMap(job => job.providers))];
  // The App Review demo account syncs with no third-party service (app-review.js).
  const users = (await usersWithProviders(env.DB, env, providers)).filter(user => !isReviewAccount(env, user));
  let binding = env.USER_JOBS && typeof env.USER_JOBS.run === "function" ? env.USER_JOBS : null, delivered = 0;
  const inline = user => runUserJobs(env, ctx, { cron: controller.cron, scheduledTime }, user, names).catch(error => console.error("Per-user job failed", user.id, error.message));
  const one = async user => {
    if (!binding) return inline(user);
    try { await binding.run({ user, names, cron: controller.cron, scheduledTime }); delivered++; }
    catch (error) {
      console.error("User jobs invocation failed", user.id, error.message);
      if (!delivered) { binding = null; return inline(user); }
    }
  };
  for (let i = 0; i < users.length; i += binding ? concurrency : 1) await Promise.all(users.slice(i, i + (binding ? concurrency : 1)).map(one));
  return { users: users.length, names };
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
    // Connection keys saved before CONNECTION_KEY existed get it (connection-secrets.js).
    if (controller.cron === "* * * * *" && new Date().getUTCMinutes() % 5 === 0) await migrateConnectionSecrets(env).then(result => { if (result.migrated || result.failed) console.log("Connection key migration", result); }).catch(error => console.error("Connection key migration failed", error.message));
    // Yesterday's failed syncs, broken connections and server errors, to the owner (ops-report.js);
    // only from the live server.
    if (!isStaging(env) && (controller.cron === "* * * * *" && new Date().getUTCHours() === 6 && new Date().getUTCMinutes() % 10 === 0)) await sendDailyOpsReport(env).catch(error => console.error("Daily ops report failed", error.message));
    // Every user's jobs due this minute (USER_JOBS), each user in its own invocation.
    await fanOutUserJobs(env, ctx, controller);
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
    // The coach evaluation workflow acts as the owner, on the test server only.
    if (!principal && url.pathname === "/automation/coach-eval") principal = await coachEvalPrincipal(request, env);
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
    } else if (principal?.kind === "owner" || principal?.kind === "system" || principal?.kind === "coach-eval") {
      // The owner API key and GitHub automations act as the owner.
      user = await ownerUser(env.DB, env);
    }
    if (user) {
      try { env = await connectionEnvironment(await userDataEnvironment(rawEnv, user)); }
      catch (error) {
        if (error instanceof UserDataUnavailable || error instanceof FoodCatalogUnavailable) return Response.json({status:'storage_unavailable',message:error instanceof FoodCatalogUnavailable?error.message:withLang(request.headers.get('X-Interface-Language')||/(?:^|;\s*)lw-lang=(cs|en)/.exec(request.headers.get('cookie')||'')?.[1],()=>L('Tvoje data jsou teď nedostupná. Zkus to za chvíli.', 'Your data is unavailable right now. Try again in a moment.'))},{status:503,headers:{'Retry-After':'30','Cache-Control':'no-store'}});
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
    if (url.pathname === "/automation/coach-eval") return handleCoachEval(request, env, principal);
    // Wahoo's webhook: a finished workout of whoever is connected to that Wahoo account.
    if (url.pathname === "/webhooks/wahoo" && request.method === "POST") return handleWahooWebhook(request, rawEnv, (wahooUser, fn) => forEachUser(rawEnv, ["wahoo"], async scoped => {
      if (String(readWahooTokens(scoped)?.user_id ?? "") !== wahooUser) return null;
      const result = await fn(scoped);
      if (result?.saved) { await matchActivities(scoped, { days: 3 }).catch(() => null); await bumpCacheVersion(scoped.DB); }
      return result;
    }));
    // Intervals.icu's webhooks: what changed for an athlete connected with OAuth.
    if (url.pathname === "/webhooks/intervals" && request.method === "POST") return handleIntervalsWebhook(request, rawEnv, ctx, (athlete, parts, kinds) => forEachUser(rawEnv, ["intervals"], async scoped => {
      if (!scoped.INTERVALS_ATHLETE_ID || scoped.INTERVALS_ATHLETE_ID !== athlete) return null;
      await intervalsChanged(scoped, kinds);
      const result = parts.length ? await legacyHealthApi.fetch(new Request("https://internal/sync/intervals/recent?parts=" + parts.join(","), { method: "POST" }), scoped, ctx).then(r => r.json()).catch(error => ({ error: error.message })) : null;
      await bumpCacheVersion(scoped.DB);
      return result;
    }));
    // Passkeys in the iPhone app: the app's associated domain (apple-app-site-association.js).
    const siteAssociation = appleAppSiteAssociation(request, rawEnv, url.pathname);
    if (siteAssociation) return siteAssociation;
    // A workout shared with a link: its page and preview image, for anyone.
    const sharePage = await publicSharePage(request, rawEnv.DB, url, rawEnv);
    if (sharePage) return sharePage;
    // The App Review demo account connects no third-party service and sends nothing out (app-review.js).
    const demoRefusal = reviewRefusal(rawEnv, user, request.method, url.pathname);
    if (demoRefusal) return demoRefusal;
    // Only if Apple asks for it when the Services ID is set up: the file's content as a secret.
    if ((url.pathname.startsWith('/oauth/google') || url.pathname.startsWith('/oauth/intervals') || url.pathname.startsWith('/oauth/strava') || url.pathname.startsWith('/oauth/ultrahuman') || url.pathname.startsWith('/oauth/whoop') || url.pathname.startsWith('/oauth/wahoo')) && !signedIn) return new Response(L('Připojení se nepodařilo ověřit. Zavři okno a zkus to v aplikaci znovu.', 'Couldn\'t verify the connection. Close this window and try again in the app.'),{status:401});
    const googleOAuth = await handleGoogleOAuth(request, env, url.pathname);
    if (googleOAuth) {if(url.pathname==="/oauth/google/callback"&&googleOAuth.status===302){await clearConnectionHealth(env,'google');await dashboardSyncStatus(env.DB);await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name='initial_google'").bind(env.USER_ID).run();await initialImport(await connectionEnvironment(env),ctx);}return googleOAuth;}
    const intervalsOAuth = await handleIntervalsOAuth(request, env, url.pathname);
    // A new Intervals.icu connection imports its history, the same as a pasted key.
    if (intervalsOAuth) {if(url.pathname==="/oauth/intervals/callback"&&intervalsOAuth.status===302){await clearConnectionHealth(env,'intervals');await dashboardSyncStatus(env.DB);await env.DB.prepare("DELETE FROM sync_status WHERE user_id=? AND sync_name='initial_intervals'").bind(env.USER_ID).run();await initialImport(await connectionEnvironment(env),ctx);}return intervalsOAuth;}
    // Strava is only a destination (Synchronizace): nothing to import after connecting.
    const stravaOAuth = await handleStravaOAuth(request, env, url.pathname);
    if (stravaOAuth) return stravaOAuth;
    // A new Ultrahuman connection imports the ring's last two months (readiness's baseline).
    const ultrahumanOAuth = await handleUltrahumanOAuth(request, env, url.pathname);
    if (ultrahumanOAuth) {if(url.pathname==="/oauth/ultrahuman/callback"&&env.ULTRAHUMAN_TOKEN)ctx.waitUntil(syncUltrahuman(env,{days:FIRST_IMPORT_DAYS}).then(()=>bumpCacheVersion(env.DB)).catch(error=>console.error("Ultrahuman first import failed",error.message)));return ultrahumanOAuth;}
    const whoopOAuth = await handleWhoopOAuth(request, env, url.pathname);
    if (whoopOAuth) {if(url.pathname==="/oauth/whoop/callback"&&env.WHOOP_TOKEN)ctx.waitUntil(syncWhoop(env,{days:WHOOP_FIRST_DAYS}).then(()=>bumpCacheVersion(env.DB)).catch(error=>console.error("WHOOP first import failed",error.message)));return whoopOAuth;}
    // A new Wahoo connection brings its done workouts and sends the plans ahead.
    const wahooOAuth = await handleWahooOAuth(request, env, url.pathname);
    if (wahooOAuth) {if(url.pathname==="/oauth/wahoo/callback"&&env.WAHOO_TOKEN)ctx.waitUntil(syncWahoo(env,{days:WAHOO_FIRST_DAYS}).then(()=>matchActivities(env,{days:WAHOO_FIRST_DAYS+1})).then(()=>retryWahooExports(env)).then(()=>bumpCacheVersion(env.DB)).catch(error=>console.error("Wahoo first import failed",error.message)));return wahooOAuth;}
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
    if (outdated) return isStaging(env) ? markStaging(outdated) : outdated;
    // Server errors are counted for the owner's morning e-mail (ops-report.js); 503 is a planned "try again".
    const count = message => ctx?.waitUntil?.(recordOpsEvent(env.DB, "server", `${request.method} ${routeName(new URL(request.url).pathname)}`, message));
    try {
      const response = await worker.fetch(request, env, ctx);
      if (response.status >= 500 && response.status !== 503) count(`HTTP ${response.status}`);
      return isStaging(env) ? markStaging(response) : response;
    } catch (error) { count(error); throw error; }
  }
};

async function staticRoute(url, request, env) {
  if (url.pathname === "/") return overviewPage(request);
  if (url.pathname === "/privacy") return privacyPage(request, { apple: true, email: emailConfigured(env), open: openSignup(env) });
  if (url.pathname === "/terms") return termsPage(request);
  if (url.pathname === "/support") return supportPage(request, { apple: true, email: emailConfigured(env), open: openSignup(env) });
  if (url.pathname === "/robots.txt") return robotsTxt(request);
  if (url.pathname === "/sitemap.xml") return sitemapXml(request);
  return logoResponse();
}


// What the milestones count (app-milestones.js, share-milestone.js): every
// activity, the days with gym sets logged, and the day the account was made,
// since only what was done since joining Aurin counts, not the history synced from before.
async function milestoneInputs(env,today){
  const [rows,gym,joined]=await Promise.all([
    env.DB.prepare("SELECT source_family,external_id,start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family IN ('intervals','local','wahoo') AND data_type='activity') OR (source_family IN ('google-wearables','apple-health') AND data_type='exercise')) AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID).all().then(r=>r.results||[]).catch(()=>[]),
    trainingGymPlans(env,'2000-01-01',today).catch(()=>({})),
    (env.RAW_DB||env.DB).prepare('SELECT created_at FROM users WHERE id=?').bind(env.USER_ID).first().catch(()=>null)
  ]);
  const since=/^\d{4}-\d{2}-\d{2}/.test(String(joined?.created_at||''))?localDate(String(joined.created_at).replace(' ','T')+(String(joined.created_at).includes('Z')?'':'Z')):'';
  return {rows,since,gymDays:Object.keys(gym).filter(d=>gym[d].logged>0)};
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
    read('/health/sleep?start=' + from + '&end=' + to).then(d => intervalsSleep(env,ctx,d,from, to)).catch(() => ({})),
    dashboardProfile(env).catch(() => null),
    readinessCheckin(env.DB, date).catch(() => null)
  ]);
  if (date === localToday() && profile) ctx.waitUntil(lockReadiness(env.DB, { date, health, fitness, sleep, profile }).catch(() => false));
  return buildToday({ date, hour: localHour(), health, fitness, sleep, profile: profile || {}, checkin }).readiness;
}

// Deník's "Co na tebe působí": the morning metrics (readiness, HRV, resting
// heart rate, sleep, deep sleep) of each day from `from` to `to`, from the
// same inputs as the Health screen (journal-impact.js morningMetrics).
async function journalMornings(env, ctx, from, to) {
  const internalAuth = internalHeaders();
  const read = path => app.fetch(new Request('https://internal' + path, { headers: internalAuth }), env, ctx).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const internal = path => handleDashboardApi(new Request('https://internal' + path), env, ctx, new URL('https://internal' + path)).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const end = shiftDate(to, 1);
  const [health, fitness, sleep, profile] = await Promise.all([
    googleHealthFor(env, ctx, to).catch(() => ({})),
    cached(env, ctx, 'fitness:90', () => internal('/app/api/fitness?days=90')).catch(() => ({})),
    read('/health/sleep?start=' + from + '&end=' + end).then(d => withIntervalsSleep(env, d, from, end)).catch(() => ({})),
    dashboardProfile(env).catch(() => null)
  ]);
  return morningMetrics({ from, to, health, fitness, sleep, profile: profile || {} });
}

// The morning readiness push (push.js); it computes the readiness only when a
// push may go out (5–11 local, a device token, nothing sent today).
async function morningPush(env, ctx, options = {}) {
  if (!pushConfigured(env)) return { sent: 0, reason: 'not-configured' };
  // Settings → Oznámení → Ranní připravenost off; the phone keeps its token for the coach.
  const state = await getAthleteState(env.DB).catch(() => null);
  if (state?.notify?.morning === false) return { sent: 0, reason: 'off' };
  return sendMorningReadiness(env, { readiness: async date => { const r = await todayReadiness(env, ctx, date, options); return r ? { ...r, athleteState: state?.status || null } : r; } });
}

// The coach's own push (coach-push.js), checked with the morning push: a time
// zone change any time 7–21, the morning signs once after the morning push (or
// from 10:00), the evening before a key session once from 17:00; at most one
// push a local day, on until Settings → Oznámení → Kouč is off.
async function coachPush(env, ctx) {
  if (!pushConfigured(env) || !env.DB) return { sent: 0, reason: 'not-configured' };
  const db = env.DB, now = new Date(), hour = localHour(now), date = localToday(now);
  const devices = await listPushTokens(db);
  if (!devices.length) return { sent: 0, reason: 'no-tokens' };
  let state = await getAthleteState(db);
  // The zone the phone sends (X-Time-Zone): a new one is remembered with how far it moved.
  const zoneName = timeZone();
  if (state.zone?.name !== zoneName) {
    const offset = zone => withTimeZone(zone, () => zoneOffsetMs(now));
    state = await updateAthleteState(db, { zone: { name: zoneName, shift: state.zone?.name ? zoneShiftHours(offset(state.zone.name), offset(zoneName)) : 0, changed: date } });
  }
  if (state.notify?.coach === false || hour < COACH_FROM_HOUR || hour >= COACH_TO_HOUR) return { sent: 0, reason: 'off' };
  const logged = (kind, day) => db.prepare('SELECT 1 AS sent FROM push_log WHERE user_id=? AND kind=? AND local_date=?').bind(db.userId, kind, day).first().then(Boolean);
  const claim = (kind, day) => db.prepare('INSERT INTO push_log(user_id,kind,local_date) VALUES(?,?,?) ON CONFLICT(user_id,kind,local_date) DO NOTHING').bind(db.userId, kind, day).run().then(r => Boolean(Number(r?.meta?.changes)));
  if (await logged(COACH_PUSH, date)) return { sent: 0, reason: 'already-sent' };
  const zoneDue = Boolean(state.zone && Math.abs(state.zone.shift) >= 3 && state.zone.changed >= shiftDate(date, -1) && !(await logged('coach-zone', state.zone.changed)));
  const morningDue = hour < 11 && (hour >= 10 || await logged(MORNING_READINESS, date)) && !(await logged('coach-am', date));
  const eveningDue = hour >= EVENING_FROM_HOUR && !(await logged('coach-pm', date));
  if (!zoneDue && !morningDue && !eveningDue) return { sent: 0, reason: 'nothing-due' };
  // Each check runs once, so a failing one is not repeated every five minutes.
  if (zoneDue) await claim('coach-zone', state.zone.changed);
  if (morningDue) await claim('coach-am', date);
  if (eveningDue) await claim('coach-pm', date);
  let nudge = zoneDue ? coachNudge({ date, hour, zone: state.zone }) : null;
  if (!nudge && (morningDue || eveningDue) && state.status === 'active') {
    const inputs = await loadCoachInputs(env, ctx, internalHeaders(), date);
    const upcoming = await upcomingSessions(env, (inputs.week?.days || []).filter(d => d.date >= date && d.date <= shiftDate(date, 1)));
    const readiness = morningDue ? readinessFor({ date, google: inputs.health?.wellness || [], intervals: inputs.fitness?.wellness || [], sessions: inputs.health?.sleep || [], profile: inputs.profile }) : null;
    nudge = coachNudge({ date, hour, morning: morningDue, evening: eveningDue, upcoming, sleep: inputs.health?.sleep || [],
      illness: morningDue ? illnessWarning({ date, readiness, state, week: inputs.week }) : null,
      recovery: morningDue ? proactiveAdvice({ ...inputs, state }) : null });
  }
  if (!nudge) return { sent: 0, reason: 'nothing-to-say' };
  if (!(await claim(COACH_PUSH, date))) return { sent: 0, reason: 'already-sent' };
  // "Vyměnit" answers this one (/app/api/coach/nudge).
  // Today shows the same offer until it is answered (/app/api/coach/check-in).
  if (nudge.swap) await updateAthleteState(db, { nudge: { ...nudge.swap, title: nudge.title, day: date, status: 'pending' } });
  let sent = 0;
  for (const device of devices) {
    const result = await sendPush(env, device, { title: nudge.title, body: nudge.body }, { category: nudge.swap ? COACH_SWAP_CATEGORY : null, data: { coach: { kind: nudge.kind, date } } }).catch(error => ({ ok: false, error: error.message }));
    if (result.ok) sent++;
    else if (result.gone) await deletePushToken(db, device.token);
    else console.error('Coach push not delivered', result.status || '', result.reason || result.error || '');
  }
  if (!sent) await db.prepare('DELETE FROM push_log WHERE user_id=? AND kind=? AND local_date=?').bind(db.userId, COACH_PUSH, date).run();
  return { sent, kind: nudge.kind };
}

// The ride and run sessions planned on `days` (/app/api/week days), with the
// kind and place of the workout behind each: [{eventId, date, sport, name,
// minutes, kind, environment}].
async function upcomingSessions(env, days) {
  const links = new Map(), upcoming = [];
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const a of (d.daily?.training?.planned || [])) {
      const sport = sportOf(a); if (!['ride', 'run'].includes(sport) || !String(a.id || '').startsWith('planned:')) continue;
      const id = String(a.id).replace(/^planned:/, '');
      const link = links.get(id) ?? await env.DB.prepare('SELECT workout_id,environment FROM workout_schedule_links WHERE user_id=? AND intervals_event_id=? ORDER BY id DESC LIMIT 1').bind(env.USER_ID, id).first().catch(() => null); links.set(id, link);
      const workout = link?.workout_id ? await getWorkout(env.DB, link.workout_id).catch(() => null) : null;
      upcoming.push({ eventId: 'planned:' + id, date: d.date, sport, name: a.name || workout?.name || null, minutes: Math.round((Number(a.durationHours) || Number(workout?.duration_minutes) / 60 || 1) * 60), kind: kindOfSystem(workout?.primary_system || a.name, 'endurance'), environment: link?.environment || (/virtual/i.test(String(a.type || '')) ? 'indoor' : 'outdoor') });
    }
  }
  return upcoming;
}

// A workout of c.kind for c {date, sport, environment, minutes}, from the
// generator: {workoutId, name, minutes, kind}, or null.
async function generateReplacement(env, ctx, c) {
  const generateUrl = new URL('https://internal/app/api/workouts/generate');
  const response = await handleDashboardApi(new Request(generateUrl, { method: 'POST', headers: { Origin: generateUrl.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ date: c.date, sport: c.sport, environment: c.environment, availabilityMinutes: c.minutes, focus: FOCUS_OF[c.kind] || null, userInitiated: true }) }), env, ctx, generateUrl, { signedIn: true }).catch(() => null);
  const g = response ? await response.json().catch(() => null) : null;
  return g?.status === 'ok' && g.workout?.id ? { workoutId: g.workout.id, name: g.workout.name, minutes: Math.round(Number(g.workout.duration_minutes) || c.minutes), kind: kindOfSystem(g.workout.primary_system, c.kind) } : null;
}

// c.to.workoutId on c.date in place of the planned session c.eventId: the new
// event, or null when that session is no longer on that day.
async function replacePlannedSession(env, c) {
  const id = String(c.eventId).replace(/^planned:/, ''), event = await env.DB.prepare("SELECT start_time FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND external_id=?").bind(env.USER_ID, 'planned:' + id).first();
  if (!event || String(event.start_time).slice(0, 10) !== c.date) return null;
  const scheduled = await scheduleWorkoutInIntervals(env, env.DB, { workoutId: c.to.workoutId, date: c.date, confirm: true, environment: c.environment });
  // The same workout already on that day is that event itself: it stays.
  if (String(scheduled.intervalsEventId || '') !== id) await deletePlannedEvent(env, { eventId: id });
  return scheduled;
}

// Load targets of a week: CTL and daily load from Intervals.icu wellness, what
// is done or planned per day from D1, then the shared calculation.
const sportOfType=t=>{t=String(t||'').toLowerCase();return /weight|strength/.test(t)?'gym':/ride|cycl|bike/.test(t)?'ride':/run/.test(t)?'run':null;};
// Intervals.icu nights for a sleep answer, the wellness log cached for 5 minutes
// (an empty or failed answer is not cached, so it is asked again next time).
function intervalsSleep(env,ctx,data,start,end){
  return withIntervalsSleep(env,data,start,end,fetch,(s,e)=>cached(env,ctx,'intervals-wellness:'+s+':'+e,async()=>{
    const wellness=await intervalsWellness(env,s,e);
    if(!wellness.length)throw new Error('no wellness');
    return wellness;
  },{ttl:300}));
}

async function computeWeekTargets(env,ctx,start,prefs){
  // Without prefs (the plan's week, the plan proposal) the saved week plan decides.
  prefs=prefs||await getWeekPlan(env.DB,start);
  const end=shiftDate(start,7),today=localToday();
  const fitness=await cached(env,ctx,'fitness:42',()=>handleDashboardApi(new Request('https://internal/app/api/fitness?days=42'),env,ctx,new URL('https://internal/app/api/fitness?days=42')).then(r=>r.json())).catch(()=>({}));
  const wellness=(fitness.wellness||[]).filter(r=>r.id<=today),ctl=[...wellness].reverse().find(r=>Number(r.ctl)>0)?.ctl;
  const loadOn=date=>{const r=wellness.find(x=>x.id===date);return Number(r?.ctlLoad??r?.atlLoad??r?.load)||0;};
  let lastWeekLoad=0;for(let i=-7;i<0;i++)lastWeekLoad+=loadOn(shiftDate(start,i));
  const rows=(await env.DB.prepare("SELECT data_type,source_family,start_time,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family IN ('intervals','local','wahoo') AND data_type IN ('planned-workout','activity')) OR (source_family IN ('google-wearables','apple-health') AND data_type='exercise')) AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID,shiftDate(start,-1),shiftDate(end,1)).all().catch(()=>({results:[]}))).results||[];
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
  let targets=weekTargets({roles,ctl,lastWeekLoad,weekLoads:weekLoadsBefore(wellness,start),hrvDown:hrvWeekTrendDown(hrvSourceRows(wellness,(await googleHealthFor(env,ctx,today).catch(()=>({})))?.wellness,start),start),rampRate:[...wellness].reverse().find(r=>Number.isFinite(Number(r.rampRate)))?.rampRate??null,days,today,weekStart:start,plan:plan.load,eventDate:plan.plan?null:athleteFocus(await dashboardProfile(env).catch(()=>null),today).event?.date||null});
  // A plan needs its sessions even before there is a fitness history.
  if(plan.plan&&targets.status!=='ok')targets=estimatedTargets(roles,start,today,days);
  return capWeekTargets(capRunVolume(plan.apply(targets),runCap,runCommitted),prefs,[],weather);
}
// Fitness now (CTL), for the plan's estimate and its result.
async function currentCtl(env,ctx){
  const fitness=await cached(env,ctx,'fitness:42',()=>handleDashboardApi(new Request('https://internal/app/api/fitness?days=42'),env,ctx,new URL('https://internal/app/api/fitness?days=42')).then(r=>r.json())).catch(()=>({}));
  const today=localToday(),row=[...(fitness.wellness||[])].reverse().find(r=>r.id<=today&&Number(r.ctl)>0);
  return row?Math.round(Number(row.ctl)):null;
}
// Weekdays (0 = Monday) of a sport in the week plan's days, and the days the athlete chose.
const sportDays=(days,sport)=>(days||[]).map((d,i)=>(d||[]).includes(sport)?i:null).filter(i=>i!=null);
const chosenDays=list=>{const out=[...new Set((Array.isArray(list)?list:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))].sort();return out.length?out:null;};
// The sport on exactly the chosen days of the usual week.
function withSportDays(prefs,sport,chosen){
  const days=Array.from({length:7},(_,i)=>(prefs?.days?.[i]||[]).filter(x=>x!==sport));
  for(const i of chosen)days[i].push(sport);
  return {days,added:[]};
}
// A finished ride or run plan: FTP and fitness at the start and now, the
// sessions and time done against the estimate, each week done in %.
async function planResult(env,ctx,today){
  const plan=await finishedPlan(env.DB,today);
  if(!plan)return null;
  const template=getTemplate(plan.templateId),end=shiftDate(plan.endDate,1);
  const [thresholds,ctl,doneDates,minutes,prefs]=await Promise.all([cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>({})),currentCtl(env,ctx),planSportDates(env,plan.sport,plan.startDate,end).catch(()=>[]),planSportMinutes(env,plan.sport,plan.startDate,end).catch(()=>0),getWeekPlan(env.DB).catch(()=>({}))]);
  const completion=planCompletion(plan,{days:sportDays(prefs.days,plan.sport),doneDates,today:shiftDate(end,1)});
  const next=planTemplates().filter(t=>t.sport===plan.sport&&t.id!==template.id&&!t.race).slice(0,2).map(t=>({id:t.id,name:t.name,goal:t.goal}));
  return {id:plan.id,templateId:template.id,name:template.name,sport:plan.sport,startDate:plan.firstDay||plan.startDate,endDate:plan.endDate,ftpStart:plan.start?.ftp??null,ftpEnd:Number(thresholds.ftp)||null,ctlStart:plan.start?.ctl??null,ctlEnd:ctl,sessionsDone:doneDates.length,sessionsPlanned:plan.start?.sessions??null,minutesDone:Math.round(minutes),minutesPlanned:plan.start?.minutes??null,completion,weeks:templateSummary(template).weeks,next};
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
    app.fetch(new Request('https://internal/health/sleep?start='+from+'&end='+shiftDate(date,1),{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({})).then(d=>intervalsSleep(env,ctx,d,from,shiftDate(date,1))).catch(()=>({})),
    dashboardProfile(env).catch(()=>null),
    readinessCheckin(env.DB,date).catch(()=>null)
  ]);
  const sessions=sleep?.sessions||[];
  const coachTrends=trendFacts({date,wellness:health?.wellness,intervals:fitness?.wellness,sessions,age:profile?.age??null,sleepGoal:profile?.sleepGoal??null});
  const readiness=dayReadiness({date,fitness,health:{...health,sleep:sessions},profile,checkin});
  // Today has its own readiness on screen; the coach adds why (parts) and the athlete's status.
  // Sick, injured or on a break holds the text back on Trénink too (screen-texts.js holdBack).
  const state=await getAthleteState(env.DB).catch(()=>null);
  if(screen==='today')return {...(coachTrends?{coachTrends}:{}),...(readiness?{readinessDetail:readiness}:{}),athleteState:state?.status||null};
  return {...(coachTrends?{coachTrends}:{}),...(readiness?{readiness}:{}),athleteState:state?.status||null};
}
function loadCoachInputs(env,ctx,internalAuth,date){return cached(env,ctx,'coach-inputs:'+date,()=>loadCoachInputsFresh(env,ctx,internalAuth,date));}
// Runs and rides for the coach: six weeks of trends, the Intervals.icu curves
// and the laps of the last two weeks (performance-trends.js).
async function coachPerformance(env,ctx,date){
  const loaded=await loadThresholdSessions(env,ctx,date).catch(()=>null);
  const [curves,intervals]=await Promise.all([
    cached(env,ctx,'curves:'+date,()=>intervalsCurves(env,intervalsAuthorization(env.INTERVALS_API_KEY))).catch(()=>null),
    env.INTERVALS_API_KEY&&loaded?cached(env,ctx,'laps:'+date,()=>recentIntervals(loaded.sessions,date,id=>rideIntervals(env,id))).catch(()=>null):null
  ]);
  const trends=loaded?performanceTrends(loaded.sessions,loaded.athlete,date):null;
  const out={...(trends||{}),...(curves?{curves}:{}),...(intervals?{intervals}:{})};
  return Object.keys(out).length?out:null;
}
// Regenerace on Today (recovery-time.js) from the last days' training and the
// night Today shows; training is null on another day than today.
function withRecoveryTime(today,training){
  if(training)today.recoveryTime=recoveryTime({...training,now:Date.now(),sleep:today.sleep,hrv:today.hrv,restingHR:today.restingHR});
  return today;
}
async function loadCoachInputsFresh(env,ctx,internalAuth,date){
  const monday=iso=>shiftDate(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));
  const start=monday(date),weeks=[shiftDate(start,-7),start,shiftDate(start,7)];
  const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
  const json=r=>r.json().catch(()=>({}));
  const [dailyResponse,fitnessResponse,gymResponse,sleepResponse,health]=await Promise.all([
    app.fetch(new Request('https://internal/analysis/daily?date='+date,{headers:internalAuth}),env,ctx),
    cached(env,ctx,'fitness:90',()=>internal('/app/api/fitness?days=90').then(json)).then(d=>Response.json(d)),internal('/app/api/gym?date='+date),
    // The same 30 nights as Today: one readiness (readiness.js) needs the same inputs.
    app.fetch(new Request('https://internal/health/sleep?start='+shiftDate(date,-30)+'&end='+shiftDate(date,1),{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})).then(d=>intervalsSleep(env,ctx,d,shiftDate(date,-30),shiftDate(date,1))).then(d=>Response.json(d)),
    googleHealthFor(env,ctx,date).catch(()=>({}))
  ]);
  // The three weeks are the heavy part (every day's analysis, food and
  // recommendations). One week at a time, cached and shared by every day of
  // that week, so the database is never asked for all of them at once.
  const weekData=[];
  for(const w of weeks)weekData.push(await cached(env,ctx,'week:'+w,()=>internal('/app/api/week?start='+w).then(json)));
  // Drinks of the day, for the coach's food advice (coach-assistant.js nutritionContext).
  const [daily,fitness,gym,sleep,profile,fluids]=await Promise.all([json(dailyResponse),json(fitnessResponse),json(gymResponse),json(sleepResponse),dashboardProfile(env),internal('/app/api/fluids?date='+date).then(json).catch(()=>null)]);
  applyEnergyBudget(daily,profile,health);
  const checkin=await readinessCheckin(env.DB,date).catch(()=>null);
  // Regenerace of today, as Today shows it (recovery-time.js).
  const training=date===localToday()?await loadTrainingDoses(env.DB).catch(()=>null):null;
  const regeneration=training?withRecoveryTime(buildToday({date,hour:localHour(),health,fitness,sleep,profile:profile||{},checkin}),training).recoveryTime:null;
  return {date,daily,fitness,gym,fluids,health:{...health,sleep:sleep.sessions||[]},week:{status:'ok',days:weekData.flatMap(w=>w.days||[])},focus:athleteFocus(profile,date),profile:profile?{sex:profile.sex,age:profile.age,height:profile.height,sleepGoal:profile.sleepGoal,cycle:profile.cycle||null,...(profile.readinessLocks?{readinessLocks:profile.readinessLocks}:{}),training:await trainingSetup(env.DB)}:null,athleteState:await getAthleteState(env.DB),cycle:profile?.cycle?cycleForCoach({...profile.cycle,date}):null,checkin,recoveryTime:regeneration,journal:await journalForCoach(env.DB,date).catch(()=>null),upcomingTest:await getChecks(env.DB).then(c=>upcomingTest(c,date)).catch(()=>null),performance:await coachPerformance(env,ctx,date)};
}

// Everything the coach's note looks at for one day: 5 weeks of activities
// (to know the usual routine), form, sleep, the day's food and recent feedback.
async function reflectionData(env,ctx,internalAuth,date,workoutId=null){
  const from=shiftDate(date,-35),to=shiftDate(date,1);
  const activityRows=(await env.DB.prepare(`SELECT start_time,end_time,payload_json FROM health_datapoints
    WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<?
      AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time`).bind(env.USER_ID,from,to).all().catch(()=>({results:[]}))).results||[];
  const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
  const [fitness,sleep,food,recentFeedback,workout,profile,watch,checkin,gymSets]=await Promise.all([
    internal('/app/api/fitness?days=42').then(r=>r.json()).catch(()=>({})),
    app.fetch(new Request('https://internal/health/sleep?start='+shiftDate(date,-21)+'&end='+to,{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})).then(d=>intervalsSleep(env,ctx,d,shiftDate(date,-21),to)),
    env.DB.prepare("SELECT consumed_at,recipe_title,kcal,carbs_g FROM food_logs WHERE user_id=? AND consumed_date=? AND (status IS NULL OR status='eaten') ORDER BY consumed_at").bind(env.USER_ID,date).all().then(r=>r.results||[]).catch(()=>[]),
    recentWorkoutFeedback(env.DB,shiftDate(date,-21)),
    workoutId?getWorkout(env.DB,workoutId).catch(()=>null):null,
    dashboardProfile(env).catch(()=>null),
    // HRV and resting HR from the watch, the check-in and the day's gym sets.
    googleHealthFor(env,ctx,date).catch(()=>({})),
    readinessCheckin(env.DB,date).catch(()=>null),
    env.DB.prepare("SELECT exercise,set_no,actual_kg,actual_reps,rpe FROM strength_sets WHERE user_id=? AND workout_date=? AND type='WORK' AND completed=1 ORDER BY id").bind(env.USER_ID,date).all().then(r=>r.results||[]).catch(()=>[])
  ]);
  const wellness=fillWellness(fitness.wellness||[],watch?.wellness||[]);
  const readiness=dayReadiness({date,fitness,health:{...watch,sleep:sleep.sessions||[]},profile,checkin});
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
    wellness,sleep:[...nights.values()],food,recentFeedback,nextDays,focus:athleteFocus(profile,date),athleteState:await getAthleteState(env.DB),
    readiness,gym:gymSets.map(r=>({exercise:r.exercise,set:Number(r.set_no)||null,kg:r.actual_kg,reps:r.actual_reps,rpe:r.rpe}))
  };
}


async function handleDashboardApi(request, env, ctx, url, session = {}) {
  env={...env,INTERFACE_LANGUAGE:lang()};
  const internalAuth = internalHeaders();
  if(url.pathname==='/app/api/athlete-state'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      if(request.method==='GET'){const state=await getAthleteState(env.DB);return Response.json({status:'ok',state,memories:memoryList(state)},{headers:{'Cache-Control':'no-store'}});}
      if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      const body=await request.json();
      // memory adds one by hand, edit {from,to} rewrites one, keep says a passing one still holds.
      const edit=body.edit&&typeof body.edit==='object'?{from:String(body.edit.from??''),to:String(body.edit.to??'')}:null;
      const state=await updateAthleteState(env.DB,{status:body.status,note:body.note,statusUntil:body.statusUntil,forget:body.forget,dismiss:body.dismiss,memory:typeof body.memory==='string'?body.memory:null,edit,keep:typeof body.keep==='string'?body.keep:null,notify:body.notify&&typeof body.notify==='object'?body.notify:null});
      if(body.status!=null)await syncedPlans(env).catch(()=>null);
      // Sick, injured or on a break: the sessions the athlete chose to cancel go too.
      // They are kept in the athlete's state, so the coach knows what to put back.
      let cancelled=0;const gone=[];
      if(state.status!=='active'&&Array.isArray(body.cancel))for(const eventId of body.cancel.slice(0,14))await deletePlannedEvent(env,{eventId}).then(r=>{cancelled++;if(r?.cancelled)gone.push(r.cancelled);}).catch(error=>console.error('Cancel failed',error.message));
      if(gone.length)await updateAthleteState(env.DB,{cancelled:gone}).catch(error=>console.error('Cancelled sessions not kept',error.message));
      return Response.json({status:'ok',state,memories:memoryList(state),cancelled},{headers:{'Cache-Control':'no-store'}});
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
  // Aktivita dne: "Doporučovat méně" for a kind (coach-pick.js setLess).
  if(url.pathname==='/app/api/coach/pick/less'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{const body=await request.json();return Response.json(await setLess(env.DB,env.USER_ID,String(body.kind||''),body.less!==false));}catch(error){return Response.json({message:error.message},{status:400})}
  }
  // Aktivita dne: today's activity from anything the athlete does (coach-pick.js),
  // every option with its workout ready.
  if(url.pathname==='/app/api/coach/pick'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const date=localToday();
    if(request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
      try{const body=await request.json();return Response.json(await savePick(env.DB,env.USER_ID,{date,kind:String(body.kind||''),top:String(body.top||'')}));}catch(error){return Response.json({message:error.message},{status:400})}
    }
    try{
      const [inputs,prefs,plan]=await Promise.all([loadCoachInputs(env,ctx,internalAuth,date),getWeekPlan(env.DB,date).catch(()=>null),planForWeek(env,ctx,mondayOfDate(date)).catch(()=>null)]);
      const week={prefs,plan,targets:prefs?await computeWeekTargets(env,ctx,mondayOfDate(date),prefs).catch(()=>null):null};
      const athlete=await getAthleteState(env.DB).catch(()=>null);
      const [ride,run]=await Promise.all([defaultDayCoach(env,{...inputs,athleteState:athlete},date,'ride',week),defaultDayCoach(env,{...inputs,athleteState:athlete},date,'run',week)]);
      const [profiles,recent,state,gym]=await Promise.all([loadProfiles(env.DB,env.USER_ID).catch(()=>({})),recentKinds(env.DB,env.USER_ID,date),pickState(env.DB,env.USER_ID,date),readGymPlan(env.DB,date).catch(()=>null)]);
      const planned=[...(ride.constraints?.plannedToday&&activityKindOf(ride.constraints.plannedToday.type||ride.constraints.plannedToday.name)==='ride'?['ride']:[]),...(run.constraints?.plannedToday&&activityKindOf(run.constraints.plannedToday.type||run.constraints.plannedToday.name)==='run'?['run']:[]),...((gym?.values||[]).length>7?['gym']:[])];
      // Nemoc, Zranění or Pauza leaves only rest; signs of an illness drop the sauna.
      const illness=illnessSigns(readinessFor({date,google:inputs.health?.wellness||[],intervals:inputs.fitness?.wellness||[],sessions:inputs.health?.sleep||[],profile:inputs.profile})).length>0;
      const ranked=rankOptions({ride,run,mainSport:profiles?.effective?.mainSport||'general',sports:recent.sports,today:recent.today,declines:state.declines,planned,done:recent.done,athleteStatus:athlete?.status||'active',illness});
      // The ready workouts stay while the options do (pickSignature), so a sync
      // that changes nothing asks the AI nothing.
      const signature=pickSignature(ranked);
      let details=await storedDetails(env.DB,env.USER_ID,date,signature).catch(()=>null);
      if(!details){details=await pickDetails(env,ctx,ranked,date,gym);await storeDetails(env.DB,env.USER_ID,date,signature,details).catch(()=>{});}
      const less=await lessKinds(env.DB,env.USER_ID).catch(()=>[]);
      const options=ranked.options.filter(o=>o.best||!less.includes(o.kind)).map(o=>{
        const d=details[o.kind];if(!d)return o;
        const detail=d.minutes?d.minutes+' min'+(o.detail.includes(' · ')?o.detail.slice(o.detail.indexOf(' · ')):''):o.detail;
        return {...o,detail,lines:d.lines,...(d.workout?{workout:d.workout}:{}),...(d.gym?{gym:d.gym}:{})};
      });
      return Response.json({status:'ok',date,...ranked,options,less,chosen:state.chosen},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/coach/check-in'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const date=localToday(),state=await getAthleteState(env.DB),inputs=await loadCoachInputs(env,ctx,internalAuth,date);
      // The signs of an oncoming illness come first, then the general break advice.
      const readiness=readinessFor({date,google:inputs.health?.wellness||[],intervals:inputs.fitness?.wellness||[],sessions:inputs.health?.sleep||[],profile:inputs.profile});
      const advice=swapOffer(state,date)||illnessWarning({date,readiness,state,week:inputs.week})||proactiveAdvice({...inputs,state})||memoryCheck(state,date);
      return Response.json({status:'ok',state,advice},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }
  // The coach's push "… vyměním za lehkou jízdu 60 min?" (coach-push.js):
  // "Vyměnit" puts an easy session in place of the hard one, "Nechat" keeps it.
  if(url.pathname==='/app/api/coach/nudge'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json().catch(()=>({})),state=await getAthleteState(env.DB),nudge=state.nudge;
      if(!['swap','keep'].includes(body.decision))throw new Error(L('Neplatná volba.', 'Invalid choice.'));
      if(!nudge||nudge.day!==body.date||nudge.status!=='pending'||nudge.date<localToday())return Response.json({status:'ok',nudge:nudge||null},{headers:{'Cache-Control':'no-store'}});
      if(body.decision==='keep'){const next={...nudge,status:'kept'};await updateAthleteState(env.DB,{nudge:next});return Response.json({status:'ok',nudge:next},{headers:{'Cache-Control':'no-store'}});}
      assertTrainingAllowed(state);
      const to=await generateReplacement(env,ctx,nudge);
      if(!to)throw new Error(L('Lehčí trénink se nepodařilo připravit.', 'Could not prepare an easier session.'));
      const scheduled=await replacePlannedSession(env,{...nudge,to});
      if(!scheduled)throw new Error(L('Ten trénink už v plánu není.', 'That session is no longer in the plan.'));
      const next={...nudge,status:'swapped',to:{name:to.name,minutes:to.minutes}};
      await updateAthleteState(env.DB,{nudge:next});
      return Response.json({status:'ok',nudge:next},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  if(url.pathname==='/app/api/coach/week'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json(),start=validTrainingDay(body.start)?mondayOfDate(body.start):mondayOfDate(localToday());
      const today=localToday();
      const [prefs,state,inputs]=await Promise.all([getWeekPlan(env.DB,start),getAthleteState(env.DB),loadCoachInputs(env,ctx,internalAuth,today)]);
      if(!inputs.week.days.some(d=>d.date===start)){const extra=await handleDashboardApi(new Request('https://internal/app/api/week?start='+start),env,ctx,new URL('https://internal/app/api/week?start='+start));const data=await extra.json();inputs.week.days.push(...(data.days||[]));}
      const [weather,history]=await Promise.all([weekWeather(prefs.location,start),planningHistory(env,start<localToday()?start:localToday(),28)]),proposal=weekProposal({prefs,state,start,today:localToday(),week:inputs.week,fitness:inputs.fitness,health:inputs.health,focus:inputs.focus,weather,history,plan:await planForWeek(env,ctx,start)});
      // "Vygenerovat tréninky": the week's sessions to prepare. Reviewing the plan is the AI chat's job.
      return Response.json({status:'ok',start,proposal},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  // "Plán týdne → Navrhne AI" (week-ai.js): the AI lays out the week from the
  // same data as the coach, the rules' proposal and the athlete's note; the
  // rules' proposal stands when the AI is not available.
  if(url.pathname==='/app/api/coach/week-ai'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json().catch(()=>({})),today=localToday(),start=validTrainingDay(body.start)?mondayOfDate(body.start):mondayOfDate(today);
      const note=typeof body.note==='string'?body.note.trim().slice(0,500):'',correction=typeof body.correction==='string'?body.correction.trim().slice(0,500):'';
      // "Opravit návrh": the athlete's correction of the AI's previous week.
      const previous=correction&&Array.isArray(body.previous)?body.previous.slice(0,28).filter(x=>validTrainingDay(x?.date)&&WEEK_SPORTS.includes(x?.sport)).map(x=>({date:x.date,sport:x.sport,minutes:Number(x.minutes)||null,environment:x.environment==='indoor'?'indoor':x.sport==='gym'?null:'outdoor',kind:KINDS.includes(x.kind)?x.kind:null})):[];
      const [prefs,state,inputs]=await Promise.all([getWeekPlan(env.DB,start),getAthleteState(env.DB),loadCoachInputs(env,ctx,internalAuth,today)]);
      if(!inputs.week.days.some(d=>d.date===start)){const extra=await handleDashboardApi(new Request('https://internal/app/api/week?start='+start),env,ctx,new URL('https://internal/app/api/week?start='+start));const data=await extra.json();inputs.week={...inputs.week,days:[...inputs.week.days,...(data.days||[])]};}
      const [weather,history,plan]=await Promise.all([weekWeather(prefs.location,start),planningHistory(env,start<today?start:today,28),planForWeek(env,ctx,start)]);
      // The rules see an empty week, so they propose every day the athlete has time for.
      const rules=weekProposal({prefs:{...prefs,days:prefs.days.map(()=>[])},state,start,today,week:inputs.week,fitness:inputs.fitness,health:inputs.health,focus:inputs.focus,weather,history,plan});
      const fallback=rules.items.map(x=>({date:x.date,sport:x.sport==='strength'?'gym':x.sport,minutes:x.minutes,environment:x.sport==='gym'?null:x.environment,kind:null,focus:ROLE_FOCUS[x.role]||null,label:x.label||null,reason:x.reason||null,role:x.role||null,slot:x.slot||0}));
      if(state.status&&state.status!=='active')return Response.json({status:'ok',start,ai:false,summary:null,items:[],warnings:rules.warnings},{headers:{'Cache-Control':'no-store'}});
      const dates=Array.from({length:7},(_,i)=>shiftDate(start,i)),weekDays=inputs.week.days.filter(d=>dates.includes(d.date));
      const usedByDate={},existingSports={},existingSessions=[];
      for(const d of weekDays){const list=sessionsOn(d);if(!list.length)continue;usedByDate[d.date]=list.reduce((n,a)=>n+(Number(a.durationHours)||0)*60,0);existingSports[d.date]=list.map(sportOf);existingSessions.push({date:d.date,sessions:list.map(a=>({sport:sportOf(a),name:a.name||null,minutes:Math.round((Number(a.durationHours)||0)*60)||null,done:(d.daily?.training?.completed||[]).includes(a)}))});}
      const coach=coachContext({...inputs,profile:inputs.profile,focus:inputs.focus,capabilities:await getCapabilities(env.DB).catch(()=>({})),athleteFeedback:await feedbackSince(env,shiftDate(today,-28)),workoutRatings:await recentWorkoutRatings(env.DB,{since:shiftDate(today,-28),limit:12}),
        thresholds:await cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>null),now:localNow()});
      const readiness={score:coach.cyclingCoachV2?.readiness?.score??null,zone:coach.cyclingCoachV2?.readiness?.status||null,tsb:coach.cyclingCoachV2?.readiness?.tsb??null};
      delete coach.methodology;delete coach.cyclingCoachV2;
      const weekdayNames=L(['pondělí','úterý','středa','čtvrtek','pátek','sobota','neděle'],['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
      const facts={start,today,note:note||null,...(correction?{correction,previousProposal:previous}:{}),weekDays:dates.map((d,i)=>({date:d,weekday:weekdayNames[i]})),availabilityByDate:Object.fromEntries(dates.map(d=>[d,availabilityOn(prefs,d).minutes??null])),existingSessions,
        rulesProposal:rules.items.map(x=>({date:x.date,sport:x.sport,minutes:x.minutes,environment:x.environment,role:x.role,label:x.label,...(x.plan?{planSession:x.plan.kind}:{})})),recoveryWeek:Boolean(rules.targets?.recovery),readiness,
        weather:Object.fromEntries(Object.entries(weather||{}).map(([d,w])=>[d,{max:w.max,rain:w.rain,wind:w.wind}])),
        trainingPlan:plan.pw?{name:plan.pw.template?.name||null,week:plan.pw.week,weeks:plan.pw.weeks,phase:plan.pw.spec?.phase||null}:null,coach,
        preferenceMemory:state.memories?.length?state.memories:undefined};
      try{
        // Hard sessions the AI doesn't plan: in the calendar or done from the day before the week on.
        const fixedHard=inputs.week.days.filter(d=>d.date>=shiftDate(start,-1)&&d.date<=shiftDate(start,7)).flatMap(d=>[...(d.daily?.training?.planned||[]),...(d.daily?.training?.completed||[])].filter(a=>['ride','run'].includes(sportOf(a))&&HARD_KINDS.has(kindOfSystem(a.name||a.type,'endurance'))).map(()=>d.date));
        const r=await proposeWeekAI(env,facts,{prefs,focus:inputs.focus,usedByDate,existingSports,planDays:rules.items.filter(x=>x.plan),fixedHard});
        return Response.json({status:'ok',start,ai:true,summary:r.summary,items:r.items,warnings:rules.warnings},{headers:{'Cache-Control':'no-store'}});
      }catch(error){
        if(!error?.ai&&!/AI|souhlas|consent/i.test(String(error?.message||'')))console.error('Week AI failed',error?.message||error);
        return Response.json({status:'ok',start,ai:false,summary:null,items:fallback,warnings:rules.warnings,message:L('AI teď není dostupná, návrh je podle pravidel aplikace.', 'AI isn\'t available right now; the proposal follows the app\'s rules.')},{headers:{'Cache-Control':'no-store'}});
      }
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  // "Upravit s AI" in a session's detail (week-ai.js): a chip is a rule, a
  // sentence goes to the AI. Answers the session's new day, length, place and kind.
  if(url.pathname==='/app/api/workouts/adjust'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const body=await request.json().catch(()=>({})),today=localToday();
      const sport=WEEK_SPORTS.includes(body.sport)?body.sport:null,date=validTrainingDay(body.date)?body.date:null;
      if(!sport||!date)throw new Error(L('Neplatný trénink.', 'Invalid workout.'));
      const current={date,sport,minutes:Number(body.minutes)||60,environment:body.environment==='indoor'?'indoor':'outdoor',kind:sport==='gym'?'gym':KINDS.includes(body.kind)?body.kind:kindOfSystem(body.system)};
      let changed;
      if(['shorter','easier','harder','indoor','outdoor'].includes(body.chip))changed={...adjustByChip(current,body.chip),note:null};
      else{
        const text=typeof body.text==='string'?body.text.trim():'';
        if(!text)throw new Error(L('Napiš, co změnit.', 'Write what to change.'));
        const start=mondayOfDate(date),prefs=await getWeekPlan(env.DB,start);
        const weekDays=Array.from({length:7},(_,i)=>shiftDate(start,i)).filter(d=>d>=today);
        const others=(Array.isArray(body.others)?body.others:[]).slice(0,20).filter(o=>validTrainingDay(o?.date)).map(o=>({date:o.date,sport:String(o.sport||''),kind:KINDS.includes(o.kind)?o.kind:kindOfSystem(o.system),minutes:Math.max(0,Math.min(600,Math.round(Number(o.minutes)||0)))||null}));
        const readiness=await todayReadiness(env,ctx,today).catch(()=>null);
        try{changed=await adjustByText(env,{session:current,request:text,weekDays,availabilityByDate:Object.fromEntries(weekDays.map(d=>[d,availabilityOn(prefs,d).minutes??null])),otherSessions:others,readiness:{score:readiness?.score??null,zone:readiness?.zone||null},prefs,today,preferenceMemory:(await getAthleteState(env.DB).catch(()=>({}))).memories||[]});}
        catch(error){return Response.json({status:'unavailable',message:error?.ai?error.message:L('AI teď není dostupná. Použij rychlé volby.', 'AI isn\'t available right now. Use the quick options.')},{status:503});}
      }
      return Response.json({status:'ok',session:{...changed,focus:FOCUS_OF[changed.kind]||null}},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  // "Revize po tréninku" (week-revision.js): after a finished ride or run the
  // coach proposes changes to the next sessions; GET builds it once per new
  // session or rating, POST applies it ("Upravit") or keeps the plan ("Nechat").
  if(url.pathname==='/app/api/coach/revision'&&['GET','POST'].includes(request.method)){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{
      const today=localToday();
      if(request.method==='POST'){
        const body=await request.json().catch(()=>({})),date=[today,shiftDate(today,-1)].includes(body.date)?body.date:null;
        if(!date||!['apply','keep'].includes(body.decision))throw new Error(L('Tahle revize už neplatí.', 'This review has expired.'));
        const stored=await readRevision(env.DB,date);
        if(!stored||stored.status!=='pending')return Response.json({status:'ok',revision:stored},{headers:{'Cache-Control':'no-store'}});
        if(body.decision==='keep'){await decideRevision(env.DB,date,'kept');return Response.json({status:'ok',revision:{...stored,status:'kept'}},{headers:{'Cache-Control':'no-store'}});}
        assertTrainingAllowed(await getAthleteState(env.DB));
        const changes=[];
        for(const c of stored.changes||[]){
          if(c.date<today||!c.to?.workoutId){changes.push({...c,applied:false});continue;}
          try{
            const scheduled=await replacePlannedSession(env,c);
            changes.push({...c,applied:Boolean(scheduled),newEventId:scheduled?.eventId||null});
          }catch(error){console.error('Revision change failed',error.message);changes.push({...c,applied:false});}
        }
        const revision={...stored,changes,status:'applied'};
        await decideRevision(env.DB,date,'applied',{summary:stored.summary,changes,source:stored.source});
        return Response.json({status:'ok',revision},{headers:{'Cache-Control':'no-store'}});
      }
      // Sick, injured or on a break: no review that would plan sessions the
      // status pauses ("Upravit" would be refused by assertTrainingAllowed).
      const athlete=await getAthleteState(env.DB).catch(()=>null);
      if(athlete?.status&&athlete.status!=='active')return Response.json({status:'ok',revision:null},{headers:{'Cache-Control':'no-store'}});
      const inputs=await loadCoachInputs(env,ctx,internalAuth,today),days=inputs.week?.days||[];
      const doneOn=d=>(days.find(x=>x.date===d)?.daily?.training?.completed||[]).filter(a=>['ride','run'].includes(sportOf(a)));
      // Today's sessions, else yesterday's when its revision still waits.
      let date=today,done=doneOn(today);
      if(!done.length){const y=shiftDate(today,-1),stored=await readRevision(env.DB,y);if(stored?.status==='pending')return Response.json({status:'ok',revision:shownRevision(stored,{today})},{headers:{'Cache-Control':'no-store'}});date=y;done=doneOn(y);if(!done.length||stored)return Response.json({status:'ok',revision:null},{headers:{'Cache-Control':'no-store'}});}
      const feedback=(await recentWorkoutFeedback(env.DB,date).catch(()=>[])).filter(f=>f.date===date);
      // The effort given anywhere counts, not only on a library workout: the
      // "Jak to šlo?" rating (coach_reflections) and the RPE in Intervals.icu.
      for(const r of await listReflections(env.DB,{date}).catch(()=>[]))if((r.rpe!=null||r.notes)&&!feedback.some(f=>r.workoutId&&f.workoutId===r.workoutId))feedback.push({date,workoutId:r.workoutId||null,name:null,system:null,sport:null,rpe:r.rpe,notes:r.notes||null,completedPercent:null});
      for(const a of done){const rpe=Number(a.rpe??a.payload?.icu_rpe??a.payload?.perceived_exertion);if(rpe>0&&!feedback.some(f=>f.rpe!=null))feedback.push({date,workoutId:null,name:a.name||null,system:null,sport:sportOf(a),rpe,notes:null,completedPercent:null});}
      // "Sedělo ti sestavení tréninku?" of the day's rides and runs: a "Nesedělo" is never "went to plan".
      const planFit=(await workoutRatings(env.DB,date).catch(()=>[])).filter(r=>['ride','run'].includes(r.sport)).map(r=>({sport:r.sport,rating:r.rating,text:r.text||null}));
      const signature=revisionSignature(done,feedback,planFit),stored=await readRevision(env.DB,date);
      // A decided revision stays decided; a waiting one is redone when a new session or rating came.
      if(stored&&(stored.signature===signature||stored.status!=='pending'))return Response.json({status:'ok',revision:shownRevision(stored,{today})},{headers:{'Cache-Control':'no-store'}});
      const upcoming=await upcomingSessions(env,days.filter(x=>x.date>date&&x.date>=today&&x.date<=shiftDate(date,6)));
      // The kind of a done session: its library workout, else its name, else its intensity (IF).
      const doneKind=(a,f)=>{if(f?.system)return kindOfSystem(f.system);const named=kindOfSystem(a.name,'');if(named&&named!=='endurance')return named;const p=a.payload||{},raw=Number(a.intensityFactor??p.icu_intensity),fi=raw>3?raw/100:raw;return fi>=.88?'threshold':fi>=.8?'tempo':fi>0?'endurance':named||null;};
      const doneFacts=done.map(a=>{const f=feedback.find(x=>x.system&&sportOf({type:x.sport})===sportOf(a))||feedback.find(x=>x.system);return {date,sport:sportOf(a),name:a.name||null,minutes:Math.round((Number(a.durationHours)||0)*60)||null,tss:Number(a.tss)||null,kind:doneKind(a,f)};});
      const readiness=await todayReadiness(env,ctx,today).catch(()=>null);
      const reviews=await rideReviewsForCoach(env,ctx,days.find(x=>x.date===date)?.daily?.training,date,inputs.fitness?.wellness).catch(()=>[]);
      const plans=new Map();const availabilityByDate={};
      for(const u of upcoming){const w=mondayOfDate(u.date);if(!plans.has(w))plans.set(w,await getWeekPlan(env.DB,w).catch(()=>null));const p=plans.get(w);availabilityByDate[u.date]=p?availabilityOn(p,u.date).minutes??null:null;}
      const facts={date,today,done:doneFacts,feedback:feedback.map(f=>({name:f.name,rpe:f.rpe,notes:f.notes,completedPercent:f.completedPercent})),planFit,reviews:reviews.map(r=>({name:r.name,plan:r.plan,verdict:r.verdict,findings:r.findings})),readiness:{score:readiness?.score??null,zone:readiness?.zone||null},upcoming,availabilityByDate,...(athlete?.memories?.length?{preferenceMemory:athlete.memories}:{})};
      const r=upcoming.length?await reviseWeek(env,facts,{focus:inputs.focus}):{...rulesRevision({...facts,upcoming:[]}),source:'rules'};
      // Each change gets its workout now, so the card shows what replaces what.
      const changes=[];
      for(const c of r.changes||[]){
        const to=await generateReplacement(env,ctx,c);
        // The card shows the workout that was really built; a reason written for another kind goes.
        if(to)changes.push({...c,kind:to.kind,reason:to.kind===c.kind?c.reason:null,to});
      }
      // Changes that couldn't be built leave no promise behind in the summary.
      const summary=(r.changes||[]).length&&!changes.length?rulesRevision({...facts,upcoming:[]}).summary:r.summary;
      const revision=await saveRevision(env.DB,{date,signature,revision:{summary,changes,source:r.source}});
      return Response.json({status:'ok',revision},{headers:{'Cache-Control':'no-store'}});
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
  // The heart rate and calories of a window, before a typed-in workout is saved.
  if(url.pathname==='/app/api/workouts/manual/heart-rate'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const [weight,profile]=await Promise.all([latestStoredWeight(env.DB,env.USER_ID).catch(()=>null),dashboardProfile(env).catch(()=>({}))]);
    const window={start:url.searchParams.get('start'),end:url.searchParams.get('end')};
    const [found,watch]=await Promise.all([heartRateWindow(env.DB,env.USER_ID,{...window,weightKg:weight?.value_numeric,profile}).catch(()=>null),watchWorkoutIn(env.DB,env.USER_ID,window).catch(()=>null)]);
    // The watch's record of that window: the app offers to pair with it.
    return Response.json({status:'ok',heartRate:found&&found.avgHr!=null?found:null,watch,weightKg:weight?.value_numeric??null,age:profile?.age??null,sex:profile?.sex||null},{headers:{'Cache-Control':'no-store'}});
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
      // Done with a start time (Zapsat trénink): the heart rate of that window,
      // from the phone (Apple Health) or the Google Health samples kept here.
      const time=/^\d{2}:\d{2}$/.test(String(body.time||''))?String(body.time):'12:00';
      let heart=null;
      if(completed&&body.start&&body.end){
        const sent=[body.avgHr,body.maxHr,body.kcal].map(v=>Number.isFinite(Number(v))&&Number(v)>0?Math.round(Number(v)):null);
        heart=sent[0]!=null?{avgHr:sent[0],maxHr:sent[1],kcal:sent[2]}:null;
        if(!heart||heart.kcal==null){const [weight,profile]=await Promise.all([latestStoredWeight(env.DB,env.USER_ID).catch(()=>null),dashboardProfile(env).catch(()=>({}))]);const found=await heartRateWindow(env.DB,env.USER_ID,{start:body.start,end:body.end,weightKg:weight?.value_numeric,profile}).catch(()=>null);heart=heart?{...heart,kcal:heart.kcal??(found?.kcalSource==='energy'?found.kcal:heartRateKcal({avgHr:heart.avgHr,minutes,weightKg:weight?.value_numeric,age:profile?.age,sex:profile?.sex}))}:found?.avgHr!=null?found:null;}
      }
      const event={external_id:'manual:'+requestId,category:'WORKOUT',name,type,start_date_local:date+'T'+time+':00',moving_time:minutes*60,description:String(body.notes||'').slice(0,1000)};
      // Paired with the watch's record: the watch already put it in Apple or
      // Google Health (and on from there), so nothing more is sent.
      let pairedWith=null;
      if(completed&&body.pairWith&&body.start&&body.end){const watch=await watchWorkoutIn(env.DB,env.USER_ID,{start:body.start,end:body.end}).catch(()=>null);pairedWith=watch&&watch.source+':'+watch.id===String(body.pairWith)?String(body.pairWith):null;if(!pairedWith)throw new Error(L('Záznam z hodinek se nenašel.', 'The watch\'s record wasn\'t found.'));}
      const saved=await storeLocalEvent(env.DB,event);if(completed)await completeLocalWorkout(env.DB,saved.id,{minutes,rpe:body.rpe,notes:body.notes,avgHr:heart?.avgHr,maxHr:heart?.maxHr,kcal:heart?.kcal,pairedWith});
      if(!completed)return Response.json({status:'ok',eventId:'planned:'+saved.id,sync:await syncLocalWorkout(env,saved.id)});
      if(pairedWith)return Response.json({status:'ok',eventId:'planned:'+saved.id,sync:{status:'not_exported'},pairedWith,sends:[]});
      // Done: to every destination the user sends activities to (Synchronizace).
      const sent=await sendActivity(env,{key:'manual:'+saved.id,sport:body.sport,name,date,minutes,notes:body.notes,rpe:body.rpe,start:body.start},{googleToken}).catch(error=>{console.error('Activity send failed',error.message);return {key:'manual:'+saved.id,sends:[]};});
      return Response.json({status:'ok',eventId:'planned:'+saved.id,sync:{status:'not_exported'},activityKey:sent.key,sends:sent.sends});
    }catch(error){return Response.json({message:error.message},{status:400});}
  }
  {const r=await handleSyncApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  if (url.pathname.startsWith("/app/api/admin/")) return handleAdminApi(request, env, url, session, ctx);
  // Connections are optional: without them the dashboard works from manual
  // entries (weight, food) and the profile; missingProviders drives the
  // connection prompt in the client.
  {const r=await handleGymToolsApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  {const r=await handleWorkoutTemplatesApi(request,env,url,session);if(r!==undefined)return r;}
  if(url.pathname==='/app/api/sync/recent'&&request.method==='POST')return legacyHealthApi.fetch(new Request('https://internal/sync/google/recent',{method:'POST',headers:internalAuth}),env,ctx);
  if(url.pathname==='/app/api/profile'){await env.DB.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY (user_id,id))").run();if(request.method==='POST'){const profile=normalizeProfile(await request.json().catch(()=>({})));await env.DB.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(env.USER_ID,JSON.stringify(profile)).run();return Response.json({status:'ok',profile});}const r=await env.DB.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1').bind(env.USER_ID).first();const suggestions=await refreshSuggestions(env,{googleToken}).catch(error=>{console.error('Profile suggestions failed',error.message);return null;});return Response.json({profile:r?JSON.parse(r.profile_json):null,suggestions});}
  {const r=await handleTrainingEditsApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  // "Revize dne": the coach checks one planned day in the context of the week.
  if(url.pathname==='/app/api/coach/review'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:L('AI teď není dostupná. Zkus to později.', 'AI isn\'t available right now. Try again later.')},{status:503});
    try{
      const body=await request.json().catch(()=>({})),date=/^\d{4}-\d{2}-\d{2}$/.test(String(body.date||''))?body.date:localToday();
      const [inputs,gym,prefs,feedback,notes]=await Promise.all([loadCoachInputs(env,ctx,internalAuth,date),readGymPlan(env.DB,date).catch(()=>null),getWeekPlan(env.DB,date).catch(()=>null),recentWorkoutFeedback(env.DB,shiftDate(date,-21)).catch(()=>[]),listReflections(env.DB,{limit:3}).catch(()=>[])]);
      const gymRows=gym?.stored?parseStrengthPlan(gym.values).rows||[]:[];
      // The recovery model's readiness of the reviewed day, or today's for a day ahead (the inputs are already loaded and cached).
      const readinessDate=date<localToday()?date:localToday();
      const readiness=dayReadiness({date:readinessDate,fitness:inputs.fitness,health:inputs.health,profile:inputs.profile,checkin:readinessDate===date?inputs.checkin:await readinessCheckin(env.DB,readinessDate).catch(()=>null)});
      const input=buildReviewInput({date,today:localToday(),week:inputs.week,fitness:inputs.fitness,health:inputs.health,gymRows,roles:prefs?planWeekRoles(prefs.days):[],feedback,coachNotes:notes.map(r=>({date:r.date,text:r.text})),readiness});
      const state=await getAthleteState(env.DB);Object.assign(input,{athleteState:state.status,statusNote:state.note,preferenceMemory:state.memories,availability:availabilityOn(prefs,date),...(inputs.cycle?{cycle:inputs.cycle}:{}),...(inputs.upcomingTest?{upcomingTest:inputs.upcomingTest}:{})});
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
        app.fetch(new Request('https://internal/health/sleep?start='+from+'&end='+shiftDate(today,1),{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})).then(d=>intervalsSleep(env,ctx,d,from,shiftDate(today,1)))
      ]);
      return Response.json(await loadRecoveryValidation(env.DB,{today,days,intervalsWellness:fitness.wellness||[],sleepSessions:sleep.sessions||[]}),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/fitness-insights'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{return Response.json(await loadFitnessInsights(env.DB,localToday()),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // Trénink → Svaly: how tired each muscle is and when it is rested (src/muscle-fatigue.js).
  // Svaly → one muscle: strength over 8 weeks and how often (src/muscle-detail.js).
  if(url.pathname==='/app/api/muscles/detail'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{const r=await loadMuscleDetail(env.DB,url.searchParams.get('id')||'');return Response.json(r,{status:r.status==='ok'?200:400,headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // Svaly's 3D figure, the file the app keeps (src/muscle-model.js).
  if(url.pathname==='/app/api/muscles/model'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    return muscleModelResponse(env,request,url.searchParams.get('v')||'');
  }
  if(url.pathname==='/app/api/muscles'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{return Response.json(await loadMuscleFatigue(env.DB),{headers:{'Cache-Control':'no-store'}});}
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
  // Training plans (training-plans.js): the plans to choose from, the active
  // one with how much of each past week was done, and a finished plan's result.
  // POST {action:'start',templateId,startDate?,days?,raceDate?,raceKm?}, {action:'stop'},
  // {action:'edit',date,op,to?,minutes?}, {action:'weekDays',days}, {action:'reschedule',startDate},
  // {action:'close',id} (the result seen), {action:'proposal'|'undo'}.
  if(url.pathname==='/app/api/plans'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const today=localToday();let started=null;
      if(request.method==='POST'){
        if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
        const body=await request.json().catch(()=>({}));
        const current=async()=>{const plan=(await syncedPlans(env,today)).active;if(!plan)throw new Error(L('Nemáš aktivní plán.', 'You have no active plan.'));return plan;};
        if(body.action==='stop')await stopPlan(env.DB,{gym:body.sport==='gym'});
        // The answer to the plan's proposal (planProposal), and undoing it.
        else if(body.action==='proposal'||body.action==='undo'){
          const plan=await current();
          if(body.action==='undo')await savePlanState(env.DB,planUndo(plan));
          else{
            const proposal=plan.proposal||(await planProposal(env,ctx))?.raw;
            if(!proposal)throw new Error(L('Plán se mezitím změnil.', 'The plan changed in the meantime.'));
            const choice=String(body.choice||'keep');
            await savePlanState(env.DB,planChoice(plan,proposal,choice==='pick'?'move':choice,{today,date:body.date?String(body.date):null}));
          }
        }
        else if(body.action==='edit')await savePlanState(env.DB,planEdit(await current(),{date:String(body.date||''),op:String(body.op||''),to:body.to?String(body.to):null,minutes:body.minutes},today));
        else if(body.action==='weekDays')await savePlanState(env.DB,planWeekDays(await current(),mondayOfDate(today),body.days==null?null:body.days));
        else if(body.action==='reschedule'){
          const plan=await current(),template=getTemplate(plan.templateId);
          if(template.race)throw new Error(L('Plán k závodu se řídí datem závodu.', 'A race plan follows the race date.'));
          const when=planStart(template,{today,startDate:String(body.startDate||'')});
          await savePlanState(env.DB,{...plan,startDate:when.startDate,firstDay:when.firstDay||null,edits:null,weekDays:null,moves:null,lightWeeks:null,shiftedWeeks:null,proposal:null,undo:null,reviewed:null});
        }
        else if(body.action==='close')await closePlanResult(env.DB,body.id);
        else if(body.action==='start'){
          const template=getTemplate(String(body.templateId||''));
          if(!template)throw new Error(L('Neznámý plán.', 'Unknown plan.'));
          const when=planStart(template,{today,raceDate:body.raceDate?String(body.raceDate):null,startDate:!template.race&&body.startDate?String(body.startDate):null});
          // The days the athlete chose for the sport, or (too few days in the usual week) the freest days added.
          const prefs=await getWeekPlan(env.DB),chosen=chosenDays(body.days);
          const need=chosen&&template.sport!=='gym'?withSportDays(prefs,template.sport,chosen):planDays(template,prefs);
          if(need.added.length||chosen)await saveWeekPlan(env.DB,{...prefs,days:need.days});
          // What the result compares with at the end: FTP, fitness and the estimate now.
          const [thresholds,ctl]=await Promise.all([cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>({})),currentCtl(env,ctx)]);
          const estimate=planPreview(template,{ctl,days:sportDays(need.days,template.sport),firstDay:when.firstDay,startDate:when.startDate,availability:prefs.availability});
          await startPlan(env.DB,{templateId:template.id,startDate:when.startDate,raceDate:when.raceDate,raceKm:body.raceKm,state:{firstDay:when.firstDay||null,start:{ftp:Number(thresholds.ftp)||null,ctl:ctl??null,sessions:estimate.totals.sessions,minutes:estimate.totals.minutes}}});
          started={firstWeek:when.firstWeek,addedDays:chosen?[]:need.added};
        }
        else throw new Error(L('Neznámá akce.', 'Unknown action.'));
      }
      else if(request.method!=='GET')return Response.json({message:'Method not allowed'},{status:405});
      const {active,gym}=await syncedPlans(env,today);
      let summary=active?planSummary(active,today):null,finished=null;
      if(summary?.started){
        const prefs=await getWeekPlan(env.DB).catch(()=>({}));
        summary.completion=planCompletion(active,{days:sportDays(prefs.days,active.sport),doneDates:await planSportDates(env,active.sport,active.startDate,mondayOfDate(today)).catch(()=>[]),today});
      }
      if(!active)finished=await planResult(env,ctx,today).catch(error=>{console.error('Plan result failed',error.message);return null;});
      return Response.json({status:'ok',templates:planTemplates().map(templateSummary),active:summary,activeGym:gym?planSummary(gym,today):null,...(finished?{finished}:{}),...(started?{started}:{})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // What a plan will look like before it starts: its weeks with sessions and
  // time, and the totals (training-plans.js planPreview).
  // GET ?templateId=&startDate=&days=1,3,5,6&raceDate=
  if(url.pathname==='/app/api/plans/preview'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const today=localToday(),raceDate=url.searchParams.get('raceDate'),startDate=url.searchParams.get('startDate');
      // ?active=1: the running plan's weeks (its start, its days).
      const running=url.searchParams.get('active')==='1'?(await syncedPlans(env,today)).active:null;
      const template=getTemplate(running?running.templateId:String(url.searchParams.get('templateId')||''));
      if(!template)throw new Error(L('Neznámý plán.', 'Unknown plan.'));
      const when=running?{startDate:running.startDate,firstDay:running.firstDay||null,firstWeek:1,raceDate:running.raceDate}:planStart(template,{today,raceDate:template.race&&raceDate?raceDate:null,startDate:!template.race&&startDate?startDate:null});
      const prefs=await getWeekPlan(env.DB),chosen=chosenDays(url.searchParams.get('days')?.split(','));
      const days=chosen||sportDays(planDays(template,prefs).days,template.sport);
      const preview=planPreview(template,{ctl:await currentCtl(env,ctx),days,firstDay:when.firstDay,startDate:when.startDate,availability:prefs.availability});
      return Response.json({status:'ok',...preview,firstWeek:when.firstWeek,raceDate:when.raceDate},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // One week of the active ride or run plan: its sessions with their steps,
  // which are done and which can still be changed (GET ?week=N).
  if(url.pathname==='/app/api/plans/week'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    try{
      const today=localToday(),plan=(await syncedPlans(env)).active,n=Number(url.searchParams.get('week'));
      if(!plan)throw new Error(L('Nemáš aktivní plán.', 'You have no active plan.'));
      const monday=shiftDate(plan.startDate,(Math.max(1,Math.round(n)||1)-1)*7),pw=planWeek(plan,monday);
      if(!pw)throw new Error(L('Tento týden v plánu není.', 'This week is not in the plan.'));
      const [targets,thresholds,doneDates]=await Promise.all([
        computeWeekTargets(env,ctx,monday).catch(()=>({items:[]})),
        cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>({})),
        planSportDates(env,plan.sport,monday,shiftDate(monday,7)).catch(()=>[])
      ]);
      const done=new Set(doneDates),sessions=[];
      for(const x of (targets.items||[]).filter(x=>x.sport===plan.sport&&(x.slot||0)===0&&x.plan?.workoutId)){
        const library=await getWorkout(env.DB,x.plan.workoutId).catch(()=>null);
        let workout=null;
        if(library){
          const w=renderForEnvironment(library,'outdoor');let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}
          w.steps=plan.sport==='run'?stepRows(structure,{environment:w.environment,sport:'run',thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones,hrZones:thresholds.runHrZones?.length?thresholds.runHrZones:thresholds.hrZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones,hrZones:thresholds.hrZones});
          workout={id:w.id,name:planName(w.name),sport:w.sport,environment:w.environment,duration_minutes:w.duration_minutes,target_load:w.target_load,intensity_factor:w.intensity_factor,description:w.description,steps:w.steps};
        }
        sessions.push({date:x.date,label:planName(x.label),kind:x.plan.kind,minutes:x.minutes,workoutId:x.plan.workoutId,workout,done:done.has(x.date),editable:x.date>=today&&!done.has(x.date),edited:Boolean(plan.edits?.[x.plan.movedFrom||x.date])});
      }
      return Response.json({status:'ok',week:pw.week,weeksCount:pw.weeks,monday,phaseLabel:pw.spec.gym?.name??phaseLabel(pw.spec.phase,plan.sport),sessions,weekDays:plan.weekDays?.[monday]??null},{headers:{'Cache-Control':'no-store'}});
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
    if(!env.OPENAI_API_KEY){if(!memory)return Response.json({status:'unavailable',message:L('AI teď není dostupná. Zkus to později.', 'AI isn\'t available right now. Try again later.')},{status:503});await saveMemory();return Response.json({status:'ok',answer:L('Zapamatoval jsem si: ','I\'ll remember: ')+memory,memorySaved:memory,chatId:await remember('Zapamatoval jsem si: '+memory)});}
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
        coachCtx=coachContext({...inputs,availabilityMinutes,manualReadiness,goal,preferences,capabilities,athleteFeedback,coachNotes,athleteState,workoutRatings:await recentWorkoutRatings(env.DB,{since:shiftDate(date,-28),limit:12}),thresholds,profile:inputs.profile,focus,sport:engineSport(focus,selected.appContext,message),now:localNow(),availabilityByDate:safety.availabilityByDate});
        Object.assign(coachCtx,{availability:prefs.availability,weeklyActivities:prefs.weeklyActivities,weather:{...(prefs.weather||{}),...openWeekWeather},coachProposals:earlierProposals},safety);
        // The active plan's sessions this week, the days the generator will follow.
        const targets=await computeWeekTargets(env,ctx,thisWeek,prefs).catch(()=>null);
        if(targets?.plan)coachCtx.trainingPlan={name:targets.plan.name,week:targets.plan.week,weeks:targets.plan.weeks,phase:targets.plan.phaseLabel||targets.plan.phase,sessions:(targets.items||[]).filter(x=>x.plan).map(x=>({date:x.date,sport:x.sport,kind:x.plan.kind,label:x.label,minutes:x.minutes}))};
        Object.assign(coachCtx,{appContext:selected.appContext,selectedGym:selected.selectedGym,selectedDay:selected.selectedDay,selectedWeek:selected.selectedWeek});
        const reviewDay=selected.appContext.date<=date&&selected.selectedDay?selected.appContext.date:date;
        const reviews=await rideReviewsForCoach(env,ctx,reviewDay===date?inputs.daily?.training:selected.selectedDay,reviewDay,inputs.fitness?.wellness,thresholds).catch(()=>[]);
        if(reviews.length)coachCtx.completedRideReviews=reviews;
        if(blockHistory)Object.assign(coachCtx,{blockHistory,blockFitness:inputs.fitness.wellness||[],historyPeriod:{from:shiftDate(date,-84),to:date,source:'cached activities; missing records remain unknown'}});
      }else focus=await dashboardProfile(env).then(profile=>athleteFocus(profile,date)).catch(()=>null);
      Object.assign(coachCtx,{userInitiated:true,athleteState:athleteState.status,statusNote:athleteState.note,statusUntil:athleteState.statusUntil,...(athleteState.cancelled?.length?{cancelledSessions:athleteState.cancelled}:{}),preferenceMemory:memory?[...new Set([...(athleteState.memories||[]),memory])]:athleteState.memories,conversation});
      const sport=engineSport(focus,selected?.appContext||appContext,message);
      // The library offer is for the day, length and kind the message asks
      // for (chat-ask.js; Revize doporučování tréninků 2026-10-16, nález 9).
      const libraryAsk=chatLibraryQuery({message,date,inputs,sport,todayCoach:coachCtx.cyclingCoachV2,availabilityMinutes});
      const library=task==='planning'||task==='block'?athleteState.status==='active'?await searchWorkoutLibrary(env.DB,libraryAsk.query,libraryAsk.filters):{workouts:[]}:{workouts:[]};
      coachCtx.workoutLibraryRecommendations=(library.workouts||[]).map(w=>({id:w.id,name:w.name,sport:w.sport||sport,source:w.source_name,sourceKind:w.source_kind,system:w.primary_system,durationMinutes:w.duration_minutes,targetLoad:w.target_load,difficulty:w.difficulty,suitability:w.suitability,challengeGap:w.challenge_gap,structure:w.intervals_description,reasons:w.reasons}));
      const contextMs=Date.now()-started,answer=await askCoach(env,message,coachCtx,{focus,actions:true,task,onAnswer});
      onProgress(L('Kontroluji návrhy pro aplikaci…', 'Checking the proposals for the app…'));
      coachCtx.userMessage=message;coachCtx.appContext=coachCtx.appContext||appContext;coachCtx.gymPlan=appContext.sport==='gym'?selected?.gymPlan:inputs.gym;
      const actions=validateCoachActions(answer.actions,coachCtx,date,{userInitiated:true}),proposals=[];await ensureCoachInboxTable(env.DB);
      // A proposed workout is prepared right away, so the chat shows it (profile,
      // exercises) and confirming plans exactly this one.
      for(const a of actions)if(a.type==='workout'){onProgress(L('Připravuji náhled tréninku…', 'Preparing the workout preview…'));a.preview=await workoutPreview(env,ctx,a).catch(error=>{console.error('Workout preview failed',error.message);return null;});}
      // A proposal the checks dropped leaves no "below is the workout" without a card.
      const dropped=(Array.isArray(answer.actions)?answer.actions.length:0)-actions.length;
      if(dropped>0)answer.answer=String(answer.answer||'').trimEnd()+L('\n\n'+(dropped===1?'Jeden návrh':'Některé návrhy')+' neprošl'+(dropped===1?'':'y')+' kontrolou aplikace (den, délka, sport nebo stav), proto tu chybí. Napiš, co upravit, a připravím nový.','\n\n'+(dropped===1?'One proposal':'Some proposals')+' didn\'t pass the app\'s checks (day, length, sport or status), so '+(dropped===1?'it is':'they are')+' missing here. Tell me what to change and I\'ll prepare a new one.');
      await saveMemory();
      // What the answer says no longer holds is forgotten or rewritten; the app shows it with Zpět.
      const changes=memoryChanges(answer.memory,athleteState.memories);
      for(const text of changes.forgotten)await updateAthleteState(env.DB,{forget:text}).catch(error=>console.error('Memory forget failed',error.message));
      for(const u of changes.updated)await updateAthleteState(env.DB,{edit:u}).catch(error=>console.error('Memory edit failed',error.message));
      // The chat keeps a one-line summary of the proposals, so later turns can refer to them.
      const note=actionsNote(actions),chatId=await remember(answer.answer+(note?'\n\n'+note:''));
      // Proposals from earlier days no longer show up as open.
      await env.DB.prepare("UPDATE coach_inbox SET status='expired' WHERE user_id=? AND status='draft' AND created_at<? AND draft_json LIKE '%\"coach_action\"%'").bind(env.USER_ID,dayStartSql(date)).run().catch(error=>console.error('Draft expiry failed',error.message));
      for(const action of actions){const draft={kind:'coach_action',action,chatId};const ins=await env.DB.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)').bind(env.USER_ID,'cycling',message,JSON.stringify(draft)).run();proposals.push({...action,draftId:ins.meta?.last_row_id});}
      delete answer.memory;
      return {...answer,chatId,actions:proposals,memorySaved:memory,memoryChanges:{saved:memory||null,...changes},costUsd:usageCost(answer.model,answer.usage),timings:{contextMs,modelMs:answer.ms,totalMs:Date.now()-started}};
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
  // "Vrátit" under a confirmed delete, merge or time change of a done activity.
  if(url.pathname==='/app/api/activity/undo'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    try{const body=await request.json().catch(()=>({}));const r=await undoActivityChange(env,body.token);await bumpCacheVersion(env.DB);return Response.json(r,{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:error.message},{status:error.status||400})}
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
        else if(a.type==='activity_kcal'){result=await setActivityKcal(env,{id:a.activityId,kcal:a.kcal});await bumpCacheVersion(env.DB);}
        // Done activities in Aurin only; the result carries the "Vrátit" token (activity-chat-edits.js).
        else if(a.type==='activity_delete'){result=await hideActivity(env,a.activityId);await bumpCacheVersion(env.DB);}
        else if(a.type==='activity_merge'){result=await mergeActivities(env,[a.activityId,a.otherActivityId]);await bumpCacheVersion(env.DB);}
        else if(a.type==='activity_time'){result=await setActivityTime(env,a.activityId,a.time);await bumpCacheVersion(env.DB);}
        else if(a.type==='workout'){
          // The workout the chat showed is the one that gets planned: the ride
          // or run goes to the calendar (and Intervals.icu), the gym draft is saved.
          if(!validTrainingDay(a.date)||a.date<localToday())throw new Error(L('Do minulého dne už nelze přidat trénink.', 'You can\'t add a workout to a past day.'));
          let preview=a.preview||await workoutPreview(env,ctx,a);
          // A hard ride or run proposed earlier is checked again for the day as
          // it is now (a red morning, signs of illness, a hard day since): the
          // coach's check gives the same workout, or the proposal is out of date.
          const intense=['vo2max','threshold','tempo','sweet_spot','anaerobic','sprint'];
          if(a.sport!=='gym'&&a.preview&&intense.includes(preview.workout?.primary_system)){
            const fresh=await workoutPreview(env,ctx,a).catch(()=>null),base=id=>String(id||'').replace(/~\d+$/,'');
            if(!fresh?.workout?.id||fresh.replaced||base(fresh.workout.id)!==base(preview.workout.id))throw new Error(L('Od návrhu se změnila tvoje připravenost nebo zátěž a tenhle trénink by dnes kouč nenavrhl. Požádej o nový návrh.', 'Your readiness or load has changed since the proposal and the coach wouldn\'t propose this workout now. Ask for a new proposal.'));
            preview=fresh;
          }
          if(a.sport==='gym'&&a.trim){
            assertTrainingAllowed(await getAthleteState(env.DB));
            const saved=await env.DB.prepare('UPDATE gym_plans SET values_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND workout_date=? AND values_json=?').bind(JSON.stringify(a.trim.values),env.USER_ID,a.date,JSON.stringify(a.trim.source)).run();
            if(saved.meta?.changes!==1)throw new Error(L('Plán se mezitím změnil. Požádej o nový návrh.', 'The plan has changed in the meantime. Ask for a new proposal.'));
            result={status:'ok',date:a.date,values:a.trim.values,preview};
          }else if(a.sport==='gym'){
            if(!preview.draftId)throw new Error(L('Gym plán se nepodařilo připravit. Požádej o nový návrh.', 'The gym plan couldn\'t be prepared. Ask for a new proposal.'));
            const confirmUrl=new URL('https://internal/app/api/gym/confirm'),saved=await handleDashboardApi(new Request(confirmUrl,{method:'POST',headers:{Origin:confirmUrl.origin,'Content-Type':'application/json'},body:JSON.stringify({draftId:preview.draftId})}),env,ctx,confirmUrl,{signedIn:true});
            const savedBody=await saved.json().catch(()=>({}));if(!saved.ok)throw new Error(savedBody.message||L('Gym plán se nepodařilo uložit.', 'The gym plan couldn\'t be saved.'));
            result={...savedBody,preview};
          }else{
            if(!preview.workout?.id)throw new Error(L('Trénink se nepodařilo připravit. Požádej o nový návrh.', 'The workout couldn\'t be prepared. Ask for a new proposal.'));
            result={...await scheduleWorkoutInIntervals(env,env.DB,{workoutId:preview.workout.id,date:a.date,confirm:true,environment:preview.environment||preview.workout.environment||'outdoor'}),preview};
          }
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
      const done={activity_delete:L('Smazáno','Deleted'),activity_merge:L('Sloučeno','Merged'),activity_time:L('Upraveno','Changed')}[draft.action?.type];
      return Response.json({status:'ok',message:body.decision==='reject'?L('Návrh odmítnut.', 'Proposal rejected.'):done||L('Návrh potvrzen.', 'Proposal confirmed.'),action:draft.action,result,undo:result?.undo||null},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:409})}
  }
  {const r=await handleFoodApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  {const r=await handleCycleApi(request,env,ctx,url,session);if(r!==undefined)return r;}
  {const r=await handleJournalApi(request,env,ctx,url,session,{mornings:(from,to)=>journalMornings(env,ctx,from,to)});if(r!==undefined)return r;}

  // "Nahlásit problém": the user's report with a screenshot and diagnostics (support-report.js).
  if (url.pathname === "/app/api/support/report") return handleSupportReport(request, env, { signedIn: session.signedIn, origin: url.origin });
  // The phone's push token for the morning readiness (push.js): POST saves, DELETE removes.
  if (url.pathname === "/app/api/push/token") return handlePushToken(request, env, { signedIn: session.signedIn, origin: url.origin });
  if (url.pathname === "/app/api/connections" && request.method === "GET") {
    return Response.json(await connectionStatus(env), {headers:{"Cache-Control":"no-store"}});
  }
  // Which device the night and the day come from (source-priority.js); GET is connections' priority.
  if (url.pathname === '/app/api/sources/priority' && request.method === 'POST') {
    if (!session.signedIn) return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if (request.headers.get('Origin') !== url.origin) return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    const result=await saveSourcePriority(env.DB,env.USER_ID,{night:body.night,day:body.day});
    return Response.json(result,{status:result.code||200,headers:{'Cache-Control':'no-store'}});
  }
  if (url.pathname === '/app/api/connections' && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!session.signedIn) return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if (request.headers.get('Origin') !== url.origin) return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    const body=await request.json().catch(()=>({}));
    if (request.method === 'DELETE') {
      if(body.provider==='apple'){await disconnectAppleHealth(env.DB,env.USER_ID);return Response.json({status:'ok',message:L('Připojení je odebrané.', 'The connection has been removed.')},{headers:{'Cache-Control':'no-store'}});}
      if(body.provider==='wahoo'){await disconnectWahoo(env);await bumpCacheVersion(env.DB);return Response.json({status:'ok',message:L('Připojení je odebrané a aktivity z Wahoo smazané.', 'The connection has been removed and the Wahoo activities deleted.')},{headers:{'Cache-Control':'no-store'}});}
      if(body.provider==='whoop'){await disconnectWhoop(env);await bumpCacheVersion(env.DB);return Response.json({status:'ok',message:L('Připojení je odebrané a data z WHOOPu smazaná.', 'The connection has been removed and the WHOOP data deleted.')},{headers:{'Cache-Control':'no-store'}});}
      if(body.provider==='ultrahuman'){await disconnectUltrahuman(env);await bumpCacheVersion(env.DB);return Response.json({status:'ok',message:L('Připojení je odebrané a data z prstenu smazaná.', 'The connection has been removed and the ring\'s data deleted.')},{headers:{'Cache-Control':'no-store'}});}
      if(body.provider==='strava'){await disconnectStrava(env);return Response.json({status:'ok',message:L('Připojení je odebrané.', 'The connection has been removed.')},{headers:{'Cache-Control':'no-store'}});}
      if(!['google','intervals'].includes(body.provider)) return Response.json({message:L('Neznámé připojení.', 'Unknown connection.')},{status:400});
      // Loadwise also gives up its access at Google. The owner's token can be the shared Worker secret, which stays.
      if(body.provider==='google'&&!env.USER_IS_OWNER) await revokeGoogle(env);
      if(body.provider==='intervals'){await disconnectIntervalsApp(env);await deleteConnectionSecret(env,'intervals_athlete');}
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
    await deleteConnectionSecret(env,'intervals_athlete');
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
    // Heart rate and route from the watch when Intervals.icu has none. A done
    // activity barely changes: kept 6 hours, and any change the user makes
    // (sync with new data, edit, delete) starts a new cache version. A failure
    // is answered as it is and not kept.
    let failed=null;
    const detail=await cached(env,ctx,'activity-detail:'+id,async()=>{
      const response=await activityDetail(request,env,id,true);
      if(!response.ok){failed=response;throw new Error('activity detail');}
      return withWatch(env,await response.json(),id,await watchOptions(env));
    },{ttl:6*3600}).catch(error=>{if(failed)return null;throw error;});
    if(!detail)return failed;
    return Response.json(detail,{headers:{'Cache-Control':'private, no-store'}});
  }
  // A workout from the watch (Apple Health, Google Health): summary, heart rate, zones, route.
  if(url.pathname==='/app/api/activity-detail/watch'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    const detail=await watchDetail(env,{source:url.searchParams.get('source'),id:url.searchParams.get('id'),...await watchOptions(env)}).catch(error=>{console.error('Watch detail failed',error.message);return null;});
    if(!detail)return Response.json({message:L('Aktivita není v tvé synchronizované historii.', 'The activity isn\'t in your synced history.')},{status:404});
    return Response.json(detail,{headers:{'Cache-Control':'private, no-store'}});
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
      // The active training plan, today's plan proposal and the connection check start with the rest.
      const syncing=syncedPlans(env).catch(()=>({}));
      const proposing=syncing.then(p=>isToday&&p.active?planProposal(env,ctx).catch(()=>null):null);
      const checking=connectionStatus(env).catch(()=>null);
      // Today only: yesterday's sessions and tomorrow's plan for "Regenerace na dnes" (recovery-today.js).
      const [daily,health,fitness,sleep,fluids,weight,coaches,profile,place,gym,yesterday,tomorrow,savedRecovery,checkin,synced,proposal,status,recoveryLess,training]=await Promise.all([
        read('/analysis/daily?date='+date),googleHealthFor(env,ctx,date).catch(()=>({})),
        cached(env,ctx,'fitness:90',()=>api('/app/api/fitness?days=90')).catch(()=>({})),
        read('/health/sleep?start='+from+'&end='+to).then(d=>intervalsSleep(env,ctx,d,from,to)).catch(()=>({})),
        api('/app/api/fluids?date='+date),read('/health/weight'),api('/app/api/coaches?date='+date),dashboardProfile(env).catch(()=>null),
        todayPlace(env,ctx,date),trainingGymPlans(env,isToday?shiftDate(date,-1):date,isToday?shiftDate(date,1):date).catch(()=>({})),
        isToday?read('/analysis/daily?date='+shiftDate(date,-1)):null,isToday?read('/analysis/daily?date='+shiftDate(date,1)):null,
        listRecovery(env.DB,{from:date,to:date}).catch(()=>[]),readinessCheckin(env.DB,date).catch(()=>null),
        syncing,proposing,checking,
        isToday?lessKinds(env.DB,env.USER_ID).catch(()=>[]):[],
        isToday?loadTrainingDoses(env.DB).catch(()=>null):null
      ]);
      // The active training plan in one line (training-plans.js).
      const active=synced.active??synced.gym,summary=active?planSummary(active,date):null;
      const trainingPlan=summary?.started?{name:summary.name,week:summary.week,weeksCount:summary.weeksCount,phaseLabel:summary.phaseLabel,raceDate:summary.raceDate,paused:summary.paused,canUndo:Boolean(active.undo),proposal:proposal?{type:proposal.type,title:proposal.title,text:proposal.text,options:proposal.options,days:proposal.days||null,button:proposal.button}:null}:null;
      // Connected services that need the user (access refused, Google permissions missing), shown at the top of Today.
      const problems=connectionProblems(status);
      if(date===localToday()&&profile)ctx.waitUntil(lockReadiness(env.DB,{date,health,fitness,sleep,profile}).catch(()=>false));
      applyEnergyBudget(daily,profile,health);
      return Response.json(withRecoveryTime(buildToday({date,hour:date===localToday()?localHour():null,daily,health,fitness,sleep,fluids,weight,coaches,profile:profile||{},connectionProblems:problems,location:place.location,forecast:place.forecast,gym:gym[date]||null,checkin,trainingPlan,
        recovery:{yesterday:yesterday?.training||{},tomorrow:tomorrow?tomorrow.training||{}:null,gym,saved:savedRecovery,less:recoveryLess}}),training),{headers:{'Cache-Control':'no-store'}});
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
      const built=buildFood({date,hour:date===localToday()?localHour():null,daily,food,fluids,slots:profile?.meals});
      // Up to three nutrients a Pro account pinned under the macros (micronutrients.js).
      const [pro,favorites]=await Promise.all([isPro(env),nutrientFavorites(env.DB,env.USER_ID??env.DB.userId)]);
      if(pro&&favorites.length){const items=buildNutrients({days:[{date,food}],profile,kcalTarget:numOrNull(daily?.nutrition?.calorieTarget),pro}).items;built.nutrients=favorites.map(k=>items.find(i=>i.key===k)).filter(Boolean);}
      return Response.json(built,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }

  // The Živiny page (days=1 or 7) and one nutrient's detail (key=…). Without Pro
  // only fibre, sugar and salt carry values (micronutrients.js).
  if(url.pathname==='/app/api/food/nutrients'&&request.method==='GET'){
    try{
      const requested=url.searchParams.get('date'),date=validTrainingDay(requested)&&requested<=localToday()?requested:localToday();
      const key=url.searchParams.get('key'),span=key||url.searchParams.get('days')==='7'?7:1;
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const [daily,profile,pro,favorites]=await Promise.all([read('/analysis/daily?date='+date),dashboardProfile(env).catch(()=>null),isPro(env),nutrientFavorites(env.DB,env.USER_ID??env.DB.userId)]);
      const days=await Promise.all(Array.from({length:span},(_,i)=>shiftDate(date,i-span+1)).map(async d=>({date:d,food:await read('/food/log?date='+d)})));
      const kcalTarget=numOrNull(daily?.nutrition?.calorieTarget),language=lang();
      if(key){
        if(!pro&&!FREE_KEYS.includes(key))return Response.json({message:L('Vitamíny a minerály jsou v Aurin Pro.', 'Vitamins and minerals are in Aurin Pro.')},{status:403});
        const detail=buildNutrientDetail({key,today:days.at(-1).food,week:days,profile,kcalTarget,rich:(await microTop(env).catch(()=>({})))?.[key],language});
        return detail?Response.json(detail,{headers:{'Cache-Control':'no-store'}}):Response.json({message:'Unknown nutrient'},{status:404});
      }
      return Response.json({...buildNutrients({days,profile,kcalTarget,pro,language}),favorites},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/food/nutrients/favorites'&&request.method==='POST'){
    if(!await isPro(env))return Response.json({message:L('Vlastní živiny na Jídle jsou v Aurin Pro.', 'Your own nutrients on Food are in Aurin Pro.')},{status:403});
    const body=await request.json().catch(()=>({}));
    return Response.json({status:'ok',favorites:await saveNutrientFavorites(env.DB,env.USER_ID??env.DB.userId,body.favorites)});
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
        read('/health/sleep?start='+from+'&end='+to).then(d=>intervalsSleep(env,ctx,d,from,to)).catch(()=>({})),
        read('/health/weight'),dashboardProfile(env).catch(()=>null),readinessCheckin(env.DB,date).catch(()=>null),
        // Muscle mass from a scale through Apple Health (lean body mass).
        env.DB.prepare("SELECT sample_time,value_numeric FROM health_datapoints WHERE user_id=? AND data_type='lean-body-mass' AND record_role='primary' AND sample_time>=? ORDER BY sample_time LIMIT 400").bind(env.USER_ID,shiftDate(date,-60)).all().then(r=>r.results||[]).catch(()=>[])
      ]);
      if(date===localToday()&&profile)ctx.waitUntil(lockReadiness(env.DB,{date,health,fitness,sleep,profile}).catch(()=>false));
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
        const rows=(await env.DB.prepare("SELECT data_type,source_family,external_id,start_time,end_time,value_numeric,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family IN ('intervals','local','wahoo') AND data_type IN ('planned-workout','activity')) OR (source_family IN ('google-wearables','apple-health') AND data_type='exercise')) AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(env.USER_ID,shiftDate(start,-1),shiftDate(end,2)).all().catch(()=>({results:[]}))).results||[];
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

  // Settings → Ikona aplikace: lifetime km, gym sessions and days in a row (app-milestones.js).
  if(url.pathname==='/app/api/milestones'&&request.method==='GET'){
    try{
      const today=localToday();
      const result=await cached(env,ctx,'milestones:'+today,async()=>buildMilestones({...await milestoneInputs(env,today),today}),{ttl:300});
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }

  // Sdílet → Milník: the round numbers reached since joining, with the sessions
  // behind them, and a power record from Intervals.icu (share-milestone.js).
  if(url.pathname==='/app/api/share/milestones'&&request.method==='GET'){
    try{
      const today=localToday();
      const result=await cached(env,ctx,'share-milestones:'+today,async()=>{
        const [inputs,record]=await Promise.all([
          milestoneInputs(env,today),
          intervalsRecord(env,intervalsAuthorization(env.INTERVALS_API_KEY),today).catch(()=>null)
        ]);
        return {...buildShareMilestones({...inputs,today}),record};
      },{ttl:300});
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }

  // Sdílet → Týden: Monday to Sunday of ?date= and the week before (share-week.js).
  if(url.pathname==='/app/api/share/week'&&request.method==='GET'){
    try{
      const today=localToday(),asked=url.searchParams.get('date');
      const date=/^\d{4}-\d{2}-\d{2}$/.test(String(asked||''))&&asked<=today?asked:today;
      const start=shiftDate(mondayOf(date),-7),end=shiftDate(mondayOf(date),6),last=end<today?end:today;
      const result=await cached(env,ctx,'share-week:'+start+':'+today,async()=>{
        const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
        const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path)).then(r=>r.ok?r.json():{}).catch(()=>({}));
        // The readiness of each day as Today shows it (readiness.js), its sleep need from the month before.
        const from=shiftDate(start,-30),to=shiftDate(last,1);
        const [rows,gym,health,fitness,sleep,profile]=await Promise.all([
          env.DB.prepare("SELECT source_family,external_id,start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family IN ('intervals','local','wahoo') AND data_type='activity') OR (source_family IN ('google-wearables','apple-health') AND data_type='exercise')) AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID,shiftDate(start,-1),shiftDate(end,2)).all().then(r=>r.results||[]).catch(()=>[]),
          trainingGymPlans(env,start,end).catch(()=>({})),
          googleHealthFor(env,ctx,last).catch(()=>({})),
          cached(env,ctx,'fitness:90',()=>internal('/app/api/fitness?days=90')).catch(()=>({})),
          read('/health/sleep?start='+from+'&end='+to).then(d=>intervalsSleep(env,ctx,d,from,to)).catch(()=>({})),
          dashboardProfile(env).catch(()=>null)
        ]);
        return buildShareWeek({date,today,rows,gymDays:Object.keys(gym).filter(d=>gym[d].logged>0),
          google:health?.wellness||[],intervals:fitness?.wellness||[],sessions:Array.isArray(sleep?.sessions)?sleep.sessions:[],profile});
      },{ttl:300});
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }

  if(url.pathname==='/app/api/coaches'&&request.method==='GET'){
    try{
      // Up to two weeks ahead: the advisers then talk about the planned day.
      const requestedDate=url.searchParams.get('date'),date=validTrainingDay(requestedDate)&&requestedDate<=shiftDate(localToday(),14)?requestedDate:localToday(),ahead=date>localToday(),oldest=shiftDate(date,-14);
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      // Form from the same series as Training (/app/api/fitness: Intervals.icu and the watch's workouts), so Today and Training agree.
      const fitnessSeries=cached(env,ctx,'fitness:90',()=>handleDashboardApi(new Request('https://internal/app/api/fitness?days=90'),env,ctx,new URL('https://internal/app/api/fitness?days=90')).then(r=>r.json())).catch(()=>null);
      const fitnessJob=fitnessSeries.then(f=>(Array.isArray(f?.wellness)?f.wellness:[]).filter(r=>String(r.id||'')>=oldest&&String(r.id||'')<=date));
      // A completed ride's intervals (one small Intervals.icu request, cached)
      // let its review compare every step with the plan.
      const dailyJob=read('/analysis/daily?date='+date);
      const rideJob=dailyJob.then(d=>rideDetailsFor(env,ctx,d.training)).catch(()=>({}));
      // The acute:chronic workload ratio and monotony need 4 weeks of daily
      // loads (workload-ratio.js), from the same cached series as the Training screen.
      const workloadJob=ahead?null:fitnessSeries.then(f=>workloadMetrics(f?.wellness,date)).catch(()=>null);
      const [daily,yesterday,sleepData,rows,profile,athleteState,gym,thresholds,rideDetails,workload]=await Promise.all([
        dailyJob,read('/analysis/daily?date='+shiftDate(date,-1)),
        read('/health/sleep?start='+oldest+'&end='+shiftDate(date,1)).then(d=>intervalsSleep(env,ctx,d,oldest,shiftDate(date,1))),fitnessJob,dashboardProfile(env),
        date>=localToday()?getAthleteState(env.DB):{status:'active',note:'',statusUntil:null},readGymPlan(env.DB,date).catch(()=>null),
        cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>null),rideJob,workloadJob
      ]);
      // The gym review compares logged sets with earlier sessions of the same exercises.
      const strengthHistory=(gym?.values||[]).slice(7).some(r=>/^(true|1)$/i.test(String(r?.[8]??'')))?await getStrengthHistory(env.DB,500).catch(()=>[]):[];
      const latest=Array.isArray(rows)&&rows.length?rows.filter(r=>String(r.id||'')<=date).at(-1)||{}:{};
      const fitness={...latest,tsb:latest.ctl!=null&&latest.atl!=null?Number(latest.ctl)-Number(latest.atl):null};
      const council=buildCoachCouncil({strengthHistory,date,daily,yesterday,fitness,sleepSessions:sleepData.sessions||[],athleteState,focus:athleteFocus(profile,date),gym,thresholds,ahead,rideDetails,workload,wellness:Array.isArray(rows)?rows:[]});
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
      const response = await intervalsReads(env,ctx)(target,{headers:{Authorization:auth,Accept:"application/json"}});
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
        // The phone sends the last days again on every sync: only new data makes
        // the cached screens and the coach's texts outdated (CACHE_NEUTRAL skips it above).
        if(result.changed){await bumpCacheVersion(env.DB);await markScreenTextsStale(env).catch(()=>{});}
        // Apple Watch workouts pair with Intervals.icu activities like Google's do.
        const from=Date.parse(body.windows?.exercise?.from||'');
        if(result.changed&&Number.isFinite(from))ctx.waitUntil(matchActivities(env,{days:Math.min(400,Math.ceil((Date.now()-from)/86400000)+1)}).catch(error=>console.error('Activity matching failed',error.message)));
        // New resting and maximum heart rate reach the profile's automatic values now, not the next day.
        if(result.changed)ctx.waitUntil(refreshSuggestions(env,{force:true}).catch(error=>console.error('Profile suggestions not refreshed',error.message)));
        // Last night arrived: the morning readiness push, once a day (push.js).
        if(result.saved&&hasLastNight(body.records))ctx.waitUntil(morningPush(env,ctx,{fresh:true}).catch(error=>console.error('Morning push failed',error.message)));
        return Response.json(result,{headers:{'Cache-Control':'no-store'}});
      }
      if(request.method==='DELETE'){const result=await disconnectAppleHealth(env.DB,env.USER_ID);await bumpCacheVersion(env.DB);return Response.json(result,{headers:{'Cache-Control':'no-store'}});}
      return Response.json({message:'Method not allowed'},{status:405});
    }catch(error){console.error('Apple Health',error);return Response.json({message:error.message},{status:500});}
  }

  if(url.pathname==='/app/api/sync'&&['POST','GET'].includes(request.method)){
    if(!session.signedIn)return Response.json({message:L('Přihlas se do dashboardu.', 'Sign in to the app.')},{status:401});
    if(request.method==='GET')return Response.json(await dashboardSyncStatus(env.DB),{headers:{'Cache-Control':'no-store'}});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:L('Neplatný původ požadavku.', 'Invalid request origin.')},{status:403});
    if(missingProviders(env).length===2&&!(env.CONNECTED_PROVIDERS||[]).some(p=>p==='ultrahuman'||p==='whoop'||p==='wahoo'))return Response.json({status:'idle',message:L('Žádná služba není propojená.', 'No service is connected.')});
    await initialImport(env,ctx);
    const run=await startDashboardSync(env.DB,ctx,()=>recentDashboardImport(env,ctx));
    return Response.json({...run,status:'accepted'},{status:202,headers:{'Cache-Control':'no-store'}});
  }

  {const r=await handleGymPlanApi(request,env,ctx,url,session,internalAuth);if(r!==undefined)return r;}
  if (url.pathname === "/app/api/gym/generate" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body === "object") delete body.diagnostic;
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
    return Response.json(await intervalsSleep(env,ctx,await response.json(),start, end), { headers: { "Cache-Control": "no-store" } });
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
// The ride/run coach as "Navrhnout trénink na dnes" builds it when the athlete
// chose nothing: the plan's session or the week's role for the day, the day's
// free time and what the athlete can do. Doporučení trenéra uses it, so its
// option is the workout the library then proposes.
async function defaultDayCoach(env,inputs,date,sport,{prefs,plan,targets}){
  const chip=prefs?targetFor(targets,date,sport):null,planned=chip?.plan||null;
  const focus=(planned?({quality:systemOf(sport,planned.family),test:'threshold',long:'long_endurance',easy:'endurance',recovery:'recovery'})[planned.kind]:null)||roleFor(prefs,date,sport,plan?.roles)?.focus||null;
  return buildCyclingCoachV2({...inputs,availabilityMinutes:trainingBudget(prefs,date,chip?.minutes||null),capabilities:await getCapabilities(env.DB,sport),sport,goal:focus?{focus}:null});
}
// The athlete's ratings since a day: library workouts (workout_feedback) and
// the "Jak to šlo?" of any other session (coach_reflections).
async function feedbackSince(env,since){
  const library=await recentWorkoutFeedback(env.DB,since).catch(()=>[]);
  const own=(await listReflections(env.DB,{limit:20}).catch(()=>[])).filter(r=>r.date>=since&&(r.rpe!=null||r.notes)&&!library.some(f=>r.workoutId&&f.workoutId===r.workoutId));
  return [...library,...own.map(r=>({date:r.date,workoutId:r.workoutId||null,name:null,system:null,sport:null,rpe:r.rpe,notes:r.notes||null,completedPercent:null}))].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,14);
}
// The ready ride, run and gym of the day's options (Aktivita dne): the coach's
// workout as the library's Návrh kouče makes it (the AI picks or writes only
// the best one's) and the gym proposal; the rest have fixed lines.
async function pickDetails(env,ctx,ranked,date,gymPlan){
  const thresholds=await cached(env,ctx,'thresholds',()=>athleteThresholds(env)).catch(()=>({}));
  const post=async(path,body)=>{const u=new URL('https://internal'+path),r=await handleDashboardApi(new Request(u,{method:'POST',headers:{Origin:u.origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,ctx,u,{signedIn:true});const d=await r.json().catch(()=>null);return r.ok?d:null;};
  const out={};
  await Promise.all(ranked.options.map(async o=>{
    try{
      if(o.kind==='ride'||o.kind==='run'){
        const g=await post('/app/api/workouts/generate',{date,sport:o.kind,environment:'auto',ai:o.best===true}),w=g?.status==='ok'?g.workout:null;
        if(!w)return;
        let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}
        const steps=o.kind==='run'?stepRows(structure,{environment:w.environment,sport:'run',thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones,hrZones:thresholds.runHrZones?.length?thresholds.runHrZones:thresholds.hrZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones,hrZones:thresholds.hrZones});
        const {structure_json,...workout}=w;
        out[o.kind]={workout:{...workout,steps,ai:w.ai||g.ai||null},lines:workoutLines(steps,o.kind),minutes:Math.round(Number(w.duration_minutes)||0)||null};
      }else if(o.kind==='gym'){
        if((gymPlan?.values||[]).length>7){out.gym={lines:gymLines(gymPlan.values),gym:{planned:true}};return;}
        const g=await post('/app/api/gym/generate',{date,durationMinutes:60,preview:true,...(ranked.lowerTired?{focus:'upper'}:{})});
        if(g?.plan?.rows&&g.draftId)out.gym={lines:gymLines(g.plan.rows),gym:{draftId:g.draftId,rows:g.plan.rows}};
      }
    }catch(error){console.error('Activity of the day',o.kind,error?.message||error);}
  }));
  return out;
}
async function workoutPreview(env,ctx,a){
  // The day's own plan shortened (coach-actions.js): its rows as they will be saved.
  if(a.sport==='gym'&&a.trim){
    const rows=a.trim.values.slice(a.trim.values.findIndex(r=>r?.[0]==='Typ'&&r?.[1]==='Cvik')+1).filter(r=>r?.[1]);
    return {status:'ok',plan:{planName:a.workoutName,rationale:a.trim.removed.length?L('Vynechávám: ','Leaving out: ')+a.trim.removed.join(', '):null,rows},muscles:Object.fromEntries([...new Set(rows.map(r=>r[1]))].map(name=>[name,exerciseMuscles(name)]))};
  }
  const path=a.sport==='gym'?'/app/api/gym/generate':'/app/api/workouts/generate';
  // The library workout named in the answer, at the proposed length; without one
  // the kind the answer recommends, and only without that the coach picks.
  const exact=a.workoutId&&a.sport!=='gym'?{workoutId:a.workoutId,resizeTo:a.minutes}:a.sport!=='gym'&&FOCUS_OF[a.kind]?{focus:FOCUS_OF[a.kind]}:a.sport==='gym'&&a.gymFocus?{focus:a.gymFocus}:{};
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
      w.steps=kind==='run'?stepRows(structure,{environment:w.environment,sport:'run',thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones,hrZones:thresholds.runHrZones?.length?thresholds.runHrZones:thresholds.hrZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones,hrZones:thresholds.hrZones});
      return Response.json({status:'ok',source:library?'library':'intervals',workout:w,athlete:{ftp:thresholds.ftp,indoorFtp:rideFtpFor(thresholds,'indoor').ftp,indoorFtpEstimated:rideFtpFor(thresholds,'indoor').estimated,runThresholdPace:thresholds.runThresholdPace}},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/search'&&request.method==='GET'){
      await cached(env,ctx,'reconcile:'+localToday(),async()=>{await reconcileWorkoutLibraryCompletions(env,ctx,internalAuth);return {done:true};});
      const date=validDate(url.searchParams.get('date'))?url.searchParams.get('date'):localToday();
      // The same coach as the library's Návrh kouče (the week plan's role and
      // the day's time), so the list ranks what the proposal above it says.
      const prefs=await getWeekPlan(env.DB,date).catch(()=>null),plan=prefs?await planForWeek(env,ctx,mondayOfDate(date)).catch(()=>null):null;
      const week={prefs,plan,targets:prefs?await computeWeekTargets(env,ctx,mondayOfDate(date),prefs).catch(()=>null):null};
      const coach=await defaultDayCoach(env,{...await loadCoachInputs(env,ctx,internalAuth,date),athleteState:await getAthleteState(env.DB).catch(()=>null)},date,sport,week);
      const context={readiness:coach.readiness.status,hardBikeDaysRolling7d:coach.load.hardBikeDaysRolling7d,phase:String(url.searchParams.get('phase')||'')};
      // Without a length the list is ranked by the length of the coach's
      // session (the free time is only its limit), indoors shorter, as the
      // proposal is; no length is filtered out.
      const filters=parseWorkoutSearchFilters(url.searchParams),free=Number(coach.constraints?.availableMinutes)||null,coachMinutes=Number(coach.recommendation?.session?.durationMinutes)||null;
      const freeMinutes=free&&filters.environment==='indoor'?indoorMinutes(sport,free):free,dayMinutes=coachMinutes&&freeMinutes?Math.min(coachMinutes,freeMinutes):coachMinutes||freeMinutes;
      const autoDuration=filters.durationMinutes==null&&dayMinutes>0?{durationMinutes:dayMinutes}:null;
      if(autoDuration)Object.assign(filters,{durationMinutes:autoDuration.durationMinutes,durationSoft:true});
      // Doporučená keeps to the day's time in the week plan (a length the athlete picks does not).
      const dayLimit=filters.durationMinutes==null||autoDuration?trainingBudget(prefs,date,null):null;
      if(dayLimit>0)filters.maxDurationMinutes=dayLimit;
      // With no type chosen, the type the coach recommends for the day ranks first.
      const coachKind=coach.recommendation?.session?.kind;if(!filters.system&&coachKind)filters.preferredSystem=coachKind==='long_endurance'?'endurance':coachKind==='vo2'?'vo2max':coachKind;
      const [result,thresholds]=await Promise.all([searchWorkoutLibrary(env.DB,filters,context),cached(env,ctx,'thresholds',()=>athleteThresholds(env))]);
      result.autoDuration=autoDuration;result.coachPick={system:filters.preferredSystem||null,durationMinutes:autoDuration?.durationMinutes||null};
      // Step rows with watts or paces for each card.
      for(const w of result.workouts){let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}w.steps=sport==='run'?stepRows(structure,{environment:w.environment,sport,thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones,hrZones:thresholds.runHrZones?.length?thresholds.runHrZones:thresholds.hrZones}):stepRows(structure,{environment:w.environment,ftp:rideFtpFor(thresholds,w.environment).ftp,zones:thresholds.powerZones,hrZones:thresholds.hrZones});
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
      // A kind the athlete or the AI week asked for ("Plán týdne", week-ai.js) wins over the plan's and the role's.
      // A library workout (the chat's workoutId, "Změnit délku") passes the coach's
      // check for the day like an asked kind: a hard one on a day the coach keeps
      // easy (red, signs of illness, 48 h, a break…) gives way to the coach's own
      // session (Revize doporučování tréninků 2026-10-16, nález 2).
      let workoutId=body.workoutId?String(body.workoutId).slice(0,120):null;
      const askedWorkout=workoutId?await getWorkout(env.DB,workoutId.replace(/~\d+$/,'')).catch(()=>null):null;
      const libraryFocus=askedWorkout?(/sprint/.test(String(askedWorkout.primary_system))?'vo2max':FOCUS_OF[kindOfSystem(askedWorkout.primary_system)]||null):null;
      const askedFocus=Object.values(FOCUS_OF).includes(body.focus)?body.focus:libraryFocus;
      const planned=!workoutId&&!(Number(body.variant)>0)&&!askedFocus?chip?.plan||null:null;
      if(weekTarget?.minutes)availabilityMinutes=weekTarget.minutes;
      availabilityMinutes=trainingBudget(prefs,date,availabilityMinutes,{userInitiated});
      if(availabilityMinutes!=null&&availabilityMinutes<(genSport==='run'?20:30))throw new Error(L('V tento den nemáš dost času na tento trénink.', 'You don\'t have enough time for this workout on this day.'));
      // The chip's place (the athlete's choice or the forecast) first, then the forecast.
      const weather=weekTarget?.environment?{}:await weekWeather(prefs.location,mondayOfDate(date)),suggestedEnvironment=weekTarget?.environment?{environment:weekTarget.environment,reason:weekTarget.reason}:environmentFor(date,genSport,weather[date]);
      const environment=body.environment==='auto'||!body.environment?suggestedEnvironment.environment:body.environment;
      // Indoor is shorter (the chip already is when it says indoor).
      if(!userInitiated&&environment==='indoor'&&weekTarget?.environment!=='indoor')availabilityMinutes=availabilityMinutes!=null?indoorMinutes(genSport,availabilityMinutes):genSport==='ride'?90:60;
      const planFocus=planned?({quality:systemOf(genSport,planned.family),test:'threshold',long:'long_endurance',easy:'endurance',recovery:'recovery'})[planned.kind]||null:null;
      const roleFocus=askedFocus||planFocus||weekRole?.focus;
      const goalOf=focus=>body.phase||focus?{...(body.phase?{phase:String(body.phase)}:{}),...(focus?{focus}:{}),...(focus&&focus===askedFocus?{asked:true}:{})}:null;
      const coachInputs={...await loadCoachInputs(env,ctx,internalAuth,date),athleteState:await getAthleteState(env.DB).catch(()=>null),availabilityMinutes,capabilities:await getCapabilities(env.DB,genSport),sport:genSport};
      let coach=buildCyclingCoachV2({...coachInputs,goal:goalOf(roleFocus)});
      // A hard kind asked for on a red morning gives way to the coach's own choice.
      if(askedFocus&&!['recovery','endurance','long_endurance'].includes(askedFocus)&&coach.readiness?.status==='red')coach=buildCyclingCoachV2({...coachInputs,goal:goalOf(planFocus||weekRole?.focus)});
      const thresholds=await cached(env,ctx,'thresholds',()=>athleteThresholds(env));
      const resizeTo=Number.isFinite(Number(body.resizeTo))&&Number(body.resizeTo)>0?trainingBudget(prefs,date,Number(body.resizeTo),{userInitiated}):null;
      if(resizeTo!=null&&resizeTo<(genSport==='run'?20:30)){const min=genSport==='run'?20:30;throw new Error(L(`Trénink musí mít aspoň ${min} minut.`, `The workout must be at least ${min} minutes.`));}
      // The free time is a limit, not a target: the coach may want less (an easy
      // day, a beginner, a run that grows slowly). A length typed by the athlete wins.
      const coachMinutes=Number(coach.recommendation?.session?.durationMinutes)||null;
      const sessionMinutes=!userInitiated&&availabilityMinutes!=null&&coachMinutes?Math.min(availabilityMinutes,coachMinutes):availabilityMinutes;
      // The plan's workout when the coach keeps the day's intensity: a key
      // session needs a hard day by the coach (a red or tired morning makes it
      // easy, and then the coach's own easy session stands), an easy one
      // anything but recovery. Tests and the race are the plan's whatever.
      const coachKind=coach.recommendation?.session?.kind,hardDay=['tempo','sweet_spot','threshold','vo2','vo2max','anaerobic','sprint'].includes(coachKind);
      if(workoutId&&['tempo','sweet_spot','threshold','vo2max'].includes(libraryFocus)&&!hardDay)workoutId=null;
      const keeps=planned&&(planned.kind==='race'||planned.kind==='test'?true:planned.kind==='quality'?hardDay:coachKind!=='recovery'||planned.kind==='recovery');
      let planWorkout=null;
      if(keeps){
        const minutes=resizeTo??sessionMinutes??(Number(chip?.minutes)||null);
        const id=planned.kind==='race'||planned.kind==='test'?planned.workoutId:planWorkoutId(genSport,planned,minutes||chip?.minutes||60,planned.kind==='quality'?levelShift((await getCapabilities(env.DB,genSport))[systemOf(genSport,planned.family)]):0);
        const base=id?await getWorkout(env.DB,String(id).replace(/~\d+$/,'')):null;
        if(base)planWorkout={id:base.id,minutes:planned.kind==='race'||planned.kind==='test'?base.duration_minutes:(minutes||base.duration_minutes)};
      }
      let generated=planWorkout?await generateWorkout(env.DB,{sport:genSport,environment,date,coach,thresholds,workoutId:planWorkout.id,resizeTo:planWorkout.minutes}):await generateWorkout(env.DB,{sport:genSport,environment,date,coach,availabilityMinutes:resizeTo??sessionMinutes,variant:body.variant,thresholds,workoutId,resizeTo});
      if(!planWorkout&&sessionMinutes&&resizeTo==null&&generated.workout?.duration_minutes>sessionMinutes)generated=await generateWorkout(env.DB,{sport:genSport,environment,date,coach,thresholds,workoutId:generated.workout.id,resizeTo:sessionMinutes});
      // Today's proposal in the library: the AI picks among the rules' safe
      // candidates for the morning and says why (ai-workout-pick.js).
      if(body.ai===true&&date===localToday()&&!planWorkout&&!workoutId&&!(Number(body.variant)>0)&&resizeTo==null&&generated.status==='ok'){
        const before=generated.workout?.id,today={score:coach.readiness?.score,zone:coach.readiness?.status,feeling:await readinessCheckin(env.DB,date).catch(()=>null),sleep:coach.readiness?.sleepMinutes!=null?{minutes:coach.readiness.sleepMinutes}:null,ratings:await recentWorkoutRatings(env.DB,{sport:genSport,since:shiftDate(date,-42)})};
        // Nothing in the library fits the day well: the AI writes its own (ai-workout-compose.js).
        const own=poorFit(generated.workout,{sport:genSport,kind:coachKind})?await composeWorkout(env,{sport:genSport,kind:coachKind,minutes:sessionMinutes||generated.durationMinutes,coach,today,focus:coachInputs.focus}):null;
        generated=own?{...generated,workout:renderForEnvironment(own,environment),alternatives:[generated.workout,...(generated.alternatives||[])].slice(0,3),ai:own.ai}:await aiWorkoutPick(env,generated,{sport:genSport,minutes:sessionMinutes,coach,today,focus:coachInputs.focus});
        if(generated.workout?.id!==before)try{generated.explanation=explainWorkout(generated.workout,{coach,environment:generated.workout.environment||environment,thresholds,sport:genSport});}catch{}
      }
      const planInfo=planned&&plan.pw?{name:plan.pw.template.name,week:plan.pw.week,weeks:plan.pw.weeks,phase:plan.pw.spec.phase,kind:planned.kind,followed:Boolean(planWorkout)}:null;
      if(planInfo&&generated.explanation?.why){
        const head=planInfo.name+L(' · týden ',' · week ')+planInfo.week+'/'+planInfo.weeks;
        generated.explanation.why=[planWorkout?head+(planned.kind==='quality'?L(': klíčový trénink týdne.',': the key session of the week.'):planned.kind==='test'?L(': test na začátku a na konci plánu.',': the test at the start and end of the plan.'):planned.kind==='race'?L(': závod.',': race day.'):'.'):head+L(': klíčový trénink dnes nahrazuje lehčí, podle tvé připravenosti.',': today the key session gives way to an easier one, from your readiness.'),...generated.explanation.why];
      }
      // The library workout that gave way, so the chat can say the card differs.
      const replaced=askedWorkout&&!workoutId?{id:askedWorkout.id,name:askedWorkout.name,why:coach.recommendation?.adaptations||[]}:null;
      if(replaced&&generated.explanation?.why)generated.explanation.why=[L('„'+askedWorkout.name+'“ dnes nahrazuje lehčí trénink: ','Today “'+askedWorkout.name+'” gives way to an easier session: ')+(replaced.why.join(', ')||L('podle připravenosti a zátěže','from your readiness and load'))+'.',...generated.explanation.why];
      return Response.json({...generated,weekRole,weekTarget,plan:planInfo,environmentReason:suggestedEnvironment.reason,...(replaced?{replaced}:{})},{headers:{'Cache-Control':'no-store'}});
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


// The athlete's heart-rate zones and, with the location permission, a Google
// token for the route of a watch workout (watch-detail.js).
async function watchOptions(env){
  const t=await athleteThresholds(env).catch(()=>null);
  return {hrZones:t?.hrZones||[],token:grantedExtras(env).location?()=>googleToken(env):null};
}
