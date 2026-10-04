import app from "./sheets-gateway.js";
import { buildCoachCouncil } from "./coach-engine.js";
import { trainingStatus } from './training-status.js';
import { handleMcpCompat } from "./mcp-compat.js";
import { handleOAuthCompat } from "./oauth-compat.js";
import { syncDailyNutritionNotes, deleteDailyNutritionNotes } from "./intervals-nutrition-notes.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { dashboardPage } from "./dashboard.js";
import { connectionStatus } from "./connections.js";
import { connectionEnvironment, saveConnectionSecret, deleteConnectionSecret, missingProviders } from "./connection-secrets.js";
import { parseNutritionLabel, parseNutritionPortion } from './food-label.js';
import { foodIntake } from './food-portions.js';
import {productFromLabel} from './food-sources.js';
import {activityDetail} from './activity-detail.js';
import {rideReviewSections} from './ride-analysis.js';
import {getCookbookRecipeByPage} from './cookbook.js';
import {googleDashboard} from './google-dashboard.js';
import {applyEnergyBudget} from './energy-budget.js';
import {normalizeProfile} from './energy-profile.js';
import {athleteFocus} from './athlete-focus.js';
import {loadEffectiveProfile,refreshSuggestions} from './profile-suggestions.js';
import {syncWeights} from './weight-sync.js';
import {syncWellnessToIntervals} from './wellness-sync.js';
import {gymExerciseCatalog} from './gym-catalog.js';
import {askCoach,coachContext,lightModel,assistantTask} from './coach-assistant.js';
import {validateCoachActions} from './coach-actions.js';
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
    return {status:'error',message:'Jídlo je uložené v aplikaci. Export do Google se nepodařilo připravit; zkus Odeslat znovu.'};
  }
}
import { lookupFoodWithAI } from "./food-ai.js";
import { addFluid, deleteFluid, listFluids, hydrationTarget, dayActivityHours, foodDrinks } from "./fluids.js";
import { isFoodLogMessage, buildFoodDraft, foodDraftSummary } from "./food-chat.js";
import dashboardClient from "./dashboard-client.js";
import { handleGoogleOAuth } from "./google-oauth.js";
import { importStrengthHistory, getStrengthHistory, parseStrengthSheet } from "./strength-history.js";
import { searchCookbookRecipes, logFood } from "./food-log.js";
import { getWorkout, searchWorkoutLibrary, parseWorkoutSearchFilters, getCapabilities, getScheduledWorkouts, recordWorkoutFeedback, scheduleWorkoutInIntervals, generateWorkout, pendingScheduledWorkouts, hasFeedback, markScheduleCompleted, scheduledLink, stepRows } from "./workout-library.js";
import { buildCyclingCoachV2 } from "./cycling-coach-v2.js";
import { athleteThresholds } from "./intervals-athlete.js";
import { getWeekPlan, saveWeekPlan, resetWeekPlan, planWeekRoles, roleFor, weekTargets, targetFor, nightlyGymSkip } from "./week-planner.js";
import { availabilityOn, trainingBudget, validDay as validTrainingDay } from './training-availability.js';
import { getAthleteState, updateAthleteState, explicitPreference, assertTrainingAllowed, proactiveAdvice } from './athlete-state.js';
import { capWeekTargets, weekProposal, weekWeather, environmentFor, activityHistoryEstimate } from './adaptive-week.js';
import { movePlannedEvent, deletePlannedEvent } from "./planned-events.js";
import { loadFitnessInsights } from "./fitness-insights.js";
import { saveTrainingProfile } from "./training-profile.js";
import { syncPlannedEventCalories } from "./intervals-calories.js";
import { readGymPlan } from "./gym-plan-store.js";
import { applyGymSwap } from './coach-gym-adjustment.js';
import { dashboardSyncStatus,startDashboardSync } from './dashboard-sync.js';
import { assistantStreamResponse } from './assistant-stream.js';
import { writeStrengthPlanToIntervals } from './intervals-strength.js';
import { estimateFtp, estimateThresholdPace, FTP_METHODS, PACE_METHODS, POWER_ZONE_MODELS, PACE_ZONE_MODELS, HR_ZONE_MODELS, powerZones, hrZones } from "./training-zones.js";
import {updateFoodEntry,copyFoodEntry,deleteFoodEntry} from './food-entry-management.js';
import legacyHealthApi, { googleToken } from "./index.js";
import { handleGoogleLogin } from "./google-login.js";
import { isPublicPath, resolvePrincipal, unauthorizedResponse, handleDashboardLogout } from "./dashboard-auth.js";
import { ensureTenancy, TenancyUpgradeInProgress, userEnv, findUser, ownerUser, usersWithProviders, listUsersAndInvites, inviteUser, removeInvite, setUserDisabled } from "./tenancy.js";

const OPENAPI_URL = "https://raw.githubusercontent.com/shaarkyn/health-api/main/openapi.json";

const STATIC_PATHS = new Set(['/app','/app/dashboard-client.js','/manifest.webmanifest','/logo.svg','/','/privacy','/terms','/support','/mcp/health']);

// Runs fn once per active user (with that user's env and credentials), for
// cron jobs and GitHub automations that act on everyone's data.
async function forEachUser(env, providers, fn) {
  const results = [];
  for (const user of await usersWithProviders(env.DB, env, providers)) {
    try {
      const scoped = await connectionEnvironment(userEnv(env, user));
      if (providers.some(p => (scoped.CONNECTED_PROVIDERS || []).includes(p))) results.push({ userId: user.id, result: await fn(scoped, user) });
    } catch (error) {
      console.error("Per-user job failed", user.id, error.message);
      results.push({ userId: user.id, error: error.message });
    }
  }
  return results;
}

