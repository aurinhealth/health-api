// Where the user lands after connecting a service on the provider's own page:
// the iPhone app, through loadwise://connected?event=…, which closes its browser sheet.
const EVENTS = new Set(["google", "google-cancelled", "intervals", "intervals-cancelled", "intervals-failed", "ultrahuman", "ultrahuman-cancelled", "ultrahuman-failed", "whoop", "whoop-cancelled", "whoop-failed", "wahoo", "wahoo-cancelled", "wahoo-failed"]);

// Only the iPhone app starts a connection (return=native); kept with the OAuth state.
export function connectReturn() {
  return "native";
}

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

export function connectReturnUrl(back, event) {
  return "loadwise://connected?event=" + (EVENTS.has(event) ? event : "unknown");
}
