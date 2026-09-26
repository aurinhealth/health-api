import { getCookbook, getCookbookRecipeByPage } from "./cookbook.js";

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "* * * * *") {
      if(new Date().getUTCMinutes()===0)await syncGoogleRecent(env);
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

      if (url.pathname === "/auth-test") {
        return await testGoogleAuth(env);
      }

      if (url.pathname === "/test/intervals") {
        return await testIntervals(env);
      }

      if (url.pathname === "/sync/google/status") {
        return await googleSyncStatus(env);
      }
      if(url.pathname==='/sync/google/recent'&&request.method==='POST')return Response.json(await syncGoogleRecent(env));

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

      if (url.pathname === "/sync/all") {
        return await syncAll(env);
      }

      if (url.pathname === "/analysis/daily") {
        return await analysisDaily(env, url);
      }

      if (url.pathname === "/analysis/energy") {
        return await analysisEnergy(env, url);
      }

      if (url.pathname === "/analysis/fueling") {
        return await analysisFueling(env, url);
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

      if (url.pathname === "/food/log-text") {
        return await foodLogText(env, request, url);
      }

      if (url.pathname === "/food/today") {
        return await foodLog(env, request, url);
      }

      if (url.pathname === "/food/recommend") {
        return await foodRecommend(env, url);
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

      if (url.pathname === "/health/db") {
        return await healthDb(env);
      }

      if (url.pathname === "/health/nutrition") {
        return await healthNutrition(env, url);
      }

      if (url.pathname === "/health/nutrition/log") {
        return await googleNutritionLogEndpoint(env, request);
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
  if (!Number.isFinite(value) || value < 30 || value > 300) return Response.json({status:"error",message:"Neplatná hmotnost."},{status:400});
  const date = body?.date || pragueDate(), at = date+"T12:00:00+02:00";
  const token = await googleToken(env);
  const response = await fetch("https://health.googleapis.com/v4/users/me/dataTypes/weight/dataPoints", {
    method:"POST",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({weight:{sampleTime:{physicalTime:at,utcOffset:"7200s"},weightGrams:value*1000,notes:"Petr Fitness Data"}})
  });
  const google = await response.json().catch(()=>({}));
  if (!response.ok) return Response.json({status:"error",message:"Google Health weight write failed",google},{status:response.status});
  await savePoint(env,"manual","weight",{value_kg:value,source:"manual",google_operation:google},value,"kg",at,at,at,"manual-weight:"+date);
  return Response.json({status:"ok",date,kg:value,google});
}

// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {
  weightDays: 30,
  activityDays: 365,
  plannedDaysAhead: 7,

  // Rest-day energy baseline. This is intentionally conservative and
  // will later be calibrated against actual intake + weight trend.
  baselineRestTDEE: 2550,

  weightLossTargetKgPerWeek: 0.5,
  targetWeightKg: 80,
  proteinGramsPerKg: 2.0,

  defaultRideCarbsPerHour: 90,
  preRideCarbsPerKg: 1.0,
  preRideWindowHours: 2,
  fluidMlPerHour: 700,

  activityKcalPerHour: {
    Ride: 500,
    Run: 650,
    Walk: 250,
    WeightTraining: 400,
    Workout: 450
  },

  minCalorieTarget: 2000,
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

function pragueDate() {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).formatToParts(new Date());

  const year = parts.find(
    x => x.type === "year"
  ).value;

  const month = parts.find(
    x => x.type === "month"
  ).value;

  const day = parts.find(
    x => x.type === "day"
  ).value;

  return `${year}-${month}-${day}`;
}


function dateDaysAgo(days) {
  const p = pragueDate().split("-");

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
  const p = pragueDate().split("-");

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

async function googleToken(env) {
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
        // Health rejects the Sheets ("wise") scope on a shared refresh token.
        // Request only the previously consented, supported Health scopes.
        scope: [
          "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
          "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
          "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
          "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
          "https://www.googleapis.com/auth/googlehealth.nutrition.writeonly"
        ].join(" ")
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    if (data?.error === "invalid_grant") {
      throw new Error(
        "Google OAuth refresh token is invalid or expired. Reauthorize at /oauth/google and replace the GOOGLE_REFRESH_TOKEN secret with the newly issued token."
      );
    }
    throw new Error("Google OAuth error: " + JSON.stringify(data));
  }

  return data.access_token;
}


async function testGoogleAuth(env) {
  const token =
    await googleToken(env);

  return Response.json({
    status: "ok",
    google_oauth: "working",
    has_access_token:
      Boolean(token)
  });
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

  return "Basic " +
    btoa(
      "API_KEY:" +
      env.INTERVALS_API_KEY
    );
}


async function intervalsGet(
  env,
  path
) {
  const response = await fetch(
    "https://intervals.icu/api/v1" +
    path,
    {
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
    throw new Error(
      "Intervals.icu HTTP " +
      response.status +
      ": " +
      JSON.stringify(data)
    );
  }

  return data;
}


async function testIntervals(env) {
  const data =
    await intervalsGet(
      env,
      "/athlete/0/profile"
    );

  return Response.json({
    status: "ok",
    source: "intervals.icu",
    api_connection: "working",
    athlete: data
  });
}


// ======================================================
// GOOGLE SYNC STATUS
// ======================================================
async function ensureSyncStatusTable(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sync_status (sync_name TEXT PRIMARY KEY, status TEXT NOT NULL, started_at TEXT, finished_at TEXT, details_json TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)').run();
}

async function setGoogleSyncStatus(env, status, details = null) {
  await ensureSyncStatusTable(env);
  await env.DB.prepare('INSERT INTO sync_status (sync_name, status, started_at, finished_at, details_json, updated_at) VALUES (\'google\', ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(sync_name) DO UPDATE SET status = excluded.status, started_at = COALESCE(excluded.started_at, sync_status.started_at), finished_at = excluded.finished_at, details_json = excluded.details_json, updated_at = CURRENT_TIMESTAMP')
    .bind(status, details?.started_at || null, details?.finished_at || null, details ? JSON.stringify(details) : null).run();
}

async function googleSyncStatus(env) {
  await ensureSyncStatusTable(env);
  const row = await env.DB.prepare('SELECT sync_name, status, started_at, finished_at, details_json, updated_at FROM sync_status WHERE sync_name = \'google\'').first();
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
  const id =
    externalId ||
    payload.name ||
    `${type}:${sampleTime || startTime || crypto.randomUUID()}`;

  await env.DB
    .prepare(
      `INSERT INTO health_datapoints (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (
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
      source,
      type,
      id,
      sampleTime,
      startTime,
      endTime,
      value,
      unit,
      JSON.stringify(payload)
    )
    .run();

  return id;
}


async function markMatch(
  env,
  source,
  type,
  externalId,
  role,
  matchedId,
  confidence
) {
  await env.DB
    .prepare(
      `UPDATE health_datapoints
       SET
         record_role = ?,
         matched_activity_id = ?,
         match_confidence = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE source_family = ?
       AND data_type = ?
       AND external_id = ?`
    )
    .bind(
      role,
      matchedId,
      confidence,
      source,
      type,
      externalId
    )
    .run();
}


// ======================================================
// GOOGLE DAILY ROLLUP
// ======================================================

function googleDate(date) {
  const p = date.split("-");

  return {
    date: {
      year: Number(p[0]),
      month: Number(p[1]),
      day: Number(p[2])
    },

    time: {
      hours: 0,
      minutes: 0,
      seconds: 0,
      nanos: 0
    }
  };
}


async function googleDailyRollup(
  token,
  type,
  start,
  end
) {
  const response =
    await fetch(
      `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints:dailyRollUp`,
      {
        method: "POST",

        headers: {
          "Authorization":
            "Bearer " + token,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          range: {
            start:
              googleDate(start),

            end:
              googleDate(end)
          },

          windowSizeDays: 1,

          dataSourceFamily:
            "users/me/dataSourceFamilies/google-wearables"
        })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `${type} HTTP ${response.status}: ` +
      JSON.stringify(data)
    );
  }

  return data;
}


// ======================================================
// GOOGLE RECONCILE
// ======================================================

async function googleReconcile(
  token,
  type,
  filterName,
  filterType,
  startDate,
  sourceFamily,
  endDate = null
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

  const all = [];
  let pageToken = null;

  for (let page = 0; page < 60; page++) {
    if (pageToken) params.set("pageToken", pageToken);

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

    all.push(...(data.dataPoints || []));
    pageToken = data.nextPageToken || null;
    if (!pageToken) break;
  }

  return all;
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

function googleNutritionWritePayload(body) {
  const now = new Date();
  const start = body.consumed_at
    ? new Date(body.consumed_at)
    : now;

  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid consumed_at");
  }

  const end = body.end_at
    ? new Date(body.end_at)
    : new Date(start.getTime() + 60 * 1000);

  if (Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid end_at");
  }

  const log = {
    interval: {
      startTime: start.toISOString(),
      endTime: end.toISOString()
    },
    foodDisplayName: body.name || body.foodDisplayName || "Food",
    mealType: body.mealType || "UNKNOWN",
    serving: {
      amount: Number(body.servings || 1)
    }
  };

  if (body.food) {
    delete log.foodDisplayName;
    log.food = String(body.food);
  } else {
    const kcal = Number(body.kcal);
    if (Number.isFinite(kcal)) log.energy = { kcal };

    const carbs = Number(body.carbs_g ?? body.carbohydrates_g);
    if (Number.isFinite(carbs)) log.totalCarbohydrate = { grams: carbs };

    const fat = Number(body.fat_g);
    if (Number.isFinite(fat)) log.totalFat = { grams: fat };

    const protein = Number(body.protein_g);
    if (Number.isFinite(protein)) {
      log.nutrients = [
        {
          nutrient: "PROTEIN",
          quantity: { grams: protein }
        }
      ];
    }
  }

  return { nutritionLog: log };
}

async function googleNutritionWrite(token, body) {
  const payload = googleNutritionWritePayload(body);

  const response = await fetch(
    "https://health.googleapis.com/v4/users/me/dataTypes/nutrition-log/dataPoints",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `nutrition-log write HTTP ${response.status}: ` +
      JSON.stringify(data)
    );
  }

  return data;
}

async function googleNutritionLogEndpoint(env, request) {
  if (request.method !== "POST") {
    return Response.json(
      { status: "error", message: "Method not allowed" },
      { status: 405 }
    );
  }

  try {
    const body = await request.json();
    const token = await googleToken(env);
    const result = await googleNutritionWrite(token, body);

    return Response.json({
      status: "ok",
      source: "google-health",
      operation: "nutrition-log.create",
      result
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        source: "google-health",
        operation: "nutrition-log.create",
        message: error.message
      },
      { status: 500 }
    );
  }
}

async function healthNutrition(env, url) {
  try {
    const token = await googleToken(env);
    const end = url.searchParams.get("end") || dateDaysFromNow(1);
    const start = url.searchParams.get("start") || dateDaysAgo(30);
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

  if (p.sampleTime) {
    sample = p.sampleTime.physicalTime || p.sampleTime.civilTime || null;
  }

  const daily = [
    "dailyRestingHeartRate",
    "dailyHeartRateVariability",
    "dailyOxygenSaturation",
    "dailyRespiratoryRate",
    "dailyVo2Max",
    "dailyHeartRateZones"
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

const GOOGLE_SYNC_PAGE_LIMIT = 1;

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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (source_family, data_type, external_id)
      DO UPDATE SET
        sample_time = excluded.sample_time,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        value_numeric = excluded.value_numeric,
        value_unit = excluded.value_unit,
        payload_json = excluded.payload_json,
        updated_at = CURRENT_TIMESTAMP`
    ).bind(
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
  const token=await googleToken(env),wanted=['sleep','daily-heart-rate-variability','daily-resting-heart-rate','steps','active-energy-burned','exercise'],configs=GOOGLE_SYNC_CONFIGS.filter(c=>wanted.includes(c[0]));
  const results=await Promise.all(configs.map(async([type,filter,typeFilter,family])=>{let pageToken=null,saved=0;try{for(let i=0;i<8;i++){const page=await googleReconcilePage(token,type,filter,typeFilter,dateDaysAgo(2),'users/me/dataSourceFamilies/'+family,dateDaysFromNow(1),pageToken);saved+=await saveGooglePointsBatch(env,family,type,page.dataPoints);pageToken=page.nextPageToken;if(!pageToken)break;}return{type,saved,status:pageToken?'partial':'ok'};}catch(error){return{type,saved,status:'error',message:error.message};}}));
  const result={status:results.some(r=>r.status!=='ok')?'partial':'ok',results};
  await ensureSyncStatusTable(env);
  await env.DB.prepare("INSERT INTO sync_status(sync_name,status,details_json,updated_at) VALUES('google_recent',?,?,datetime('now')) ON CONFLICT(sync_name) DO UPDATE SET status=excluded.status,details_json=excluded.details_json,updated_at=excluded.updated_at").bind(result.status,JSON.stringify(result)).run();
  return result;
}

async function readGoogleSyncState(env) {
  await ensureSyncStatusTable(env);
  const row = await env.DB.prepare(
    "SELECT status, started_at, finished_at, details_json, updated_at FROM sync_status WHERE sync_name = 'google'"
  ).first();

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
      const token = await googleToken(env);
      const start = dateDaysAgo(days);
      const end = dateDaysFromNow(1);

      const page = await googleReconcilePage(
        token,
        type,
        filterName,
        filterType,
        start,
        `users/me/dataSourceFamilies/${family}`,
        end,
        pageToken
      );

      const saved = await saveGooglePointsBatch(env, family, type, page.dataPoints);
      const existing = results.find(x => x.data_type === type);

      if (existing) {
        existing.records_found = Number(existing.records_found || 0) + page.dataPoints.length;
        existing.records_saved = Number(existing.records_saved || 0) + saved;
        existing.pages = Number(existing.pages || 0) + 1;
        existing.status = page.nextPageToken ? "partial" : "ok";
      } else {
        results.push({
          data_type: type,
          records_found: page.dataPoints.length,
          records_saved: saved,
          pages: 1,
          status: page.nextPageToken ? "partial" : "ok"
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
        status: "error",
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
// GOOGLE SYNC
// ======================================================

async function syncGoogle(env) {
  const token = await googleToken(env);
  const today = pragueDate();
  const results = [];

  const configs = [
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
    ["respiratory-rate-sleep-summary", "respiratory_rate_sleep_summary", "sample", "google-wearables", 7],
    ["sedentary-period", "sedentary_period", "interval", "google-wearables", 7],
    ["time-in-heart-rate-zone", "time_in_heart_rate_zone", "interval", "google-wearables", 7],
    ["sleep", "sleep", "sleep", "google-wearables", 730],
    ["exercise", "exercise", "exercise", "google-wearables", 365],
    ["weight", "weight", "sample", "google-sources", 365],
    ["body-fat", "body_fat", "sample", "google-sources", 30]
  ];

  const runConfig = async ([type, filterName, filterType, family, days]) => {
    try {
      const end = dateDaysFromNow(1);
      const start = dateDaysAgo(days);
      const points = await googleReconcile(
        token, type, filterName, filterType, start,
        `users/me/dataSourceFamilies/${family}`, end
      );
      let saved = 0;
      for (const point of points) {
        const i = googleInfo(type, point);
        const fallbackId = point?.name || `${type}:${i.sample || i.start || crypto.randomUUID()}`;
        await savePoint(env, family, type, point, i.value, i.unit, i.sample, i.start, i.end, fallbackId);
        saved++;
      }
      return { data_type: type, records_found: points.length, records_saved: saved, status: "ok" };
    } catch (error) {
      return { data_type: type, records_found: 0, records_saved: 0, status: "error", message: error?.message || String(error) };
    }
  };

  // Small concurrent batches prevent one slow Google dataset from blocking the whole sync.
  for (let offset = 0; offset < configs.length; offset += 4) {
    results.push(...await Promise.all(configs.slice(offset, offset + 4).map(runConfig)));
  }

  // Total calories is a daily rollup and is the source of truth for total
  // daily expenditure. We never add Intervals workout calories on top of it.
  try {
    const data = await googleDailyRollup(token, "total-calories", dateDaysAgo(7), dateDaysFromNow(1));
    const rollups = data.rollupDataPoints || [];
    let saved = 0;
    for (const r of rollups) {
      const d = r.date || r.startTime || null;
      const kcal = r.totalCalories?.kcalSum;
      if (kcal == null) continue;
      let day = null;
      if (d?.year) day = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      else if (typeof d === "string") day = d.slice(0, 10);
      if (!day) continue;
      await savePoint(env, "google-wearables", "total-calories", r, Number(kcal), "kcal", day, `${day}T00:00:00`, `${dateDaysFromNow(1)}T00:00:00`, `total-calories:${day}`);
      saved++;
    }
    results.push({ data_type: "total-calories", records_found: rollups.length, records_saved: saved, status: "ok" });
  } catch (error) {
    results.push({ data_type: "total-calories", records_found: 0, records_saved: 0, status: "error", message: error.message });
  }

  return Response.json({ status: "ok", source: "google", date: today, results });
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


async function syncIntervalsActivities(env) {
  const oldest =
    dateDaysAgo(
      CONFIG.activityDays
    );

  const newest =
    dateDaysFromNow(1);

  const activities =
    await intervalsGet(
      env,
      `/athlete/0/activities?oldest=${oldest}&newest=${newest}`
    );

  let saved = 0;

  for (const sourceActivity of activities) {
    const id = String(sourceActivity.id);
    let a = sourceActivity;
    if (sourceActivity?._note && !sourceActivity.name && !sourceActivity.type) {
      const existing = await env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE source_family='intervals' AND data_type='activity' AND external_id=? LIMIT 1").bind("activity:"+id).first();
      if (existing?.payload_json) {
        try {
          const previous=JSON.parse(existing.payload_json);
          a={...sourceActivity,name:previous.name||sourceActivity.name,type:previous.type||sourceActivity.type,category:previous.category||sourceActivity.category};
        } catch {}
      }
    }

    await savePoint(
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
    );

    saved++;
  }

  return {
    activities_found:
      activities.length,

    activities_saved:
      saved,

    activities
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

  await env.DB.prepare(
    `DELETE FROM health_datapoints
     WHERE source_family = 'intervals' AND data_type = 'planned-workout'
       AND start_time >= ? AND start_time < ?`
  ).bind(oldest, rangeEnd).run();

  let saved = 0;

  for (const e of events) {
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

    await savePoint(
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
    );

    saved++;
  }

  return {
    events_found:
      events.length,

    events_saved:
      saved,

    reconciled_from:
      oldest,

    events
  };
}


// ======================================================
// INTERVALS SYNC
// ======================================================
async function mirrorIntervalsActivitiesToSheet(env, activities) {
  const token = await googleToken(env);
  const spreadsheetId = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
  const sheetName = "Intervals";

  // User-facing view only. The Intervals activity ID remains in D1 and is not
  // shown here because it has no practical value during normal training review.
  const headers = ["Datum", "Aktivita", "Typ", "Čas min", "Vzdálenost km", "Kalorie"];

  const metaResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`,
    { headers: { Authorization: "Bearer " + token } }
  );
  const meta = await metaResponse.json();
  if (!metaResponse.ok) throw new Error("Google Sheets Intervals metadata HTTP " + metaResponse.status + ": " + JSON.stringify(meta.error || meta));

  const exists = (meta.sheets || []).find(s => s.properties?.title === sheetName);
  if (!exists) {
    const addResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetName } } }] })
      }
    );
    const addData = await addResponse.json();
    if (!addResponse.ok) throw new Error("Google Sheets Intervals addSheet HTTP " + addResponse.status + ": " + JSON.stringify(addData.error || addData));
  }

  const sourceActivities = Array.isArray(activities) ? activities : [];
  const rows = [headers];

  for (const a of sourceActivities) {
    const start = activityStart(a);
    const end = activityEnd(a);
    const name = a.name || a.title || "";
    const type = a.type || a.activity_type || a.category || "";

    let duration = activityNumber(a, ["duration_hours", "durationHours"]);
    if (duration == null) duration = activityNumber(a, ["duration", "duration_seconds", "moving_time", "elapsed_time"]);
    if (duration != null && duration > 1000) duration = duration / 3600;
    if (duration != null && duration > 12) duration = duration / 3600;
    if (duration == null && start && end) duration = hoursBetween(start, end);

    const directKm = activityNumber(a, ["distance_km", "distanceKm"]);
    const rawDistance = activityNumber(a, ["distance"]);
    const distanceKm = directKm != null ? directKm : (rawDistance != null ? rawDistance / 1000 : null);

    const calories = activityNumber(a, ["calories", "calories_kcal", "icu_calories"]);

    // Ignore empty placeholder activities (for example an activity with only
    // an internal ID and start timestamp). They remain available in D1.
    if (!name && !type && duration == null && distanceKm == null && calories == null) continue;

    rows.push([
      dateOnly(start),
      name,
      type,
      duration == null ? "" : Math.round(Number(duration) * 60),
      distanceKm == null ? "" : Number(Number(distanceKm).toFixed(1)),
      calories == null ? "" : Math.round(Number(calories))
    ]);
  }

  // Intervals.icu is the source mirror. Clear old helper columns too, so the
  // visible sheet can never retain the legacy J:P data.
  const range = "'" + sheetName + "'!A1:Z1000";
  const clearResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}" }
  );
  const clearData = await clearResponse.json();
  if (!clearResponse.ok) throw new Error("Google Sheets Intervals clear HTTP " + clearResponse.status + ": " + JSON.stringify(clearData.error || clearData));

  const writeRange = "'" + sheetName + "'!A1:F" + Math.max(1, rows.length);
  const writeResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows })
    }
  );
  const writeData = await writeResponse.json();
  if (!writeResponse.ok) throw new Error("Google Sheets Intervals write HTTP " + writeResponse.status + ": " + JSON.stringify(writeData.error || writeData));

  return { sheet: sheetName, rowsWritten: Math.max(0, rows.length - 1), visibleColumns: headers.length };
}


async function syncIntervals(env) {
  const activities =
    await syncIntervalsActivities(
      env
    );

  const planned =
    await syncIntervalsEvents(
      env
    );

  const historySheet =
    await mirrorIntervalsActivitiesToSheet(
      env,
      activities.activities
    );

  return Response.json({
    status: "ok",
    source: "intervals.icu",
    activities,
    planned,
    historySheet
  });
}


// ======================================================
// ACTIVITY MATCHING
// ======================================================

function activitySimilarity(
  a,
  b
) {
  const aStart =
    activityStart(a);

  const bStart =
    activityStart(b);

  if (!aStart || !bStart) {
    return 0;
  }

  const timeDifference =
    Math.abs(
      new Date(aStart).getTime() -
      new Date(bStart).getTime()
    ) / 60000;

  if (
    timeDifference > 20
  ) {
    return 0;
  }

  let score = 0;

  if (
    timeDifference <= 2
  ) {
    score += 0.55;
  } else if (
    timeDifference <= 5
  ) {
    score += 0.45;
  } else if (
    timeDifference <= 10
  ) {
    score += 0.30;
  } else {
    score += 0.15;
  }

  const aDuration =
    hoursBetween(
      activityStart(a),
      activityEnd(a)
    );

  const bDuration =
    hoursBetween(
      activityStart(b),
      activityEnd(b)
    );

  if (
    aDuration &&
    bDuration
  ) {
    const ratio =
      Math.abs(
        aDuration -
        bDuration
      ) /
      Math.max(
        aDuration,
        bDuration
      );

    if (ratio <= 0.03) {
      score += 0.35;
    } else if (ratio <= 0.10) {
      score += 0.25;
    } else if (ratio <= 0.20) {
      score += 0.10;
    }
  }

  return Math.min(
    1,
    score
  );
}


// ======================================================
// MATCH GOOGLE ACTIVITY-LIKE DATA
// ======================================================

async function matchActivities(env) {
  const intervals =
    await env.DB
      .prepare(
        `SELECT *
         FROM health_datapoints
         WHERE source_family = 'intervals'
         AND data_type = 'activity'
         AND start_time IS NOT NULL
         ORDER BY start_time`
      )
      .all();

  const google =
    await env.DB
      .prepare(
        `SELECT *
         FROM health_datapoints
         WHERE source_family = 'google-wearables'
         AND data_type = 'exercise'
         AND start_time IS NOT NULL
         ORDER BY start_time`
      )
      .all();

  let matched = 0;

  for (const icu of intervals.results) {
    let best = null;

    const icuPayload =
      JSON.parse(
        icu.payload_json
      );

    for (const g of google.results) {
      const gStart =
        g.start_time;

      const gEnd =
        g.end_time;

      const candidate = {
        start_date_local:
          gStart,

        end_date_local:
          gEnd
      };

      const score =
        activitySimilarity(
          icuPayload,
          candidate
        );

      if (
        score > 0 &&
        (!best ||
        score > best.score)
      ) {
        best = {
          record: g,
          score
        };
      }
    }

    if (
      best &&
      best.score >= 0.70
    ) {
      const activityId =
        icu.external_id;

      await markMatch(
        env,
        "intervals",
        "activity",
        icu.external_id,
        "primary",
        activityId,
        best.score
      );

      await markMatch(
        env,
        best.record.source_family,
        best.record.data_type,
        best.record.external_id,
        "duplicate",
        activityId,
        best.score
      );

      matched++;
    }
  }

  return {
    matched
  };
}


// ======================================================
// WEIGHT
// ======================================================

async function weightHistory(env, days = null) {
  if (Number.isFinite(Number(days)) && Number(days) > 0) {
    const cutoff = dateDaysAgo(Number(days));
    const rows = await env.DB.prepare(`
      SELECT sample_time, value_numeric
      FROM health_datapoints
      WHERE data_type = 'weight'
        AND value_numeric IS NOT NULL
        AND sample_time >= ?
      ORDER BY sample_time ASC
    `).bind(cutoff).all();
    return rows.results;
  }

  const rows = await env.DB.prepare(`
    SELECT sample_time, value_numeric
    FROM health_datapoints
    WHERE data_type = 'weight'
      AND value_numeric IS NOT NULL
    ORDER BY sample_time ASC
  `).all();

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
function plannedMatchesActual(planned, actual){
  return Boolean(plannedMatch(planned, actual));
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
    INDOOR_BIKING: "Ride",
    SWIMMING: "Swim",
    HIKING: "Hike",
    WEIGHTLIFTING: "WeightTraining",
    STRENGTH_TRAINING: "WeightTraining",
    AEROBIC_WORKOUT: "Workout"
  };
  const type = typeMap[exerciseType] || exerciseType;
  const name = exercise.displayName || type;
  const activeSeconds = String(exercise.activeDuration || "").match(/([0-9.]+)s/i);
  const activeHours = activeSeconds ? Number(activeSeconds[1]) / 3600 : null;
  const durationHours = activeHours || hoursBetween(row.start_time, row.end_time);
  return {
    id: row.external_id,
    source: "google-health",
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

function isDuplicateOfIntervalsActivity(googleActivity, intervalsRows) {
  return intervalsRows.some(row => {
    if (row.record_role === "duplicate") return false;
    let payload = {};
    try { payload = JSON.parse(row.payload_json || "{}"); } catch {}
    return activitySimilarity(payload, {
      start_date_local: googleActivity.start,
      end_date_local: googleActivity.end
    }) >= 0.70;
  });
}



function activityIsStrength(activity) {
  const text = `${activity?.type || ""} ${activity?.name || ""} ${activity?.payload?.type || ""} ${activity?.payload?.name || ""}`.toLowerCase();
  return ["weight", "strength", "gym", "lifting", "bodybuilding"].some(x => text.includes(x));
}

function dailyMacroTargets(weightKg, calorieTarget, context = {}) {
  const kg = Number(weightKg) || 85.8;
  const kcal = Number(calorieTarget) || 0;
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
    WHERE source_family = 'intervals'
      AND data_type = 'planned-workout'
      AND start_time >= ? AND start_time < ?
    ORDER BY start_time
  `).bind(start, end).all();
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
    WHERE data_type = 'total-calories'
      AND sample_time >= ?
      AND sample_time < ?
    ORDER BY sample_time DESC, id DESC
    LIMIT 1
  `).bind(date, nextDate).first();

  const planned = await env.DB.prepare(`
    SELECT *
    FROM health_datapoints
    WHERE source_family = 'intervals'
      AND data_type = 'planned-workout'
      AND start_time >= ?
      AND start_time < ?
    ORDER BY start_time
  `).bind(date, nextDate).all();

  const activities = await env.DB.prepare(`
    SELECT *
    FROM health_datapoints
    WHERE source_family = 'intervals'
      AND data_type = 'activity'
      AND start_time >= ?
      AND start_time < ?
      AND (record_role IS NULL OR record_role != 'duplicate')
    ORDER BY start_time
  `).bind(date, nextDate).all();

  const googleExercises = await env.DB.prepare(`
    SELECT *
    FROM health_datapoints
    WHERE source_family = 'google-wearables'
      AND data_type = 'exercise'
      AND start_time >= ?
      AND start_time < ?
      AND (record_role IS NULL OR record_role != 'duplicate')
    ORDER BY start_time
  `).bind(date, nextDate).all();

  const weight = await env.DB.prepare(`
    SELECT value_numeric, sample_time FROM health_datapoints
    WHERE data_type = 'weight' AND value_numeric IS NOT NULL
    ORDER BY sample_time DESC, id DESC LIMIT 1
  `).first();

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

  const cyclingRows=activities.results.filter(row=>{try{const p=JSON.parse(row.payload_json||'{}');return /^(ride|virtualride|ebikeride|cycling|mountainbikeride|gravelride)$/i.test(p.type||p.category||'');}catch{return false;}});
  const intervalsCompleted = cyclingRows.map(row => {
    const payload = JSON.parse(row.payload_json);
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

  const googleCompleted = googleExercises.results
    .map(googleExerciseActivity)
    .filter(activity => !isDuplicateOfIntervalsActivity(activity, cyclingRows));

  const completed = [...intervalsCompleted, ...googleCompleted]
    .filter(a => {
      const name=String(a.name||"").trim().toLowerCase();
      const type=String(a.type||"").trim().toLowerCase();
      return (name && name!=="unknown") || (type && type!=="unknown") || Number(a.durationHours||0)>0 || Number(a.calories||0)>0;
    })
    .sort((a, b) => new Date(a.start || 0).getTime() - new Date(b.start || 0).getTime());

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
  const nowDate = pragueDate();
  const isCompleteDay = date < nowDate;
  const observed = google?.value_numeric != null ? Number(google.value_numeric) : null;

  let estimatedTDEE;
  if (isCompleteDay && observed != null && observed > 1000) {
    estimatedTDEE = Math.round(observed);
  } else {
    let activityAdjustment = 0;
    for (const a of completed) {
      const rate = CONFIG.activityKcalPerHour[a.type] || (a.payload && a.payload.category === "Ride" ? CONFIG.activityKcalPerHour.Ride : 400);
      const actual = Number(a.calories);
      activityAdjustment += actual > 0 ? actual : (a.durationHours || 0) * rate;
    }
    for (const w of unmatchedPlanned) {
      if (w.durationHours) {
        const type = w.type === "Ride" || w.cycling ? "Ride" : w.type;
        const rate = type === "Ride" || w.cycling ? cyclingKcalPerHour(w) : (CONFIG.activityKcalPerHour[type] || 400);
        activityAdjustment += w.durationHours * rate;
      }
    }
    estimatedTDEE = Math.round(CONFIG.baselineRestTDEE + activityAdjustment);
  }

  const deficit = CONFIG.weightLossTargetKgPerWeek * 7700 / 7;
  const restIntakeTarget = 2000;
  const plannedTrainingCalories = Math.max(0, estimatedTDEE - CONFIG.baselineRestTDEE);
  const trainingCoverage = 0.70;
  const target = Math.max(CONFIG.minCalorieTarget, Math.min(4000, Math.round(restIntakeTarget + plannedTrainingCalories * trainingCoverage)));
  const context = {
    ...nutritionContext({ completedActivities: completed, unmatchedPlannedWorkouts: unmatchedPlanned }),
    ...(await nearbyRideContext(env, date))
  };
  const macroTargets = dailyMacroTargets(weight ? Number(weight.value_numeric) : null, target, context);

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
      return sum + w.durationHours * (type === "Ride" || w.cycling ? cyclingKcalPerHour(w) : (CONFIG.activityKcalPerHour[type] || 400));
    }, 0)),
    actualActivityCalories: Math.round(completed.reduce((sum, a) => sum + Number(a.calories || 0), 0)),
    suppressedPlannedWorkouts: plannedWorkouts.length - unmatchedPlanned.length,
    calorieBreakdown: {
      baselineRestTDEE: CONFIG.baselineRestTDEE,
      activityAdjustment: Math.max(0, plannedTrainingCalories),
      trainingCoverage: 0.70,
      restIntakeTarget: 2000,
      weightLossDeficit: Math.round(deficit),
      uncappedTarget: Math.round(estimatedTDEE - deficit),
      maxTarget: 4000
    },
    unmatchedPlannedWorkouts: unmatchedPlanned,
    estimatedTDEE,
    calorieTarget: target,
    macroTargets,
    nutritionContext: context
  };
}

// ======================================================
// DAILY ANALYSIS
// ======================================================

async function analysisDaily(
  env,
  url
) {
  const date =
    url.searchParams.get(
      "date"
    ) ||
    pragueDate();

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
    energy.currentWeight
      ? Math.round(
          energy.currentWeight *
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
      targetWeightKg: CONFIG.targetWeightKg,
      reason: energy.nutritionContext?.endurance
        ? "Dnešní cíl zohledňuje vytrvalostní zátěž a cílové tempo úbytku hmotnosti směrem k 80 kg."
        : energy.nutritionContext?.preRide
          ? "Zítřejší kolo je zohledněné už dnes: mírně více sacharidů pro doplnění glykogenu, méně tuku, protein zůstává stabilní."
        : energy.nutritionContext?.training
          ? "Dnešní cíl zohledňuje plánovaný/dokončený trénink a cílové tempo úbytku hmotnosti směrem k 80 kg."
          : "Dnešní cíl vychází z klidového energetického základu a cílového tempa úbytku hmotnosti směrem k cílové hmotnosti 80 kg.",
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
      source: energy.googleTotalCalories != null && date < pragueDate() ? "observed" : "estimated"
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
    pragueDate();

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
    Number(weight) || 85.8;

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

  const preRideCarbs =
    Math.round(
      kg *
      CONFIG.preRideCarbsPerKg
    );

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
      `Before the ride: approximately ${preRideCarbs} g carbohydrate. ` +
      `During the ride: approximately ${rideCarbsPerHour} g carbohydrate/hour ` +
      `(${rideCarbs} g total). ` +
      `Estimated fluid need: approximately ${fluid} ml.`
  };
}


async function analysisFueling(
  env,
  url
) {
  const date =
    url.searchParams.get(
      "date"
    ) ||
    pragueDate();

  const energy =
    await energyForDate(
      env,
      date
    );

  const ride =
    energy.plannedWorkouts.find(
      x => x.cycling
    );

  if (!ride) {
    return Response.json({
      status: "ok",
      date,
      plannedRide: null,
      recommendation:
        "No planned cycling activity found."
    });
  }

  const fueling =
    calculateFueling(
      energy.currentWeight,
      ride
    );

  return Response.json({
    status: "ok",

    date,

    plannedRide:
      ride,

    fueling,

    dailyCalories:
      energy.calorieTarget
  });
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
  const rows = await env.DB.prepare(`
    SELECT * FROM food_logs
    WHERE consumed_date = ?
    ORDER BY consumed_at, id
  `).bind(date).all();

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
    const date = url.searchParams.get("date") || pragueDate();
    const log = await foodLogForDate(env, date);
    return Response.json({ status: "ok", date, ...log });
  }

  if (request.method !== "POST") {
    return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const date = body.date || body.consumed_date || pragueDate();
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
    INSERT INTO food_logs (
      consumed_date, consumed_at, cookbook_page, recipe_title,
      servings, kcal, protein_g, carbs_g, fat_g, fiber_g, source, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
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

function recipeMinutes(recipe) {
  return Number(String(recipe.time || "").match(/\d+/)?.[0] || 60);
}

function recipeFitScore(recipe, remaining, targets, options) {
  const kcal = Number(recipe.kcal);
  const protein = Number(recipe.protein_g || 0);
  const carbs = Number(recipe.carbs_g || 0);
  const fat = Number(recipe.fat_g || 0);
  if (!Number.isFinite(kcal) || kcal <= 0) return -9999;

  const remainingKcal = Number(remaining.kcal || 0);
  const remainingProtein = Number(remaining.protein_g || 0);
  const remainingCarbs = Number(remaining.carbs_g || 0);
  let score = 0;

  if (remainingKcal > 0) {
    const ratio = kcal / remainingKcal;
    score += Math.max(0, 45 - Math.abs(1 - ratio) * 45);
    if (kcal <= remainingKcal * CONFIG.recipeOvershootTolerance) score += 15;
    else score -= Math.min(60, (kcal - remainingKcal) * 0.25);
  } else {
    if (kcal <= 150) score += 45;
    else if (kcal <= 250) score += 15;
    else score -= Math.min(100, (kcal - 150) * 0.6);
  }

  if (remainingProtein > 0) score += Math.min(20, protein / remainingProtein * 20);
  if (remainingCarbs > 0) score += Math.min(25, carbs / remainingCarbs * 25);

  if (options.postRide) {
    score += Math.min(35, carbs * 0.35) * CONFIG.postRideCarbPriority;
    score -= Math.max(0, fat - 15) * CONFIG.postRideFatPenalty;
  } else {
    score -= Math.max(0, fat - Math.max(20, targets.fat_g * 0.35)) * 0.25;
  }
  if (options.maxMinutes) {
    const minutes = recipeMinutes(recipe);
    score += minutes <= options.maxMinutes ? 20 : -Math.min(30, (minutes-options.maxMinutes)*1.2);
  }
  if (recipe.meal_prep) score += 8;
  if (recipe.level === 'Easy') score += 10;
  return Math.round(score * 10) / 10;
}

function recommendationReason(recipe, remaining, options) {
  const reasons=[];
  if (options.postRide && Number(recipe.carbs_g)>=40) reasons.push('sacharidy po kole');
  if (remaining.protein_g>0 && Number(recipe.protein_g)>=Math.min(40,remaining.protein_g*0.35)) reasons.push('dobrý příjem bílkovin');
  if (options.maxMinutes && recipeMinutes(recipe)<=options.maxMinutes) reasons.push('rychlá příprava');
  if (recipe.meal_prep) reasons.push('Meal Prep');
  if (remaining.kcal<=0 && Number(recipe.kcal)<=150) reasons.push('malá svačina bez velkého navýšení kcal');
  return reasons.slice(0,3).join(', ');
}

async function foodRecommend(env, url) {
  const date=url.searchParams.get('date')||pragueDate();
  const log=await foodLogForDate(env,date);
  const energy=await energyForDate(env,date);
  const targetKcal=Number(energy.calorieTarget||0);
  const targets=energy.macroTargets||dailyMacroTargets(energy.currentWeight,targetKcal,energy.nutritionContext||{});
  const eaten=log.entries.filter(r=>r.status==="eaten");
  const normalizeMealType=v=>{const x=String(v||"").toUpperCase().trim();if(x==="SNACCK"||x==="SNACK")return "SNACK";if(x.includes("BREAKFAST")||x.includes("SNIDAN"))return "BREAKFAST";if(x.includes("LUNCH")||x.includes("OBED"))return "LUNCH";if(x.includes("DINNER")||x.includes("VECERE"))return "DINNER";return x;};
  const mealTypes=new Set(eaten.map(r=>normalizeMealType(r.meal_type)).filter(Boolean));
  const hasBreakfast=mealTypes.has("BREAKFAST")||eaten.some(r=>/^0[5-9]:|^10:/.test(String(r.meal_time||"")));
  const hasLunch=mealTypes.has("LUNCH")||eaten.some(r=>/^1[12]:|^13:|^14:/.test(String(r.meal_time||"")));
  const hasDinner=mealTypes.has("DINNER")||eaten.some(r=>/^1[89]:|^2[0-3]:/.test(String(r.meal_time||"")));
  const hasSnack=mealTypes.has("SNACK");
  const remaining={kcal:Math.max(0,targetKcal-log.totals.kcal),protein_g:Math.max(0,targets.protein_g-log.totals.protein_g),carbs_g:Math.max(0,targets.carbs_g-log.totals.carbs_g),fat_g:Math.max(0,targets.fat_g-log.totals.fat_g)};
  const explicitPostRide=url.searchParams.get('post_ride');
  const postRide=explicitPostRide==='1'||(explicitPostRide!=='0'&&energy.nutritionContext?.postRide);
  const maxMinutes=Number(url.searchParams.get('max_minutes')||0);
  const limit=Math.max(2,Math.min(5,Number(url.searchParams.get('limit')||3)));
  const cookbookData=await getCookbook();
  const cookbook=Array.isArray(cookbookData)?cookbookData:(cookbookData?.recipes||[]);

  let slots=[];
  if(!hasBreakfast) slots.push(["BREAKFAST","Snídaně"]);
  else if(!hasLunch) slots.push(["LUNCH","Oběd"]);
  else if(!hasDinner) {
    if(!hasSnack) slots.push(["SNACK","Odpolední svačina"]);
    slots.push(["DINNER","Večeře"]);
  }
  if(!slots.length && !hasDinner && hasLunch) slots=[["DINNER","Večeře"]];
  if(slots.length>3) slots=slots.slice(0,3);

  const mealKeywords={
    BREAKFAST:["breakfast","snidane","snídaně"],
    LUNCH:["lunch","obed","oběd"],
    DINNER:["dinner","vecere","večeře"],
    SNACK:["snack","svacina","svačina"]
  };
  const remainingSlots=Math.max(1,slots.length);
  const mealRecommendations=slots.map(([mealType,label])=>{
    const share={
      kcal:remaining.kcal/remainingSlots,
      protein_g:remaining.protein_g/remainingSlots,
      carbs_g:remaining.carbs_g/remainingSlots,
      fat_g:remaining.fat_g/remainingSlots
    };
    const keys=mealKeywords[mealType]||[];
    let candidates=cookbook.filter(recipe=>{
      const kcal=Number(recipe.kcal);
      if(!Number.isFinite(kcal)||kcal<=0)return false;
      if(maxMinutes&&recipeMinutes(recipe)>maxMinutes)return false;
      if(remaining.kcal<=0&&kcal>150)return false;
      const hay=String(recipe.category||"")+" "+String(recipe.meal||"")+" "+String(recipe.type||"")+" "+String(recipe.tags||"");
      recipe.__mealMatch=keys.some(k=>hay.toLowerCase().includes(k));
      if(mealType==="SNACK"&&kcal>450)return false;
      return true;
    });
    candidates=candidates.map(recipe=>({
      recipe,
      score:recipeFitScore(recipe,share,targets,{postRide:postRide&&mealType!=="SNACK",maxMinutes})+(recipe.__mealMatch?40:0)
    })).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>({
      ...x.recipe,servings:1,portion:1,portion_label:"1 porce",meal_type:mealType,
      recommendation_score:Math.round(Math.max(0,Math.min(100,x.score))*10)/10,
      recommendation_reason:[recommendationReason(x.recipe,share,{postRide:postRide&&mealType!=="SNACK",maxMinutes}),x.recipe.__mealMatch?"odpovídá typu jídla":"vhodné podle zbývajícího příjmu"].filter(Boolean).join(", ")
    }));
    return {meal_type:mealType,label,recommendations:candidates,target:share};
  });

  const storeAlternatives=[];
  const addStore=(name,kcal,protein,carbs,fat,reason)=>storeAlternatives.push({name,kcal,protein_g:protein,carbs_g:carbs,fat_g:fat,reason});
  if(remaining.protein_g>=20)addStore("Skyr / vysokoproteinový jogurt",150,20,10,1,"rychle doplní protein");
  if(remaining.protein_g>=25)addStore("Kuřecí prsa + zelenina",300,45,10,8,"vysoký protein, nízký přebytek tuku");
  if(remaining.carbs_g>=35)addStore("Banán + pečivo",250,7,50,3,"rychlé doplnění sacharidů");
  if(remaining.kcal>=300&&remaining.protein_g>=20)addStore("Cottage + pečivo",350,28,35,10,"jednoduchá vyvážená varianta");
  if(!storeAlternatives.length)addStore("Proteinový pudink / skyr",150,20,10,2,"malá porce podle zbývajícího příjmu");

  let coaching;
  if(!eaten.length)coaching="Dnes zatím nemám zapsané žádné jídlo, takže skóre zůstává bez hodnocení. Doporučení začínají od celého denního cíle.";
  else if(hasLunch&&!hasDinner)coaching="Snídaně a oběd jsou zapsané. Proto teď doporučuji jen zbývající svačinu a večeři; každá varianta je 1 porce a přepočítává se podle toho, co už jsi snědl.";
  else if(postRide)coaching="Po kole máš vyšší prioritu pro sacharidy a dostatek bílkovin. Doporučení se přepočítává podle dnešního příjmu.";
  else coaching="Doporučení se průběžně přepočítává podle toho, co už jsi dnes snědl, a podle zbývajících maker.";

  return Response.json({
    status:"ok",date,mealToPlan:slots[0]?.[0]||null,
    mealsCompleted:{breakfast:hasBreakfast,lunch:hasLunch,dinner:hasDinner},
    foodTotals:log.totals,calorieTarget:targetKcal,calorieDelta:targetKcal-log.totals.kcal,
    macroTargets:targets,remaining,nutritionContext:energy.nutritionContext||null,
    coaching,mealRecommendations,
    recommendations:mealRecommendations[0]?.recommendations||[],
    storeAlternatives
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
  const result = await env.DB.prepare(`DELETE FROM food_logs WHERE id = ?`).bind(id).run();
  return Response.json({ status: "ok", id, deleted: Number(result.meta.changes || 0) > 0 });
}

async function foodLogText(env, request, url) {
  let body = {};

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const raw = await request.text();
      body = raw ? { text: raw } : {};
    }
  } else if (request.method === "GET") {
    body = {
      text: url.searchParams.get("text") || url.searchParams.get("message") || "",
      date: url.searchParams.get("date") || null,
      consumed_at: url.searchParams.get("consumed_at") || null
    };
  } else {
    return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  }

  const text = String(body.text || body.message || "").trim();
  if (!text) return Response.json({ status: "error", message: "text is required" }, { status: 400 });

  const date = body.date || pragueDate();
  const pageNumbers = [...text.matchAll(/(?:str(?:án|a)n?\.?|p(?:age)?\.?)?\s*(\d{1,3})(?!\d)/gi)]
    .map(m => Number(m[1]))
    .filter(n => n > 0 && n < 1000);

  const uniquePages = [...new Set(pageNumbers)];
  const logged = [];
  const errors = [];
  const existingRecent = await env.DB.prepare(`SELECT id,cookbook_page,recipe_title,source FROM food_logs WHERE consumed_date=? AND note=? AND created_at>=datetime('now','-30 seconds')`).bind(date,text).all();
  const existingKeys = new Set((existingRecent.results||[]).map(r=>`${r.cookbook_page||''}|${r.recipe_title||''}|${r.source||''}`));

  for (const page of uniquePages) {
    const recipe = await cookbookRecipeByPage(page);
    if (!recipe) {
      errors.push({ page, message: "Cookbook page not found" });
      continue;
    }
    const scaled = scaleRecipe(recipe, 1);
    const dedupKey = `${recipe.page||''}|${recipe.title||''}|cookbook-text`;
    if (existingKeys.has(dedupKey)) {
      const existing=(existingRecent.results||[]).find(r=>`${r.cookbook_page||''}|${r.recipe_title||''}|${r.source||''}`===dedupKey);
      logged.push({id:existing.id,page:recipe.page,title:recipe.title,duplicate:true,...scaled});
      continue;
    }
    const result = await env.DB.prepare(`
      INSERT INTO food_logs (consumed_date, consumed_at, cookbook_page, recipe_title, servings, kcal, protein_g, carbs_g, fat_g, fiber_g, source, note)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'cookbook-text', ?)
    `).bind(date, body.consumed_at || new Date().toISOString(), recipe.page, recipe.title, scaled.kcal, scaled.protein_g, scaled.carbs_g, scaled.fat_g, scaled.fiber_g, text).run();
    existingKeys.add(dedupKey);
    logged.push({ id: result.meta.last_row_id, page: recipe.page, title: recipe.title, ...scaled });
  }

  // Lightweight manual-food support for common whole-fruit mentions.
  const fruit = {
    nektarinka: { name: "Nektarinka", kcal: 63, protein_g: 1.5, carbs_g: 15, fat_g: 0.5, fiber_g: 2.4 },
    nektarinku: { name: "Nektarinka", kcal: 63, protein_g: 1.5, carbs_g: 15, fat_g: 0.5, fiber_g: 2.4 },
    banán: { name: "Banán", kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3, fiber_g: 3.1 },
    banan: { name: "Banán", kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3, fiber_g: 3.1 },
    jablko: { name: "Jablko", kcal: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
    pomeranč: { name: "Pomeranč", kcal: 62, protein_g: 1.2, carbs_g: 15.4, fat_g: 0.2, fiber_g: 3.1 },
    pomeranc: { name: "Pomeranč", kcal: 62, protein_g: 1.2, carbs_g: 15.4, fat_g: 0.2, fiber_g: 3.1 }
  };
  for (const [key, value] of Object.entries(fruit)) {
    if (text.toLowerCase().includes(key)) {
      const result = await env.DB.prepare(`
        INSERT INTO food_logs (consumed_date, consumed_at, cookbook_page, recipe_title, servings, kcal, protein_g, carbs_g, fat_g, fiber_g, source, note)
        VALUES (?, ?, NULL, ?, 1, ?, ?, ?, ?, ?, 'manual-text', ?)
      `).bind(date, body.consumed_at || new Date().toISOString(), value.name, value.kcal, value.protein_g, value.carbs_g, value.fat_g, value.fiber_g, text).run();
      logged.push({ id: result.meta.last_row_id, ...value, source: "manual-text" });
      break;
    }
  }

  return Response.json({ status: "ok", date, parsed_pages: uniquePages, logged, errors });
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
         WHERE (
           data_type = 'activity'
           OR data_type = 'exercise'
           OR data_type = 'planned-workout'
         )
         ORDER BY start_time DESC
         LIMIT 500`
      )
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
    WHERE data_type = 'sleep'
      AND source_family = 'google-wearables'
    ORDER BY COALESCE(start_time, end_time) DESC, id DESC
    LIMIT 5000
  `).all();

  const sessions = (rows.results || []).map(row => {
    let p = {};
    try { p = JSON.parse(row.payload_json || "{}"); } catch {}
    const sleep = p.sleep || p;
    const interval = sleep.interval || {};
    const stages = sleep.stages || sleep.sleepStages || [];
    const stageMinutes = {};
    for (const stage of stages) {
      const a = new Date(stage.startTime || stage.start_time || 0).getTime();
      const b = new Date(stage.endTime || stage.end_time || 0).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
        const type = String(stage.type || "UNKNOWN").toUpperCase();
        stageMinutes[type] = (stageMinutes[type] || 0) + (b-a)/60000;
      }
    }
    const startTime = row.start_time || interval.startTime || interval.civilStartTime || null;
    const endTime = row.end_time || interval.endTime || interval.civilEndTime || null;
    const durationMin = hoursBetween(startTime,endTime) * 60;
    const day = dateOnly(endTime || startTime);
    return {
      id: row.external_id,
      date: day,
      startTime,
      endTime,
      timeInBedMin: Number.isFinite(durationMin) ? Math.round(durationMin) : null,
      durationMin: Object.keys(stageMinutes).some(k=>['DEEP','REM','LIGHT'].includes(k)) ? Math.round(['DEEP','REM','LIGHT'].reduce((s,k)=>s+(stageMinutes[k]||0),0)) : Number.isFinite(durationMin) ? Math.round(durationMin) : null,
      type: sleep.type || sleep.sleepType || null,
      stages: Object.fromEntries(Object.entries(stageMinutes).map(([k,v])=>[k,Math.round(v)])),
      minutesToFallAsleep: sleep.minutesToFallAsleep ?? null,
      minutesAfterWakeup: sleep.minutesAfterWakeup ?? null
    };
  });

  const filteredSessions = sessions.filter(s => {
    const sStart = String(s.startTime || "").slice(0,10);
    const sEnd = String(s.endTime || "").slice(0,10);
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
// DATABASE ENDPOINT
// ======================================================

async function healthDb(env) {
  const rows =
    await env.DB
      .prepare(
        `SELECT
          source_family,
          data_type,
          record_role,
          COUNT(*) AS count
         FROM health_datapoints
         GROUP BY
           source_family,
           data_type,
           record_role
         ORDER BY
           source_family,
           data_type`
      )
      .all();

  return Response.json({
    status: "ok",
    data:
      rows.results
  });
}


// ======================================================
// COMPLETE SYNC
// ======================================================

async function syncAll(env) {
  const google = await startGoogleSync(env);
  const intervals = await syncIntervals(env);
  const matching = await matchActivities(env);
  const intervalsData = await intervals.json();

  return Response.json({
    status: "ok",
    google: {
      status: google.started ? "started" : "already_running",
      source: "google",
      status_url: "/sync/google/status"
    },
    intervals: intervalsData,
    matching
  });
}
