const DEFAULT_EXECUTION = "BILATERAL";

// Exercise catalogue. The generator deliberately keeps exercise names aligned with
// the existing sheet/equipment vocabulary. New exercises can be added here without
// changing the sheet format.
const EXERCISES = {
  "DB bench press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "6–10", baseKg: 16, warmup: true, note: "Hlavní tlak", fatigue: 1.0 },
  "Low row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "6–10", baseKg: 20, warmup: true, note: "Hlavní tah", fatigue: 1.0 },
  "DB shoulder press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "6–10", baseKg: 10, warmup: true, note: "Volné váhy", fatigue: 0.9 },
  "Pivot leg press": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "6–10", baseKg: 145, warmup: true, note: "Hlavní cvik", fatigue: 1.35 },
  "Prime prone leg curl": { pattern: "hamstring", muscle: "hamstrings", unilateral: true, sets: 3, reps: "8–15", baseKg: 40, warmup: false, note: "Hamstringy", fatigue: 0.85 },
  "Cable curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "8–15", baseKg: null, warmup: false, note: "Biceps", fatigue: 0.45 },
  "Abs bench crunch": { pattern: "core", muscle: "core", unilateral: false, sets: 3, reps: "10–20", baseKg: 52.5, warmup: false, note: "Core", fatigue: 0.35 }
};

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

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
  return [...new Set((history || []).map(x => dateKey(x.workout_date)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
}

function latestCompleted(exRows) {
  if (!exRows?.length) return null;
  return [...exRows].sort((a, b) =>
    String(b.workout_date).localeCompare(String(a.workout_date)) ||
    Number(b.set_no || 0) - Number(a.set_no || 0)
  )[0];
}

function recentExerciseDays(history, exercise, maxDays = 14) {
  const today = dateKey(history?.[0]?.workout_date);
  return [...new Set((history || [])
    .filter(x => x.exercise === exercise)
    .map(x => dateKey(x.workout_date))
    .filter(Boolean)
    .filter(d => daysBetween(d, today) <= maxDays))];
}

function parseRepRange(value) {
  const s = String(value || "");
  const m = s.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

function targetKg(exercise, historyRows, loadFactor) {
  const def = EXERCISES[exercise];
  if (!def || def.baseKg == null) return "";

  const latest = latestCompleted(historyRows);
  let kg = latest?.actual_kg != null ? num(latest.actual_kg) : def.baseKg;
  if (kg == null) return "";

  // RPE drives progression; loadFactor is a secondary fatigue adjustment.
  const rpe = latest?.rpe == null ? null : num(latest.rpe);
  const reps = latest?.actual_reps == null ? null : num(latest.actual_reps);
  const range = parseRepRange(def.reps);

  if (rpe != null) {
    if (rpe <= 6.5) kg *= 1.05;
    else if (rpe <= 7.5) kg *= 1.025;
    else if (rpe >= 9.5) kg *= 0.92;
    else if (rpe >= 9) kg *= 0.95;
  }

  // If the athlete reached the top of the prescribed rep range at a controlled RPE,
  // allow a small progression even when the latest row is not the first set.
  if (reps != null && range && reps >= range.max && rpe != null && rpe <= 8) kg *= 1.025;

  // Avoid unnecessarily changing a load just because cycling fatigue is present.
  // Upper-body work gets a smaller reduction; leg work gets a larger one.
  const fatigueSensitivity = def.muscle === "quads" || def.muscle === "hamstrings" ? 1.15 : 0.65;
  const effectiveFactor = 1 - (1 - loadFactor) * fatigueSensitivity;
  kg *= clamp(effectiveFactor, 0.82, 1);

  return Math.round(kg * 2) / 2;
}

function recoverySignals(context) {
  const recovery = context?.recovery || {};
  let hrv = null;
  let restingHr = null;
  let sleepMin = null;

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

  // Cycling load is interpreted continuously rather than as a single hard cutoff.
  if (recentTss >= 900) factor *= 0.90;
  else if (recentTss >= 750) factor *= 0.94;
  else if (recentTss >= 600) factor *= 0.97;

  if (recentHours >= 12) factor *= 0.96;
  else if (recentHours >= 9) factor *= 0.98;

  const intensityCount = recent.slice(0, 4).filter(x => x.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(String(x.name || ""))).length;
  if (intensityCount >= 3) factor *= 0.94;
  else if (intensityCount >= 2) factor *= 0.97;

  const next = context?.cycling?.nextRide;
  const nextName = String(next?.name || "");
  const nextHard = !!next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/i.test(nextName);
  const nextLong = (num(next?.durationHours) || 0) >= 2.5;
  if (nextHard) factor *= 0.96;
  if (nextLong) factor *= 0.97;

  if (signals.sleepMin != null) {
    if (signals.sleepMin < 330) factor *= 0.94;
    else if (signals.sleepMin < 390) factor *= 0.98;
  }
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
    const sets = completed ? 1 : 0;
    const weight = num(row.actual_kg) || num(row.planned_kg) || 0;
    const rpe = num(row.rpe);
    const effort = rpe == null ? 0.8 : clamp(rpe / 10, 0.5, 1.1);
    const recency = age <= 3 ? 1 : age <= 7 ? 0.65 : 0.35;
    const score = sets * def.fatigue * effort * recency * (weight > 0 ? 1 : 0.7);
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

  // Leg volume is reduced when bike stress is high or a hard/long ride is imminent.
  const protectLegs = legStress >= 0.85 || nextHard || nextLong;

  // Avoid repeating the same exercise if there is meaningful completed history.
  const lastExerciseDate = new Map();
  for (const row of history) {
    const d = dateKey(row.workout_date);
    if (!d) continue;
    if (!lastExerciseDate.has(row.exercise) || d > lastExerciseDate.get(row.exercise)) lastExerciseDate.set(row.exercise, d);
  }

  const notRecent = ex => {
    const d = lastExerciseDate.get(ex);
    return !d || daysBetween(d, context.date) >= 5;
  };

  if (protectLegs) {
    return {
      name: "Upper Body + Core",
      exercises: ["DB bench press", "Low row", "DB shoulder press", "Cable curl", "Abs bench crunch"],
      rationale: recentTss >= 700 || nextHard || nextLong
        ? "Cyklistická zátěž je vysoká nebo následuje náročnější/long ride; proto chráníme nohy a držíme silový stimul hlavně nahoře."
        : "Aktuální kumulovaná zátěž favorizuje upper-body jednotku bez dalšího významného zatížení nohou.",
      protectedLegs: true,
      recentWorkoutCount,
      muscleLoad
    };
  }

  // When legs are available, include both knee- and hip-dominant work, but don't
  // force an exercise that was just used when another movement is available.
  const legPress = notRecent("Pivot leg press") ? "Pivot leg press" : "Prime prone leg curl";
  const hamstring = legPress === "Pivot leg press" ? "Prime prone leg curl" : null;

  return {
    name: "Full Body",
    exercises: [legPress, "DB bench press", "Low row", ...(hamstring ? [hamstring] : []), "DB shoulder press", "Abs bench crunch"],
    rationale: "Cyklistická zátěž a recovery dovolují plný silový stimul; objem nohou zůstává přiměřený aktuální cyklistické zátěži.",
    protectedLegs: false,
    recentWorkoutCount,
    muscleLoad
  };
}

function warmupRows(exercise) {
  const def = EXERCISES[exercise];
  if (!def?.warmup) return [];
  const kg = def.baseKg == null ? "" : Math.max(2, Math.round(def.baseKg * 0.4 * 2) / 2);
  const kg2 = def.baseKg == null ? "" : Math.max(2, Math.round(def.baseKg * 0.65 * 2) / 2);
  const kg3 = def.baseKg == null ? "" : Math.max(2, Math.round(def.baseKg * 0.8 * 2) / 2);
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
  const kg = targetKg(exercise, historyMap.get(exercise), factor);
  const execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION;
  const rows = [];

  // In high bike stress, leg accessories keep their sets but use a slightly wider
  // rep target and lower load through targetKg's fatigue adjustment.
  const reps = protectedLegs && (def.muscle === "quads" || def.muscle === "hamstrings") ? "8–12" : def.reps;
  for (let i = 0; i < def.sets; i++) {
    rows.push([
      "WORK", exercise, String(i + 1), kg === "" ? "" : String(kg).replace(".", ","), reps,
      "", "", "", "FALSE", def.note, i === 0 ? "🎥 Video" : "", "", execution
    ]);
  }
  return rows;
}

export function generateStrengthPlan(context) {
  const chosen = choosePlan(context);
  const factor = recoveryFactor(context);
  const historyMap = recentExerciseMap(context?.strength?.recentCompletedSets || []);
  const rows = [];

  for (const exercise of chosen.exercises) {
    rows.push(...warmupRows(exercise));
    rows.push(...workRows(exercise, historyMap, factor, chosen.protectedLegs));
  }

  return {
    date: context.date,
    planName: chosen.name,
    rationale: chosen.rationale,
    loadFactor: factor,
    protectedLegs: chosen.protectedLegs,
    recentCompletedSets: (context?.strength?.recentCompletedSets || []).length,
    recentCompletedWorkoutCount: chosen.recentWorkoutCount,
    rows
  };
}
