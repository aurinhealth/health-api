// The server answers on aurin.health and on petrfitnessdata.eu, where older app builds and links
// still go. OAuth redirects stay on the host the request came to: a sign-in or connection that
// starts on one host ends there, because its state cookie lives on that host. Google, Intervals.icu
// list the callbacks of both hosts. APP_ORIGIN overrides the host (local runs).
export const SITE_ORIGIN = "https://aurin.health";
export const LEGACY_ORIGIN = "https://petrfitnessdata.eu";
export const SERVER_HOSTS = new Set(["aurin.health", "petrfitnessdata.eu"]);

export function appOrigin(env, request) {
  if (env?.APP_ORIGIN) return env.APP_ORIGIN;
  const host = request ? new URL(request.url).hostname : "";
  return SERVER_HOSTS.has(host) ? `https://${host}` : LEGACY_ORIGIN;
}

// www.aurin.health is only an alias of the site's home.
export function wwwRedirect(url) {
  return url.hostname === "www.aurin.health" ? Response.redirect(SITE_ORIGIN + url.pathname + url.search, 301) : null;
}
