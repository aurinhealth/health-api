import { L } from './lang.js';
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { bumpSessionEpoch } from "./tenancy.js";
import { APP_RETURN_PATH } from "./app-origin.js";

const SESSION_COOKIE = "pfd_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
// The cookie carries the user's session epoch (users.session_epoch); a cookie
// made before the epoch moved on (e-mail changed, a passkey or the Apple ID
// removed, "sign out everywhere") is no longer a session. Cookies from before
// the epoch existed count as 0, so nobody was signed out by its arrival.
// A session in use slides: once it is a day old, an /app/api/* request gets a
// fresh 30-day cookie, so only 30 days without the app sign the user out.
export const SESSION_REFRESH_SECONDS = 24 * 60 * 60;
// However much it is used, a session ends a year after the sign-in it came
// from (`at` in the cookie), so a copied cookie does not live for ever.
export const SESSION_MAX_SECONDS = 365 * 24 * 60 * 60;

// Routes reachable without a dashboard session or API key. Everything else
// requires authentication. Routes listed here either serve static/public
// content or enforce their own authentication (GitHub OIDC,
// dashboard session inside the OAuth connectors).
const PUBLIC_PATHS = new Set([
  "/",
  "/privacy",
  "/terms",
  "/cs/privacy",
  "/cs/terms",
  "/support",
  "/logo.svg",
  "/robots.txt",
  "/sitemap.xml",
  "/app/logout",
  "/auth/google",
  "/auth/google/callback",
  "/auth/app/session",
  APP_RETURN_PATH,
  "/auth/app/connect",
  "/auth/app/apple",
  "/auth/passkey/options",
  "/auth/passkey/verify",
  "/auth/email/start",
  "/auth/email/verify",
  // The website's "Join the waitlist" (testflight-waitlist.js): rate limited per caller.
  "/waitlist",
  "/automation/strength",
  // The coach evaluation on the test server: its own GitHub token (coach-eval.js).
  "/automation/coach-eval",
  // Wahoo's webhook: checked against WAHOO_WEBHOOK_TOKEN (wahoo.js).
  "/webhooks/wahoo",
  // Intervals.icu's webhooks: checked against INTERVALS_WEBHOOK_SECRET (intervals-webhook.js).
  "/webhooks/intervals"
]);
const PUBLIC_PREFIXES = ["/.well-known/", "/oauth/", "/t/"];

export function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

// Identifies who is calling: a signed-in user (session cookie), the owner's
// API key (API clients) or a GitHub Actions workflow. Returns null for
// anonymous or invalid credentials.
export async function resolvePrincipal(request, env, verifyOidc = verifyGitHubActionsToken) {
  const session = await verifyDashboardSession(request, sessionSecret(env));
  if (session) return { kind: "user", userId: session.uid, epoch: session.epoch };
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const ownerKey = String(env.STRENGTH_API_KEY || "");
  if (ownerKey && timingSafeEqualString(token, ownerKey)) return { kind: "owner" };
  if (token.split(".").length !== 3) return null;
  try { await verifyOidc(request); return { kind: "system" }; } catch { return null; }
}

// The browser sends the session cookie also with requests that pages of other
// sites under aurin.health make here: it treats them as the same site, so
// SameSite=Lax does not stop them. A change made with the session therefore
// has to come from a page of this very address.
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export function foreignOriginChange(request, principal) {
  if (principal?.kind !== "user" || READ_METHODS.has(request.method)) return false;
  return request.headers.get("Origin") !== new URL(request.url).origin;
}

export async function isAuthorizedRequest(request, env, verifyOidc = verifyGitHubActionsToken) {
  return Boolean(await resolvePrincipal(request, env, verifyOidc));
}

export function unauthorizedResponse() {
  return Response.json(
    { status: "error", message: L("Přihlas se do dashboardu.", "Sign in to the app.") },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="health-api"', "Cache-Control": "no-store" } }
  );
}

export const CLEARED_SESSION_COOKIE = SESSION_COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

export function handleDashboardLogout() {
  return new Response(JSON.stringify({status:"ok"}),{status:200,headers:{"content-type":"application/json; charset=utf-8","Set-Cookie":CLEARED_SESSION_COOKIE,"Cache-Control":"no-store"}});
}

// A session cookie is good for the user row it names only while its epoch is the row's.
export function sessionMatchesUser(principal, user) {
  if (principal?.kind !== "user") return true;
  return Number(principal.epoch || 0) === Number(user?.sessionEpoch || 0);
}

