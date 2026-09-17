const SHEET_NAME = "Dnešní trénink";
const MAX_ROWS = 100;
const COLS = 11;

// Visible workout columns only. Internal substitution/execution metadata stays in D1/backend.
// 0 Typ, 1 Cvik, 2 Série, 3 Plán kg, 4 Plán reps, 5 Skutečně kg,
// 6 Skutečně reps, 7 RPE, 8 Hotovo, 9 Poznámka, 10 Video
function sheetRange(a1) {
  return `'${SHEET_NAME.replace(/'/g, "''")}'!${a1}`;
}

async function sheetsRequest(accessToken, range, method = "GET", body = null, query = "") {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent("1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw")}/values/${encodeURIComponent(range)}${query}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    ...(body == null ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  return data;
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

  const normalizedRows = rows.map(normalizeRow);
  const clearRange = sheetRange("A8:M1000");
  await sheetsRequest(accessToken, clearRange, "POST", {}, ":clear");

  const writeRange = sheetRange(`A8:K${7 + normalizedRows.length}`);
  const result = await sheetsRequest(accessToken, writeRange, "PUT", { values: normalizedRows }, "?valueInputOption=USER_ENTERED");

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
    previousWorkoutSynced: true
  };
}
