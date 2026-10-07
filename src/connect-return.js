// Where the user lands after connecting a service on the provider's own page:
// back in the setup wizard when they started there, otherwise in Settings →
// Propojení. ?connected= tells the page what just happened (the page removes
// it from the address).
const EVENTS = new Set(["google", "google-cancelled", "intervals", "intervals-cancelled", "intervals-failed"]);

export function connectReturn(request) {
  return new URL(request.url).searchParams.get("return") === "setup" ? "setup" : "settings";
}

export function connectReturnUrl(back, event) {
  const query = EVENTS.has(event) ? "?connected=" + event : "";
  return "/app" + query + (back === "setup" ? "#setup" : "#settings-connections");
}
