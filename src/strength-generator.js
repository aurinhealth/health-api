import { estimateStartingLoad } from "./strength-intelligence.js";

const DEFAULT_EXECUTION = "BILATERAL";

const EXERCISES = {
  "DB bench press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "6–10", baseKg: 16, warmup: true, note: "Hlavní tlak; kg = 1 jednoručka", fatigue: 1.0 },
  "Low row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "6–10", baseKg: 20, warmup: true, note: "Hlavní tah; kg = celková zátěž stroje", fatigue: 1.0 },
  "DB shoulder press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "6–10", baseKg: 10, warmup: true, note: "Volné váhy; kg = 1 jednoručka", fatigue: 0.9 },
  "Pivot leg press": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "6–10", baseKg: 145, warmup: true, note: "Hlavní cvik; kg = celková zátěž stroje", fatigue: 1.35 },
  "Prime prone leg curl": { pattern: "hamstring", muscle: "hamstrings", unilateral: true, sets: 3, reps: "8–15", baseKg: 40, warmup: false, note: "Hamstringy; kg = zátěž na jednu stranu", fatigue: 0.85 },
  "Cable curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "8–15", baseKg: 15, warmup: false, note: "Biceps; kg = váha na kladce", fatigue: 0.45 },
  "DB curl": { pattern: "biceps", muscle: "biceps", unilateral: true, sets: 3, reps: "8–15", baseKg: 10, warmup: false, note: "Biceps; kg = 1 jednoručka", fatigue: 0.45 },
  "Hammer curl": { pattern: "biceps", muscle: "biceps", unilateral: true, sets: 3, reps: "8–15", baseKg: 10, warmup: false, note: "Biceps; kg = 1 jednoručka", fatigue: 0.45 },
  "Abs bench crunch": { pattern: "core", muscle: "core", unilateral: false, sets: 3, reps: "10–20", baseKg: 52.5, warmup: false, note: "Core; kg = celková zátěž stroje", fatigue: 0.35 }
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
    const ex = String(row.exercise || ""); if (!ex) continue;
    const arr = map.get(ex) || []; arr.push(row); map.set(ex, arr);
  }
  return map;
}
function completedWorkoutDates(history) { return [...new Set((history || []).map(x => dateKey(x.workout_date)).filter(Boolean))].sort((a, b) => b.localeCompare(a)); }
function recoverySignals(context) {
  const recovery = context?.recovery || {};
  let hrv = null, restingHr = null, sleepMin = null;
  for (const [key, value] of Object.entries(recovery)) {
    const k = key.toLowerCase(), arr = Array.isArray(value) ? value : [];
    const latest = [...arr].sort((a, b) => String(b.sampleTime || b.startTime || "").localeCompare(String(a.sampleTime || a.startTime || "")))[0];
    if (!latest) continue;
    const v = num(latest.value ?? latest.minutes ?? latest.durationMinutes); if (v == null) continue;
    if (k.includes("hrv") || k.includes("heart_rate_variability")) hrv = v;
    else if (k.includes("resting") && k.includes("heart")) restingHr = v;
    else if (k.includes("sleep") && (k.includes("duration") || k.includes("minute"))) sleepMin = v;
  }
  return { hrv, restingHr, sleepMin };
}
function recoveryFactor(context) {
  const recentTss = num(context?.cycling?.recentRideTss) || 0, recentHours = num(context?.cycling?.recentRideHours) || 0;
  const recent = context?.cycling?.recentActivities || [], signals = recoverySignals(context);
  let factor = 1;
  if (recentTss >= 900) factor *= 0.90; else if (recentTss >= 750) factor *= 0.94; else if (recentTss >= 600) factor *= 0.97;
  if (recentHours >= 12) factor *= 0.96; else if (recentHours >= 9) factor *= 0.98;
  const intensityCount = recent.slice(0, 4).filter(x => x.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(String(x.name || ""))).length;
  if (intensityCount >= 3) factor *= 0.94; else if (intensityCount >= 2) factor *= 0.97;
  const next = context?.cycling?.nextRide, nextName = String(next?.name || "");
  const nextHard = !!next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(nextName), nextLong = (num(next?.durationHours) || 0) >= 2.5;
  if (nextHard) factor *= 0.96; if (nextLong) factor *= 0.97;
  if (signals.sleepMin != null) { if (signals.sleepMin < 330) factor *= 0.94; else if (signals.sleepMin < 390) factor *= 0.98; }
  if (signals.hrv != null && signals.hrv < 90) factor *= 0.97;
  if (signals.restingHr != null && signals.restingHr >= 55) factor *= 0.97;
  return clamp(factor, 0.82, 1);
}
function cyclingLegStress(context) {
  const recentTss = num(context?.cycling?.recentRideTss) || 0, recent = context?.cycling?.recentActivities || [], next = context?.cycling?.nextRide;
  const nextName = String(next?.name || "");
  let stress = clamp(recentTss / 800, 0, 1.2);
  const last48h = recent.slice(0, 3).reduce((sum, x) => sum + (num(x.tss) || 0), 0);
  stress += clamp(last48h / 450, 0, 0.8) * 0.35;
  if (next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(nextName)) stress += 0.25;
  if ((num(next?.durationHours) || 0) >= 2.5) stress += 0.2;
  return clamp(stress, 0, 1.5);
}
function recentMuscleLoad(history, contextDate) {
  const load = new Map();
  for (const row of history || []) {
    const def = EXERCISES[row.exercise]; if (!def) continue;
    const age = daysBetween(row.workout_date, contextDate); if (age > 14) continue;
    const rpe = num(row.rpe), effort = rpe == null ? 0.8 : clamp(rpe / 10, 0.5, 1.1), recency = age <= 3 ? 1 : age <= 7 ? 0.65 : 0.35;
    load.set(def.muscle, (load.get(def.muscle) || 0) + def.fatigue * effort * recency);
  }
  return load;
}
function choosePlan(context) {
  const history = context?.strength?.recentCompletedSets || [], legStress = cyclingLegStress(context), muscleLoad = recentMuscleLoad(history, context.date);
  const dates = completedWorkoutDates(history), recentWorkoutCount = dates.filter(d => daysBetween(d, context.date) <= 10).length;
  const recentTss = num(context?.cycling?.recentRideTss) || 0, next = context?.cycling?.nextRide, nextName = String(next?.name || "");
  const nextHard = !!next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(nextName), nextLong = (num(next?.durationHours) || 0) >= 2.5;
  const protectLegs = legStress >= 0.85 || nextHard || nextLong;
  const lastExerciseDate = new Map();
  for (const row of history) { const d = dateKey(row.workout_date); if (d && (!lastExerciseDate.has(row.exercise) || d > lastExerciseDate.get(row.exercise))) lastExerciseDate.set(row.exercise, d); }
  const notRecent = ex => { const d = lastExerciseDate.get(ex); return !d || daysBetween(d, context.date) >= 5; };
  if (protectLegs) return { name: "Upper Body + Core", exercises: ["DB bench press", "Low row", "DB shoulder press", "DB curl", "Abs bench crunch"], rationale: recentTss >= 700 || nextHard || nextLong ? "Cyklistická zátěž je vysoká nebo následuje náročnější/long ride; proto chráníme nohy a držíme silový stimul hlavně nahoře." : "Aktuální kumulovaná zátěž favorizuje upper-body jednotku bez dalšího významného zatížení nohou.", protectedLegs: true, recentWorkoutCount, muscleLoad };
  const legPress = notRecent("Pivot leg press") ? "Pivot leg press" : "Prime prone leg curl";
  const hamstring = legPress === "Pivot leg press" ? "Prime prone leg curl" : null;
  return { name: "Full Body", exercises: [legPress, "DB bench press", "Low row", ...(hamstring ? [hamstring] : []), "DB shoulder press", "Abs bench crunch"], rationale: "Cyklistická zátěž a recovery dovolují plný silový stimul; objem nohou zůstává přiměřený aktuální cyklistické zátěži.", protectedLegs: false, recentWorkoutCount, muscleLoad };
}
function warmupRows(exercise, workKg = null) {
  const def = EXERCISES[exercise]; if (!def?.warmup) return [];
  const reference = workKg ?? def.baseKg; if (reference == null) return [];
  const kg = Math.max(2, Math.round(reference * 0.4 * 2) / 2), kg2 = Math.max(2, Math.round(reference * 0.65 * 2) / 2), kg3 = Math.max(2, Math.round(reference * 0.8 * 2) / 2);
  const execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION, fmt = x => String(x).replace(".", ",");
  return [["WARMUP", exercise, "1", fmt(kg), "8", "", "", "", "FALSE", "[WARMUP]", "🎥 Video", "", execution], ["WARMUP", exercise, "2", fmt(kg2), "5", "", "", "", "FALSE", "[WARMUP]", "", "", execution], ["WARMUP", exercise, "3", fmt(kg3), "3", "", "", "", "FALSE", "[WARMUP]", "", "", execution]];
}
function workRows(exercise, historyMap, factor, protectedLegs) {
  const def = EXERCISES[exercise], estimate = estimateStartingLoad({ exercise, history: [...historyMap.values()].flat(), targetReps: def.reps, fallbackKg: def.baseKg, loadFactor: factor });
  const kg = estimate.kg, execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION;
  const reps = protectedLegs && (def.muscle === "quads" || def.muscle === "hamstrings") ? "8–12" : def.reps;
  const note = estimate.source === "cross-exercise-estimate" ? `${def.note}; odhad z ${estimate.referenceExercise}, ověř RPE` : def.note;
  const rows = [];
  for (let i = 0; i < def.sets; i++) rows.push(["WORK", exercise, String(i + 1), kg == null ? "" : String(kg).replace(".", ","), reps, "", "", "", "FALSE", note, i === 0 ? "🎥 Video" : "", "", execution]);
  return { rows, kg, estimate };
}

export function generateStrengthPlan(context) {
  const chosen = choosePlan(context), factor = recoveryFactor(context), history = context?.strength?.recentCompletedSets || [], historyMap = recentExerciseMap(history);
  const rows = [], loadEstimates = [];
  for (const exercise of chosen.exercises) {
    const work = workRows(exercise, historyMap, factor, chosen.protectedLegs);
    rows.push(...warmupRows(exercise, work.kg), ...work.rows);
    loadEstimates.push({ exercise, ...work.estimate });
  }
  return { date: context.date, planName: chosen.name, rationale: chosen.rationale, loadFactor: factor, protectedLegs: chosen.protectedLegs, recentCompletedSets: history.length, recentCompletedWorkoutCount: chosen.recentWorkoutCount, loadEstimates, rows };
}

export { EXERCISES };
