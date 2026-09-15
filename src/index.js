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

    // Get today's calories from Google Health and save to D1
    if (url.pathname === "/health/today") {
      return await getTodayCalories(env);
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
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token"
      })
    }
  );

  const data = await response.json();

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
    const accessToken = await getGoogleAccessToken(env);

    return Response.json({
      status: "ok",
      google_oauth: "working",
      token_type: "Bearer",
      has_access_token: Boolean(accessToken)
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
    function (part) {
      return part.type === "year";
    }
  ).value;

  const month = parts.find(
    function (part) {
      return part.type === "month";
    }
  ).value;

  const day = parts.find(
    function (part) {
      return part.type === "day";
    }
  ).value;

  return year + "-" + month + "-" + day;
}


function getTomorrowDate(dateString) {
  const parts = dateString.split("-");

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  const date = new Date(
    Date.UTC(year, month - 1, day + 1)
  );

  const nextYear = date.getUTCFullYear();

  const nextMonth = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  const nextDay = String(
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


function googleDate(dateString) {
  const parts = dateString.split("-");

  return {
    date: {
      year: Number(parts[0]),
      month: Number(parts[1]),
      day: Number(parts[2])
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
// GOOGLE HEALTH → TOTAL CALORIES → D1
// ======================================================

async function getTodayCalories(env) {
  try {
    // 1. Get Google access token
    const accessToken =
      await getGoogleAccessToken(env);

    // 2. Get dates
    const today =
      getPragueDate();

    const tomorrow =
      getTomorrowDate(today);

    // 3. Google Health endpoint
    const endpoint =
      "https://health.googleapis.com/v4/users/me/" +
      "dataTypes/total-calories/" +
      "dataPoints:dailyRollUp";

    // 4. Request body
    const body = {
      range: {
        start: googleDate(today),
        end: googleDate(tomorrow)
      },

      windowSizeDays: 1,

      dataSourceFamily:
        "users/me/dataSourceFamilies/google-wearables"
    };

    // 5. Call Google Health
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

    // 6. Google API error
    if (!response.ok) {
      return Response.json(
        {
          status: "error",
          google_status: response.status,
          google_response: data
        },
        { status: 500 }
      );
    }

    // 7. Extract calories
    const rollup =
      data.rollupDataPoints &&
      data.rollupDataPoints[0];

    const calories =
      rollup &&
      rollup.totalCalories &&
      rollup.totalCalories.kcalSum;

    // 8. No data
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
        message: "No calorie data available"
      });
    }

    // 9. Unique ID
    const externalId =
      "total-calories:" +
      today +
      ":google-wearables";

    // 10. Save to D1
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

    // 11. Return result
    return Response.json({
      status: "ok",
      date: today,
      source: "google-wearables",
      total_calories: calories,
      unit: "kcal",
      saved_to_database: true,
      database_success: result.success
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
      count: result.results.length,
      data: result.results
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
