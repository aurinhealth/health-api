export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        status: "ok",
        service: "health-api"
      });
    }
    
    if (url.pathname === "/test/intervals") {
    return await testIntervals(env);
    }
    
    if (url.pathname === "/auth-test") {
      return await testGoogleAuth(env);
    }

    if (url.pathname === "/sync/google") {
      return await syncGoogleHealth(env);
    }

    if (url.pathname === "/health/today") {
      return await getTodayCalories(env);
    }

    if (url.pathname === "/health/sleep") {
      return await getTodaySleep(env);
    }

    if (url.pathname === "/health/weight") {
      return await getLatestWeight(env);
    }

    if (url.pathname === "/health/db") {
      return await getTodayFromDatabase(env);
    }

    return Response.json(
      {
        status: "error",
        message: "Not found"
      },
      { status: 404 }
    );
  }
};


// ======================================================
// GOOGLE OAUTH
// ======================================================

async function getGoogleAccessToken(env) {
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
      (data.error || "unknown_error") +
      " " +
      (data.error_description || "")
    );
  }

  return data.access_token;
}


// ======================================================
// AUTH TEST
// ======================================================

async function testGoogleAuth(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    return Response.json({
      status: "ok",
      google_oauth: "working",
      token_type: "Bearer",
      has_access_token:
        Boolean(accessToken)
    });

  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error.message
      },
      { status: 500 }
    );
  }
}


// ======================================================
// DATE HELPERS
// ======================================================

function getPragueDate() {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Europe/Prague",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

  const year =
    parts.find(
      function (part) {
        return part.type === "year";
      }
    ).value;

  const month =
    parts.find(
      function (part) {
        return part.type === "month";
      }
    ).value;

  const day =
    parts.find(
      function (part) {
        return part.type === "day";
      }
    ).value;

  return (
    year +
    "-" +
    month +
    "-" +
    day
  );
}


function getDateDaysAgo(days) {
  const today =
    getPragueDate();

  const parts =
    today.split("-");

  const date =
    new Date(
      Date.UTC(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]) - days
      )
    );

  return (
    date.getUTCFullYear() +
    "-" +
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0") +
    "-" +
    String(
      date.getUTCDate()
    ).padStart(2, "0")
  );
}


function getTomorrowDate(dateString) {
  const parts =
    dateString.split("-");

  const date =
    new Date(
      Date.UTC(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]) + 1
      )
    );

  return (
    date.getUTCFullYear() +
    "-" +
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0") +
    "-" +
    String(
      date.getUTCDate()
    ).padStart(2, "0")
  );
}


function googleDate(dateString) {
  const parts =
    dateString.split("-");

  return {
    date: {
      year:
        Number(parts[0]),

      month:
        Number(parts[1]),

      day:
        Number(parts[2])
    },

    time: {
      hours: 0,
      minutes: 0,
      seconds: 0,
      nanos: 0
    }
  };
}


// ======================================================
// SAVE DATA POINT
// ======================================================

async function saveDataPoint(
  env,
  sourceFamily,
  dataType,
  point,
  value,
  unit,
  sampleTime,
  startTime,
  endTime
) {
  const externalId =
    point.name ||
    (
      dataType +
      ":" +
      String(
        sampleTime ||
        startTime ||
        endTime ||
        JSON.stringify(point)
      )
    );

  const result =
    await env.DB
      .prepare(
        "INSERT INTO health_datapoints (" +
        "source_family, " +
        "data_type, " +
        "external_id, " +
        "sample_time, " +
        "start_time, " +
        "end_time, " +
        "value_numeric, " +
        "value_unit, " +
        "payload_json" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +

        "ON CONFLICT (" +
        "source_family, " +
        "data_type, " +
        "external_id" +
        ") DO UPDATE SET " +

        "sample_time = excluded.sample_time, " +
        "start_time = excluded.start_time, " +
        "end_time = excluded.end_time, " +
        "value_numeric = excluded.value_numeric, " +
        "value_unit = excluded.value_unit, " +
        "payload_json = excluded.payload_json, " +
        "updated_at = CURRENT_TIMESTAMP"
      )
      .bind(
        sourceFamily,
        dataType,
        externalId,
        sampleTime || null,
        startTime || null,
        endTime || null,
        value !== undefined &&
        value !== null
          ? value
          : null,
        unit || null,
        JSON.stringify(point)
      )
      .run();

  return {
    external_id:
      externalId,

    database_success:
      result.success
  };
}


