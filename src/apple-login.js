import { sessionCookie, sessionSecret, SESSION_SECONDS, signText, timingSafeEqualString } from "./dashboard-auth.js";
import { ensureTenancy, normalizeEmail, ownerEmail, publicUser } from "./tenancy.js";
import { loginPage } from "./google-login.js";

// "Sign in with Apple" for the dashboard, next to Google. It stays off (no button, no routes)
// until the Apple keys are set: APPLE_CLIENT_ID (the Services ID), APPLE_TEAM_ID, APPLE_KEY_ID
// and APPLE_PRIVATE_KEY (the .p8 file). Like Google, only invited e-mails get an account.
// Apple can hand out a private relay address instead of the real one, so a signed-in user can
// also link their Apple ID in Settings. The Apple IDs live in user_identities.
const ORIGIN = "https://petrfitnessdata.eu";
const APPLE = "https://appleid.apple.com";
const STATE_COOKIE = "pfd_apple_login";
const STATE_SECONDS = 600;
const NOT_CONFIGURED = ["Přihlášení přes Apple není nastavené", "Chybí klíče Apple nebo OWNER_EMAIL.", 503];

let cachedJwks = null;
let cachedJwksAt = 0;

export function appleConfigured(env) {
  return Boolean(env?.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

export function appleRedirectUri(env) {
  return (env?.APP_ORIGIN || ORIGIN) + "/auth/apple/callback";
}

const ready = env => appleConfigured(env) && Boolean(sessionSecret(env) && env.OWNER_EMAIL && env.DB);
const clientId = env => String(env.APPLE_CLIENT_ID).trim();

// user: the signed-in user, when there is one (linking from Settings).
export async function handleAppleLogin(request, env, pathname, { user = null, fetchImpl = fetch } = {}) {
  if (pathname === "/auth/apple" && request.method === "GET") return startLogin(request, env, user);
  if (pathname === "/auth/apple/callback" && request.method === "POST") return finishLogin(request, env, fetchImpl);
  return null;
}

async function startLogin(request, env, user) {
  if (!ready(env)) return loginPage(...NOT_CONFIGURED);
  const state = randomToken(), nonce = randomToken();
  // Apple answers with a cross-site POST, which carries no session cookie (SameSite=Lax). So the
  // state cookie is SameSite=None, says whom to link the Apple ID to, and is signed.
  const link = new URL(request.url).searchParams.get("link") === "1" && user?.id ? String(user.id) : "";
  const value = [state, nonce, link].join(".");
  const cookie = STATE_COOKIE + "=" + value + "." + await signText(value, sessionSecret(env)) + "; Max-Age=" + STATE_SECONDS + "; Path=/auth/apple; Secure; HttpOnly; SameSite=None";
  // Apple wants the scope's space as %20, which URLSearchParams would write as +.
  const query = { client_id: clientId(env), redirect_uri: appleRedirectUri(env), response_type: "code", scope: "name email", response_mode: "form_post", state, nonce };
  const location = APPLE + "/auth/authorize?" + Object.entries(query).map(([key, value]) => key + "=" + encodeURIComponent(value)).join("&");
  return new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

async function finishLogin(request, env, fetchImpl) {
  if (!ready(env)) return loginPage(...NOT_CONFIGURED);
  const form = await request.formData().catch(() => null);
  const field = name => String(form?.get(name) || "");
  if (field("error")) return loginPage("Přihlášení zrušeno", "Přihlášení přes Apple nebylo dokončeno.", 400);
  const parts = (cookieValue(request, STATE_COOKIE) || "").split(".");
  const [expectedState, nonce, link, signature] = parts;
  const signed = parts.length === 4 && timingSafeEqualString(signature, await signText(parts.slice(0, 3).join("."), sessionSecret(env)));
  const code = field("code"), state = field("state");
  if (!code || !state || !signed || state !== expectedState || !nonce) return loginPage("Přihlášení selhalo", "Neplatný nebo prošlý požadavek. Zkus to znovu.", 400);

  const response = await fetchImpl(APPLE + "/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(env), client_secret: await appleClientSecret(env), code, grant_type: "authorization_code", redirect_uri: appleRedirectUri(env) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) {
    console.error("Apple token exchange failed", response.status, data.error || "");
    return loginPage("Přihlášení selhalo", "Apple nevrátil identitu účtu.", 502);
  }
  let claims;
  try { claims = await verifyAppleIdToken(data.id_token, clientId(env), nonce, fetchImpl); }
  catch (error) { console.error("Apple ID token rejected", error.message); return loginPage("Přihlášení selhalo", "Identitu Apple účtu se nepodařilo ověřit.", 401); }
  const verified = claims.email_verified === true || claims.email_verified === "true";
  const identity = { sub: String(claims.sub), email: verified ? claims.email : null };

  await ensureTenancy(env.DB, env, { request });
  const headers = new Headers({ Location: "/app", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", STATE_COOKIE + "=; Max-Age=0; Path=/auth/apple; Secure; HttpOnly; SameSite=None");
  if (link) {
    if (!(await linkAppleIdentity(env.DB, Number(link), identity))) return loginPage("Apple se nepřipojil", "Tento Apple účet už patří jinému uživateli Loadwise.", 409);
    return new Response(null, { status: 302, headers });
  }
  const user = await signInAppleUser(env.DB, env, { ...identity, name: nameFrom(field("user")) });
  if (!user) {
    console.warn("Apple login denied for an account without an invitation");
    return loginPage("Přístup odepřen", "Tento Apple účet nemá do aplikace pozvánku. Pokud u Apple používáš Skrýt můj e-mail, přihlas se přes Google a Apple si připoj v Nastavení, nebo požádej správce o pozvánku.", 403);
  }
  headers.append("Set-Cookie", await sessionCookie(user.id, Math.floor(Date.now() / 1000) + SESSION_SECONDS, sessionSecret(env)));
  return new Response(null, { status: 302, headers });
}

// The client secret is a short-lived JWT signed with the Apple key (ES256).
export async function appleClientSecret(env, now = Math.floor(Date.now() / 1000)) {
  const data = base64url(utf8(JSON.stringify({ alg: "ES256", kid: String(env.APPLE_KEY_ID).trim() }))) + "."
    + base64url(utf8(JSON.stringify({ iss: String(env.APPLE_TEAM_ID).trim(), iat: now, exp: now + 300, aud: APPLE, sub: clientId(env) })));
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
  if (claims.aud !== audience) throw new Error("Invalid audience");
  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Expired ID token");
  if (claims.nonce !== nonce) throw new Error("Invalid nonce");
  if (!claims.sub) throw new Error("Missing subject");
  const jwk = (await appleJwks(fetchImpl)).keys.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, fromBase64url(parts[2]), utf8(parts[0] + "." + parts[1])))) throw new Error("Invalid ID token signature");
  return claims;
}

async function appleJwks(fetchImpl) {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < 10 * 60 * 1000) return cachedJwks;
  const response = await fetchImpl(APPLE + "/auth/keys", { cf: { cacheTtl: 600 } });
  if (!response.ok) throw new Error("Apple JWKS HTTP " + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.keys)) throw new Error("Invalid Apple JWKS response");
  cachedJwks = data; cachedJwksAt = now;
  return data;
}
export function _resetAppleJwksCacheForTest() { cachedJwks = null; cachedJwksAt = 0; }

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
// or the owner by the e-mail Apple confirmed. The invitation is consumed on first login.
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
      const invite = await db.prepare("SELECT email FROM user_invites WHERE email=?").bind(address).first();
      if (!invite && address !== ownerEmail(env)) return null;
      await db.prepare("INSERT INTO users(email, name, role) VALUES(?, ?, ?)").bind(address, name, address === ownerEmail(env) ? "admin" : "user").run();
      row = await db.prepare("SELECT id, email, name, role, disabled FROM users WHERE email=?").bind(address).first();
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

