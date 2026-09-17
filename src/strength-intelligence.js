const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const LOAD_UNITS = {
  PER_HAND_KG: "per_hand_kg",
  MACHINE_TOTAL_KG: "machine_total_kg",
  MACHINE_PER_SIDE_KG: "machine_per_side_kg",
  CABLE_STACK_KG: "cable_stack_kg",
  BODYWEIGHT: "bodyweight"
};

export const EXERCISE_INTELLIGENCE = {
  "DB bench press": { muscle: "chest", pattern: "horizontal_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["machine chest press", "barbell bench press"] },
  "Low row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.0, variants: ["seated cable row", "chest supported row"] },
  "DB shoulder press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["machine shoulder press", "barbell overhead press"] },
  "Pivot leg press": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.35, variants: ["hack squat", "leg extension"] },
  "Prime prone leg curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.85, variants: ["seated leg curl", "lying leg curl"] },
  "Cable curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["DB curl", "Hammer curl", "preacher curl"] },
  "DB curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["Cable curl", "Hammer curl", "preacher curl"] },
  "Hammer curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["DB curl", "Cable curl"] },
  "Abs bench crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: ["cable crunch"] }
};

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
function dateKey(v) { return String(v || "").slice(0, 10); }
function latestByDate(rows) { return [...(rows || [])].sort((a, b) => String(b.workout_date).localeCompare(String(a.workout_date)) || Number(b.set_no || 0) - Number(a.set_no || 0)); }
export function parseRepRange(value) { const m = String(value || "").match(/(\d+)\s*[–-]\s*(\d+)/); return m ? { min: Number(m[1]), max: Number(m[2]) } : null; }
function completedRowsForExercise(history, exercise) { return (history || []).filter(r => String(r.exercise).toLowerCase() === String(exercise).toLowerCase() && String(r.type || "WORK").toUpperCase() === "WORK" && Number(r.completed) === 1); }

function scoreSimilarity(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b) return 0;
  let score = 0;
  if (a.muscle === b.muscle) score += 0.40;
  if (a.pattern === b.pattern) score += 0.35;
  if (a.equipment === b.equipment) score += 0.10;
  if (a.unilateral === b.unilateral) score += 0.05;
  if (a.loadUnit === b.loadUnit) score += 0.10;
  return score;
}

function transferFactor(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b) return null;
  if (a.loadUnit === b.loadUnit && a.equipment === b.equipment && a.pattern === b.pattern) return 1;
  return null;
}

function practicalStep(meta) {
  if (!meta) return 2.5;
  if (meta.loadUnit === LOAD_UNITS.PER_HAND_KG) return 1;
  if (meta.loadUnit === LOAD_UNITS.MACHINE_PER_SIDE_KG) return 2.5;
  if (meta.loadUnit === LOAD_UNITS.MACHINE_TOTAL_KG) return 5;
  if (meta.loadUnit === LOAD_UNITS.CABLE_STACK_KG) return 2.5;
  return 2.5;
}

function roundToStep(value, step) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(step, Math.round(value / step) * step);
}

function progressionMultiplier(reps, rpe, targetReps) {
  const range = parseRepRange(targetReps);
  if (rpe == null) return 1;
  if (rpe >= 9.5) return 0.92;
  if (rpe >= 9) return 0.95;
  if (range && reps != null && reps >= range.max && rpe <= 8) return 1.025;
  if (rpe <= 6.5) return 1.05;
  if (rpe <= 7.5) return 1.025;
  return 1;
}

function recoveryMultiplier(loadFactor) { return clamp(0.92 + 0.08 * loadFactor, 0.92, 1); }

