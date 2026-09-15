export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Basic health check
    if (url.pathname === "/") {
      return Response.json({
        status: "ok",
        service: "health-api"
      });
    }

    // Google OAuth test
    if (url.pathname === "/auth-test") {
      return await testGoogleAuth(env);
    }

    // Today's calories
    if (url.pathname === "/health/today") {
      return await getTodayCalories(env);
    }

    // Today's sleep
    if (url.pathname === "/health/sleep") {
      return await getTodaySleep(env);
    }

    // Latest weight
    if (url.pathname === "/health/weight") {
    return await getLatestWeight(env);
    }

    // Read today's calories from D1
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


function getTomorrowDate(dateString) {
  const parts =
    dateString.split("-");

  const year =
    Number(parts[0]);

  const month =
    Number(parts[1]);

  const day =
    Number(parts[2]);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day + 1
      )
    );

  const nextYear =
    date.getUTCFullYear();

  const nextMonth =
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0");

  const nextDay =
    String(
      date.getUTCDate()
    ).padStart(2, "0");

  return (
    nextYear +
    "-" +
    nextMonth +
    "-" +
    nextDay
  );
}


// ======================================================
// GOOGLE HEALTH → TOTAL CALORIES → D1
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
        start: {
          date: {
            year: Number(today.split("-")[0]),
            month: Number(today.split("-")[1]),
            day: Number(today.split("-")[2])
          },
          time: {
            hours: 0,
            minutes: 0,
            seconds: 0,
            nanos: 0
          }
        },

        end: {
          date: {
            year: Number(tomorrow.split("-")[0]),
            month: Number(tomorrow.split("-")[1]),
            day: Number(tomorrow.split("-")[2])
          },
          time: {
            hours: 0,
            minutes: 0,
            seconds: 0,
            nanos: 0
          }
        }
      },

      windowSizeDays: 1,

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

    if (
      calories === null ||
      calories === undefined
    ) {
      return Response.json({
        status: "ok",
        date: today,
        source: "google-wearables",
        total_calories: null,
        saved_to_database: false,
        message:
          "No calorie data available"
      });
    }

    const externalId =
      "total-calories:" +
      today +
      ":google-wearables";

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
          "google-wearables",
          "total-calories",
          externalId,
          today,
          today + "T00:00:00",
          tomorrow + "T00:00:00",
          calories,
          "kcal",
          JSON.stringify(data)
        )
        .run();

    return Response.json({
      status: "ok",
      date: today,
      source: "google-wearables",
      total_calories: calories,
      unit: "kcal",
      saved_to_database: true,
      database_success:
        result.success
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
// GOOGLE HEALTH → SLEEP → D1
// ======================================================

async function getTodaySleep(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    const today =
      getPragueDate();

    const filter =
      'sleep.interval.civil_end_time >= "' +
      today +
      '"';

    const params =
      new URLSearchParams();

    params.set(
      "dataSourceFamily",
      "users/me/dataSourceFamilies/google-wearables"
    );

    params.set(
      "filter",
      filter
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

    const dataPoints =
      data.dataPoints || [];

    const saved =
      [];

    for (
      const point of dataPoints
    ) {
      if (
        !point.sleep ||
        !point.sleep.interval
      ) {
        continue;
      }

      const sleep =
        point.sleep;

      const interval =
        sleep.interval;

      const startTime =
        interval.startTime;

      const endTime =
        interval.endTime;

      if (
        !startTime ||
        !endTime
      ) {
        continue;
      }

      const start =
        new Date(startTime);

      const end =
        new Date(endTime);

      const durationMinutes =
        Math.round(
          (end.getTime() -
            start.getTime()) /
          60000
        );

      const externalId =
        point.name ||
        (
          "sleep:" +
          startTime +
          ":" +
          endTime
        );

      const sampleTime =
        endTime.substring(
          0,
          10
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
            "google-wearables",
            "sleep",
            externalId,
            sampleTime,
            startTime,
            endTime,
            durationMinutes,
            "minutes",
            JSON.stringify(point)
          )
          .run();

      saved.push({
        external_id:
          externalId,
        start_time:
          startTime,
        end_time:
          endTime,
        duration_minutes:
          durationMinutes,
        sleep_type:
          sleep.type,
        database_success:
          result.success
      });
    }

    return Response.json({
      status: "ok",
      date: today,
      source: "google-wearables",
      count: saved.length,
      saved_to_database: true,
      sleep: saved
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
// READ TODAY FROM D1
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
          "WHERE data_type = ? " +
          "AND sample_time = ? " +
          "ORDER BY id DESC"
        )
        .bind(
          "total-calories",
          today
        )
        .all();

    return Response.json({
      status: "ok",
      date: today,
      count:
        result.results.length,
      data:
        result.results
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
// GOOGLE HEALTH → WEIGHT → D1
// ======================================================

async function getLatestWeight(env) {
  try {
    const accessToken =
      await getGoogleAccessToken(env);

    const today =
      getPragueDate();

    const todayParts =
      today.split("-");

    const todayDate =
      new Date(
        Date.UTC(
          Number(todayParts[0]),
          Number(todayParts[1]) - 1,
          Number(todayParts[2])
        )
      );

    const startDate =
      new Date(todayDate);

    startDate.setUTCDate(
      startDate.getUTCDate() - 30
    );

    const startYear =
      startDate.getUTCFullYear();

    const startMonth =
      String(
        startDate.getUTCMonth() + 1
      ).padStart(2, "0");

    const startDay =
      String(
        startDate.getUTCDate()
      ).padStart(2, "0");

    const startDateString =
      startYear +
      "-" +
      startMonth +
      "-" +
      startDay;

    const endpoint =
      "https://health.googleapis.com/v4/users/me/" +
      "dataTypes/weight/dataPoints:reconcile";

    const params =
      new URLSearchParams();

    params.set(
      "dataSourceFamily",
      "users/me/dataSourceFamilies/google-sources"
    );

    params.set(
      "filter",
      'weight.sample_time.civil_time >= "' +
      startDateString +
      'T00:00:00"'
    );

    params.set(
      "pageSize",
      "100"
    );

    const url =
      endpoint +
      "?" +
      params.toString();

    const response =
      await fetch(
        url,
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

    const dataPoints =
      data.dataPoints || [];

    if (dataPoints.length === 0) {
      return Response.json({
        status: "ok",
        date: today,
        source: "google-sources",
        search_period_days: 30,
        weight: null,
        saved_to_database: false,
        message:
          "No weight data available in the last 30 days"
      });
    }

    const weights =
      [];

    for (
      const point of dataPoints
    ) {
      if (
        !point.weight ||
        point.weight.weightGrams === undefined
      ) {
        continue;
      }

      const grams =
        Number(
          point.weight.weightGrams
        );

      const kilograms =
        grams / 1000;

      let sampleTime =
        null;

      if (
        point.weight.sampleTime &&
        point.weight.sampleTime.physicalTime
      ) {
        sampleTime =
          point.weight.sampleTime.physicalTime;
      }

      if (
        !sampleTime &&
        point.weight.sampleTime &&
        point.weight.sampleTime.civilTime
      ) {
        const civil =
          point.weight.sampleTime.civilTime;

        if (
          civil.date
        ) {
          const year =
            civil.date.year;

          const month =
            String(
              civil.date.month
            ).padStart(2, "0");

          const day =
            String(
              civil.date.day
            ).padStart(2, "0");

          sampleTime =
            year +
            "-" +
            month +
            "-" +
            day;
        }
      }

      weights.push({
        point: point,
        grams: grams,
        kilograms: kilograms,
        sampleTime: sampleTime
      });
    }

    if (weights.length === 0) {
      return Response.json({
        status: "ok",
        date: today,
        source: "google-sources",
        search_period_days: 30,
        weight: null,
        saved_to_database: false,
        message:
          "Weight records found but could not be parsed"
      });
    }

    weights.sort(
      function (a, b) {
        return String(b.sampleTime)
          .localeCompare(
            String(a.sampleTime)
          );
      }
    );

    const latest =
      weights[0];

    const point =
      latest.point;

    const externalId =
      point.name ||
      (
        "weight:" +
        String(
          latest.sampleTime
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
          "value_numeric = excluded.value_numeric, " +
          "value_unit = excluded.value_unit, " +
          "payload_json = excluded.payload_json, " +
          "updated_at = CURRENT_TIMESTAMP"
        )
        .bind(
          "google-sources",
          "weight",
          externalId,
          latest.sampleTime,
          null,
          null,
          latest.kilograms,
          "kg",
          JSON.stringify(point)
        )
        .run();

    return Response.json({
      status: "ok",
      date: today,
      source: "google-sources",
      search_period_days: 30,
      records_found:
        weights.length,
      saved_to_database: true,
      weight: {
        external_id:
          externalId,

        sample_time:
          latest.sampleTime,

        weight_kg:
          latest.kilograms,

        weight_grams:
          latest.grams,

        database_success:
          result.success
      }
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
