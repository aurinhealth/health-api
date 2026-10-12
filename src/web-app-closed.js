// Loadwise lives in the iPhone app (ios-native/), which sends X-Loadwise-Api with
// every request. A browser cannot sign in, and a session cookie it still holds
// cannot read or change anything; the old web address /app leads to the
// overview page.
// Still open: the public pages, the browser sheets the iPhone app opens to sign
// in with Google (/auth/google?app=…) and to connect Google Health or
// Intervals.icu (/auth/app/connect, /oauth/…), the owner's API key, GitHub
// Actions and the cron jobs.
import { APP_API_HEADER } from "./app-version.js";
import { verifyDashboardSession, sessionSecret } from "./dashboard-auth.js";
import { APP_CHALLENGE } from "./google-login.js";
import { siteLang } from "./site-pages.js";

const OPEN_PATHS = new Set([
  "/",
  "/privacy",
  "/terms",
  "/support",
  "/logo.svg",
  "/app/logout",
  "/auth/google/callback",
  "/auth/app/connect"
]);
// /t/<id>: a workout shared with a link (workout-templates.js).
const OPEN_PREFIXES = ["/oauth/", "/.well-known/", "/t/"];

export function webAppClosed(app) {
  return {
    scheduled: (controller, env, ctx) => app.scheduled(controller, env, ctx),
    async fetch(request, env, ctx) {
      return await closedToBrowser(request, env) || app.fetch(request, env, ctx);
    }
  };
}

// The answer for a browser request that is refused; null lets it through.
export async function closedToBrowser(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (path === "/app" || path === "/app/") return new Response(null, { status: 301, headers: { Location: "/", "Cache-Control": "public, max-age=3600" } });
  if (request.headers.has(APP_API_HEADER)) return null;
  if (path === "/auth/google") return APP_CHALLENGE.test(url.searchParams.get("app") || "") ? null : closed(request);
  if (OPEN_PATHS.has(path) || OPEN_PREFIXES.some(prefix => path.startsWith(prefix))) return null;
  // Passkeys, e-mail codes and Sign in with Apple in the browser.
  if (path.startsWith("/auth/")) return closed(request);
  // Anything else with the browser's session; the API key and anonymous requests carry on.
  if (await verifyDashboardSession(request, sessionSecret(env))) return closed(request);
  return null;
}

function closed(request) {
  if (request.method === "GET" || request.method === "HEAD") return new Response(null, { status: 302, headers: { Location: "/", "Cache-Control": "no-store" } });
  const message = siteLang(request) === "en"
    ? "Loadwise runs only in the iPhone app."
    : "Loadwise běží jen v aplikaci pro iPhone.";
  return Response.json({ status: "web_app_closed", message }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
