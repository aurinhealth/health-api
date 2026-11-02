// Routes that only the old web dashboard called. The iPhone app (ios-native/)
// calls none of them, so a signed-in user other than the owner gets 404 there.
// The owner (in the app) and the deploy smoke test (GitHub Actions) keep them: the
// deploy smoke checks read /app/api/daily, /app/api/sleep, /app/api/activities
// and /health/nutrition. Calls made inside the Worker (handleDashboardApi,
// legacyHealthApi.fetch) do not pass through this check.
import { L } from "./lang.js";

const OWNER_ONLY_API_PATHS = new Set([
  "/app/api/activities",
  "/app/api/daily",
  "/app/api/fitness",
  // A page of the owner's printed cookbook (cookbook.js).
  "/app/api/food/recipe",
  "/app/api/me/apple",
  "/app/api/nutrition",
  "/app/api/nutrition/log",
  "/app/api/sleep",
  "/app/api/training-profile/estimate",
  "/app/api/week"
]);

// The original API (index.js, strength-gateway.js): Google Health and
// Intervals.icu syncs, analysis, the cookbook and the old food diary.
const OWNER_ONLY_PREFIXES = ["/analysis/", "/cookbook/", "/food/", "/health/", "/strength/", "/sync/"];

export function ownerOnlyPath(pathname) {
  const path = String(pathname || "");
  return OWNER_ONLY_API_PATHS.has(path) || OWNER_ONLY_PREFIXES.some(prefix => path.startsWith(prefix));
}

// The refusal for a signed-in user who is not the owner; null lets the request through.
export function ownerOnlyRefusal(pathname, { signedIn, user } = {}) {
  if (!signedIn || user?.isOwner === true || !ownerOnlyPath(pathname)) return null;
  return Response.json({ status: "error", message: L("Nenalezeno.", "Not found.") }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
