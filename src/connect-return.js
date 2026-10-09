// Where the user lands after connecting a service on the provider's own page:
// back in the setup wizard when they started there, otherwise in Settings →
// Propojení. ?connected= tells the page what just happened (the page removes
// it from the address).
// The native app (?return=native) gets loadwise://connected, which closes its browser sheet.
const EVENTS = new Set(["google", "google-cancelled", "intervals", "intervals-cancelled", "intervals-failed"]);

export function connectReturn(request) {
  const back = new URL(request.url).searchParams.get("return");
  return back === "setup" || back === "native" ? back : "settings";
}

export function connectReturnUrl(back, event) {
  if (back === "native") return "loadwise://connected?event=" + (EVENTS.has(event) ? event : "unknown");
  const query = EVENTS.has(event) ? "?connected=" + event : "";
  return "/app" + query + (back === "setup" ? "#setup" : "#settings-connections");
}
