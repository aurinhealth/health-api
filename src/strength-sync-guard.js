import { resolveStrengthPerformance } from "./strength-history.js";

function normalize(value) {
  return value == null ? null : String(value).trim();
}

function sameNumber(a, b) {
  return (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));
}

export function completedRowsAreSynced(completedRows = [], dbRows = []) {
  const byRow = new Map((dbRows || []).map(row => [Number(row.plan_row), row]));
  return (completedRows || []).every(planRow => {
    const dbRow = byRow.get(Number(planRow.planRow));
    const performance = resolveStrengthPerformance(planRow);
    return !!dbRow &&
      normalize(planRow.type) === normalize(dbRow.type) &&
      normalize(planRow.exercise) === normalize(dbRow.exercise) &&
      sameNumber(planRow.setNo, dbRow.set_no) &&
      sameNumber(planRow.plannedKg, dbRow.planned_kg) &&
      normalize(planRow.plannedReps) === normalize(dbRow.planned_reps) &&
      sameNumber(performance.actualKg, dbRow.actual_kg) &&
      sameNumber(performance.actualReps, dbRow.actual_reps) &&
      sameNumber(planRow.rpe, dbRow.rpe) &&
      Number(dbRow.completed) === 1;
  });
}
