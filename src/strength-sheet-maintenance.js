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
  await valuesRequest(accessToken, "'Log'!A1:Z10000", "POST", {}, ":clear");
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
  ["DB bench press","chest","horizontal_push","compound","A",3,6,10,8,1,"dumbbell","Jednoručky + polohovací lavice"],
  ["Barbell bench press","chest","horizontal_push","compound","A",3,6,10,8,2.5,"barbell","Benchpress flat + osa"],
  ["DB incline press","chest","incline_push","compound","B",3,8,12,8,1,"dumbbell","Jednoručky + polohovací lavice"],
  ["Chest flat press Prime","chest","horizontal_push","compound","A",3,8,12,8,5,"machine","Chest flat press Prime"],
  ["Low row","back","horizontal_pull","compound","A",3,6,12,8,2.5,"cable/machine","Lat pulldown / low row stanice"],
  ["Lat pulldown","back","vertical_pull","compound","A",3,8,12,8,2.5,"cable/machine","Lat pulldown / low row stanice"],
  ["Standing rowing machine","back","horizontal_pull","compound","A",3,8,12,8,5,"machine","Rowing stroj na záda vestoje"],
  ["DB shoulder press","shoulders","vertical_push","compound","A",3,6,12,8,1,"dumbbell","Jednoručky + lavice"],
  ["Shoulder press Prime","shoulders","vertical_push","compound","A",3,8,12,8,5,"machine","Shoulder press Prime"],
  ["Standing multi flight","shoulders","shoulder_abduction","isolation","B",3,10,15,8,2.5,"machine/cable","Roztahování na ramena"],
  ["Pec deck","chest","horizontal_adduction","isolation","B",3,10,15,8,5,"machine","Pec deck"],
  ["Rear delt pec deck","rear_delts","horizontal_abduction","isolation","B",3,10,15,8,2.5,"machine","Reverse/rear-delt část pec decku"],
  ["Pendulum squat","quads","knee_dominant","compound","A",3,6,10,8,2.5,"machine","Pendulum squat"],
  ["Hip thrust","glutes","hip_extension","compound","A",3,6,12,8,5,"machine/barbell","Hip thrust stanoviště"],
  ["Pivot leg press","quads","knee_dominant","compound","A",3,6,12,8,5,"machine","Pivot leg press"],
  ["Leg extension Prime","quads","knee_extension","isolation","B",2,10,15,8,2.5,"machine","Leg extension Prime; preferovat jednostranně"],
  ["Prone leg curl Prime","hamstrings","knee_flexion","isolation","A",3,8,15,8,2.5,"machine","Prone leg curl Prime; preferovat jednostranně"],
  ["DB Romanian deadlift","hamstrings","hip_hinge","compound","A",3,8,12,8,1,"dumbbell","Jednoručky"],
  ["Barbell Romanian deadlift","hamstrings","hip_hinge","compound","A",3,6,10,8,2.5,"barbell","Rovná osa + kotouče"],
  ["DB Bulgarian split squat","quads","unilateral_knee_dominant","compound","A",3,8,12,8,1,"dumbbell","Jednoručky; jednostranně"],
  ["Adduction machine","adductors","adduction","isolation","C",2,15,20,8,5,"machine","Adduction"],
  ["Abduction machine","abductors","abduction","isolation","C",2,15,20,8,5,"machine","Abduction"],
  ["Standing calf raise","calves","plantar_flexion","isolation","C",3,10,20,8,5,"machine/bodyweight","Lýtka v polostoji"],
  ["DB curl","biceps","elbow_flexion","isolation","B",3,8,15,8,1,"dumbbell","Jednoručky; jednostranně"],
  ["Hammer curl","biceps","elbow_flexion","isolation","B",3,8,15,8,1,"dumbbell","Jednoručky; jednostranně"],
  ["Cable curl","biceps","elbow_flexion","isolation","B",3,8,15,8,2.5,"cable","Multi-station kladka"],
  ["Cable triceps extension","triceps","elbow_extension","isolation","B",3,8,15,8,2.5,"cable","Multi-station kladka"],
  ["Abs bench crunch","core","trunk_flexion","core","C",3,10,20,8,5,"machine","Abs lavička"],
  ["Roman chair","core","trunk_extension","core","C",3,10,15,8,2.5,"machine","Roman chair"],
  ["Cable crunch","core","trunk_flexion","core","C",3,10,20,8,2.5,"cable","Multi-station kladka"],
  ["Pallof press","core","anti_rotation","core","C",3,10,15,8,2.5,"cable","Multi-station kladka"],
  ["Cable woodchop","core","rotation","core","C",2,8,12,8,2.5,"cable","Multi-station kladka"]
];

