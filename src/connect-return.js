import { appOrigin, APP_CONNECTED_PATH } from "./app-origin.js";

// Where the user lands after connecting a service on the provider's own page:
// the iPhone app's browser sheet, which closes on https://<server>/auth/app/connected?event=….
// iOS hands that address only to the Aurin app (its associated domain), on the test server too.
// Builds from before 2026-11 wait for loadwise://connected instead; they start with
// no return: "https" when asking for a ticket (native-connect.js) and get that until
// they are gone; so does a new build that found no https return page on the server.
const EVENTS = new Set(["expired", "google", "google-cancelled", "intervals", "intervals-cancelled", "intervals-failed", "ultrahuman", "ultrahuman-cancelled", "ultrahuman-failed", "whoop", "whoop-cancelled", "whoop-failed", "wahoo", "wahoo-cancelled", "wahoo-failed"]);

// Only the iPhone app starts a connection, through its signed ticket, which sets this
// cookie on the way to the provider (native-connect.js): "native" for loadwise://, else
// https. A link cannot choose it; the OAuth state keeps it.
const RETURN_COOKIE = "aurin_connect_return";
export function connectReturn(request) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + RETURN_COOKIE + "=([^;]+)"));
  return m?.[1] === "native" ? "native" : "app";
}
export const connectReturnCookie = back => RETURN_COOKIE + "=" + (back === "native" ? "native" : "app") + "; Max-Age=600; Path=/oauth; Secure; HttpOnly; SameSite=Lax";

// The OAuth state cookie: the state, where to return and the user who started, so the
// callback stores the keys only for that user, even when the browser was signed in to
// another account in between. A fourth part is the PKCE verifier (Google Health, Intervals.icu).
export function oauthStateValue(state, request, env, verifier = "") {
  return encodeURIComponent(state + "." + connectReturn(request) + "." + String(env?.USER_ID ?? "") + (verifier ? "." + verifier : ""));
}

// PKCE (RFC 7636, S256): the code is worth nothing without the verifier kept in the
// HttpOnly state cookie, on top of the client secret. A provider without PKCE ignores both.
export function pkceVerifier() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function pkceChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

function base64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

// Whether the user signed in now is the one who started (the third part of the state cookie).
export function startedBy(uid, env) {
  return Boolean(uid) && uid === String(env?.USER_ID ?? "");
}

// Back on the server the connection started from (the test server too).
export function connectReturnUrl(back, event, env) {
  const query = "?event=" + (EVENTS.has(event) ? event : "unknown");
  return back === "native" ? "loadwise://connected" + query : appOrigin(env) + APP_CONNECTED_PATH + query;
}
