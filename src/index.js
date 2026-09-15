import { getCookbook, getCookbookRecipeByPage } from "./cookbook.js";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      syncAll(env).catch(error => {
        console.error("Scheduled sync failed:", error);
      })
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return Response.json({
          status: "ok",
          service: "health-api",
          version: "final-5-cookbook-v3"
        });
      }

      if (url.pathname === "/auth-test") {
        return await testGoogleAuth(env);
      }

      if (url.pathname === "/test/intervals") {
        return await testIntervals(env);
      }

      if (url.pathname === "/sync/google") {
        return await syncGoogle(env);
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
        return await foodLog(env, request, url);
      }

      if (url.pathname === "/food/today") {
        return await foodLog(env, request, url);
      }

      if (url.pathname === "/food/recommend") {
        return await foodRecommend(env, url);
      }

      if (url.pathname === "/health/weight") {
        return await healthWeight(env);
      }

      if (url.pathname === "/health/activities") {
        return await healthActivities(env);
      }

      if (url.pathname === "/health/db") {
        return await healthDb(env);
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


// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {
  weightDays: 30,
  activityDays: 30,
  plannedDaysAhead: 7,

  // Rest-day energy baseline. This is intentionally conservative and
  // will later be calibrated against actual intake + weight trend.
  baselineRestTDEE: 2450,

  weightLossTargetKgPerWeek: 0.5,
  proteinGramsPerKg: 2.0,

  defaultRideCarbsPerHour: 90,
  preRideCarbsPerKg: 1.0,
  preRideWindowHours: 2,
  fluidMlPerHour: 700,

  activityKcalPerHour: {
    Ride: 600,
    Run: 650,
    Walk: 250,
    WeightTraining: 400,
    Workout: 450
  },

  minCalorieTarget: 2000,
  maxCalorieTarget: 3200
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

async function googleToken(env) {
  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      body: new URLSearchParams({
        client_id:
          env.GOOGLE_CLIENT_ID,

        client_secret:
          env.GOOGLE_CLIENT_SECRET,

        refresh_token:
          env.GOOGLE_REFRESH_TOKEN,

        grant_type:
          "refresh_token"
      })
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      "Google OAuth error: " +
      JSON.stringify(data)
    );
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
    filter = `sleep.interval.end_time >= "${startDate}T00:00:00Z" AND sleep.interval.end_time < "${end}T00:00:00Z"`;
  } else {
    throw new Error(`Unsupported Google filter type: ${filterType}`);
  }

  params.set("filter", filter);

  const all = [];
  let pageToken = null;

  for (let page = 0; page < 20; page++) {
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints:reconcile?${params.toString()}`,
      {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json"
        }
      }
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
// GOOGLE VALUE EXTRACTION
// ======================================================

function googleInfo(type, p) {
  let value = null;
  let unit = null;
  let sample = null;
  let start = null;
  let end = null;

  if (p.interval) {
    start = p.interval.startTime || p.interval.civilStartTime || null;
    end = p.interval.endTime || p.interval.civilEndTime || null;
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
  if (p.dailyHeartRateVariability?.rmssd !== undefined) {
    value = Number(p.dailyHeartRateVariability.rmssd); unit = "ms";
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
    ["sleep", "sleep", "sleep", "google-wearables", 7],
    ["exercise", "exercise", "exercise", "google-wearables", 30],
    ["weight", "weight", "sample", "google-sources", 30],
    ["body-fat", "body_fat", "sample", "google-sources", 30]
  ];

  for (const [type, filterName, filterType, family, days] of configs) {
    try {
      const end = dateDaysFromNow(1);
      const start = dateDaysAgo(days);
      const points = await googleReconcile(
        token,
        type,
        filterName,
        filterType,
        start,
        `users/me/dataSourceFamilies/${family}`,
        end
      );

      let saved = 0;
      for (const point of points) {
        const i = googleInfo(type, point);
        const fallbackId = `${type}:${i.sample || i.start || crypto.randomUUID()}`;
        await savePoint(env, family, type, point, i.value, i.unit, i.sample, i.start, i.end, fallbackId);
        saved++;
      }
      results.push({ data_type: type, records_found: points.length, records_saved: saved, status: "ok" });
    } catch (error) {
      results.push({ data_type: type, records_found: 0, records_saved: 0, status: "error", message: error.message });
    }
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

  for (const a of activities) {
    const id =
      String(a.id);

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
  const oldest =
    pragueDate();

  const newest =
    dateDaysFromNow(
      CONFIG.plannedDaysAhead
    );

  const events =
    await intervalsGet(
      env,
      `/athlete/0/events?oldest=${oldest}&newest=${newest}`
    );

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

    events
  };
}


// ======================================================
// INTERVALS SYNC
// ======================================================

async function syncIntervals(env) {
  const activities =
    await syncIntervalsActivities(
      env
    );

  const planned =
    await syncIntervalsEvents(
      env
    );

  return Response.json({
    status: "ok",
    source: "intervals.icu",
    activities,
    planned
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

async function weightHistory(env) {
  const rows =
    await env.DB
      .prepare(
        `SELECT
           sample_time,
           value_numeric
         FROM health_datapoints
         WHERE data_type = 'weight'
         AND value_numeric IS NOT NULL
         ORDER BY sample_time ASC`
      )
      .all();

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

async function energyForDate(env, date) {
  const google = await env.DB.prepare(`
    SELECT * FROM health_datapoints
    WHERE data_type = 'total-calories'
    AND sample_time LIKE ?
    ORDER BY sample_time DESC, id DESC
    LIMIT 1
  `).bind(date + "%").first();

  const planned = await env.DB.prepare(`
    SELECT * FROM health_datapoints
    WHERE source_family = 'intervals'
    AND data_type = 'planned-workout'
    AND start_time LIKE ?
    ORDER BY start_time
  `).bind(date + "%").all();

  const activities = await env.DB.prepare(`
    SELECT * FROM health_datapoints
    WHERE source_family = 'intervals'
    AND data_type = 'activity'
    AND start_time LIKE ?
    AND (record_role IS NULL OR record_role != 'duplicate')
    ORDER BY start_time
  `).bind(date + "%").all();

  const weight = await env.DB.prepare(`
    SELECT value_numeric, sample_time FROM health_datapoints
    WHERE data_type = 'weight' AND value_numeric IS NOT NULL
    ORDER BY sample_time DESC, id DESC LIMIT 1
  `).first();

  const plannedWorkouts = planned.results.map(r => ({
    id: r.external_id,
    ...plannedWorkoutInfo(JSON.parse(r.payload_json))
  }));

  const completed = activities.results.map(row => {
    const payload = JSON.parse(row.payload_json);
    const actualCalories =
      Number(payload.calories_kcal ?? payload.calories ?? payload.icu_calories ?? row.value_numeric ?? 0);
    return {
      id: row.external_id,
      type: payload.type || payload.category || "Unknown",
      calories: actualCalories,
      start: row.start_time,
      end: row.end_time,
      durationHours: hoursBetween(row.start_time, row.end_time),
      pairedEventId: payload.paired_event_id || payload.pairedEventId || null,
      payload
    };
  });

  const completedPairedIds = new Set(
    completed.map(a => a.pairedEventId).filter(Boolean).map(String)
  );

  const unmatchedPlanned = plannedWorkouts.filter(w => !completedPairedIds.has(String(w.id)));

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
        const rate = CONFIG.activityKcalPerHour[type] || 400;
        activityAdjustment += w.durationHours * rate;
      }
    }
    estimatedTDEE = Math.round(CONFIG.baselineRestTDEE + activityAdjustment);
  }

  const deficit = CONFIG.weightLossTargetKgPerWeek * 7700 / 7;
  const target = Math.max(CONFIG.minCalorieTarget, Math.min(CONFIG.maxCalorieTarget, Math.round(estimatedTDEE - deficit)));

  return {
    date,
    currentWeight: weight ? Number(weight.value_numeric) : null,
    googleTotalCalories: observed,
    completedActivities: completed,
    plannedWorkouts,
    estimatedPlannedActivityCalories: Math.round(unmatchedPlanned.reduce((sum, w) => {
      if (!w.durationHours) return sum;
      const type = w.type === "Ride" || w.cycling ? "Ride" : w.type;
      return sum + w.durationHours * (CONFIG.activityKcalPerHour[type] || 400);
    }, 0)),
    actualActivityCalories: Math.round(completed.reduce((sum, a) => sum + Number(a.calories || 0), 0)),
    suppressedPlannedWorkouts: plannedWorkouts.length - unmatchedPlanned.length,
    unmatchedPlannedWorkouts: unmatchedPlanned,
    estimatedTDEE,
    calorieTarget: target
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
      env
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

  const actualRide = energy.completedActivities.find(x =>
    String(x.type || "").toLowerCase().includes("ride") ||
    String(x.type || "").toLowerCase().includes("bike") ||
    String(x.type || "").toLowerCase().includes("cycling")
  );
  const plannedRide =
    energy.plannedWorkouts.find(
      x => x.cycling && !energy.completedActivities.some(a => String(a.pairedEventId || "") === String(x.id))
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
        weight30
    },

    nutrition: {
      protein:
        protein,
      foodLog:
        await foodLogForDate(env, date)
    },

    training: {
      completed:
        energy.completedActivities,

      planned:
        energy.plannedWorkouts
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

  const cookbook = await getCookbook();

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
    recipe ? recipe.title : null,
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

function rankCookbookRecipe(recipe, remaining, options) {
  const kcalGap = Math.abs(Number(recipe.kcal) - Math.max(0, remaining.kcal));
  const carbGap = Math.abs(Number(recipe.carbs_g) - Math.max(0, remaining.carbs_g));
  const proteinGap = Math.abs(Number(recipe.protein_g) - Math.max(0, remaining.protein_g));
  let score = 1000 - kcalGap * 0.6 - carbGap * 1.2 - proteinGap * 0.8;

  const minutes = Number(String(recipe.time || "").match(/\d+/)?.[0] || 60);
  if (options.maxMinutes && minutes <= options.maxMinutes) score += 80;
  if (options.postRide) score += Math.min(120, Number(recipe.carbs_g) * 0.8 + Number(recipe.protein_g) * 0.4);
  if (recipe.meal_prep) score += 10;
  if (recipe.level === "Easy") score += 15;

  return score;
}

async function foodRecommend(env, url) {
  const date = url.searchParams.get("date") || pragueDate();
  const log = await foodLogForDate(env, date);
  const energy = await energyForDate(env, date);
  const targetKcal = Number(energy.calorieTarget || 0);
  const proteinTarget = energy.currentWeight ? energy.currentWeight * CONFIG.proteinGramsPerKg : 0;
  const remaining = {
    kcal: Math.max(0, targetKcal - log.totals.kcal),
    protein_g: Math.max(0, proteinTarget - log.totals.protein_g),
    carbs_g: Math.max(0, (url.searchParams.get("remaining_carbs") || 0) - log.totals.carbs_g)
  };
  const postRide = url.searchParams.get("post_ride") === "1";
  const maxMinutes = Number(url.searchParams.get("max_minutes") || 0);
  const category = url.searchParams.get("category") || "";

  const cookbook = await getCookbook();

  let candidates = cookbook.filter(recipe => {
    if (category && recipe.category.toLowerCase() !== category.toLowerCase()) return false;
    if (maxMinutes) {
      const minutes = Number(String(recipe.time || "").match(/\d+/)?.[0] || 60);
      if (minutes > maxMinutes) return false;
    }
    return true;
  });

  candidates = candidates
    .map(recipe => ({ recipe, score: rankCookbookRecipe(recipe, remaining, { postRide, maxMinutes }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.recipe);

  return Response.json({
    status: "ok",
    date,
    foodTotals: log.totals,
    calorieTarget: targetKcal,
    remaining,
    recommendations: candidates
  });
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
           OR data_type = 'planned-workout'
         )
         ORDER BY start_time DESC
         LIMIT 100`
      )
      .all();

  return Response.json({
    status: "ok",
    count:
      rows.results.length,
    activities:
      rows.results
  });
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
  const google =
    await syncGoogle(
      env
    );

  const intervals =
    await syncIntervals(
      env
    );

  const matching =
    await matchActivities(
      env
    );

  const googleData =
    await google.json();

  const intervalsData =
    await intervals.json();

  return Response.json({
    status: "ok",

    google:
      googleData,

    intervals:
      intervalsData,

    matching:
      matching
  });
}
