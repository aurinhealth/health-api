const SHEET_NAME = "Dnešní trénink";
const MAX_ROWS = 100;
const COLS = 11;
const SPREADSHEET_ID = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
const SHEET_ID = 585189491;

// Visible workout columns only. Internal substitution/execution metadata stays in D1/backend.
// 0 Typ, 1 Cvik, 2 Série, 3 Plán kg, 4 Plán reps, 5 Skutečně kg,
// 6 Skutečně reps, 7 RPE, 8 Hotovo, 9 Poznámka, 10 Video
function sheetRange(a1) {
  return `'${SHEET_NAME.replace(/'/g, "''")}'!${a1}`;
}

async function sheetsRequest(accessToken, range, method = "GET", body = null, query = "") {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}${query}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    ...(body == null ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  return data;
}

async function sheetsBatchUpdate(accessToken, body) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}:batchUpdate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets batchUpdate HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  return data;
}


export async function fetchExerciseVideoLinks(accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}?includeGridData=true&ranges=${encodeURIComponent("Cviky!A1:Z1000")}&fields=sheets.properties.title,sheets.data.rowData.values.effectiveValue,sheets.data.rowData.values.userEnteredValue,sheets.data.rowData.values.hyperlink,sheets.data.rowData.values.userEnteredFormat.textFormat.link`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets Cviky read HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  const sheet = (data.sheets || []).find(s => s.properties?.title === "Cviky");
  if (!sheet) return new Map();

  const rows = sheet.data?.[0]?.rowData || [];
  const textOf = cell => {
    const v = cell?.effectiveValue || cell?.userEnteredValue;
    if (!v) return "";
    return v.stringValue ?? v.numberValue ?? v.boolValue ?? v.formulaValue ?? "";
  };
  const norm = value => String(value || "").trim().toLocaleLowerCase("cs-CZ").replace(/\\s+/g, " ");
  const map = new Map();

  // Do not depend on the exact Cviky header/column layout. For every row, find a
  // real hyperlink and associate it with all meaningful text cells in that row.
  for (const row of rows) {
    const cells = row.values || [];
    const linked = cells.find(cell =>
      typeof cell?.hyperlink === "string" && /^https?:\/\//i.test(cell.hyperlink)
    );
    const linkedUrl =
      linked?.hyperlink ||
      cells.find(cell => typeof cell?.userEnteredFormat?.textFormat?.link?.uri === "string")
        ?.userEnteredFormat?.textFormat?.link?.uri ||
      cells.map(textOf).find(value => /^https?:\/\//i.test(String(value))) ||
      cells.map(textOf).map(value => String(value).match(/^=HYPERLINK\(\s*"([^"]+)"/i)?.[1]).find(Boolean) ||
      null;
    if (!linkedUrl) continue;

    for (const cell of cells) {
      const value = norm(textOf(cell));
      if (value && value.length >= 3) map.set(value, linkedUrl);
    }
  }

  return map;
}

export async function repairStrengthSheetVideoLinks(accessToken) {
  const current = await sheetsRequest(accessToken, sheetRange("A1:K1000"));
  const values = current.values || [];
  const links = await fetchExerciseVideoLinks(accessToken);
  let repaired = 0;
  for (let i = 7; i < values.length; i++) {
    const row = values[i] || [];
    const exercise = String(row[1] || "").trim().toLocaleLowerCase("cs-CZ");
    const url = links.get(exercise);
    if (!url) continue;
    if (row[10] === "🎥 Video" || !row[10]) {
      const target = sheetRange("K" + (i + 1));
      await sheetsRequest(accessToken, target, "PUT", { values: [[hyperlinkFormula(url)]] }, "?valueInputOption=USER_ENTERED");
      repaired++;
    }
  }
  return { repairedVideoLinks: repaired };
}

function hyperlinkFormula(url, label = "🎥 Video") {
  const safeUrl = String(url).replace(/"/g, '""');
  const safeLabel = String(label).replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}
async function configureHotovoCheckboxes(accessToken, rowCount) {
  // Clear any old validation in the whole workout area first. This prevents stale
  // checkboxes from remaining below a newly generated shorter workout.
  await sheetsBatchUpdate(accessToken, {
    requests: [
      {
        setDataValidation: {
          range: {
            sheetId: SHEET_ID,
            startRowIndex: 7,
            endRowIndex: 1000,
            startColumnIndex: 8,
            endColumnIndex: 9
          },
          rule: null
        }
      },
      {
        setDataValidation: {
          range: {
            sheetId: SHEET_ID,
            startRowIndex: 7,
            endRowIndex: 7 + rowCount,
            startColumnIndex: 8,
            endColumnIndex: 9
          },
          rule: {
            condition: {
              type: "BOOLEAN"
            },
            showCustomUi: true,
            strict: true
          }
        }
      }
    ]
  });
}

function normalizeRow(row) {
  if (!Array.isArray(row)) throw new Error("Each workout row must be an array");
  // Generator may still provide legacy 13-column rows. Keep only the user-facing fields,
  // including Video, and intentionally discard backend-only Náhrada cviku / Provedení.
  const source = Array(COLS).fill("");
  for (let i = 0; i < Math.min(row.length, COLS); i++) source[i] = row[i] == null ? "" : row[i];
  return source;
}

export async function writeStrengthPlan(accessToken, body, syncCurrent) {
  const date = String(body?.date || "").trim();
  const rows = body?.rows;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date; expected YYYY-MM-DD");
  if (!Array.isArray(rows) || rows.length < 1) throw new Error("rows must be a non-empty 2D array");
  if (rows.length > MAX_ROWS) throw new Error(`Too many workout rows; maximum is ${MAX_ROWS}`);

  // Sync the current visible sheet before replacing it so completed sets are preserved in D1.
  const current = await syncCurrent();
  if (current?.status === "error") throw new Error(`Could not sync current workout before replacement: ${current.message}`);

  const videoLinks = await fetchExerciseVideoLinks(accessToken);
  const normalizedRows = rows.map(normalizeRow).map(row => {
    const url = videoLinks.get(String(row[1] || "").trim().toLocaleLowerCase("cs-CZ"));
    if (url && (row[10] === "🎥 Video" || !row[10])) row[10] = hyperlinkFormula(url);
    return row;
  });
  const clearRange = sheetRange("A8:M1000");
  await sheetsRequest(accessToken, clearRange, "POST", {}, ":clear");

  const writeRange = sheetRange(`A8:K${7 + normalizedRows.length}`);
  const result = await sheetsRequest(accessToken, writeRange, "PUT", { values: normalizedRows }, "?valueInputOption=USER_ENTERED");

  // Hotovo is a user-controlled checkbox column. The API creates the checkbox validation
  // for the newly generated rows and does not touch the column during normal syncing.
  await configureHotovoCheckboxes(accessToken, normalizedRows.length);

  // Keep the existing metadata area and update only the explicit workout date.
  const dateRange = sheetRange("B3");
  await sheetsRequest(accessToken, dateRange, "PUT", { values: [[date]] }, "?valueInputOption=USER_ENTERED");

  return {
    status: "ok",
    sheet: SHEET_NAME,
    workoutDate: date,
    rowsWritten: normalizedRows.length,
    visibleColumns: COLS,
    updatedRange: result.updatedRange || writeRange,
    checkboxesConfigured: true,
    previousWorkoutSynced: true
  };
}
