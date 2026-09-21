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
  const rows = await db.prepare(\`
    SELECT workout_date, type, exercise, set_no, planned_kg, planned_reps,
           actual_kg, actual_reps, rpe, completed, note, source
    FROM strength_sets
    WHERE completed = 1
    ORDER BY workout_date ASC, sheet_row ASC, id ASC
  \`).all();

  const values = (rows.results || []).map(r => [
    cell(r.workout_date), cell(r.type), cell(r.exercise), cell(r.set_no),
    cell(r.planned_kg), cell(r.planned_reps), cell(r.actual_kg), cell(r.actual_reps),
    cell(r.rpe), r.completed ? "TRUE" : "FALSE", cell(r.note), cell(r.source)
  ]);

  const existing = await spreadsheetMetadata(accessToken);
  if (!existing.find(s => s.properties && s.properties.title === ALLSETS_NAME)) {
    await sheetsBatchUpdate(accessToken, { requests: [{ addSheet: { properties: { title: ALLSETS_NAME } } }] });
  }
  if (!existing.find(s => s.properties && s.properties.title === LOG_NAME)) {
    await sheetsBatchUpdate(accessToken, { requests: [{ addSheet: { properties: { title: LOG_NAME } } }] });
  }

  const allCurrent = await valuesRequest(accessToken, "'AllSets'!A1:L10000");
  const allValues = allCurrent.values || [];
  const hasAllHeader = allValues.length && String(allValues[0][0] || "").trim() === ALLSETS_HEADERS[0];
  const existingRows = hasAllHeader ? allValues.slice(1) : [];
  const key = row => [row[0], row[1], String(row[2] || "").trim().toLowerCase(), row[3], row[6], row[7], row[8], row[11]].map(v => String(v ?? "")).join("|");
  const known = new Set(existingRows.map(key));
  const additions = values.filter(row => { const k=key(row); if(known.has(k)) return false; known.add(k); return true; });
  if (!hasAllHeader) await valuesRequest(accessToken, "'AllSets'!A1:L1", "PUT", { values: [ALLSETS_HEADERS] }, "?valueInputOption=USER_ENTERED");
  if (additions.length) {
    await valuesRequest(accessToken, "'AllSets'!A" + (existingRows.length + 2) + ":L" + (existingRows.length + additions.length + 1), "PUT", { values: additions }, "?valueInputOption=USER_ENTERED");
  }

  const logHeaders = ["Datum","Trénink","Cvik","Série","Váha kg","Opakování","RPE","Poznámka"];
  const logValues = [logHeaders, ...(rows.results || []).map(r => [
    cell(r.workout_date), cell(r.type) === "WORK" ? "Silový" : cell(r.type),
    cell(r.exercise), cell(r.set_no), cell(r.actual_kg), cell(r.actual_reps), cell(r.rpe), cell(r.note)
  ])];
  await valuesRequest(accessToken, "'Log'!A1:H10000", "POST", {}, ":clear");
  await valuesRequest(accessToken, "'Log'!A1:H" + Math.max(1,logValues.length), "PUT", { values: logValues }, "?valueInputOption=USER_ENTERED");

  return {
    sheets: [ALLSETS_NAME, LOG_NAME],
    AllSets: { existingRows: existingRows.length, rowsAdded: additions.length, totalRows: existingRows.length + additions.length },
    Log: { rowsWritten: Math.max(0, logValues.length - 1), columns: logHeaders.length }
  };
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


const CVIKY_HEADERS = ["ID","Cvik","Svalová oblast","Pohybový vzor","Role","Priorita","Série","Min opak.","Max opak.","Cílové RPE","Krok váhy","Vybavení","Rotace","Poznámka","Video","Video název","Video URL"];

const GYM_CATALOG = [
  ["DB bench press","chest","horizontal_push","compound","A",3,6,10,8,1,"dumbbell","Hlavní tlak; 1 jednoručka"],
  ["Low row","back","horizontal_pull","compound","A",3,6,10,8,5,"machine","Hlavní tah; stroj"],
  ["DB shoulder press","shoulders","vertical_push","compound","A",3,6,10,8,1,"dumbbell","Volné váhy; 1 jednoručka"],
  ["Pivot leg press","quads","knee_dominant","compound","A",3,6,10,8,5,"machine","Hlavní cvik; stroj"],
  ["Prime prone leg curl","hamstrings","knee_flexion","isolation","A",3,8,15,8,2.5,"machine","Hamstringy; jednostranně pokud konstrukce dovolí"],
  ["Cable curl","biceps","elbow_flexion","isolation","B",3,8,15,8,2.5,"cable","Kladka"],
  ["DB curl","biceps","elbow_flexion","isolation","B",3,8,15,8,1,"dumbbell","Jednostranně"],
  ["Hammer curl","biceps","elbow_flexion","isolation","B",3,8,15,8,1,"dumbbell","Jednostranně"],
  ["Cable triceps extension","triceps","elbow_extension","isolation","B",3,8,15,8,2.5,"cable","Triceps; kladka"],
  ["Abs bench crunch","core","trunk_flexion","core","B",3,10,20,8,5,"machine","Core; stroj"],
  ["Prime flat chest press","chest","horizontal_push","compound","A",3,8,12,8,5,"machine","Prime stroj"],
  ["Prime shoulder press","shoulders","vertical_push","compound","A",3,8,12,8,5,"machine","Prime stroj"],
  ["Lat pulldown","back","vertical_pull","compound","A",3,8,12,8,2.5,"cable","Kladka shora"],
  ["Standing rowing machine","back","horizontal_pull","compound","A",3,8,12,8,5,"machine","Stojící veslovací stroj"],
  ["Pendulum squat","quads","knee_dominant","compound","A",3,6,10,8,2.5,"machine","Pendulum squat"],
  ["Prime leg extension","quads","knee_extension","isolation","B",2,10,15,8,2.5,"machine","Preferovat jednostranně"],
  ["Hip thrust","glutes","hip_extension","compound","A",3,6,12,8,5,"machine/barbell","Hýždě"],
  ["DB Romanian deadlift","hamstrings","hinge","compound","A",3,8,12,8,1,"dumbbell","1 jednoručka; hamstringy/hýždě"],
  ["Barbell Romanian deadlift","hamstrings","hinge","compound","A",3,6,10,8,2.5,"barbell","Osa; hamstringy/hýždě"],
  ["DB Bulgarian split squat","quads","unilateral_knee_dominant","compound","A",3,8,12,8,1,"dumbbell","Jednostranná síla"],
  ["Adduction machine","adductors","adduction","isolation","C",2,15,20,8,5,"machine","Stroj"],
  ["Abduction machine","abductors","abduction","isolation","C",2,15,20,8,5,"machine","Stroj"],
  ["Pec deck","chest","horizontal_push","isolation","B",3,10,15,8,5,"machine","Pec deck"],
  ["Rear delt pec deck","rear_delts","rear_delt","isolation","B",3,10,15,8,2.5,"machine","Reverse pec deck"],
  ["Cable lateral raise","side_delts","lateral_raise","isolation","B",3,10,15,8,2.5,"cable","Preferovat jednostranně"],
  ["Cable pullover","back","vertical_pull","isolation","B",2,10,15,8,2.5,"cable","Laty"],
  ["Cable rear delt fly","rear_delts","rear_delt","isolation","B",2,10,15,8,2.5,"cable","Preferovat jednostranně"],
  ["Pallof press","core","anti_rotation","core","C",3,10,15,8,2.5,"cable","Jednostranně"],
  ["Cable woodchop","core","rotation","core","C",2,8,12,8,2.5,"cable","Jednostranně"],
  ["Roman chair","core","trunk_extension","core","C",3,10,15,8,2.5,"machine","Hyperextenze"],
  ["Standing calf machine","calves","plantar_flexion","isolation","C",3,10,20,8,5,"machine","Lýtka"],
  ["Cable crunch","core","trunk_flexion","core","C",3,10,20,8,2.5,"cable","Core"]
];

async function ensureGymExerciseCatalog(accessToken) {
  const meta = await spreadsheetMetadata(accessToken);
  if (!meta.find(s => s.properties?.title === "Cviky")) {
    await sheetsBatchUpdate(accessToken, { requests: [{ addSheet: { properties: { title: "Cviky" } } }] });
  }
  const current = await valuesRequest(accessToken, "'Cviky'!A1:Q1000");
  const values = current.values || [];
  if (!values.length || String(values[0][1] || "").trim() !== "Cvik") {
    await valuesRequest(accessToken, "'Cviky'!A1:Q1", "PUT", { values: [CVIKY_HEADERS] }, "?valueInputOption=USER_ENTERED");
  }
  const existingNames = new Set(values.slice(1).map(r => String(r[1] || "").trim().toLocaleLowerCase("cs-CZ")).filter(Boolean));
  let maxId = 0;
  for (const r of values.slice(1)) {
    const m = String(r[0] || "").match(/E(\d+)/i);
    if (m) maxId = Math.max(maxId, Number(m[1]));
  }
  const additions = [];
  for (const item of GYM_CATALOG) {
    const [name, muscle, pattern, role, priority, sets, minReps, maxReps, targetRpe, step, equipment, note] = item;
    if (existingNames.has(name.toLocaleLowerCase("cs-CZ"))) continue;
    maxId++;
    additions.push(["E" + String(maxId).padStart(2,"0"),name,muscle,pattern,role,priority,sets,minReps,maxReps,targetRpe,step,equipment,"AUTO",note,"","",""]);
    existingNames.add(name.toLocaleLowerCase("cs-CZ"));
  }
  if (additions.length) {
    const start = values.length + 1;
    const end = start + additions.length - 1;
    await valuesRequest(accessToken, "'Cviky'!A" + start + ":Q" + end, "PUT", { values: additions }, "?valueInputOption=USER_ENTERED");
  }
  return { added: additions.length, totalCatalogEntries: existingNames.size };
}


async function refreshStrengthOverview(accessToken, db) {
  const last = await db.prepare(\`
    SELECT workout_date, COUNT(*) AS sets
    FROM strength_sets
    WHERE completed = 1
    GROUP BY workout_date
    ORDER BY workout_date DESC
    LIMIT 1
  \`).first();

  const recent = await db.prepare(\`
    SELECT workout_date, COUNT(*) AS sets
    FROM strength_sets
    WHERE completed = 1
    GROUP BY workout_date
    ORDER BY workout_date DESC
    LIMIT 10
  \`).all();

  const progression = await db.prepare(\`
    SELECT workout_date, exercise, actual_kg, actual_reps, rpe
    FROM strength_sets
    WHERE completed = 1 AND type = 'WORK'
    ORDER BY workout_date DESC, exercise ASC, set_no ASC
  \`).all();

  const latestByExercise = new Map();
  for (const r of progression.results || []) {
    if (!latestByExercise.has(r.exercise)) latestByExercise.set(r.exercise, r);
  }

  const rows = [
    ["ADAPTIVNÍ SILOVÝ TRÉNINK – PŘEHLED"],
    ["Aktualizováno", new Date().toISOString()],
    [],
    ["Poslední trénink", last?.workout_date || "—", "Dokončené série", last?.sets || 0],
    [],
    ["Nedávné tréninky", "Dokončené série"],
    ...(recent.results || []).map(r => [r.workout_date, r.sets]),
    [],
    ["Cvik", "Poslední datum", "Váha kg", "Opakování", "RPE"],
    ...Array.from(latestByExercise.entries()).map(([exercise, r]) => [exercise, r.workout_date, r.actual_kg ?? "", r.actual_reps ?? "", r.rpe ?? ""])
  ];

  await valuesRequest(accessToken, "'Přehled'!A1:K1000", "POST", {}, ":clear");
  await valuesRequest(accessToken, "'Přehled'!A1:E" + Math.max(1, rows.length), "PUT", { values: rows }, "?valueInputOption=USER_ENTERED");
  return { rowsWritten: rows.length, lastWorkout: last?.workout_date || null };
}

export async function maintainStrengthSheets(accessToken, db) {
  const sheets = await spreadsheetMetadata(accessToken);
  const deleteTitles = new Set(["List1", "List 1", "Návod"]);
  const deletions = sheets.filter(s => deleteTitles.has(s.properties && s.properties.title)).map(s => s.properties.sheetId);
  if (sheets.length - deletions.length < 1) deletions.pop();
  if (deletions.length) await sheetsBatchUpdate(accessToken, { requests: deletions.map(sheetId => ({ deleteSheet: { sheetId } })) });
  const catalog = await ensureGymExerciseCatalog(accessToken);
  const mirror = await mirrorStrengthHistoryToAllSets(accessToken, db);
  const overview = await refreshStrengthOverview(accessToken, db);
  const videoLinks = await repairStrengthSheetVideoLinks(accessToken);
  const videoDebug = await inspectExerciseVideoSource(accessToken);
  const workbookAudit = await auditWorkbook(accessToken);
  return { status: "ok", deletedSheets: sheets.filter(s => deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), preservedSheets: sheets.filter(s => !deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), catalog, overview, ...mirror, ...videoLinks, videoDebug, workbookAudit };
}