// Settings → Účet: links the Apple ID to the signed-in user (replacing an earlier one).
export async function linkAppleIdentity(db, userId, { sub, email }) {
  if (!sub) return false;
  await ensureIdentities(db);
  const user = await db.prepare("SELECT id, disabled FROM users WHERE id=?").bind(Number(userId)).first();
  if (!user || user.disabled) return false;
  const holder = await db.prepare("SELECT user_id FROM user_identities WHERE provider = 'apple' AND subject = ?").bind(String(sub)).first();
  if (holder && holder.user_id !== user.id) return false;
  await db.batch([
    db.prepare("DELETE FROM user_identities WHERE provider = 'apple' AND user_id = ? AND subject <> ?").bind(user.id, String(sub)),
    db.prepare("INSERT INTO user_identities(provider, subject, user_id, email) VALUES('apple', ?, ?, ?) ON CONFLICT(provider, subject) DO UPDATE SET email = COALESCE(excluded.email, email)").bind(String(sub), user.id, normalizeEmail(email) || null)
  ]);
  return true;
}

// For Settings: { linked, email } (no table yet means nothing linked).
export async function appleIdentity(db, userId) {
  const row = await db.prepare("SELECT email FROM user_identities WHERE provider = 'apple' AND user_id = ?").bind(Number(userId)).first().catch(() => null);
  return { linked: Boolean(row), email: row?.email || null };
}

export async function unlinkAppleIdentity(db, userId) {
  await db.prepare("DELETE FROM user_identities WHERE provider = 'apple' AND user_id = ?").bind(Number(userId)).run().catch(() => {});
}

// Apple sends the name (only the first time) as JSON in the form field "user".
function nameFrom(json) {
  try {
    const name = JSON.parse(json || "{}").name || {};
    return [name.firstName, name.lastName].filter(Boolean).join(" ").slice(0, 120) || null;
  } catch { return null; }
}

function cookieValue(request, name) {
  const match = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return match ? match[1] : null;
}
// The key as pasted from the .p8 file, with real or written-out (\n) line breaks.
function pemToDer(pem) {
  const body = String(pem).replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}
const utf8 = text => new TextEncoder().encode(text);
function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(24))); }
function decodeJson(value) { try { return JSON.parse(new TextDecoder().decode(fromBase64url(value))); } catch { throw new Error("Invalid ID token encoding"); } }
function base64url(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
