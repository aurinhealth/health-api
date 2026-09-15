export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==================================================
    // BASIC
    // ==================================================

    if (url.pathname === "/") {
      return Response.json({
        status: "ok",
        service: "health-api"
      });
    }


    // ==================================================
    // GOOGLE AUTH TEST
    // ==================================================

    if (url.pathname === "/auth-test") {
      return await testGoogleAuth(env);
    }


    // ==================================================
    // GOOGLE FULL SYNC
    // ==================================================

    if (url.pathname === "/sync/google") {
      return await syncGoogleHealth(env);
    }


    // ==================================================
    // OLD CALORIE ENDPOINT
    // ==================================================

    if (url.pathname === "/health/today") {
      return await getTodayCalories(env);
    }


    // ==================================================
    // OLD SLEEP ENDPOINT
    // ==================================================

    if (url.pathname === "/health/sleep") {
      return await getTodaySleep(env);
    }


    // ==================================================
    // OLD WEIGHT ENDPOINT
    // ==================================================

    if (url.pathname === "/health/weight") {
      return await getLatestWeight(env);
    }


    // ==================================================
    // DATABASE TEST
    // ==================================================

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
        message: error.message
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


// ======================================================
// GOOGLE CIVIL DATE
// ======================================================

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
// SAVE GENERIC DATA POINT
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
// GENERIC RECONCILE
// ======================================================