// ======================================================
// EXTRACT POINT INFORMATION
// ======================================================

function extractPointInfo(
  dataType,
  point
) {
  let value = null;
  let unit = null;
  let sampleTime = null;
  let startTime = null;
  let endTime = null;


  // --------------------------------------------------
  // COMMON INTERVAL
  // --------------------------------------------------

  if (point.interval) {
    startTime =
      point.interval.startTime ||
      null;

    endTime =
      point.interval.endTime ||
      null;
  }


  // --------------------------------------------------
  // COMMON SAMPLE TIME
  // --------------------------------------------------

  if (
    point.sampleTime &&
    point.sampleTime.physicalTime
  ) {
    sampleTime =
      point.sampleTime.physicalTime;
  }


  if (
    !sampleTime &&
    point.sampleTime &&
    point.sampleTime.civilTime &&
    point.sampleTime.civilTime.date
  ) {
    const d =
      point.sampleTime.civilTime.date;

    sampleTime =
      d.year +
      "-" +
      String(d.month).padStart(2, "0") +
      "-" +
      String(d.day).padStart(2, "0");
  }


  // --------------------------------------------------
  // DAILY DATE
  // --------------------------------------------------

  if (
    point.dailyRestingHeartRate &&
    point.dailyRestingHeartRate.date
  ) {
    const d =
      point.dailyRestingHeartRate.date;

    sampleTime =
      d.year +
      "-" +
      String(d.month).padStart(2, "0") +
      "-" +
      String(d.day).padStart(2, "0");
  }


  if (
    point.dailyHeartRateVariability &&
    point.dailyHeartRateVariability.date
  ) {
    const d =
      point.dailyHeartRateVariability.date;

    sampleTime =
      d.year +
      "-" +
      String(d.month).padStart(2, "0") +
      "-" +
      String(d.day).padStart(2, "0");
  }


  if (
    point.dailyOxygenSaturation &&
    point.dailyOxygenSaturation.date
  ) {
    const d =
      point.dailyOxygenSaturation.date;

    sampleTime =
      d.year +
      "-" +
      String(d.month).padStart(2, "0") +
      "-" +
      String(d.day).padStart(2, "0");
  }


  if (
    point.dailyRespiratoryRate &&
    point.dailyRespiratoryRate.date
  ) {
    const d =
      point.dailyRespiratoryRate.date;

    sampleTime =
      d.year +
      "-" +
      String(d.month).padStart(2, "0") +
      "-" +
      String(d.day).padStart(2, "0");
  }


  if (
    point.dailyVo2Max &&
    point.dailyVo2Max.date
  ) {
    const d =
      point.dailyVo2Max.date;

    sampleTime =
      d.year +
      "-" +
      String(d.month).padStart(2, "0") +
      "-" +
      String(d.day).padStart(2, "0");
  }


  if (
    point.dailyHeartRateZones &&
    point.dailyHeartRateZones.date
  ) {
    const d =
      point.dailyHeartRateZones.date;

    sampleTime =
      d.year +
      "-" +
      String(d.month).padStart(2, "0") +
      "-" +
      String(d.day).padStart(2, "0");
  }


  // --------------------------------------------------
  // HEART RATE
  // --------------------------------------------------

  if (
    point.heartRate &&
    point.heartRate.bpm !== undefined
  ) {
    value =
      point.heartRate.bpm;

    unit =
      "bpm";
  }


  // --------------------------------------------------
  // HRV
  // --------------------------------------------------

  if (
    point.heartRateVariability
  ) {
    if (
      point.heartRateVariability.rmssd !==
      undefined
    ) {
      value =
        point.heartRateVariability.rmssd;

      unit =
        "ms";
    }
  }


  // --------------------------------------------------
  // WEIGHT
  // --------------------------------------------------

  if (
    point.weight &&
    point.weight.weightGrams !==
    undefined
  ) {
    value =
      Number(
        point.weight.weightGrams
      ) / 1000;

    unit =
      "kg";
  }


  // --------------------------------------------------
  // BODY FAT
  // --------------------------------------------------

  if (
    point.bodyFat &&
    point.bodyFat.percentage !==
    undefined
  ) {
    value =
      point.bodyFat.percentage;

    unit =
      "%";
  }


  // --------------------------------------------------
  // OXYGEN SATURATION
  // --------------------------------------------------

  if (
    point.oxygenSaturation &&
    point.oxygenSaturation.percentage !==
    undefined
  ) {
    value =
      point.oxygenSaturation.percentage;

    unit =
      "%";
  }


  // --------------------------------------------------
  // DAILY RESTING HR
  // --------------------------------------------------

  if (
    point.dailyRestingHeartRate &&
    point.dailyRestingHeartRate
      .beatsPerMinute !== undefined
  ) {
    value =
      point.dailyRestingHeartRate
        .beatsPerMinute;

    unit =
      "bpm";
  }


  // --------------------------------------------------
  // DAILY HRV
  // --------------------------------------------------

  if (
    point.dailyHeartRateVariability &&
    point.dailyHeartRateVariability
      .rmssd !== undefined
  ) {
    value =
      point.dailyHeartRateVariability
        .rmssd;

    unit =
      "ms";
  }


  // --------------------------------------------------
  // DAILY OXYGEN
  // --------------------------------------------------

  if (
    point.dailyOxygenSaturation &&
    point.dailyOxygenSaturation
      .percentage !== undefined
  ) {
    value =
      point.dailyOxygenSaturation
        .percentage;

    unit =
      "%";
  }


  // --------------------------------------------------
  // DAILY RESPIRATORY RATE
  // --------------------------------------------------

  if (
    point.dailyRespiratoryRate &&
    point.dailyRespiratoryRate
      .breathsPerMinute !== undefined
  ) {
    value =
      point.dailyRespiratoryRate
        .breathsPerMinute;

    unit =
      "breaths/min";
  }


  // --------------------------------------------------
  // DAILY VO2 MAX
  // --------------------------------------------------

  if (
    point.dailyVo2Max &&
    point.dailyVo2Max.vo2Max !== undefined
  ) {
    value =
      point.dailyVo2Max.vo2Max;

    unit =
      "ml/kg/min";
  }


  // --------------------------------------------------
  // RESPIRATORY SLEEP SUMMARY
  // --------------------------------------------------

  if (
    point.respiratoryRateSleepSummary
  ) {
    const summary =
      point.respiratoryRateSleepSummary;

    if (
      summary.fullSleepStats &&
      summary.fullSleepStats
        .breathsPerMinute !== undefined
    ) {
      value =
        summary.fullSleepStats
          .breathsPerMinute;

      unit =
        "breaths/min";
    }

    if (
      summary.sampleTime &&
      summary.sampleTime.physicalTime
    ) {
      sampleTime =
        summary.sampleTime.physicalTime;
    }
  }


  return {
    value:
      value,

    unit:
      unit,

    sampleTime:
      sampleTime,

    startTime:
      startTime,

    endTime:
      endTime
  };
}


