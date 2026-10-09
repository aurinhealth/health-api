import { L } from './lang.js';
import {localExportIndex} from './local-workouts.js';
import {hasRecentActivityData} from './onboarding.js';
import { getCookbook, getCookbookRecipeByPage } from "./cookbook.js";
import { reconcileCancelledGymPlans } from './planned-events.js';
import {walkingEnergyCheck,activityTelemetryEnergy} from './activity-energy-check.js';
import { sleepSessionFromRow } from "./sleep-sessions.js";
import { energyBaseline, MISSING_LABELS, proteinReferenceKg, trendAdjustment, TREND_REASONS } from "./energy-profile.js";
import { d1WeightTrend } from "./strength-context.js";
import { loadEffectiveProfile } from "./profile-suggestions.js";
import { writeIntervalsWeight, importIntervalsWeights } from "./weight-sync.js";
import { latestStoredWeight } from './athlete-weight.js';
import { healthScopes, hasGoogleScope, HEALTH_PERMISSIONS, googleTypeAllowed, skippedForPermission } from "./google-scopes.js";
import { pairSessions } from "./activity-match.js";
import { localToday, zonedIso, localNoon, dayStartUtc, localDate } from "./user-time.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { markConnectionBroken, markConnectionOk, isGoogleAuthFailure, isIntervalsAuthFailure } from "./connection-health.js";

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "* * * * *") {
      if(new Date().getUTCMinutes()%5===0&&(!env.CONNECTED_PROVIDERS||env.CONNECTED_PROVIDERS.includes('google')))await syncGoogleRecent(env);
      await processGoogleSyncBatch(env);
      return;
    }

    // Keep the existing daily non-Google maintenance at 01:05 UTC.
    if (event.cron === "5 1 * * *") {
      ctx.waitUntil(
        (async () => {
          try {
            await startGoogleSync(env);
            await syncIntervals(env);
            await matchActivities(env);
          } catch (error) {
            console.error("Scheduled maintenance failed:", error);
          }
        })()
      );
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return Response.json({
          status: "ok",
          service: "health-api",
          version: "final-5-cookbook-v3.3.0-queued-google-sync"
        });
      }

      if (url.pathname === "/sync/google/status") {
        return await googleSyncStatus(env);
      }
      if(url.pathname==='/sync/google/recent'&&request.method==='POST')return Response.json(await syncGoogleRecent(env));
      if(url.pathname==='/sync/intervals/recent'&&request.method==='POST')return syncIntervals(env,{activityDays:3});
      if(url.pathname==='/sync/match'&&request.method==='POST')return Response.json(await matchActivities(env));

      // Starting a sync changes data, so it takes POST only: a link or an image
      // on another page (a GET that carries the session cookie) must not start one.
      if (["/sync/google", "/sync/intervals"].includes(url.pathname) && request.method !== "POST") {
        return Response.json({ status: "error", message: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
      }

      if (url.pathname === "/sync/google") {
        const start = await startGoogleSync(env);

        if (start.started && ctx?.waitUntil) {
          ctx.waitUntil(
            processGoogleSyncBatch(env).catch(error => {
              console.error("Google sync batch failed:", error);
            })
          );
        }

        const status = start.started ? "started" : "already_running";
        return Response.json({
          status,
          source: "google",
          message: start.started
            ? "Google Health sync queued. Data is processed in small background batches."
            : "A Google Health sync is already running.",
          status_url: "/sync/google/status"
        }, {
          status: start.started ? 202 : 200,
          headers: { "Cache-Control": "no-store" }
        });
      }

      if (url.pathname === "/sync/intervals") {
        return await syncIntervals(env);
      }

      if (url.pathname === "/analysis/daily") {
        return await analysisDaily(env, url);
      }

      if (url.pathname === "/analysis/energy") {
        return await analysisEnergy(env, url);
      }

      if (url.pathname === "/cookbook/page") {
        return await cookbookPage(env, url);
      }

      if (url.pathname === "/cookbook/search") {
        return await cookbookSearch(env, url);
      }

      if (url.pathname === "/food/log") {
        if (request.method === "DELETE") return await deleteFoodLog(env, url);
        return await foodLog(env, request, url);
      }

      if (url.pathname === "/food/today") {
        return await foodLog(env, request, url);
      }

      if (url.pathname === "/app/api/weight" && request.method === "POST") {
        return await appWeight(env, request);
      }

      if (url.pathname === "/health/weight") {
        return await healthWeight(env);
      }

      if (url.pathname === "/health/activities") {
        return await healthActivities(env);
      }

      if (url.pathname === "/health/sleep") {
        return await healthSleep(env, url);
      }

      if (url.pathname === "/health/nutrition") {
        return await healthNutrition(env, url);
      }

      return Response.json(
        {
          status: "error",
          message: "Not found"
        },
        { status: 404 }
      );

    } catch (error) {
      return Response.json(
        {
          status: "error",
          message: error.message
        },
        { status: 500 }
      );
    }
  }
};


async function appWeight(env, request) {
  const body = await request.json();
  const value = Number(body?.kg);
  if (!Number.isFinite(value) || value < 30 || value > 300) return Response.json({status:"error",message:L("Neplatná hmotnost.", "Invalid weight.")},{status:400});
  const today = localToday(), date = body?.date || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return Response.json({status:"error",message:L("Neplatné datum vážení.", "Invalid weigh-in date.")},{status:400});
  // Today's weigh-in keeps its real time (for the day timeline); an earlier day gets noon.
  const now = date === today ? zonedIso() : localNoon(date), at = now.at;
  // With Google Health connected the weight goes there too; without it, only
  // here. A refused Google write (no write permission) does not lose the entry.
  let google = null;
  if (env.GOOGLE_REFRESH_TOKEN) {
    try {
      const token = await googleToken(env);
      const response = await fetch("https://health.googleapis.com/v4/users/me/dataTypes/weight/dataPoints", {
        method:"POST",
        headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify({weight:{sampleTime:{physicalTime:at,utcOffset:now.offsetSeconds+"s"},weightGrams:value*1000,notes:"Loadwise"}})
      });
      google = await response.json().catch(()=>({}));
      if (!response.ok) { console.error("Google Health weight write failed", response.status); google = { error: response.status }; }
    } catch (error) { console.error("Google Health weight write failed", error.message); google = { error: error.message }; }
  }
  await savePoint(env,"manual","weight",{value_kg:value,source:"manual",google_operation:google},value,"kg",at,at,at,"manual-weight:"+date);
  // Intervals.icu gets it right away too; the hourly weight sync retries a failure.
  let intervals = null;
  if (env.INTERVALS_API_KEY) {
    try { await writeIntervalsWeight(env, date, value); intervals = "ok"; }
    catch (error) { console.error("Intervals weight write failed", error.message); intervals = "error"; }
  }
  return Response.json({status:"ok",date,kg:value,google,intervals});
}

// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {
  weightDays: 30,
  activityDays: 365,
  plannedDaysAhead: 7,

  // The rest-day baseline, weekly goal and target weight are personal: see
  // energyBaseline in energy-profile.js.
  proteinGramsPerKg: 2.0,

  defaultRideCarbsPerHour: 90,
  preRideCarbsPerKg: 1.0,
  preRideWindowHours: 2,
  fluidMlPerHour: 700,

  // For an activity without measured calories. Weight-bearing sports are
  // scaled by body weight (activityKcalPerHourFor); these are for 88 kg.
  activityKcalPerHour: {
    Ride: 500,
    VirtualRide: 500,
    Run: 650,
    VirtualRun: 650,
    TrailRun: 700,
    Walk: 250,
    Hike: 350,
    Swim: 500,
    WeightTraining: 400,
    Workout: 450
  },

  maxCalorieTarget: 3800,

  // Daily macro targets are derived from the calorie target rather than
  // using a hard-coded carbohydrate number. This keeps carbs responsive
  // to training load and the current calorie target.
  fatGramsPerKg: 0.8,
  defaultDailyCarbGramsPerKg: 3.0,
  trainingDailyCarbGramsPerKg: 4.0,
  enduranceDailyCarbGramsPerKg: 5.0,
  postRideCarbPriority: 1.35,
  postRideFatPenalty: 0.65,
  recipeOvershootTolerance: 1.25
};


// ======================================================
// DATE HELPERS
// ======================================================

function dateDaysAgo(days) {
  const p = localToday().split("-");

  const d = new Date(
    Date.UTC(
      Number(p[0]),
      Number(p[1]) - 1,
      Number(p[2]) - days
    )
  );

  return d.toISOString().slice(0, 10);
}


function dateDaysFromNow(days) {
  const p = localToday().split("-");

  const d = new Date(
    Date.UTC(
      Number(p[0]),
      Number(p[1]) - 1,
      Number(p[2]) + days
    )
  );

  return d.toISOString().slice(0, 10);
}

function dateDaysFromDate(date, days) {
  const p = String(date).slice(0, 10).split("-");
  const d = new Date(Date.UTC(
    Number(p[0]),
    Number(p[1]) - 1,
    Number(p[2]) + Number(days)
  ));
  return d.toISOString().slice(0, 10);
}



function dateOnly(value) {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
}


function hoursBetween(start, end) {
  if (!start || !end) {
    return null;
  }

  const a = new Date(start).getTime();
  const b = new Date(end).getTime();

  if (
    Number.isNaN(a) ||
    Number.isNaN(b)
  ) {
    return null;
  }

  return Math.max(
    0,
    (b - a) / 3600000
  );
}


// ======================================================
// GOOGLE AUTH
// ======================================================

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Request timeout after ${timeoutMs} ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// An access token for the given scopes (Google Health by default, with weight
// writing when the user granted it).
export async function googleToken(env, scopes = healthScopes(env)) {
  // Without a connection Google would only answer "missing refresh_token".
  if (!env.GOOGLE_REFRESH_TOKEN) throw new Error(L("Google Health není připojené.", "Google Health isn't connected."));
  if (!scopes.length) throw new Error(L("Google Health nemá povolené žádné oprávnění. V Nastavení obnov oprávnění Google.", "Google Health has no permissions granted. Renew the Google permissions in Settings."));
  const response = await fetchWithTimeout(
    "https://oauth2.googleapis.com/token",

    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
        // Health rejects unrelated scopes on a shared refresh token.
        // Request only previously consented scopes for one API at a time.
        scope: scopes.join(" ")
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    // A revoked or expired grant asks the user to connect Google again (connection-health.js).
    if (isGoogleAuthFailure(data)) await markConnectionBroken(env, "google", data.error_description || data.error);
    if (data?.error === "invalid_grant") {
      throw new Error(
        "Google OAuth refresh token is invalid or expired. Reauthorize at /oauth/google and replace the GOOGLE_REFRESH_TOKEN secret with the newly issued token."
      );
    }
    throw new Error("Google OAuth error: " + JSON.stringify(data));
  }

  await markConnectionOk(env, "google");
  return data.access_token;
}


