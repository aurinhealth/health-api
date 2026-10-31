// /.well-known/apple-app-site-association: the file iOS reads before it lets
// the iPhone app use the passkeys of the server's host (aurin.health) and catch
// the https address Google sign-in returns to (google-login.js, on the test
// server's host too). The webcredentials entry matches the app's
// associated-domains entitlement (ios-native/project.yml).
// APPLE_TEAM_ID is the Apple Developer team of the app (App Store Connect →
// Membership, ten characters). Without it the file is not served: the passkey
// buttons fall back to the e-mail sign-in and Google sign-in cannot return to
// the app, so the deploy fails without it (deploy-worker.yml).
export const APP_BUNDLE_ID = "health.aurin.app";
const PATH = "/.well-known/apple-app-site-association";

export function appleAppSiteAssociationBody(env = {}) {
  const team = String(env.APPLE_TEAM_ID || "").trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) return null;
  const apps = [team + "." + APP_BUNDLE_ID];
  // applinks: a shared workout's link (/t/<id>, workout-templates.js) opens
  // the app when it is installed (applinks:aurin.health in project.yml).
  return { webcredentials: { apps }, applinks: { details: [{ appIDs: apps, components: [{ "/": "/t/*", comment: "Shared workouts" }] }] } };
}

// The answer for the file, null for every other path.
export function appleAppSiteAssociation(request, env, pathname = new URL(request.url).pathname) {
  if (pathname !== PATH && pathname !== PATH + ".json") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const body = appleAppSiteAssociationBody(env);
  if (!body) return new Response("Not configured", { status: 404, headers: { "cache-control": "no-store" } });
  // Apple's CDN fetches it as JSON, with no redirect; an hour of cache is plenty.
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
}
