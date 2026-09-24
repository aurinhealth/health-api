import app from "./sheets-gateway.js";
import { handleMcpCompat } from "./mcp-compat.js";
import { handleOAuthCompat } from "./oauth-compat.js";
import { syncPlannedEventCalories } from "./intervals-calories.js";
import { syncDailyNutritionNotes } from "./intervals-nutrition-notes.js";
import { verifyGitHubActionsToken } from "./github-oidc.js";
import { dashboardPage } from "./dashboard.js";
import { handleGoogleOAuth } from "./google-oauth.js";

const OPENAPI_URL = "https://raw.githubusercontent.com/shaarkyn/health-api/main/openapi.json";

export default {
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/mcp/health" && request.method === "GET") return Response.json({ status: "ok", service: "health-api-mcp", version: "1.1.0", endpoint: "/mcp", protocol: "2026-07-28+legacy" });
    if (url.pathname === "/automation/strength") return handleStrengthAutomation(request, env, ctx);
    if (url.pathname === "/automation/nutrition") return handleNutritionAutomation(request, env, ctx);
    if (url.pathname === "/automation/planned-calories") return handlePlannedCaloriesAutomation(request, env);
    if (url.pathname === "/automation/nutrition-notes") return handleNutritionNotesAutomation(request, env);
    const oauthResponse = await handleOAuthCompat(request, env, url.pathname);
    if (oauthResponse) return oauthResponse;
    if (url.pathname === "/mcp") return handleMcpCompat(request, env);
    if (url.pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
      if (!env.OPENAI_APP_CHALLENGE) return new Response("Not configured", { status: 404 });
      return new Response(env.OPENAI_APP_CHALLENGE, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
    const googleOAuth = await handleGoogleOAuth(request, env, url.pathname);
    if (googleOAuth) return googleOAuth;
    if (url.pathname === "/app" && request.method === "GET") return dashboardPage();
    if (url.pathname === "/app/login" && request.method === "POST") return handleDashboardLogin(request, env);
    if (url.pathname === "/app/logout" && request.method === "POST") return handleDashboardLogout();
    if (url.pathname.startsWith("/app/api/")) return handleDashboardApi(request, env, ctx, url);
    if (url.pathname === "/" && request.method === "GET") return homepagePage();
    if (url.pathname === "/privacy" && request.method === "GET") return privacyPage();
    if (url.pathname === "/terms" && request.method === "GET") return policyPage("Terms of Use", `Health & Strength is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.`);
    if (url.pathname === "/support" && request.method === "GET") return policyPage("Support", `Support for Health & Strength is provided through the project repository and its maintainer. Include the affected tool name, approximate time, and non-sensitive error message when reporting a problem. Never include API keys, OAuth refresh tokens, or other secrets in a support request.`);
    if (url.pathname === "/logo.svg" && request.method === "GET") return logoResponse();
    if (url.pathname === "/openapi.json" && request.method === "GET") {
      const response = await fetch(OPENAPI_URL, { cf: { cacheTtl: 60 } });
      if (!response.ok) return new Response(JSON.stringify({ status: "error", message: "OpenAPI schema unavailable" }), { status: 502, headers: { "content-type": "application/json" } });
      const text = await response.text();
      return new Response(text, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
    }
    return app.fetch(request, env, ctx);
  }
};

async function handleDashboardLogin(request, env) {
  const expected = String(env.STRENGTH_API_KEY || "");
  if (!expected) return Response.json({status:"error",message:"Dashboard authentication is not configured."},{status:503});
  const body = await request.json().catch(() => ({}));
  const key = String(body?.key || "");
  if (!key || key !== expected) return Response.json({status:"error",message:"Invalid dashboard access key."},{status:401});
  const exp = Math.floor(Date.now()/1000) + 30*24*60*60;
  const payload = base64url(new TextEncoder().encode(JSON.stringify({exp})));
  const signature = await dashboardHmac(payload, expected);
  const cookie = "pfd_session="+payload+"."+signature+"; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax";
  return Response.json({status:"ok",expiresAt:new Date(exp*1000).toISOString()},{headers:{"Set-Cookie":cookie,"Cache-Control":"no-store"}});
}
async function handleDashboardLogout() {
  return new Response(JSON.stringify({status:"ok"}),{status:200,headers:{"content-type":"application/json; charset=utf-8","Set-Cookie":"pfd_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax","Cache-Control":"no-store"}});
}
async function verifyDashboardSession(request, secret) {
  if (!secret) return false;
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.split(";").map(x=>x.trim()).find(x=>x.startsWith("pfd_session="));
  if (!match) return false;
  const token = match.slice("pfd_session=".length);
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0,dot), sig = token.slice(dot+1);
  const expected = await dashboardHmac(payload, secret);
  if (!timingSafeEqualString(sig, expected)) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return Number(data?.exp) > Math.floor(Date.now()/1000);
  } catch { return false; }
}
async function dashboardHmac(value, secret) {
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return base64url(new Uint8Array(sig));
}
function timingSafeEqualString(a,b) {
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

async function handleDashboardApi(request, env, ctx, url) {
  if (request.method !== "GET") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  const expected = String(env.STRENGTH_API_KEY || "");
  const auth = request.headers.get("Authorization") || "";
  let authorized = Boolean(expected && auth === "Bearer " + expected);
  if (!authorized) authorized = await verifyDashboardSession(request, expected);
  if (!authorized) {
    return Response.json({ status: "error", message: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  if (url.pathname === "/app/api/week") {
    const requestedStart = url.searchParams.get("start");
    const start = requestedStart && /^\\d{4}-\\d{2}-\\d{2}$/.test(requestedStart)
      ? requestedStart
      : pragueWeekStart();
    const dates = Array.from({length:7}, (_, i) => shiftDate(start, i));
    const days = await Promise.all(dates.map(async date => {
      const dailyUrl = new URL("/analysis/daily", request.url);
      dailyUrl.searchParams.set("date", date);
      const foodUrl = new URL("/food/log", request.url);
      foodUrl.searchParams.set("date", date);
      const recommendUrl = new URL("/food/recommend", request.url);
      recommendUrl.searchParams.set("date", date);
      const [dailyResponse, foodResponse, recommendResponse] = await Promise.all([
        app.fetch(new Request(dailyUrl, {method:"GET"}), env, ctx),
        app.fetch(new Request(foodUrl, {method:"GET"}), env, ctx),
        app.fetch(new Request(recommendUrl, {method:"GET"}), env, ctx)
      ]);
      return {
        date,
        daily: await dailyResponse.json(),
        food: await foodResponse.json(),
        recommendations: await recommendResponse.json()
      };
    }));
    return Response.json({status:"ok",start,end:dates[6],days},{headers:{"Cache-Control":"no-store"}});
  }

  const routes = {
    "/app/api/daily": "/analysis/daily",
    "/app/api/weight": "/health/weight",
    "/app/api/activities": "/health/activities",
    "/app/api/nutrition": "/health/nutrition"
  };
  const target = routes[url.pathname];
  if (!target) return Response.json({ status: "error", message: "Not found" }, { status: 404 });

  const internal = new URL(target, request.url);
  for (const [key, value] of url.searchParams) internal.searchParams.set(key, value);
  const response = await app.fetch(new Request(internal, { method: "GET" }), env, ctx);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

async function handleStrengthAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? null : String(body.date).trim();
    const action = String(body?.action || "generate").toLowerCase();
    const preview = body?.preview === true;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });

    const routes = {
      generate: "/strength/generate-plan",
      regenerate: "/strength/generate-plan",
      adjust: "/strength/generate-plan",
      shorten: "/strength/generate-plan",
      protect_legs: "/strength/generate-plan",
      focus_upper: "/strength/generate-plan",
      focus_lower: "/strength/generate-plan",
      substitute: "/strength/substitute",
      import_history: "/strength/history/import",
      sheet_maintenance: "/strength/sheets/maintenance",
      sync: "/strength/sync"
    };
    const route = routes[action];
    if (!route) return Response.json({ status: "error", message: `Unknown strength action: ${action}` }, { status: 400 });

    const internalUrl = new URL(route, request.url);
    const payload = { ...body, date, preview, action };
    if (action === "protect_legs" || action === "focus_upper") payload.forceProtectLegs = true;
    if (action === "shorten" && payload.durationMinutes == null) payload.durationMinutes = 60;
    if (action === "substitute") {
      if (!payload.from) return Response.json({ status: "error", message: "substitute requires 'from'" }, { status: 400 });
      if (!payload.to && !payload.muscle) return Response.json({ status: "error", message: "substitute requires 'to' or 'muscle'" }, { status: 400 });
    }

    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.STRENGTH_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json({ ...result, action }, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}


async function handleNutritionAutomation(request, env, ctx) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const date = body?.date == null || body.date === "" ? null : String(body.date).trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ status: "error", message: "Invalid date; expected YYYY-MM-DD" }, { status: 400 });
    const internalUrl = new URL("/nutrition/plan", request.url);
    const internalRequest = new Request(internalUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.STRENGTH_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, date })
    });
    const response = await app.fetch(internalRequest, env, ctx);
    const result = await response.clone().json().catch(() => null);
    if (result && typeof result === "object") return Response.json(result, { status: response.status });
    return response;
  } catch (error) {
    return Response.json({ status: "error", step: "github_actions_auth", message: error.message }, { status: 401 });
  }
}

