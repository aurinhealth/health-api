// "Připojit Intervals.icu" with one button: Intervals.icu OAuth instead of
// copying a personal API key. It needs an app registered with Intervals.icu
// (secrets INTERVALS_CLIENT_ID and INTERVALS_CLIENT_SECRET); until then the
// API key form is the way to connect. The access token never expires; a new
// authorization replaces it.
import { saveConnectionSecret } from "./connection-secrets.js";
import { INTERVALS_TOKEN_PREFIX } from "./intervals-auth.js";
import { connectReturn, connectReturnUrl } from "./connect-return.js";

const ORIGIN = "https://petrfitnessdata.eu";
const STATE_COOKIE = "pfd_intervals_oauth_state";
// What the app reads and writes: activities (RPE on a ride), wellness (weight,
// sleep, HRV), the calendar (planned workouts, gym, nutrition notes) and the
// athlete settings (FTP, zones; written back from Nastavení → Tréninkové zóny,
// intervals-zones.js). Intervals.icu joins scopes with commas.
export const INTERVALS_SCOPES = ["ACTIVITY:WRITE", "WELLNESS:WRITE", "CALENDAR:WRITE", "SETTINGS:WRITE"];

export function intervalsOAuthConfigured(env) {
  return Boolean(String(env.INTERVALS_CLIENT_ID || "").trim() && String(env.INTERVALS_CLIENT_SECRET || "").trim());
}

const redirectUri = env => (env.APP_ORIGIN || ORIGIN) + "/oauth/intervals/callback";
const clearState = STATE_COOKIE + "=; Path=/oauth/intervals; Max-Age=0; Secure; HttpOnly; SameSite=Lax";
const back = (location, cookie = clearState) => new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": cookie, "Cache-Control": "no-store" } });

export async function handleIntervalsOAuth(request, env, pathname, fetchImpl = fetch) {
  if (pathname === "/oauth/intervals" && request.method === "GET") {
    if (!intervalsOAuthConfigured(env)) return back(connectReturnUrl(connectReturn(request), "intervals-failed"));
    const state = crypto.randomUUID();
    const u = new URL("https://intervals.icu/oauth/authorize");
    u.searchParams.set("client_id", String(env.INTERVALS_CLIENT_ID).trim());
    u.searchParams.set("redirect_uri", redirectUri(env));
    u.searchParams.set("scope", INTERVALS_SCOPES.join(","));
    u.searchParams.set("state", state);
    return back(u.toString(), STATE_COOKIE + "=" + encodeURIComponent(state + "." + connectReturn(request)) + "; Max-Age=600; Path=/oauth/intervals; Secure; HttpOnly; SameSite=Lax");
  }
  if (pathname !== "/oauth/intervals/callback" || request.method !== "GET") return null;
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + STATE_COOKIE + "=([^;]+)"));
  const [expected, to] = decodeURIComponent(m?.[1] || "").split(".");
  if (!state || state !== expected) return back(connectReturnUrl("settings", "intervals-failed"));
  if (url.searchParams.get("error") || !code) return back(connectReturnUrl(to, "intervals-cancelled"));
  if (!intervalsOAuthConfigured(env)) return back(connectReturnUrl(to, "intervals-failed"));
  const response = await fetchImpl("https://intervals.icu/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: String(env.INTERVALS_CLIENT_ID).trim(), client_secret: String(env.INTERVALS_CLIENT_SECRET).trim(), code, redirect_uri: redirectUri(env) })
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok || !data.access_token) {
    console.error("Intervals.icu OAuth token exchange failed", response?.status ?? "network");
    return back(connectReturnUrl(to, "intervals-failed"));
  }
  await saveConnectionSecret(env, "intervals", INTERVALS_TOKEN_PREFIX + data.access_token);
  return back(connectReturnUrl(to, "intervals"));
}
