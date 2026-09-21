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
    ORDER BY workout_date ASC, sheet_row ASC, id ASC
  `).all();

  const values = (rows.results || []).map(r => [
    cell(r.workout_date), cell(r.type), cell(r.exercise), cell(r.set_no),
    cell(r.planned_kg), cell(r.planned_reps), cell(r.actual_kg), cell(r.actual_reps),
    cell(r.rpe), r.completed ? "TRUE" : "FALSE", cell(r.note), cell(r.source)
  ]);

  const existing = await spreadsheetMetadata(accessToken);
  const targets = [ALLSETS_NAME, LOG_NAME];
  const requests = [];
  for (const name of targets) {
    if (!existing.find(s => s.properties && s.properties.title === name)) {
      requests.push({ addSheet: { properties: { title: name } } });
    }
  }
  if (requests.length) await sheetsBatchUpdate(accessToken, { requests });

  const result = {};
  for (const name of targets) {
    const range = "'" + name + "'!A1:L10000";
    const current = await valuesRequest(accessToken, range);
    const currentValues = current.values || [];
    const hasHeader = currentValues.length && String(currentValues[0][0] || "").trim() === ALLSETS_HEADERS[0];
    const existingRows = hasHeader ? currentValues.slice(1) : [];
    const key = row => [
      row[0], row[1], String(row[2] || "").trim().toLowerCase(), row[3],
      row[6], row[7], row[8], row[11]
    ].map(v => String(v ?? "")).join("|");
    const known = new Set(existingRows.map(key));
    const additions = values.filter(row => {
      const k = key(row);
      if (known.has(k)) return false;
      known.add(k);
      return true;
    });

    if (!hasHeader) {
      await valuesRequest(accessToken, "'" + name + "'!A1:L1", "PUT", { values: [ALLSETS_HEADERS] }, "?valueInputOption=USER_ENTERED");
    }
    if (additions.length) {
      await valuesRequest(
        accessToken,
        "'" + name + "'!A" + (existingRows.length + 2) + ":L" + (existingRows.length + additions.length + 1),
        "PUT",
        { values: additions },
        "?valueInputOption=USER_ENTERED"
      );
    }
    result[name] = { existingRows: existingRows.length, rowsAdded: additions.length, totalRows: existingRows.length + additions.length };
  }

  return { sheets: targets, ...result };
}

async function auditWorkbook(accessToken) {
  const sheets = await spreadsheetMetadata(accessToken);
  const audit = [];
  for (const s of sheets) {
    const title = s.properties?.title;
    if (!title) continue;
    const range = "'" + title.replace(/'/g, "''") + "'!A1:L15";
    const data = await valuesRequest(accessToken, range);
    audit.push({
      title,
      rowCount: s.properties?.gridProperties?.rowCount ?? null,
      columnCount: s.properties?.gridProperties?.columnCount ?? null,
      sample: (data.values || []).slice(0, 15)
    });
  }
  return audit;
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
  const workbookAudit = await auditWorkbook(accessToken);
  return { status: "ok", deletedSheets: sheets.filter(s => deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), preservedSheets: sheets.filter(s => !deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), ...mirror, ...videoLinks, videoDebug, workbookAudit };
}
