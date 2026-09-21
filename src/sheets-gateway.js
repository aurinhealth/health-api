import app from "./v400.js";
import { buildStrengthContext } from "./strength-context.js";
import { getStrengthHistory, syncStrengthSheet, parseStrengthSheet, importStrengthHistory } from "./strength-history.js";
import { writeStrengthPlan } from "./strength-plan-writer.js";
import { generateStrengthPlan, EXERCISES } from "./strength-generator.js";
import { analyzeCompletedWorkout, findExerciseAlternatives, estimateStartingLoad, EXERCISE_INTELLIGENCE } from "./strength-intelligence.js";
import { maintainStrengthSheets, mirrorStrengthHistoryToAllSets } from "./strength-sheet-maintenance.js";

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
    if (url.pathname === "/strength/sheet/simplify" && request.method === "POST") return simplifyStrengthSheet(env);
    if (url.pathname === "/strength/generate-plan" && request.method === "POST") return generateStrengthPlanRoute(env, request, url);
    if (url.pathname === "/strength/sync" && request.method === "POST") return syncStrength(env);
    if (url.pathname === "/strength/history/import" && request.method === "POST") return importStrengthHistoryRoute(env, request);
    if (url.pathname === "/strength/sheets/maintenance" && request.method === "POST") return maintainStrengthSheetsRoute(env, request);
    if (url.pathname === "/strength/history" && request.method === "GET") return strengthHistory(env, url);
    if (url.pathname === "/strength/context" && request.method === "GET") return strengthContext(env, url);
    if (url.pathname === "/strength/analyze" && request.method === "POST") return analyzeStrengthRoute(env, request);
    if (url.pathname === "/strength/alternatives" && request.method === "POST") return alternativesRoute(env, request);
    if (url.pathname === "/strength/substitute" && request.method === "POST") return substituteRoute(env, request);
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
  return normalized === `'${SHEET_NAME}'!A3:M5` || normalized === `'${SHEET_NAME}'!A8:M1000` || normalized === `'${SHEET_NAME}'!A7:K7`;
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

async function simplifyStrengthSheet(env) {
  try {
    const data = await fetchTodayValues(env);
    const parsed = parseStrengthSheet(data.values);
    if (!parsed.date) return Response.json({ status: "error", message: "Workout date not found in sheet" }, { status: 400 });

    // Sync before structural changes so no completed set is lost.
    const sync = await syncStrengthSheet(env.DB, data.values);
    if (sync.status !== "ok") return Response.json(sync, { status: 500 });

    const accessToken = await getGoogleAccessToken(env);
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}:batchUpdate`;
    const response = await fetch(batchUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [
        {
          deleteDimension: {
            range: { sheetId: Number(SHEET_GID), dimension: "COLUMNS", startIndex: 11, endIndex: 13 }
          }
        }
      ] })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Google Sheets structural update HTTP ${response.status}: ${JSON.stringify(result.error || result)}`);

    const headerRange = sheetRange("A7:K7");
    await sheetsRequest(accessToken, headerRange, "PUT", { values: [["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"]] }, "?valueInputOption=USER_ENTERED");

    return Response.json({ status: "ok", sheet: SHEET_NAME, workoutDate: parsed.date, syncedCompletedRows: sync.completedRows, removedColumns: ["Náhrada cviku", "Provedení"], visibleColumns: ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"] });
  } catch (error) { return Response.json({ status: "error", step: "strength_sheet_simplify", message: error.message }, { status: 500 }); }
}

function sheetRange(a1) { return `'${SHEET_NAME.replace(/'/g, "''")}'!${a1}`; }