// ======================================================
// INTERVALS AUTH
// ======================================================

function intervalsAuth(env) {
  if (!env.INTERVALS_API_KEY) {
    throw new Error(
      "INTERVALS_API_KEY is not configured"
    );
  }

  return intervalsAuthorization(env.INTERVALS_API_KEY);
}


async function intervalsGet(
  env,
  path
) {
  const response = await fetch(
    "https://intervals.icu/api/v1" +
    path,
    {
      signal: AbortSignal.timeout(15000),
      headers: {
        "Authorization":
          intervalsAuth(env),

        "Accept":
          "application/json"
      }
    }
  );

  const text =
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    // A refused key or token asks the user to connect Intervals.icu again (connection-health.js).
    if (isIntervalsAuthFailure(response.status)) await markConnectionBroken(env, "intervals", "Intervals.icu HTTP " + response.status);
    throw new Error(
      "Intervals.icu HTTP " +
      response.status +
      " (import)"
    );
  }

  await markConnectionOk(env, "intervals");
  return data;
}


// ======================================================
// GOOGLE SYNC STATUS
// ======================================================
async function ensureSyncStatusTable(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL, sync_name TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT, finished_at TEXT, details_json TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, sync_name))').run();
}

async function setGoogleSyncStatus(env, status, details = null) {
  await ensureSyncStatusTable(env);
  await env.DB.prepare('INSERT INTO sync_status (user_id, sync_name, status, started_at, finished_at, details_json, updated_at) VALUES (?, \'google\', ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, sync_name) DO UPDATE SET status = excluded.status, started_at = COALESCE(excluded.started_at, sync_status.started_at), finished_at = excluded.finished_at, details_json = excluded.details_json, updated_at = CURRENT_TIMESTAMP')
    .bind(env.USER_ID, status, details?.started_at || null, details?.finished_at || null, details ? JSON.stringify(details) : null).run();
  if(['completed','partial','error'].includes(status))await env.DB.prepare("UPDATE sync_status SET status=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND sync_name='initial_google'").bind(status==='completed'?'done':status,env.USER_ID).run();
}

async function googleSyncStatus(env) {
  await ensureSyncStatusTable(env);
  const row = await env.DB.prepare('SELECT sync_name, status, started_at, finished_at, details_json, updated_at FROM sync_status WHERE user_id = ? AND sync_name = \'google\'').bind(env.USER_ID).first();
  if (!row) return Response.json({ status: 'idle', source: 'google' }, { headers: { 'Cache-Control': 'no-store' } });
  let details = null;
  try { details = row.details_json ? JSON.parse(row.details_json) : null; } catch {}
  return Response.json({ status: row.status, source: 'google', started_at: row.started_at, finished_at: row.finished_at, updated_at: row.updated_at, details }, { headers: { 'Cache-Control': 'no-store' } });
}

// ======================================================
// DATABASE
// ======================================================

async function savePoint(
  env,
  source,
  type,
  payload,
  value = null,
  unit = null,
  sampleTime = null,
  startTime = null,
  endTime = null,
  externalId = null
) {
  const id = externalId || payload.name || `${type}:${sampleTime || startTime || crypto.randomUUID()}`;
  await pointStatement(env, source, type, payload, value, unit, sampleTime, startTime, endTime, id).run();
  return id;
}

function pointStatement(env, source, type, payload, value = null, unit = null, sampleTime = null, startTime = null, endTime = null, externalId = null) {
  const id =
    externalId ||
    payload.name ||
    `${type}:${sampleTime || startTime || crypto.randomUUID()}`;

  return env.DB
    .prepare(
      `INSERT INTO health_datapoints (
        user_id,
        source_family,
        data_type,
        external_id,
        sample_time,
        start_time,
        end_time,
        value_numeric,
        value_unit,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (
        user_id,
        source_family,
        data_type,
        external_id
      )
      DO UPDATE SET
        sample_time = excluded.sample_time,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        value_numeric = excluded.value_numeric,
        value_unit = excluded.value_unit,
        payload_json = excluded.payload_json,
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      env.USER_ID,
      source,
      type,
      id,
      sampleTime,
      startTime,
      endTime,
      value,
      unit,
      JSON.stringify(payload)
    );
}


// ======================================================
// GOOGLE NUTRITION API
// ======================================================

async function googleNutritionList(token, startDate, endDate) {
  const cutoffStart = new Date(startDate + "T00:00:00Z").getTime();
  const cutoffEnd = new Date(endDate + "T00:00:00Z").getTime();
  const all = [];
  let pageToken = null;

  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams();
    params.set("pageSize", "1000");
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `https://health.googleapis.com/v4/users/me/dataTypes/nutrition-log/dataPoints?${params.toString()}`,
      {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json"
        }
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `nutrition-log HTTP ${response.status}: ` + JSON.stringify(data)
      );
    }

    const points = data.dataPoints || [];
    for (const point of points) {
      const start = point?.nutritionLog?.interval?.startTime;
      const time = start ? new Date(start).getTime() : NaN;
      if (Number.isFinite(time) && time >= cutoffStart && time < cutoffEnd) {
        all.push(point);
      }
    }

    const times = points
      .map(point => point?.nutritionLog?.interval?.startTime)
      .map(value => value ? new Date(value).getTime() : NaN)
      .filter(Number.isFinite);

    if (times.length && Math.max(...times) < cutoffStart) break;

    pageToken = data.nextPageToken || null;
    if (!pageToken) break;
  }

  return all;
}

async function healthNutrition(env, url) {
  const end = url.searchParams.get("end") || dateDaysFromNow(1);
  const start = url.searchParams.get("start") || dateDaysAgo(30);
  // Food logged in Google Health is an extra: without Google Health, or
  // without the permission to read food, there is simply nothing from there.
  if (!env.GOOGLE_REFRESH_TOKEN || !hasGoogleScope(env, HEALTH_PERMISSIONS.nutritionRead)) {
    return Response.json({ status: "ok", source: "google-health", data_type: "nutrition-log", connected: Boolean(env.GOOGLE_REFRESH_TOKEN), permission: false, start, end, count: 0, records: [] });
  }
  try {
    const token = await googleToken(env);
    const points = await googleNutritionList(token, start, end);
    const records = points.map(point => {
      const log = point?.nutritionLog || {};
      const nutrients = Object.fromEntries(
        (log.nutrients || []).map(item => [
          String(item?.nutrient || "").toLowerCase(),
          Number(item?.quantity?.grams ?? 0)
        ])
      );
      return {
        id: point?.name || null,
        startTime: log?.interval?.startTime || log?.interval?.civilStartTime || null,
        endTime: log?.interval?.endTime || log?.interval?.civilEndTime || null,
        foodDisplayName: log?.foodDisplayName || null,
        mealType: log?.mealType || null,
        kcal: Number(log?.energy?.kcal ?? 0),
        protein_g: Number(nutrients.protein ?? 0),
        carbs_g: Number(log?.totalCarbohydrate?.grams ?? 0),
        fat_g: Number(log?.totalFat?.grams ?? 0),
        serving: Number(log?.serving?.amount ?? 0)
      };
    });

    return Response.json({
      status: "ok",
      source: "google-health",
      data_type: "nutrition-log",
      start,
      end,
      count: records.length,
      records
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        source: "google-health",
        data_type: "nutrition-log",
        message: error.message
      },
      { status: 500 }
    );
  }
}

// ======================================================
// GOOGLE VALUE EXTRACTION
// ======================================================

function googleInfo(type, p) {
  let value = null;
  let unit = null;
  let sample = null;
  let start = null;
  let end = null;

  const nestedSession = p[type.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] || null;
  const interval = p.interval || nestedSession?.interval || null;
  if (interval) {
    start = interval.startTime || interval.civilStartTime || null;
    end = interval.endTime || interval.civilEndTime || null;
  }

  const sampleTime=p.sampleTime||nestedSession?.sampleTime;
  if (sampleTime) {
    sample = sampleTime.physicalTime || sampleTime.civilTime || null;
  }

  const daily = [
    "dailyRestingHeartRate",
    "dailyHeartRateVariability",
    "dailyOxygenSaturation",
    "dailyRespiratoryRate",
    "dailyVo2Max",
    "dailyHeartRateZones",
    "dailySleepTemperatureDerivations"
  ];

  for (const name of daily) {
    if (p[name] && p[name].date) {
      const d = p[name].date;
      sample = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    }
  }

  const direct = {
    activeEnergyBurned: ["kcal", ["kcal"]],
    steps: ["count", ["count"]],
    distance: ["m", ["meters"]],
    floors: ["count", ["floors"]],
    heartRate: ["bpm", ["bpm"]],
    heartRateVariability: ["ms", ["rmssd"]],
    oxygenSaturation: ["%", ["percentage"]],
    weight: ["kg", ["weightGrams"]],
    bodyFat: ["%", ["percentage"]]
  };

  const camel = type.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const obj = p[camel];
  if (obj) {
    for (const [key, u] of Object.entries(direct)) {
      if (key === camel) {
        const prop = u[1].find(k => obj[k] !== undefined && obj[k] !== null);
        if (prop) {
          value = Number(obj[prop]);
          unit = u[0];
          if (key === "weight") value = value / 1000;
        }
      }
    }
  }

  if (p.activeMinutes?.activeMinutesByActivityLevel) {
    value = p.activeMinutes.activeMinutesByActivityLevel.reduce((sum, x) => sum + Number(x.minutes || 0), 0);
    unit = "min";
  }
  if (p.activeZoneMinutes?.activeZoneMinutes !== undefined) {
    value = Number(p.activeZoneMinutes.activeZoneMinutes);
    unit = "min";
  }
  if (p.sedentaryPeriod?.durationMinutes !== undefined) {
    value = Number(p.sedentaryPeriod.durationMinutes);
    unit = "min";
  }
  if (p.timeInHeartRateZone?.durationMinutes !== undefined) {
    value = Number(p.timeInHeartRateZone.durationMinutes);
    unit = "min";
  }
  if (p.respiratoryRateSleepSummary?.fullSleepStats?.breathsPerMinute !== undefined) {
    value = Number(p.respiratoryRateSleepSummary.fullSleepStats.breathsPerMinute);
    unit = "breaths/min";
  }
  if (p.dailyRestingHeartRate?.beatsPerMinute !== undefined) {
    value = Number(p.dailyRestingHeartRate.beatsPerMinute); unit = "bpm";
  }
  if (p.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds !== undefined || p.dailyHeartRateVariability?.rmssd !== undefined) {
    value = Number(p.dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds ?? p.dailyHeartRateVariability.rmssd); unit = "ms";
  }
  if (p.dailyOxygenSaturation?.percentage !== undefined) {
    value = Number(p.dailyOxygenSaturation.percentage); unit = "%";
  }
  if (p.dailySleepTemperatureDerivations?.nightlyTemperatureCelsius !== undefined) {
    value = Number(p.dailySleepTemperatureDerivations.nightlyTemperatureCelsius); unit = "°C";
  }
  if (p.dailyRespiratoryRate?.breathsPerMinute !== undefined) {
    value = Number(p.dailyRespiratoryRate.breathsPerMinute); unit = "breaths/min";
  }
  if (p.dailyVo2Max?.vo2Max !== undefined) {
    value = Number(p.dailyVo2Max.vo2Max); unit = "ml/kg/min";
  }

  return { value, unit, sample, start, end };
}

