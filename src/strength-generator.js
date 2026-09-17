import { EXERCISE_INTELLIGENCE, estimateStartingLoad } from "./strength-intelligence.js";

const DEFAULT_EXECUTION = "BILATERAL";

// Workout catalogue. Keep this list aligned with exercises that are actually
// available to the athlete. Intelligence/transfer metadata lives separately.
const EXERCISES = {
  "DB bench press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "6–10", baseKg: 16, warmup: true, note: "Hlavní tlak", fatigue: 1.0 },
  "Low row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "6–10", baseKg: 20, warmup: true, note: "Hlavní tah", fatigue: 1.0 },
  "DB shoulder press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "6–10", baseKg: 10, warmup: true, note: "Volné váhy", fatigue: 0.9 },
  "Pivot leg press": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "6–10", baseKg: 145, warmup: true, note: "Hlavní cvik", fatigue: 1.35 },
  "Prime prone leg curl": { pattern: "hamstring", muscle: "hamstrings", unilateral: true, sets: 3, reps: "8–15", baseKg: 40, warmup: false, note: "Hamstringy", fatigue: 0.85 },
  "Cable curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "8–15", baseKg: null, warmup: false, note: "Biceps", fatigue: 0.45 },
  "DB curl": { pattern: "biceps", muscle: "biceps", unilateral: true, sets: 3, reps: "8–15", baseKg: null, warmup: false, note: "Biceps", fatigue: 0.45 },
  "Hammer curl": { pattern: "biceps", muscle: "biceps", unilateral: true, sets: 3, reps: "8–15", baseKg: null, warmup: false, note: "Biceps", fatigue: 0.45 },
  "Abs bench crunch": { pattern: "core", muscle: "core", unilateral: false, sets: 3, reps: "10–20", baseKg: 52.5, warmup: false, note: "Core", fatigue: 0.35 }
};

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : null; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function dateKey(v) { return String(v || "").slice(0, 10); }
function daysBetween(a, b) {
  const da = new Date(`${dateKey(a)}T12:00:00Z`).getTime();
  const db = new Date(`${dateKey(b)}T12:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.round(Math.abs(da - db) / 86400000);
}
function recentExerciseMap(history) {
  const map = new Map();
  for (const row of history || []) {
    const ex = String(row.exercise || "");
    if (!ex) continue;
    const arr = map.get(ex) || [];
    arr.push(row);
    map.set(ex, arr);
  }
  return map;
}
function completedWorkoutDates(history) {
  return [...new Set((history || []).map(x => dateKey(x.workout_date)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
}
function recoverySignals(context) {
  const recovery = context?.recovery || {};
  let hrv = null, restingHr = null, sleepMin = null;
  for (const [key, value] of Object.entries(recovery)) {
    const k = key.toLowerCase();
    const arr = Array.isArray(value) ? value : [];
    const latest = arr[arr.length - 1];
    if (!latest) continue;
    const v = num(latest.value ?? latest.minutes ?? latest.durationMinutes);
    if (v == null) continue;
    if (k.includes("hrv") || k.includes("heart_rate_variability")) hrv = v;
    else if (k.includes("resting") && k.includes("heart")) restingHr = v;
    else if (k.includes("sleep") && (k.includes("duration") || k.includes("minute"))) sleepMin = v;
  }
  return { hrv, restingHr, sleepMin };
}
function recoveryFactor(context) {
  const recentTss = num(context?.cycling?.recentRideTss) || 0;
  const recentHours = num(context?.cycling?.recentRideHours) || 0;
  const recent = context?.cycling?.recentActivities || [];
  const signals = recoverySignals(context);
  let factor = 1;
  if (recentTss >= 900) factor *= 0.90; else if (recentTss >= 750) factor *= 0.94; else if (recentTss >= 600) factor *= 0.97;
  if (recentHours >= 12) factor *= 0.96; else if (recentHours >= 9) factor *= 0.98;
  const intensityCount = recent.slice(0, 4).filter(x => x.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(String(x.name || ""))).length;
  if (intensityCount >= 3) factor *= 0.94; else if (intensityCount >= 2) factor *= 0.97;
  const next = context?.cycling?.nextRide;
  const nextName = String(next?.name || "");
  const nextHard = !!next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(nextName);
  const nextLong = (num(next?.durationHours) || 0) >= 2.5;
  if (nextHard) factor *= 0.96;
  if (nextLong) factor *= 0.97;
  if (signals.sleepMin != null) { if (signals.sleepMin < 330) factor *= 0.94; else if (signals.sleepMin < 390) factor *= 0.98; }
  if (signals.hrv != null && signals.hrv < 90) factor *= 0.97;
  if (signals.restingHr != null && signals.restingHr >= 55) factor *= 0.97;
  return clamp(factor, 0.82, 1);
}
function cyclingLegStress(context) {
  const recentTss = num(context?.cycling?.recentRideTss) || 0;
  const recent = context?.cycling?.recentActivities || [];
  const next = context?.cycling?.nextRide;
  const nextName = String(next?.name || "");
  let stress = clamp(recentTss / 800, 0, 1.2);
  const last48h = recent.slice(0, 3).reduce((sum, x) => sum + (num(x.tss) || 0), 0);
  stress += clamp(last48h / 450, 0, 0.8) * 0.35;
  if (next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(nextName)) stress += 0.25;
  if ((num(next?.durationHours) || 0) >= 2.5) stress += 0.2;
  return clamp(stress, 0, 1.5);
}
function recentMuscleLoad(history) {
  const load = new Map();
  for (const row of history || []) {
    const def = EXERCISES[row.exercise];
    if (!def) continue;
    const age = daysBetween(row.workout_date, history?.[0]?.workout_date);
    if (age > 14) continue;
    const completed = row.completed ? 1 : 0;
    const rpe = num(row.rpe);
    const effort = rpe == null ? 0.8 : clamp(rpe / 10, 0.5, 1.1);
    const recency = age <= 3 ? 1 : age <= 7 ? 0.65 : 0.35;
    const score = completed * def.fatigue * effort * recency;
    load.set(def.muscle, (load.get(def.muscle) || 0) + score);
  }
  return load;
}
function choosePlan(context) {
  const history = context?.strength?.recentCompletedSets || [];
  const legStress = cyclingLegStress(context);
  const muscleLoad = recentMuscleLoad(history);
  const dates = completedWorkoutDates(history);
  const recentWorkoutCount = dates.filter(d => daysBetween(d, context.date) <= 10).length;
  const recentTss = num(context?.cycling?.recentRideTss) || 0;
  const next = context?.cycling?.nextRide;
  const nextName = String(next?.name || "");
  const nextHard = !!next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(nextName);
  const nextLong = (num(next?.durationHours) || 0) >= 2.5;
  const protectLegs = legStress >= 0.85 || nextHard || nextLong;
  const lastExerciseDate = new Map();
  for (const row of history) {
    const d = dateKey(row.workout_date);
    if (d && (!lastExerciseDate.has(row.exercise) || d > lastExerciseDate.get(row.exercise))) lastExerciseDate.set(row.exercise, d);
  }
  const notRecent = ex => { const d = lastExerciseDate.get(ex); return !d || daysBetween(d, context.date) >= 5; };
  if (protectLegs) return {
    name: "Upper Body + Core",
    exercises: ["DB bench press", "Low row", "DB shoulder press", "Cable curl", "Abs bench crunch"],
    rationale: recentTss >= 700 || nextHard || nextLong ? "Cyklistická zátěž je vysoká nebo následuje náročnější/long ride; proto chráníme nohy a držíme silový stimul hlavně nahoře." : "Aktuální kumulovaná zátěž favorizuje upper-body jednotku bez dalšího významného zatížení nohou.",
    protectedLegs: true, recentWorkoutCount, muscleLoad
  };
  const legPress = notRecent("Pivot leg press") ? "Pivot leg press" : "Prime prone leg curl";
  const hamstring = legPress === "Pivot leg press" ? "Prime prone leg curl" : null;
  return {
    name: "Full Body",
    exercises: [legPress, "DB bench press", "Low row", ...(hamstring ? [hamstring] : []), "DB shoulder press", "Abs bench crunch"],
    rationale: "Cyklistická zátěž a recovery dovolují plný silový stimul; objem nohou zůstává přiměřený aktuální cyklistické zátěži.",
    protectedLegs: false, recentWorkoutCount, muscleLoad
  };
}
function warmupRows(exercise, workKg = null) {
  const def = EXERCISES[exercise];
  if (!def?.warmup) return [];
  const reference = workKg ?? def.baseKg;
  if (reference == null) return [];
  const kg = Math.max(2, Math.round(reference * 0.4 * 2) / 2);
  const kg2 = Math.max(2, Math.round(reference * 0.65 * 2) / 2);
  const kg3 = Math.max(2, Math.round(reference * 0.8 * 2) / 2);
  const execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION;
  const fmt = x => String(x).replace(".", ",");
  return [
    ["WARMUP", exercise, "1", fmt(kg), "8", "", "", "", "FALSE", "[WARMUP]", "🎥 Video", "", execution],
    ["WARMUP", exercise, "2", fmt(kg2), "5", "", "", "", "FALSE", "[WARMUP]", "", "", execution],
    ["WARMUP", exercise, "3", fmt(kg3), "3", "", "", "", "FALSE", "[WARMUP]", "", "", execution]
  ];
}
function workRows(exercise, historyMap, factor, protectedLegs) {
  const def = EXERCISES[exercise];
  const estimate = estimateStartingLoad({ exercise, history: [...historyMap.values()].flat(), targetReps: def.reps, fallbackKg: def.baseKg, loadFactor: factor });
  const kg = estimate.kg;
  const execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION;
  const reps = protectedLegs && (def.muscle === "quads" || def.muscle === "hamstrings") ? "8–12" : def.reps;
  const note = estimate.source === "cross-exercise-estimate"
    ? `${def.note}; odhad z ${estimate.referenceExercise}, ověř RPE`
    : def.note;
  const rows = [];
  for (let i = 0; i < def.sets; i++) rows.push(["WORK", exercise, String(i + 1), kg == null ? "" : String(kg).replace(".", ","), reps, "", "", "", "FALSE", note, i === 0 ? "🎥 Video" : "", "", execution]);
  return { rows, kg, estimate };
}

export function generateStrengthPlan(context) {
  const chosen = choosePlan(context);
  const factor = recoveryFactor(context);
  const history = context?.strength?.recentCompletedSets || [];
  const historyMap = recentExerciseMap(history);
  const rows = [];
  const loadEstimates = [];
  for (const exercise of chosen.exercises) {
    const work = workRows(exercise, historyMap, factor, chosen.protectedLegs);
    rows.push(...warmupRows(exercise, work.kg));
    rows.push(...work.rows);
    loadEstimates.push({ exercise, ...work.estimate });
  }
  return {
    date: context.date,
    planName: chosen.name,
    rationale: chosen.rationale,
    loadFactor: factor,
    protectedLegs: chosen.protectedLegs,
    recentCompletedSets: history.length,
    recentCompletedWorkoutCount: chosen.recentWorkoutCount,
    loadEstimates,
    rows
  };
}

export { EXERCISES };