async function reconcileDataType(
  env,
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


  if (config.recordType === "interval") {
    filter =
      config.filterName +
      ".interval.civil_start_time >= \"" +
      startDate +
      "T00:00:00\"";
  }


  if (config.recordType === "sample") {
    filter =
      config.filterName +
      ".sample_time.civil_time >= \"" +
      startDate +
      "T00:00:00\"";
  }


  if (config.recordType === "daily") {
    filter =
      config.filterName +
      ".date >= \"" +
      startDate +
      "\"";
  }


  if (config.recordType === "exercise") {
    filter =
      "exercise.interval.civil_start_time >= \"" +
      startDate +
      "T00:00:00\"";
  }


  if (config.recordType === "sleep") {
    filter =
      "sleep.interval.civil_end_time >= \"" +
      startDate +
      "T00:00:00\"";
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
// EXTRACT COMMON VALUES
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


  // ----------------------------------------------
  // INTERVAL
  // ----------------------------------------------

  if (
    point.startTime
  ) {
    startTime =
      point.startTime;
  }


  if (
    point.endTime
  ) {
    endTime =
      point.endTime;
  }


  // ----------------------------------------------
  // SAMPLE TIME
  // ----------------------------------------------

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


  // ----------------------------------------------
  // HEART RATE
  // ----------------------------------------------

  if (
    dataType === "heart-rate" &&
    point.heartRate
  ) {
    value =
      point.heartRate.bpm;

    unit =
      "bpm";
  }


  // ----------------------------------------------
  // WEIGHT
  // ----------------------------------------------

  if (
    dataType === "weight" &&
    point.weight
  ) {
    value =
      Number(
        point.weight.weightGrams
      ) / 1000;

    unit =
      "kg";
  }


  // ----------------------------------------------
  // BODY FAT
  // ----------------------------------------------

  if (
    dataType === "body-fat" &&
    point.bodyFat
  ) {
    value =
      point.bodyFat.percentage;

    unit =
      "%";
  }


  // ----------------------------------------------
  // OXYGEN SATURATION
  // ----------------------------------------------

  if (
    dataType === "oxygen-saturation" &&
    point.oxygenSaturation
  ) {
    value =
      point.oxygenSaturation.percentage;

    unit =
      "%";
  }


  // ----------------------------------------------
  // RESPIRATORY RATE
  // ----------------------------------------------

  if (
    dataType === "respiratory-rate" &&
    point.respiratoryRate
  ) {
    value =
      point.respiratoryRate.breathsPerMinute;

    unit =
      "breaths/min";
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
// FULL GOOGLE HEALTH SYNC
// ======================================================

async function syncGoogleHealth(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);


    const today =
      getPragueDate();


    const startDate =
      getDateDaysAgo(1);


    const results = [];


    // ==================================================
    // CONFIGURATION
    // ==================================================

    const configs = [

      {
        dataType:
          "active-energy-burned",

        filterName:
          "active_energy_burned",

        recordType:
          "interval",

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

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "respiratory-rate",

        filterName:
          "respiratory_rate",

        recordType:
          "sample",

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

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "sleep",

        filterName:
          "sleep",

        recordType:
          "sleep",

        sourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
      },

      {
        dataType:
          "exercise",

        filterName:
          "exercise",

        recordType:
          "exercise",

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

        sourceFamily:
          "users/me/dataSourceFamilies/google-sources"
      }
    ];


    // ==================================================
    // PROCESS DATA TYPES
    // ==================================================

    for (
      const config of configs
    ) {
      try {

        const points =
          await reconcileDataType(
            env,
            accessToken,
            config,
            startDate
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

            config.sourceFamily
              .replace(
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


      const endpoint =
        "https://health.googleapis.com/v4/users/me/" +
        "dataTypes/total-calories/" +
        "dataPoints:dailyRollUp";


      const body = {
        range: {
          start:
            googleDate(today),

          end:
            googleDate(tomorrow)
        },

        windowSizeDays:
          1,

        dataSourceFamily:
          "users/me/dataSourceFamilies/google-wearables"
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
          "HTTP " +
          response.status +
          ": " +
          JSON.stringify(data)
        );
      }


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
    // RESPONSE
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
      status: "ok",

      date:
        today,

      sync_start_date:
        startDate,

      sync_end_date:
        today,

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
        status: "error",
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


    const endpoint =
      "https://health.googleapis.com/v4/users/me/" +
      "dataTypes/total-calories/" +
      "dataPoints:dailyRollUp";


    const body = {
      range: {
        start:
          googleDate(today),

        end:
          googleDate(tomorrow)
      },

      windowSizeDays:
        1,

      dataSourceFamily:
        "users/me/dataSourceFamilies/google-wearables"
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
      return Response.json(
        {
          status: "error",
          google_status:
            response.status,
          google_response:
            data
        },
        { status: 500 }
      );
    }


    const rollup =
      data.rollupDataPoints &&
      data.rollupDataPoints[0];


    const calories =
      rollup &&
      rollup.totalCalories &&
      rollup.totalCalories.kcalSum;


    return Response.json({
      status: "ok",
      date: today,
      source:
        "google-wearables",
      total_calories:
        calories
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
// OLD SLEEP ENDPOINT
// ======================================================

async function getTodaySleep(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    const today =
      getPragueDate();


    const params =
      new URLSearchParams();


    params.set(
      "dataSourceFamily",
      "users/me/dataSourceFamilies/google-wearables"
    );


    params.set(
      "filter",
      'sleep.interval.civil_end_time >= "' +
      today +
      'T00:00:00"'
    );


    const endpoint =
      "https://health.googleapis.com/v4/users/me/" +
      "dataTypes/sleep/dataPoints:reconcile?" +
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
      return Response.json(
        {
          status: "error",
          google_status:
            response.status,
          google_response:
            data
        },
        { status: 500 }
      );
    }


    return Response.json({
      status: "ok",
      date: today,
      source:
        "google-wearables",
      count:
        data.dataPoints
          ? data.dataPoints.length
          : 0,
      sleep:
        data.dataPoints || []
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
// OLD WEIGHT ENDPOINT
// ======================================================

async function getLatestWeight(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);


    const startDate =
      getDateDaysAgo(30);


    const params =
      new URLSearchParams();


    params.set(
      "dataSourceFamily",
      "users/me/dataSourceFamilies/google-sources"
    );


    params.set(
      "filter",
      'weight.sample_time.physical_time >= "' +
      startDate +
      'T00:00:00Z"'
    );


    const endpoint =
      "https://health.googleapis.com/v4/users/me/" +
      "dataTypes/weight/dataPoints:reconcile?" +
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
      return Response.json(
        {
          status: "error",
          google_status:
            response.status,
          google_response:
            data
        },
        { status: 500 }
      );
    }


    const points =
      data.dataPoints || [];


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
        status: "ok",
        weight: null
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
      status: "ok",
      weight_kg:
        kilograms,
      source:
        "google-sources"
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
      status: "ok",
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
        status: "error",
        message:
          error.message
      },
      { status: 500 }
    );
  }
}
