import { signText, userSessionCookie, sessionSecret, sessionEpochOf, timingSafeEqualString } from "./dashboard-auth.js";
import { ensureTenancy, signInGoogleUser } from "./tenancy.js";
import { appOrigin } from "./app-origin.js";
import { L } from "./lang.js";

// "Sign in with Google" for the iPhone app. Only identity scopes are requested;
// health data access stays in the separate /oauth/google connector flow.
export function googleLoginRedirectUri(env, request) {
  return appOrigin(env, request) + "/auth/google/callback";
}
const STATE_COOKIE = "pfd_google_login";
const STATE_SECONDS = 600;
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

// The iPhone app (ios-native/) signs in through Safari: Google refuses
// embedded browsers. It opens /auth/google?app=<challenge> in Safari;
// the callback sends Safari back to loadwise://auth with a short-lived token,
// and the app trades that token plus the verifier behind the challenge for
// its own session at /auth/app/session. Another app grabbing the loadwise://
// link gets nothing without the verifier. A token works once, and only while
// the user's session epoch is the one it was issued under, so "sign out
// everywhere" also ends a token not yet traded.
const APP_RETURN_URL = "loadwise://auth";
const APP_HANDOFF_SECONDS = 300;
export const APP_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

let cachedJwks = null;
let cachedJwksAt = 0;
let forcedJwksAt = 0;

export async function handleGoogleLogin(request, env, pathname) {
  if (pathname === "/auth/google" && request.method === "GET") return startLogin(googleClientEnv(env), request);
  if (pathname === "/auth/google/callback" && request.method === "GET") return finishLogin(request, googleClientEnv(env));
  if (pathname === "/auth/app/session" && request.method === "POST") return finishAppLogin(request, googleClientEnv(env));
  return null;
}

// Values pasted into the Cloudflare dashboard easily pick up a stray space,
// which Google answers with "OAuth client was not found".
function googleClientEnv(env) {
  return { ...env, GOOGLE_CLIENT_ID: String(env.GOOGLE_CLIENT_ID || "").trim(), GOOGLE_CLIENT_SECRET: String(env.GOOGLE_CLIENT_SECRET || "").trim() };
}

function configured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET && env.OWNER_EMAIL && env.DB);
}
const APP_ONLY = () => [L("Přihlášení selhalo", "Sign-in failed"), L("Přihlášení přes Google je jen v aplikaci Aurin pro iPhone.", "Sign in with Google works only in the Aurin iPhone app."), 400];

async function startLogin(env, request) {
  const app = new URL(request.url).searchParams.get("app") || "";
  if (!APP_CHALLENGE.test(app)) return page(...APP_ONLY());
  if (!configured(env)) return appError("unavailable");
  const state = randomToken(), nonce = randomToken(), verifier = randomToken() + randomToken();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", googleLoginRedirectUri(env, request));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email");
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("code_challenge", base64url(await sha256(verifier)));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  const cookie = STATE_COOKIE + "=" + [state, nonce, verifier, app].join(".") + "; Max-Age=" + STATE_SECONDS + "; Path=/auth/google; Secure; HttpOnly; SameSite=Lax";
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

async function finishLogin(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  const match = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + STATE_COOKIE + "=([^;]+)"));
  const [expectedState, nonce, verifier, app] = (match?.[1] || "").split(".");
  // Every failure goes back to the iPhone app as loadwise://auth?error=…,
  // so its browser sheet closes and the app says what happened.
  if (!APP_CHALLENGE.test(app || "")) return page(...APP_ONLY());
  const fail = reason => appError(reason);
  if (!configured(env)) return fail("unavailable");
  if (url.searchParams.get("error")) return fail("cancelled");
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!code || !state || !expectedState || state !== expectedState || !nonce || !verifier) return fail("expired");

  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: googleLoginRedirectUri(env, request), grant_type: "authorization_code", code_verifier: verifier })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) return fail("failed");

  let claims;
  try { claims = await verifyGoogleIdToken(data.id_token, env.GOOGLE_CLIENT_ID, nonce, fetchImpl); }
  catch (error) { console.error("Google ID token rejected", error.message); return fail("failed"); }

  await ensureTenancy(env.DB, env, { request });
  const user = await signInGoogleUser(env.DB, env, { sub: claims.sub, email: claims.email, name: claims.name });
  if (!user) {
    console.warn("Google login denied for an account without an invitation");
    return fail("not_invited");
  }

  return appReturnPage(await appHandoffToken(user.id, app, sessionSecret(env), await sessionEpochOf(env.DB, user.id)));
}
export { finishLogin as _finishLoginForTest };

async function appHandoffToken(uid, challenge, secret, epoch) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ uid, ch: challenge, exp: Math.floor(Date.now() / 1000) + APP_HANDOFF_SECONDS, se: epoch, id: randomToken() })));
  return payload + "." + await signText("app-handoff." + payload, secret);
}

