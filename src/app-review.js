// Apple App Review account. APP_REVIEW_EMAIL signs in with the fixed code
// APP_REVIEW_CODE (email-login.js) only until the end of APP_REVIEW_UNTIL
// (YYYY-MM-DD, UTC); without that date the fixed code is off. The account is a
// demo: it cannot connect third-party services (Google, Intervals.icu, Strava)
// or send anything to them, and its AI budget is a small fixed one. Apple
// Health upload and the rest of the app work as for anyone.
import { L } from "./lang.js";

export const REVIEW_AI_MONTHLY_LIMIT_USD = 0.5;

const normalized = value => String(value || "").trim().toLowerCase();

// The user whose e-mail is APP_REVIEW_EMAIL (never the owner). Without `user`,
// the signed-in user of a per-user env (tenancy.js sets USER_EMAIL).
export function isReviewAccount(env, user = null) {
  const review = normalized(env?.APP_REVIEW_EMAIL);
  if (!review) return false;
  if (user ? user.isOwner === true : env?.USER_IS_OWNER === true) return false;
  return normalized(user ? user.email : env?.USER_EMAIL) === review;
}

// Whether the fixed review code still works at `now`: up to the end of the
// APP_REVIEW_UNTIL day in UTC. A missing or malformed date fails closed.
export function reviewCodeActive(env, now = Date.now()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(env?.APP_REVIEW_UNTIL || "").trim());
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const end = Date.UTC(y, m - 1, d + 1);
  if (new Date(end - 1).getUTCDate() !== d) return false;
  return now < end;
}

// Starting a connection to a third-party service, or sending data out to one.
const CONNECT_PREFIXES = ["/oauth/google", "/oauth/intervals", "/oauth/strava"];
const OUTBOUND_POSTS = new Set(["/app/api/connect/start", "/app/api/connections", "/app/api/sync/activity", "/app/api/sync/retry", "/app/api/workouts/export", "/auth/app/connect"]);

export function reviewBlocked(method, pathname) {
  if (CONNECT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"))) return true;
  return method === "POST" && OUTBOUND_POSTS.has(pathname);
}

// The refusal for the review account, or null when the request may go on.
export function reviewRefusal(env, user, method, pathname) {
  if (!user || !isReviewAccount(env, user) || !reviewBlocked(method, pathname)) return null;
  return Response.json({
    status: "demo_account",
    message: L("Ukázkový účet nemůže připojovat další služby ani do nich posílat data.", "The demo account can't connect other services or send data to them.")
  }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
