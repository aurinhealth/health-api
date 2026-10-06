import { sessionCookie, sessionSecret, SESSION_SECONDS } from "./dashboard-auth.js";
import { ensureTenancy, signInGoogleUser } from "./tenancy.js";

// "Sign in with Google" for the dashboard. Only identity scopes are requested;
// health data access stays in the separate /oauth/google connector flow.
const ORIGIN = "https://petrfitnessdata.eu";
export const GOOGLE_LOGIN_REDIRECT_URI = ORIGIN + "/auth/google/callback";
const STATE_COOKIE = "pfd_google_login";
const STATE_SECONDS = 600;
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

let cachedJwks = null;
let cachedJwksAt = 0;

export async function handleGoogleLogin(request, env, pathname) {
  if (pathname === "/auth/google" && request.method === "GET") return startLogin(env);
  if (pathname === "/auth/google/callback" && request.method === "GET") return finishLogin(request, env);
  return null;
}

function configured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.STRENGTH_API_KEY && env.OWNER_EMAIL && env.DB);
}
const NOT_CONFIGURED = ["Přihlášení přes Google není nastavené", "Chybí GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET nebo OWNER_EMAIL.", 503];

async function startLogin(env) {
  if (!configured(env)) return page(...NOT_CONFIGURED);
  const state = randomToken(), nonce = randomToken(), verifier = randomToken() + randomToken();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", GOOGLE_LOGIN_REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email");
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("code_challenge", base64url(await sha256(verifier)));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("prompt", "select_account");
  const cookie = STATE_COOKIE + "=" + [state, nonce, verifier].join(".") + "; Max-Age=" + STATE_SECONDS + "; Path=/auth/google; Secure; HttpOnly; SameSite=Lax";
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

async function finishLogin(request, env, fetchImpl = fetch) {
  if (!configured(env)) return page(...NOT_CONFIGURED);
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return page("Přihlášení zrušeno", "Google přihlášení nebylo dokončeno.", 400);
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const match = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + STATE_COOKIE + "=([^;]+)"));
  const [expectedState, nonce, verifier] = (match?.[1] || "").split(".");
  if (!code || !state || !expectedState || state !== expectedState || !nonce || !verifier) return page("Přihlášení selhalo", "Neplatný nebo prošlý požadavek. Zkus to znovu.", 400);

  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_LOGIN_REDIRECT_URI, grant_type: "authorization_code", code_verifier: verifier })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) return page("Přihlášení selhalo", "Google nevrátil identitu účtu.", 502);

  let claims;
  try { claims = await verifyGoogleIdToken(data.id_token, env.GOOGLE_CLIENT_ID, nonce, fetchImpl); }
  catch (error) { console.error("Google ID token rejected", error.message); return page("Přihlášení selhalo", "Identitu Google účtu se nepodařilo ověřit.", 401); }

  await ensureTenancy(env.DB, env, { request });
  const user = await signInGoogleUser(env.DB, env, { sub: claims.sub, email: claims.email, name: claims.name });
  if (!user) {
    console.warn("Google login denied for an account without an invitation");
    return page("Přístup odepřen", "Tento Google účet nemá do aplikace pozvánku. Požádej správce o přístup.", 403);
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const headers = new Headers({ Location: "/app", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", await sessionCookie(user.id, exp, sessionSecret(env)));
  headers.append("Set-Cookie", STATE_COOKIE + "=; Max-Age=0; Path=/auth/google; Secure; HttpOnly; SameSite=Lax");
  return new Response(null, { status: 302, headers });
}
export { finishLogin as _finishLoginForTest };

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

  const jwks = await googleJwks(fetchImpl);
  const jwk = jwks.keys.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, fromBase64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!valid) throw new Error("Invalid ID token signature");
  return claims;
}

async function googleJwks(fetchImpl) {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < 10 * 60 * 1000) return cachedJwks;
  const response = await fetchImpl(GOOGLE_JWKS_URL, { cf: { cacheTtl: 600 } });
  if (!response.ok) throw new Error("Google JWKS HTTP " + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.keys)) throw new Error("Invalid Google JWKS response");
  cachedJwks = data; cachedJwksAt = now;
  return data;
}
export function _resetJwksCacheForTest() { cachedJwks = null; cachedJwksAt = 0; }

function page(title, message, status) {
  return new Response("<!doctype html><html lang=\"cs\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Loadwise</title></head><body style=\"font-family:system-ui;max-width:560px;margin:50px auto;padding:24px;line-height:1.5;background:#0a0d12;color:#e8edf5\"><h1>" + esc(title) + "</h1><p>" + esc(message) + "</p><p><a href=\"/app\" style=\"color:#9ec5ff\">Zpět na přihlášení</a></p></body></html>", { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "Referrer-Policy": "no-referrer" } });
}
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }
function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(24))); }
async function sha256(value) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
function decodeJson(value) { try { return JSON.parse(new TextDecoder().decode(fromBase64url(value))); } catch { throw new Error("Invalid ID token encoding"); } }
function base64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
