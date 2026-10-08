import { L } from './lang.js';
import { verifyGitHubActionsToken } from "./github-oidc.js";

const SESSION_COOKIE = "pfd_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

// Routes reachable without a dashboard session or API key. Everything else
// requires authentication. Routes listed here either serve static/public
// content or enforce their own authentication (MCP bearer, GitHub OIDC,
// dashboard session inside the OAuth connectors).
const PUBLIC_PATHS = new Set([
  "/",
  "/privacy",
  "/terms",
  "/support",
  "/logo.svg",
  "/manifest.webmanifest",
  "/openapi.json",
  "/app",
  "/app/dashboard-client.js",
  "/app/logout",
  "/auth/google",
  "/auth/google/callback",
  "/auth/apple",
  "/auth/apple/callback",
  "/auth/passkey/options",
  "/auth/passkey/verify",
  "/auth/email/start",
  "/auth/email/verify",
  "/mcp",
  "/mcp/health",
  "/automation/strength",
  "/automation/nutrition",
  "/automation/nutrition-notes"
]);
const PUBLIC_PREFIXES = ["/.well-known/", "/oauth/"];

export function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

// Identifies who is calling: a signed-in user (session cookie), the owner's
// API key (API clients) or a GitHub Actions workflow. Returns null for
// anonymous or invalid credentials.
export async function resolvePrincipal(request, env, verifyOidc = verifyGitHubActionsToken) {
  const session = await verifyDashboardSession(request, sessionSecret(env));
  if (session) return { kind: "user", userId: session.uid };
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
// sites under petrfitnessdata.eu make here (the test copy at
// staging.petrfitnessdata.eu is one): it treats them as the same site, so
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

// Returns the session payload ({uid, exp}) or null.
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
    const uid = Number(data?.uid);
    if (!(Number(data?.exp) > Math.floor(Date.now()/1000)) || !Number.isInteger(uid) || uid <= 0) return null;
    return { uid, exp: Number(data.exp) };
  } catch { return null; }
}

// Signs dashboard sessions: SESSION_SECRET only, never the owner API key, so
// whoever holds that key cannot make up a session of another user. Without it
// nobody can sign in. Rotating it signs everyone out once.
export function sessionSecret(env) {
  return String(env.SESSION_SECRET || "");
}

export async function sessionCookie(uid, exp, secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({uid:Number(uid),exp})));
  const signature = await dashboardHmac(payload, secret);
  return SESSION_COOKIE+"="+payload+"."+signature+"; Path=/; Max-Age="+SESSION_SECONDS+"; HttpOnly; Secure; SameSite=Lax";
}

// A JSON answer that also signs the user in (passkey and e-mail code sign-in).
export async function signedInResponse(userId, env, body = { status: "ok" }) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return Response.json(body, { headers: { "Cache-Control": "no-store", "Set-Cookie": await sessionCookie(userId, exp, sessionSecret(env)) } });
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
export function timingSafeEqualString(a,b) {
  a=String(a); b=String(b);
  if (a.length !== b.length) return false;
  let x=0; for(let i=0;i<a.length;i++) x |= a.charCodeAt(i)^b.charCodeAt(i); return x===0;
}
function base64url(bytes) {
  let s=""; for(const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromBase64url(s) {
  s=s.replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4)s+="=";
  const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
