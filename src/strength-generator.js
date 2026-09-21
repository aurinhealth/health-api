import { estimateStartingLoad, resolveLoad } from "./strength-intelligence.js";

const DEFAULT_EXECUTION = "BILATERAL";

const EXERCISES = {
  "DB bench press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "6–10", baseKg: 16, warmup: true, note: "Hlavní tlak; kg = 1 jednoručka", fatigue: 1.0 },
  "Low row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "6–10", baseKg: 20, warmup: true, note: "Hlavní tah; kg = celková zátěž stroje", fatigue: 1.0 },
  "DB shoulder press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "6–10", baseKg: 10, warmup: true, note: "Volné váhy; kg = 1 jednoručka", fatigue: 0.9 },
  "Pivot leg press": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "6–10", baseKg: 145, warmup: true, note: "Hlavní cvik; kg = celková zátěž stroje", fatigue: 1.35 },
  "Prone leg curl Prime": { pattern: "hamstring", muscle: "hamstrings", unilateral: true, sets: 3, reps: "8–15", baseKg: 40, warmup: false, note: "Hamstringy; kg = zátěž na jednu stranu", fatigue: 0.85 },
  "Cable curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "8–15", baseKg: 15, warmup: false, note: "Biceps; kg = váha na kladce", fatigue: 0.45 },
  "DB curl": { pattern: "biceps", muscle: "biceps", unilateral: true, sets: 3, reps: "8–15", baseKg: 10, warmup: false, note: "Biceps; kg = 1 jednoručka", fatigue: 0.45 },
  "Hammer curl": { pattern: "biceps", muscle: "biceps", unilateral: true, sets: 3, reps: "8–15", baseKg: 10, warmup: false, note: "Biceps; kg = 1 jednoručka", fatigue: 0.45 },
  "Cable triceps extension": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "8–15", baseKg: 15, warmup: false, note: "Triceps; kg = váha na kladce", fatigue: 0.45 },
  "Abs bench crunch": { pattern: "core", muscle: "core", unilateral: false, sets: 3, reps: "10–20", baseKg: 52.5, warmup: false, note: "Core; kg = celková zátěž stroje", fatigue: 0.35 },
  "Chest flat press Prime": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 42.5, warmup: true, note: "Hrudník; Prime stroj", fatigue: 0.95 },
  "Shoulder press Prime": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "8–12", baseKg: 10, warmup: true, note: "Ramena; Prime stroj", fatigue: 0.9 },
  "Lat pulldown": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 45, warmup: true, note: "Laty; kladka shora", fatigue: 0.9 },
  "Standing rowing machine": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: true, note: "Záda; standing rowing machine", fatigue: 0.95 },
  "Pendulum squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "6–10", baseKg: 35, warmup: true, note: "Kvadricepsy; pendulum squat", fatigue: 1.3 },
  "Leg extension Prime": { pattern: "quad", muscle: "quads", unilateral: true, sets: 2, reps: "10–15", baseKg: 45, warmup: false, note: "Kvadricepsy; ideálně jednostranně", fatigue: 0.65 },
  "Hip thrust": { pattern: "hip_extension", muscle: "glutes", unilateral: false, sets: 3, reps: "6–12", baseKg: 40, warmup: true, note: "Hýždě; hip thrust", fatigue: 1.0 },
  "DB Romanian deadlift": { pattern: "hinge", muscle: "hamstrings", unilateral: false, sets: 3, reps: "8–12", baseKg: 27.5, warmup: true, note: "Hamstringy/hýždě; kg = 1 jednoručka", fatigue: 1.0 },
  "Barbell Romanian deadlift": { pattern: "hinge", muscle: "hamstrings", unilateral: false, sets: 3, reps: "6–10", baseKg: 70, warmup: true, note: "Hamstringy/hýždě; osa", fatigue: 1.1 },
  "DB Bulgarian split squat": { pattern: "unilateral_quad", muscle: "quads", unilateral: true, sets: 3, reps: "8–12", baseKg: 20, warmup: false, note: "Jednostranná síla; kg = 1 jednoručka", fatigue: 1.0 },
  "Adduction machine": { pattern: "adduction", muscle: "adductors", unilateral: false, sets: 2, reps: "15–20", baseKg: 60, warmup: false, note: "Adduktory; stroj", fatigue: 0.35 },
  "Abduction machine": { pattern: "abduction", muscle: "abductors", unilateral: false, sets: 2, reps: "15–20", baseKg: 60, warmup: false, note: "Abduktory; stroj", fatigue: 0.35 },
  "Pec deck": { pattern: "horizontal_push", muscle: "chest", unilateral: false, sets: 3, reps: "10–15", baseKg: 40, warmup: false, note: "Hrudník; pec deck", fatigue: 0.55 },
  "Rear delt pec deck": { pattern: "rear_delt", muscle: "rear_delts", unilateral: false, sets: 3, reps: "10–15", baseKg: 31, warmup: false, note: "Zadní delty; reverse pec deck", fatigue: 0.45 },
  "Cable lateral raise": { pattern: "lateral_raise", muscle: "side_delts", unilateral: true, sets: 3, reps: "10–15", baseKg: 10, warmup: false, note: "Boční delty; jednostranně na kladce", fatigue: 0.35 },
  "Cable pullover": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 2, reps: "10–15", baseKg: 35, warmup: false, note: "Laty; kladka", fatigue: 0.45 },
  "Cable rear delt fly": { pattern: "rear_delt", muscle: "rear_delts", unilateral: true, sets: 2, reps: "10–15", baseKg: 15, warmup: false, note: "Zadní delty; jednostranně na kladce", fatigue: 0.35 },
  "Pallof press": { pattern: "anti_rotation", muscle: "core", unilateral: true, sets: 3, reps: "10–15", baseKg: 30, warmup: false, note: "Anti-rotace; jednostranně", fatigue: 0.3 },
  "Cable woodchop": { pattern: "rotation", muscle: "core", unilateral: true, sets: 2, reps: "8–12", baseKg: 25, warmup: false, note: "Rotace; jednostranně", fatigue: 0.3 },
  "Roman chair": { pattern: "trunk_extension", muscle: "core", unilateral: false, sets: 3, reps: "10–15", baseKg: 20, warmup: false, note: "Core/hyperextenze; stroj", fatigue: 0.4 },
  "Standing calf raise": { pattern: "plantar_flexion", muscle: "calves", unilateral: false, sets: 3, reps: "10–20", baseKg: 50, warmup: false, note: "Lýtka; stroj", fatigue: 0.45 },
  "Cable crunch": { pattern: "trunk_flexion", muscle: "core", unilateral: false, sets: 3, reps: "10–20", baseKg: 30, warmup: false, note: "Core; kladka", fatigue: 0.35 }
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
function choosePlan(context, options = {}) {
  const history = context?.strength?.recentCompletedSets || [];
  const legStress = cyclingLegStress(context);
  const muscleLoad = recentMuscleLoad(history, context.date);
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
    if (d && (!lastExerciseDate.has(row.exercise) || d > lastExerciseDate.get(row.exercise))) {
      lastExerciseDate.set(row.exercise, d);
    }
  }

  const notRecent = ex => {
    const d = lastExerciseDate.get(ex);
    return !d || daysBetween(d, context.date) >= 5;
  };

  const forceUpper = options.forceProtectLegs === true || options.focus === "upper";
  const forceLower = options.focus === "lower";

  const candidatesByPattern = {
    horizontalPush: ["DB bench press", "Chest flat press Prime", "Pec deck"],
    horizontalPull: ["Low row", "Standing rowing machine"],
    verticalPush: ["DB shoulder press", "Shoulder press Prime"],
    verticalPull: ["Lat pulldown", "Cable pullover"],
    biceps: ["DB curl", "Hammer curl", "Cable curl"],
    triceps: ["Cable triceps extension"],
    rearDelts: ["Rear delt pec deck", "Cable rear delt fly"],
    core: ["Abs bench crunch", "Cable crunch", "Pallof press", "Cable woodchop", "Roman chair"]
  };

  function pick(pattern, used = new Set()) {
    const candidates = candidatesByPattern[pattern] || [];
    return candidates
      .filter(ex => !used.has(ex) && notRecent(ex))
      .sort((a, b) => {
        const loadA = muscleLoad.get(EXERCISES[a]?.muscle) || 0;
        const loadB = muscleLoad.get(EXERCISES[b]?.muscle) || 0;
        return loadA - loadB || Number(EXERCISES[a]?.fatigue || 0) - Number(EXERCISES[b]?.fatigue || 0);
      })[0] || candidates.find(ex => !used.has(ex));
  }

  // Prevent redundant movement patterns in the same session. For example,
  // DB bench press + Chest flat press Prime are both horizontal pressing;
  // the generator should prefer one of them rather than duplicating the pattern.
  function patternOf(exercise) {
    return EXERCISES[exercise]?.pattern || null;
  }

  function pickDiverse(pattern, used = new Set()) {
    const candidates = candidatesByPattern[pattern] || [];
    return candidates
      .filter(ex => !used.has(ex) && notRecent(ex))
      .sort((a, b) => {
        const loadA = muscleLoad.get(EXERCISES[a]?.muscle) || 0;
        const loadB = muscleLoad.get(EXERCISES[b]?.muscle) || 0;
        return loadA - loadB || Number(EXERCISES[a]?.fatigue || 0) - Number(EXERCISES[b]?.fatigue || 0);
      })[0] || candidates.find(ex => !used.has(ex));
  }

  function addDiverse(exercises, used, preferredPatterns) {
    for (const pattern of preferredPatterns) {
      const ex = pickDiverse(pattern, used);
      if (ex) {
        exercises.push(ex);
        used.add(ex);
      }
    }
    return exercises;
  }

  function buildUpper() {
    const used = new Set();
    const exercises = [];
    addDiverse(exercises, used, ["horizontalPush", "horizontalPull", "verticalPush", "biceps", "triceps"]);
    return exercises;
  }

  if (forceUpper || (protectLegs && !forceLower)) {
    const exercises = buildUpper();
    return {
      name: "Upper Body",
      exercises,
      rationale: forceUpper
        ? "Požadavek uživatele chrání nohy a soustředí trénink na horní část těla; cviky se vybírají podle čerstvosti a nedávné svalové zátěže."
        : (recentTss >= 700 || nextHard || nextLong
          ? "Cyklistická zátěž je vysoká nebo následuje náročnější/long ride; proto chráníme nohy a cviky horní části těla vybíráme podle čerstvosti a nedávné svalové zátěže."
          : "Aktuální kumulovaná zátěž favorizuje upper-body jednotku; výběr cviků zohledňuje nedávnou svalovou zátěž a opakování cviků."),
      protectedLegs: true,
      recentWorkoutCount,
      muscleLoad
    };
  }

  if (forceLower) {
    const used = new Set();
    const legCandidates = ["Pivot leg press", "Pendulum squat", "DB Bulgarian split squat", "Leg extension Prime", "Prone leg curl Prime", "DB Romanian deadlift", "Barbell Romanian deadlift", "Hip thrust"];
    const exercises = legCandidates
      .filter(ex => notRecent(ex))
      .sort((a, b) => (muscleLoad.get(EXERCISES[a]?.muscle) || 0) - (muscleLoad.get(EXERCISES[b]?.muscle) || 0))
      .slice(0, 3);
    return {
      name: "Lower Body",
      exercises: exercises.length ? exercises : ["Pivot leg press", "Prone leg curl Prime"],
      rationale: "Požadavek uživatele soustředí trénink na dolní část těla; cviky se vybírají podle čerstvosti a nedávné svalové zátěže.",
      protectedLegs: false,
      recentWorkoutCount,
      muscleLoad
    };
  }

  const used = new Set();
  const legCandidates = ["Pivot leg press", "Pendulum squat", "DB Romanian deadlift", "Prone leg curl Prime", "Hip thrust", "Leg extension Prime", "DB Bulgarian split squat"];
  const leg = legCandidates
    .filter(ex => notRecent(ex))
    .sort((a, b) => (muscleLoad.get(EXERCISES[a]?.muscle) || 0) - (muscleLoad.get(EXERCISES[b]?.muscle) || 0))[0];
  if (leg) used.add(leg);
  const upper = [];
  addDiverse(upper, used, ["horizontalPush", "horizontalPull", "verticalPush", "core"]);
  return {
    name: "Full Body",
    exercises: [leg, ...upper].filter(Boolean),
    rationale: "Cyklistická zátěž a recovery dovolují plný silový stimul; výběr cviků zohledňuje nedávnou svalovou zátěž a čerstvost jednotlivých cviků.",
    protectedLegs: false,
    recentWorkoutCount,
    muscleLoad
  };
}
function warmupRows(exercise, workKg = null) {
  const def = EXERCISES[exercise]; if (!def?.warmup) return [];
  const reference = workKg ?? def.baseKg; if (reference == null) return [];
  const rawKg = Math.max(2, reference * 0.4), rawKg2 = Math.max(2, reference * 0.65), rawKg3 = Math.max(2, reference * 0.8);
  const kg = resolveLoad(exercise, rawKg), kg2 = resolveLoad(exercise, rawKg2), kg3 = resolveLoad(exercise, rawKg3);
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

export function generateStrengthPlan(context, options = {}) {
  const chosen = choosePlan(context, options), factor = recoveryFactor(context), history = context?.strength?.recentCompletedSets || [], historyMap = recentExerciseMap(history);
  let exercises = [...chosen.exercises];
  const excluded = new Set((options.excludeExercises || []).map(String));
  exercises = exercises.filter(ex => !excluded.has(ex));
  const candidates = ["Cable triceps extension", "Cable curl", "Hammer curl", "DB curl", "Chest flat press Prime", "Shoulder press Prime", "DB bench press", "Low row", "Standing rowing machine", "Lat pulldown", "DB shoulder press", "Pec deck", "Rear delt pec deck", "Cable lateral raise", "Prone leg curl Prime", "Leg extension Prime", "DB Romanian deadlift", "DB Bulgarian split squat", "Hip thrust", "Pivot leg press", "Pendulum squat", "Abs bench crunch", "Cable crunch", "Pallof press"];
  for (const candidate of candidates) {
    if (exercises.length >= (Number(options.maxExercises) || (Number(options.durationMinutes) <= 45 ? 3 : Number(options.durationMinutes) <= 60 ? 4 : 5))) break;
    if (!exercises.includes(candidate) && !excluded.has(candidate)) exercises.push(candidate);
  }
  const maxExercises = Number(options.maxExercises) || (Number(options.durationMinutes) <= 45 ? 3 : Number(options.durationMinutes) <= 60 ? 4 : 5);
  exercises = exercises.slice(0, maxExercises);

  // Warm-up exercises must be the first exercises of the session. Keep the
  // relative order otherwise, so each exercise's warm-up sets stay immediately
  // before its work sets and no warm-up exercise is introduced later in the plan.
  exercises = exercises.sort((a, b) => Number(EXERCISES[b]?.warmup === true) - Number(EXERCISES[a]?.warmup === true));

  const rows = [], loadEstimates = [];
  for (const exercise of exercises) {
    const work = workRows(exercise, historyMap, factor, chosen.protectedLegs);
    rows.push(...warmupRows(exercise, work.kg), ...work.rows);
    loadEstimates.push({ exercise, ...work.estimate });
  }
  return { date: context.date, planName: chosen.name, rationale: chosen.rationale, loadFactor: factor, protectedLegs: chosen.protectedLegs, recentCompletedSets: history.length, recentCompletedWorkoutCount: chosen.recentWorkoutCount, loadEstimates, rows };
}

export { EXERCISES };