// ======================================================
// GOOGLE SYNC QUEUE
// ======================================================

const GOOGLE_SYNC_CONFIGS = [
  ["active-energy-burned", "active_energy_burned", "interval", "google-wearables", 7],
  ["active-minutes", "active_minutes", "interval", "google-wearables", 7],
  ["active-zone-minutes", "active_zone_minutes", "interval", "google-wearables", 7],
  ["steps", "steps", "interval", "google-wearables", 7],
  ["distance", "distance", "interval", "google-wearables", 7],
  ["floors", "floors", "interval", "google-wearables", 7],
  ["heart-rate", "heart_rate", "sample", "google-wearables", 7],
  ["heart-rate-variability", "heart_rate_variability", "sample", "google-wearables", 7],
  ["oxygen-saturation", "oxygen_saturation", "sample", "google-wearables", 7],
  ["daily-resting-heart-rate", "daily_resting_heart_rate", "daily", "google-wearables", 30],
  ["daily-heart-rate-variability", "daily_heart_rate_variability", "daily", "google-wearables", 30],
  ["daily-oxygen-saturation", "daily_oxygen_saturation", "daily", "google-wearables", 30],
  ["daily-respiratory-rate", "daily_respiratory_rate", "daily", "google-wearables", 30],
  ["daily-vo2-max", "daily_vo2_max", "daily", "google-wearables", 30],
  ["daily-heart-rate-zones", "daily_heart_rate_zones", "daily", "google-wearables", 30],
  ["daily-sleep-temperature-derivations", "daily_sleep_temperature_derivations", "daily", "google-wearables", 30],
  ["respiratory-rate-sleep-summary", "respiratory_rate_sleep_summary", "sample", "google-wearables", 7],
  ["sedentary-period", "sedentary_period", "interval", "google-wearables", 7],
  ["time-in-heart-rate-zone", "time_in_heart_rate_zone", "interval", "google-wearables", 7],
  // Normal app sync only needs the recent sleep history requested by the app.
  // Older sleep history can be backfilled separately without blocking daily sync.
  ["sleep", "sleep", "sleep", "google-wearables", 30],
  ["exercise", "exercise", "exercise", "google-wearables", 90],
  ["weight", "weight", "sample", "google-sources", 365],
  ["body-fat", "body_fat", "sample", "google-sources", 30]
];