async function sheetsRequest(accessToken, range, method = "GET", body = null, query = "") {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}${query}`;
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, ...(body == null ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  return data;
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
    const options = {
      focus: body?.focus ? String(body.focus) : undefined,
      forceProtectLegs: body?.forceProtectLegs === true,
      durationMinutes: body?.durationMinutes == null ? undefined : Number(body.durationMinutes),
      maxExercises: body?.maxExercises == null ? undefined : Number(body.maxExercises),
      excludeExercises: Array.isArray(body?.excludeExercises) ? body.excludeExercises.map(String) : []
    };
    const plan = generateStrengthPlan(context, options);
    if (body?.preview === true) return Response.json({ status: "ok", preview: true, context, plan });
    const accessToken = await getGoogleAccessToken(env);
    const result = await writeStrengthPlan(accessToken, { date: plan.date, rows: plan.rows }, async () => {
      const data = await fetchTodayValues(env);
      return syncStrengthSheet(env.DB, data.values);
    });
    return Response.json({ ...result, planName: plan.planName, rationale: plan.rationale, loadFactor: plan.loadFactor, loadEstimates: plan.loadEstimates });
  } catch (error) { return Response.json({ status: "error", step: "strength_generate_plan", message: error.message }, { status: 500 }); }
}

async function syncStrength(env) {
  try {
    const data = await fetchTodayValues(env);
    const result = await syncStrengthSheet(env.DB, data.values);
    return Response.json({ ...result, sourceRange: data.range });
  } catch (error) { return Response.json({ status: "error", step: "strength_sync", message: error.message }, { status: 500 }); }
}

async function importStrengthHistoryRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await importStrengthHistory(env.DB, body);
    if (result.status === "ok") {
      const accessToken = await getGoogleAccessToken(env);
      const mirror = await mirrorStrengthHistoryToAllSets(accessToken, env.DB);
      return Response.json({ ...result, historySheet: mirror });
    }
    return Response.json(result);
  } catch (error) {
    return Response.json({ status: "error", step: "strength_history_import", message: error.message }, { status: 500 });
  }
}

async function maintainStrengthSheetsRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.historyImport?.date && Array.isArray(body.historyImport.sets)) await importStrengthHistory(env.DB, body.historyImport);
    const accessToken = await getGoogleAccessToken(env);
    return Response.json(await maintainStrengthSheets(accessToken, env.DB));
  } catch (error) {
    return Response.json({ status: "error", step: "strength_sheet_maintenance", message: error.message }, { status: 500 });
  }
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

async function analyzeStrengthRoute(env, request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await fetchTodayValues(env);
    const parsed = parseStrengthSheet(data.values);
    const sync = await syncStrengthSheet(env.DB, data.values);
    if (sync.status !== "ok") return Response.json(sync, { status: 500 });
    const history = await getStrengthHistory(env.DB, 300);
    const analysis = analyzeCompletedWorkout(parsed, history);
    return Response.json({ status: "ok", command: body?.command || "analyze", sync, analysis });
  } catch (error) { return Response.json({ status: "error", step: "strength_analyze", message: error.message }, { status: 500 }); }
}

async function alternativesRoute(env, request) {
  try {
    const body = await request.json();
    const exercise = String(body?.exercise || "").trim();
    const muscle = String(body?.muscle || "").trim() || null;
    if (!exercise && !muscle) return Response.json({ status: "error", message: "Provide exercise or muscle" }, { status: 400 });
    const history = await getStrengthHistory(env.DB, 300);
    const alternatives = findExerciseAlternatives(exercise, history, muscle);
    return Response.json({ status: "ok", exercise: exercise || null, muscle: muscle || EXERCISE_INTELLIGENCE[exercise]?.muscle || null, alternatives });
  } catch (error) { return Response.json({ status: "error", step: "strength_alternatives", message: error.message }, { status: 500 }); }
}

async function substituteRoute(env, request) {
  try {
    const body = await request.json();
    const from = String(body?.from || "").trim();
    const to = String(body?.to || "").trim();
    const muscle = String(body?.muscle || "").trim() || null;
    if (!from) return Response.json({ status: "error", message: "Missing from exercise" }, { status: 400 });
    if (!to && !muscle) return Response.json({ status: "error", message: "Provide to exercise or muscle" }, { status: 400 });

    const target = to || findExerciseAlternatives(from, [], muscle)[0]?.name;
    if (!target || !EXERCISES[target] || !EXERCISE_INTELLIGENCE[target]) return Response.json({ status: "error", message: `Replacement exercise is not in the active catalogue: ${target || "none"}` }, { status: 400 });
    if (!EXERCISES[from] && !EXERCISE_INTELLIGENCE[from]) return Response.json({ status: "error", message: `Original exercise is not in the active catalogue: ${from}` }, { status: 400 });

    const data = await fetchTodayValues(env);
    const parsed = parseStrengthSheet(data.values);
    if (!parsed.date) return Response.json({ status: "error", message: "Workout date not found in sheet" }, { status: 400 });
    const history = await getStrengthHistory(env.DB, 300);
    const context = await buildStrengthContext(env, parsed.date);
    const factor = Number(context?.cycling ? 1 : 1);
    const def = EXERCISES[target];
    const estimate = estimateStartingLoad({ exercise: target, history, targetReps: def.reps, fallbackKg: def.baseKg, loadFactor: factor });

    const sourceRows = parsed.rows.filter(r => r.exercise === from);
    if (!sourceRows.length) return Response.json({ status: "error", message: `Exercise not found in today's sheet: ${from}` }, { status: 404 });
    const sourceWork = sourceRows.filter(r => r.type === "WORK");
    const firstIndex = parsed.rows.findIndex(r => r.exercise === from);
    const before = parsed.rows.slice(0, firstIndex).filter(r => r.exercise !== from);
    const after = parsed.rows.slice(firstIndex).filter(r => r.exercise !== from);
    const replacementRows = [];
    const fmt = x => x == null ? "" : String(x).replace(".", ",");
    if (def.warmup) {
      const kg = estimate.kg ?? def.baseKg;
      replacementRows.push(["WARMUP", target, "1", fmt(Math.max(2, Math.round(kg * 0.4 * 2) / 2)), "8", "", "", "", "FALSE", "[WARMUP]", "🎥 Video"]);
      replacementRows.push(["WARMUP", target, "2", fmt(Math.max(2, Math.round(kg * 0.65 * 2) / 2)), "5", "", "", "", "FALSE", "[WARMUP]", ""]);
      replacementRows.push(["WARMUP", target, "3", fmt(Math.max(2, Math.round(kg * 0.8 * 2) / 2)), "3", "", "", "", "FALSE", "[WARMUP]", ""]);
    }
    const workCount = sourceWork.length || def.sets;
    for (let i = 0; i < workCount; i++) replacementRows.push(["WORK", target, String(i + 1), estimate.kg == null ? "" : fmt(estimate.kg), def.reps, "", "", "", "FALSE", "", ""]);

    const replacementPlan = [...before.map(r => [r.type, r.exercise, r.setNo == null ? "" : String(r.setNo), r.plannedKg == null ? "" : fmt(r.plannedKg), r.plannedReps, "", "", "", "FALSE", r.note, r.video]), ...replacementRows, ...after.map(r => [r.type, r.exercise, r.setNo == null ? "" : String(r.setNo), r.plannedKg == null ? "" : fmt(r.plannedKg), r.plannedReps, "", "", "", "FALSE", r.note, r.video])];
    const accessToken = await getGoogleAccessToken(env);
    const result = await writeStrengthPlan(accessToken, { date: parsed.date, rows: replacementPlan }, async () => syncStrengthSheet(env.DB, data.values));
    return Response.json({ ...result, replaced: from, replacement: target, estimate });
  } catch (error) { return Response.json({ status: "error", step: "strength_substitute", message: error.message }, { status: 500 }); }
}
