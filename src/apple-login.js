import { sessionSecret, signedInResponse } from "./dashboard-auth.js";
import { ensureTenancy, normalizeEmail, publicUser, mayCreateAccount, createAccount } from "./tenancy.js";
import { inheritAiLimits } from "./ai-limit-memory.js";
import { L } from "./lang.js";

// Sign in with Apple in the iPhone app. The Apple IDs live in user_identities.
const APPLE = "https://appleid.apple.com";
const NOT_CONFIGURED = () => L("Přihlášení přes Apple teď není dostupné.", "Sign in with Apple isn't available right now.");

let cachedJwks = null;
let cachedJwksAt = 0;
let forcedJwksAt = 0;

// The iPhone app signs in natively (AuthenticationServices): POST /auth/app/apple
// { identityToken, authorizationCode, nonce, name }. The token's audience is the app's bundle ID
// and its nonce claim is the SHA-256 (hex) of the nonce the app sends. It needs no Apple keys;
// with APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY set, the authorization code is also
// traded for a refresh token, which deleting the account revokes (App Store rule 5.1.1(v)).
// The body must be JSON, so another site cannot post a form here to sign someone in.
const APP_BUNDLE_ID = "health.aurin.app";
export const appBundleId = env => String(env?.APPLE_APP_BUNDLE_ID || APP_BUNDLE_ID).trim();
const canRevoke = env => Boolean(env?.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
const appJson = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// saveRefreshToken(user, token) stores the token with the user's connection keys (entrypoint.js).
export async function handleNativeAppleLogin(request, env, pathname, { fetchImpl = fetch, saveRefreshToken = null } = {}) {
  if (pathname !== "/auth/app/apple") return null;
  if (request.method !== "POST") return appJson({ message: L("Použij POST.", "Use POST.") }, 405);
  if (!(sessionSecret(env) && env.OWNER_EMAIL && env.DB)) return appJson({ message: NOT_CONFIGURED() }, 503);
  if (!String(request.headers.get("Content-Type") || "").startsWith("application/json")) return appJson({ message: L("Neplatný požadavek.", "Invalid request.") }, 415);
  const body = await request.json().catch(() => ({}));
  const token = String(body?.identityToken || ""), nonce = String(body?.nonce || "");
  if (!token || token.length > 8000 || nonce.length < 16 || nonce.length > 200) return appJson({ message: L("Neplatný požadavek.", "Invalid request.") }, 400);
  let claims;
  try { claims = await verifyAppleIdToken(token, appBundleId(env), await sha256Hex(nonce), fetchImpl); }
  catch (error) { console.error("Apple app ID token rejected", error.message); return appJson({ error: "failed", message: L("Účet Apple se nepodařilo ověřit.", "Couldn't verify your Apple account.") }, 401); }
  const verified = claims.email_verified === true || claims.email_verified === "true";
  await ensureTenancy(env.DB, env, { request });
  const user = await signInAppleUser(env.DB, env, { sub: String(claims.sub), email: verified ? claims.email : null, name: cleanName(body?.name) });
  if (!user) {
    console.warn("Apple app login denied for an account without an invitation");
    return appJson({ error: "not_invited", message: L("Tento účet Apple nemá do Aurinu pozvánku. Přihlas se přes Google nebo e-mailem, na který ti pozvánka přišla.", "This Apple account isn't invited to Aurin. Continue with Google or with the email your invitation went to.") }, 403);
  }
  const code = String(body?.authorizationCode || "");
  if (saveRefreshToken && canRevoke(env) && code && code.length < 2000) {
    try {
      const refresh = await exchangeAppCode(env, code, fetchImpl, String(claims.aud));
      if (refresh) await saveRefreshToken(user, refresh);
    } catch (error) { console.error("Apple refresh token not stored", error.message); }
  }
  return signedInResponse(user.id, env, { status: "ok" });
}

// client: the app that signed in (its bundle ID, the token's audience).
async function exchangeAppCode(env, code, fetchImpl, client = appBundleId(env)) {
  const response = await fetchImpl(APPLE + "/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client, client_secret: await appleClientSecret(env, undefined, client), code, grant_type: "authorization_code" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Apple token HTTP " + response.status + " " + (data.error || ""));
  return data.refresh_token || null;
}

// Deleting the account (or unlinking Apple) gives the app's Apple sign-in back.
// env.APPLE_REFRESH_TOKEN comes from the user's connection keys (connection-secrets.js).
export async function revokeApple(env, fetchImpl = fetch) {
  if (!env?.APPLE_REFRESH_TOKEN) return "none";
  if (!canRevoke(env)) return "failed";
  try {
    const response = await fetchImpl(APPLE + "/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appBundleId(env), client_secret: await appleClientSecret(env, undefined, appBundleId(env)), token: env.APPLE_REFRESH_TOKEN, token_type_hint: "refresh_token" })
    });
    return response.ok ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
}

async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(text)));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

