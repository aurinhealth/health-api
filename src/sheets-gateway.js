import app from "./v400.js";
import { buildStrengthContext } from "./strength-context.js";

const SPREADSHEET_ID = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
const SHEET_GID = "585189491";
const SHEET_NAME = "Dnešní trénink";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export default {
  async scheduled(controller, env, ctx) { return app.scheduled(controller, env, ctx); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/test/google-sheets-auth") return testGoogleSheetsAuth(env);
    if (url.pathname === "/strength/sheet/today" && request.method === "GET") return readTodaySheet(env);
    if (url.pathname === "/strength/sheet/write" && request.method === "POST") return writeSheet(env, request);
    if (url.pathname === "/strength/context" && request.method === "GET") return strengthContext(env, url);
    return app.fetch(request, env, ctx);
  }
};

async function getGoogleAccessToken(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error("Missing Google OAuth environment variables");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth token error: ${data.error || response.status}`);
  return data.access_token;
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
    const accessToken = await getGoogleAccessToken(env);
    const range = `'${SHEET_NAME.replace(/'/g, "''")}'`;
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}`;
    const response = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (!response.ok) return Response.json({ status: "error", step: "sheets_read", google_status: response.status, error: data.error || null }, { status: 502 });
    return Response.json({ status: "ok", spreadsheet_id: SPREADSHEET_ID, gid: SHEET_GID, sheet: SHEET_NAME, range: data.range || range, values: data.values || [] });
  } catch (error) { return Response.json({ status: "error", message: error.message }, { status: 500 }); }
}

async function writeSheet(env, request) {
  try {
    const body = await request.json();
    const range = String(body?.range || "").trim();
    const values = body?.values;
    if (!range) return Response.json({ status: "error", message: "Missing required field: range" }, { status: 400 });
    if (!Array.isArray(values)) return Response.json({ status: "error", message: "Missing required field: values (2D array)" }, { status: 400 });
    const accessToken = await getGoogleAccessToken(env);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const response = await fetch(apiUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
    const data = await response.json();
    if (!response.ok) return Response.json({ status: "error", step: "sheets_write", google_status: response.status, error: data.error || null }, { status: 502 });
    return Response.json({ status: "ok", spreadsheet_id: SPREADSHEET_ID, gid: SHEET_GID, sheet: SHEET_NAME, updated_range: data.updatedRange || range, updated_rows: data.updatedRows || 0, updated_columns: data.updatedColumns || 0, updated_cells: data.updatedCells || 0 });
  } catch (error) { return Response.json({ status: "error", message: error.message }, { status: 500 }); }
}

async function strengthContext(env, url) {
  try {
    const date = url.searchParams.get("date") || null;
    return Response.json(await buildStrengthContext(env, date));
  } catch (error) {
    return Response.json({ status: "error", step: "strength_context", message: error.message }, { status: 500 });
  }
}