// ======================================================
// RECONCILE DATA TYPE
// ======================================================

async function reconcileDataType(
  accessToken,
  config,
  startDate
) {
  const params =
    new URLSearchParams();

  params.set(
    "dataSourceFamily",
    config.sourceFamily
  );

  let filter = "";

  if (
    config.recordType ===
    "interval"
  ) {
    filter =
      config.filterName +
      '.interval.civil_start_time >= "' +
      startDate +
      'T00:00:00"';
  }

  if (
    config.recordType ===
    "sample"
  ) {
    filter =
      config.filterName +
      '.sample_time.civil_time >= "' +
      startDate +
      'T00:00:00"';
  }

  if (
    config.recordType ===
    "daily"
  ) {
    filter =
      config.filterName +
      '.date >= "' +
      startDate +
      '"';
  }

  if (
    config.recordType ===
    "session"
  ) {
    filter =
      config.filterName +
      '.interval.civil_end_time >= "' +
      startDate +
      'T00:00:00"';
  }

  params.set(
    "filter",
    filter
  );

  const endpoint =
    "https://health.googleapis.com/v4/users/me/" +
    "dataTypes/" +
    config.dataType +
    "/dataPoints:reconcile?" +
    params.toString();

  const response =
    await fetch(
      endpoint,
      {
        method: "GET",

        headers: {
          "Authorization":
            "Bearer " + accessToken,

          "Accept":
            "application/json"
        }
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      config.dataType +
      " HTTP " +
      response.status +
      ": " +
      JSON.stringify(data)
    );
  }

  return data.dataPoints || [];
}


