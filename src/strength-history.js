const TZ = "Europe/Prague";
const SHEET_NAME = "Dnešní trénink";
const VISIBLE_HEADER_ROW = ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"];
const LEGACY_HEADER_ROW = [...VISIBLE_HEADER_ROW, "Náhrada cviku", "Provedení"];

function text(v) {
  return v == null ? "" : String(v).trim();
}

function numberOrNull(v) {
  if (v == null || text(v) === "") return null;
  const normalized = text(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function bool(v) {
  const s = text(v).toLowerCase();
  return s === "true" || s === "1" || s === "ano" || s === "yes" || s === "✓" || s === "☑";
}

function isoDate(v) {
  const s = text(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[.]\s*(\d{1,2})[.]\s*(\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  return null;
}

function getSheetDate(values) {
  for (const row of values.slice(0, 8)) {
    if (text(row?.[0]).toLowerCase() === "datum") return isoDate(row?.[1]);
  }
  return null;
}

function getHeader(values) {
  const visible = VISIBLE_HEADER_ROW.map(x => x.toLowerCase());
  const legacy = LEGACY_HEADER_ROW.map(x => x.toLowerCase());
  for (let i = 0; i < values.length; i++) {
    const row = (values[i] || []).map(x => text(x).toLowerCase());
    if (legacy.every((name, idx) => row[idx] === name)) return { index: i, legacy: true };
    if (visible.every((name, idx) => row[idx] === name)) return { index: i, legacy: false };
  }
  return { index: -1, legacy: false };
}

export function parseStrengthSheet(values) {
  if (!Array.isArray(values)) throw new Error("Sheet values must be a 2D array");
  const header = getHeader(values);
  if (header.index < 0) throw new Error(`Strength header row not found in ${SHEET_NAME}`);

  const date = getSheetDate(values);
  const rows = [];

  for (let i = header.index + 1; i < values.length; i++) {
    const r = values[i] || [];
    const type = text(r[0]);
    const exercise = text(r[1]);
    if (!type && !exercise) continue;
    if (!exercise) continue;
    if (!/^(WARMUP|WORK)$/i.test(type)) continue;

    rows.push({
      sheetRow: i + 1,
      date,
      type: type.toUpperCase(),
      exercise,
      setNo: numberOrNull(r[2]),
      plannedKg: numberOrNull(r[3]),
      plannedReps: text(r[4]),
      actualKg: numberOrNull(r[5]),
      actualReps: numberOrNull(r[6]),
      rpe: numberOrNull(r[7]),
      completed: bool(r[8]),
      note: text(r[9]),
      video: text(r[10]),
      replacement: header.legacy ? text(r[11]) : "",
      execution: header.legacy ? text(r[12]) : ""
    });
  }

  return {
    sheet: SHEET_NAME,
    date,
    headerRow: header.index + 1,
    legacyLayout: header.legacy,
    rows,
    completedRows: rows.filter(r => r.completed),
    completedCount: rows.filter(r => r.completed).length
  };
}

export async function ensureStrengthTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS strength_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_date TEXT NOT NULL,
      sheet_row INTEGER NOT NULL,
      type TEXT NOT NULL,
      exercise TEXT NOT NULL,
      set_no REAL,
      planned_kg REAL,
      planned_reps TEXT,
      actual_kg REAL,
      actual_reps REAL,
      rpe REAL,
      completed INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      video TEXT,
      replacement TEXT,
      execution TEXT,
      source TEXT NOT NULL DEFAULT 'google-sheet',
      source_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_strength_sets_exercise_date ON strength_sets(exercise, workout_date DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_strength_sets_date ON strength_sets(workout_date DESC)`).run();
}

async function purgeLegacyTestRows(db) {
  // One-time cleanup for the artificial 51kg DB bench test. Restrict it to
  // the exact test date/exercise/value so a real future 51kg performance is safe.
  const result = await db.prepare(`
    DELETE FROM strength_sets
    WHERE workout_date = '2026-09-17'
      AND lower(exercise) = 'db bench press'
      AND (actual_kg = 51 OR planned_kg = 51)
  `).run();
  return Number(result.meta?.changes || 0);
}

export async function syncStrengthSheet(db, values) {
  const parsed = parseStrengthSheet(values);
  await ensureStrengthTable(db);
  const purgedTestRows = await purgeLegacyTestRows(db);

  if (!parsed.date) return { status: "error", step: "strength_sync", message: "Workout date not found in sheet", parsed };

  let upserted = 0;
  let completed = 0;

  for (const row of parsed.rows) {
    const sourceKey = `${parsed.date}:${row.sheetRow}`;
    await db.prepare(`
      INSERT INTO strength_sets (
        workout_date, sheet_row, type, exercise, set_no, planned_kg, planned_reps,
        actual_kg, actual_reps, rpe, completed, note, video, replacement, execution,
        source, source_key, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'google-sheet', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_key) DO UPDATE SET
        workout_date=excluded.workout_date,
        sheet_row=excluded.sheet_row,
        type=excluded.type,
        exercise=excluded.exercise,
        set_no=excluded.set_no,
        planned_kg=excluded.planned_kg,
        planned_reps=excluded.planned_reps,
        actual_kg=excluded.actual_kg,
        actual_reps=excluded.actual_reps,
        rpe=excluded.rpe,
        completed=excluded.completed,
        note=excluded.note,
        video=excluded.video,
        replacement=excluded.replacement,
        execution=excluded.execution,
        updated_at=CURRENT_TIMESTAMP
    `).bind(
      parsed.date,
      row.sheetRow,
      row.type,
      row.exercise,
      row.setNo,
      row.plannedKg,
      row.plannedReps,
      row.actualKg,
      row.actualReps,
      row.rpe,
      row.completed ? 1 : 0,
      row.note,
      row.video,
      row.replacement,
      row.execution,
      sourceKey
    ).run();
    upserted++;
    if (row.completed) completed++;
  }

  return {
    status: "ok",
    workoutDate: parsed.date,
    headerRow: parsed.headerRow,
    legacyLayout: parsed.legacyLayout,
    rowsSeen: parsed.rows.length,
    rowsUpserted: upserted,
    completedRows: completed,
    purgedLegacyTestRows: purgedTestRows
  };
}

export async function importStrengthHistory(db, workout) {
  await ensureStrengthTable(db);
  const date = text(workout?.date);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new Error("Invalid workout date; expected YYYY-MM-DD");
  const sets = Array.isArray(workout?.sets) ? workout.sets : [];
  if (!sets.length) throw new Error("Workout sets must be a non-empty array");

  let imported = 0;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i] || {};
    const type = text(s.type || "WORK").toUpperCase();
    const exercise = text(s.exercise);
    if (!exercise || !/^(WARMUP|WORK)$/.test(type)) continue;
    const actualKg = numberOrNull(s.actualKg);
    const actualReps = numberOrNull(s.actualReps);
    const plannedKg = numberOrNull(s.plannedKg ?? s.actualKg);
    const plannedReps = text(s.plannedReps ?? s.actualReps);
    const setNo = numberOrNull(s.setNo);
    const rpe = numberOrNull(s.rpe);
    const note = text(s.note);
    const sourceKey = `manual:${date}:${i + 1}`;

    await db.prepare(`
      INSERT INTO strength_sets (
        workout_date, sheet_row, type, exercise, set_no, planned_kg, planned_reps,
        actual_kg, actual_reps, rpe, completed, note, video, replacement, execution,
        source, source_key, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '', '', '', 'manual', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_key) DO UPDATE SET
        workout_date=excluded.workout_date,
        sheet_row=excluded.sheet_row,
        type=excluded.type,
        exercise=excluded.exercise,
        set_no=excluded.set_no,
        planned_kg=excluded.planned_kg,
        planned_reps=excluded.planned_reps,
        actual_kg=excluded.actual_kg,
        actual_reps=excluded.actual_reps,
        rpe=excluded.rpe,
        completed=1,
        note=excluded.note,
        updated_at=CURRENT_TIMESTAMP
    `).bind(
      date, 1000000 + i + 1, type, exercise, setNo, plannedKg, plannedReps,
      actualKg, actualReps, rpe, note, sourceKey
    ).run();
    imported++;
  }

  return { status: "ok", workoutDate: date, setsImported: imported, source: "manual" };
}

export async function getStrengthHistory(db, limit = 100) {
  await ensureStrengthTable(db);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await db.prepare(`
    SELECT workout_date, sheet_row, type, exercise, set_no, planned_kg, planned_reps,
           actual_kg, actual_reps, rpe, completed, note, replacement, execution,
           source, updated_at
    FROM strength_sets
    WHERE completed = 1 AND type = 'WORK'
    ORDER BY workout_date DESC, sheet_row ASC
    LIMIT ?
  `).bind(safeLimit).all();
  return result.results || [];
}

export async function getExerciseHistory(db, exercise, limit = 30) {
  await ensureStrengthTable(db);
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const result = await db.prepare(`
    SELECT workout_date, type, exercise, set_no, planned_kg, planned_reps,
           actual_kg, actual_reps, rpe, completed, note, replacement, execution
    FROM strength_sets
    WHERE completed = 1 AND type = 'WORK' AND lower(exercise) = lower(?)
    ORDER BY workout_date DESC, set_no ASC
    LIMIT ?
  `).bind(text(exercise), safeLimit).all();
  return result.results || [];
}
