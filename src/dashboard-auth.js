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
// API key (MCP, API clients, internal hops) or a GitHub Actions workflow.
// Returns null for anonymous or invalid credentials.
export async function resolvePrincipal(request, env, verifyOidc = verifyGitHubActionsToken) {
  const secret = String(env.STRENGTH_API_KEY || "");
  if (!secret) return null;
  const session = await verifyDashboardSession(request, sessionSecret(env));
  if (session) return { kind: "user", userId: session.uid };
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  if (timingSafeEqualString(token, secret)) return { kind: "owner" };
  if (token.split(".").length !== 3) return null;
  try { await verifyOidc(request); return { kind: "system" }; } catch { return null; }
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

export function handleDashboardLogout() {
  return new Response(JSON.stringify({status:"ok"}),{status:200,headers:{"content-type":"application/json; charset=utf-8","Set-Cookie":SESSION_COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax","Cache-Control":"no-store"}});
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

// Signs dashboard sessions. SESSION_SECRET keeps sessions independent of the
// owner API key (which OAuth hands to API clients); without it the API key is
// used, as before. Setting or rotating SESSION_SECRET signs everyone out once.
export function sessionSecret(env) {
  return String(env.SESSION_SECRET || env.STRENGTH_API_KEY || "");
}

export async function sessionCookie(uid, exp, secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({uid:Number(uid),exp})));
  const signature = await dashboardHmac(payload, secret);
  return SESSION_COOKIE+"="+payload+"."+signature+"; Path=/; Max-Age="+SESSION_SECONDS+"; HttpOnly; Secure; SameSite=Lax";
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