// ======================================================
// DAILY ROLLUP
// ======================================================

async function dailyRollup(
  accessToken,
  dataType,
  sourceFamily,
  startDate,
  endDate
) {
  const endpoint =
    "https://health.googleapis.com/v4/users/me/" +
    "dataTypes/" +
    dataType +
    "/dataPoints:dailyRollUp";

  const body = {
    range: {
      start:
        googleDate(startDate),

      end:
        googleDate(endDate)
    },

    windowSizeDays:
      1,

    dataSourceFamily:
      sourceFamily
  };

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Authorization":
            "Bearer " + accessToken,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error &&
      data.error.message
        ? data.error.message
        : JSON.stringify(data)
    );
  }

  return data;
}


// ======================================================
// GOOGLE FULL SYNC
// ======================================================

async function syncGoogleHealth(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    const today =
      getPragueDate();

    const yesterday =
      getDateDaysAgo(1);

    const weightStart =
      getDateDaysAgo(30);

    const results =
      [];


    // ==================================================
    // RECONCILE CONFIGURATION
    // ==================================================

    const configs = [

      {
        dataType:
          "active-energy-burned",

        filterName:
          "active_energy_burned",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "active-minutes",

        filterName:
          "active_minutes",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "active-zone-minutes",

        filterName:
          "active_zone_minutes",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "steps",

        filterName:
          "steps",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "distance",

        filterName:
          "distance",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "floors",

        filterName:
          "floors",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "heart-rate",

        filterName:
          "heart_rate",

        recordType:
          "sample",

        startDate:
          getDateDaysAgo(1),

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "heart-rate-variability",

        filterName:
          "heart_rate_variability",

        recordType:
          "sample",

        startDate:
          getDateDaysAgo(1),

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "oxygen-saturation",

        filterName:
          "oxygen_saturation",

        recordType:
          "sample",

        startDate:
          getDateDaysAgo(1),

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "daily-resting-heart-rate",

        filterName:
          "daily_resting_heart_rate",

        recordType:
          "daily",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "daily-heart-rate-variability",

        filterName:
          "daily_heart_rate_variability",

        recordType:
          "daily",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "daily-oxygen-saturation",

        filterName:
          "daily_oxygen_saturation",

        recordType:
          "daily",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "daily-respiratory-rate",

        filterName:
          "daily_respiratory_rate",

        recordType:
          "daily",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "daily-vo2-max",

        filterName:
          "daily_vo2_max",

        recordType:
          "daily",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "daily-heart-rate-zones",

        filterName:
          "daily_heart_rate_zones",

        recordType:
          "daily",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "respiratory-rate-sleep-summary",

        filterName:
          "respiratory_rate_sleep_summary",

        recordType:
          "sample",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "sedentary-period",

        filterName:
          "sedentary_period",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "time-in-heart-rate-zone",

        filterName:
          "time_in_heart_rate_zone",

        recordType:
          "interval",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "exercise",

        filterName:
          "exercise",

        recordType:
          "session",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "sleep",

        filterName:
          "sleep",

        recordType:
          "session",

        startDate:
          yesterday,

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "weight",

        filterName:
          "weight",

        recordType:
          "sample",

        startDate:
          weightStart,

        sourceFamily:
          "users/me/dataSourceFamilies/google-sources"
      },

      {
        dataType:
          "body-fat",

        filterName:
          "body_fat",

        recordType:
          "sample",

        startDate:
          weightStart,

        sourceFamily:
          "users/me/dataSourceFamilies/google-sources"
      }
    ];


    // ==================================================
    // RECONCILE TYPES
    // ==================================================

    for (
      const config of configs
    ) {
      try {
        const points =
          await reconcileDataType(
            accessToken,
            config,
            config.startDate
          );

        let saved =
          0;

        for (
          const point of points
        ) {
          const info =
            extractPointInfo(
              config.dataType,
              point
            );

          await saveDataPoint(
            env,

            config.sourceFamily.replace(
              "users/me/dataSourceFamilies/",
              ""
            ),

            config.dataType,

            point,

            info.value,

            info.unit,

            info.sampleTime,

            info.startTime,

            info.endTime
          );

          saved++;
        }

        results.push({
          data_type:
            config.dataType,

          records_found:
            points.length,

          records_saved:
            saved,

          status:
            "ok"
        });

      } catch (error) {
        results.push({
          data_type:
            config.dataType,

          status:
            "error",

          message:
            error.message
        });
      }
    }


    // ==================================================
    // TOTAL CALORIES
    // ==================================================

    try {
      const tomorrow =
        getTomorrowDate(today);

      const data =
        await dailyRollup(
          accessToken,

          "total-calories",

          "users/me/dataSourceFamilies/google-wearables",

          today,

          tomorrow
        );

      const rollup =
        data.rollupDataPoints &&
        data.rollupDataPoints[0];

      const calories =
        rollup &&
        rollup.totalCalories &&
        rollup.totalCalories.kcalSum;

      if (
        calories !== undefined &&
        calories !== null
      ) {
        await saveDataPoint(
          env,

          "google-wearables",

          "total-calories",

          data,

          calories,

          "kcal",

          today,

          today + "T00:00:00",

          tomorrow + "T00:00:00"
        );
      }

      results.push({
        data_type:
          "total-calories",

        records_found:
          calories !== undefined &&
          calories !== null
            ? 1
            : 0,

        records_saved:
          calories !== undefined &&
          calories !== null
            ? 1
            : 0,

        status:
          "ok"
      });

    } catch (error) {
      results.push({
        data_type:
          "total-calories",

        status:
          "error",

        message:
          error.message
      });
    }


    // ==================================================
    // CALORIES IN HR ZONES
    // ==================================================

    try {
      const tomorrow =
        getTomorrowDate(today);

      const data =
        await dailyRollup(
          accessToken,

          "calories-in-heart-rate-zone",

          "users/me/dataSourceFamilies/google-wearables",

          yesterday,

          tomorrow
        );

      const points =
        data.rollupDataPoints ||
        [];

      let saved =
        0;

      for (
        const point of points
      ) {
        await saveDataPoint(
          env,

          "google-wearables",

          "calories-in-heart-rate-zone",

          point,

          null,

          "kcal",

          point.startTime ||
          yesterday,

          point.startTime ||
          null,

          point.endTime ||
          null
        );

        saved++;
      }

      results.push({
        data_type:
          "calories-in-heart-rate-zone",

        records_found:
          points.length,

        records_saved:
          saved,

        status:
          "ok"
      });

    } catch (error) {
      results.push({
        data_type:
          "calories-in-heart-rate-zone",

        status:
          "error",

        message:
          error.message
      });
    }


    // ==================================================
    // SUMMARY
    // ==================================================

    let totalFound =
      0;

    let totalSaved =
      0;

    for (
      const result of results
    ) {
      totalFound +=
        result.records_found || 0;

      totalSaved +=
        result.records_saved || 0;
    }


    return Response.json({
      status:
        "ok",

      date:
        today,

      sync_start_date:
        yesterday,

      sync_end_date:
        today,

      weight_start_date:
        weightStart,

      data_types_processed:
        results.length,

      total_records_found:
        totalFound,

      total_records_saved:
        totalSaved,

      results:
        results
    });

  } catch (error) {
    return Response.json(
      {
        status:
          "error",

        message:
          error.message
      },
      { status: 500 }
    );
  }
}


