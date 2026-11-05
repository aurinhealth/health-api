// How often one signed-in account may call the app's API (security check
// 2026-11-04, N2). Sign-up is open, so anyone can make an account and script
// requests at the heavy screens (the coach card reads ~420 rows) or the
// provider syncs (Intervals.icu, Wahoo quotas). Counted by Cloudflare's
// Workers Rate Limiting bindings (wrangler.jsonc "ratelimits"), per account,
// in each Cloudflare location: no D1 read, well under a millisecond.
//
// - API_RATE_LIMITER: every /app/api/* request of the account, 300 a minute.
//   The app opening Today sends about 30; a person never comes near it.
// - SYNC_RATE_LIMITER: a sync from the providers started by hand
//   (POST /app/api/sync, /app/api/sync/recent), 20 a minute.
//
// - APPLE_RATE_LIMITER: Apple Health uploads (POST /app/api/health/apple),
//   300 a minute in a bucket of their own. A first import sends its history in
//   many requests one after another (each limited to 4 MB, apple-health.js),
//   so it must not eat the API limit, but each changed upload also starts
//   matching, suggestions and the morning push, so it is not unlimited.
//
// A missing binding (tests, a local run) or a failing one lets the request
// through: the limit protects costs, it must never stop the app. A missing
// binding is logged once per isolate, so a lost configuration shows.
import { L } from "./lang.js";

const MANUAL_SYNC = new Set(["/app/api/sync", "/app/api/sync/recent"]);

export function limiterFor(pathname, method) {
  const path = String(pathname || "");
  if (!path.startsWith("/app/api/")) return null;
  if (method === "POST" && path === "/app/api/health/apple") return "APPLE_RATE_LIMITER";
  if (method === "POST" && MANUAL_SYNC.has(path)) return "SYNC_RATE_LIMITER";
  return "API_RATE_LIMITER";
}

const missingLogged = new Set();
async function allowed(binding, key, name) {
  if (!binding?.limit) {
    if (!missingLogged.has(name)) { missingLogged.add(name); console.warn("Rate limiter binding missing:", name); }
    return true;
  }
  try { return (await binding.limit({ key })).success !== false; }
  catch (error) { console.warn("Rate limiter unavailable", error?.message); return true; }
}

// null when the request may go on, otherwise the 429 answer.
export async function accountRateLimit(request, env, userId) {
  const url = new URL(request.url);
  const name = limiterFor(url.pathname, request.method);
  if (!name || !Number.isInteger(Number(userId)) || Number(userId) <= 0) return null;
  const key = "user:" + Number(userId);
  // A manual sync counts against both limits.
  if (name === "SYNC_RATE_LIMITER" && !(await allowed(env.SYNC_RATE_LIMITER, key, name))) return tooMany();
  if (name === "APPLE_RATE_LIMITER") return (await allowed(env.APPLE_RATE_LIMITER, key, name)) ? null : tooMany();
  if (!(await allowed(env.API_RATE_LIMITER, key, "API_RATE_LIMITER"))) return tooMany();
  return null;
}

function tooMany() {
  return Response.json(
    { status: "error", message: L("Příliš mnoho požadavků. Zkus to za minutu.", "Too many requests. Try again in a minute.") },
    { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
  );
}
