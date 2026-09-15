javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --------------------------------------------------
    // Basic health check
    // --------------------------------------------------

    if (url.pathname === "/") {
      return Response.json({
        status: "ok",
        service: "health-api"
      });
    }

    // --------------------------------------------------
    // Google OAuth test
    // --------------------------------------------------

    if (url.pathname === "/auth-test") {
      return await testGoogleAuth(env);
    }

    // --------------------------------------------------
    // Get today's calories from Google Health
    // and save them to D1
    // --------------------------------------------------

    if (url.pathname === "/health/today") {
      return await getTodayCalories(env);
    }

    // --------------------------------------------------
    // Read today's calories from D1
    // --------------------------------------------------

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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Google OAuth error: ${data.error} ${
        data.error_description || ""
      }`
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
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(new Date());
}


function getTomorrowPragueDate(today) {
  const date =
    new Date(
      `${today}T00:00:00+02:00`
    );

  date.setDate(
    date.getDate() + 1
  );

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(date);
}


function googleDate(dateString) {
  const [
    year,
    month,
    day
  ] = dateString
    .split("-")
    .map(Number);

  return {
    date: {
      year,
      month,
      day
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

    // --------------------------------------------------
    // 1. Google access token
    // --------------------------------------------------

    const accessToken =
      await getGoogleAccessToken(env);


    // --------------------------------------------------
    // 2. Dates
    // --------------------------------------------------

    const today =
      getPragueDate();

    const tomorrow =
      getTomorrowPragueDate(today);


    // --------------------------------------------------
    // 3. Google Health endpoint
    // --------------------------------------------------

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

      windowSizeDays: 1,

      dataSourceFamily:
        "users/me/dataSourceFamilies/google-wearables"
    };


    // --------------------------------------------------
    // 4. Call Google Health
    // --------------------------------------------------

    const response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(body)
        }
      );


    const data =
      await response.json();


    // --------------------------------------------------
    // 5. Google API error
    // --------------------------------------------------

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


    // --------------------------------------------------
    // 6. Extract calories
    // --------------------------------------------------

    const rollup =
      data.rollupDataPoints?.[0];


    const calories =
      rollup
        ?.totalCalories
        ?.kcalSum ?? null;


    // --------------------------------------------------
    // 7. No data
    // --------------------------------------------------

    if (calories === null) {
      return Response.json({
        status: "ok",
        date: today,
        source:
          "google-wearables",

        total_calories:
          null,

        saved_to_database:
          false,

        message:
          "No calorie data available"
      });
    }


    // --------------------------------------------------
    // 8. Unique ID
    // --------------------------------------------------

    const externalId =
      `total-calories:${today}:google-wearables`;


    // --------------------------------------------------
    // 9. Save to D1
    // --------------------------------------------------

    const result =
      await env.DB
        .prepare(`
          INSERT INTO health_datapoints (
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

          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
          )

          ON CONFLICT(
            source_family,
            data_type,
            external_id
          )

          DO UPDATE SET
            sample_time =
              excluded.sample_time,

            start_time =
              excluded.start_time,

            end_time =
              excluded.end_time,

            value_numeric =
              excluded.value_numeric,

            value_unit =
              excluded.value_unit,

            payload_json =
              excluded.payload_json,

            updated_at =
              CURRENT_TIMESTAMP
        `)

        .bind(
          "google-wearables",
          "total-calories",
          externalId,

          today,

          `${today}T00:00:00+02:00`,

          `${tomorrow}T00:00:00+02:00`,

          calories,

          "kcal",

          JSON.stringify(data)
        )

        .run();


    // --------------------------------------------------
    // 10. Return result
    // --------------------------------------------------

    return Response.json({
      status: "ok",

      date: today,

      source:
        "google-wearables",

      total_calories:
        calories,

      unit:
        "kcal",

      saved_to_database:
        true,

      database_success:
        result.success
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
// READ TODAY FROM D1
// ======================================================

async function getTodayFromDatabase(env) {
  try {

    const today =
      getPragueDate();


    const result =
      await env.DB
        .prepare(`
          SELECT
            id,
            source_family,
            data_type,
            external_id,
            sample_time,
            start_time,
            end_time,
            value_numeric,
            value_unit,
            created_at,
            updated_at
          FROM health_datapoints
          WHERE data_type = ?
            AND sample_time = ?
          ORDER BY id DESC
        `)

        .bind(
          "total-calories",
          today
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
```
