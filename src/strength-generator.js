const DEFAULT_EXECUTION = "BILATERAL";

const EXERCISES = {
  "DB bench press": { pattern: "push", unilateral: false, sets: 3, reps: "6–10", baseKg: 16, note: "Hlavní tlak" },
  "Low row": { pattern: "pull", unilateral: false, sets: 3, reps: "6–10", baseKg: 20, note: "Hlavní tah" },
  "DB shoulder press": { pattern: "push", unilateral: false, sets: 3, reps: "6–10", baseKg: 10, note: "Volné váhy" },
  "Pivot leg press": { pattern: "quad", unilateral: false, sets: 3, reps: "6–10", baseKg: 145, note: "Hlavní cvik" },
  "Prime prone leg curl": { pattern: "hamstring", unilateral: true, sets: 3, reps: "8–15", baseKg: 40, note: "Hamstringy" },
  "Cable curl": { pattern: "biceps", unilateral: false, sets: 3, reps: "8–15", baseKg: null, note: "Biceps" },
  "Abs bench crunch": { pattern: "core", unilateral: false, sets: 3, reps: "10–20", baseKg: 52.5, note: "Core" }
};

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

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

function latestCompleted(exRows) {
  if (!exRows?.length) return null;
  return [...exRows].sort((a, b) => String(b.workout_date).localeCompare(String(a.workout_date)) || Number(b.set_no || 0) - Number(a.set_no || 0))[0];
}

function targetKg(exercise, historyRows, loadFactor) {
  const def = EXERCISES[exercise];
  if (!def || def.baseKg == null) return "";
  const latest = latestCompleted(historyRows);
  let kg = latest?.actual_kg != null ? num(latest.actual_kg) : def.baseKg;
  if (kg == null) return "";

  const rpe = latest?.rpe == null ? null : num(latest.rpe);
  if (rpe != null) {
    if (rpe <= 7) kg *= 1.025;
    else if (rpe >= 9) kg *= 0.95;
  }
  kg *= loadFactor;
  return Math.round(kg * 2) / 2;
}

function recoveryFactor(context) {
  const recent = context?.cycling?.recentActivities || [];
  const recentTss = num(context?.cycling?.recentRideTss) || 0;
  const nextRide = context?.cycling?.nextRide;
  const nextIntensity = !!nextRide?.intensity;
  const recentIntensity = recent.slice(0, 3).filter(x => x.intensity).length;

  // The generator deliberately uses conservative, transparent rules:
  // hard recent cycling + hard upcoming cycling -> reduce lower-body loading;
  // a rest day / easy upcoming ride permits normal upper-body work.
  let factor = 1;
  if (recentTss >= 750) factor *= 0.95;
  if (recentIntensity >= 2) factor *= 0.95;
  if (nextIntensity) factor *= 0.95;
  if (nextRide && !nextIntensity && (num(nextRide.tss) || 0) <= 50) factor *= 1.0;
  return clamp(factor, 0.85, 1);
}

function choosePlan(context) {
  const next = context?.cycling?.nextRide;
  const nextName = String(next?.name || "").toLowerCase();
  const nextIsHard = !!next?.intensity || /(threshold|tempo|sweet spot|vo2|interval)/.test(nextName);
  const nextIsLong = (num(next?.durationHours) || 0) >= 2.5;
  const todayIsRestBike = !next || (String(next.date) === String(context.date) && (num(next.tss) || 0) === 0);

  // Prioritize upper body when cycling fatigue is high and the next ride is hard/long.
  if ((num(context?.cycling?.recentRideTss) || 0) >= 700 || nextIsHard || nextIsLong) {
    return {
      name: "Upper Body + Core",
      exercises: ["DB bench press", "Low row", "DB shoulder press", "Prime prone leg curl", "Cable curl", "Abs bench crunch"],
      rationale: todayIsRestBike ? "Volíme upper-body dominantní jednotku; aktuální cyklistická zátěž je vysoká a další dny obsahují další jízdy." : "Volíme upper-body dominantní jednotku kvůli cyklistické zátěži a nadcházející jízdě."
    };
  }

  return {
    name: "Full Body",
    exercises: ["Pivot leg press", "DB bench press", "Low row", "Prime prone leg curl", "DB shoulder press", "Abs bench crunch"],
    rationale: "Cyklistická zátěž dovoluje standardní full-body jednotku."
  };
}

function warmupRows(exercise) {
  const def = EXERCISES[exercise];
  const kg = def.baseKg == null ? "" : Math.max(2, Math.round(def.baseKg * 0.4 * 2) / 2);
  const kg2 = def.baseKg == null ? "" : Math.max(2, Math.round(def.baseKg * 0.65 * 2) / 2);
  const kg3 = def.baseKg == null ? "" : Math.max(2, Math.round(def.baseKg * 0.8 * 2) / 2);
  return [
    ["WARMUP", exercise, "1", String(kg).replace(".", ","), "8", "", "", "", "FALSE", "[WARMUP]", "🎥 Video", "", DEFAULT_EXECUTION],
    ["WARMUP", exercise, "2", String(kg2).replace(".", ","), "5", "", "", "", "FALSE", "[WARMUP]", "", "", DEFAULT_EXECUTION],
    ["WARMUP", exercise, "3", String(kg3).replace(".", ","), "3", "", "", "", "FALSE", "[WARMUP]", "", "", DEFAULT_EXECUTION]
  ];
}

function workRows(exercise, historyMap, factor) {
  const def = EXERCISES[exercise];
  const kg = targetKg(exercise, historyMap.get(exercise), factor);
  return Array.from({ length: def.sets }, (_, i) => [
    "WORK", exercise, String(i + 1), kg === "" ? "" : String(kg).replace(".", ","), def.reps,
    "", "", "", "FALSE", def.note, i === 0 ? "🎥 Video" : "", "", def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION
  ]);
}

export function generateStrengthPlan(context) {
  const chosen = choosePlan(context);
  const factor = recoveryFactor(context);
  const historyMap = recentExerciseMap(context?.strength?.recentCompletedSets || []);
  const rows = [];

  for (const exercise of chosen.exercises) {
    if (exercise !== "Cable curl") rows.push(...warmupRows(exercise));
    rows.push(...workRows(exercise, historyMap, factor));
  }

  return {
    date: context.date,
    planName: chosen.name,
    rationale: chosen.rationale,
    loadFactor: factor,
    rows
  };
}
