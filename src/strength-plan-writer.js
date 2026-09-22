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
  const norm = value => String(value || "").trim().toLocaleLowerCase("cs-CZ").replace(/\s+/g, " ");
  const map = new Map();

  // Cviky layout: B = Cvik, O = Video hyperlink, Q = Video URL.
  // Prefer the explicit Video URL column, then fall back to the hyperlink metadata.
  for (const row of rows) {
    const cells = row.values || [];
    const exercise = norm(textOf(cells[1]));
    if (!exercise) continue;
    const explicitUrl = String(textOf(cells[16]) || "").trim();
    const videoLink =
      (typeof cells[14]?.hyperlink === "string" && cells[14].hyperlink) ||
      cells[14]?.userEnteredFormat?.textFormat?.link?.uri ||
      explicitUrl;
    if (/^https?:\/\//i.test(videoLink)) map.set(exercise, videoLink);
  }

  return map;
}

export async function inspectExerciseVideoSource(accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}?includeGridData=true&ranges=${encodeURIComponent("Cviky!A1:Z20")}&fields=sheets.properties.title,sheets.data.rowData.values.effectiveValue,sheets.data.rowData.values.userEnteredValue,sheets.data.rowData.values.hyperlink,sheets.data.rowData.values.userEnteredFormat.textFormat.link`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets Cviky debug HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  const sheet = (data.sheets || []).find(s => s.properties?.title === "Cviky");
  const rows = (sheet?.data?.[0]?.rowData || []).slice(0, 20);
  const textOf = cell => {
    const v = cell?.effectiveValue || cell?.userEnteredValue;
    if (!v) return "";
    return v.stringValue ?? v.numberValue ?? v.boolValue ?? v.formulaValue ?? "";
  };
  return rows.map((row, index) => ({
    row: index + 1,
    cells: (row.values || []).map(cell => ({
      text: textOf(cell),
      hyperlink: cell?.hyperlink || null,
      richLink: cell?.userEnteredFormat?.textFormat?.link?.uri || null
    }))
  }));
}

export async function repairStrengthSheetVideoLinks(accessToken) {
  const current = await sheetsRequest(accessToken, sheetRange("A1:K1000"));
  const values = current.values || [];
  const links = await fetchExerciseVideoLinks(accessToken);
  const output = [];
  const unmatchedExercises = new Set();

  // One read + one bulk write instead of one Google API call per row.
  for (let i = 7; i < values.length; i++) {
    const row = values[i] || [];
    const exercise = String(row[1] || "").trim().toLocaleLowerCase("cs-CZ");
    const url = links.get(exercise) || (exercise ? fallbackVideoUrl(exercise) : "");
    if (!links.has(exercise) && exercise) unmatchedExercises.add(exercise);
    output.push([url ? hyperlinkFormula(url) : ""]);
  }

  if (output.length) {
    await sheetsRequest(
      accessToken,
      sheetRange("K8:K" + (7 + output.length)),
      "PUT",
      { values: output },
      "?valueInputOption=USER_ENTERED"
    );
  }

  return {
    repairedVideoLinks: output.filter(r => r[0]).length,
    videoLinkCandidates: links.size,
    unmatchedExercises: Array.from(unmatchedExercises).slice(0, 50)
  };
}

function fallbackVideoUrl(exercise) {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(String(exercise || "").trim() + " exercise technique");
}

function hyperlinkFormula(url, label = "🎥 Video") {
  const safeUrl = String(url).replace(/"/g, '""');
  const safeLabel = String(label).replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}";"${safeLabel}")`;
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

async function writeWorkoutHeader(accessToken, body, date) {
  const planName = String(body?.planName || "Dnešní trénink").trim();
  const protectedLegs = body?.protectedLegs === true;
  const loadFactor = Number(body?.loadFactor);
  const loadText = Number.isFinite(loadFactor) ? loadFactor.toFixed(2).replace(".", ",") : "—";
  const rationale = String(body?.rationale || "").trim();

  await sheetsRequest(accessToken, sheetRange("A1:K7"), "POST", {}, ":clear");

  const title = "ADAPTIVNÍ SILOVÝ TRÉNINK";
  const subtitle = planName + "  •  " + date.split("-").reverse().join(". ");
  const rows = [
    [title],
    [subtitle],
    ["Datum", date, "Plán", planName, "Nohy", protectedLegs ? "CHRÁNĚNO" : "NORMÁLNĚ", "Load", loadText],
    ["Poznámka", rationale],
    [],
    [],
    ["Typ","Cvik","Série","Plán kg","Plán reps","Skutečně kg","Skutečně reps","RPE","Hotovo","Poznámka","Video"]
  ];

  await sheetsRequest(accessToken, sheetRange("A1:K7"), "PUT", { values: rows }, "?valueInputOption=USER_ENTERED");
}

function normalizeRow(row) {
  if (!Array.isArray(row)) throw new Error("Each workout row must be an array");
  // Generator may still provide legacy 13-column rows. Keep only the user-facing fields,
  // including Video, and intentionally discard backend-only Náhrada cviku / Provedení.
  const source = Array(COLS).fill("");
  for (let i = 0; i < Math.min(row.length, COLS); i++) source[i] = row[i] == null ? "" : row[i];
  return source;
}

export async function writeStrengthPlan(accessToken, body) {
  const date = String(body?.date || "").trim();
  const rows = body?.rows;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date; expected YYYY-MM-DD");
  if (!Array.isArray(rows) || rows.length < 1) throw new Error("rows must be a non-empty 2D array");
  if (rows.length > MAX_ROWS) throw new Error(`Too many workout rows; maximum is ${MAX_ROWS}`);

  // Generation is intentionally NOT a save/sync operation.
  // The caller must explicitly sync a completed workout before it is archived.
  const videoLinks = await fetchExerciseVideoLinks(accessToken);
  const normalizedRows = rows.map(normalizeRow).map(row => {
    const url = videoLinks.get(String(row[1] || "").trim().toLocaleLowerCase("cs-CZ")) || fallbackVideoUrl(row[1]);
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

  await writeWorkoutHeader(accessToken, body, date);

  return {
    status: "ok",
    sheet: SHEET_NAME,
    workoutDate: date,
    rowsWritten: normalizedRows.length,
    visibleColumns: COLS,
    updatedRange: result.updatedRange || writeRange,
    checkboxesConfigured: true,
    previousWorkoutSynced: false
  };
}