async function googleReconcilePage(
  token,
  type,
  filterName,
  filterType,
  startDate,
  sourceFamily,
  endDate,
  pageToken = null
) {
  const params = new URLSearchParams();
  params.set("dataSourceFamily", sourceFamily);

  const end = endDate || dateDaysFromNow(1);
  let filter;

  if (filterType === "interval") {
    filter = `${filterName}.interval.start_time >= "${startDate}T00:00:00Z" AND ${filterName}.interval.start_time < "${end}T00:00:00Z"`;
  } else if (filterType === "sample") {
    filter = `${filterName}.sample_time.physical_time >= "${startDate}T00:00:00Z" AND ${filterName}.sample_time.physical_time < "${end}T00:00:00Z"`;
  } else if (filterType === "daily") {
    filter = `${filterName}.date >= "${startDate}" AND ${filterName}.date < "${end}"`;
  } else if (filterType === "exercise") {
    filter = `${filterName}.interval.civil_start_time >= "${startDate}T00:00:00" AND ${filterName}.interval.civil_start_time < "${end}T00:00:00"`;
  } else if (filterType === "sleep") {
    filter = `sleep.interval.civil_end_time >= "${startDate}" AND sleep.interval.civil_end_time < "${end}"`;
  } else {
    throw new Error(`Unsupported Google filter type: ${filterType}`);
  }

  params.set("filter", filter);
  if (pageToken) params.set("pageToken", pageToken);
  params.set('pageSize',filterType==='sleep'||filterType==='exercise'?'25':'500');

  const response = await fetchWithTimeout(
    `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints:reconcile?${params.toString()}`,
    {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json"
      }
    },
    12000
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${type} HTTP ${response.status}: ` + JSON.stringify(data));
  }

  return {
    dataPoints: data.dataPoints || [],
    nextPageToken: data.nextPageToken || null
  };
}

async function saveGooglePointsBatch(env, family, type, points) {
  if (!points.length) return 0;

  const statements = points.map(point => {
    const i = googleInfo(type, point);
    const fallbackId = point?.name || `${type}:${i.sample || i.start || crypto.randomUUID()}`;

    return env.DB.prepare(
      `INSERT INTO health_datapoints (
        user_id,
        source_family,
        data_type,
        external_id,
        sample_time,
        start_time,
        end_time,
        value_numeric,
        value_unit,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, source_family, data_type, external_id)
      DO UPDATE SET
        sample_time = excluded.sample_time,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        value_numeric = excluded.value_numeric,
        value_unit = excluded.value_unit,
        payload_json = excluded.payload_json,
        updated_at = CURRENT_TIMESTAMP`
    ).bind(
      env.USER_ID,
      family,
      type,
      fallbackId,
      i.sample,
      i.start,
      i.end,
      i.value,
      i.unit,
      JSON.stringify(point)
    );
  });

  // D1 batch executes the statements sequentially in one database call.
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  return points.length;
}
async function syncGoogleRecent(env){
  const token=await googleToken(env),wanted=['sleep','daily-heart-rate-variability','daily-resting-heart-rate','steps','active-energy-burned','exercise','weight'],configs=GOOGLE_SYNC_CONFIGS.filter(c=>wanted.includes(c[0])).map(c=>c[0]==='weight'?['weight','weight','sample','all-sources',2]:c);
  const results=await Promise.all(configs.map(async([type,filter,typeFilter,family])=>{let pageToken=null,saved=0;if(!googleTypeAllowed(env,type))return{type,saved,status:'skipped'};try{for(let i=0;i<8;i++){const page=await googleReconcilePage(token,type,filter,typeFilter,dateDaysAgo(2),'users/me/dataSourceFamilies/'+family,dateDaysFromNow(1),pageToken);saved+=await saveGooglePointsBatch(env,family,type,page.dataPoints);pageToken=page.nextPageToken;if(!pageToken)break;}return{type,saved,status:pageToken?'partial':'ok'};}catch(error){return{type,saved,status:skippedForPermission(env,error)?'skipped':'error',message:error.message};}}));
  // Data the user did not give permission for is not a failure.
  const result={status:results.some(r=>r.status!=='ok'&&r.status!=='skipped')?'partial':'ok',results};
  if(results.some(r=>r.type==='exercise'&&r.saved>0))await matchActivities(env,{days:14}).catch(error=>console.error('Activity matching failed',error.message));
  await ensureSyncStatusTable(env);
  await env.DB.prepare("INSERT INTO sync_status(user_id,sync_name,status,details_json,updated_at) VALUES(?,'google_recent',?,?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status=excluded.status,details_json=excluded.details_json,updated_at=excluded.updated_at").bind(env.USER_ID,result.status,JSON.stringify(result)).run();
  return result;
}

async function readGoogleSyncState(env) {
  await ensureSyncStatusTable(env);
  const row = await env.DB.prepare(
    "SELECT status, started_at, finished_at, details_json, updated_at FROM sync_status WHERE user_id = ? AND sync_name = 'google'"
  ).bind(env.USER_ID).first();

  if (!row) return null;

  let details = {};
  try {
    details = row.details_json ? JSON.parse(row.details_json) : {};
  } catch {}

  return { ...row, details };
}

async function startGoogleSync(env) {
  const current = await readGoogleSyncState(env);
  const now = new Date().toISOString();

  // Do not start a second job on top of a healthy running job.
  if (current?.status === "running") {
    const updated = current.updated_at ? new Date(current.updated_at + "Z").getTime() : 0;
    if (updated && Date.now() - updated < 10 * 60 * 1000) {
      return { started: false, details: current.details };
    }
  }

  const details = {
    started_at: now,
    finished_at: null,
    config_index: 0,
    page_token: null,
    completed_configs: 0,
    total_configs: GOOGLE_SYNC_CONFIGS.length,
    current: GOOGLE_SYNC_CONFIGS[0]?.[0] || null,
    results: []
  };

  await setGoogleSyncStatus(env, "running", details);
  return { started: true, details };
}

async function processGoogleSyncBatch(env) {
  let processed = 0;

  while (processed < 5) {
    const state = await readGoogleSyncState(env);
    if (!state || state.status !== "running") return { status: processed ? "running" : "idle" };

    const details = state.details || {};
    let configIndex = Number(details.config_index || 0);
    let pageToken = details.page_token || null;
    const results = Array.isArray(details.results) ? details.results : [];

    if (configIndex >= GOOGLE_SYNC_CONFIGS.length) {
      const finishedAt = new Date().toISOString();
      const finalStatus = results.some(x => x.status === "error") ? "partial" : "completed";
      await setGoogleSyncStatus(env, finalStatus, {
        ...details,
        finished_at: finishedAt,
        current: null,
        page_token: null,
        completed_configs: GOOGLE_SYNC_CONFIGS.length
      });
      return { status: finalStatus, details };
    }

    const [type, filterName, filterType, family, days] = GOOGLE_SYNC_CONFIGS[configIndex];

    try {
      // A data type the user did not give permission for is skipped, not failed.
      const allowed = googleTypeAllowed(env, type);
      const page = allowed ? await googleReconcilePage(
        await googleToken(env),
        type,
        filterName,
        filterType,
        dateDaysAgo(days),
        `users/me/dataSourceFamilies/${family}`,
        dateDaysFromNow(1),
        pageToken
      ) : { dataPoints: [], nextPageToken: null };

      const saved = allowed ? await saveGooglePointsBatch(env, family, type, page.dataPoints) : 0;
      const existing = results.find(x => x.data_type === type);
      const status = !allowed ? "skipped" : page.nextPageToken ? "partial" : "ok";

      if (existing) {
        existing.records_found = Number(existing.records_found || 0) + page.dataPoints.length;
        existing.records_saved = Number(existing.records_saved || 0) + saved;
        existing.pages = Number(existing.pages || 0) + 1;
        existing.status = status;
      } else {
        results.push({
          data_type: type,
          records_found: page.dataPoints.length,
          records_saved: saved,
          pages: allowed ? 1 : 0,
          status
        });
      }

      if (page.nextPageToken) {
        details.page_token = page.nextPageToken;
        details.config_index = configIndex;
        details.completed_configs = configIndex;
        details.current = type;
      } else {
        configIndex += 1;
        details.config_index = configIndex;
        details.page_token = null;
        details.completed_configs = configIndex;
        details.current = GOOGLE_SYNC_CONFIGS[configIndex]?.[0] || null;
      }

      details.results = results;
      details.updated_at = new Date().toISOString();

      if (configIndex >= GOOGLE_SYNC_CONFIGS.length && !page.nextPageToken) {
        const finishedAt = new Date().toISOString();
        const finalStatus = results.some(x => x.status === "error") ? "partial" : "completed";
        await setGoogleSyncStatus(env, finalStatus, {
          ...details,
          finished_at: finishedAt,
          current: null,
          page_token: null
        });
        return { status: finalStatus, details };
      }

      await setGoogleSyncStatus(env, "running", details);
      processed += 1;
      if (processed >= 5) return { status: "running", details };
    } catch (error) {
      const message = error?.message || String(error);
      results.push({
        data_type: type,
        records_found: 0,
        records_saved: 0,
        pages: 0,
        status: skippedForPermission(env, error) ? "skipped" : "error",
        message
      });

      configIndex += 1;
      details.config_index = configIndex;
      details.page_token = null;
      details.completed_configs = configIndex;
      details.current = GOOGLE_SYNC_CONFIGS[configIndex]?.[0] || null;
      details.results = results;
      details.last_error = { data_type: type, message, at: new Date().toISOString() };

      await setGoogleSyncStatus(env, "running", details);
      processed += 1;
      if (processed >= 2) return { status: "running", details };
    }
  }
}

// ======================================================
// INTERVALS COMPLETED ACTIVITIES
// ======================================================

function activityNumber(
  a,
  names
) {
  for (const n of names) {
    if (
      a[n] !== undefined &&
      a[n] !== null &&
      !Number.isNaN(Number(a[n]))
    ) {
      return Number(a[n]);
    }
  }

  return null;
}


function activityStart(a) {
  return (
    a.start_date_local ||
    a.start_date ||
    null
  );
}


function activityEnd(a) {
  return (
    a.end_date_local ||
    a.end_date ||
    null
  );
}


async function syncIntervalsActivities(env,{activityDays=CONFIG.activityDays}={}) {
  const oldest =
    dateDaysAgo(
      activityDays
    );

  const newest =
    dateDaysFromNow(1);

  const activities =
    await intervalsGet(
      env,
      `/athlete/0/activities?oldest=${oldest}&newest=${newest}`
    );

  if (!Array.isArray(activities)) throw new Error('Invalid Intervals activity response');
  const statements = [];
  const previous = activities.some(a => a?._note && !a.name && !a.type)
    ? (await env.DB.prepare("SELECT external_id,payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND start_time>=?").bind(env.USER_ID,oldest).all()).results || [] : [];
  const existingById = new Map(previous.map(row => [row.external_id, row]));

  let saved = 0;

  for (const sourceActivity of activities) {
    const id = String(sourceActivity.id);
    let a = sourceActivity;
    if (sourceActivity?._note && !sourceActivity.name && !sourceActivity.type) {
      const existing = existingById.get("activity:"+id);
      if (existing?.payload_json) {
        try {
          const previous=JSON.parse(existing.payload_json);
          a={...sourceActivity,name:previous.name||sourceActivity.name,type:previous.type||sourceActivity.type,category:previous.category||sourceActivity.category};
        } catch {}
      }
    }

    statements.push(pointStatement(
      env,
      "intervals",
      "activity",
      a,
      activityNumber(
        a,
        [
          "calories",
          "calories_kcal",
          "icu_calories"
        ]
      ),
      "kcal",
      activityStart(a),
      activityStart(a),
      activityEnd(a),
      `activity:${id}`
    ));

    saved++;
  }

  // A year of activities must not turn into hundreds of sequential D1 calls
  // inside a background request with a limited lifetime.
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));

  // Counts only: the activities themselves are health data, and this result
  // ends up in the public GitHub Actions log of the periodic sync.
  return {
    activities_found:
      activities.length,

    activities_saved:
      saved
  };
}


// ======================================================
// INTERVALS PLANNED EVENTS
// ======================================================

async function syncIntervalsEvents(env) {
  // Reconcile a small history window as well as upcoming sessions. Intervals is
  // the source of truth: a deleted/rescheduled event must not remain as a
  // phantom plan in the dashboard.
  const oldest = dateDaysAgo(7);
  const newest = dateDaysFromNow(CONFIG.plannedDaysAhead);
  const rangeEnd = dateDaysFromDate(newest, 1);

  const events =
    await intervalsGet(
      env,
      `/athlete/0/events?oldest=${oldest}&newest=${newest}`
    );

  if (!Array.isArray(events)) throw new Error('Invalid Intervals event response');
  const previous=(await env.DB.prepare("SELECT external_id,start_time,payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='planned-workout' AND start_time>=? AND start_time<?").bind(env.USER_ID,oldest,rangeEnd).all()).results||[];

  const replace = env.DB.prepare(
    `DELETE FROM health_datapoints
     WHERE user_id = ? AND source_family = 'intervals' AND data_type = 'planned-workout'
       AND start_time >= ? AND start_time < ?`
  ).bind(env.USER_ID, oldest, rangeEnd);
  const statements = [];

  let saved = 0;

  const appEvents=await localExportIndex(env.DB,env.USER_ID);
  for (const e of events) {
    if(appEvents.remote.has(String(e.id??e.event_id??''))||appEvents.external.has(e.external_id))continue;
    const id =
      String(
        e.id ||
        e.event_id ||
        crypto.randomUUID()
      );

    const start =
      e.start_date_local ||
      e.start_date ||
      e.date ||
      null;

    const end =
      e.end_date_local ||
      e.end_date ||
      null;

    statements.push(pointStatement(
      env,
      "intervals",
      "planned-workout",
      e,
      null,
      null,
      start,
      start,
      end,
      `planned:${id}`
    ));

    saved++;
  }

  // Replace atomically so a storage failure preserves the previous calendar.
  await env.DB.batch([replace, ...statements]);

  await reconcileCancelledGymPlans(env.DB, previous, events, dateDaysAgo(0));
  return {
    events_found:
      events.length,

    events_saved:
      saved,

    reconciled_from:
      oldest
  };
}


// ======================================================
// INTERVALS SYNC
// ======================================================
async function syncIntervals(env,options={}) {
  const names = ['activities', 'planned', 'weight'];
  const settled = await Promise.allSettled([
    syncIntervalsActivities(env,options), syncIntervalsEvents(env),
    importIntervalsWeights(env,{days:options.activityDays ? CONFIG.weightDays : CONFIG.activityDays})
  ]);
  const parts = Object.fromEntries(settled.map((result,i) => [names[i], result.status === 'fulfilled'
    ? result.value : {status:'error',message:result.reason?.message || 'Import failed'}]));
  const failures = settled.filter(r => r.status === 'rejected').length;
  // The new activities against the watch's Google exercises (and back).
  if (settled[0].status === 'fulfilled') await matchActivities(env, { days: 14 }).catch(error => console.error('Activity matching failed', error.message));
  return Response.json({status:failures === names.length ? 'error' : failures ? 'partial' : 'ok',source:'intervals.icu',...parts});
}


// ======================================================
// ACTIVITY MATCHING
// ======================================================

// The same workout from Intervals.icu (or the app) and from the watch in
// Google Health: the copy becomes record_role 'duplicate' (the queries skip
// it) and points to the kept record. See activity-match.js. `days` limits it
// to recent activities (after each sync); without it all are checked again.
async function matchActivities(env, { days = null } = {}) {
  const since = days ? dateDaysAgo(days + 1) : "0000";
  const rows = (await env.DB.prepare(
    `SELECT source_family, data_type, external_id, start_time, end_time, payload_json, record_role, matched_activity_id
     FROM health_datapoints
     WHERE user_id = ?
     AND ((source_family IN ('intervals','local') AND data_type = 'activity') OR (source_family = 'google-wearables' AND data_type = 'exercise'))
     AND start_time IS NOT NULL AND start_time >= ?
     ORDER BY start_time`
  ).bind(env.USER_ID, since).all()).results || [];
  const key = row => row.source_family + ":" + row.external_id;
  const wanted = new Map();
  const pairs = pairSessions(rows);
  for (const { keep, drop, inside } of pairs) {
    wanted.set(drop, { role: "duplicate", matched: key(keep) });
    if (!inside) wanted.set(keep, { role: "primary", matched: key(drop) });
  }
  const updates = [];
  for (const row of rows) {
    // A pair that no longer holds (a source changed or deleted it) is undone.
    const want = wanted.get(row) || (row.matched_activity_id ? { role: "primary", matched: null } : null);
    if (!want || (row.record_role === want.role && (row.matched_activity_id ?? null) === want.matched)) continue;
    updates.push(env.DB.prepare(
      `UPDATE health_datapoints SET record_role = ?, matched_activity_id = ?, match_confidence = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND source_family = ? AND data_type = ? AND external_id = ?`
    ).bind(want.role, want.matched, want.matched ? 1 : null, env.USER_ID, row.source_family, row.data_type, row.external_id));
  }
  for (let i = 0; i < updates.length; i += 50) await env.DB.batch(updates.slice(i, i + 50));
  return { matched: pairs.length, updated: updates.length };
}


// ======================================================
// WEIGHT
// ======================================================

async function weightHistory(env, days = null) {
  if (Number.isFinite(Number(days)) && Number(days) > 0) {
    const cutoff = dateDaysAgo(Number(days));
    const rows = await env.DB.prepare(`
      SELECT COALESCE(sample_time, start_time, end_time) AS sample_time, value_numeric
      FROM health_datapoints
      WHERE user_id = ?
        AND data_type = 'weight'
        AND value_numeric IS NOT NULL
        AND COALESCE(sample_time, start_time, end_time) >= ?
      ORDER BY 1 ASC
    `).bind(env.USER_ID, cutoff).all();
    return rows.results;
  }

  // Some imports keep the time in start_time only; a weight without any time is left out.
  const rows = await env.DB.prepare(`
    SELECT COALESCE(sample_time, start_time, end_time) AS sample_time, value_numeric
    FROM health_datapoints
    WHERE user_id = ?
      AND data_type = 'weight'
      AND value_numeric IS NOT NULL
      AND COALESCE(sample_time, start_time, end_time) IS NOT NULL
    ORDER BY 1 ASC
  `).bind(env.USER_ID).all();

  return rows.results;
}


function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce(
    (a, b) => a + b,
    0
  ) / values.length;
}


function weightTrend(
  rows,
  days
) {
  const cutoff =
    dateDaysAgo(days);

  const values =
    rows
      .filter(
        r =>
          dateOnly(
            r.sample_time
          ) >= cutoff
      )
      .map(
        r =>
          Number(
            r.value_numeric
          )
      )
      .filter(
        x =>
          !Number.isNaN(x)
      );

  return average(values);
}


// ======================================================
// PLANNED WORKOUT
// ======================================================

function plannedWorkoutInfo(
  payload
) {
  const start =
    payload.start_date_local ||
    payload.start_date ||
    payload.date ||
    null;

  const end =
    payload.end_date_local ||
    payload.end_date ||
    null;

  let duration =
    activityNumber(
      payload,
      [
        "duration",
        "duration_seconds",
        "moving_time",
        "elapsed_time"
      ]
    );

  if (
    duration &&
    duration > 1000
  ) {
    duration =
      duration / 3600;
  }

  if (
    !duration &&
    start &&
    end
  ) {
    duration =
      hoursBetween(
        start,
        end
      );
  }

  if (
    duration &&
    duration > 12
  ) {
    duration =
      duration / 3600;
  }

  const tss =
    activityNumber(
      payload,
      [
        "tss",
        "icu_training_load",
        "planned_tss"
      ]
    );

  const type =
    payload.type ||
    payload.activity_type ||
    payload.category ||
    "";

  const name =
    payload.name ||
    payload.title ||
    payload.description ||
    "";

  const text =
    `${type} ${name}`.toLowerCase();

  const cycling =
    text.includes("ride") ||
    text.includes("bike") ||
    text.includes("cycling") ||
    text.includes("cycle") ||
    text.includes("gravel") ||
    text.includes("mountain bike");

  return {
    start,
    end,
    durationHours:
      duration || null,
    tss: tss || null,
    type,
    name,
    // Intervals.icu workout text (steps), used to classify the session.
    description: typeof payload.description === "string" ? payload.description.slice(0, 4000) : null,
    cycling
  };
}


// ======================================================
// DAILY ENERGY
// ======================================================

function activityFamily(item){
  const text=(String(item?.type||"")+" "+String(item?.name||"")).toLowerCase();
  if(/weight|strength|weights|posil/.test(text)) return "strength";
  if(/ride|cycling|cycle|bike|road|mtb|gravel/.test(text)) return "cycling";
  if(/run|běh/.test(text)) return "running";
  if(/walk|chůz/.test(text)) return "walking";
  if(/swim|plav/.test(text)) return "swimming";
  return String(item?.type||"").toLowerCase() || "other";
}

function plannedMatch(planned, actuals){
  const paired=(actuals||[]).find(a =>
    [a?.pairedEventId,a?.plannedEventId].filter(Boolean).some(id=>String(id)===String(planned?.id))
  );
  if(paired) return paired;

  const pName=(String(planned?.name||"")+" "+String(planned?.type||"")).toLowerCase();
  const stopWords=new Set(["workout","training","trénink","planned","plan","upper","body"]);
  const tokens=(pName.match(/[a-z0-9áéěíóúůýčďňřšťž]+/gi)||[]).filter(t=>t.length>=5&&!stopWords.has(t));
  const family=activityFamily(planned);
  // This function is called after both records have already been restricted to
  // one Prague calendar day by D1. Event titles/IDs may be absent in Intervals,
  // so the shared activity family is the correct final pairing signal.
  return (actuals||[]).find(a=>{
    const aName=(String(a.name||"")+" "+String(a.type||"")).toLowerCase();
    const nameMatch=tokens.some(token=>aName.includes(token));
    const sameFamily=family!=="other" && activityFamily(a)===family;
    return nameMatch || sameFamily;
  }) || null;
}

function cyclingKcalPerHour(item) {
  const text = `${item?.type || ""} ${item?.name || ""} ${item?.payload?.type || ""} ${item?.payload?.name || ""}`.toLowerCase();
  // Our agreed planning model: Endurance/Z2 rides = 500 kcal/h;
  // harder/intensity rides = 600 kcal/h.
  return /endurance|z2|recovery|easy/.test(text) ? 500 : 600;
}

function activityIsCycling(activity) {
  const text = `${activity?.type || ""} ${activity?.name || ""} ${activity?.payload?.type || ""} ${activity?.payload?.name || ""}`.toLowerCase();
  return ["ride", "bike", "cycling", "cycle", "gravel", "mountain bike", "mtb", "road cycling", "indoor cycling"].some(x => text.includes(x));
}

// Average heart rate from the exercise summary (also auto-detected walks).
// Google names it averageHeartRateBeatsPerMinute; other spellings are accepted.
export function googleExerciseHeartRate(metrics = {}) {
  const valid = v => Number.isFinite(Number(v)) && Number(v) >= 30 && Number(v) <= 240 ? Math.round(Number(v)) : null;
  for (const key of ["averageHeartRateBeatsPerMinute", "averageHeartRateBpm", "averageHeartRate", "heartRateAverageBpm"]) {
    const v = metrics?.[key]; const value = valid(v && typeof v === "object" ? v.bpm ?? v.value : v);
    if (value != null) return value;
  }
  const key = Object.keys(metrics || {}).find(k => /heart/i.test(k) && /av(era)?g/i.test(k) && !/variab/i.test(k));
  return key ? valid(metrics[key]) : null;
}

// Mean of the stored heart-rate samples inside the activity, when the summary has none.
export function heartRateFromSamples(activity, samples) {
  const start = Date.parse(activity.start), end = Date.parse(activity.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const bpm = r => { if (r.value_numeric != null) return Number(r.value_numeric); try { const h = JSON.parse(r.payload_json || "{}").heartRate || {}; return Number(h.beatsPerMinute ?? h.bpm); } catch { return NaN; } };
  const values = samples.filter(r => { const t = Date.parse(r.sample_time); return t >= start && t <= end; }).map(bpm).filter(v => v >= 30 && v <= 240);
  return values.length >= 3 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function googleExerciseActivity(row) {
  const payload = JSON.parse(row.payload_json || "{}");
  const exercise = payload.exercise || {};
  const metrics = exercise.metricsSummary || {};
  const exerciseType = String(exercise.exerciseType || "EXERCISE");
  const typeMap = {
    WALKING: "Walk",
    RUNNING: "Run",
    BIKING: "Ride",
    CYCLING: "Ride",
    MOUNTAIN_BIKING: "Ride",
    INDOOR_BIKING: "VirtualRide",
    TREADMILL_RUNNING: "VirtualRun",
    SWIMMING: "Swim",
    HIKING: "Hike",
    WEIGHTLIFTING: "WeightTraining",
    WEIGHTS: "WeightTraining",
    STRENGTH_TRAINING: "WeightTraining",
    AEROBIC_WORKOUT: "Workout"
  };
  const type = typeMap[exerciseType] || exerciseType;
  const name = exercise.displayName || type;
  const activeSeconds = String(exercise.activeDuration || "").match(/([0-9.]+)s/i);
  const activeHours = activeSeconds ? Number(activeSeconds[1]) / 3600 : null;
  const durationHours = activeHours || hoursBetween(row.start_time, row.end_time);
  const averageHeartRate = googleExerciseHeartRate(metrics);
  // The dashboard reads the Intervals field name for every activity.
  if (averageHeartRate != null && payload.average_heartrate == null) payload.average_heartrate = averageHeartRate;
  return {
    id: row.external_id,
    source: "google-health",
    averageHeartRate,
    type,
    calories: Number(metrics.caloriesKcal || 0),
    start: row.start_time,
    end: row.end_time,
    durationHours: durationHours || 0,
    pairedEventId: null,
    plannedEventId: null,
    name,
    payload
  };
}

// Running and walking cost energy in proportion to body weight; riding depends
// on power, so its rate stays as agreed (cyclingKcalPerHour).
const WEIGHT_BEARING = /^(Run|VirtualRun|TrailRun|Walk|Hike)$/;
function activityKcalPerHourFor(type, weightKg) {
  const base = CONFIG.activityKcalPerHour[type] || 400;
  const kg = Number(weightKg);
  return WEIGHT_BEARING.test(type) && kg > 0 ? Math.round(base * Math.min(1.3, Math.max(0.6, kg / 88))) : base;
}

function activityIsStrength(activity) {
  const text = `${activity?.type || ""} ${activity?.name || ""} ${activity?.payload?.type || ""} ${activity?.payload?.name || ""}`.toLowerCase();
  return ["weight", "strength", "gym", "lifting", "bodybuilding"].some(x => text.includes(x));
}

function dailyMacroTargets(weightKg, calorieTarget, context = {}) {
  // Macros are per kg of body weight: without a weight or a target there are none.
  const kg = Number(weightKg);
  const kcal = Number(calorieTarget);
  if (!(kg > 0) || !(kcal > 0)) return null;
  const protein = Math.round(kg * CONFIG.proteinGramsPerKg);
  // The calories and macros must describe the same plan.  Protein stays
  // stable for recovery; fat moves slightly with the training sequence and
  // carbohydrates receive the remainder of the available energy.
  let fatPerKg = 0.90; // ordinary rest day: more satiating, lower carbohydrate
  if (context.endurance) fatPerKg = 0.70;
  else if (context.preRide) fatPerKg = 0.70; // make room for glycogen before the ride
  else if (context.recoveryRide) fatPerKg = 0.75;
  else if (context.strength) fatPerKg = 0.85;
  const fat = Math.round(kg * fatPerKg);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { protein_g: protein, carbs_g: carbs, fat_g: fat };
}

async function nearbyRideContext(env, date) {
  const start = dateDaysFromDate(date, 1);
  const end = dateDaysFromDate(date, 3);
  const rows = await env.DB.prepare(`
    SELECT payload_json, start_time
    FROM health_datapoints
    WHERE user_id = ? AND source_family IN ('intervals','local')
      AND data_type = 'planned-workout'
      AND start_time >= ? AND start_time < ?
    ORDER BY start_time
  `).bind(env.USER_ID, start, end).all();
  const nextRide = rows.results.map(row => {
    try { return plannedWorkoutInfo(JSON.parse(row.payload_json || '{}')); } catch { return null; }
  }).find(workout => workout?.cycling && Number(workout.durationHours || 0) >= 1);
  return {
    // Only the day immediately before a ride gets the glycogen top-up.
    // A ride two days away should not turn an ordinary rest day into a
    // high-carbohydrate day yet.
    preRide: Boolean(nextRide && String(nextRide.start || '').slice(0, 10) === start),
    nextRideName: nextRide?.name || nextRide?.type || null,
    nextRideDate: nextRide?.start ? String(nextRide.start).slice(0, 10) : null
  };
}

function nutritionContext(energy) {
  const actual = energy.completedActivities || [];
  const planned = energy.unmatchedPlannedWorkouts || [];
  const cycling = actual.find(activityIsCycling) || planned.find(x => x.cycling);
  const strength = actual.some(activityIsStrength) || planned.some(activityIsStrength);
  const totalEnduranceHours = actual.filter(activityIsCycling).reduce((sum, a) => sum + Number(a.durationHours || 0), 0) +
    planned.filter(x => x.cycling).reduce((sum, x) => sum + Number(x.durationHours || 0), 0);

  const cyclingActivities = actual.filter(activityIsCycling);
  const latestRide = cyclingActivities.filter(a => a.end).sort((a,b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];
  const hoursSinceRide = latestRide?.end ? hoursBetween(latestRide.end, new Date().toISOString()) : null;

  return {
    cycling: Boolean(cycling),
    strength,
    endurance: Boolean(cycling) || totalEnduranceHours >= 1,
    training: actual.length > 0 || planned.length > 0,
    totalEnduranceHours,
    postRide: Boolean(latestRide && hoursSinceRide != null && hoursSinceRide >= 0 && hoursSinceRide <= 2.5),
    latestRideEnd: latestRide?.end || null,
    hoursSinceRide: hoursSinceRide != null ? Math.round(hoursSinceRide * 100) / 100 : null
  };
}

async function energyForDate(env, date) {
  const nextDate = dateDaysFromDate(date, 1);

  const google = await env.DB.prepare(`
    SELECT value_numeric, sample_time
    FROM health_datapoints
    WHERE user_id = ? AND data_type = 'total-calories'
      AND sample_time >= ?
      AND sample_time < ?
    ORDER BY sample_time DESC, id DESC
    LIMIT 1
  `).bind(env.USER_ID, date, nextDate).first();

  const planned = await env.DB.prepare(`
    SELECT *
    FROM health_datapoints
    WHERE user_id = ? AND source_family IN ('intervals','local')
      AND data_type = 'planned-workout'
      AND start_time >= ?
      AND start_time < ?
    ORDER BY start_time
  `).bind(env.USER_ID, date, nextDate).all();

  const activities = await env.DB.prepare(`
    SELECT *
    FROM health_datapoints
    WHERE user_id = ? AND source_family IN ('intervals','local')
      AND data_type = 'activity'
      AND start_time >= ?
      AND start_time < ?
      AND (record_role IS NULL OR record_role != 'duplicate')
    ORDER BY start_time
  `).bind(env.USER_ID, date, nextDate).all();

  // Google Health stores UTC: the user's day runs from local midnight to midnight.
  const dayStart = dayStartUtc(date), dayEnd = dayStartUtc(nextDate);
  const googleExercises = await env.DB.prepare(`
    SELECT *
    FROM health_datapoints
    WHERE user_id = ? AND source_family = 'google-wearables'
      AND data_type = 'exercise'
      AND start_time >= ?
      AND start_time < ?
      AND (record_role IS NULL OR record_role != 'duplicate')
    ORDER BY start_time
  `).bind(env.USER_ID, dayStart, dayEnd).all();

  const weight = await latestStoredWeight(env.DB, env.USER_ID);
  const profile = await loadEffectiveProfile(env.DB, env.USER_ID);
  // Sport is estimated from the profile only when no source tracks activities.
  const activityTracked = await hasRecentActivityData(env.DB,env.USER_ID);
  const baseline = energyBaseline(profile, weight ? Number(weight.value_numeric) : null, {
    isOwner: env.USER_IS_OWNER === true,
    activityTracked
  });

  const plannedRaw = planned.results.map(r => ({
    id: r.external_id,
    ...plannedWorkoutInfo(JSON.parse(r.payload_json))
  })).filter(w => {
    const name=String(w.name||"").trim();
    const type=String(w.type||"").trim();
    return !((/^weekly$/i.test(name)||/^weekly$/i.test(type))&&!w.durationHours&&!w.tss);
  });
  const plannedWorkouts=[];
  const plannedKeys=new Set();
  for(const w of plannedRaw){
    const genericWeekly=/^weekly$/i.test(String(w.name||"").trim()) || /^weekly$/i.test(String(w.type||"").trim());
    if(genericWeekly) continue;
    const key=String(w.start||"").slice(0,10)+"|"+String(w.name||"").toLowerCase()+"|"+Math.round(Number(w.durationHours||0)*100);
    if(plannedKeys.has(key)) continue;
    plannedKeys.add(key); plannedWorkouts.push(w);
  }

  // Every sport from Intervals.icu counts: rides, runs, strength, walks, swims.
  const intervalsRows = activities.results.filter(row => { try { JSON.parse(row.payload_json || "{}"); return true; } catch { return false; } });
  const intervalsCompleted = intervalsRows.map(row => {
    const payload = JSON.parse(row.payload_json || "{}");
    const actualCalories =
      Number(payload.calories_kcal ?? payload.calories ?? payload.icu_calories ?? row.value_numeric ?? 0);
    return {
      id: row.external_id,
      source: "intervals",
      type: payload.type || payload.category || "Unknown",
      calories: actualCalories,
      start: row.start_time,
      end: row.end_time,
      durationHours: (activityNumber(payload, ["moving_time", "elapsed_time", "duration_seconds", "duration"]) || 0) / 3600 || hoursBetween(row.start_time, row.end_time),
      pairedEventId: payload.paired_event_id || payload.pairedEventId || payload.event_id || payload.eventId || null,
      plannedEventId: payload.paired_activity_id || payload.pairedActivityId || payload.activity_id || payload.activityId || null,
      tss: activityNumber(payload, ["icu_training_load", "training_load", "tss"]),
      name: payload.name || payload.title || payload.description || (payload._note ? "Aktivita z Intervals" : ""),
      payload
    };
  });

  // One workout from both sources counts once (the sync has usually marked the copy already).
  const googleAll = googleExercises.results.map(googleExerciseActivity);
  const copies = new Set(pairSessions([...intervalsCompleted, ...googleAll]).map(pair => pair.drop));
  const googleCompleted = googleAll.filter(activity => !copies.has(activity));
  if (googleCompleted.some(a => a.averageHeartRate == null)) {
    try {
      const samples = (await env.DB.prepare(`
        SELECT sample_time, value_numeric, payload_json FROM health_datapoints
        WHERE user_id = ? AND data_type IN ('heart-rate', 'heart_rate')
          AND sample_time >= ? AND sample_time < ?
        LIMIT 5000
      `).bind(env.USER_ID, dayStart, dayEnd).all()).results || [];
      for (const a of googleCompleted) if (a.averageHeartRate == null) {
        const bpm = heartRateFromSamples(a, samples);
        if (bpm != null) { a.averageHeartRate = bpm; a.payload.average_heartrate = bpm; a.heartRateSource = "samples"; }
      }
    } catch (error) { console.error("Heart-rate samples read failed", error.message); }
  }

  const completed = [...intervalsCompleted.filter(activity => !copies.has(activity)), ...googleCompleted]
    .filter(a => {
      const name=String(a.name||"").trim().toLowerCase();
      const type=String(a.type||"").trim().toLowerCase();
      return (name && name!=="unknown") || (type && type!=="unknown") || Number(a.durationHours||0)>0 || Number(a.calories||0)>0;
    })
    .sort((a, b) => new Date(a.start || 0).getTime() - new Date(b.start || 0).getTime());
  const walking=completed.filter(a=>/^(Walk|Walking)$/i.test(a.type||''));
  if(walking.length){
    const telemetry=(await env.DB.prepare("SELECT start_time,end_time,value_numeric FROM health_datapoints WHERE user_id=? AND source_family='google-wearables' AND data_type='active-energy-burned' AND start_time>=? AND start_time<? AND (record_role IS NULL OR record_role!='duplicate') ORDER BY start_time").bind(env.USER_ID,dayStart,dayEnd).all().catch(()=>({results:[]}))).results||[];
    for(const activity of walking){
      const checked=walkingEnergyCheck(activity,weight?.value_numeric),measured=activityTelemetryEnergy(activity,telemetry);
      activity.reportedCalories=activity.calories;
      if(measured){activity.calories=measured.kcal;activity.calorieSource=measured.source;activity.energyCoverage=measured.coverage;}
      const check=walkingEnergyCheck(activity,weight?.value_numeric);
      if(check){activity.energyCheck={...check,summaryCalories:activity.reportedCalories,summaryMismatch:checked?.status==='review',telemetry:measured};activity.caloriesForPlanning=measured?measured.kcal:check.status==='review'?check.estimated:activity.calories;}
    }
  }

  // One planned session is paired with at most one real activity.  The pairing
  // becomes part of the API response so the UI can render one combined card
  // instead of a misleading “plan + completed activity” duplicate.
  const matchedPlannedWorkouts = [];
  const unmatchedPlanned = [];
  for (const workout of plannedWorkouts) {
    const actual = plannedMatch(workout, completed);
    if (actual) {
      matchedPlannedWorkouts.push({ planned: workout, actualId: actual.id, source: actual.source });
    } else {
      unmatchedPlanned.push(workout);
    }
  }

  // Historical complete days: Fitbit/Google total-calories is authoritative.
  // Today/future: total calories may be incomplete, so project from rest-day
  // baseline plus the incremental cost of completed/planned activity.
  const nowDate = localToday();
  const isCompleteDay = date < nowDate;
  const observed = google?.value_numeric != null ? Number(google.value_numeric) : null;

  let estimatedTDEE = null;
  if (isCompleteDay && observed != null && observed > 1000) {
    estimatedTDEE = Math.round(observed);
  } else if (baseline.ready) {
    let activityAdjustment = 0;
    for (const a of completed) {
      const rate = CONFIG.activityKcalPerHour[a.type] ? activityKcalPerHourFor(a.type, weight?.value_numeric) : (a.payload && a.payload.category === "Ride" ? CONFIG.activityKcalPerHour.Ride : 400);
      const actual = Number(a.caloriesForPlanning??a.calories);
      activityAdjustment += actual > 0 ? actual : (a.durationHours || 0) * rate;
    }
    for (const w of unmatchedPlanned) {
      if (w.durationHours) {
        const type = w.type === "Ride" || w.cycling ? "Ride" : w.type;
        const rate = type === "Ride" || w.cycling ? cyclingKcalPerHour(w) : activityKcalPerHourFor(type, weight?.value_numeric);
        activityAdjustment += w.durationHours * rate;
      }
    }
    estimatedTDEE = Math.round(baseline.baselineRestTDEE + baseline.sportDaily + activityAdjustment);
  }

  // Rest-day intake is the personal resting expenditure minus the weekly goal;
  // tracked training adds 70 % of its cost, untracked sport its daily average.
  const deficit = baseline.ready ? baseline.deficit : 0;
  // Today and ahead, the weight trend corrects the estimate by energy balance
  // (up to ±250 kcal) when the weight moves clearly off the chosen goal
  // (trendAdjustment).
  const trend = baseline.ready && !isCompleteDay ? trendAdjustment(profile?.goal, await d1WeightTrend(env, date)) : { adjustment: 0, reason: null };
  const restIntakeTarget = baseline.ready ? baseline.baselineRestTDEE - deficit + trend.adjustment : null;
  const plannedTrainingCalories = baseline.ready && estimatedTDEE != null ? Math.max(0, estimatedTDEE - baseline.baselineRestTDEE - baseline.sportDaily) : 0;
  const trainingCoverage = 0.70;
  const computedTarget = baseline.ready ? Math.min(4000, Math.round(restIntakeTarget + baseline.sportDaily + plannedTrainingCalories * trainingCoverage)) : null;
  const target = baseline.ready ? Math.max(baseline.floor, computedTarget) : null;
  // The safety floor holds the target up: the chosen pace is not reachable.
  const floorGapKcal = baseline.ready && computedTarget < baseline.floor ? baseline.floor - computedTarget : 0;
  const context = {
    ...nutritionContext({ completedActivities: completed, unmatchedPlannedWorkouts: unmatchedPlanned }),
    ...(await nearbyRideContext(env, date))
  };
  const proteinKg = proteinReferenceKg(weight ? Number(weight.value_numeric) : null, profile?.height);
  const macroTargets = dailyMacroTargets(proteinKg, target, context);

  return {
    date,
    currentWeight: weight ? Number(weight.value_numeric) : null,
    googleTotalCalories: observed,
    completedActivities: completed,
    plannedWorkouts,
    unmatchedPlannedWorkouts: unmatchedPlanned,
    matchedPlannedWorkouts,
    estimatedPlannedActivityCalories: Math.round(unmatchedPlanned.reduce((sum, w) => {
      if (!w.durationHours) return sum;
      const type = w.type === "Ride" || w.cycling ? "Ride" : w.type;
      return sum + w.durationHours * (type === "Ride" || w.cycling ? cyclingKcalPerHour(w) : activityKcalPerHourFor(type, weight?.value_numeric));
    }, 0)),
    actualActivityCalories: Math.round(completed.reduce((sum, a) => sum + Number(a.calories || 0), 0)),
    suppressedPlannedWorkouts: plannedWorkouts.length - unmatchedPlanned.length,
    calorieBreakdown: {
      source: baseline.source,
      restingMetabolicRate: baseline.bmr ?? null,
      baselineRestTDEE: baseline.baselineRestTDEE ?? null,
      sportDailyAverage: baseline.sportDaily ?? 0,
      activityAdjustment: Math.max(0, plannedTrainingCalories),
      trainingCoverage: 0.70,
      restIntakeTarget,
      weightLossDeficit: Math.round(deficit),
      uncappedTarget: estimatedTDEE != null && baseline.ready ? Math.round(estimatedTDEE - deficit) : null,
      minTarget: baseline.floor ?? null,
      maxTarget: 4000,
      floorApplied: floorGapKcal > 0,
      floorGapKcal,
      trendAdjustment: trend.adjustment,
      trendReason: trend.reason
    },
    proteinReferenceKg: proteinKg,
    energyProfile: { ready: baseline.ready, source: baseline.source, missing: baseline.missing, targetWeightKg: baseline.targetWeightKg ?? null, floor: baseline.floor ?? null },
    estimatedTDEE,
    calorieTarget: target,
    macroTargets,
    nutritionContext: context
  };
}

// ======================================================
// DAILY ANALYSIS
// ======================================================

// How the day's target relates to the weekly weight goal, in Czech.
function goalPhrase(energy) {
  const deficit = Number(energy.calorieBreakdown?.weightLossDeficit) || 0;
  const target = energy.energyProfile?.targetWeightKg;
  if (deficit > 0) return target ? L(`cílové tempo úbytku hmotnosti směrem k ${target} kg`, `your target rate of weight loss towards ${target} kg`) : L("cílové tempo úbytku hmotnosti", "your target rate of weight loss");
  return L("udržení hmotnosti", "maintaining your weight");
}

async function analysisDaily(
  env,
  url
) {
  const date =
    url.searchParams.get(
      "date"
    ) ||
    localToday();

  const energy =
    await energyForDate(
      env,
      date
    );

  const weights =
    await weightHistory(
      env,
      CONFIG.weightDays
    );

  const weight7 =
    weightTrend(
      weights,
      7
    );

  const weight30 =
    weightTrend(
      weights,
      30
    );

  const protein =
    energy.proteinReferenceKg
      ? Math.round(
          energy.proteinReferenceKg *
          CONFIG.proteinGramsPerKg
        )
      : null;

  const actualRide = energy.completedActivities.find(activityIsCycling);
  const plannedRide =
    energy.unmatchedPlannedWorkouts.find(
      x => x.cycling
    );

  let fueling = null;

  if (actualRide) {
    fueling = calculateFueling(
      energy.currentWeight,
      { durationHours: actualRide.durationHours || 0 }
    );
    fueling.source = "actual";
  } else if (plannedRide) {
    fueling = calculateFueling(
      energy.currentWeight,
      plannedRide
    );
    fueling.source = "planned";
  }

  return Response.json({
    status: "ok",

    date,

    calories: {
      target:
        energy.calorieTarget,

      estimatedTDEE:
        energy.estimatedTDEE,

      googleObserved:
        energy.googleTotalCalories
    },

    weight: {
      current:
        energy.currentWeight,

      average7d:
        weight7,

      average30d:
        weight30,

      records:
        weights
    },

    nutrition: {
      protein: protein,
      calorieBreakdown: energy.calorieBreakdown,
      macros: energy.macroTargets,
      calorieTarget: energy.calorieTarget,
      targetWeightKg: energy.energyProfile.targetWeightKg,
      missing: energy.energyProfile.missing,
      energySource: energy.energyProfile.source,
      reason: !energy.energyProfile.ready
        ? L("Kalorický cíl zatím nepočítám, chybí: ", "I can't calculate a calorie goal yet; missing: ") + energy.energyProfile.missing.map(k => MISSING_LABELS[k] || k).join(", ") + "."
        : (energy.nutritionContext?.endurance
        ? L("Dnešní cíl zohledňuje vytrvalostní zátěž a ", "Today's goal accounts for your endurance load and ") + goalPhrase(energy) + "."
        : energy.nutritionContext?.preRide
          ? L("Zítřejší kolo je zohledněné už dnes: mírně více sacharidů pro doplnění glykogenu, méně tuku, protein zůstává stabilní.", "Tomorrow's ride is already accounted for today: slightly more carbs to top up glycogen, less fat, protein stays the same.")
        : energy.nutritionContext?.training
          ? L("Dnešní cíl zohledňuje plánovaný/dokončený trénink a ", "Today's goal accounts for your planned/completed training and ") + goalPhrase(energy) + "."
          : L("Dnešní cíl vychází z klidového energetického základu a ", "Today's goal is based on your resting energy baseline and ") + goalPhrase(energy) + ".")
        + (energy.calorieBreakdown?.trendAdjustment ? L(" Podle vývoje váhy: ", " Based on your weight trend: ") + TREND_REASONS[energy.calorieBreakdown.trendReason] + L(", o ", ", ") + Math.abs(energy.calorieBreakdown.trendAdjustment) + " kcal " + (energy.calorieBreakdown.trendAdjustment < 0 ? L("méně", "less") : L("víc", "more")) + "." : "")
        + (energy.calorieBreakdown?.floorApplied ? L(` Cíl drží bezpečné minimum ${energy.calorieBreakdown.minTarget} kcal, takže hubnutí půjde pomaleji než zvolené tempo.`, ` The goal stays at the safe minimum of ${energy.calorieBreakdown.minTarget} kcal, so weight loss will be slower than the chosen rate.`) : ""),
      foodLog:
        await foodLogForDate(env, date)
    },

    training: {
      completed: energy.completedActivities,
      // Only plans with no matching completed activity stay in this list.
      planned: energy.unmatchedPlannedWorkouts,
      matched: energy.matchedPlannedWorkouts
    },

    burned: {
      total: energy.estimatedTDEE,
      observedTotal: energy.googleTotalCalories,
      activity: energy.actualActivityCalories,
      source: energy.googleTotalCalories != null && date < localToday() ? "observed" : "estimated"
    },

    fueling
  });
}


// ======================================================
// ENERGY ENDPOINT
// ======================================================

async function analysisEnergy(
  env,
  url
) {
  const date =
    url.searchParams.get(
      "date"
    ) ||
    localToday();

  const energy =
    await energyForDate(
      env,
      date
    );

  return Response.json({
    status: "ok",
    date,

    final: {
      estimatedTDEE:
        energy.estimatedTDEE,

      calorieTarget:
        energy.calorieTarget,

      actualActivityCalories:
        energy.actualActivityCalories,

      estimatedPlannedActivityCalories:
        energy.estimatedPlannedActivityCalories,

      suppressedPlannedWorkouts:
        energy.suppressedPlannedWorkouts
    },

    energyProfile:
      energy.energyProfile,

    completedActivities:
      energy.completedActivities,

    plannedWorkouts:
      energy.plannedWorkouts
  });
}


// ======================================================
// FUELING ENGINE
// ======================================================

function calculateFueling(
  weight,
  workout
) {
  const kg =
    Number(weight) || null;

  const duration =
    workout.durationHours ||
    0;

  const rideCarbsPerHour =
    CONFIG.defaultRideCarbsPerHour;

  const rideCarbs =
    Math.round(
      duration *
      rideCarbsPerHour
    );

  // Pre-ride carbohydrate is per kg; without a weight it is not estimated.
  const preRideCarbs = kg
    ? Math.round(kg * CONFIG.preRideCarbsPerKg)
    : null;

  const fluid =
    Math.round(
      duration *
      CONFIG.fluidMlPerHour
    );

  return {
    durationHours:
      Math.round(
        duration * 100
      ) / 100,

    carbsPerHour:
      rideCarbsPerHour,

    carbsDuringRide:
      rideCarbs,

    carbsBeforeRide:
      preRideCarbs,

    recommendedFluidMl:
      fluid,

    recommendation:
      (preRideCarbs != null ? `Before the ride: approximately ${preRideCarbs} g carbohydrate. ` : "") +
      `During the ride: approximately ${rideCarbsPerHour} g carbohydrate/hour ` +
      `(${rideCarbs} g total). ` +
      `Estimated fluid need: approximately ${fluid} ml.`
  };
}



// ======================================================
// COOKBOOK
// ======================================================

async function cookbookRecipeByPage(page) {
  return getCookbookRecipeByPage(page);
}

async function cookbookSearchResults(url) {
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const category = (url.searchParams.get("category") || "").trim().toLowerCase();
  const maxMinutes = Number(url.searchParams.get("max_minutes"));
  const mealPrep = url.searchParams.get("meal_prep");
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") || 10)));

  const cookbookData = await getCookbook();
  const cookbook = Array.isArray(cookbookData) ? cookbookData : (cookbookData?.recipes || []);

  let results = cookbook.filter(recipe => {
    if (category && recipe.category.toLowerCase() !== category) return false;
    if (Number.isFinite(maxMinutes) && maxMinutes > 0) {
      const match = String(recipe.time || "").match(/(\d+)/);
      if (match && Number(match[1]) > maxMinutes) return false;
    }
    if (mealPrep === "1" && !recipe.meal_prep) return false;
    return true;
  });

  if (q) {
    results = results
      .map(recipe => {
        const haystack = `${recipe.title} ${recipe.ingredients || ""} ${(recipe.ingredients_clean || []).join(" ")}`.toLowerCase();
        let score = haystack.includes(q) ? 100 : 0;
        for (const word of q.split(/\s+/).filter(Boolean)) {
          if (recipe.title.toLowerCase().includes(word)) score += 20;
          else if (haystack.includes(word)) score += 5;
        }
        return { recipe, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.recipe);
  }

  return results.slice(0, limit);
}

async function cookbookPage(env, url) {
  const page = url.searchParams.get("page");
  const recipe = await cookbookRecipeByPage(page);

  if (!recipe) {
    return Response.json({
      status: "error",
      message: "Cookbook page not found",
      page
    }, { status: 404 });
  }

  return Response.json({
    status: "ok",
    recipe
  });
}

async function cookbookSearch(env, url) {
  const recipes = await cookbookSearchResults(url);
  return Response.json({
    status: "ok",
    count: recipes.length,
    recipes
  });
}

// ======================================================
// FOOD LOG
// ======================================================

function scaleRecipe(recipe, servings) {
  const factor = Number(servings);
  const s = Number.isFinite(factor) && factor > 0 ? factor : 1;

  return {
    kcal: Math.round(recipe.kcal * s),
    protein_g: Math.round(recipe.protein_g * s * 10) / 10,
    carbs_g: Math.round(recipe.carbs_g * s * 10) / 10,
    fat_g: Math.round(recipe.fat_g * s * 10) / 10,
    fiber_g: Math.round(recipe.fiber_g * s * 10) / 10
  };
}

async function foodLogForDate(env, date) {
  // Planned or cancelled food (ChatGPT can plan a meal) is not eaten.
  const rows = await env.DB.prepare(`
    SELECT * FROM food_logs
    WHERE user_id = ? AND consumed_date = ? AND (status IS NULL OR status='eaten')
    ORDER BY consumed_at, id
  `).bind(env.USER_ID, date).all();

  const entries = rows.results || [];
  const totals = entries.reduce((sum, row) => {
    sum.kcal += Number(row.kcal || 0);
    sum.protein_g += Number(row.protein_g || 0);
    sum.carbs_g += Number(row.carbs_g || 0);
    sum.fat_g += Number(row.fat_g || 0);
    sum.fiber_g += Number(row.fiber_g || 0);
    return sum;
  }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key] * 10) / 10;
  }

  return { entries, totals };
}

async function foodLog(env, request, url) {
  if (request.method === "GET") {
    const date = url.searchParams.get("date") || localToday();
    const log = await foodLogForDate(env, date);
    return Response.json({ status: "ok", date, ...log });
  }

  if (request.method !== "POST") {
    return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const date = body.date || body.consumed_date || localToday();
  const consumedAt = body.consumed_at || new Date().toISOString();
  const servings = Number(body.servings || 1);

  let recipe = null;
  if (body.page != null) recipe = await cookbookRecipeByPage(body.page);
  if (body.recipe_page != null) recipe = await cookbookRecipeByPage(body.recipe_page);

  if (body.page != null && !recipe) {
    return Response.json({ status: "error", message: "Cookbook page not found", page: body.page }, { status: 404 });
  }

  const scaled = recipe ? scaleRecipe(recipe, servings) : {
    kcal: Number(body.kcal || 0),
    protein_g: Number(body.protein_g || 0),
    carbs_g: Number(body.carbs_g || 0),
    fat_g: Number(body.fat_g || 0),
    fiber_g: Number(body.fiber_g || 0)
  };

  const name = body.name || (recipe && recipe.title) || "Manual entry";
  const source = recipe ? "cookbook" : (body.source || "manual");

  if (!name || !Number.isFinite(scaled.kcal)) {
    return Response.json({ status: "error", message: "name and kcal are required" }, { status: 400 });
  }

  const result = await env.DB.prepare(`
    INSERT INTO food_logs (user_id, 
      consumed_date, consumed_at, cookbook_page, recipe_title,
      servings, kcal, protein_g, carbs_g, fat_g, fiber_g, source, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(env.USER_ID, 
    date,
    consumedAt,
    recipe ? recipe.page : null,
    recipe ? recipe.title : name,
    servings,
    scaled.kcal,
    scaled.protein_g,
    scaled.carbs_g,
    scaled.fat_g,
    scaled.fiber_g,
    source,
    body.note || null
  ).run();

  return Response.json({
    status: "ok",
    id: result.meta.last_row_id,
    date,
    entry: {
      name,
      page: recipe ? recipe.page : null,
      servings,
      source,
      ...scaled
    }
  });
}

// ======================================================
// FOOD LOG MANAGEMENT
// ======================================================

async function deleteFoodLog(env, url) {
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ status: "error", message: "Valid id is required" }, { status: 400 });
  }
  const result = await env.DB.prepare(`DELETE FROM food_logs WHERE user_id = ? AND id = ?`).bind(env.USER_ID, id).run();
  return Response.json({ status: "ok", id, deleted: Number(result.meta.changes || 0) > 0 });
}


