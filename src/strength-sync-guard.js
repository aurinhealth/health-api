import { resolveStrengthPerformance } from "./strength-history.js";

function normalize(value) {
  return value == null ? null : String(value).trim();
}

function sameNumber(a, b) {
  return (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));
}

export function completedRowsAreSynced(completedRows = [], dbRows = []) {
  const byRow = new Map((dbRows || []).map(row => [Number(row.sheet_row), row]));
  return (completedRows || []).every(sheetRow => {
    const dbRow = byRow.get(Number(sheetRow.sheetRow));
    const performance = resolveStrengthPerformance(sheetRow);
    return !!dbRow &&
      normalize(sheetRow.type) === normalize(dbRow.type) &&
      normalize(sheetRow.exercise) === normalize(dbRow.exercise) &&
      sameNumber(sheetRow.setNo, dbRow.set_no) &&
      sameNumber(sheetRow.plannedKg, dbRow.planned_kg) &&
      normalize(sheetRow.plannedReps) === normalize(dbRow.planned_reps) &&
      sameNumber(performance.actualKg, dbRow.actual_kg) &&
      sameNumber(performance.actualReps, dbRow.actual_reps) &&
      sameNumber(sheetRow.rpe, dbRow.rpe) &&
      Number(dbRow.completed) === 1;
  });
}