// ======================================================
// OLD CALORIE ENDPOINT
// ======================================================

async function getTodayCalories(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    const today =
      getPragueDate();

    const tomorrow =
      getTomorrowDate(today);

    const data =
      await dailyRollup(
        accessToken,

        "total-calories",

        "users/me/dataSourceFamilies/google-wearables",

        today,

        tomorrow
      );

    const rollup =
      data.rollupDataPoints &&
      data.rollupDataPoints[0];

    const calories =
      rollup &&
      rollup.totalCalories &&
      rollup.totalCalories.kcalSum;

    return Response.json({
      status:
        "ok",

      date:
        today,

      source:
        "google-wearables",

      total_calories:
        calories
    });

  } catch (error) {
    return Response.json(
      {
        status:
          "error",

        message:
          error.message
      },
      { status: 500 }
    );
  }
}


// ======================================================
// OLD SLEEP ENDPOINT
// ======================================================

async function getTodaySleep(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    const today =
      getPragueDate();

    const config = {
      dataType:
        "sleep",

      filterName:
        "sleep",

      recordType:
        "session",

      sourceFamily:
        "users/me/dataSourceFamilies/google-wearables"
    };

    const points =
      await reconcileDataType(
        accessToken,
        config,
        today
      );

    return Response.json({
      status:
        "ok",

      date:
        today,

      source:
        "google-wearables",

      count:
        points.length,

      sleep:
        points
    });

  } catch (error) {
    return Response.json(
      {
        status:
          "error",

        message:
          error.message
      },
      { status: 500 }
    );
  }
}


