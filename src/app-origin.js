// The server answers on aurin.health. OAuth redirects go back to it; APP_ORIGIN overrides the
// host (the test server, local runs).
export const SITE_ORIGIN = "https://aurin.health";
export const SERVER_HOSTS = new Set(["aurin.health"]);
// Where the iPhone app's browser sheet comes back after signing in with Google (google-login.js).
export const APP_RETURN_PATH = "/auth/app/return";
// … and after connecting a service on its own page (connect-return.js).
export const APP_CONNECTED_PATH = "/auth/app/connected";

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

// The Czech privacy policy and terms live at /cs/privacy and /cs/terms. ?lang= (older links and the
// app's) leads to the address of that language, and /cs to the home page, which is in English only.
export function languageRedirect(url, method = "GET") {
  if (method !== "GET" && method !== "HEAD") return null;
  const lang = url.searchParams.get("lang");
  if ((url.pathname === "/privacy" || url.pathname === "/terms") && lang) return Response.redirect(`${url.origin}${lang === "cs" ? "/cs" : ""}${url.pathname}`, 301);
  if (url.pathname === "/cs" || url.pathname === "/cs/" || (url.pathname === "/" && lang)) return Response.redirect(`${url.origin}/`, 301);
  return null;
}
