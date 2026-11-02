// The native iPhone app (ios-native/) sends X-Aurin-Api with every request:
// the version of this server's API it was built for (APIClient.apiLevel).
// Builds from before 2026-11 send it as X-Loadwise-Api, still read here.
// A change that an installed app cannot read (a renamed or removed field, a
// changed meaning) raises MIN_APP_API here and apiLevel in the app in the same
// pull request. Older apps then get 426 and show "Nainstaluj novější verzi"
// instead of failing at random. Requests without the header (the web, scripts,
// GitHub Actions) are not checked.
export const MIN_APP_API = 1;
export const APP_API_HEADER = "X-Aurin-Api";
const OLD_APP_API_HEADER = "X-Loadwise-Api";

// The API level the app sent, or null for a request that is not from the app.
export function appApiLevel(request) {
  return request.headers.get(APP_API_HEADER) ?? request.headers.get(OLD_APP_API_HEADER);
}

export function appUpdateRequired(request) {
  const sent = appApiLevel(request);
  if (sent === null) return null;
  const level = /^\d+$/.test(sent.trim()) ? Number(sent.trim()) : 0;
  if (level >= MIN_APP_API) return null;
  const english = String(request.headers.get("X-Interface-Language") || "").toLowerCase().startsWith("en");
  return Response.json({
    status: "update_required",
    minApi: MIN_APP_API,
    message: english
      ? "This version of Aurin is no longer supported. Install a newer version."
      : "Tahle verze Aurinu už není podporovaná. Nainstaluj novější verzi."
  }, { status: 426, headers: { "Cache-Control": "no-store" } });
}
