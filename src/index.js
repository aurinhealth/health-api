export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        status: "ok",
        service: "health-api"
      });
    }

    if (url.pathname === "/auth-test") {
      return await testGoogleAuth(env);
    }

    if (url.pathname === "/health/today") {
      return await getTodayCalories(env);
    }

    return Response.json(
      { error: "Not found" },
      { status: 404 }
    );
  }
};


async function getGoogleAccessToken(env) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
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
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Google OAuth error: ${data.error} ${data.error_description || ""}`
    );
  }

  return data.access_token;
}


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


async function getTodayCalories(env) {
  try {
    const accessToken = await getGoogleAccessToken(env);

    // Today's date in Europe/Prague
    const now = new Date();

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const today = formatter.format(now);

    const [year, month, day] = today.split("-").map(Number);

    const startTime = `${today}T00:00:00+02:00`;

    const tomorrowDate = new Date(
      new Date(`${today}T00:00:00+02:00`).getTime() +
      24 * 60 * 60 * 1000
    );

    const tomorrow = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(tomorrowDate);

    const endTime = `${tomorrow}T00:00:00+02:00`;

    const endpoint =
      "https://health.googleapis.com/v4/users/me/dataTypes/total-calories/dataPoints:dailyRollUp";

    const body = {
      range: {
        start: {
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

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

    return Response.json({
      status: "ok",
      date: today,
      source: "google-wearables",
      total_calories: data
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
