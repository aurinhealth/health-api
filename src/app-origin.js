// The server answers on aurin.health. OAuth redirects go back to it; APP_ORIGIN overrides the
// host (the test server, local runs).
export const SITE_ORIGIN = "https://aurin.health";
export const SERVER_HOSTS = new Set(["aurin.health"]);

export function appOrigin(env, request) {
  if (env?.APP_ORIGIN) return env.APP_ORIGIN;
  return SITE_ORIGIN;
}

// www.aurin.health is only an alias of the site's home, and petrfitnessdata.eu, the old address,
// sends everything there until the domain is gone (308 keeps the method and body of a POST).
const ALIASES = new Set(["www.aurin.health", "petrfitnessdata.eu", "www.petrfitnessdata.eu"]);
export function wwwRedirect(url, method = "GET") {
  if (!ALIASES.has(url.hostname)) return null;
  return Response.redirect(SITE_ORIGIN + url.pathname + url.search, method === "GET" || method === "HEAD" ? 301 : 308);
}
