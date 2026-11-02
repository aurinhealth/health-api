import { appOrigin, APP_CONNECTED_PATH } from "./app-origin.js";

// Where the user lands after connecting a service on the provider's own page:
// the iPhone app's browser sheet, which closes on https://<server>/auth/app/connected?event=….
// iOS hands that address only to the Aurin app (its associated domain), on the test server too.
const EVENTS = new Set(["expired", "google", "google-cancelled", "intervals", "intervals-cancelled", "intervals-failed", "ultrahuman", "ultrahuman-cancelled", "ultrahuman-failed", "whoop", "whoop-cancelled", "whoop-failed", "wahoo", "wahoo-cancelled", "wahoo-failed"]);

// The OAuth state cookie: the state and the user who started, so the callback stores
// the keys only for that user, even when the browser was signed in to another account
// in between. A third part is the PKCE verifier (Google Health, Intervals.icu).
export function oauthStateValue(state, env, verifier = "") {
  return encodeURIComponent(state + "." + String(env?.USER_ID ?? "") + (verifier ? "." + verifier : ""));
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
export function connectReturnUrl(event, env) {
  return appOrigin(env) + APP_CONNECTED_PATH + "?event=" + (EVENTS.has(event) ? event : "unknown");
}
