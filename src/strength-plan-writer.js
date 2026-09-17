const SHEET_NAME = "Dnešní trénink";
const MAX_ROWS = 100;
const COLS = 13;

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
  if (row.length > COLS) throw new Error(`Workout row has more than ${COLS} columns`);
  const out = Array(COLS).fill("");
  for (let i = 0; i < row.length; i++) out[i] = row[i] == null ? "" : row[i];
  return out;
}

export async function writeStrengthPlan(accessToken, body, syncCurrent) {
  const date = String(body?.date || "").trim();
  const rows = body?.rows;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date; expected YYYY-MM-DD");
  if (!Array.isArray(rows) || rows.length < 1) throw new Error("rows must be a non-empty 2D array");
  if (rows.length > MAX_ROWS) throw new Error(`Too many workout rows; maximum is ${MAX_ROWS}`);

  // Preserve the previous workout's completed actuals before replacing the visible plan.
  const current = await syncCurrent();
  if (current?.status === "error") throw new Error(`Could not sync current workout before replacement: ${current.message}`);

  const normalizedRows = rows.map(normalizeRow);
  const clearRange = sheetRange("A8:M1000");
  await sheetsRequest(accessToken, clearRange, "POST", {}, ":clear");

  const writeRange = sheetRange(`A8:M${7 + normalizedRows.length}`);
  const result = await sheetsRequest(accessToken, writeRange, "PUT", { values: normalizedRows }, "?valueInputOption=USER_ENTERED");

  // Keep the existing sheet metadata layout; only update the explicit workout date.
  const dateRange = sheetRange("B3");
  await sheetsRequest(accessToken, dateRange, "PUT", { values: [[date]] }, "?valueInputOption=USER_ENTERED");

  return {
    status: "ok",
    sheet: SHEET_NAME,
    workoutDate: date,
    rowsWritten: normalizedRows.length,
    updatedRange: result.updatedRange || writeRange,
    previousWorkoutSynced: true
  };
}
