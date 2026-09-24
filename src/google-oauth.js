const GOOGLE_OAUTH_ORIGIN = "https://petrfitnessdata.eu";
const GOOGLE_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.writeonly"
];

export async function handleGoogleOAuth(request, env, pathname) {
  if (request.method !== "GET") return null;

  const flows = {
    "/oauth/google": {
      callback: "/oauth/google/callback",
      stateCookie: "pfd_google_oauth_state",
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scopes: GOOGLE_SHEETS_SCOPES,
      secretName: "GOOGLE_REFRESH_TOKEN",
      label: "Google Sheets"
    },
    "/oauth/google-health": {
      callback: "/oauth/google-health/callback",
      stateCookie: "pfd_google_health_oauth_state",
      clientId: env.GOOGLE_HEALTH_CLIENT_ID || env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_HEALTH_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
      scopes: GOOGLE_HEALTH_SCOPES,
      secretName: "GOOGLE_HEALTH_REFRESH_TOKEN",
      label: "Google Health"
    }
  };

  const startFlow = flows[pathname];
  if (startFlow) {
    if (!startFlow.clientId || !startFlow.clientSecret) {
      return html(startFlow.label + " OAuth not configured", "The required Google OAuth client configuration is missing.", 503);
    }

    const state = crypto.randomUUID();
    const redirectUri = GOOGLE_OAUTH_ORIGIN + startFlow.callback;
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", startFlow.clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", startFlow.scopes.join(" "));
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("state", state);

    return new Response(null, {
      status: 302,
      headers: {
        Location: u.toString(),
        "Set-Cookie": startFlow.stateCookie + "=" + encodeURIComponent(state) +
          "; Max-Age=600; Path=" + startFlow.callback.replace("/callback", "") +
          "; Secure; HttpOnly; SameSite=Lax"
      }
    });
  }

  const callback = Object.values(flows).find(flow => flow.callback === pathname);
  if (!callback) return null;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.split(";").map(x => x.trim()).find(x => x.startsWith(callback.stateCookie + "="));

  if (url.searchParams.get("error")) {
    return html(callback.label + " OAuth cancelled", esc(url.searchParams.get("error")), 400);
  }

  if (!code || !state || !m || decodeURIComponent(m.slice(callback.stateCookie.length + 1)) !== state) {
    return html(callback.label + " OAuth failed", "Invalid or missing OAuth state. Start again from " + callback.callback.replace("/callback", "") + ".", 400);
  }

  const redirectUri = GOOGLE_OAUTH_ORIGIN + callback.callback;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({
      code,
      client_id: callback.clientId,
      client_secret: callback.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const data = await response.json();

  if (!response.ok || !data.refresh_token) {
    return html(callback.label + " OAuth token exchange failed", "Google did not return a refresh token. Response: " + esc(JSON.stringify(data)), 502);
  }

  const body =
    "<p>Google returned a new refresh token for <strong>" + esc(callback.label) + "</strong>.</p>" +
    "<p><strong>Do not share this token in chat or email.</strong></p>" +
    "<p>Copy it into the Cloudflare Worker secret <code>" + esc(callback.secretName) + "</code>.</p>" +
    "<textarea style=\"width:100%;min-height:110px;font-family:monospace\" readonly>" + esc(data.refresh_token) + "</textarea>" +
    "<p>After replacing the secret, the Worker will automatically obtain short-lived access tokens when needed.</p>" +
    "<p><strong>Granted scopes:</strong> " + esc(data.scope || callback.scopes.join(" ")) + "</p>";

  return html(callback.label + " OAuth completed", body, 200);
}

function html(title, body, status) {
  return new Response(
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Petr Fitness Data</title></head>" +
    "<body style=\"font-family:system-ui;max-width:760px;margin:50px auto;padding:24px;line-height:1.5\"><h1>" +
    esc(title) + "</h1>" + body + "</body></html>",
    {status: status || 200, headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "Referrer-Policy": "no-referrer"
    }}
  );
}

function esc(value) {
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\"","&quot;");
}
