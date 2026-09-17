const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const LOAD_UNITS = {
  PER_HAND_KG: "per_hand_kg",
  MACHINE_TOTAL_KG: "machine_total_kg",
  MACHINE_PER_SIDE_KG: "machine_per_side_kg",
  CABLE_STACK_KG: "cable_stack_kg",
  BODYWEIGHT: "bodyweight"
};

// The transferFactor is deliberately conservative. It is a starting estimate when
// the exact exercise has no personal history. Once the user performs the new
// exercise, its own history takes precedence over cross-exercise estimates.
export const EXERCISE_INTELLIGENCE = {
  "DB bench press": { muscle: "chest", pattern: "horizontal_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["machine chest press", "barbell bench press"] },
  "Low row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.0, variants: ["seated cable row", "chest supported row"] },
  "DB shoulder press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["machine shoulder press", "barbell overhead press"] },
  "Pivot leg press": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.35, variants: ["hack squat", "leg extension"] },
  "Prime prone leg curl": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.85, variants: ["seated leg curl", "lying leg curl"] },
  "Cable curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["DB curl", "hammer curl", "preacher curl"] },
  "DB curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["Cable curl", "hammer curl", "preacher curl"] },
  "Hammer curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["DB curl", "Cable curl"] },
  "Abs bench crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: ["cable crunch"] }
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function dateKey(v) { return String(v || "").slice(0, 10); }

