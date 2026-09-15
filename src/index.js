```javascript
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

    // Get today's total calories from Google Health
    // and save them to D1
    if (url.pathname === "/health/today") {
      return await getTodayCalories(env);
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


/**
 * Get a fresh Google OAuth access token
 * using the stored refresh token.
 */
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
      `Google OAuth error: ${data.error} ${
        data.error_description || ""
      }`
    );
  }

  return data.access_token;
}


/**
 * Test Google OAuth.
 *
 * IMPORTANT:
 * The actual access token is never returned to the browser.
 */
async function testGoogleAuth(env) {
  try {
    const accessToken = await getGoogleAccessToken(env);

    return Response.json({
      status: "ok",
      google_oauth: "working",
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


/**
 * Get today's date in Europe/Prague.
 */
function getPragueDate() {
  const now = new Date();

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}


/**
 * Get tomorrow's date in Europe/Prague.
 */
function getTomorrowPragueDate(today) {
  const tomorrowDate = new Date(
    `${today}T00:00:00+02:00`
  );

  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(tomorrowDate);
}


/**
 * Convert YYYY-MM-DD into Google Health date object.
 */
function googleDate(dateString) {
  const [year, month, day] = dateString
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


/**
 * Get today's total calories from Google Health
 * and save the result into D1.
 */
async function getTodayCalories(env) {
  try {
    // --------------------------------------------------
    // 1. Get Google access token
    // --------------------------------------------------

    const accessToken =
      await getGoogleAccessToken(env);


    // --------------------------------------------------
    // 2. Determine today's date
    // --------------------------------------------------

    const today = getPragueDate();
    const tomorrow =
      getTomorrowPragueDate(today);


    // --------------------------------------------------
    // 3. Google Health API request
    // --------------------------------------------------

    const endpoint =
      "https://health.googleapis.com/v4/users/me/" +
      "dataTypes/total-calories/" +
      "dataPoints:dailyRollUp";


    const body = {
      range: {
        start: googleDate(today),
        end: googleDate(tomorrow)
      },

      windowSizeDays: 1,

      dataSourceFamily:
        "users/me/dataSourceFamilies/google-wearables"
    };


    const response = await fetch(
      endpoint,
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(body)
      }
    );


    const data = await response.json();


    // --------------------------------------------------
    // 4. Handle Google API error
    // --------------------------------------------------

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


    // --------------------------------------------------
    // 5. Extract calories
    // --------------------------------------------------

    const calories =
      data
        .rollupDataPoints?.[0]
        ?.totalCalories
        ?.kcalSum ?? null;


    // --------------------------------------------------
    // 6. No calorie data available
    // --------------------------------------------------

    if (calories === null) {
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


    // --------------------------------------------------
    // 7. Create unique ID
    // --------------------------------------------------

    const externalId =
      `total-calories:${today}:google-wearables`;


    // --------------------------------------------------
    // 8. Save / update D1 record
    // --------------------------------------------------

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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT(
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
          updated_at = CURRENT_TIMESTAMP
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
    // 9. Return result
    // --------------------------------------------------

    return Response.json({
      status: "ok",
      date: today,
      source: "google-wearables",
      total_calories: calories,
      unit: "kcal",
      saved_to_database: true
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
```
