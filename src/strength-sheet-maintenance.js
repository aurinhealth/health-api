import { repairStrengthSheetVideoLinks, inspectExerciseVideoSource } from "./strength-plan-writer.js";
const SPREADSHEET_ID = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
const ALLSETS_NAME = "AllSets";
const LOG_NAME = "Log";
const ALLSETS_HEADERS = ["Datum","Typ","Cvik","Série","Plán kg","Plán reps","Skutečně kg","Skutečně reps","RPE","Hotovo","Poznámka","Zdroj"];

async function sheetsBatchUpdate(accessToken, body) {
  const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(SPREADSHEET_ID) + ":batchUpdate";
  const response = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error("Google Sheets batchUpdate HTTP " + response.status + ": " + JSON.stringify(data.error || data));
  return data;
}

async function valuesRequest(accessToken, range, method = "GET", body = null, query = "") {
  const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(SPREADSHEET_ID) + "/values/" + encodeURIComponent(range) + query;
  const response = await fetch(url, { method, headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }, ...(body == null ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error("Google Sheets values HTTP " + response.status + ": " + JSON.stringify(data.error || data));
  return data;
}

async function spreadsheetMetadata(accessToken) {
  const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(SPREADSHEET_ID) + "?fields=sheets(properties(sheetId,title))";
  const response = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
  const data = await response.json();
  if (!response.ok) throw new Error("Google Sheets metadata HTTP " + response.status + ": " + JSON.stringify(data.error || data));
  return data.sheets || [];
}

function cell(v) { return v == null ? "" : v; }

export async function mirrorStrengthHistoryToAllSets(accessToken, db) {
  const rows = await db.prepare(`
    SELECT workout_date, type, exercise, set_no, planned_kg, planned_reps,
           actual_kg, actual_reps, rpe, completed, note, source
    FROM strength_sets
    WHERE completed = 1
    ORDER BY workout_date DESC, sheet_row ASC, id ASC
  `).all();

  const values = [ALLSETS_HEADERS, ...(rows.results || []).map(r => [
    cell(r.workout_date), cell(r.type), cell(r.exercise), cell(r.set_no),
    cell(r.planned_kg), cell(r.planned_reps), cell(r.actual_kg), cell(r.actual_reps),
    cell(r.rpe), r.completed ? "TRUE" : "FALSE", cell(r.note), cell(r.source)
  ])];

  const existing = await spreadsheetMetadata(accessToken);
  const targets = [
    { name: ALLSETS_NAME, clear: "'AllSets'!A1:L10000" },
    { name: LOG_NAME, clear: "'Log'!A1:L10000" }
  ];
  const requests = [];
  for (const target of targets) {
    if (!existing.find(s => s.properties && s.properties.title === target.name)) {
      requests.push({ addSheet: { properties: { title: target.name } } });
    }
  }
  if (requests.length) await sheetsBatchUpdate(accessToken, { requests });

  for (const target of targets) {
    await valuesRequest(accessToken, target.clear, "POST", {}, ":clear");
    await valuesRequest(
      accessToken,
      "'" + target.name + "'!A1:L" + Math.max(1, values.length),
      "PUT",
      { values },
      "?valueInputOption=USER_ENTERED"
    );
  }
  return {
    sheets: [ALLSETS_NAME, LOG_NAME],
    rowsWritten: Math.max(0, values.length - 1),
    totalRows: values.length
  };
}

export async function maintainStrengthSheets(accessToken, db) {
  const sheets = await spreadsheetMetadata(accessToken);
  const deleteTitles = new Set(["List1", "List 1", "Návod"]);
  const deletions = sheets.filter(s => deleteTitles.has(s.properties && s.properties.title)).map(s => s.properties.sheetId);
  if (sheets.length - deletions.length < 1) deletions.pop();
  if (deletions.length) await sheetsBatchUpdate(accessToken, { requests: deletions.map(sheetId => ({ deleteSheet: { sheetId } })) });
  const mirror = await mirrorStrengthHistoryToAllSets(accessToken, db);
  const videoLinks = await repairStrengthSheetVideoLinks(accessToken);
  const videoDebug = await inspectExerciseVideoSource(accessToken);
  return { status: "ok", deletedSheets: sheets.filter(s => deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), preservedSheets: sheets.filter(s => !deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), ...mirror, ...videoLinks, videoDebug };
}
