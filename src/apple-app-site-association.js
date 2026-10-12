// /.well-known/apple-app-site-association: the file iOS reads before it lets
// the iPhone app use the passkeys of petrfitnessdata.eu. The webcredentials
// entry matches the app's associated-domains entitlement
// (ios-native/project.yml: webcredentials:petrfitnessdata.eu).
// APPLE_TEAM_ID is the Apple Developer team of the app (App Store Connect →
// Membership, ten characters); without it the file is not served and the
// app's passkey buttons fall back to the e-mail sign-in.
export const APP_BUNDLE_ID = "eu.petrfitnessdata.loadwise.native";
const PATH = "/.well-known/apple-app-site-association";

export function appleAppSiteAssociationBody(env = {}) {
  const team = String(env.APPLE_TEAM_ID || "").trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) return null;
  return { webcredentials: { apps: [team + "." + APP_BUNDLE_ID] } };
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
