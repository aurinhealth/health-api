// Where the user lands after connecting a service on the provider's own page:
// the iPhone app, through loadwise://connected?event=…, which closes its browser sheet.
const EVENTS = new Set(["google", "google-cancelled", "intervals", "intervals-cancelled", "intervals-failed", "ultrahuman", "ultrahuman-cancelled", "ultrahuman-failed", "whoop", "whoop-cancelled", "whoop-failed", "wahoo", "wahoo-cancelled", "wahoo-failed"]);

// Only the iPhone app starts a connection (return=native); kept with the OAuth state.
export function connectReturn() {
  return "native";
}

// The OAuth state cookie: the state, where to return and the user who started, so the
// callback stores the keys only for that user, even when the browser was signed in to
// another account in between.
export function oauthStateValue(state, request, env) {
  return encodeURIComponent(state + "." + connectReturn(request) + "." + String(env?.USER_ID ?? ""));
}

// Whether the user signed in now is the one who started (the third part of the state cookie).
export function startedBy(uid, env) {
  return Boolean(uid) && uid === String(env?.USER_ID ?? "");
}

export function connectReturnUrl(back, event) {
  return "loadwise://connected?event=" + (EVENTS.has(event) ? event : "unknown");
}