// Returns the session payload ({uid, exp, epoch, iat, at}) or null. Cookies from
// before the sliding sessions carry no iat; they count as issued 30 days before exp.
// Cookies from before the year's limit carry no sign-in time: their iat stands in.
export async function verifyDashboardSession(request, secret) {
  if (!secret) return null;
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.split(";").map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+"="));
  if (!match) return null;
  const token = match.slice(SESSION_COOKIE.length+1);
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0,dot), sig = token.slice(dot+1);
  const expected = await dashboardHmac(payload, secret);
  if (!timingSafeEqualString(sig, expected)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    const uid = Number(data?.uid), epoch = data?.se === undefined ? 0 : Number(data.se);
    if (!(Number(data?.exp) > Math.floor(Date.now()/1000)) || !Number.isInteger(uid) || uid <= 0 || !Number.isInteger(epoch) || epoch < 0) return null;
    const exp = Number(data.exp), iat = Number.isFinite(Number(data.iat)) ? Number(data.iat) : exp - SESSION_SECONDS;
    const at = Number.isFinite(Number(data.at)) ? Math.min(Number(data.at), iat) : iat;
    if (Math.floor(Date.now()/1000) - at > SESSION_MAX_SECONDS) return null;
    return { uid, exp, epoch, iat, at };
  } catch { return null; }
}

// Signs dashboard sessions: SESSION_SECRET only, never the owner API key, so
// whoever holds that key cannot make up a session of another user. Without it
// nobody can sign in. Rotating it signs everyone out once.
export function sessionSecret(env) {
  return String(env.SESSION_SECRET || "");
}

export async function sessionCookie(uid, exp, secret, epoch = 0, iat = Math.floor(Date.now() / 1000), at = iat) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({uid:Number(uid),exp:Math.min(exp,at+SESSION_MAX_SECONDS),se:Number(epoch)||0,iat,at})));
  const signature = await dashboardHmac(payload, secret);
  return SESSION_COOKIE+"="+payload+"."+signature+"; Path=/; Max-Age="+SESSION_SECONDS+"; HttpOnly; Secure; SameSite=Lax";
}

// The user's current epoch; a users table from before the column counts as 0.
export async function sessionEpochOf(db, uid) {
  const row = await db.prepare("SELECT session_epoch FROM users WHERE id=?").bind(Number(uid)).first().catch(() => null);
  return Number(row?.session_epoch) || 0;
}

// A month-long session cookie for the user as they are now (every sign-in, and
// the caller's own device after the epoch moved on).
export async function userSessionCookie(db, uid, secret) {
  return sessionCookie(uid, Math.floor(Date.now() / 1000) + SESSION_SECONDS, secret, await sessionEpochOf(db, uid));
}

// A JSON answer that also signs the user in (passkey and e-mail code sign-in).
export async function signedInResponse(userId, env, body = { status: "ok" }) {
  return Response.json(body, { headers: { "Cache-Control": "no-store", "Set-Cookie": await userSessionCookie(env.DB, userId, sessionSecret(env)) } });
}

// Moves the user's epoch on (every other device is signed out) and keeps the
// caller signed in: the answer carries a fresh cookie.
export async function signedOutElsewhere(db, userId, env, response, request = null) {
  const known = request ? await heldKnownDevice(request, env, db, userId) : false;
  await bumpSessionEpoch(db, userId);
  response.headers.append("Set-Cookie", await userSessionCookie(db, userId, sessionSecret(env)));
  // A known device for e-mail codes stays one; the others lose it with the epoch.
  if (known) {
    const device = await knownDeviceCookie(db, env, userId);
    if (device) response.headers.append("Set-Cookie", device);
  }
  return response;
}

// The device an e-mail code sign-in happened on (kept by that device when it bumps the epoch): "<nonce>.<signature of the account, its session epoch, the address and the nonce>".
// It exempts the device from the address's daily code limit and wrong-code lock
// (email-login.js). Bumping the epoch (sign out everywhere, e-mail change, removing a passkey,
// unlinking Apple ID, blocking) or deleting the account ends it everywhere but on the device that
// made the change, and an address that later belongs to someone else never matches an older cookie.
export const KNOWN_COOKIE = "aurin_known";
const KNOWN_SECONDS = 365 * 24 * 60 * 60;
// Read with the request: a missing account is compared against a dummy, so both take as long.
const NO_OWNER = { id: 0, email: "", session_epoch: -1 };
async function knownOwner(db, where, value) {
  try {
    return await db.prepare(`SELECT id, email, session_epoch FROM users WHERE ${where}=?`).bind(value).first();
  } catch (error) {
    console.error("Known device: account not read", error?.message);
    return null;
  }
}
const knownSignature = (env, owner, nonce) => signText("known-device:" + owner.id + ":" + (Number(owner.session_epoch) || 0) + ":" + owner.email + ":" + nonce, sessionSecret(env));