function daysBetween(a, b) {
  const da = new Date(`${dateKey(a)}T12:00:00Z`).getTime();
  const db = new Date(`${dateKey(b)}T12:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.round(Math.abs(da - db) / 86400000);
}

function latestByDate(rows) {
  return [...(rows || [])].sort((a, b) =>
    String(b.workout_date).localeCompare(String(a.workout_date)) || Number(b.set_no || 0) - Number(a.set_no || 0)
  );
}

export function parseRepRange(value) {
  const m = String(value || "").match(/(\d+)\s*[–-]\s*(\d+)/);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : null;
}

function completedRowsForExercise(history, exercise) {
  return (history || []).filter(r => String(r.exercise).toLowerCase() === String(exercise).toLowerCase() && Number(r.completed) === 1);
}

function bestRecentSet(rows) {
  const usable = latestByDate(rows).filter(r => n(r.actual_kg) != null && n(r.actual_reps) != null);
  return usable[0] || null;
}

function scoreSimilarity(from, to) {
  const a = EXERCISE_INTELLIGENCE[from];
  const b = EXERCISE_INTELLIGENCE[to];
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
  const a = EXERCISE_INTELLIGENCE[from];
  const b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b) return null;
  if (a.loadUnit === b.loadUnit) return 1;

  // Conservative unit-aware starting estimates. These are not claimed biomechanical
  // equivalences; they only provide a usable first session until personal history exists.
  const key = `${a.loadUnit}->${b.loadUnit}`;
  const table = {
    [`${LOAD_UNITS.CABLE_STACK_KG}->${LOAD_UNITS.PER_HAND_KG}`]: 0.28,
    [`${LOAD_UNITS.MACHINE_TOTAL_KG}->${LOAD_UNITS.PER_HAND_KG}`]: 0.10,
    [`${LOAD_UNITS.PER_HAND_KG}->${LOAD_UNITS.CABLE_STACK_KG}`]: 3.0,
    [`${LOAD_UNITS.PER_HAND_KG}->${LOAD_UNITS.MACHINE_TOTAL_KG}`]: 10.0
  };
  return table[key] ?? 0.75;
}

export function estimateStartingLoad({ exercise, history = [], targetReps = "8–15", fallbackKg = null, loadFactor = 1 }) {
  const def = EXERCISE_INTELLIGENCE[exercise];
  if (!def) return { kg: fallbackKg, source: fallbackKg == null ? "unknown" : "fallback", confidence: fallbackKg == null ? 0 : 0.2 };

  const own = completedRowsForExercise(history, exercise);
  const ownLatest = bestRecentSet(own);
  if (ownLatest) {
    const reps = n(ownLatest.actual_reps);
    const rpe = n(ownLatest.rpe);
    let kg = n(ownLatest.actual_kg);
    if (kg != null) {
      if (rpe != null) {
        if (rpe <= 6.5) kg *= 1.05;
        else if (rpe <= 7.5) kg *= 1.025;
        else if (rpe >= 9.5) kg *= 0.92;
        else if (rpe >= 9) kg *= 0.95;
      }
      const range = parseRepRange(targetReps);
      if (range && reps != null && reps >= range.max && (rpe == null || rpe <= 8)) kg *= 1.025;
      kg *= clamp(0.85 + 0.15 * loadFactor, 0.85, 1);
      return { kg: Math.round(kg * 2) / 2, source: "own-history", confidence: 1.0, referenceExercise: exercise };
    }
  }

  const candidates = [];
  for (const [name, meta] of Object.entries(EXERCISE_INTELLIGENCE)) {
    if (name === exercise) continue;
    const rows = completedRowsForExercise(history, name);
    const best = bestRecentSet(rows);
    if (!best) continue;
    const kg = n(best.actual_kg);
    if (kg == null) continue;
    const similarity = scoreSimilarity(name, exercise);
    if (similarity <= 0) continue;
    const factor = transferFactor(name, exercise);
    if (factor == null) continue;
    candidates.push({ name, kg, rpe: n(best.rpe), similarity, factor, date: best.workout_date });
  }

  candidates.sort((a, b) => b.similarity - a.similarity || String(b.date).localeCompare(String(a.date)));
  const ref = candidates[0];
  if (ref) {
    let kg = ref.kg * ref.factor;
    // Do not let the cycling fatigue factor create a large jump from a cross-exercise estimate.
    kg *= clamp(0.90 + 0.10 * loadFactor, 0.90, 1);
    return {
      kg: Math.max(0.5, Math.round(kg * 2) / 2),
      source: "cross-exercise-estimate",
      confidence: clamp(0.35 + ref.similarity * 0.55, 0.35, 0.90),
      referenceExercise: ref.name,
      referenceKg: ref.kg,
      referenceRpe: ref.rpe,
      similarity: ref.similarity,
      transferFactor: ref.factor
    };
  }

  if (fallbackKg != null) {
    return { kg: Math.round(Number(fallbackKg) * 2) / 2, source: "catalogue-default", confidence: 0.25 };
  }
  return { kg: null, source: "no-reference", confidence: 0 };
}

export function analyzeCompletedWorkout(parsed, history = []) {
  const work = (parsed?.completedRows || []).filter(r => r.type === "WORK");
  if (!work.length) {
    return { status: "ok", completedSets: 0, summary: "Zatím nejsou dokončené pracovní série k analýze.", exercises: [], recommendations: [] };
  }

  const byExercise = new Map();
  for (const row of work) {
    const arr = byExercise.get(row.exercise) || [];
    arr.push(row);
    byExercise.set(row.exercise, arr);
  }

  const exercises = [];
  const recommendations = [];
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

    exercises.push({ exercise, sets: rows.length, plannedKg: planned, actualKg, avgRpe: avgRpe == null ? null : Math.round(avgRpe * 10) / 10, topReps, action });
    recommendations.push({ exercise, action, reason: action === "increase_small" ? "RPE byl kontrolovaný; příště lze zkusit malý nárůst, pokud se drží technika." : action === "hold_or_reduce" ? "RPE byl vysoký; příště držet nebo mírně snížit podle regenerace." : "Zátěž zatím ponechat a potvrdit další sérií výkonu." });
  }

  return {
    status: "ok",
    completedSets: work.length,
    workoutDate: parsed.date,
    summary: `Analyzováno ${work.length} dokončených pracovních sérií ve ${byExercise.size} cvicích.`,
    exercises,
    recommendations
  };
}

export function findExerciseAlternatives(exercise, history = [], requestedMuscle = null) {
  const base = EXERCISE_INTELLIGENCE[exercise];
  const targetMuscle = requestedMuscle || base?.muscle;
  const candidates = Object.entries(EXERCISE_INTELLIGENCE)
    .filter(([name, meta]) => name !== exercise && (!targetMuscle || meta.muscle === targetMuscle))
    .map(([name, meta]) => ({ name, muscle: meta.muscle, pattern: meta.pattern, equipment: meta.equipment, unilateral: meta.unilateral, similarity: base ? scoreSimilarity(exercise, name) : 0 }))
    .sort((a, b) => b.similarity - a.similarity);
  return candidates;
}
