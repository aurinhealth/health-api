import { L } from './lang.js';
import { normalizeExerciseName } from "./strength-normalization.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const LOAD_UNITS = {
  PER_HAND_KG: "per_hand_kg",
  MACHINE_TOTAL_KG: "machine_total_kg",
  BARBELL_KG: "barbell_kg",
  MACHINE_PER_SIDE_KG: "machine_per_side_kg",
  CABLE_STACK_KG: "cable_stack_kg",
  BODYWEIGHT: "bodyweight"
};

export const EXERCISE_INTELLIGENCE = {
  'Push-up': {muscle:'chest',pattern:'horizontal_push',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.6,variants:[]},
  'Bodyweight squat': {muscle:'quads',pattern:'squat',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.6,variants:[]},
  'Glute bridge': {muscle:'glutes',pattern:'hinge',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.5,variants:[]},
  'Dead bug': {muscle:'core',pattern:'trunk',equipment:'bodyweight',unilateral:false,loadUnit:LOAD_UNITS.BODYWEIGHT,fatigue:.3,variants:[]},
  "DB bench press": { muscle: "chest", pattern: "horizontal_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["Chest flat press Prime", "Barbell bench press", "DB incline press"] },
  "Barbell bench press": { muscle: "chest", pattern: "horizontal_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.05, variants: ["DB bench press", "DB incline press"] },
  "DB incline press": { muscle: "chest", pattern: "incline_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["DB bench press", "Barbell bench press"] },
  "Standing multi flight": { muscle: "side_delts", pattern: "lateral_raise", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Cable lateral raise"] },
  "One-arm DB row": { muscle: "back", pattern: "horizontal_pull", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["Low row", "Standing rowing machine"] },
  "Face pull": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Rear delt pec deck", "Cable rear delt fly"] },
  "Cable overhead triceps extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable triceps extension"] },
  "Goblet squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["Pendulum squat", "Pivot leg press"] },
  "Low row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.0, variants: ["Standing rowing machine", "Lat pulldown"] },
  "DB shoulder press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["Shoulder press Prime"] },
  "Pivot leg press": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.35, variants: ["Pendulum squat", "Leg extension Prime", "DB Bulgarian split squat"] },
  "Prone leg curl Prime": { muscle: "hamstrings", pattern: "knee_flexion", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.85, variants: ["DB Romanian deadlift", "Barbell Romanian deadlift", "Hip thrust"] },
  "Cable curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["DB curl", "Hammer curl"] },
  "DB curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["Cable curl", "Hammer curl"] },
  "Hammer curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["DB curl", "Cable curl"] },
  "Cable triceps extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable triceps pushdown", "Overhead cable triceps extension"] },
  "Abs bench crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: ["Cable crunch", "Roman chair"] },
  "Chest flat press Prime": { muscle: "chest", pattern: "horizontal_push", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.95, variants: ["DB bench press"] },
  "Shoulder press Prime": { muscle: "shoulders", pattern: "vertical_push", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.9, variants: ["DB shoulder press"] },
  "Lat pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.9, variants: ["Low row", "Cable pullover"] },
  "Standing rowing machine": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.95, variants: ["Low row"] },
  "Pendulum squat": { muscle: "quads", pattern: "knee_dominant", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.3, variants: ["Pivot leg press"] },
  "Leg extension Prime": { muscle: "quads", pattern: "knee_extension", equipment: "machine", unilateral: true, loadUnit: LOAD_UNITS.MACHINE_PER_SIDE_KG, fatigue: 0.65, variants: ["Pivot leg press", "DB Bulgarian split squat"] },
  "Hip thrust": { muscle: "glutes", pattern: "hip_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.0, variants: ["DB Romanian deadlift"] },
  "DB Romanian deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["Barbell Romanian deadlift", "Prone leg curl Prime"] },
  "Barbell Romanian deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.1, variants: ["DB Romanian deadlift"] },
  "DB Bulgarian split squat": { muscle: "quads", pattern: "unilateral_knee_dominant", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 1.0, variants: ["Pivot leg press", "Leg extension Prime"] },
  "Adduction machine": { muscle: "adductors", pattern: "adduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: [] },
  "Abduction machine": { muscle: "abductors", pattern: "abduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: [] },
  "Pec deck": { muscle: "chest", pattern: "horizontal_adduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.55, variants: ["DB bench press"] },
  "Rear delt pec deck": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: ["Cable rear delt fly"] },
  "Cable lateral raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: [] },
  "Cable pullover": { muscle: "back", pattern: "vertical_pull", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Lat pulldown"] },
  "Cable rear delt fly": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Rear delt pec deck"] },
  "Pallof press": { muscle: "core", pattern: "anti_rotation", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Cable woodchop"] },
  "Cable woodchop": { muscle: "core", pattern: "rotation", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Pallof press"] },
  "Roman chair": { muscle: "core", pattern: "trunk_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Abs bench crunch"] },
  "Standing calf raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: [] },
  "Cable crunch": { muscle: "core", pattern: "trunk_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Abs bench crunch"] },
  "Cable glute kickback": { muscle: "glutes", pattern: "hip_extension", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Glute hyperextension", "Hip thrust"] },
  "Cable pull-through": { muscle: "glutes", pattern: "hip_hinge", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.5, variants: ["DB Romanian deadlift", "Hip thrust"] },
  "Cable hip abduction": { muscle: "abductors", pattern: "abduction", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["Abduction machine"] },
  "Barbell hip thrust": { muscle: "glutes", pattern: "hip_extension", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.0, variants: ["Hip thrust"] },
  "DB reverse lunge": { muscle: "glutes", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.9, variants: ["DB step-up", "DB Bulgarian split squat"] },
  "DB step-up": { muscle: "glutes", pattern: "lunge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["DB reverse lunge", "DB Bulgarian split squat"] },
  "DB single-leg Romanian deadlift": { muscle: "hamstrings", pattern: "hip_hinge", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.8, variants: ["DB Romanian deadlift"] },
  "DB sumo squat": { muscle: "quads", pattern: "knee_dominant", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["Goblet squat"] },
  "Leg press high feet": { muscle: "glutes", pattern: "glute_press", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 1.2, variants: ["Pivot leg press", "Hip thrust"] },
  "Abduction machine forward lean": { muscle: "glutes", pattern: "abduction", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.35, variants: ["Abduction machine"] },
  "Glute hyperextension": { muscle: "glutes", pattern: "hip_extension", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.45, variants: ["Roman chair", "Cable pull-through"] },
  "Cable fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.5, variants: ["Pec deck", "Low-to-high cable fly"] },
  "Low-to-high cable fly": { muscle: "chest", pattern: "horizontal_adduction", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable fly"] },
  "Single-arm cable row": { muscle: "back", pattern: "horizontal_pull", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.6, variants: ["One-arm DB row", "Low row"] },
  "Close-grip lat pulldown": { muscle: "back", pattern: "vertical_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.85, variants: ["Lat pulldown"] },
  "Wide-grip low row": { muscle: "back", pattern: "horizontal_pull", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.8, variants: ["Low row"] },
  "Barbell row": { muscle: "back", pattern: "horizontal_pull", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.05, variants: ["One-arm DB row", "Low row"] },
  "DB lateral raise": { muscle: "side_delts", pattern: "lateral_raise", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Cable lateral raise", "Standing multi flight"] },
  "DB Arnold press": { muscle: "shoulders", pattern: "vertical_push", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.85, variants: ["DB shoulder press"] },
  "DB rear delt fly": { muscle: "rear_delts", pattern: "horizontal_abduction", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Rear delt pec deck", "Face pull"] },
  "DB incline curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["DB curl", "Hammer curl"] },
  "Cable rope hammer curl": { muscle: "biceps", pattern: "elbow_flexion", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.45, variants: ["Cable curl", "Hammer curl"] },
  "Cable triceps kickback": { muscle: "triceps", pattern: "elbow_extension", equipment: "cable", unilateral: true, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.35, variants: ["Cable triceps extension"] },
  "DB overhead triceps extension": { muscle: "triceps", pattern: "elbow_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.45, variants: ["Cable overhead triceps extension"] },
  "Single-leg calf raise": { muscle: "calves", pattern: "plantar_flexion", equipment: "dumbbell", unilateral: true, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Standing calf raise"] },
  "Barbell back squat": { muscle: "quads", pattern: "knee_dominant", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.4, variants: ["Smith machine squat", "Pendulum squat"] },
  "Barbell front squat": { muscle: "quads", pattern: "knee_dominant", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.3, variants: ["Barbell back squat", "Goblet squat"] },
  "Smith machine squat": { muscle: "quads", pattern: "knee_dominant", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.2, variants: ["Barbell back squat", "Pendulum squat"] },
  "Smith machine split squat": { muscle: "glutes", pattern: "lunge", equipment: "smith", unilateral: true, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["DB Bulgarian split squat", "DB reverse lunge"] },
  "Smith machine hip thrust": { muscle: "glutes", pattern: "hip_extension", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.0, variants: ["Barbell hip thrust", "Hip thrust"] },
  "Smith machine incline press": { muscle: "chest", pattern: "incline_push", equipment: "smith", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.95, variants: ["DB incline press"] },
  "Barbell overhead press": { muscle: "shoulders", pattern: "vertical_push", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 1.0, variants: ["DB shoulder press", "Shoulder press Prime"] },
  "DB wrist curl": { muscle: "forearms", pattern: "wrist_flexion", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.25, variants: ["Cable reverse curl", "DB reverse wrist curl"] },
  "DB reverse wrist curl": { muscle: "forearms", pattern: "wrist_extension", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.25, variants: ["Cable reverse curl", "DB wrist curl"] },
  "Cable reverse curl": { muscle: "forearms", pattern: "reverse_curl", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.3, variants: ["DB reverse wrist curl", "Hammer curl"] },
  "DB shrug": { muscle: "traps", pattern: "shrug", equipment: "dumbbell", unilateral: false, loadUnit: LOAD_UNITS.PER_HAND_KG, fatigue: 0.35, variants: ["Barbell shrug", "Smith machine shrug"] },
  "Barbell shrug": { muscle: "traps", pattern: "shrug", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.45, variants: ["DB shrug", "Smith machine shrug"] },
  "Smith machine shrug": { muscle: "traps", pattern: "shrug", equipment: "machine", unilateral: false, loadUnit: LOAD_UNITS.MACHINE_TOTAL_KG, fatigue: 0.4, variants: ["Barbell shrug", "DB shrug"] },
  "Cable upright row": { muscle: "traps", pattern: "upright_row", equipment: "cable", unilateral: false, loadUnit: LOAD_UNITS.CABLE_STACK_KG, fatigue: 0.4, variants: ["DB shrug"] },
  "Barbell good morning": { muscle: "lower_back", pattern: "hip_hinge", equipment: "barbell", unilateral: false, loadUnit: LOAD_UNITS.BARBELL_KG, fatigue: 0.9, variants: ["Roman chair"] },

};

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
function dateKey(v) { return String(v || "").slice(0, 10); }
function latestByDate(rows) { return [...(rows || [])].sort((a, b) => String(b.workout_date).localeCompare(String(a.workout_date)) || Number(b.set_no || 0) - Number(a.set_no || 0)); }
export function parseRepRange(value) { const m = String(value || "").match(/(\d+)\s*[–-]\s*(\d+)/); return m ? { min: Number(m[1]), max: Number(m[2]) } : null; }
function completedRowsForExercise(history, exercise) {
  const canonical = normalizeExerciseName(exercise).toLowerCase();
  return (history || []).filter(r => normalizeExerciseName(r.exercise).toLowerCase() === canonical && String(r.type || "WORK").toUpperCase() === "WORK" && Number(r.completed) === 1);
}

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

// A variant of the same movement: listed as one, or the same muscle and pattern.
function relatedExercises(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b) return false;
  return (a.variants || []).includes(to) || (b.variants || []).includes(from) || (a.muscle === b.muscle && a.pattern === b.pattern);
}
// How a weight carries over between equipment, on the cautious side: a barbell
// holds about twice one dumbbell, a machine stack a bit less than that; another
// tool of the same kind (Smith instead of a free bar, another machine) a tenth
// less. Cable stacks and per-side machines differ too much to compare.
const UNIT_TRANSFER = {
  [LOAD_UNITS.PER_HAND_KG + ">" + LOAD_UNITS.BARBELL_KG]: 2.0, [LOAD_UNITS.BARBELL_KG + ">" + LOAD_UNITS.PER_HAND_KG]: 0.4,
  [LOAD_UNITS.PER_HAND_KG + ">" + LOAD_UNITS.MACHINE_TOTAL_KG]: 1.8, [LOAD_UNITS.MACHINE_TOTAL_KG + ">" + LOAD_UNITS.PER_HAND_KG]: 0.45,
  [LOAD_UNITS.BARBELL_KG + ">" + LOAD_UNITS.MACHINE_TOTAL_KG]: 0.9, [LOAD_UNITS.MACHINE_TOTAL_KG + ">" + LOAD_UNITS.BARBELL_KG]: 0.9
};
function transferFactor(from, to) {
  const a = EXERCISE_INTELLIGENCE[from], b = EXERCISE_INTELLIGENCE[to];
  if (!a || !b || !relatedExercises(from, to) || a.loadUnit === LOAD_UNITS.BODYWEIGHT || b.loadUnit === LOAD_UNITS.BODYWEIGHT) return null;
  if (a.loadUnit === b.loadUnit) return a.equipment === b.equipment && a.pattern === b.pattern ? 1 : 0.9;
  // Across load units only a listed variant (DB bench → barbell bench), not any
  // exercise of the muscle (a leg press is not a heavier squat).
  const variant = (a.variants || []).includes(to) || (b.variants || []).includes(from);
  return variant ? UNIT_TRANSFER[a.loadUnit + ">" + b.loadUnit] ?? null : null;
}

export const LOAD_RULES = {
  // METAGYM dumbbells: use a practical standard until the exact rack inventory is verified.
  // Light pairs from 2.5 kg are needed for raises, flies and starting loads of women.
  DUMBBELL: { min: 2.5, max: 50, step: 2.5, strict: true },
  // Cable stacks are machine-specific; 2.5 kg is the temporary conservative default.
  CABLE_STACK: { min: 2.5, max: null, step: 2.5, strict: true },
  // Plate-loaded machines and barbells can be built from 1.25 kg plates per side.
  PLATE_LOADED: { min: 2.5, max: null, step: 2.5, strict: false },
  BARBELL: { min: 10, max: null, step: 2.5, strict: true }
};

function loadRule(meta) {
  if (!meta) return LOAD_RULES.PLATE_LOADED;
  if (meta.loadUnit === LOAD_UNITS.PER_HAND_KG) return LOAD_RULES.DUMBBELL;
  if (meta.loadUnit === LOAD_UNITS.CABLE_STACK_KG) return LOAD_RULES.CABLE_STACK;
  if (meta.loadUnit === LOAD_UNITS.BARBELL_KG) return LOAD_RULES.BARBELL;
  if (meta.loadUnit === LOAD_UNITS.MACHINE_TOTAL_KG || meta.loadUnit === LOAD_UNITS.MACHINE_PER_SIDE_KG) return LOAD_RULES.PLATE_LOADED;
  return LOAD_RULES.PLATE_LOADED;
}

function roundToStep(value, step, min = 0, max = null) {
  if (value == null || !Number.isFinite(value)) return null;
  let rounded = Math.max(min, Math.round(value / step) * step);
  if (max != null) rounded = Math.min(max, rounded);
  return Math.round(rounded * 100) / 100;
}

export function resolveLoad(exercise, value) {
  exercise = normalizeExerciseName(exercise);
  const meta = EXERCISE_INTELLIGENCE[exercise];
  const rule = loadRule(meta);
  return roundToStep(value, rule.step, rule.min, rule.max);
}

function normalizeRpe(value) {
  const x = n(value);
  // 0 is used by the sheet/import pipeline for an unknown RPE, not for an
  // actual maximal-effort score.
  return x != null && x > 0 && x <= 10 ? x : null;
}

function progressionMultiplier(reps, rpeValue, targetReps) {
  const rpe = normalizeRpe(rpeValue);
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

function scoreHistoryRow(r, targetReps) {
  const range = parseRepRange(targetReps);
  const reps = n(r.actual_reps), rpe = normalizeRpe(r.rpe);
  let score = 0;
  if (range && reps >= range.min && reps <= range.max) score += 3;
  if (range && reps >= range.max) score += 1;
  if (rpe != null && rpe <= 8) score += 2;
  if (rpe != null && rpe >= 9.5) score -= 2;
  return score;
}

function selectReference(rows, targetReps) {
  const usable = latestByDate(rows).filter(r => n(r.actual_kg) != null && n(r.actual_reps) != null);
  if (!usable.length) return null;
  const latestDate = String(usable[0].workout_date || "").slice(0, 10);
  const latestWorkout = usable.filter(r => String(r.workout_date || "").slice(0, 10) === latestDate);
  const candidates = latestWorkout.length ? latestWorkout : usable.slice(0, 12);
  return [...candidates].sort((a, b) =>
    scoreHistoryRow(b, targetReps) - scoreHistoryRow(a, targetReps) ||
    Number(b.actual_reps || 0) - Number(a.actual_reps || 0) ||
    Number(b.set_no || 0) - Number(a.set_no || 0)
  )[0];
}

// Double progression from the latest session: all work sets at the top of the
// rep range (or an easy RPE) earn the next load step, a missed range or a
// near-maximal set takes a step back, anything else keeps the load and aims
// for more reps. The change is at least one real step of the equipment, so
// rounding never swallows it, and older sessions only count for the trend.
function stepDown(value, step, min = 0) { return Math.max(min, Math.floor(value / step + 1e-9) * step); }
export function progressionDecision(rows, exercise, targetReps, loadFactor = 1, today = null) {
  const sessions = new Map();
  for (const r of rows || []) {
    const kg = n(r.actual_kg), reps = n(r.actual_reps), date = dateKey(r.workout_date);
    if (kg == null || reps == null || !date) continue;
    (sessions.get(date) || sessions.set(date, []).get(date)).push({ kg, reps, rpe: normalizeRpe(r.rpe) });
  }
  const dates = [...sessions.keys()].sort((a, b) => b.localeCompare(a));
  if (!dates.length) return null;
  const range = parseRepRange(targetReps), meta = EXERCISE_INTELLIGENCE[normalizeExerciseName(exercise)], rule = loadRule(meta), step = rule.step;
  const latest = sessions.get(dates[0]);
  // The working load is the heaviest one that reached the bottom of the range.
  const inRange = latest.filter(s => !range || s.reps >= range.min);
  const topKg = Math.max(...(inRange.length ? inRange : latest).map(s => s.kg));
  const atTop = latest.filter(s => s.kg === topKg);
  const minReps = Math.min(...atTop.map(s => s.reps));
  const rpes = atTop.map(s => s.rpe).filter(x => x != null), maxRpe = rpes.length ? Math.max(...rpes) : null;
  let decision = "hold", kg = topKg;
  if ((range && minReps < range.min - 1) || (maxRpe != null && maxRpe >= 9.5)) {
    decision = "decrease";
    kg = Math.min(topKg - step, stepDown(topKg * 0.925, step, rule.min));
  } else if ((range && minReps >= range.max && (maxRpe == null || maxRpe <= 9)) || (range && minReps >= range.min && maxRpe != null && maxRpe <= 7)) {
    decision = "increase";
    const easy = maxRpe != null && maxRpe <= 6.5 && (!range || minReps >= range.max);
    kg = topKg + Math.max(step, stepDown(topKg * (easy ? 0.05 : 0.025), step));
  }
  // A poor recovery day keeps the load instead of adding to it.
  if (decision === "increase" && loadFactor < 0.9) { decision = "hold"; kg = topKg; }
  // After three weeks without the exercise, start a little lighter.
  const gap = today ? (Date.parse(dateKey(today) + "T12:00:00Z") - Date.parse(dates[0] + "T12:00:00Z")) / 86400000 : 0;
  if (gap > 21 && decision !== "decrease") { decision = "return"; kg = Math.min(topKg, stepDown(topKg * 0.9, step, rule.min) || topKg); }
  kg = resolveLoad(exercise, kg);
  // Stagnation: the same load for the last three sessions without more reps.
  const previous = dates.slice(1, 3).map(d => sessions.get(d));
  const stalled = decision === "hold" && previous.length === 2 && previous.every(p => Math.max(...p.map(s => s.kg)) === topKg && Math.min(...p.filter(s => s.kg === topKg).map(s => s.reps)) >= minReps);
  return { kg, decision, stalled, topKg, minReps, maxRpe, sets: atTop.length, date: dates[0], sessions: dates.length, range };
}

function estimateFromOwnHistory(own, exercise, targetReps, loadFactor, today = null) {
  const result = progressionDecision(own, exercise, targetReps, loadFactor, today);
  if (!result) return null;
  const confidence = clamp(0.72 + Math.min(result.sessions, 5) * 0.055, 0.72, 1);
  return {
    kg: result.kg, source: "own-history", confidence,
    referenceExercise: exercise, referenceKg: result.topKg,
    referenceReps: result.minReps, referenceRpe: result.maxRpe,
    referenceDate: result.date, performanceCount: Math.min(result.sessions, 5),
    progression: result.decision, stalled: result.stalled, referenceSets: result.sets,
    deltaPct: result.topKg ? Math.round((result.kg / result.topKg - 1) * 1000) / 10 : 0
  };
}

export function estimateStartingLoad({ exercise, history = [], targetReps = "8–15", fallbackKg = null, loadFactor = 1, today = null }) {
  exercise = normalizeExerciseName(exercise);
  const def = EXERCISE_INTELLIGENCE[exercise];
  if (!def) return { kg: fallbackKg, source: fallbackKg == null ? "unknown" : "fallback", confidence: fallbackKg == null ? 0 : 0.2 };
  const ownEstimate = estimateFromOwnHistory(completedRowsForExercise(history, exercise), exercise, targetReps, loadFactor, today);
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
    // Only a variant of the same movement says anything about this one.
    if (factor == null || similarity < 0.75 && !(EXERCISE_INTELLIGENCE[name].variants || []).includes(exercise) && !(EXERCISE_INTELLIGENCE[exercise].variants || []).includes(name)) continue;
    candidates.push({ name, kg, rpe: normalizeRpe(ref.rpe), reps: n(ref.actual_reps), similarity, factor, date: ref.workout_date });
  }
  candidates.sort((a, b) => b.similarity - a.similarity || String(b.date).localeCompare(String(a.date)));
  const ref = candidates[0];
  if (ref) {
    let kg = ref.kg * ref.factor;
    kg *= progressionMultiplier(ref.reps, normalizeRpe(ref.rpe), targetReps);
    kg *= recoveryMultiplier(loadFactor);
    const rounded = resolveLoad(exercise, kg);
    return { kg: rounded, source: "cross-exercise-estimate", confidence: clamp(0.55 + ref.similarity * 0.45, 0.55, 1), referenceExercise: ref.name, referenceKg: ref.kg, referenceRpe: ref.rpe, referenceReps: ref.reps, referenceDate: ref.date, similarity: ref.similarity, transferFactor: ref.factor };
  }
  if (fallbackKg != null) return { kg: resolveLoad(exercise, Number(fallbackKg)), source: "catalogue-default", confidence: 0.25 };
  return { kg: null, source: "no-reference", confidence: 0 };
}

export function analyzeCompletedWorkout(parsed, history = []) {
  const work = (parsed?.completedRows || []).filter(r => r.type === "WORK").map(r => ({ ...r, exercise: normalizeExerciseName(r.exercise) }));
  if (!work.length) return { status: "ok", completedSets: 0, summary: L("Zatím nejsou dokončené pracovní série k analýze.", "There are no completed work sets to analyse yet."), exercises: [], recommendations: [] };
  const byExercise = new Map();
  for (const row of work) { const arr = byExercise.get(row.exercise) || []; arr.push(row); byExercise.set(row.exercise, arr); }
  const exercises = [], recommendations = [];
  for (const [exercise, rows] of byExercise) {
    const usable = rows.filter(r => n(r.actual_kg) != null && n(r.actual_reps) != null);
    const avgRpeValues = rows.map(r => normalizeRpe(r.rpe)).filter(x => x != null);
    const avgRpe = avgRpeValues.length ? avgRpeValues.reduce((a, b) => a + b, 0) / avgRpeValues.length : null;
    const topReps = usable.length ? Math.max(...usable.map(r => n(r.actual_reps))) : null;
    const planned = rows[0]?.planned_kg != null ? n(rows[0].planned_kg) : null;
    const actuals = usable.map(r => n(r.actual_kg));
    const actualKg = actuals.length ? Math.max(...actuals) : null;
    let action = "hold";
    if (avgRpe != null && avgRpe <= 7.5 && topReps != null) action = "increase_small";
    else if (avgRpe != null && avgRpe >= 9) action = "hold_or_reduce";
    exercises.push({ exercise, sets: rows.length, plannedKg: planned, actualKg, avgRpe: avgRpe == null ? null : Math.round(avgRpe * 10) / 10, topReps, action, loadUnit: EXERCISE_INTELLIGENCE[exercise]?.loadUnit || null });
    recommendations.push({ exercise, action, reason: action === "increase_small" ? L("RPE byl kontrolovaný; příště lze zkusit malý nárůst, pokud se drží technika.", "RPE was under control; next time you can try a small increase if your technique holds.") : action === "hold_or_reduce" ? L("RPE byl vysoký; příště držet nebo mírně snížit podle regenerace.", "RPE was high; next time hold or slightly reduce depending on recovery.") : L("Zátěž zatím ponechat a potvrdit další sérií výkonu.", "Keep the load for now and confirm it with another set.") });
  }
  return { status: "ok", completedSets: work.length, workoutDate: parsed.date, summary: L(`Analyzováno ${work.length} dokončených pracovních sérií ve ${byExercise.size} cvicích.`, `Analysed ${work.length} completed work sets in ${byExercise.size} exercises.`), exercises, recommendations };
}

export function findExerciseAlternatives(exercise, history = [], requestedMuscle = null) {
  exercise = normalizeExerciseName(exercise);
  const base = EXERCISE_INTELLIGENCE[exercise];
  const targetMuscle = requestedMuscle || base?.muscle;
  return Object.entries(EXERCISE_INTELLIGENCE)
    .filter(([name, meta]) => name !== exercise && (!targetMuscle || meta.muscle === targetMuscle))
    .map(([name, meta]) => ({ name, muscle: meta.muscle, pattern: meta.pattern, equipment: meta.equipment, unilateral: meta.unilateral, loadUnit: meta.loadUnit, similarity: base ? scoreSimilarity(exercise, name) : 0 }))
    .sort((a, b) => b.similarity - a.similarity);
}