// The client secret is a short-lived JWT signed with the Apple key (ES256); its subject is the app's bundle ID.
export async function appleClientSecret(env, now = Math.floor(Date.now() / 1000), subject = appBundleId(env)) {
  const data = base64url(utf8(JSON.stringify({ alg: "ES256", kid: String(env.APPLE_KEY_ID).trim() }))) + "."
    + base64url(utf8(JSON.stringify({ iss: String(env.APPLE_TEAM_ID).trim(), iat: now, exp: now + 300, aud: APPLE, sub: subject })));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(env.APPLE_PRIVATE_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto returns the raw r||s signature, which is what JWS wants.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(data));
  return data + "." + base64url(new Uint8Array(signature));
}

export async function verifyAppleIdToken(token, audience, nonce, fetchImpl = fetch) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  const header = decodeJson(parts[0]), claims = decodeJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported ID token algorithm");
  if (claims.iss !== APPLE) throw new Error("Invalid issuer");
  // audience: one client ID, or several (the app and its former ID).
  if (![].concat(audience).includes(claims.aud)) throw new Error("Invalid audience");
  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired ID token");
  if (claims.nonce !== nonce) throw new Error("Invalid nonce");
  if (!claims.sub) throw new Error("Missing subject");
  const jwk = (await appleJwks(fetchImpl, header.kid)).keys.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, fromBase64url(parts[2]), utf8(parts[0] + "." + parts[1])))) throw new Error("Invalid ID token signature");
  return claims;
}

// Apple's keys, kept for ten minutes. A token signed with a key the cached
// list does not have (Apple rotated its keys) fetches the list again, past
// the cache, at most once a minute.
async function appleJwks(fetchImpl, kid) {
  const now = Date.now();
  const fresh = cachedJwks && now - cachedJwksAt < 10 * 60 * 1000;
  if (fresh && (cachedJwks.keys.some(key => key.kid === kid) || now - forcedJwksAt < 60 * 1000)) return cachedJwks;
  if (fresh) forcedJwksAt = now;
  const response = await fetchImpl(APPLE + "/auth/keys", fresh ? { cache: "no-store" } : { cf: { cacheTtl: 600 } });
  if (!response.ok) throw new Error("Apple JWKS HTTP " + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.keys)) throw new Error("Invalid Apple JWKS response");
  cachedJwks = data; cachedJwksAt = now;
  return data;
}
export function _resetAppleJwksCacheForTest() { cachedJwks = null; cachedJwksAt = 0; forcedJwksAt = 0; }

// Apple IDs linked to users. One Apple ID per user; a row goes with the user (user_id).
async function ensureIdentities(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS user_identities (
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT,
      PRIMARY KEY (provider, subject)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS user_identities_user ON user_identities(user_id)")
  ]);
}

// A verified Apple identity signs in: a linked Apple ID, else an existing user, an invited e-mail
// or the owner by the e-mail Apple confirmed (anyone, with OPEN_SIGNUP). The invitation is consumed on first login.
export async function signInAppleUser(db, env, { sub, email, name = null }) {
  if (!sub) return null;
  await ensureIdentities(db);
  const address = normalizeEmail(email);
  let row = await db.prepare("SELECT u.id, u.email, u.name, u.role, u.disabled FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'apple' AND i.subject = ?").bind(String(sub)).first();
  if (!row && address) {
    row = await db.prepare("SELECT id, email, name, role, disabled FROM users WHERE email=?").bind(address).first();
    // An account that already has another Apple ID does not take a second one by e-mail.
    if (row && await db.prepare("SELECT 1 AS linked FROM user_identities WHERE provider = 'apple' AND user_id = ?").bind(row.id).first()) return null;
    if (!row) {
      if (!(await mayCreateAccount(db, env, address))) return null;
      const made = await createAccount(db, env, address, name);
      if (!made) return null;
      row = await db.prepare("SELECT id, email, name, role, disabled FROM users WHERE email=?").bind(address).first();
      if (made === "created" && row) await inheritAiLimits(db, env, row.id, { email: address, appleSub: String(sub) });
    }
  }
  if (!row || row.disabled) return null;
  await db.batch([
    db.prepare("INSERT INTO user_identities(provider, subject, user_id, email, last_login_at) VALUES('apple', ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(provider, subject) DO UPDATE SET email = COALESCE(excluded.email, email), last_login_at = CURRENT_TIMESTAMP").bind(String(sub), row.id, address || null),
    db.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id),
    db.prepare("DELETE FROM user_invites WHERE email=?").bind(address)
  ]);
  return publicUser(row, env);
}

// For Settings: { linked, email } (no table yet means nothing linked).
export async function appleIdentity(db, userId) {
  const row = await db.prepare("SELECT email FROM user_identities WHERE provider = 'apple' AND user_id = ?").bind(Number(userId)).first().catch(() => null);
  return { linked: Boolean(row), email: row?.email || null };
}

export async function unlinkAppleIdentity(db, userId) {
  await db.prepare("DELETE FROM user_identities WHERE provider = 'apple' AND user_id = ?").bind(Number(userId)).run().catch(() => {});
}

// The key as pasted from the .p8 file, with real or written-out (\n) line breaks.
function pemToDer(pem) {
  const body = String(pem).replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}
const utf8 = text => new TextEncoder().encode(text);
function decodeJson(value) { try { return JSON.parse(new TextDecoder().decode(fromBase64url(value))); } catch { throw new Error("Invalid ID token encoding"); } }
function base64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
