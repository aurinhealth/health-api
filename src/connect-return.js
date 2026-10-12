// Where the user lands after connecting a service on the provider's own page:
// the iPhone app, through loadwise://connected?event=…, which closes its browser sheet.
const EVENTS = new Set(["google", "google-cancelled", "intervals", "intervals-cancelled", "intervals-failed", "strava", "strava-cancelled", "strava-failed", "strava-full"]);

// Only the iPhone app starts a connection (return=native); kept with the OAuth state.
export function connectReturn() {
  return "native";
}

export function connectReturnUrl(back, event) {
  return "loadwise://connected?event=" + (EVENTS.has(event) ? event : "unknown");
}
