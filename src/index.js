export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return Response.json({
          status: "ok",
          service: "health-api",
          version: "final-1"
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

  /*
   * Starting energy model.
   * This is deliberately a starting point.
   * It will later be calibrated against weight trend
   * and actual food intake.
   */
  baselineTDEE: 2850,

  weightLossTargetKgPerWeek: 0.5,

  proteinGramsPerKg: 2.0,

  defaultRideCarbsPerHour: 90,

  preRideCarbsPerKg: 1.0,

  preRideWindowHours: 2,

  fluidMlPerHour: 700
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
  sourceFamily
) {
  const params =
    new URLSearchParams();

  params.set(
    "dataSourceFamily",
    sourceFamily
  );

  let filter;

  if (filterType === "interval") {
    filter =
      `${filterName}.interval.start_time >= "${startDate}T00:00:00"`;
  }

  if (filterType === "sample") {
    filter =
      `${filterName}.sample_time.physical_time >= "${startDate}T00:00:00"`;
  }

  if (filterType === "daily") {
    filter =
      `${filterName}.date >= "${startDate}"`;
  }

  if (filterType === "session") {
    filter =
      `${filterName}.interval.start_time >= "${startDate}T00:00:00"`;
  }

  params.set(
    "filter",
    filter
  );

  const response =
    await fetch(
      `https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints:reconcile?${params.toString()}`,
      {
        headers: {
          "Authorization":
            "Bearer " + token,

          "Accept":
            "application/json"
        }
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

  return data.dataPoints || [];
}


// ======================================================
// GOOGLE VALUE EXTRACTION
// ======================================================

function googleInfo(
  type,
  p
) {
  let value = null;
  let unit = null;
  let sample = null;
  let start = null;
  let end = null;

  if (p.interval) {
    start =
      p.interval.startTime ||
      null;

    end =
      p.interval.endTime ||
      null;
  }

  if (
    p.sampleTime &&
    p.sampleTime.physicalTime
  ) {
    sample =
      p.sampleTime.physicalTime;
  }

  const daily =
    [
      "dailyRestingHeartRate",
      "dailyHeartRateVariability",
      "dailyOxygenSaturation",
      "dailyRespiratoryRate",
      "dailyVo2Max",
      "dailyHeartRateZones"
    ];

  for (const name of daily) {
    if (
      p[name] &&
      p[name].date
    ) {
      const d =
        p[name].date;

      sample =
        `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    }
  }

  if (
    p.heartRate &&
    p.heartRate.bpm !== undefined
  ) {
    value =
      p.heartRate.bpm;

    unit = "bpm";
  }

  if (
    p.heartRateVariability &&
    p.heartRateVariability.rmssd !== undefined
  ) {
    value =
      p.heartRateVariability.rmssd;

    unit = "ms";
  }

  if (
    p.weight &&
    p.weight.weightGrams !== undefined
  ) {
    value =
      Number(
        p.weight.weightGrams
      ) / 1000;

    unit = "kg";
  }

  if (
    p.oxygenSaturation &&
    p.oxygenSaturation.percentage !== undefined
  ) {
    value =
      p.oxygenSaturation.percentage;

    unit = "%";
  }

  if (
    p.dailyRestingHeartRate &&
    p.dailyRestingHeartRate
      .beatsPerMinute !== undefined
  ) {
    value =
      p.dailyRestingHeartRate
        .beatsPerMinute;

    unit = "bpm";
  }

  if (
    p.dailyHeartRateVariability &&
    p.dailyHeartRateVariability
      .rmssd !== undefined
  ) {
    value =
      p.dailyHeartRateVariability
        .rmssd;

    unit = "ms";
  }

  if (
    p.dailyOxygenSaturation &&
    p.dailyOxygenSaturation
      .percentage !== undefined
  ) {
    value =
      p.dailyOxygenSaturation
        .percentage;

    unit = "%";
  }

  if (
    p.dailyRespiratoryRate &&
    p.dailyRespiratoryRate
      .breathsPerMinute !== undefined
  ) {
    value =
      p.dailyRespiratoryRate
        .breathsPerMinute;

    unit = "breaths/min";
  }

  if (
    p.dailyVo2Max &&
    p.dailyVo2Max.vo2Max !== undefined
  ) {
    value =
      p.dailyVo2Max.vo2Max;

    unit = "ml/kg/min";
  }

  if (
    p.activeMinutes &&
    Array.isArray(
      p.activeMinutes
        .activeMinutesByActivityLevel
    )
  ) {
    value =
      p.activeMinutes
        .activeMinutesByActivityLevel
        .reduce(
          (sum, x) =>
            sum + Number(x.minutes || 0),
          0
        );

    unit = "min";
  }

  if (
    p.activeZoneMinutes &&
    p.activeZoneMinutes
      .activeZoneMinutes !== undefined
  ) {
    value =
      p.activeZoneMinutes
        .activeZoneMinutes;

    unit = "min";
  }

  if (
    p.sedentaryPeriod &&
    p.sedentaryPeriod
      .durationMinutes !== undefined
  ) {
    value =
      p.sedentaryPeriod
        .durationMinutes;

    unit = "min";
  }

  if (
    p.timeInHeartRateZone &&
    p.timeInHeartRateZone
      .durationMinutes !== undefined
  ) {
    value =
      p.timeInHeartRateZone
        .durationMinutes;

    unit = "min";
  }

  if (
    p.respiratoryRateSleepSummary &&
    p.respiratoryRateSleepSummary
      .fullSleepStats &&
    p.respiratoryRateSleepSummary
      .fullSleepStats
      .breathsPerMinute !== undefined
  ) {
    value =
      p.respiratoryRateSleepSummary
        .fullSleepStats
        .breathsPerMinute;

    unit = "breaths/min";
  }

  return {
    value,
    unit,
    sample,
    start,
    end
  };
}


// ======================================================
// GOOGLE SYNC
// ======================================================

async function syncGoogle(env) {
  const token =
    await googleToken(env);

  const today =
    pragueDate();

  const yesterday =
    dateDaysAgo(1);

  const weightStart =
    dateDaysAgo(30);

  const configs = [
    ["active-energy-burned", "active_energy_burned", "interval", yesterday, "google-wearables"],
    ["active-minutes", "active_minutes", "interval", yesterday, "google-wearables"],
    ["active-zone-minutes", "active_zone_minutes", "interval", yesterday, "google-wearables"],
    ["steps", "steps", "interval", yesterday, "google-wearables"],
    ["distance", "distance", "interval", yesterday, "google-wearables"],
    ["floors", "floors", "interval", yesterday, "google-wearables"],
    ["heart-rate", "heart_rate", "sample", yesterday, "google-wearables"],
    ["heart-rate-variability", "heart_rate_variability", "sample", yesterday, "google-wearables"],
    ["oxygen-saturation", "oxygen_saturation", "sample", yesterday, "google-wearables"],
    ["daily-resting-heart-rate", "daily_resting_heart_rate", "daily", yesterday, "google-wearables"],
    ["daily-heart-rate-variability", "daily_heart_rate_variability", "daily", yesterday, "google-wearables"],
    ["daily-oxygen-saturation", "daily_oxygen_saturation", "daily", yesterday, "google-wearables"],
    ["daily-respiratory-rate", "daily_respiratory_rate", "daily", yesterday, "google-wearables"],
    ["daily-vo2-max", "daily_vo2_max", "daily", yesterday, "google-wearables"],
    ["daily-heart-rate-zones", "daily_heart_rate_zones", "daily", yesterday, "google-wearables"],
    ["respiratory-rate-sleep-summary", "respiratory_rate_sleep_summary", "sample", yesterday, "google-wearables"],
    ["sedentary-period", "sedentary_period", "interval", yesterday, "google-wearables"],
    ["time-in-heart-rate-zone", "time_in_heart_rate_zone", "interval", yesterday, "google-wearables"],
    ["sleep", "sleep", "session", yesterday, "google-wearables"],
    ["weight", "weight", "sample", weightStart, "google-sources"],
    ["body-fat", "body_fat", "sample", weightStart, "google-sources"]
  ];

  const results = [];

  for (const c of configs) {
    try {
      const points =
        await googleReconcile(
          token,
          c[0],
          c[1],
          c[2],
          c[3],
          `users/me/dataSourceFamilies/${c[4]}`
        );

      let saved = 0;

      for (const point of points) {
        const i =
          googleInfo(
            c[0],
            point
          );

        await savePoint(
          env,
          c[4],
          c[0],
          point,
          i.value,
          i.unit,
          i.sample,
          i.start,
          i.end
        );

        saved++;
      }

      results.push({
        data_type: c[0],
        records_found: points.length,
        records_saved: saved,
        status: "ok"
      });

    } catch (error) {
      results.push({
        data_type: c[0],
        records_found: 0,
        records_saved: 0,
        status: "error",
        message: error.message
      });
    }
  }


  // Total calories
  try {
    const data =
      await googleDailyRollup(
        token,
        "total-calories",
        today,
        dateDaysFromNow(1)
      );

    const r =
      data.rollupDataPoints &&
      data.rollupDataPoints[0];

    const kcal =
      r &&
      r.totalCalories &&
      r.totalCalories.kcalSum;

    if (
      kcal !== undefined &&
      kcal !== null
    ) {
      await savePoint(
        env,
        "google-wearables",
        "total-calories",
        data,
        kcal,
        "kcal",
        today,
        `${today}T00:00:00`,
        `${dateDaysFromNow(1)}T00:00:00`,
        `total-calories:${today}`
      );
    }

    results.push({
      data_type: "total-calories",
      records_found: kcal ? 1 : 0,
      records_saved: kcal ? 1 : 0,
      status: "ok"
    });

  } catch (error) {
    results.push({
      data_type: "total-calories",
      records_found: 0,
      records_saved: 0,
      status: "error",
      message: error.message
    });
  }


  return Response.json({
    status: "ok",
    source: "google",
    date: today,
    results
  });
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
         AND data_type = 'active-energy-burned'
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
    text.includes("cycle");

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

async function energyForDate(
  env,
  date
) {
  const google =
    await env.DB
      .prepare(
        `SELECT *
         FROM health_datapoints
         WHERE data_type = 'total-calories'
         AND sample_time LIKE ?
         ORDER BY id DESC
         LIMIT 1`
      )
      .bind(
        date + "%"
      )
      .first();

  const planned =
    await env.DB
      .prepare(
        `SELECT *
         FROM health_datapoints
         WHERE source_family = 'intervals'
         AND data_type = 'planned-workout'
         AND start_time LIKE ?
         ORDER BY start_time`
      )
      .bind(
        date + "%"
      )
      .all();

  const activities =
    await env.DB
      .prepare(
        `SELECT *
         FROM health_datapoints
         WHERE source_family = 'intervals'
         AND data_type = 'activity'
         AND start_time LIKE ?
         AND (
           record_role IS NULL
           OR record_role != 'duplicate'
         )
         ORDER BY start_time`
      )
      .bind(
        date + "%"
      )
      .all();

  const weight =
    await env.DB
      .prepare(
        `SELECT value_numeric
         FROM health_datapoints
         WHERE data_type = 'weight'
         AND value_numeric IS NOT NULL
         ORDER BY sample_time DESC
         LIMIT 1`
      )
      .first();

  let googleCalories =
    null;

  if (google) {
    googleCalories =
      Number(
        google.value_numeric
      );
  }

  const plannedWorkouts =
    planned.results.map(
      row =>
        plannedWorkoutInfo(
          JSON.parse(
            row.payload_json
          )
        )
    );

  const completed =
    activities.results.map(
      row => ({
        id:
          row.external_id,

        type:
          JSON.parse(
            row.payload_json
          ).type ||
          "Unknown",

        calories:
          row.value_numeric,

        start:
          row.start_time,

        end:
          row.end_time,

        durationHours:
          hoursBetween(
            row.start_time,
            row.end_time
          ),

        payload:
          JSON.parse(
            row.payload_json
          )
      })
    );

  const plannedCycling =
    plannedWorkouts.filter(
      x => x.cycling
    );

  let estimatedPlannedCalories =
    0;

  for (
    const workout of plannedCycling
  ) {
    if (
      workout.durationHours
    ) {
      estimatedPlannedCalories +=
        600 *
        workout.durationHours;
    }
  }

  const base =
    googleCalories ||
    CONFIG.baselineTDEE;

  const plannedAdjustment =
    estimatedPlannedCalories;

  const projectedTDEE =
    googleCalories
      ? Math.round(
          googleCalories +
          plannedAdjustment * 0.5
        )
      : Math.round(
          CONFIG.baselineTDEE +
          plannedAdjustment
        );

  const target =
    Math.round(
      projectedTDEE -
      (
        CONFIG.weightLossTargetKgPerWeek *
        7700 /
        7
      )
    );

  return {
    date,

    currentWeight:
      weight
        ? Number(
            weight.value_numeric
          )
        : null,

    googleTotalCalories:
      googleCalories,

    completedActivities:
      completed,

    plannedWorkouts,

    estimatedPlannedActivityCalories:
      Math.round(
        estimatedPlannedCalories
      ),

    estimatedTDEE:
      projectedTDEE,

    calorieTarget:
      Math.max(
        1800,
        target
      )
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

  const plannedRide =
    energy.plannedWorkouts.find(
      x => x.cycling
    );

  let fueling = null;

  if (plannedRide) {
    fueling =
      calculateFueling(
        energy.currentWeight,
        plannedRide
      );
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
        protein
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
        energy.calorieTarget
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