// ======================================================
// WEIGHT ENDPOINT
// ======================================================

async function healthWeight(env) {
  const rows =
    await weightHistory(
      env
    );

  return Response.json({
    status: "ok",

    latest:
      rows.length
        ? rows[rows.length - 1]
        : null,

    average7d:
      weightTrend(rows, 7),

    average30d:
      weightTrend(rows, 30),

    records:
      rows
  });
}


// ======================================================
// ACTIVITIES ENDPOINT
// ======================================================

async function healthActivities(env) {
  const rows =
    await env.DB
      .prepare(
        `SELECT *
         FROM health_datapoints
         WHERE user_id = ? AND (
           data_type = 'activity'
           OR data_type = 'exercise'
           OR data_type = 'planned-workout'
         )
         ORDER BY start_time DESC
         LIMIT 500`
      )
      .bind(env.USER_ID)
      .all();

  const activities = (rows.results || []).map(row => {
    if(row.start_time && row.end_time) return row;
    let p = {};
    try { p = JSON.parse(row.payload_json || "{}"); } catch {}
    const nested = p.exercise || p.sleep || p;
    const interval = nested.interval || {};
    return {
      ...row,
      start_time: row.start_time || interval.startTime || interval.civilStartTime || null,
      end_time: row.end_time || interval.endTime || interval.civilEndTime || null
    };
  });
  return Response.json({
    status: "ok",
    count: activities.length,
    activities
  });
}

