// Strength workouts live in D1 (gym_plans): one editable plan per user and
// day, stored in the layout the dashboard uses (title rows 1–7, the column
// header on row 7, sets from row 8). Completed sets go to strength_sets.
import { parseStrengthPlan, importStrengthHistory } from "./strength-history.js";
import { strengthSetOptions } from './gym-set-options.js';

export const GYM_PLAN_COLUMNS = ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video", "Do selhání", "Supersérie"];
const MAX_ROWS = 100;
const DONE = new Set(["TRUE", "true", "1", "ANO", "ano", "✓", "☑"]);

export async function ensureGymPlans(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS gym_plans (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, workout_date))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS gym_plan_cancellations (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, event_json TEXT, cancelled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, workout_date))").run();
}

export function emptyPlanValues(date) {
  return [["ADAPTIVNÍ SILOVÝ TRÉNINK"], [""], ["Datum", date], [], [], [], GYM_PLAN_COLUMNS];
}

export async function readGymPlan(db, date, { includeCancelled = false } = {}) {
  await ensureGymPlans(db);
  const row = await db.prepare("SELECT values_json FROM gym_plans WHERE user_id=? AND workout_date=?").bind(db.userId, date).first();
  let values = null;
  try { values = row?.values_json ? JSON.parse(row.values_json) : null; } catch { values = null; }
  const cancellation = await db.prepare("SELECT event_json FROM gym_plan_cancellations WHERE user_id=? AND workout_date=?").bind(db.userId, date).first();
  const visible = !cancellation || includeCancelled;
  return { date, values: visible && Array.isArray(values) && values.length ? values : emptyPlanValues(date), stored: visible && Boolean(values), cancelled: Boolean(cancellation), recoverable: Boolean(cancellation && values), cancelledEvent: includeCancelled && cancellation?.event_json ? JSON.parse(cancellation.event_json) : null };
}

// Keep the original plan and every completed set; cancellation only hides the
// outstanding workout from the dashboard, coach and automatic generation.
export async function cancelGymPlan(db, date, event = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Neplatné datum.");
  await ensureGymPlans(db);
  await db.prepare("INSERT INTO gym_plan_cancellations(user_id,workout_date,event_json) VALUES(?,?,?) ON CONFLICT(user_id,workout_date) DO UPDATE SET event_json=COALESCE(excluded.event_json,gym_plan_cancellations.event_json),cancelled_at=CURRENT_TIMESTAMP").bind(db.userId, date, event ? JSON.stringify(event) : null).run();
}

export async function restoreGymPlan(db, date) {
  await ensureGymPlans(db);
  await db.prepare("DELETE FROM gym_plan_cancellations WHERE user_id=? AND workout_date=?").bind(db.userId, date).run();
}

// A strength event moved in the calendar takes its plan along, so the
// exercises are on the day the workout now is. A plan with logged sets, or a
// target day that already has its own plan, stays where it is.
export async function moveGymPlan(db, from, to) {
  const valid = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  if (!valid(from) || !valid(to) || from === to) return { moved: false };
  const source = await readGymPlan(db, from), target = await readGymPlan(db, to, { includeCancelled: true });
  if (!source.stored || target.stored) return { moved: false };
  const logged = source.values.slice(7).some(r => DONE.has(String(r?.[8] ?? "")) || String(r?.[5] ?? "").trim() || String(r?.[6] ?? "").trim());
  if (logged) return { moved: false };
  const label = d => d.split("-").reverse().join(". ");
  const values = source.values.map(r => Array.isArray(r) ? [...r] : r);
  if (typeof values[1]?.[0] === "string") values[1][0] = values[1][0].replace(label(from), label(to));
  if (values[2]?.[0] === "Datum") values[2][1] = to;
  await saveGymPlan(db, to, values);
  await restoreGymPlan(db, to);
  await db.prepare("DELETE FROM gym_plans WHERE user_id=? AND workout_date=?").bind(db.userId, from).run();
  return { moved: true };
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
    body.timing ? ['Časový limit (min)', body.timing.requestedMinutes, 'Odhad (min)', body.timing.estimatedMinutes] : [], [],
    GYM_PLAN_COLUMNS
  ];
  const sets = rows.map(row => {
    const r = Array.from({ length: GYM_PLAN_COLUMNS.length }, (_, i) => row?.[i] == null ? "" : row[i]);
    const options=strengthSetOptions({toFailure:r[11],superset:r[12]});
    r[11]=options.toFailure?'TRUE':'FALSE';r[12]=options.superset;
    // Sheet-era hyperlink formulas and placeholders become a plain link; only
    // http(s), so a javascript: link never reaches the Video button.
    if (!/^https?:\/\//i.test(String(r[10])) && r[1]) {
      const link = String(r[10]).match(/HYPERLINK\(\s*"([^"]+)"/i)?.[1] || "";
      r[10] = /^https?:\/\//i.test(link) ? link : videoUrl(r[1]);
    }
    return r;
  });
  return [...header, ...sets];
}

export async function writeStrengthPlanToDb(db, body) {
  const values = planValues(body);
  await saveGymPlan(db, body.date, values);
  await restoreGymPlan(db, body.date);
  return { status: "ok", storage: "d1", workoutDate: body.date, rowsWritten: values.length - 7, previousWorkoutSynced: false };
}

// Completed sets of a stored plan into the history, with the same keys the
// dashboard uses when it saves (manual:<date>:<n>), so nothing is counted twice.
export async function syncGymPlanHistory(db, values) {
  const parsed = parseStrengthPlan(values);
  if (!parsed.date) return { status: "ok", completedRows: 0, parsed };
  const sets = parsed.rows.filter(r => r.completed || DONE.has(String(r.completed))).map(r => ({ type: r.type, exercise: r.exercise, setNo: r.setNo, plannedKg: r.plannedKg, plannedReps: r.plannedReps, actualKg: r.actualKg, actualReps: r.actualReps, rpe: r.rpe, completed: true, note: r.note,toFailure:r.toFailure,superset:r.superset }));
  if (sets.length) await importStrengthHistory(db, { date: parsed.date, sets });
  return { status: "ok", completedRows: sets.length, parsed };
}
