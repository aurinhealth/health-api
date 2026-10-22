// How much of a planned workout was done, as a percent of the plan ("Splnění
// plánu"): the week's sessions and the calendar show the number, the activity
// detail and the gym day also what it is made of. Pure.
//
// A ride or run is measured by its load (TSS) against the planned one, like
// TrainingPeaks: load holds both length and intensity. Without TSS on both
// sides it is the time, then the distance. A gym session is measured set by
// set: a planned set done at its weight and within its rep range is 100 %,
// fewer reps or less weight count less, more of either count more, a missed
// set 0 and an extra one is added on top.
import { L } from "./lang.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const pct = (a, b) => (a > 0 && b > 0 ? Math.round(a / b * 100) : null);

// The colour band of a percent, the same both ways from the plan
// (ComplianceScale in ios-native): 85–115 % as planned.
export function complianceBand(percent) {
  const p = num(percent);
  if (p == null) return null;
  if (p >= 85 && p <= 115) return "good";
  if (p >= 70 && p <= 130) return "near";
  if (p >= 50 && p <= 150) return "far";
  return "way";
}

// done/plan: {tss, durationHours, km} (km also read from distance in metres).
export function enduranceCompliance(done = {}, plan = {}) {
  const km = x => num(x.km) ?? (num(x.distance) > 0 ? num(x.distance) / 1000 : null);
  const minutes = x => (num(x.durationHours) > 0 ? num(x.durationHours) * 60 : num(x.minutes));
  const rows = [
    { kind: "tss", done: num(done.tss), plan: num(plan.tss) },
    { kind: "time", done: minutes(done), plan: minutes(plan) },
    { kind: "distance", done: km(done), plan: km(plan) }
  ].map(r => ({ ...r, percent: pct(r.done, r.plan) })).filter(r => r.plan > 0);
  const basis = rows.find(r => r.percent != null);
  if (!basis) return null;
  return { percent: basis.percent, basis: basis.kind, rows: rows.filter(r => r.done != null) };
}

const repRange = text => {
  const m = String(text || "").match(/(\d+)\s*(?:[-–]\s*(\d+))?/);
  return m ? { min: Number(m[1]), max: Number(m[2] || m[1]) } : null;
};

// rows: the WORK rows of a gym plan (strength-history.js parseStrengthPlan):
// {exercise, plannedKg, plannedReps, actualKg, actualReps, completed}.
export function gymCompliance(rows = []) {
  const work = (rows || []).filter(r => r && r.exercise && String(r.type || "WORK").toUpperCase() === "WORK");
  if (!work.length) return null;
  const byExercise = new Map();
  for (const r of work) (byExercise.get(r.exercise) || byExercise.set(r.exercise, []).get(r.exercise)).push(r);
  const exercises = [];
  let score = 0, planned = 0, done = 0, volume = 0, plannedVolume = 0;
  for (const [name, list] of byExercise) {
    let exScore = 0, exPlanned = 0, exDone = 0;
    const sets = [];
    for (const r of list) {
      const range = repRange(r.plannedReps), plannedKg = num(r.plannedKg);
      // Ticked off without numbers written in: done as planned (as the gym day counts it).
      const reps = num(r.actualReps) ?? (r.completed ? range?.min ?? null : null), kg = num(r.actualKg) ?? (r.completed ? plannedKg : null);
      // A set is planned when it names its reps or weight; one only written in is extra.
      const isPlanned = Boolean(range) || plannedKg != null;
      const finished = Boolean(r.completed) || reps > 0;
      if (isPlanned) exPlanned++;
      if (range && plannedKg > 0) plannedVolume += plannedKg * (range.min + range.max) / 2;
      if (!finished) continue;
      exDone++;
      sets.push({ kg, reps });
      if (kg > 0 && reps > 0) volume += kg * reps;
      const repsPart = !range || reps == null ? 1 : reps < range.min ? reps / range.min : reps > range.max ? reps / range.max : 1;
      const kgPart = plannedKg > 0 && kg != null ? kg / plannedKg : 1;
      exScore += repsPart * kgPart;
    }
    if (!exPlanned) continue;
    score += exScore; planned += exPlanned; done += exDone;
    exercises.push({ name, plannedSets: exPlanned, doneSets: exDone, sets, percent: Math.round(exScore / exPlanned * 100) });
  }
  if (!planned) return null;
  return { percent: Math.round(score / planned * 100), sets: { done, plan: planned }, volume: { done: Math.round(volume), plan: Math.round(plannedVolume) }, exercises };
}

// The steps of a ride or run review chart (ride-review.js, run-review.js) as
// the detail lists them: repeated kinds numbered ("Práh 1", "Práh 2").
export function complianceSteps(chart) {
  const steps = Array.isArray(chart?.steps) ? chart.steps : [];
  if (!steps.length) return null;
  const counts = {}, seen = {};
  for (const s of steps) if (s.role === "work" || s.role === "sprint") counts[s.label] = (counts[s.label] || 0) + 1;
  const list = steps.map(s => {
    const many = counts[s.label] > 1, i = many ? (seen[s.label] = (seen[s.label] || 0) + 1) : 0;
    return {
      label: many ? s.label + " " + i : s.label, role: s.role, seconds: num(s.seconds), plannedSeconds: num(s.planned) ?? num(s.seconds),
      lo: num(s.lo), hi: num(s.hi), value: num(s.watts), text: s.text || null,
      status: s.missing ? "missing" : s.status || null
    };
  });
  const judged = list.filter(s => s.role === "work" || s.role === "sprint");
  return {
    unit: chart.unit === "%" ? "%" : "W",
    inBand: judged.filter(s => s.status === "in" || (s.role === "sprint" && s.status !== "missing")).length,
    of: judged.length,
    steps: list
  };
}

// What the detail shows above the numbers' rows: "Podle plánu" and the like.
export function complianceWord(percent) {
  const p = num(percent), band = complianceBand(p);
  if (!band) return null;
  if (band === "good") return L("Podle plánu", "As planned");
  if (band === "near") return p < 100 ? L("Méně než plán", "Less than planned") : L("Víc než plán", "More than planned");
  if (band === "far") return p < 100 ? L("Výrazně méně", "Much less") : L("Výrazně víc", "Much more");
  return p < 100 ? L("Zlomek plánu", "A fraction of the plan") : L("Přes plán", "Well over the plan");
}