async function healthSleep(env, url) {
  const start = url.searchParams.get("start") || dateDaysAgo(30);
  const end = url.searchParams.get("end") || dateDaysFromNow(1);
  // Older Google Health imports may have null DB timestamps because the
  // session interval is nested inside payload_json. Read recent sleep rows first,
  // then normalize/filter using the nested interval as well.
  const rows = await env.DB.prepare(`
    SELECT external_id, start_time, end_time, payload_json
    FROM health_datapoints
    WHERE user_id = ? AND data_type = 'sleep'
      AND source_family = 'google-wearables'
    ORDER BY COALESCE(start_time, end_time) DESC, id DESC
    LIMIT 5000
  `).bind(env.USER_ID).all();

  const sessions = (rows.results || []).map(sleepSessionFromRow);

  const filteredSessions = sessions.filter(s => {
    const sStart = localDate(s.startTime) || "";
    const sEnd = s.date || "";
    return (sStart && sStart < end && (!sEnd || sEnd >= start)) || (sEnd && sEnd >= start && sEnd < end);
  });
  // Google can expose the same nightly session more than once through different
  // imported records. The dashboard should show one night, not duplicate rows.
  const uniqueSessions = [];
  const seenSessions = new Set();
  for (const session of filteredSessions.sort((a,b)=>new Date(b.endTime||b.startTime||0)-new Date(a.endTime||a.startTime||0))) {
    const key = String(session.startTime||"")+"|"+String(session.endTime||"");
    if (!key || seenSessions.has(key)) continue;
    seenSessions.add(key);
    uniqueSessions.push(session);
  }

  const totals = uniqueSessions.reduce((a,s)=>{
    a.durationMin += Number(s.durationMin||0);
    for(const [k,v] of Object.entries(s.stages||{})) a.stages[k]=(a.stages[k]||0)+Number(v||0);
    return a;
  },{durationMin:0,stages:{}});
  const avg = uniqueSessions.length ? totals.durationMin/uniqueSessions.length : 0;
  return Response.json({status:"ok",source:"google-health",start,end,count:uniqueSessions.length,averageDurationMin:Math.round(avg),totals,sessions:uniqueSessions});
}




// ======================================================
// COMPLETE SYNC
// ======================================================