export async function knownDeviceCookie(db, env, userId) {
  const owner = await knownOwner(db, "id", Number(userId));
  if (!owner?.email) return null;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
  return KNOWN_COOKIE + "=" + nonce + "." + await knownSignature(env, owner, nonce) + "; Path=/; Max-Age=" + KNOWN_SECONDS + "; HttpOnly; Secure; SameSite=Lax";
}

// Path=/ so the account routes that bump the epoch see it too. A browser may still hold one from
// before with Path=/auth/email (and sends it first there), so up to three values are tried.
function knownDeviceValues(request) {
  return String(request.headers.get("Cookie") || "").split(/;\s*/).filter(c => c.startsWith(KNOWN_COOKIE + "=")).slice(0, 3).map(c => {
    const [nonce, signature] = c.slice(KNOWN_COOKIE.length + 1).split(".");
    return /^[0-9a-f]{24}$/.test(nonce || "") && /^[A-Za-z0-9_\-+/=]{16,128}$/.test(signature || "") ? { nonce, signature } : null;
  }).filter(Boolean);
}
async function matchingKnown(env, owner, cookies) {
  let found = null;
  for (const cookie of cookies) if (timingSafeEqualString(cookie.signature, await knownSignature(env, owner, cookie.nonce))) found ||= cookie.nonce;
  return found;
}

// The nonce when the request comes from a known device of the account that owns this address, else null.
export async function knownDevice(request, env, email) {
  const cookies = knownDeviceValues(request);
  if (!cookies.length) return null;
  const owner = await knownOwner(env.DB, "email", email);
  const match = await matchingKnown(env, owner || NO_OWNER, cookies);
  return owner ? match : null;
}

// Whether the signed-in caller holds a valid known-device cookie of this account, read before the
// epoch changes: only such a device gets a new one, so a session alone never mints one.
export async function heldKnownDevice(request, env, db, userId) {
  const cookies = knownDeviceValues(request);
  if (!cookies.length) return false;
  const owner = await knownOwner(db, "id", Number(userId));
  return Boolean(owner?.email) && Boolean(await matchingKnown(env, owner, cookies));
}

// Settings → Účet: POST /app/api/account/sign-out-everywhere.
export async function handleSignOutEverywhere(request, env, url, session) {
  if (url.pathname !== "/app/api/account/sign-out-everywhere") return null;
  if (request.method !== "POST") return Response.json({ message: L("Použij POST.", "Use POST.") }, { status: 405 });
  if (!session.signedIn || !session.user) return unauthorizedResponse();
  if (request.headers.get("Origin") !== url.origin) return Response.json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, { status: 403 });
  return signedOutElsewhere(env.RAW_DB || env.DB, session.user.id, env, Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } }), request);
}

// Whether the session is old enough for a fresh cookie (SESSION_REFRESH_SECONDS since it was issued).
export function sessionNeedsRefresh(session, now = Math.floor(Date.now() / 1000)) {
  return Boolean(session) && now - Number(session.iat) >= SESSION_REFRESH_SECONDS;
}

// The answer to an /app/api/* request with a fresh 30-day cookie when the
// session in the request is a day old or more: the same user, new times. A
// response that sets the cookie itself (sign-in, logout) is left alone, and so
// is a request without a valid session (API key, GitHub).
export async function slidingSession(request, response, secret, now = Math.floor(Date.now() / 1000)) {
  if (!response || !secret) return response;
  const session = await verifyDashboardSession(request, secret);
  if (!sessionNeedsRefresh(session, now)) return response;
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("Set-Cookie") || ""];
  if (setCookies.some(value => String(value).startsWith(SESSION_COOKIE + "="))) return response;
  const refreshed = new Response(response.body, response);
  refreshed.headers.append("Set-Cookie", await sessionCookie(session.uid, now + SESSION_SECONDS, secret, session.epoch, now, session.at));
  return refreshed;
}

// Signs short-lived values with the session secret (the Apple sign-in state, e-mail codes).
export function signText(value, secret) {
  return dashboardHmac(value, secret);
}

async function dashboardHmac(value, secret) {
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return base64url(new Uint8Array(sig));
}
// b is the secret (or the expected value): the time depends only on its
// length, so a wrong guess learns neither its content nor its length.
export function timingSafeEqualString(a,b) {
  a=String(a); b=String(b);
  let x=a.length^b.length; for(let i=0;i<b.length;i++) x |= (a.charCodeAt(i)|0)^b.charCodeAt(i); return x===0;
}
function base64url(bytes) {
  let s=""; for(const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromBase64url(s) {
  s=s.replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4)s+="=";
  const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
