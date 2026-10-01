// Strength workouts live in D1 (gym_plans): one editable plan per user and
// day, stored in the layout the dashboard uses (title rows 1–7, the column
// header on row 7, sets from row 8). Completed sets go to strength_sets.
import { parseStrengthSheet, importStrengthHistory } from "./strength-history.js";

export const GYM_PLAN_COLUMNS = ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"];
const MAX_ROWS = 100;
const DONE = new Set(["TRUE", "true", "1", "ANO", "ano", "✓", "☑"]);

export async function ensureGymPlans(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS gym_plans (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, workout_date))").run();
}

export function emptyPlanValues(date) {
  return [["ADAPTIVNÍ SILOVÝ TRÉNINK"], [""], ["Datum", date], [], [], [], GYM_PLAN_COLUMNS];
}

export async function readGymPlan(db, date) {
  await ensureGymPlans(db);
  const row = await db.prepare("SELECT values_json FROM gym_plans WHERE user_id=? AND workout_date=?").bind(db.userId, date).first();
  let values = null;
  try { values = row?.values_json ? JSON.parse(row.values_json) : null; } catch { values = null; }
  return { date, values: Array.isArray(values) && values.length ? values : emptyPlanValues(date), stored: Boolean(values) };
}

export async function saveGymPlan(db, date, values) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Invalid date; expected YYYY-MM-DD");
  if (!Array.isArray(values)) throw new Error("values must be a 2D array");
  await ensureGymPlans(db);
  await db.prepare("INSERT INTO gym_plans(user_id,workout_date,values_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,workout_date) DO UPDATE SET values_json=excluded.values_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, date, JSON.stringify(values)).run();
}

const videoUrl = exercise => "https://www.youtube.com/results?search_query=" + encodeURIComponent(String(exercise || "").trim() + " exercise technique");

// A generated plan ({date, rows, planName, rationale, protectedLegs, loadFactor}) in the stored layout.
export function planValues(body = {}) {
  const date = String(body.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date; expected YYYY-MM-DD");
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) throw new Error("rows must be a non-empty 2D array");
  if (rows.length > MAX_ROWS) throw new Error(`Too many workout rows; maximum is ${MAX_ROWS}`);
  const planName = String(body.planName || "Dnešní trénink").trim();
  const load = Number(body.loadFactor);
  const header = [
    ["ADAPTIVNÍ SILOVÝ TRÉNINK"],
    [planName + "  •  " + date.split("-").reverse().join(". ")],
    ["Datum", date, "Plán", planName, "Nohy", body.protectedLegs === true ? "CHRÁNĚNO" : "NORMÁLNĚ", "Load", Number.isFinite(load) ? load.toFixed(2).replace(".", ",") : "—"],
    ["Poznámka", String(body.rationale || "").trim()],
    [], [],
    GYM_PLAN_COLUMNS
  ];
  const sets = rows.map(row => {
    const r = Array.from({ length: GYM_PLAN_COLUMNS.length }, (_, i) => row?.[i] == null ? "" : row[i]);
    // Sheet-era hyperlink formulas and placeholders become a plain link.
    if (!/^https?:\/\//i.test(String(r[10])) && r[1]) r[10] = String(r[10]).match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1] || videoUrl(r[1]);
    return r;
  });
  return [...header, ...sets];
}

export async function writeStrengthPlanToDb(db, body) {
  const values = planValues(body);
  await saveGymPlan(db, body.date, values);
  return { status: "ok", storage: "d1", workoutDate: body.date, rowsWritten: values.length - 7, previousWorkoutSynced: false };
}

// Completed sets of a stored plan into the history, with the same keys the
// dashboard uses when it saves (manual:<date>:<n>), so nothing is counted twice.
export async function syncGymPlanHistory(db, values) {
  const parsed = parseStrengthSheet(values);
  if (!parsed.date) return { status: "ok", completedRows: 0, parsed };
  const sets = parsed.rows.filter(r => r.completed || DONE.has(String(r.completed))).map(r => ({ type: r.type, exercise: r.exercise, setNo: r.setNo, plannedKg: r.plannedKg, plannedReps: r.plannedReps, actualKg: r.actualKg, actualReps: r.actualReps, rpe: r.rpe, completed: true, note: r.note }));
  if (sets.length) await importStrengthHistory(db, { date: parsed.date, sets });
  return { status: "ok", completedRows: sets.length, parsed };
}