async function ensureGymExerciseCatalog(accessToken) {
  const meta = await spreadsheetMetadata(accessToken);
  if (!meta.find(s => s.properties?.title === "Cviky")) {
    await sheetsBatchUpdate(accessToken, { requests: [{ addSheet: { properties: { title: "Cviky" } } }] });
  }

  const current = await valuesRequest(accessToken, "'Cviky'!A1:Q1000");
  const oldValues = current.values || [];
  const norm = value => String(value || "").trim().toLocaleLowerCase("cs-CZ").replace(/\s+/g, " ");

  // Preserve existing video URLs by exercise name before rebuilding the master catalog.
  const existingVideos = new Map();
  for (const row of oldValues.slice(1)) {
    const name = norm(row[1]);
    if (!name) continue;
    const url = String(row[16] || "").trim();
    if (/^https?:\/\//i.test(url)) existingVideos.set(name, url);
  }

  const rows = [CVIKY_HEADERS];
  for (let i = 0; i < GYM_CATALOG.length; i++) {
    const [name, muscle, pattern, role, priority, sets, minReps, maxReps, targetRpe, step, equipment, note] = GYM_CATALOG[i];
    const id = "E" + String(i + 1).padStart(2, "0");
    const fallback = "https://www.youtube.com/results?search_query=" + encodeURIComponent(name + " exercise technique");
    const videoUrl = existingVideos.get(norm(name)) || fallback;
    const videoLabel = "🎥 Video";
    rows.push([
      id, name, muscle, pattern, role, priority, sets, minReps, maxReps, targetRpe, step,
      equipment, "AUTO", note, "=HYPERLINK(\"" + String(videoUrl).replace(/"/g, '""') + "\";\"🎥 Video\")", "🎥 " + name + " – technika", videoUrl
    ]);
  }

  await valuesRequest(accessToken, "'Cviky'!A1:Q1000", "POST", {}, ":clear");
  await valuesRequest(
    accessToken,
    "'Cviky'!A1:Q" + rows.length,
    "PUT",
    { values: rows },
    "?valueInputOption=USER_ENTERED"
  );

  return { rebuilt: true, added: GYM_CATALOG.length, totalCatalogEntries: GYM_CATALOG.length, videosReady: GYM_CATALOG.length };
}


async function refreshStrengthOverview(accessToken, db) {
  const last = await db.prepare(`
    SELECT workout_date, COUNT(*) AS sets
    FROM strength_sets
    WHERE completed = 1
    GROUP BY workout_date
    ORDER BY workout_date DESC
    LIMIT 1
  `).first();

  const recent = await db.prepare(`
    SELECT workout_date, COUNT(*) AS sets
    FROM strength_sets
    WHERE completed = 1
    GROUP BY workout_date
    ORDER BY workout_date DESC
    LIMIT 10
  `).all();

  const progression = await db.prepare(`
    SELECT workout_date, exercise, actual_kg, actual_reps, rpe
    FROM strength_sets
    WHERE completed = 1 AND type = 'WORK'
    ORDER BY workout_date DESC, exercise ASC, set_no ASC
  `).all();

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


const UI = {
  titleBg: { red: 0.11, green: 0.16, blue: 0.22 },
  headerBg: { red: 0.88, green: 0.92, blue: 0.96 },
  accentBg: { red: 0.94, green: 0.96, blue: 0.98 },
  border: { red: 0.78, green: 0.82, blue: 0.86 },
  white: { red: 1, green: 1, blue: 1 },
  text: { red: 0.12, green: 0.14, blue: 0.16 }
};

function gridRange(sheetId, startRow, endRow, startCol, endCol) {
  return { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol };
}

function repeatFormat(range, userEnteredFormat, fields) {
  return { repeatCell: { range, cell: { userEnteredFormat }, fields: fields || "userEnteredFormat" } };
}

function columnWidth(sheetId, startCol, endCol, pixels) {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: startCol, endIndex: endCol },
      properties: { pixelSize: pixels },
      fields: "pixelSize"
    }
  };
}

async function refreshWorkoutChrome(accessToken) {
  const current = await valuesRequest(accessToken, "'Dnešní trénink'!A1:K7");
  const old = current.values || [];
  const rawDate = String(old?.[2]?.[1] || old?.[5]?.[1] || "").trim();
  const date = /^\\d{4}[-.]\\d{2}[-.]\\d{2}$/.test(rawDate)
    ? rawDate.replace(/\\./g, "-")
    : new Date().toISOString().slice(0, 10);
  const displayDate = date.split("-").reverse().join(". ");
  const rows = [
    ["ADAPTIVNÍ SILOVÝ TRÉNINK"],
    ["Dnešní trénink  •  " + displayDate],
    ["Datum", date, "Režim", "AUTO", "Cviky", "METAGYM Kutná Hora"],
    [],
    [],
    [],
    ["Typ","Cvik","Série","Plán kg","Plán reps","Skutečně kg","Skutečně reps","RPE","Hotovo","Poznámka","Video"]
  ];
  await valuesRequest(accessToken, "'Dnešní trénink'!A1:K7", "POST", {}, ":clear");
  await valuesRequest(accessToken, "'Dnešní trénink'!A1:K7", "PUT", { values: rows }, "?valueInputOption=USER_ENTERED");
  return { workoutDate: date };
}

