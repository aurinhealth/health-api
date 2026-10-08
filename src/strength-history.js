import { normalizeExerciseName } from "./strength-normalization.js";
import { strengthSetOptions, strengthOptionNote } from './gym-set-options.js';

const PLAN_TITLE = "Dnešní trénink";
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

// A blank entry on a completed set means the prescribed performance.
// Rep ranges and timed/AMRAP targets cannot tell us how many reps were done.
export function resolveStrengthPerformance(set) {
  const fixedReps = text(set.plannedReps);
  return {
    actualKg: numberOrNull(set.actualKg) ?? numberOrNull(set.plannedKg),
    actualReps: numberOrNull(set.actualReps) ??
      (/^[0-9]+$/.test(fixedReps) && Number(fixedReps) > 0 ? Number(fixedReps) : null)
  };
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

export function parseStrengthPlan(values) {
  if (!Array.isArray(values)) throw new Error("Sheet values must be a 2D array");
  const header = getHeader(values);
  if (header.index < 0) throw new Error(`Strength header row not found in ${PLAN_TITLE}`);

  const date = getSheetDate(values);
  const rows = [];

  for (let i = header.index + 1; i < values.length; i++) {
    const r = values[i] || [];
    const type = text(r[0]);
    const exercise = normalizeExerciseName(text(r[1]));
    if (!type && !exercise) continue;
    if (!exercise) continue;
    if (!/^(WARMUP|WORK)$/i.test(type)) continue;

    rows.push({
      planRow: i + 1,
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
      ...strengthSetOptions({toFailure:!header.legacy&&bool(r[11]),superset:header.legacy?'':r[12]}),
      replacement: header.legacy ? text(r[11]) : "",
      execution: header.legacy ? text(r[12]) : ""
    });
  }

  return {
    title: PLAN_TITLE,
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
      user_id INTEGER NOT NULL,
      workout_date TEXT NOT NULL,
      plan_row INTEGER NOT NULL,
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
      source TEXT NOT NULL DEFAULT 'plan',
      source_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, source_key)
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_strength_sets_user_exercise_date ON strength_sets(user_id, exercise, workout_date DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_strength_sets_user_date ON strength_sets(user_id, workout_date DESC)`).run();
}

export async function importStrengthHistory(db, workout) {
  await ensureStrengthTable(db);
  const date = text(workout?.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid workout date; expected YYYY-MM-DD");
  const sets = Array.isArray(workout?.sets) ? workout.sets : [];
  if (!sets.length) throw new Error("Workout sets must be a non-empty array");

  let imported = 0;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i] || {};
    const type = text(s.type || "WORK").toUpperCase();
    const exercise = normalizeExerciseName(text(s.exercise));
    if (!exercise || !/^(WARMUP|WORK)$/.test(type)) continue;
    const plannedKg = numberOrNull(s.plannedKg ?? s.actualKg);
    const plannedReps = text(s.plannedReps ?? s.actualReps);
    const { actualKg, actualReps } = resolveStrengthPerformance({ ...s, plannedKg, plannedReps });
    const setNo = numberOrNull(s.setNo);
    const rpe = strengthSetOptions(s).toFailure?10:numberOrNull(s.rpe);
    const note = strengthOptionNote(s);
    const sourceKey = `manual:${date}:${i + 1}`;

    await db.prepare(`
      INSERT INTO strength_sets (user_id, 
        workout_date, plan_row, type, exercise, set_no, planned_kg, planned_reps,
        actual_kg, actual_reps, rpe, completed, note, video, replacement, execution,
        source, source_key, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '', '', '', 'manual', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, source_key) DO UPDATE SET
        workout_date=excluded.workout_date,
        plan_row=excluded.plan_row,
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
    `).bind(db.userId, 
      date, 1000000 + i + 1, type, exercise, setNo, plannedKg, plannedReps,
      actualKg, actualReps, rpe, note, sourceKey
    ).run();
    imported++;
  }

  return { status: "ok", workoutDate: date, setsImported: imported, source: "manual" };
}

// A day saved from the dashboard keeps its completed sets as manual:<date>:1…n.
// When saved sets are taken out of the day, the keys after the new count go
// too, so the history keeps no set the athlete removed.
export async function removeManualSets(db, date, keep, upTo) {
  await ensureStrengthTable(db);
  let removed = 0;
  for (let i = Math.max(0, Number(keep) || 0) + 1; i <= Number(upTo); i++) {
    const result = await db.prepare("DELETE FROM strength_sets WHERE user_id = ? AND workout_date = ? AND source_key = ?").bind(db.userId, date, `manual:${date}:${i}`).run();
    removed += result.meta?.changes || 0;
  }
  return removed;
}

export async function getStrengthHistory(db, limit = 100) {
  await ensureStrengthTable(db);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await db.prepare(`
    SELECT workout_date, plan_row, type, exercise, set_no, planned_kg, planned_reps,
           actual_kg, actual_reps, rpe, completed, note, replacement, execution,
           source, updated_at
    FROM strength_sets
    WHERE user_id = ? AND completed = 1 AND type = 'WORK'
    ORDER BY workout_date DESC, plan_row ASC
    LIMIT ?
  `).bind(db.userId, safeLimit).all();
  return (result.results || []).map(row => ({ ...row,...strengthSetOptions(row), exercise: normalizeExerciseName(row.exercise) }));
}

