// The native iPhone app (ios-native/) sends X-Loadwise-Api with every request:
// the version of this server's API it was built for (APIClient.apiLevel).
// A change that an installed app cannot read (a renamed or removed field, a
// changed meaning) raises MIN_APP_API here and apiLevel in the app in the same
// pull request. Older apps then get 426 and show "Nainstaluj novou verzi"
// instead of failing at random. Requests without the header (the web, scripts,
// GitHub Actions) are not checked.
export const MIN_APP_API = 1;
export const APP_API_HEADER = "X-Loadwise-Api";

export function appUpdateRequired(request) {
  const sent = request.headers.get(APP_API_HEADER);
  if (sent === null) return null;
  const level = /^\d+$/.test(sent.trim()) ? Number(sent.trim()) : 0;
  if (level >= MIN_APP_API) return null;
  const english = String(request.headers.get("X-Interface-Language") || "").toLowerCase().startsWith("en");
  return Response.json({
    status: "update_required",
    minApi: MIN_APP_API,
    message: english
      ? "This version of the app is out of date. Install the new one."
      : "Tahle verze aplikace je zastaralá. Nainstaluj novou."
  }, { status: 426, headers: { "Cache-Control": "no-store" } });
}