async function formatWorkbook(accessToken) {
  const sheets = await spreadsheetMetadata(accessToken);
  const byName = new Map(sheets.map(s => [s.properties?.title, s.properties?.sheetId]));
  const requests = [];

  const base = {
    backgroundColor: UI.white,
    textFormat: { fontFamily: "Arial", fontSize: 10, foregroundColor: UI.text },
    verticalAlignment: "MIDDLE"
  };

  for (const [name, sheetId] of byName) {
    if (!sheetId) continue;
    requests.push(repeatFormat(gridRange(sheetId, 0, 1000, 0, 26), base));
  }

  // Dnešní trénink — compact workout UI with one strong title and one data header.
  if (byName.has("Dnešní trénink")) {
    const id = byName.get("Dnešní trénink");
    requests.push(
      { mergeCells: { range: gridRange(id, 0, 1, 0, 11), mergeType: "MERGE_ALL" } },
      repeatFormat(gridRange(id, 0, 1, 0, 11), {
        backgroundColor: UI.titleBg, textFormat: { fontFamily: "Arial", fontSize: 16, bold: true, foregroundColor: UI.white },
        horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE"
      }),
      repeatFormat(gridRange(id, 2, 3, 0, 11), {
        backgroundColor: UI.accentBg, textFormat: { fontFamily: "Arial", fontSize: 10, foregroundColor: UI.text },
        verticalAlignment: "MIDDLE"
      }),
      repeatFormat(gridRange(id, 6, 7, 0, 11), {
        backgroundColor: UI.headerBg, textFormat: { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: UI.text },
        horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
        borders: { bottom: { style: "SOLID_MEDIUM", color: UI.border } }
      }),
      { updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 7 } }, fields: "gridProperties.frozenRowCount" } },
      columnWidth(id,0,1,105), columnWidth(id,1,2,210), columnWidth(id,2,3,55),
      columnWidth(id,3,5,85), columnWidth(id,5,8,95), columnWidth(id,8,9,65),
      columnWidth(id,9,10,300), columnWidth(id,10,11,90),
      repeatFormat(gridRange(id, 7, 1000, 0, 11), { wrapStrategy: "WRAP", verticalAlignment: "MIDDLE" }),
      repeatFormat(gridRange(id, 7, 1000, 3, 4), { numberFormat:{ type:"NUMBER", pattern:"0.0" } }, "userEnteredFormat.numberFormat"),
      repeatFormat(gridRange(id, 7, 1000, 5, 6), { numberFormat:{ type:"NUMBER", pattern:"0.0" } }, "userEnteredFormat.numberFormat"),
      repeatFormat(gridRange(id, 7, 1000, 6, 8), { numberFormat:{ type:"NUMBER", pattern:"0" } }, "userEnteredFormat.numberFormat")
    );
  }

  // Intervals — only user-relevant activity summary; backend ID remains in D1.
  if (byName.has("Intervals")) {
    const id = byName.get("Intervals");
    requests.push(
      repeatFormat(gridRange(id,0,1,0,6), {
        backgroundColor: UI.headerBg, textFormat: { fontFamily: "Arial", fontSize: 10, bold: true, foregroundColor: UI.text },
        horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
        borders: { bottom: { style: "SOLID_MEDIUM", color: UI.border } }
      }),
      { updateSheetProperties: { properties: { sheetId:id, gridProperties:{ frozenRowCount:1 } }, fields:"gridProperties.frozenRowCount" } },
      columnWidth(id,0,1,100), columnWidth(id,1,2,250), columnWidth(id,2,3,110),
      columnWidth(id,3,4,85), columnWidth(id,4,5,115), columnWidth(id,5,6,95),
      repeatFormat(gridRange(id,1,1000,0,6), { wrapStrategy:"CLIP", verticalAlignment:"MIDDLE" }),
      repeatFormat(gridRange(id,1,1000,0,1), { numberFormat:{ type:"DATE", pattern:"dd.mm.yyyy" } }, "userEnteredFormat.numberFormat"),
      repeatFormat(gridRange(id,1,1000,3,4), { numberFormat:{ type:"NUMBER", pattern:"0" } }, "userEnteredFormat.numberFormat"),
      repeatFormat(gridRange(id,1,1000,4,5), { numberFormat:{ type:"NUMBER", pattern:"0.0" } }, "userEnteredFormat.numberFormat"),
      repeatFormat(gridRange(id,1,1000,5,6), { numberFormat:{ type:"NUMBER", pattern:"#,##0" } }, "userEnteredFormat.numberFormat")
    );
  }

  // Přehled — dashboard hierarchy.
  if (byName.has("Přehled")) {
    const id = byName.get("Přehled");
    requests.push(
      repeatFormat(gridRange(id,0,1,0,5), {
        backgroundColor:UI.titleBg, textFormat:{fontFamily:"Arial",fontSize:15,bold:true,foregroundColor:UI.white},
        horizontalAlignment:"CENTER", verticalAlignment:"MIDDLE"
      }),
      repeatFormat(gridRange(id,5,6,0,5), {
        backgroundColor:UI.headerBg, textFormat:{fontFamily:"Arial",fontSize:10,bold:true,foregroundColor:UI.text}
      }),
      repeatFormat(gridRange(id,10,11,0,5), {
        backgroundColor:UI.headerBg, textFormat:{fontFamily:"Arial",fontSize:10,bold:true,foregroundColor:UI.text}
      }),
      { updateSheetProperties:{properties:{sheetId:id,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"} },
      columnWidth(id,0,1,210), columnWidth(id,1,2,115), columnWidth(id,2,4,95), columnWidth(id,4,5,70)
    );
  }

  // History tables — same header treatment everywhere.
  for (const name of ["Log","AllSets"]) {
    if (!byName.has(name)) continue;
    const id=byName.get(name);
    const width=name==="Log" ? [105,100,220,55,85,90,65,300] : [105,90,220,55,85,85,95,95,65,75,300,90];
    requests.push(
      repeatFormat(gridRange(id,0,1,0,width.length), {
        backgroundColor:UI.headerBg, textFormat:{fontFamily:"Arial",fontSize:10,bold:true,foregroundColor:UI.text},
        horizontalAlignment:"CENTER", verticalAlignment:"MIDDLE",
        borders:{bottom:{style:"SOLID_MEDIUM",color:UI.border}}
      }),
      { updateSheetProperties:{properties:{sheetId:id,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"} }
    );
    width.forEach((w,i)=>requests.push(columnWidth(id,i,i+1,w)));
    requests.push(
      repeatFormat(gridRange(id,1,10000,0,width.length), { wrapStrategy:"CLIP", verticalAlignment:"MIDDLE" }),
      repeatFormat(gridRange(id,1,10000,0,1), { numberFormat:{ type:"DATE", pattern:"dd.mm.yyyy" } }, "userEnteredFormat.numberFormat"),
      repeatFormat(gridRange(id,1,10000,4,8), { numberFormat:{ type:"NUMBER", pattern:"0.0" } }, "userEnteredFormat.numberFormat")
    );
  }

  // Exercise master — dense, filterable, with video columns easy to scan.
  if (byName.has("Cviky")) {
    const id=byName.get("Cviky");
    requests.push(
      repeatFormat(gridRange(id,0,1,0,17), {
        backgroundColor:UI.headerBg, textFormat:{fontFamily:"Arial",fontSize:10,bold:true,foregroundColor:UI.text},
        horizontalAlignment:"CENTER", verticalAlignment:"MIDDLE",
        borders:{bottom:{style:"SOLID_MEDIUM",color:UI.border}}
      }),
      { updateSheetProperties:{properties:{sheetId:id,gridProperties:{frozenRowCount:1}},fields:"gridProperties.frozenRowCount"} }
    );
    const widths=[55,210,110,150,85,65,55,75,75,80,75,220,75,280,95,220,260];
    widths.forEach((w,i)=>requests.push(columnWidth(id,i,i+1,w)));
    requests.push(repeatFormat(gridRange(id,1,1000,0,17), { wrapStrategy:"CLIP", verticalAlignment:"MIDDLE" }));
  }

  if (!requests.length) return { status:"ok", requests:0 };
  await sheetsBatchUpdate(accessToken, { requests });
  return { status:"ok", requests:requests.length };
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
  const workoutChrome = await refreshWorkoutChrome(accessToken);
  const formatting = await formatWorkbook(accessToken);
  return { status: "ok", deletedSheets: sheets.filter(s => deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), preservedSheets: sheets.filter(s => !deletions.includes(s.properties && s.properties.sheetId)).map(s => s.properties.title), catalog, overview, ...mirror, ...videoLinks, workoutChrome, formatting };
}