function selectReference(rows, targetReps) {
  const usable = latestByDate(rows).filter(r => n(r.actual_kg) != null && n(r.actual_reps) != null);
  if (!usable.length) return null;

  // The latest completed workout for this exercise is the primary reference.
  // Older sessions remain useful as history, but must not override the latest
  // real performance just because they happened to have a better RPE/reps score.
  const latestDate = String(usable[0].workout_date || "").slice(0, 10);
  const latestWorkout = usable.filter(r => String(r.workout_date || "").slice(0, 10) === latestDate);
  const candidates = latestWorkout.length ? latestWorkout : usable.slice(0, 12);
  const range = parseRepRange(targetReps);

  const scored = candidates.map(r => {
    const reps = n(r.actual_reps), rpe = n(r.rpe);
    let score = 0;
    if (range && reps >= range.min && reps <= range.max) score += 3;
    if (range && reps >= range.max) score += 1;
    if (rpe != null && rpe <= 8) score += 2;
    if (rpe != null && rpe >= 9.5) score -= 2;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score || Number(b.r.actual_reps || 0) - Number(a.r.actual_reps || 0) || Number(b.r.set_no || 0) - Number(a.r.set_no || 0));
  return scored[0].r;
}

function estimateFromOwnHistory(own, exercise, targetReps, loadFactor) {
  if (!own.length) return null;
  const ref = selectReference(own, targetReps);
  if (!ref) return null;
  let kg = n(ref.actual_kg);
  kg *= progressionMultiplier(n(ref.actual_reps), n(ref.rpe), targetReps);
  kg *= recoveryMultiplier(loadFactor);
  const step = practicalStep(EXERCISE_INTELLIGENCE[exercise]);
  const rounded = roundToStep(kg, step);
  return {
    kg: rounded, source: "own-history", confidence: 1, referenceExercise: exercise,
    referenceKg: n(ref.actual_kg), referenceReps: n(ref.actual_reps), referenceRpe: n(ref.rpe),
    referenceDate: ref.workout_date,
    deltaPct: n(ref.actual_kg) ? Math.round((rounded / n(ref.actual_kg) - 1) * 1000) / 10 : 0
  };
}

export function estimateStartingLoad({ exercise, history = [], targetReps = "8–15", fallbackKg = null, loadFactor = 1 }) {
  const def = EXERCISE_INTELLIGENCE[exercise];
  if (!def) return { kg: fallbackKg, source: fallbackKg == null ? "unknown" : "fallback", confidence: fallbackKg == null ? 0 : 0.2 };
  const ownEstimate = estimateFromOwnHistory(completedRowsForExercise(history, exercise), exercise, targetReps, loadFactor);
  if (ownEstimate) return ownEstimate;
  const candidates = [];
  for (const name of Object.keys(EXERCISE_INTELLIGENCE)) {
    if (name === exercise) continue;
    const rows = completedRowsForExercise(history, name);
    const ref = selectReference(rows, targetReps);
    if (!ref) continue;
    const kg = n(ref.actual_kg);
    if (kg == null) continue;
    const similarity = scoreSimilarity(name, exercise);
    const factor = transferFactor(name, exercise);
    if (similarity < 0.85 || factor == null) continue;
    candidates.push({ name, kg, rpe: n(ref.rpe), reps: n(ref.actual_reps), similarity, factor, date: ref.workout_date });
  }
  candidates.sort((a, b) => b.similarity - a.similarity || String(b.date).localeCompare(String(a.date)));
  const ref = candidates[0];
  if (ref) {
    let kg = ref.kg * ref.factor;
    kg *= progressionMultiplier(ref.reps, ref.rpe, targetReps);
    kg *= recoveryMultiplier(loadFactor);
    const rounded = roundToStep(kg, practicalStep(def));
    return { kg: Math.max(practicalStep(def), rounded), source: "cross-exercise-estimate", confidence: clamp(0.55 + ref.similarity * 0.45, 0.55, 1), referenceExercise: ref.name, referenceKg: ref.kg, referenceRpe: ref.rpe, referenceReps: ref.reps, referenceDate: ref.date, similarity: ref.similarity, transferFactor: ref.factor };
  }
  if (fallbackKg != null) return { kg: roundToStep(Number(fallbackKg), practicalStep(def)), source: "catalogue-default", confidence: 0.25 };
  return { kg: null, source: "no-reference", confidence: 0 };
}

export function analyzeCompletedWorkout(parsed, history = []) {
  const work = (parsed?.completedRows || []).filter(r => r.type === "WORK");
  if (!work.length) return { status: "ok", completedSets: 0, summary: "Zatím nejsou dokončené pracovní série k analýze.", exercises: [], recommendations: [] };
  const byExercise = new Map();
  for (const row of work) { const arr = byExercise.get(row.exercise) || []; arr.push(row); byExercise.set(row.exercise, arr); }
  const exercises = [], recommendations = [];
  for (const [exercise, rows] of byExercise) {
    const usable = rows.filter(r => n(r.actual_kg) != null && n(r.actual_reps) != null);
    const avgRpeValues = rows.map(r => n(r.rpe)).filter(x => x != null);
    const avgRpe = avgRpeValues.length ? avgRpeValues.reduce((a, b) => a + b, 0) / avgRpeValues.length : null;
    const topReps = usable.length ? Math.max(...usable.map(r => n(r.actual_reps))) : null;
    const planned = rows[0]?.planned_kg != null ? n(rows[0].planned_kg) : null;
    const actuals = usable.map(r => n(r.actual_kg));
    const actualKg = actuals.length ? Math.max(...actuals) : null;
    let action = "hold";
    if (avgRpe != null && avgRpe <= 7.5 && topReps != null) action = "increase_small";
    else if (avgRpe != null && avgRpe >= 9) action = "hold_or_reduce";
    exercises.push({ exercise, sets: rows.length, plannedKg: planned, actualKg, avgRpe: avgRpe == null ? null : Math.round(avgRpe * 10) / 10, topReps, action, loadUnit: EXERCISE_INTELLIGENCE[exercise]?.loadUnit || null });
    recommendations.push({ exercise, action, reason: action === "increase_small" ? "RPE byl kontrolovaný; příště lze zkusit malý nárůst, pokud se drží technika." : action === "hold_or_reduce" ? "RPE byl vysoký; příště držet nebo mírně snížit podle regenerace." : "Zátěž zatím ponechat a potvrdit další sérií výkonu." });
  }
  return { status: "ok", completedSets: work.length, workoutDate: parsed.date, summary: `Analyzováno ${work.length} dokončených pracovních sérií ve ${byExercise.size} cvicích.`, exercises, recommendations };
}

export function findExerciseAlternatives(exercise, history = [], requestedMuscle = null) {
  const base = EXERCISE_INTELLIGENCE[exercise];
  const targetMuscle = requestedMuscle || base?.muscle;
  return Object.entries(EXERCISE_INTELLIGENCE)
    .filter(([name, meta]) => name !== exercise && (!targetMuscle || meta.muscle === targetMuscle))
    .map(([name, meta]) => ({ name, muscle: meta.muscle, pattern: meta.pattern, equipment: meta.equipment, unilateral: meta.unilateral, loadUnit: meta.loadUnit, similarity: base ? scoreSimilarity(exercise, name) : 0 }))
    .sort((a, b) => b.similarity - a.similarity);
}