export default {
  async scheduled(controller, env, ctx) {
    await ensureTenancy(env.DB, env);
    await forEachUser(env, ["google", "intervals"], scoped => app.scheduled(controller, scoped, ctx));
    if(controller.cron==='* * * * *'&&new Date().getUTCMinutes()%5===0)await forEachUser(env,['google'],async scoped=>{await backfillFoodGoogle(scoped.DB);return processFoodGoogle(scoped,{token:googleToken});});
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
    if (STATIC_PATHS.has(url.pathname) && request.method === 'GET') return staticRoute(url);
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
    const signedIn = principal?.kind === "user" && Boolean(user);

    // Legacy Google Health endpoints live in index.js. The deployed Worker
    // uses entrypoint.js, so expose these routes explicitly instead of letting
    // them fall through to the dashboard gateway.
    if (url.pathname === "/sync/intervals" && principal?.kind === "system") {
      return Response.json({status:"ok",users:await forEachUser(rawEnv,["intervals"],scoped=>legacyHealthApi.fetch(request.clone(),scoped,ctx).then(r=>r.json().catch(()=>({status:r.status}))))});
    }
    if (url.pathname === "/sync/google" || url.pathname === "/sync/google/status" || url.pathname === "/health/sleep" || url.pathname === "/health/db") {
      return legacyHealthApi.fetch(request, env, ctx);
    }
    if (url.pathname === "/automation/strength") return handleStrengthAutomation(request, env, ctx);
    if (url.pathname === "/automation/nutrition") return handleNutritionAutomation(request, env, ctx);
    if (url.pathname === "/automation/nutrition-notes") return handleNutritionNotesAutomation(request, rawEnv);
    if (url.pathname === "/automation/planned-calories") return handlePlannedCaloriesAutomation(request, rawEnv);
    const oauthResponse = await handleOAuthCompat(request, env, url.pathname);
    if (oauthResponse) return oauthResponse;
    if (url.pathname === "/mcp") return handleMcpCompat(request, env);
    if (url.pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
      if (!env.OPENAI_APP_CHALLENGE) return new Response("Not configured", { status: 404 });
      return new Response(env.OPENAI_APP_CHALLENGE, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname.startsWith('/oauth/google') && !signedIn) return new Response('Připojení vyžaduje přihlášení do dashboardu.',{status:401});
    const googleOAuth = await handleGoogleOAuth(request, env, url.pathname);
    if (googleOAuth) return googleOAuth;
    if (url.pathname === "/app/logout" && request.method === "POST") return handleDashboardLogout();
    const googleLogin = await handleGoogleLogin(request, rawEnv, url.pathname);
    if (googleLogin) return googleLogin;
    if (url.pathname.startsWith("/app/api/")) {
      if (!user) return unauthorizedResponse();
      return handleDashboardApi(request, env, ctx, url, { user, signedIn });
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
};

function staticRoute(url) {
  if (url.pathname === "/mcp/health") return Response.json({ status: "ok", service: "health-api-mcp", version: "1.1.0", endpoint: "/mcp", protocol: "2026-07-28+legacy" });
  if (url.pathname === "/app") return dashboardPage();
  if (url.pathname === "/app/dashboard-client.js") return new Response(dashboardClient, { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" } });
  if (url.pathname === "/") return homepagePage();
  if (url.pathname === "/privacy") return privacyPage();
  if (url.pathname === "/terms") return policyPage("Terms of Use", `Health & Strength is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.`);
  if (url.pathname === "/support") return policyPage("Support", `Support for Health & Strength is provided through the project repository and its maintainer. Include the affected tool name, approximate time, and non-sensitive error message when reporting a problem. Never include API keys, OAuth refresh tokens, or other secrets in a support request.`);
  if (url.pathname === "/logo.svg") return logoResponse();
  return Response.json({name:"Petr Fitness Data",short_name:"Fitness Data",start_url:"/app",scope:"/app",display:"standalone",background_color:"#0a0d12",theme_color:"#0d131a",icons:[{src:"/logo.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]},{headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"public, max-age=3600"}});
}

function pragueToday() {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  return parts.find(x=>x.type==="year").value+"-"+parts.find(x=>x.type==="month").value+"-"+parts.find(x=>x.type==="day").value;
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
  if(!message) throw new Error("Napiš zprávu pro trenéra.");
  const channel=coachChannel(body?.channel,message), date=String(body?.date||pragueToday()).slice(0,10);
  let reply="", action={type:"advice",date};
  if(channel==="gym") {
    const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date,preview:true})}),env,ctx);
    const d=await r.json().catch(()=>({}));
    if(!r.ok||d.status!=="ok") throw new Error(d.message||"Gym plán se nepodařilo připravit.");
    const rows=(d.plan?.rows||[]).filter(x=>String(x.type||"").toUpperCase()==="WORK");
    reply=`Připravil jsem návrh ${d.plan?.planName||"silového tréninku"}: ${[...new Set(rows.map(x=>x.exercise))].slice(0,4).join(" · ")}. Je postavený podle regenerace, cyklistiky a tvé historie.`;
    action={type:"gym_generate",date};
  } else if(channel==="nutrition") {
    const page=Number((message.match(/(?:str(?:ana|\.)?|page)\s*(\d{1,3})/i)||[])[1]);
    const recipes=await searchCookbookRecipes({page:Number.isFinite(page)&&page>0?page:undefined,name:Number.isFinite(page)&&page>0?undefined:message,limit:3});
    const recipe=recipes.recipes?.[0]||null;
    if(recipe) {
      reply=`Našel jsem v kuchařce „${recipe.name}“${recipe.page?` (str. ${recipe.page})`:""}: ${Math.round(Number(recipe.calories||0))} kcal · B ${Math.round(Number(recipe.protein_g||0))} g · S ${Math.round(Number(recipe.carbs_g||0))} g · T ${Math.round(Number(recipe.fat_g||0))} g. Potvrzením ho zapíšeš do dnešní výživy.`;
      action={type:"food_log",date,page:recipe.page,name:recipe.name};
    } else reply="V kuchařce jsem nenašel jednoznačný recept. Napiš název receptu nebo číslo strany a připravím zápis.";
  } else {
    reply=channel==="cycling"?"Cyklistický trenér bere kolo jako hlavní prioritu. Pro přesný návrh napiš délku, typ jízdy a zda chceš plán nebo kontrolu existující jednotky.":"Připravil jsem doporučení.";
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
    const id=Number(body?.draftId); if(!id) return Response.json({status:"error",message:"Chybí návrh k potvrzení."},{status:400});
    const row=await env.DB.prepare("SELECT * FROM coach_inbox WHERE id=? AND user_id=?").bind(id,env.USER_ID).first();
    if(!row) return Response.json({status:"error",message:"Návrh už neexistuje."},{status:404});
    if(row.status==="confirmed") return Response.json({status:"ok",message:"Tento návrh už je potvrzený."});
    const draft=JSON.parse(row.draft_json||"{}"); let result={status:"ok"};
    if(draft.kind)return Response.json({status:'error',message:'Tento návrh potvrď v osobním asistentovi nebo v náhledu gymu.'},{status:400});
    if(draft.action?.type==="gym_generate") {
      const r=await app.fetch(new Request("https://internal/strength/generate-plan",{method:"POST",headers:{...internalAuth,"Content-Type":"application/json"},body:JSON.stringify({date:draft.date})}),env,ctx);
      result=await r.json().catch(()=>({status:"error",message:"Neplatná odpověď Gymu"})); if(!r.ok||result.status!=="ok") throw new Error(result.message||"Gym plán se nepodařilo uložit.");
    }
    if(draft.action?.type==="food_log") result=await logFood(env.DB,{date:draft.date,page:draft.action.page,name:draft.action.name,source:"cookbook",note:"Zapsáno ze schránky trenérů"});
    await env.DB.prepare("UPDATE coach_inbox SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,env.USER_ID).run();
    return Response.json({status:"ok",message:draft.action?.type==="food_log"?"Jídlo je zapsané ve výživě.":draft.action?.type==="gym_generate"?"Gym plán je uložený a odeslaný do tréninku.":"Doporučení potvrzeno.",result},{headers:{"Cache-Control":"no-store"}});
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
      await recordWorkoutFeedback(env.DB,{workoutId:link.workout_id,scheduledDate:link.scheduled_date,completedPercent:m.completedPercent,rpe:m.rpe,survey:"auto_completed",notes:"Automaticky spárováno s dokončenou aktivitou v Intervals.icu"});
    }
  }catch(error){console.error("Workout capability reconciliation failed",error)}
}
// RPE on the completed activity in Intervals.icu (whole numbers 1–10).
async function writeIntervalsRpe(env,activityId,rpe){
  if(!env.INTERVALS_API_KEY||!activityId)return {status:'skipped'};
  try{
    const r=await fetch('https://intervals.icu/api/v1/activity/'+encodeURIComponent(activityId),{method:'PUT',headers:{Authorization:'Basic '+btoa('API_KEY:'+String(env.INTERVALS_API_KEY)),Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({icu_rpe:Math.round(Number(rpe))}),signal:AbortSignal.timeout(10000)});
    return r.ok?{status:'ok'}:{status:'error',message:'Intervals.icu odpovědělo HTTP '+r.status};
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
  const rows=(await env.DB.prepare("SELECT data_type,source_family,start_time,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family='intervals' AND data_type IN ('planned-workout','activity')) OR (source_family='google-wearables' AND data_type='exercise')) AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate')").bind(env.USER_ID,start,end).all().catch(()=>({results:[]}))).results||[];
  const gymDays=new Set(((await env.DB.prepare("SELECT DISTINCT workout_date FROM strength_sets WHERE user_id=? AND workout_date>=? AND workout_date<?").bind(env.USER_ID,start,end).all().catch(()=>({results:[]}))).results||[]).map(r=>r.workout_date));
  const days=Array.from({length:7},(_,i)=>({date:shiftDate(start,i),done:loadOn(shiftDate(start,i)),planned:0,sports:[]}));
  for(const r of rows){let p={};try{p=JSON.parse(r.payload_json||'{}');}catch{}const d=days.find(x=>x.date===String(r.start_time||'').slice(0,10));if(!d)continue;
    const sport=sportOfType(r.source_family==='google-wearables'?{WEIGHTLIFTING:'weight',STRENGTH_TRAINING:'weight',RUNNING:'run',BIKING:'ride'}[p.exercise?.exerciseType]:p.type);
    if(r.data_type==='planned-workout'&&!/nutrition/i.test(String(p.name||'')+' '+String(p.category||''))){d.planned+=Number(p.icu_training_load)||0;}
    if(sport&&!/nutrition/i.test(String(p.name||'')))d.sports.push(sport);}
  for(const d of days)if(gymDays.has(d.date))d.sports.push('gym');
  return capWeekTargets(weekTargets({roles:planWeekRoles(prefs.days),ctl,lastWeekLoad,days,today,weekStart:start}),prefs);
}
const mondayOfDate=iso=>shiftDate(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));

// Everything the coaches look at for one day: the day, fitness, three weeks
// around it, gym history, sleep and Google Health.
async function loadCoachInputs(env,ctx,internalAuth,date){
  const monday=iso=>shiftDate(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));
  const start=monday(date),weeks=[shiftDate(start,-7),start,shiftDate(start,7)];
  const internal=path=>handleDashboardApi(new Request('https://internal'+path),env,ctx,new URL('https://internal'+path));
  const [dailyResponse,fitnessResponse,gymResponse,sleepResponse,health,...weekResponses]=await Promise.all([
    app.fetch(new Request('https://internal/analysis/daily?date='+date,{headers:internalAuth}),env,ctx),
    internal('/app/api/fitness?days=90'),internal('/app/api/gym?date='+date),
    app.fetch(new Request('https://internal/health/sleep?start='+shiftDate(date,-7)+'&end='+shiftDate(date,1),{headers:internalAuth}),env,ctx),
    googleDashboard(env.DB,date).catch(()=>({})),
    ...weeks.map(w=>internal('/app/api/week?start='+w))
  ]);
  const json=r=>r.json().catch(()=>({}));
  const [daily,fitness,gym,sleep,profile,...weekData]=await Promise.all([json(dailyResponse),json(fitnessResponse),json(gymResponse),json(sleepResponse),dashboardProfile(env),...weekResponses.map(json)]);
  applyEnergyBudget(daily,profile,health);
  return {date,daily,fitness,gym,health:{...health,sleep:sleep.sessions||[]},week:{status:'ok',days:weekData.flatMap(w=>w.days||[])},focus:athleteFocus(profile,date),athleteState:await getAthleteState(env.DB)};
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
    app.fetch(new Request('https://internal/health/sleep?start='+shiftDate(date,-21)+'&end='+to,{headers:internalAuth}),env,ctx).then(r=>r.json()).catch(()=>({})),
    env.DB.prepare("SELECT consumed_at,recipe_title,kcal,carbs_g FROM food_logs WHERE user_id=? AND consumed_date=? ORDER BY consumed_at").bind(env.USER_ID,date).all().then(r=>r.results||[]).catch(()=>[]),
    recentWorkoutFeedback(env.DB,shiftDate(date,-21)),
    workoutId?getWorkout(env.DB,workoutId).catch(()=>null):null,
    dashboardProfile(env).catch(()=>null)
  ]);
  // One night per day: the longest session ending that day.
  const nights=new Map();for(const s of sleep.sessions||[]){const d=s.date||String(s.endTime||'').slice(0,10);if(d&&(!nights.has(d)||Number(s.durationMin)>Number(nights.get(d).durationMin)))nights.set(d,{date:d,durationMin:Number(s.durationMin)||null});}
  return {
    workout:workout?{id:workout.id,name:workout.name,system:workout.primary_system,sport:workout.sport,durationMinutes:workout.duration_minutes}:null,
    activities:dedupeActivities(activityRows.map(activityFromRow)),
    wellness:fitness.wellness||[],sleep:[...nights.values()],food,recentFeedback,focus:athleteFocus(profile,date),athleteState:await getAthleteState(env.DB)
  };
}

async function handleDashboardApi(request, env, ctx, url, session = {}) {
  env={...env,INTERFACE_LANGUAGE:String(request.headers.get('X-Interface-Language')||'cs').slice(0,20)};
  const internalAuth = { "Authorization": "Bearer " + String(env.STRENGTH_API_KEY || "") };
  if(url.pathname==='/app/api/athlete-state'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    try{
      if(request.method==='GET')return Response.json({status:'ok',state:await getAthleteState(env.DB)},{headers:{'Cache-Control':'no-store'}});
      if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
      const body=await request.json();
      return Response.json({status:'ok',state:await updateAthleteState(env.DB,{status:body.status,note:body.note,statusUntil:body.statusUntil,forget:body.forget,dismiss:body.dismiss})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  if(url.pathname==='/app/api/coach/check-in'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    try{
      const date=pragueToday(),state=await getAthleteState(env.DB),inputs=await loadCoachInputs(env,ctx,internalAuth,date);
      return Response.json({status:'ok',state,advice:proactiveAdvice({...inputs,state})},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/coach/week'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    try{
      const body=await request.json(),start=validTrainingDay(body.start)?mondayOfDate(body.start):mondayOfDate(pragueToday());
      const today=pragueToday();
      const [prefs,state,inputs,athleteFeedback,coachNotes]=await Promise.all([getWeekPlan(env.DB,start),getAthleteState(env.DB),loadCoachInputs(env,ctx,internalAuth,today),recentWorkoutFeedback(env.DB,shiftDate(today,-21)),listReflections(env.DB,{limit:5}).catch(()=>[])]);
      if(!inputs.week.days.some(d=>d.date===start)){const extra=await handleDashboardApi(new Request('https://internal/app/api/week?start='+start),env,ctx,new URL('https://internal/app/api/week?start='+start));const data=await extra.json();inputs.week.days.push(...(data.days||[]));}
      const [weather,history]=await Promise.all([weekWeather(prefs.location,start),planningHistory(env,start<pragueToday()?start:pragueToday(),21)]),proposal=weekProposal({prefs,state,start,today:pragueToday(),week:inputs.week,fitness:inputs.fitness,focus:inputs.focus,weather,history});
      const context=weekReviewContext({inputs,prefs,state,start,today,proposal,weather,history,athleteFeedback,coachNotes});
      const weeks=[...new Set(inputs.week.days.filter(d=>d.date>=today&&d.date<=context.reviewScope.end).map(d=>mondayOfDate(d.date)))];
      const effectiveWeeks=new Map(await Promise.all(weeks.map(async w=>[w,await getWeekPlan(env.DB,w)])));
      context.availabilityByDate=Object.fromEntries(inputs.week.days.filter(d=>d.date>=today&&d.date<=context.reviewScope.end).map(d=>[d.date,effectiveWeeks.get(mondayOfDate(d.date)).availability[(new Date(d.date+'T12:00:00Z').getUTCDay()+6)%7]]));
      if(start<today)context.weatherUpcoming=await weekWeather(prefs.location,today);
      let review=fallbackWeekReview(context),aiError=null;
      if(env.OPENAI_API_KEY){try{
        review={...await askCoach(env,WEEK_REVIEW_REQUEST,context,{focus:inputs.focus,task:'planning',actions:true,concise:true}),source:'ai'};
      }catch(error){aiError=error.message}}
      context.userMessage='Zkontroluj budoucí plán a navrhni změny.';
      const actions=validateCoachActions(review.actions,context,today),drafts=[];await ensureCoachInboxTable(env.DB);
      for(const action of actions){const ins=await env.DB.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)').bind(env.USER_ID,'cycling','Revize budoucího plánu od '+today,JSON.stringify({kind:'coach_action',action})).run();drafts.push({...action,draftId:ins.meta?.last_row_id});}
      await updateAthleteState(env.DB,{turn:[{role:'user',content:'Navrhnout tréninky · týden '+start},{role:'assistant',content:review.answer.slice(0,16000)}]});
      return Response.json({status:'ok',start,proposal,review:{...review,actions:drafts},actions:drafts,reviewScope:context.reviewScope,reviewedCount:context.remainingPlanned.length,aiError},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:400})}
  }
  if (url.pathname === "/app/api/me" && request.method === "GET") {
    return Response.json({status:"ok",user:session.user||null,missingProviders:missingProviders(env)},{headers:{"Cache-Control":"no-store"}});
  }
  if (url.pathname.startsWith("/app/api/admin/")) return handleAdminApi(request, env, url, session);
  // Connections are optional: without them the dashboard works from manual
  // entries (weight, food) and the profile; missingProviders drives the
  // connection prompt in the client.
  if(url.pathname==='/app/api/gym/exercises'&&request.method==='GET')return Response.json({status:'ok',exercises:gymExerciseCatalog()},{headers:{'Cache-Control':'no-store'}});
  if(url.pathname==='/app/api/sync/recent'&&request.method==='POST')return legacyHealthApi.fetch(new Request('https://internal/sync/google/recent',{method:'POST',headers:internalAuth}),env,ctx);
  if(url.pathname==='/app/api/profile'){await env.DB.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY (user_id,id))").run();if(request.method==='POST'){const profile=normalizeProfile(await request.json().catch(()=>({})));await env.DB.prepare('INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?) ON CONFLICT(user_id,id) DO UPDATE SET profile_json=excluded.profile_json').bind(env.USER_ID,JSON.stringify(profile)).run();return Response.json({status:'ok',profile});}const r=await env.DB.prepare('SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1').bind(env.USER_ID).first();const suggestions=await refreshSuggestions(env,{googleToken}).catch(error=>{console.error('Profile suggestions failed',error.message);return null;});return Response.json({profile:r?JSON.parse(r.profile_json):null,suggestions});}
  if(url.pathname==='/app/api/google-health'&&request.method==='GET'){
    const date=url.searchParams.get('date')||pragueToday();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>pragueToday())return Response.json({message:'Neplatné datum.'},{status:400});
    return Response.json(await googleDashboard(env.DB,date),{headers:{'Cache-Control':'no-store'}});
  }
  // Planned workouts: move (drag between days) or delete, in Intervals.icu and locally.
  if(url.pathname==='/app/api/planned/move'||url.pathname==='/app/api/planned/delete'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if(request.method!=='POST')return Response.json({message:'Method not allowed'},{status:405});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    try{
      const body=await request.json().catch(()=>({}));
      if(url.pathname.endsWith('/move')&&String(body.date||'')<pragueToday())return Response.json({status:'error',message:'Trénink jde přesunout jen na dnešek nebo pozdější den.'},{status:400});
      return Response.json(url.pathname.endsWith('/move')?await movePlannedEvent(env,body):await deletePlannedEvent(env,body),{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  // "Revize dne": the coach checks one planned day in the context of the week.
  if(url.pathname==='/app/api/coach/review'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:'AI není připojena (chybí OPENAI_API_KEY).'},{status:503});
    try{
      const body=await request.json().catch(()=>({})),date=/^\d{4}-\d{2}-\d{2}$/.test(String(body.date||''))?body.date:pragueToday();
      const [inputs,gym,prefs,feedback,notes]=await Promise.all([loadCoachInputs(env,ctx,internalAuth,date),readGymPlan(env.DB,date).catch(()=>null),getWeekPlan(env.DB,date).catch(()=>null),recentWorkoutFeedback(env.DB,shiftDate(date,-21)).catch(()=>[]),listReflections(env.DB,{limit:3}).catch(()=>[])]);
      const gymRows=gym?.stored?parseStrengthSheet(gym.values).rows||[]:[];
      const input=buildReviewInput({date,today:pragueToday(),week:inputs.week,fitness:inputs.fitness,health:inputs.health,gymRows,roles:prefs?planWeekRoles(prefs.days):[],feedback,coachNotes:notes.map(r=>({date:r.date,text:r.text}))});
      const state=await getAthleteState(env.DB);Object.assign(input,{athleteState:state.status,statusNote:state.note,preferenceMemory:state.memories,availability:availabilityOn(prefs,date)});
      const reviews=[await reviewDay(env,input,null,inputs.focus).catch(error=>({model:lightModel(env),error:error.message}))];
      return Response.json({status:'ok',date,reviews},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  // The coach's notes: listed per day; a POST asks for a note on a day now.
  if(url.pathname==='/app/api/coach/reflections'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    const validDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&String(v)<=pragueToday();
    try{
      if(request.method==='GET'){const date=url.searchParams.get('date');return Response.json({status:'ok',reflections:await listReflections(env.DB,{date:validDay(date)?date:null,limit:10})},{headers:{'Cache-Control':'no-store'}});}
      if(request.method==='POST'){
        if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
        const body=await request.json().catch(()=>({})),date=validDay(body.date)?body.date:pragueToday();
        const notes=typeof body.notes==='string'&&body.notes.trim()?body.notes.trim().slice(0,1000):null,rpe=Number.isFinite(Number(body.rpe))&&Number(body.rpe)>=1&&Number(body.rpe)<=10?Number(body.rpe):null;
        const reflection=await createReflection(env,{date,rpe,notes},day=>reflectionData(env,ctx,internalAuth,day));
        return Response.json({status:'ok',reflection},{headers:{'Cache-Control':'no-store'}});
      }
    }catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/fitness-insights'&&request.method==='GET'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    try{return Response.json(await loadFitnessInsights(env.DB,pragueToday()),{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({status:'error',message:error.message},{status:500})}
  }
  if(url.pathname==='/app/api/week-plan'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    try{
      let prefs;
      const start=url.searchParams.get('start');
      if(start&&!validTrainingDay(start))throw new Error('Neplatné datum týdne.');
      if(request.method==='POST'){if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});prefs=await saveWeekPlan(env.DB,await request.json(),start);}
      else if(request.method==='DELETE'){if(!start)throw new Error('Vyber týden.');if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});prefs=await resetWeekPlan(env.DB,start);}
      else if(request.method==='GET')prefs=await getWeekPlan(env.DB,start);
      else return Response.json({message:'Method not allowed'},{status:405});
      const monday=start?mondayOfDate(start):mondayOfDate(pragueToday());
      const targets=await computeWeekTargets(env,ctx,monday,prefs).catch(error=>({status:'error',message:error.message,items:[]}));
      const historyEstimate=activityHistoryEstimate(await planningHistory(env,pragueToday(),21),pragueToday());
      return Response.json({status:'ok',prefs,roles:planWeekRoles(prefs.days),start:monday,targets,historyEstimate},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  }
  if(url.pathname==='/app/api/training-profile'||url.pathname==='/app/api/training-profile/estimate'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
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
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    const body=await request.json().catch(()=>({})),message=String(body.message||'').trim();
    if(!message||message.length>4000)return Response.json({message:'Zadej požadavek do 4000 znaků.'},{status:400});
    const memory=explicitPreference(message),athleteState=memory?await updateAthleteState(env.DB,{memory}):await getAthleteState(env.DB);
    if(!env.OPENAI_API_KEY)return memory?Response.json({status:'ok',answer:'Zapamatoval jsem si: '+memory,memorySaved:memory}):Response.json({status:'unavailable',message:'AI není připojena (chybí OPENAI_API_KEY).'},{status:503});
    // "Měl jsem snickers": a draft of food entries to confirm, not a coach answer.
    if(body.mode!=='coach'&&isFoodLogMessage(message)){
      try{const draft=await buildFoodDraft(env,message,pragueToday());if(draft.items.length)return Response.json({status:'ok',kind:'food_draft',draft,answer:foodDraftSummary(draft)},{headers:{'Cache-Control':'no-store'}});}
      catch(error){console.error('Food sentence failed',error.message);}
    }
    const date=pragueToday(),task=assistantTask(message),started=Date.now();
    const availabilityMinutes=Number.isFinite(Number(body.availabilityMinutes))?Number(body.availabilityMinutes):null;
    const manualReadiness=Number.isFinite(Number(body.manualReadiness))?Number(body.manualReadiness):null;
    const goal=body.goal&&typeof body.goal==='object'?body.goal:null;
    const preferences=body.preferences&&typeof body.preferences==='object'?body.preferences:{};
    const reply=async onAnswer=>{
      let inputs={},coachCtx={date};
      if(task!=='simple'){
        ctx.waitUntil(reconcileWorkoutLibraryCompletions(env,ctx,internalAuth).catch(error=>console.error('Assistant reconciliation failed',error.message)));
        const [loaded,capabilities,athleteFeedback,notes,prefs,blockHistory]=await Promise.all([
          loadCoachInputs(env,ctx,internalAuth,date),getCapabilities(env.DB),recentWorkoutFeedback(env.DB,shiftDate(date,-28)),listReflections(env.DB,{limit:5}).catch(()=>[]),
          getWeekPlan(env.DB,date).then(async prefs=>({...prefs,weather:task==='adjustment'?null:await weekWeather(prefs.location,mondayOfDate(date))})),
          task==='block'?planningHistory(env,date,84):null
        ]);
        inputs=loaded;Object.assign(preferences,{...prefs,...preferences});
        const coachNotes=notes.map(r=>({date:r.date,text:r.text}));
        coachCtx=coachContext({...inputs,availabilityMinutes,manualReadiness,goal,preferences,capabilities,athleteFeedback,coachNotes,athleteState});
        Object.assign(coachCtx,{availability:prefs.availability,weeklyActivities:prefs.weeklyActivities,weather:prefs.weather});
        if(blockHistory)Object.assign(coachCtx,{blockHistory,blockFitness:inputs.fitness.wellness||[],historyPeriod:{from:shiftDate(date,-84),to:date,source:'cached activities; missing records remain unknown'}});
      }
      Object.assign(coachCtx,{athleteState:athleteState.status,statusNote:athleteState.note,statusUntil:athleteState.statusUntil,preferenceMemory:athleteState.memories,conversation:athleteState.conversation});
      const rec=coachCtx.cyclingCoachV2?.recommendation?.session||{},kind=rec.kind==="long_endurance"?"endurance":rec.kind==="vo2"?"vo2max":rec.kind;
      const library=task==='planning'||task==='block'?athleteState.status==='active'?await searchWorkoutLibrary(env.DB,{system:kind,durationMinutes:rec.durationMinutes||availabilityMinutes||90,durationTolerance:20,limit:8},{
        readiness:coachCtx.cyclingCoachV2?.readiness?.status,
        hardBikeDaysRolling7d:coachCtx.cyclingCoachV2?.load?.hardBikeDaysRolling7d,
        phase:coachCtx.cyclingCoachV2?.constraints?.phase
      }):{workouts:[]}:{workouts:[]};
      coachCtx.workoutLibraryRecommendations=(library.workouts||[]).map(w=>({id:w.id,name:w.name,source:w.source_name,sourceKind:w.source_kind,system:w.primary_system,durationMinutes:w.duration_minutes,targetLoad:w.target_load,difficulty:w.difficulty,suitability:w.suitability,challengeGap:w.challenge_gap,structure:w.intervals_description,reasons:w.reasons}));
      const contextMs=Date.now()-started,answer=await askCoach(env,message,coachCtx,{focus:inputs.focus,actions:true,task,onAnswer});
      coachCtx.userMessage=message;coachCtx.gymPlan=inputs.gym;
      const actions=validateCoachActions(answer.actions,coachCtx,date),proposals=[];await ensureCoachInboxTable(env.DB);
      for(const action of actions){const draft={kind:'coach_action',action};const ins=await env.DB.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)').bind(env.USER_ID,'cycling',message,JSON.stringify(draft)).run();proposals.push({...action,draftId:ins.meta?.last_row_id});}
      await updateAthleteState(env.DB,{turn:[{role:'user',content:message},{role:'assistant',content:answer.answer.slice(0,16000)}]});
      return {...answer,actions:proposals,memorySaved:memory,costUsd:usageCost(answer.model,answer.usage),timings:{contextMs,modelMs:answer.ms,totalMs:Date.now()-started}};
    };
    if(body.stream)return assistantStreamResponse(reply);
    try{return Response.json(await reply(null),{headers:{'Cache-Control':'no-store'}});}
    catch(error){console.error('Assistant request failed',error);return Response.json({message:'AI odpověď se nepodařilo připravit.'},{status:502});}
  }
  if(url.pathname==='/app/api/assistant/action'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    try{
      const body=await request.json();await ensureCoachInboxTable(env.DB);
      const row=await env.DB.prepare('SELECT * FROM coach_inbox WHERE user_id=? AND id=?').bind(env.USER_ID,Number(body.draftId)).first();
      if(!row)throw new Error('Návrh neexistuje.');
      const draft=JSON.parse(row.draft_json);if(draft.kind!=='coach_action')throw new Error('Neplatný návrh.');
      if(row.status!=='draft')return Response.json({status:'ok',message:'Návrh už byl vyřízen.'});
      if(!['confirm','reject'].includes(body.decision))throw new Error('Potvrď nebo odmítni návrh.');
      let result=null;
      if(body.decision==='confirm'){
        const a=draft.action;
        if(a.type==='status')result=await updateAthleteState(env.DB,{status:a.status,note:a.reason});
        else if(a.type==='gym_swap'){
          if(a.date!==pragueToday())throw new Error('Návrh je určený pro jiný den. Požádej o nový návrh.');
          assertTrainingAllowed(await getAthleteState(env.DB));
          const latest=await readGymPlan(env.DB,a.date),values=applyGymSwap(latest.values,a);
          const saved=await env.DB.prepare('UPDATE gym_plans SET values_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND workout_date=? AND values_json=?').bind(JSON.stringify(values),env.USER_ID,a.date,JSON.stringify(latest.values)).run();
          if(saved.meta?.changes!==1)throw new Error('Plán se mezitím změnil. Požádej o nový návrh.');
          result={status:'ok',date:a.date,values};
        }
        else if(a.type==='workout'){
          const path=a.sport==='gym'?'/app/api/gym/generate':'/app/api/workouts/generate';
          const internalUrl=new URL('https://internal'+path),response=await handleDashboardApi(new Request(internalUrl,{method:'POST',headers:{Origin:internalUrl.origin,'Content-Type':'application/json'},body:JSON.stringify({date:a.date,sport:a.sport,durationMinutes:a.minutes,availabilityMinutes:a.minutes,environment:'auto',preview:true})}),env,ctx,internalUrl,{signedIn:true});
          result=await response.json();if(!response.ok||result.status!=='ok')throw new Error(result.message||'Trénink se nepodařilo připravit.');
        }else{
          const id=a.eventId.replace(/^planned:/,''),event=await env.DB.prepare("SELECT start_time,payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='planned-workout' AND external_id=?").bind(env.USER_ID,'planned:'+id).first();
          const payload=event?JSON.parse(event.payload_json||'{}'):null;
          if(!event||String(event.start_time).slice(0,10)!==a.eventSnapshot.date||payload.name!==a.eventSnapshot.name||a.eventSnapshot.date<pragueToday())throw new Error('Plán se mezitím změnil. Požádej o nový návrh.');
          if(!env.INTERVALS_API_KEY)throw new Error('Nejprve připoj Intervals.icu.');
          const latest=await fetch('https://intervals.icu/api/v1/athlete/0/events/'+encodeURIComponent(id),{headers:{Authorization:'Basic '+btoa('API_KEY:'+env.INTERVALS_API_KEY),Accept:'application/json'}});
          if(!latest.ok)throw new Error('Aktuální trénink se nepodařilo ověřit v Intervals.icu.');
          const live=await latest.json();if(live.name!==a.eventSnapshot.name||String(live.start_date_local).slice(0,10)!==a.eventSnapshot.date)throw new Error('Trénink se v Intervals.icu změnil. Požádej o nový návrh.');
          if(a.type==='move')result=await movePlannedEvent(env,a);
          else if(a.type==='rest')result=await deletePlannedEvent(env,a);
        }
      }
      await env.DB.prepare('UPDATE coach_inbox SET status=?,confirmed_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?').bind(body.decision==='confirm'?'confirmed':'rejected',env.USER_ID,row.id).run();
      return Response.json({status:'ok',message:body.decision==='reject'?'Návrh odmítnut.':'Návrh potvrzen.',action:draft.action,result},{headers:{'Cache-Control':'no-store'}});
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
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
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
    try {const body=await request.json(),name=String(body.name||'').slice(0,180),barcode=String(body.barcode||'').slice(0,24),candidates=await searchPersonalFoods(env.DB,name,barcode);return Response.json({status:'ok',candidates,product:candidates[0]||null},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return Response.json({message:'Uložené potraviny se nepodařilo načíst. Zkus to znovu nebo zadej hodnoty z etikety.',detail:String(error.message).slice(0,160)},{status:500});}
  }
  // A food not saved yet: AI looks up its label values on the web. Only a
  // proposal; the user confirms it and the app saves it with the barcode.
  if(url.pathname==='/app/api/food/ai-lookup'&&request.method==='POST'){
    if(!env.OPENAI_API_KEY)return Response.json({status:'unavailable',message:'AI není připojena (chybí OPENAI_API_KEY). Zadej hodnoty z etikety.'},{status:503});
    try{
      const body=await request.json().catch(()=>({})),name=String(body.name||'').slice(0,180),barcode=String(body.barcode||'').slice(0,24);
      const r=await lookupFoodWithAI(env,{name,barcode,language:env.INTERFACE_LANGUAGE});
      if(!r.product)return Response.json({status:'not_found',message:'AI výrobek s jistotou nenašla. Zadej hodnoty z etikety (nebo ji vyfoť).'},{headers:{'Cache-Control':'no-store'}});
      return Response.json({status:'ok',product:{...r.product,name:r.product.name||name},model:r.model},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({status:'error',message:'Dohledání přes AI selhalo: '+String(error.message).slice(0,160)},{status:502});}
  }
  if(url.pathname==='/app/api/food/label'&&request.method==='POST'){
    const body=await request.json().catch(()=>({})),text=String(body.text||'').slice(0,12000);return Response.json(body.mode==='portion'?{status:'ok',...parseNutritionPortion(text)}:{status:'ok',values:parseNutritionLabel(text)});
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
      if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
      if(request.method==='POST'){const body=await request.json().catch(()=>({}));return Response.json({status:'ok',entry:await addFluid(env.DB,{date:validDay(body.date)?body.date:pragueToday(),ml:body.ml,kind:body.kind,at:body.at})},{headers:{'Cache-Control':'no-store'}});}
      if(request.method==='DELETE'){await deleteFluid(env.DB,url.searchParams.get('id'));return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});}
      return Response.json({message:'Method not allowed'},{status:405});
    }catch(error){return Response.json({status:'error',message:error.message},{status:400});}
  }
  if(url.pathname==='/app/api/food/recipe'&&request.method==='GET'){
    const recipe=await getCookbookRecipeByPage(url.searchParams.get('page'));
    return Response.json(recipe?{recipe}:{message:'Na této stránce není známý recept.'},{status:recipe?200:404,headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/food/log'&&request.method==='POST'){
    try {const body=await request.json(),p=body.product||{};
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||!String(p.name||'').trim()) return Response.json({message:'Zkontroluj název a datum.'},{status:400});
      for(const field of ['calories_100g','protein_100g','carbs_100g','fat_100g'])if(p[field]==null||p[field]===''||!Number.isFinite(Number(p[field]))||Number(p[field])<0||Number(p[field])>(field==='calories_100g'?(p.nutrition_basis==='portion'?10000:1000):(p.nutrition_basis==='portion'?1000:100)))return Response.json({message:'Doplň energii i všechna tři makra pro zvolený základ tabulky.'},{status:400});
      let amount;try{amount=foodIntake(p,body.quantity??body.grams,body.unit||(p.nutrition_basis==='portion'?'portion':p.nutrition_basis==='ml'?'ml':'g'),{pieceAmount:body.pieceAmount,pieceUnit:body.pieceUnit,density:body.density});}catch(error){return Response.json({message:error.message},{status:400});}
      const ingredients=Array.isArray(body.ingredients)?body.ingredients.slice(0,50).map(a=>({name:String(a.name||'').slice(0,180),amount:Number(a.amount)||null,unit:['g','ml','portion'].includes(a.unit)?a.unit:'g'})):[];
      const saved=await legacyHealthApi.fetch(new Request(new URL('/food/log',request.url),{method:'POST',headers:{...internalAuth,'Content-Type':'application/json'},body:JSON.stringify({date:body.date,name:String(p.name).slice(0,180),kcal:amount.calories,protein_g:amount.protein_g,carbs_g:amount.carbs_g,fat_g:amount.fat_g,fiber_g:amount.fiber_g,source:'package_label',note:JSON.stringify({product:productFromLabel(p),amount:amount.amount,unit:amount.unit,enteredQuantity:body.quantity??body.grams,enteredUnit:body.unit||'g',barcode:p.barcode||null,brand:p.brand||null,mealType:body.mealType||'snack',salt_g:amount.salt_g,source_url:p.source_url||null,ingredients})})}),env,ctx);
      const result=await saved.json();if(!saved.ok)throw new Error('Uložení selhalo.');
      let personal=null,warning=null;
      if(p.source!=='composed'){try{personal=await savePersonalFood(env.DB,p);}catch(error){warning='Jídlo je zapsané, ale potravinu pro příště se nepodařilo uložit: '+error.message;}}
      const google=await queueFoodGoogleSafely(env,ctx,result.id);
      warning ||= google.status==='error'?google.message:null;
      return Response.json({...result,google,personal,warning,message:warning||'Jídlo je zapsané'+(personal?' a potravina uložená pro příště':'')+'.'},{headers:{'Cache-Control':'no-store'}});
    }catch{return Response.json({message:'Jídlo se nepodařilo uložit. Zkontroluj hodnoty a zkus to znovu.'},{status:500});}
  }

  if (url.pathname === "/app/api/connections" && request.method === "GET") {
    return Response.json(await connectionStatus(env), {headers:{"Cache-Control":"no-store"}});
  }
  if (url.pathname === '/app/api/connections' && (request.method === 'POST' || request.method === 'DELETE')) {
    if (!session.signedIn) return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if (request.headers.get('Origin') !== url.origin) return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    const body=await request.json().catch(()=>({}));
    if (request.method === 'DELETE') {
      if(!['google','intervals'].includes(body.provider)) return Response.json({message:'Neznámé připojení.'},{status:400});
      await deleteConnectionSecret(env,body.provider);
      if(body.provider==='google') await deleteConnectionSecret(env,'google_scopes');
      return Response.json({status:'ok',message:'Připojení je odebrané.'},{headers:{'Cache-Control':'no-store'}});
    }
    if(body.provider!=='intervals'||typeof body.key!=='string'||body.key.trim().length<8||body.key.length>512) return Response.json({message:'Zadej platný API klíč Intervals.icu.'},{status:400});
    const apiKey=body.key.trim();
    const check=await fetch('https://intervals.icu/api/v1/athlete/0',{headers:{Authorization:'Basic '+btoa('API_KEY:'+apiKey),Accept:'application/json'}});
    if(!check.ok) return Response.json({message:'Intervals klíč nepřijal. Zkontroluj klíč v nastavení Intervals.'},{status:400});
    const athlete=await check.json().catch(()=>({}));
    await saveConnectionSecret(env,'intervals',apiKey);
    return Response.json({status:'ok',athleteId:athlete.id||null,message:'Intervals.icu je připojené'+(athlete.name?' ('+athlete.name+')':'')+'.'},{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname==='/app/api/activity-detail'&&request.method==='GET'){
    const id=url.searchParams.get('id');
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id||''))return Response.json({message:'Neplatná aktivita.'},{status:400});
    const known=await env.DB.prepare("SELECT external_id FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND external_id=? LIMIT 1").bind(env.USER_ID,'activity:'+id).first();
    if(!known)return Response.json({message:'Aktivita není v tvé synchronizované historii.'},{status:404});
    return activityDetail(request,env,id,true);
  }
  if (url.pathname === "/app/api/inbox") return handleCoachInbox(request, env, ctx, internalAuth);

  if(url.pathname==='/app/api/coaches'&&request.method==='GET'){
    try{
      const requestedDate=url.searchParams.get('date'),date=validTrainingDay(requestedDate)&&requestedDate<=pragueToday()?requestedDate:pragueToday(),oldest=shiftDate(date,-14);
      const read=path=>app.fetch(new Request('https://internal'+path,{headers:internalAuth}),env,ctx).then(r=>r.ok?r.json():{}).catch(()=>({}));
      const fitnessJob=env.INTERVALS_API_KEY?fetch('https://intervals.icu/api/v1/athlete/0/wellness?oldest='+oldest+'&newest='+date,{headers:{Authorization:'Basic '+btoa('API_KEY:'+env.INTERVALS_API_KEY),Accept:'application/json'}}).then(r=>r.ok?r.json():[]).catch(()=>[]):[];
      const [daily,yesterday,sleepData,rows,profile,athleteState,gym]=await Promise.all([
        read('/analysis/daily?date='+date),read('/analysis/daily?date='+shiftDate(date,-1)),
        read('/health/sleep?start='+oldest+'&end='+shiftDate(date,1)),fitnessJob,dashboardProfile(env),
        date===pragueToday()?getAthleteState(env.DB):{status:'active',note:'',statusUntil:null},readGymPlan(env.DB,date).catch(()=>null)
      ]);
      const latest=Array.isArray(rows)&&rows.length?rows.filter(r=>String(r.id||'')<=date).at(-1)||{}:{};
      const fitness={...latest,tsb:latest.ctl!=null&&latest.atl!=null?Number(latest.ctl)-Number(latest.atl):null};
      const council=buildCoachCouncil({date,daily,yesterday,fitness,sleepSessions:sleepData.sessions||[],athleteState,focus:athleteFocus(profile,date),gym});
      // Performance streams belong to a requested detailed review, not every
      // page load or background refresh.
      if(url.searchParams.get('details')==='1')await Promise.all((daily.training?.completed||[]).filter(a=>/^(Ride|VirtualRide|EBikeRide|Cycling|MountainBikeRide|GravelRide)$/i.test(a.type||'')).slice(0,2).map(async a=>{
        const response=await activityDetail(request,env,String(a.id).replace(/^activity:/,''),true);if(!response.ok)return;
        const detail=await response.json(),review=council.reviews.find(r=>r.id==='review-'+a.id);if(!review)return;
        const policy=trainingStatus(athleteState),sections=rideReviewSections(detail.analysis).filter(s=>s.label==='Tréninkový dopad a další krok'||s.label==='Intenzita a rovnoměrnost').slice(0,2);
        review.analysis=sections.map(s=>policy.paused&&s.label==='Tréninkový dopad a další krok'?{...s,text:policy.guidance[0]}:s);
      }));
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
      const auth = "Basic " + btoa("API_KEY:" + apiKey);
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

  if(url.pathname==='/app/api/sync'&&['POST','GET'].includes(request.method)){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if(request.method==='GET')return Response.json(await dashboardSyncStatus(env.DB),{headers:{'Cache-Control':'no-store'}});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    if(missingProviders(env).length===2)return Response.json({status:'idle',message:'Žádná služba není propojená.'});
    const run=await startDashboardSync(env.DB,ctx,async()=>{
      const providers=env.CONNECTED_PROVIDERS||[],jobs=[];
      const collect=async(source,path)=>{
        try{const response=await legacyHealthApi.fetch(new Request('https://internal'+path,{method:'POST',headers:internalAuth}),env,ctx),data=await response.json();return {source,status:response.ok?data.status||'ok':'error'};}
        catch(error){console.error('Recent sync failed',source,error.message);return {source,status:'error'};}
      };
      if(providers.includes('google'))jobs.push(collect('google','/sync/google/recent'));
      if(providers.includes('intervals'))jobs.push(collect('intervals','/sync/intervals/recent'));
      const results=await Promise.all(jobs);
      results.push(await collect('matching','/sync/match'));
      if(providers.includes('intervals')&&providers.includes('google')){
        const outgoing=await Promise.allSettled([
          syncWeights(env,{googleToken}),
          syncWellnessToIntervals(env,{sleepSessions:(from,to)=>legacyHealthApi.fetch(new Request('https://internal/health/sleep?start='+from+'&end='+shiftDate(to,1)),env,ctx).then(r=>r.json()).then(d=>d.sessions||[])})
        ]);
        outgoing.forEach((r,i)=>results.push({source:i?'wellness':'weight',status:r.status==='fulfilled'?'ok':'error'}));
      }
      return results;
    });
    return Response.json({...run,status:'accepted'},{status:202,headers:{'Cache-Control':'no-store'}});
  }

  if (url.pathname === "/app/api/gym") {
    if (request.method === "GET") {
      // The day's plan and the history both live in D1.
      const date=/^\d{4}-\d{2}-\d{2}$/.test(String(url.searchParams.get('date')||''))?url.searchParams.get('date'):pragueToday();
      let data={status:"ok",values:[],videoLinks:[]};
      try { const plan=await readGymPlan(env.DB,date); data={status:"ok",date,values:plan.stored?plan.values:[],videoLinks:[],stored:plan.stored}; }
      catch(error) { console.error("Gym plan read failed",error); data={status:"partial",values:[],videoLinks:[],message:"Plán se nepodařilo načíst."}; }
      let history=[];
      try { history=await getStrengthHistory(env.DB,500); } catch(error) { console.error("Gym history read failed",error); }
      return Response.json({...data,history,storage:"d1"},{headers:{"Cache-Control":"no-store"}});
    }
    if (request.method === "POST") {
      try {
      const body = await request.json().catch(() => ({}));
      const date = body?.date || pragueToday();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS gym_plans (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, workout_date))`).run();

      if (body?.action === "plan") {
        const values = Array.isArray(body?.values) ? body.values : null;
        if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
        await env.DB.prepare(`INSERT INTO gym_plans(user_id,workout_date,values_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(env.USER_ID,date,JSON.stringify(values)).run();
        return Response.json({status:"ok",storage:"d1",message:"Plán uložen."},{headers:{"Cache-Control":"no-store"}});
      }

      const values = Array.isArray(body?.values) ? body.values : null;
      if (!values) return Response.json({status:"error",message:"values must be a 2D array"},{status:400});
      const sets = values.map((r,i)=>({
        type:String(r?.[0]||"WORK").toUpperCase(), exercise:r?.[1]||"", setNo:r?.[2],
        plannedKg:r?.[3], plannedReps:r?.[4], actualKg:r?.[5], actualReps:r?.[6],
        rpe:r?.[7], completed:["TRUE","true","1","ANO","ano","✓","☑"].includes(String(r?.[8]??"")), note:r?.[9]||"",toFailure:r?.[11]||false,superset:r?.[12]||''
      })).filter(x=>x.exercise && /^(WARMUP|WORK)$/.test(x.type) && x.completed);
      let historyResult=null;
      if(sets.length) historyResult=await importStrengthHistory(env.DB,{date,sets});
      // Keep the editable workout snapshot together with the completed-set
      // history.  The UI can then be safely reloaded after every autosave.
      const storedValues = Array.isArray(body?.fullValues) ? body.fullValues : values;
      await env.DB.prepare(`INSERT INTO gym_plans(user_id,workout_date,values_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP`).bind(env.USER_ID,date,JSON.stringify(storedValues)).run();
      const history=await getStrengthHistory(env.DB,500);
      return Response.json({status:"ok",storage:"d1",values:storedValues,history,historySaved:historyResult,sheetSaved:false,message:sets.length?"Workout uložen do interní databáze.":"Změny plánu jsou uložené; dokončené série označ Hotovo."},{headers:{"Cache-Control":"no-store"}});
      } catch(error) {
        console.error("Gym save failed", error);
        return Response.json({status:"error",message:"Gym save: "+(error?.message||"unknown error")},{status:500,headers:{"Cache-Control":"no-store"}});
      }
    }
    return Response.json({status:"error",message:"Method not allowed"},{status:405});
  }

  if(url.pathname==='/app/api/gym/confirm'&&request.method==='POST'){
    if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
    if(request.headers.get('Origin')!==url.origin)return Response.json({message:'Neplatný původ požadavku.'},{status:403});
    try{
      assertTrainingAllowed(await getAthleteState(env.DB));
      const body=await request.json();await ensureCoachInboxTable(env.DB);
      const row=await env.DB.prepare('SELECT * FROM coach_inbox WHERE user_id=? AND id=?').bind(env.USER_ID,Number(body.draftId)).first();
      if(!row)throw new Error('Návrh už neexistuje.');
      if(row.status==='confirmed')return Response.json({status:'ok',message:'Návrh už je uložený.'});
      const draft=JSON.parse(row.draft_json),plan=draft.plan;
      if(draft.kind!=='gym_preview'||!plan||plan.date<pragueToday())throw new Error('Neplatný nebo starý návrh.');
      if((await readGymPlan(env.DB,plan.date)).stored)throw new Error('Na tento den již existuje gym plán. Otevři jej a uprav ho.');
      const prefs=await getWeekPlan(env.DB,plan.date),budget=trainingBudget(prefs,plan.date,draft.minutes);
      if(budget<draft.minutes)throw new Error('Časové možnosti se změnily. Připrav nový návrh.');
      const r=await app.fetch(new Request('https://internal/strength/sheet/write-plan',{method:'POST',headers:{...internalAuth,'Content-Type':'application/json'},body:JSON.stringify(plan)}),env,ctx);
      if(!r.ok)throw new Error('Gym plán se nepodařilo uložit.');
      const intervals=await writeStrengthPlanToIntervals(env,plan,{durationMinutes:draft.minutes,startTime:draft.startTime||'00:00'}).catch(error=>({status:'error',message:error.message}));
      await env.DB.prepare("UPDATE coach_inbox SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(env.USER_ID,row.id).run();
      return Response.json({status:'ok',intervals,message:'Gym plán je uložený.'},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({message:error.message},{status:409})}
  }
  if (url.pathname === "/app/api/gym/generate" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    // The week plan's gym chip for that day sets the length and upper/full body,
    // unless the request chose them.
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date||"")) ? body.date : pragueToday();
    try {
      assertTrainingAllowed(await getAthleteState(env.DB));
      const prefs=await getWeekPlan(env.DB,day),budget=trainingBudget(prefs,day,body.durationMinutes==null?null:Number(body.durationMinutes));
      if(budget!=null&&budget<30)throw new Error('Na gym potřebuješ alespoň 30 minut dostupného času.');
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
      const saved=await env.DB.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)').bind(env.USER_ID,'gym','Návrh z týdenního plánu',JSON.stringify(draft)).run();
      data.draftId=saved.meta?.last_row_id;
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
    // Same calorie target as the day view: one Google Health read covers the week.
    const profile = await dashboardProfile(env);
    const health = profile ? await googleDashboard(env.DB, dates[6]).catch(error => { console.error("Energy budget unavailable", error.message); return null; }) : null;
    const days = await Promise.all(dates.map(async date => {
      const dailyUrl = new URL("/analysis/daily", request.url);
      dailyUrl.searchParams.set("date", date);
      const foodUrl = new URL("/food/log", request.url);
      foodUrl.searchParams.set("date", date);
      const recommendUrl = new URL("/food/recommend", request.url);
      recommendUrl.searchParams.set("date", date);
      const [dailyResponse, foodResponse, recommendResponse] = await Promise.all([
        app.fetch(new Request(dailyUrl, {method:"GET",headers:internalAuth}), env, ctx),
        app.fetch(new Request(foodUrl, {method:"GET",headers:internalAuth}), env, ctx),
        app.fetch(new Request(recommendUrl, {method:"GET",headers:internalAuth}), env, ctx)
      ]);
      return {
        date,
        daily: applyEnergyBudget(await dailyResponse.json(), profile, {today: health?.wellness?.find(w => w.id === date) || {}}),
        food: await foodResponse.json(),
        recommendations: await recommendResponse.json()
      };
    }));
    return Response.json({status:"ok",start,end:dates[6],days},{headers:{"Cache-Control":"no-store"}});
  }

  const routes = {
    "/app/api/daily": "/analysis/daily",
    "/app/api/weight": "/health/weight",
    "/app/api/activities": "/health/activities",
    "/app/api/nutrition": "/health/nutrition",
    "/app/api/sleep": "/health/sleep",
    "/app/api/health-db": "/health/db"
  };
  const target = routes[url.pathname];
  if (!target) return Response.json({ status: "error", message: "Not found" }, { status: 404 });

  const internal = new URL(target, request.url);
  for (const [key, value] of url.searchParams) internal.searchParams.set(key, value);
  const response = await app.fetch(new Request(internal, { method: "GET", headers: internalAuth }), env, ctx);
  if(url.pathname==='/app/api/daily'&&response.ok){const daily=await response.json();try{const date=url.searchParams.get('date')||pragueToday(),profile=await dashboardProfile(env);if(profile)applyEnergyBudget(daily,profile,await googleDashboard(env.DB,date));}catch(e){console.error('Energy budget unavailable',e.message);}return Response.json(daily,{headers:{'Cache-Control':'no-store'}});}
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

// Workout library: search, generate, schedule, feedback, capabilities.
async function handleWorkoutsApi(request,env,ctx,url,session,internalAuth){
  if(!session.signedIn)return Response.json({message:'Přihlas se do dashboardu.'},{status:401});
  const sport=url.searchParams.get('sport')==='run'?'run':'ride';
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  try{
    if(url.pathname==='/app/api/workouts/capabilities'&&request.method==='GET')return Response.json({status:'ok',sport,capabilities:await getCapabilities(env.DB,sport)},{headers:{'Cache-Control':'no-store'}});
    if(url.pathname==='/app/api/workouts/scheduled'&&request.method==='GET')return Response.json({status:'ok',workouts:await getScheduledWorkouts(env.DB)},{headers:{'Cache-Control':'no-store'}});
    if(url.pathname==='/app/api/workouts/search'&&request.method==='GET'){
      await reconcileWorkoutLibraryCompletions(env,ctx,internalAuth);
      const date=validDate(url.searchParams.get('date'))?url.searchParams.get('date'):pragueToday();
      const coach=buildCyclingCoachV2({...await loadCoachInputs(env,ctx,internalAuth,date),capabilities:await getCapabilities(env.DB,sport),sport});
      const context={readiness:coach.readiness.status,hardBikeDaysRolling7d:coach.load.hardBikeDaysRolling7d,phase:String(url.searchParams.get('phase')||'')};
      // Without a length the list is ranked by the length the coach would pick
      // for the day (50 min or 4 h alike); no length is filtered out.
      const filters=parseWorkoutSearchFilters(url.searchParams),autoDuration=filters.durationMinutes==null&&Number(coach.constraints?.availableMinutes)>0?{durationMinutes:Number(coach.constraints.availableMinutes)}:null;
      if(autoDuration)Object.assign(filters,{durationMinutes:autoDuration.durationMinutes,durationSoft:true});
      // With no type chosen, the type the coach recommends for the day ranks first.
      const coachKind=coach.recommendation?.session?.kind;if(!filters.system&&coachKind)filters.preferredSystem=coachKind==='long_endurance'?'endurance':coachKind==='vo2'?'vo2max':coachKind;
      const [result,thresholds]=await Promise.all([searchWorkoutLibrary(env.DB,filters,context),athleteThresholds(env)]);
      result.autoDuration=autoDuration;result.coachPick={system:filters.preferredSystem||null,durationMinutes:autoDuration?.durationMinutes||null};
      // Step rows with watts or paces for each card.
      for(const w of result.workouts){let structure=[];try{structure=JSON.parse(w.structure_json||'[]')}catch{}w.steps=sport==='run'?stepRows(structure,{environment:w.environment,sport,thresholdPace:thresholds.runThresholdPace,zones:thresholds.paceZones}):stepRows(structure,{environment:w.environment,ftp:w.environment==='indoor'&&thresholds.indoorFtp?thresholds.indoorFtp:thresholds.ftp,zones:thresholds.powerZones});}
      return Response.json({...result,date,athlete:{ftp:thresholds.ftp,indoorFtp:thresholds.indoorFtp,source:thresholds.source,runThresholdPace:thresholds.runThresholdPace,runPaceSource:thresholds.runPaceSource},rankingContext:{...context,tsb:coach.readiness.tsb,readinessScore:coach.readiness.score},sourcePolicy:sport==='run'?'Vlastní PFD běžecké tréninky, publikované výzkumné protokoly (Helgerud, Billat, Seiler, Daniels) a veřejně popsané metody s uvedením zdroje. Placené plány a aplikace se nekopírují.':'Vlastní PFD workouty, publikované výzkumné protokoly a veřejně popsané tréninky profi s uvedením zdroje. Proprietární knihovny (TrainerRoad, Xert, JOIN, Zwift, TrainerDay) se nekopírují.'},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/generate'&&request.method==='POST'){
      const body=await request.json().catch(()=>({}));
      const date=validDate(body.date)?body.date:pragueToday();
      if(date<pragueToday())return Response.json({status:'error',message:'Vyber dnešní nebo budoucí datum.'},{status:400});
      let availabilityMinutes=Number.isFinite(Number(body.availabilityMinutes))&&Number(body.availabilityMinutes)>0?Number(body.availabilityMinutes):null;
      const genSport=body.sport==='run'?'run':'ride';
      // The weekly planner's role for this day (long, easy, quality) steers the coach.
      assertTrainingAllowed(await getAthleteState(env.DB));
      const prefs=await getWeekPlan(env.DB,date),weekRole=roleFor(prefs,date,genSport);
      // The calendar chip's length is the default, so the proposal matches what the week plan shows.
      const weekTarget=prefs&&!availabilityMinutes&&!body.resizeTo?targetFor(await computeWeekTargets(env,ctx,mondayOfDate(date),prefs).catch(()=>null),date,genSport):null;
      if(weekTarget?.minutes)availabilityMinutes=weekTarget.minutes;
      availabilityMinutes=trainingBudget(prefs,date,availabilityMinutes);
      if(availabilityMinutes!=null&&availabilityMinutes<(genSport==='run'?20:30))throw new Error('V tento den nemáš dost času na tento trénink.');
      const weather=await weekWeather(prefs.location,mondayOfDate(date)),suggestedEnvironment=environmentFor(date,genSport,weather[date]);
      const environment=body.environment==='auto'||!body.environment?suggestedEnvironment.environment:body.environment;
      if(environment==='indoor'&&genSport==='ride'&&(!body.environment||body.environment==='auto'))availabilityMinutes=Math.min(availabilityMinutes??90,90);
      const goal=body.phase||weekRole?.focus?{...(body.phase?{phase:String(body.phase)}:{}),...(weekRole?.focus?{focus:weekRole.focus}:{})}:null;
      const coach=buildCyclingCoachV2({...await loadCoachInputs(env,ctx,internalAuth,date),availabilityMinutes,capabilities:await getCapabilities(env.DB,genSport),goal,sport:genSport});
      const thresholds=await athleteThresholds(env);
      const resizeTo=Number.isFinite(Number(body.resizeTo))&&Number(body.resizeTo)>0?trainingBudget(prefs,date,Number(body.resizeTo)):null;
      if(resizeTo!=null&&resizeTo<(genSport==='run'?20:30))throw new Error('Na změnu délky nezbývá dost času.');
      let generated=await generateWorkout(env.DB,{sport:genSport,environment,date,coach,availabilityMinutes:resizeTo??availabilityMinutes,variant:body.variant,thresholds,workoutId:body.workoutId?String(body.workoutId).slice(0,120):null,resizeTo});
      if(availabilityMinutes&&generated.workout?.duration_minutes>availabilityMinutes)generated=await generateWorkout(env.DB,{sport:genSport,environment,date,coach,thresholds,workoutId:generated.workout.id,resizeTo:availabilityMinutes});
      return Response.json({...generated,weekRole,weekTarget,environmentReason:suggestedEnvironment.reason},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/feedback'&&request.method==='POST'){
      // Completion comes from the activity paired in Intervals.icu; the athlete adds RPE (and a note).
      const body=await request.json().catch(()=>({})),workoutId=String(body.workoutId||''),scheduledDate=String(body.scheduledDate||'');
      let completedPercent=Number(body.completedPercent),activityId=null;
      const link=validDate(scheduledDate)?await scheduledLink(env.DB,workoutId,scheduledDate):null;
      const m=link?await matchScheduledActivity(env,ctx,internalAuth,link):null;
      if(m){activityId=m.activityId;if(!Number.isFinite(completedPercent))completedPercent=m.completedPercent;}
      if(!Number.isFinite(completedPercent))return Response.json({status:'error',message:'K tomuto workoutu jsem v Intervals.icu zatím nenašel dokončenou aktivitu. RPE zadáš, až bude aktivita nahraná a spárovaná s plánem.'},{status:409});
      const notes=typeof body.notes==='string'&&body.notes.trim()?body.notes.trim().slice(0,1000):null,rpe=body.rpe==null||body.rpe===''?null:Number(body.rpe);
      const result=await recordWorkoutFeedback(env.DB,{workoutId,scheduledDate,completedPercent,rpe,survey:'completed',notes});
      const intervals=rpe!=null?await writeIntervalsRpe(env,activityId,rpe):{status:'skipped'};
      // The coach's note is written in the background; the dashboard picks it up.
      if(validDate(scheduledDate))ctx.waitUntil(createReflection(env,{date:scheduledDate,workoutId,rpe,notes},day=>reflectionData(env,ctx,internalAuth,day,workoutId)).catch(error=>console.error('Coach reflection failed',error.message)));
      return Response.json({...result,completedPercent,intervals,reflection:'pending'},{headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/app/api/workouts/schedule'&&request.method==='POST'){
      const body=await request.json().catch(()=>({})),date=String(body.date||'');
      if(!validDate(date)||date<pragueToday())return Response.json({status:'error',message:'Vyber dnešní nebo budoucí datum.'},{status:400});
      return Response.json(await scheduleWorkoutInIntervals(env,env.DB,{workoutId:String(body.workoutId||''),date,confirm:body.confirm===true,environment:body.environment}),{headers:{'Cache-Control':'no-store'}});
    }
  }catch(error){return Response.json({status:'error',message:error.message},{status:400})}
  return null;
}

async function handleAdminApi(request, env, url, session) {
  const user = session.user;
  if (!session.signedIn || !user?.isAdmin) return Response.json({status:"error",message:"Jen pro správce."},{status:403});
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return Response.json({message:"Neplatný původ požadavku."},{status:403});
  const db = env.RAW_DB;
  try {
    if (url.pathname === "/app/api/admin/users" && request.method === "GET") return Response.json({status:"ok",...await listUsersAndInvites(db)},{headers:{"Cache-Control":"no-store"}});
    const body = await request.json().catch(() => ({}));
    if (url.pathname === "/app/api/admin/invites" && request.method === "POST") return Response.json({status:"ok",email:await inviteUser(db, body.email, user.id),message:"Pozvánka je uložená. Uživatel se může přihlásit přes Google."});
    if (url.pathname === "/app/api/admin/invites" && request.method === "DELETE") { await removeInvite(db, body.email); return Response.json({status:"ok",message:"Pozvánka je zrušená."}); }
    if (url.pathname === "/app/api/admin/users" && request.method === "POST") { await setUserDisabled(db, env, body.id, body.disabled === true); return Response.json({status:"ok",message:body.disabled===true?"Přístup je zablokovaný.":"Přístup je obnovený."}); }
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
      sheet_maintenance: "/strength/sheets/maintenance",
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
      headers: { "Authorization": `Bearer ${env.STRENGTH_API_KEY}`, "Content-Type": "application/json" },
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
      headers: { "Authorization": `Bearer ${env.STRENGTH_API_KEY}`, "Content-Type": "application/json" },
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

function homepagePage() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Petr Fitness Data — Health & Strength</title><meta name="description" content="Petr Fitness Data is a personal training data service for workout planning, training history, cycling context and nutrition workflows."></head><body><main><h1>Petr Fitness Data</h1><p>Petr Fitness Data is a private personal training service used with Health & Strength to organize training history, generate strength workouts, use cycling context, and support nutrition workflows.</p><p><strong>Google Health data disclosure:</strong> With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p><p>The service can process training and fitness data from connected services, including Google data and Google Sheets data that the account owner has authorized, in order to provide these requested workflows.</p><p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a> · <a href="/support">Support</a></p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function privacyPage() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy — Petr Fitness Data</title></head><body><main><h1>Privacy Policy</h1><p><strong>Petr Fitness Data</strong> is a private personal training service used with Health & Strength.</p><h2>What data the service may access</h2><p>When authorized by the account owner, the service may access fitness and training information from connected Google services and other configured services. This can include Google Sheet workout data, training history, planned workouts, cycling context, recovery metrics, nutrition information, and other fitness data needed for the requested workflows.</p><h2>How Google data is used</h2><p>Google user data is used only to provide the training and nutrition workflows requested by the account owner, such as reading and updating the configured workout spreadsheet, processing authorized fitness data, reading authorized nutrition logs, and adding nutrition logs that the account owner asks the service to record. The service does not sell Google user data and does not use it for advertising.</p><h2>Storage and sharing</h2><p>Data may be processed and stored in the private health-api backend, its configured database, and connected services such as the account owner's Google Sheet. Data may be transmitted between these configured services when necessary to provide the requested functionality. The service does not intentionally disclose personal data to unrelated third parties.</p><h2>Security</h2><p>OAuth credentials and API secrets are intended to be stored as private service secrets rather than in the source code repository. Access to the service is controlled by the configured authentication mechanisms.</p><h2>Changes</h2><p>This policy may be updated when the service or its data practices change. The current version is published on this page.</p><h2>Contact</h2><p>For support or privacy questions, use the <a href="/support">Support</a> page.</p><p><a href="/">Back to Petr Fitness Data</a></p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function policyPage(title, text) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>${title} — Health & Strength</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function logoResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#111827"/><path d="M68 132h32l18-54 30 100 20-46h20" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="68" cy="132" r="8" fill="#fff"/></svg>`;
  return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}


// Daily nutrition NOTE events in Intervals.icu: removed by default; written only on an explicit "sync".
// Calorie estimates in the descriptions of today's planned Intervals.icu
// workouts, for every user with Intervals connected (their weight and FTP).
async function handlePlannedCaloriesAutomation(request, rawEnv) {
  if (request.method !== "POST") return Response.json({status:"error",message:"Method not allowed"},{status:405});
  try { await verifyGitHubActionsToken(request); }
  catch (error) { return Response.json({status:"error",step:"github_actions_auth",message:error.message},{status:401}); }
  try {
    const body=await request.json().catch(()=>({}));
    const users=await forEachUser(rawEnv,["intervals"],async env=>{
      const row=await env.DB.prepare(`SELECT value_numeric FROM health_datapoints WHERE user_id=? AND LOWER(data_type) LIKE '%weight%' AND value_numeric IS NOT NULL ORDER BY COALESCE(sample_time,start_time) DESC LIMIT 1`).bind(env.USER_ID).first().catch(()=>null);
      const thresholds=await athleteThresholds(env).catch(()=>({}));
      const weightKg=Number(row?.value_numeric);
      return syncPlannedEventCalories(env,{oldest:body?.oldest,newest:body?.newest,weightKg:Number.isFinite(weightKg)&&weightKg>30?weightKg:undefined,ftp:thresholds.ftp||undefined});
    });
    return Response.json({status:"ok",users});
  } catch (error) { return Response.json({status:"error",step:"planned_calories",message:error.message},{status:500}); }
}

async function handleNutritionNotesAutomation(request, rawEnv) {
  if (request.method !== "POST") return Response.json({status:"error",message:"Method not allowed"},{status:405});
  try {
    await verifyGitHubActionsToken(request);
    const body=await request.json().catch(()=>({}));
    const today=new Date(), oldest=String(body?.oldest||today.toISOString().slice(0,10)), newest=String(body?.newest||new Date(today.getTime()+14*86400000).toISOString().slice(0,10));
    // Writing daily nutrition notes is opt-in ("sync"); anything else removes them.
    const remove=String(body?.action || "").toLowerCase() !== "sync";
    const users=await forEachUser(rawEnv,["intervals"],async env=>{
      if (remove) return deleteDailyNutritionNotes(env,{oldest,newest});
      let weightKg=Number(body?.weightKg);
      if(!Number.isFinite(weightKg)){
        const row=await env.DB.prepare(`SELECT value_numeric FROM health_datapoints WHERE user_id=? AND LOWER(data_type) LIKE '%weight%' AND value_numeric IS NOT NULL ORDER BY COALESCE(sample_time,start_time) DESC LIMIT 1`).bind(env.USER_ID).first();
        weightKg=Number(row?.value_numeric);
      }
      if(!Number.isFinite(weightKg)||weightKg<=0) weightKg=88;
      return syncDailyNutritionNotes(env,{oldest,newest,weightKg});
    });
    const failed=users.filter(u=>u.error);
    return Response.json({status:failed.length&&failed.length===users.length?"error":"ok",users},{status:failed.length&&failed.length===users.length?500:200});
  } catch(error){ return Response.json({status:"error",step:"nutrition_notes",message:error.message},{status:500}); }
}


function pragueWeekStart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(now);
  const y = Number(parts.find(x=>x.type==="year").value);
  const m = Number(parts.find(x=>x.type==="month").value);
  const d = Number(parts.find(x=>x.type==="day").value);
  const weekday = parts.find(x=>x.type==="weekday").value;
  const index = {Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[weekday] ?? 0;
  return shiftDate(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`, -index);
}
function shiftDate(date, days) {
  const p = String(date).slice(0,10).split("-").map(Number);
  const d = new Date(Date.UTC(p[0],p[1]-1,p[2]+Number(days)));
  return d.toISOString().slice(0,10);
}
