import app from "./v400.js";
import { buildStrengthContext } from "./strength-context.js";
import { getStrengthHistory, syncStrengthSheet } from "./strength-history.js";
import { writeStrengthPlan } from "./strength-plan-writer.js";
import { generateStrengthPlan } from "./strength-generator.js";

const SPREADSHEET_ID = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
const SHEET_GID = "585189491";
const SHEET_NAME = "Dnešní trénink";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export default {
  async scheduled(controller, env, ctx) { return app.scheduled(controller, env, ctx); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/test/google-sheets-auth") return testGoogleSheetsAuth(env);
    if (url.pathname.startsWith("/strength/")) {
      const auth = authorizeStrength(request, env);
      if (auth) return auth;
    }
    if (url.pathname === "/strength/sheet/today" && request.method === "GET") return readTodaySheet(env);
    if (url.pathname === "/strength/sheet/write" && request.method === "POST") return writeSheet(env, request);
    if (url.pathname === "/strength/sheet/write-plan" && request.method === "POST") return writeStrengthPlanRoute(env, request);
    if (url.pathname === "/strength/generate-plan" && request.method === "POST") return generateStrengthPlanRoute(env, request, url);
    if (url.pathname === "/strength/sync" && request.method === "POST") return syncStrength(env);
    if (url.pathname === "/strength/history" && request.method === "GET") return strengthHistory(env, url);
    if (url.pathname === "/strength/context" && request.method === "GET") return strengthContext(env, url);
    return app.fetch(request, env, ctx);
  }
};

function authorizeStrength(request, env) {
  if (!env.STRENGTH_API_KEY) return Response.json({ status: "error", step: "strength_auth", message: "STRENGTH_API_KEY is not configured" }, { status: 503 });
  const authorization = request.headers.get("Authorization") || "";
  if (authorization !== `Bearer ${env.STRENGTH_API_KEY}`) return Response.json({ status: "error", step: "strength_auth", message: "Unauthorized" }, { status: 401 });
  return null;
}

async function getGoogleAccessToken(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error("Missing Google OAuth environment variables");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth token error: ${data.error || response.status}`);
  return data.access_token;
}

async function fetchTodayValues(env) {
  const accessToken = await getGoogleAccessToken(env);
  const range = `'${SHEET_NAME.replace(/'/g, "''")}'!A1:Z1000`;
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}`;
  const response = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets read HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  return { range: data.range || range, values: data.values || [] };
}

async function testGoogleSheetsAuth(env) {
  try {
    const accessToken = await getGoogleAccessToken(env);
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    const info = await response.json();
    if (!response.ok) return Response.json({ status: "error", step: "tokeninfo", google_status: response.status, error: info.error || null }, { status: 502 });
    const scopes = String(info.scope || "").split(" ").filter(Boolean);
    return Response.json({ status: "ok", spreadsheet_id: SPREADSHEET_ID, gid: SHEET_GID, scopes, sheets_scope: scopes.includes(SHEETS_SCOPE), drive_file_scope: scopes.includes("https://www.googleapis.com/auth/drive.file") });
  } catch (error) { return Response.json({ status: "error", message: error.message }, { status: 500 }); }
}

async function readTodaySheet(env) {
  try {
    const data = await fetchTodayValues(env);
    return Response.json({ status: "ok", spreadsheet_id: SPREADSHEET_ID, gid: SHEET_GID, sheet: SHEET_NAME, range: data.range, values: data.values });
  } catch (error) { return Response.json({ status: "error", step: "sheets_read", message: error.message }, { status: 500 }); }
}

function isAllowedStrengthWriteRange(range) {
  const normalized = range.replace(/\s+/g, "");
  return normalized === `'${SHEET_NAME}'!A3:M5` || normalized === `'${SHEET_NAME}'!A8:M1000`;
}

async function writeSheet(env, request) {
  try {
    const body = await request.json();
    const range = String(body?.range || "").trim();
    const values = body?.values;
    if (!range) return Response.json({ status: "error", message: "Missing required field: range" }, { status: 400 });
    if (!Array.isArray(values)) return Response.json({ status: "error", message: "Missing required field: values (2D array)" }, { status: 400 });
    if (!isAllowedStrengthWriteRange(range)) return Response.json({ status: "error", message: "Write range is not allowed for the strength sheet" }, { status: 403 });
    const accessToken = await getGoogleAccessToken(env);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const response = await fetch(apiUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
    const data = await response.json();
    if (!response.ok) return Response.json({ status: "error", step: "sheets_write", google_status: response.status, error: data.error || null }, { status: 502 });
    return Response.json({ status: "ok", spreadsheet_id: SPREADSHEET_ID, gid: SHEET_GID, sheet: SHEET_NAME, updated_range: data.updatedRange || range, updated_rows: data.updatedRows || 0, updated_columns: data.updatedColumns || 0, updated_cells: data.updatedCells || 0 });
  } catch (error) { return Response.json({ status: "error", message: error.message }, { status: 500 }); }
}

async function writeStrengthPlanRoute(env, request) {
  try {
    const body = await request.json();
    const accessToken = await getGoogleAccessToken(env);
    const result = await writeStrengthPlan(accessToken, body, async () => {
      const data = await fetchTodayValues(env);
      return syncStrengthSheet(env.DB, data.values);
    });
    return Response.json(result);
  } catch (error) { return Response.json({ status: "error", step: "strength_write_plan", message: error.message }, { status: 500 }); }
}

async function generateStrengthPlanRoute(env, request, url) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = String(body?.date || url.searchParams.get("date") || "").trim() || null;
    const context = await buildStrengthContext(env, date);
    if (context.status !== "ok") throw new Error("Strength context is not ready");
    const plan = generateStrengthPlan(context);
    if (body?.preview === true) return Response.json({ status: "ok", preview: true, context, plan });
    const accessToken = await getGoogleAccessToken(env);
    const result = await writeStrengthPlan(accessToken, { date: plan.date, rows: plan.rows }, async () => {
      const data = await fetchTodayValues(env);
      return syncStrengthSheet(env.DB, data.values);
    });
    return Response.json({ ...result, planName: plan.planName, rationale: plan.rationale, loadFactor: plan.loadFactor });
  } catch (error) { return Response.json({ status: "error", step: "strength_generate_plan", message: error.message }, { status: 500 }); }
}

async function syncStrength(env) {
  try {
    const data = await fetchTodayValues(env);
    const result = await syncStrengthSheet(env.DB, data.values);
    return Response.json({ ...result, sourceRange: data.range });
  } catch (error) { return Response.json({ status: "error", step: "strength_sync", message: error.message }, { status: 500 }); }
}

async function strengthHistory(env, url) {
  try {
    const limit = url.searchParams.get("limit") || "100";
    const rows = await getStrengthHistory(env.DB, limit);
    return Response.json({ status: "ok", count: rows.length, rows });
  } catch (error) { return Response.json({ status: "error", step: "strength_history", message: error.message }, { status: 500 }); }
}

async function strengthContext(env, url) {
  try {
    const date = url.searchParams.get("date") || null;
    return Response.json(await buildStrengthContext(env, date));
  } catch (error) { return Response.json({ status: "error", step: "strength_context", message: error.message }, { status: 500 }); }
}