// A failed sign-in started by the app: back to it with a code it explains
// (cancelled, not_invited, expired, failed, unavailable). A redirect, not a page,
// so ASWebAuthenticationSession sees the loadwise:// address and closes.
function appError(code) {
  const headers = new Headers({ Location: APP_RETURN_URL + "?error=" + encodeURIComponent(code), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", STATE_COOKIE + "=; Max-Age=0; Path=/auth/google; Secure; HttpOnly; SameSite=Lax");
  return new Response(null, { status: 302, headers });
}

// Safari asks before opening another app, so the page keeps a button for it.
function appReturnPage(token) {
  const link = APP_RETURN_URL + "?token=" + encodeURIComponent(token);
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", STATE_COOKIE + "=; Max-Age=0; Path=/auth/google; Secure; HttpOnly; SameSite=Lax");
  return new Response("<!doctype html><html lang=\"" + L("cs", "en") + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Aurin</title></head><body style=\"font-family:system-ui;max-width:560px;margin:50px auto;padding:24px;line-height:1.5;background:#0a0d12;color:#e8edf5\"><h1>" + L("Přihlášení hotovo", "Signed in") + "</h1><p>" + L("Vrať se do aplikace Aurin.", "Go back to the Aurin app.") + "</p><p><a id=\"open\" href=\"" + esc(link) + "\" style=\"display:inline-block;padding:12px 18px;border-radius:10px;background:#9ec5ff;color:#0a0d12;text-decoration:none;font-weight:600\">" + L("Otevřít aplikaci", "Open the app") + "</a></p><script>location.href=document.getElementById(\"open\").href</script></body></html>", { status: 200, headers });
}

// The app's web view trades the handoff token and its verifier for a session.
// JSON only, so another site cannot post a token from a hidden form.
async function finishAppLogin(request, env) {
  if (!configured(env)) return Response.json({ status: "error", message: L("Přihlášení přes Google teď není dostupné.", "Sign in with Google isn't available right now.") }, { status: 503 });
  const fail = () => Response.json({ status: "error", message: L("Přihlášení vypršelo. Zkus to znovu.", "Sign-in expired. Try again.") }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("Origin");
  if (!(request.headers.get("Content-Type") || "").startsWith("application/json") || (origin && origin !== new URL(request.url).origin)) return fail();
  const { token, verifier } = await request.json().catch(() => ({}));
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || typeof verifier !== "string" || verifier.length < 43 || verifier.length > 128) return fail();
  if (!timingSafeEqualString(signature, await signText("app-handoff." + payload, sessionSecret(env)))) return fail();
  let data;
  try { data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))); } catch { return fail(); }
  const uid = Number(data?.uid), now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(uid) || uid <= 0 || !(Number(data?.exp) > now)) return fail();
  if (!timingSafeEqualString(base64url(await sha256(verifier)), String(data.ch || ""))) return fail();
  if (typeof data.id !== "string" || Number(data.se) !== await sessionEpochOf(env.DB, uid)) return fail();
  if (!(await useHandoff(env.DB, data.id, uid, Number(data.exp), now))) return fail();
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", await userSessionCookie(env.DB, uid, sessionSecret(env)));
  return Response.json({ status: "ok" }, { headers });
}

// Marks the token used (auth_challenges, purpose app-handoff); false when it was used before.
async function useHandoff(db, id, uid, exp, now) {
  const [, used] = await db.batch([
    db.prepare("DELETE FROM auth_challenges WHERE purpose = 'app-handoff' AND expires_at <= ?").bind(now),
    db.prepare("INSERT INTO auth_challenges(challenge, purpose, user_id, expires_at) VALUES (?, 'app-handoff', ?, ?) ON CONFLICT(challenge) DO NOTHING").bind("app-handoff:" + id, uid, exp)
  ]);
  return Number(used?.meta?.changes) > 0;
}

export async function verifyGoogleIdToken(token, clientId, nonce, fetchImpl = fetch) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  const header = decodeJson(parts[0]), claims = decodeJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported ID token algorithm");
  const now = Math.floor(Date.now() / 1000);
  if (!GOOGLE_ISSUERS.has(claims.iss)) throw new Error("Invalid issuer");
  if (claims.aud !== clientId) throw new Error("Invalid audience");
  if (!Number.isFinite(claims.exp) || claims.exp <= now) throw new Error("Expired ID token");
  if (claims.nonce !== nonce) throw new Error("Invalid nonce");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("Email is not verified");
  if (!claims.sub) throw new Error("Missing subject");

  const jwks = await googleJwks(fetchImpl, header.kid);
  const jwk = jwks.keys.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, fromBase64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!valid) throw new Error("Invalid ID token signature");
  return claims;
}

// Google's keys, kept for ten minutes. A token signed with a key the cached
// list does not have (Google rotates its keys) fetches the list again, past
// the cache, at most once a minute.
async function googleJwks(fetchImpl, kid) {
  const now = Date.now();
  const fresh = cachedJwks && now - cachedJwksAt < 10 * 60 * 1000;
  if (fresh && (cachedJwks.keys.some(key => key.kid === kid) || now - forcedJwksAt < 60 * 1000)) return cachedJwks;
  if (fresh) forcedJwksAt = now;
  const response = await fetchImpl(GOOGLE_JWKS_URL, fresh ? { cache: "no-store" } : { cf: { cacheTtl: 600 } });
  if (!response.ok) throw new Error("Google JWKS HTTP " + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.keys)) throw new Error("Invalid Google JWKS response");
  cachedJwks = data; cachedJwksAt = now;
  return data;
}
export function _resetJwksCacheForTest() { cachedJwks = null; cachedJwksAt = 0; forcedJwksAt = 0; }

function page(title, message, status) {
  return new Response("<!doctype html><html lang=\"" + L("cs", "en") + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Aurin</title></head><body style=\"font-family:system-ui;max-width:560px;margin:50px auto;padding:24px;line-height:1.5;background:#0a0d12;color:#e8edf5\"><h1>" + esc(title) + "</h1><p>" + esc(message) + "</p><p><a href=\"/app\" style=\"color:#9ec5ff\">" + L("Zpět na přihlášení", "Back to sign-in") + "</a></p></body></html>", { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "Referrer-Policy": "no-referrer" } });
}
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }
function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(24))); }
async function sha256(value) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
function decodeJson(value) { try { return JSON.parse(new TextDecoder().decode(fromBase64url(value))); } catch { throw new Error("Invalid ID token encoding"); } }
function base64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