function homepagePage() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Petr Fitness Data — Health & Strength</title><meta name="description" content="Petr Fitness Data is a personal training data service for workout planning, training history, cycling context and nutrition workflows."></head><body><main><h1>Petr Fitness Data</h1><p>Petr Fitness Data is a private personal training service used with Health & Strength to organize training history, generate strength workouts, use cycling context, and support nutrition workflows.</p><p><strong>Google Health data disclosure:</strong> With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p><p>The service can process training and fitness data from connected services, including Google data and Google Sheets data that the account owner has authorized, in order to provide these requested workflows.</p><p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a> · <a href="/support">Support</a></p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function privacyPage() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy — Petr Fitness Data</title></head><body><main><h1>Privacy Policy</h1><p><strong>Petr Fitness Data</strong> is a private personal training service used with Health & Strength.</p><h2>What data the service may access</h2><p>When authorized by the account owner, the service may access fitness and training information from connected Google services and other configured services. This can include Google Sheet workout data, training history, planned workouts, cycling context, recovery metrics, nutrition information, and other fitness data needed for the requested workflows.</p><h2>How Google data is used</h2><p>Google user data is used only to provide the training and nutrition workflows requested by the account owner, such as reading and updating the configured workout spreadsheet, processing authorized fitness data, reading authorized nutrition logs, and adding nutrition logs that the account owner asks the service to record. The service does not sell Google user data and does not use it for advertising.</p><h2>Storage and sharing</h2><p>Data may be processed and stored in the private health-api backend, its configured database, and connected services such as the account owner's Google Sheet. Data may be transmitted between these configured services when necessary to provide the requested functionality. The service does not intentionally disclose personal data to unrelated third parties.</p><h2>Security</h2><p>OAuth credentials and API secrets are intended to be stored as private service secrets rather than in the source code repository. Access to the service is controlled by the configured authentication mechanisms.</p><h2>Changes</h2><p>This policy may be updated when the service or its data practices change. The current version is published on this page.</p><h2>Contact</h2><p>For support or privacy questions, use the <a href="/support">Support</a> page.</p><p><a href="/">Back to Petr Fitness Data</a></p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function policyPage(title, text) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>${title} — Health & Strength</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

function logoResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#111827"/><path d="M68 132h32l18-54 30 100 20-46h20" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><circle cx="68" cy="132" r="8" fill="#fff"/></svg>`;
  return new Response(svg, { status: 200, headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}


async function handlePlannedCaloriesAutomation(request, env) {
  if (request.method !== "POST") return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
  try {
    await verifyGitHubActionsToken(request);
    const body = await request.json().catch(() => ({}));
    const today = new Date();
    const oldest = String(body?.oldest || today.toISOString().slice(0, 10));
    const newest = String(body?.newest || new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10));
    let weightKg = Number(body?.weightKg);
    if (!Number.isFinite(weightKg)) {
      const weightRow = await env.DB.prepare(
        `SELECT value_numeric FROM health_datapoints
         WHERE LOWER(data_type) LIKE '%weight%'
           AND value_numeric IS NOT NULL
         ORDER BY COALESCE(sample_time, start_time) DESC
         LIMIT 1`
      ).first();
      weightKg = Number(weightRow?.value_numeric);
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) weightKg = 88;

    const result = await syncPlannedEventCalories(env, {
      oldest,
      newest,
      weightKg,
      ftp: body?.ftp
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ status: "error", step: "planned_calories", message: error.message }, { status: 500 });
  }
}


async function handleNutritionNotesAutomation(request, env) {
  if (request.method !== "POST") return Response.json({status:"error",message:"Method not allowed"},{status:405});
  try {
    await verifyGitHubActionsToken(request);
    const body=await request.json().catch(()=>({}));
    const today=new Date(), oldest=String(body?.oldest||today.toISOString().slice(0,10)), newest=String(body?.newest||new Date(today.getTime()+14*86400000).toISOString().slice(0,10));
    let weightKg=Number(body?.weightKg);
    if(!Number.isFinite(weightKg)){
      const row=await env.DB.prepare(`SELECT value_numeric FROM health_datapoints WHERE LOWER(data_type) LIKE '%weight%' AND value_numeric IS NOT NULL ORDER BY COALESCE(sample_time,start_time) DESC LIMIT 1`).first();
      weightKg=Number(row?.value_numeric);
    }
    if(!Number.isFinite(weightKg)||weightKg<=0) weightKg=88;
    return Response.json(await syncDailyNutritionNotes(env,{oldest,newest,weightKg}));
  } catch(error){ return Response.json({status:"error",step:"nutrition_notes",message:error.message},{status:500}); }
}


function pragueWeekStart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Prague",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(now);
  const y = Number(parts.find(x=>x.type==="year").value);
  const m = Number(parts.find(x=>x.type==="month").value);
  const d = Number(parts.find(x=>x.type==="day").value);
  const weekday = parts.find(x=>x.type==="weekday").value;
  const index = {Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[weekday] ?? 0;
  return shiftDate(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`, -index);
}
function shiftDate(date, days) {
  const p = String(date).slice(0,10).split("-").map(Number);
  const d = new Date(Date.UTC(p[0],p[1]-1,p[2]+Number(days)));
  return d.toISOString().slice(0,10);
}