// ======================================================
// OLD WEIGHT ENDPOINT
// ======================================================

async function getLatestWeight(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    const startDate =
      getDateDaysAgo(30);

    const config = {
      dataType:
        "weight",

      filterName:
        "weight",

      recordType:
        "sample",

      sourceFamily:
        "users/me/dataSourceFamilies/google-sources"
    };

    const points =
      await reconcileDataType(
        accessToken,
        config,
        startDate
      );

    if (
      points.length === 0
    ) {
      return Response.json({
        status:
          "ok",

        weight:
          null
      });
    }

    const weights =
      points.filter(
        function (point) {
          return (
            point.weight &&
            point.weight.weightGrams !==
            undefined
          );
        }
      );

    if (
      weights.length === 0
    ) {
      return Response.json({
        status:
          "ok",

        weight:
          null
      });
    }

    const latest =
      weights[
        weights.length - 1
      ];

    const kilograms =
      Number(
        latest.weight.weightGrams
      ) / 1000;

    return Response.json({
      status:
        "ok",

      weight_kg:
        kilograms,

      source:
        "google-sources"
    });

  } catch (error) {
    return Response.json(
      {
        status:
          "error",

        message:
          error.message
      },
      { status: 500 }
    );
  }
}


// ======================================================
// DATABASE CHECK
// ======================================================

async function getTodayFromDatabase(env) {
  try {
    const today =
      getPragueDate();

    const result =
      await env.DB
        .prepare(
          "SELECT " +
          "id, " +
          "source_family, " +
          "data_type, " +
          "external_id, " +
          "sample_time, " +
          "start_time, " +
          "end_time, " +
          "value_numeric, " +
          "value_unit, " +
          "created_at, " +
          "updated_at " +
          "FROM health_datapoints " +
          "WHERE sample_time LIKE ? " +
          "ORDER BY id DESC"
        )
        .bind(
          today + "%"
        )
        .all();

    return Response.json({
      status:
        "ok",

      date:
        today,

      count:
        result.results.length,

      data:
        result.results
    });

  } catch (error) {
    return Response.json(
      {
        status:
          "error",

        message:
          error.message
      },
      { status: 500 }
    );
  }
}
async function testIntervals(env) {
  try {
    const apiKey =
      env.INTERVALS_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          status: "error",
          message:
            "INTERVALS_API_KEY is not configured"
        },
        { status: 500 }
      );
    }

    const credentials =
      btoa("API_KEY:" + apiKey);

    const response =
      await fetch(
        "https://intervals.icu/api/v1/athlete/0/profile",
        {
          method: "GET",

          headers: {
            "Authorization":
              "Basic " + credentials,

            "Accept":
              "application/json"
          }
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      return Response.json(
        {
          status: "error",
          http_status:
            response.status,
          message:
            data
        },
        { status: response.status }
      );
    }

    return Response.json({
      status: "ok",
      source:
        "intervals.icu",
      api_connection:
        "working",
      athlete:
        data
    });

  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error.message
      },
      { status: 500 }
    );
  }
}
