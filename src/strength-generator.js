import { estimateStartingLoad, resolveLoad, progressionDecision } from "./strength-intelligence.js";
import { normalizeExerciseName } from "./strength-normalization.js";
import { isIntensity } from "./strength-context.js";
import { availableAt } from "./gym-equipment.js";
import { sportMuscleLoad,strengthCoverage } from './strength-balance.js';
import { trainingStatus } from './training-status.js';
import { configureStrengthCoaching, estimateStrengthTiming } from './strength-timing.js';

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
  "Cable crunch": { pattern: "trunk_flexion", muscle: "core", unilateral: false, sets: 3, reps: "10–20", baseKg: 30, warmup: false, note: "Core; kladka", fatigue: 0.35 },
  "Barbell bench press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "5–8", baseKg: 50, warmup: true, note: "Hlavní tlak; benchpress s osou, kg = celá osa", fatigue: 1.05 },
  "DB incline press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 14, warmup: true, note: "Horní hrudník; polohovací lavice 30°, kg = 1 jednoručka", fatigue: 0.95 },
  "One-arm DB row": { pattern: "pull", muscle: "back", unilateral: true, sets: 3, reps: "8–12", baseKg: 22, warmup: false, note: "Záda; opora o lavici, kg = 1 jednoručka", fatigue: 0.8 },
  "Standing multi flight": { pattern: "lateral_raise", muscle: "side_delts", unilateral: false, sets: 3, reps: "10–15", baseKg: 20, warmup: false, note: "Boční ramena; stroj na roztahování ve stoje", fatigue: 0.4 },
  "Face pull": { pattern: "rear_delt", muscle: "rear_delts", unilateral: false, sets: 3, reps: "12–15", baseKg: 20, warmup: false, note: "Zadní ramena a lopatky; lano na kladce", fatigue: 0.35 },
  "Cable overhead triceps extension": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "10–15", baseKg: 15, warmup: false, note: "Triceps (dlouhá hlava); lano na kladce za hlavou", fatigue: 0.45 },
  "Goblet squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "8–12", baseKg: 20, warmup: false, note: "Dřep s jednoručkou na hrudi", fatigue: 0.9 },
  // Variations on the same METAGYM stations (added 2026-10-03).
  "Cable glute kickback": { pattern: "glute_kickback", muscle: "glutes", unilateral: true, sets: 3, reps: "10–15", baseKg: 10, warmup: false, note: "Hýždě; manžeta na kotníku, kladka dole, kg = váha na kladce", fatigue: 0.35 },
  "Cable pull-through": { pattern: "hinge", muscle: "glutes", unilateral: false, sets: 3, reps: "10–15", baseKg: 20, warmup: false, note: "Hýždě a hamstringy; lano mezi nohama, pohyb z kyčlí", fatigue: 0.5 },
  "Cable hip abduction": { pattern: "abduction", muscle: "abductors", unilateral: true, sets: 2, reps: "12–20", baseKg: 5, warmup: false, note: "Střední hýžďový sval; unožování ve stoje na kladce", fatigue: 0.3 },
  "Barbell hip thrust": { pattern: "hip_extension", muscle: "glutes", unilateral: false, sets: 3, reps: "8–12", baseKg: 60, warmup: true, note: "Hýždě; záda o polohovací lavici, osa přes pánev s podložkou, kg = celá osa", fatigue: 1.0 },
  "DB reverse lunge": { pattern: "lunge", muscle: "glutes", unilateral: true, sets: 3, reps: "8–12", baseKg: 10, warmup: false, note: "Hýždě a stehna; výpad vzad, kg = 1 jednoručka", fatigue: 0.9 },
  "DB step-up": { pattern: "lunge", muscle: "glutes", unilateral: true, sets: 3, reps: "8–12", baseKg: 10, warmup: false, note: "Hýždě a stehna; výstupy na polohovací lavici, kg = 1 jednoručka", fatigue: 0.85 },
  "DB single-leg Romanian deadlift": { pattern: "hinge", muscle: "hamstrings", unilateral: true, sets: 3, reps: "8–12", baseKg: 12.5, warmup: false, note: "Hamstringy a hýždě, stabilita; kg = 1 jednoručka", fatigue: 0.8 },
  "DB sumo squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "10–12", baseKg: 20, warmup: false, note: "Široký dřep s jednoručkou; vnitřní stehna a hýždě", fatigue: 0.85 },
  "Leg press high feet": { pattern: "glute_press", muscle: "glutes", unilateral: false, sets: 3, reps: "8–12", baseKg: 120, warmup: true, note: "Hýždě; chodidla vysoko a šířeji na plošině, kg = celková zátěž stroje", fatigue: 1.2 },
  "Abduction machine forward lean": { pattern: "abduction", muscle: "glutes", unilateral: false, sets: 2, reps: "12–20", baseKg: 50, warmup: false, note: "Hýždě; v předklonu na kraji sedáku", fatigue: 0.35 },
  "Glute hyperextension": { pattern: "hip_extension", muscle: "glutes", unilateral: false, sets: 3, reps: "12–15", baseKg: 10, warmup: false, note: "Hýždě; Roman chair s kulatými zády, tlak pánví do opěrky", fatigue: 0.45 },
  "Cable fly": { pattern: "horizontal_push", muscle: "chest", unilateral: false, sets: 3, reps: "10–15", baseKg: 10, warmup: false, note: "Hrudník; rozpažování na kladkách, kg = jedna strana", fatigue: 0.5 },
  "Low-to-high cable fly": { pattern: "horizontal_push", muscle: "chest", unilateral: false, sets: 3, reps: "12–15", baseKg: 7.5, warmup: false, note: "Horní hrudník; kladky dole, tah šikmo nahoru, kg = jedna strana", fatigue: 0.45 },
  "Single-arm cable row": { pattern: "pull", muscle: "back", unilateral: true, sets: 3, reps: "10–12", baseKg: 20, warmup: false, note: "Záda; přítah jednoruč na kladce", fatigue: 0.6 },
  "Close-grip lat pulldown": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 45, warmup: false, note: "Laty; úzký neutrální úchop", fatigue: 0.85 },
  "Wide-grip low row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "10–12", baseKg: 35, warmup: false, note: "Horní záda a zadní ramena; široký úchop, lokty do stran", fatigue: 0.8 },
  "Barbell row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "6–10", baseKg: 50, warmup: true, note: "Záda; přítah osy v předklonu, kg = celá osa", fatigue: 1.05 },
  "DB lateral raise": { pattern: "lateral_raise", muscle: "side_delts", unilateral: false, sets: 3, reps: "12–15", baseKg: 6, warmup: false, note: "Boční ramena; kg = 1 jednoručka", fatigue: 0.35 },
  "DB Arnold press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "8–12", baseKg: 10, warmup: false, note: "Ramena; rotace dlaní, sed na polohovací lavici, kg = 1 jednoručka", fatigue: 0.85 },
  "DB rear delt fly": { pattern: "rear_delt", muscle: "rear_delts", unilateral: false, sets: 3, reps: "12–15", baseKg: 5, warmup: false, note: "Zadní ramena; hrudník opřený o šikmou lavici, kg = 1 jednoručka", fatigue: 0.35 },
  "DB incline curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "10–12", baseKg: 8, warmup: false, note: "Biceps (dlouhá hlava); šikmá lavice, kg = 1 jednoručka", fatigue: 0.45 },
  "Cable rope hammer curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "10–15", baseKg: 15, warmup: false, note: "Biceps a brachialis; lano na kladce", fatigue: 0.45 },
  "Cable triceps kickback": { pattern: "triceps", muscle: "triceps", unilateral: true, sets: 3, reps: "12–15", baseKg: 5, warmup: false, note: "Triceps; jednoruč v předklonu na kladce", fatigue: 0.35 },
  "DB overhead triceps extension": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "10–12", baseKg: 15, warmup: false, note: "Triceps (dlouhá hlava); jedna jednoručka oběma rukama za hlavou", fatigue: 0.45 },
  "Single-leg calf raise": { pattern: "plantar_flexion", muscle: "calves", unilateral: true, sets: 3, reps: "10–15", baseKg: 10, warmup: false, note: "Lýtka; jednonož s jednoručkou, opora rukou", fatigue: 0.35 },
  "Barbell back squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "5–8", baseKg: 60, warmup: true, note: "Dřep s osou v kleci; kg = celá osa", fatigue: 1.4 },
  "Barbell front squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "6–8", baseKg: 45, warmup: true, note: "Čelní dřep s osou v kleci; kg = celá osa", fatigue: 1.3 },
  "Smith machine squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "8–12", baseKg: 50, warmup: true, note: "Dřep na Smith stroji; kg = kotouče + osa Smithu", fatigue: 1.2 },
  "Smith machine split squat": { pattern: "lunge", muscle: "glutes", unilateral: true, sets: 3, reps: "8–12", baseKg: 30, warmup: false, note: "Hýždě a stehna; bulharský dřep na Smithu, zadní noha na lavici, kg = kotouče + osa", fatigue: 0.95 },
  "Smith machine hip thrust": { pattern: "hip_extension", muscle: "glutes", unilateral: false, sets: 3, reps: "8–12", baseKg: 60, warmup: true, note: "Hýždě; hip thrust pod osou Smithu, záda o lavici, kg = kotouče + osa", fatigue: 1.0 },
  "Smith machine incline press": { pattern: "horizontal_push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: true, note: "Horní hrudník; šikmá lavice pod Smithem, kg = kotouče + osa", fatigue: 0.95 },
  "Barbell overhead press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "5–8", baseKg: 35, warmup: true, note: "Ramena; tlak osy nad hlavu ve stoje z klece, kg = celá osa", fatigue: 1.0 },
  // Forearms, traps and lower back (added 2026-10-05).
  "DB wrist curl": { pattern: "wrist_flexion", muscle: "forearms", unilateral: false, sets: 3, reps: "12–20", baseKg: 8, warmup: false, note: "Předloktí (flexory); předloktí na lavici, dlaně nahoru, kg = 1 jednoručka", fatigue: 0.25 },
  "DB reverse wrist curl": { pattern: "wrist_extension", muscle: "forearms", unilateral: false, sets: 3, reps: "12–20", baseKg: 4, warmup: false, note: "Předloktí (extenzory); předloktí na lavici, dlaně dolů, kg = 1 jednoručka", fatigue: 0.25 },
  "Cable reverse curl": { pattern: "reverse_curl", muscle: "forearms", unilateral: false, sets: 3, reps: "10–15", baseKg: 12.5, warmup: false, note: "Předloktí a brachioradialis; nadhmat na rovné tyči, spodní kladka", fatigue: 0.3 },
  "DB shrug": { pattern: "shrug", muscle: "traps", unilateral: false, sets: 3, reps: "10–15", baseKg: 24, warmup: false, note: "Trapézy; ramena nahoru k uším a výdrž, kg = 1 jednoručka", fatigue: 0.35 },
  "Barbell shrug": { pattern: "shrug", muscle: "traps", unilateral: false, sets: 3, reps: "8–12", baseKg: 60, warmup: false, note: "Trapézy; osa z klece ve výšce stehen, kg = celá osa", fatigue: 0.45 },
  "Smith machine shrug": { pattern: "shrug", muscle: "traps", unilateral: false, sets: 3, reps: "10–15", baseKg: 50, warmup: false, note: "Trapézy; osa Smithu ve výšce stehen, kg = kotouče + osa", fatigue: 0.4 },
  "Cable upright row": { pattern: "upright_row", muscle: "traps", unilateral: false, sets: 3, reps: "10–15", baseKg: 20, warmup: false, note: "Trapézy a boční ramena; tyč na spodní kladce, lokty nejvýš do výšky ramen", fatigue: 0.4 },
  "Barbell good morning": { pattern: "hinge", muscle: "lower_back", unilateral: false, sets: 3, reps: "8–12", baseKg: 30, warmup: true, note: "Spodní záda a hamstringy; osa na zádech z klece, rovná záda, kg = celá osa", fatigue: 0.9 }

};

export const FOCUS_GROUPS = {
  chest: {label:'Hrudník', exercises:['DB bench press','Chest flat press Prime','Barbell bench press','DB incline press','Pec deck','Cable fly','Low-to-high cable fly','Smith machine incline press']},
  upper_back: {label:'Horní záda', exercises:['Low row','Standing rowing machine','One-arm DB row','Single-arm cable row','Wide-grip low row','Barbell row']},
  lats: {label:'Široký sval zádový', exercises:['Lat pulldown','Cable pullover','Close-grip lat pulldown']},
  front_delts: {label:'Přední ramena', exercises:['DB shoulder press','Shoulder press Prime','DB Arnold press','Barbell overhead press']},
  side_delts: {label:'Boční ramena', exercises:['Standing multi flight','Cable lateral raise','DB lateral raise']},
  rear_delts: {label:'Zadní ramena', exercises:['Rear delt pec deck','Cable rear delt fly','Face pull','DB rear delt fly']},
  biceps: {label:'Biceps', exercises:['Cable curl','DB curl','Hammer curl','DB incline curl','Cable rope hammer curl']},
  triceps: {label:'Triceps', exercises:['Cable triceps extension','Cable overhead triceps extension','Cable triceps kickback','DB overhead triceps extension']},
  abs: {label:'Břišní svaly', exercises:['Abs bench crunch','Cable crunch']},
  obliques: {label:'Šikmé břišní svaly', exercises:['Pallof press','Cable woodchop']},
  quads: {label:'Přední stehna', exercises:['Pivot leg press','Pendulum squat','Leg extension Prime','DB Bulgarian split squat','Goblet squat','DB sumo squat','Barbell back squat','Barbell front squat','Smith machine squat']},
  hamstrings: {label:'Zadní stehna', exercises:['Prone leg curl Prime','DB Romanian deadlift','Barbell Romanian deadlift','DB single-leg Romanian deadlift']},
  hips: {label:'Hýždě a kyčle', exercises:['Hip thrust','Abduction machine','Adduction machine','Barbell hip thrust','Leg press high feet','Cable glute kickback','Glute hyperextension','Cable pull-through','Abduction machine forward lean','Cable hip abduction','DB reverse lunge','DB step-up','DB sumo squat','Smith machine hip thrust','Smith machine split squat']},
  calves: {label:'Lýtka', exercises:['Standing calf raise','Single-leg calf raise']},
  forearms: {label:'Předloktí', exercises:['DB wrist curl','DB reverse wrist curl','Cable reverse curl']},
  traps: {label:'Trapézy', exercises:['DB shrug','Barbell shrug','Smith machine shrug','Cable upright row']},
  lower_back: {label:'Spodní záda', exercises:['Roman chair','Barbell good morning']}
};

export function validateFocusMuscles(value){
  if(!Array.isArray(value)||value.length<1||value.length>5)return null;
  const unique=[...new Set(value.map(String))];
  return unique.length===value.length&&unique.every(id=>Object.hasOwn(FOCUS_GROUPS,id))?unique:null;
}

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
    const ex = normalizeExerciseName(row.exercise); if (!ex) continue;
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
// Days from the context date to a ride (negative: in the past). Rides without
// a date (older callers) count as imminent, as they always did.
function daysFrom(item, date) {
  const d = dateKey(item?.date || item?.start);
  if (!d || !dateKey(date)) return null;
  return Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(dateKey(date) + "T12:00:00Z")) / 86400000);
}
const within = (item, date, from, to) => { const d = daysFrom(item, date); return d == null || (d >= from && d <= to); };
const longRide = x => (num(x?.durationHours) || 0) >= 2.5;
const hardRide = x => isIntensity(x) || longRide(x);
// Ride load of the last 14 days against the athlete's own chronic load (CTL × 14):
// 600 TSS is a heavy fortnight for one athlete and an easy one for another.
function acuteLoadRatio(context) {
  const ctl = num(context?.cycling?.lastRide?.ctl) || num(context?.cycling?.recentActivities?.[0]?.ctl) || num(context?.fitness?.ctl);
  if (!ctl || ctl <= 0) return null;
  return (num(context?.cycling?.recentRideTss) || 0) / (ctl * 14);
}
function recoveryFactor(context) {
  const recentTss = num(context?.cycling?.recentRideTss) || 0, recentHours = num(context?.cycling?.recentRideHours) || 0;
  const recent = context?.cycling?.recentActivities || [], signals = recoverySignals(context), ratio = acuteLoadRatio(context);
  let factor = 1;
  if (ratio != null) { if (ratio >= 1.5) factor *= 0.90; else if (ratio >= 1.3) factor *= 0.94; else if (ratio >= 1.15) factor *= 0.97; }
  else { if (recentTss >= 900) factor *= 0.90; else if (recentTss >= 750) factor *= 0.94; else if (recentTss >= 600) factor *= 0.97; if (recentHours >= 12) factor *= 0.96; else if (recentHours >= 9) factor *= 0.98; }
  const intensityCount = recent.filter(x => within(x, context.date, -4, 0)).slice(0, 4).filter(isIntensity).length;
  if (intensityCount >= 3) factor *= 0.94; else if (intensityCount >= 2) factor *= 0.97;
  const next = context?.cycling?.nextRide, nextSoon = next && within(next, context.date, 0, 1);
  if (nextSoon && isIntensity(next)) factor *= 0.96; if (nextSoon && longRide(next)) factor *= 0.97;
  const upcoming = Array.isArray(context?.cycling?.plannedWorkouts) ? context.cycling.plannedWorkouts.filter(x => within(x, context.date, 0, 2)).slice(0, 3) : [];
  if (upcoming.filter(isIntensity).length >= 2) factor *= 0.96;
  if (upcoming.filter(longRide).length >= 2) factor *= 0.97;
  if (signals.sleepMin != null) { if (signals.sleepMin < 330) factor *= 0.94; else if (signals.sleepMin < 390) factor *= 0.98; }
  const readiness = context?.adaptive?.recovery?.score;
  if (readiness != null && readiness < 70) factor *= 0.97;
  return clamp(factor, 0.82, 1);
}
// Legs get a reduced dose only when a key ride is close (today or tomorrow,
// or two hard ones within two days), after a very big last 48 hours, or when
// the ride load is well above the athlete's usual. Otherwise a cyclist
// trains legs normally: riding does not replace leg strength work.
function legProtection(context) {
  const date = context.date, next = context?.cycling?.nextRide;
  const fmt = x => x?.name ? " (" + x.name + ")" : "";
  if (next && within(next, date, 0, 1) && hardRide(next)) {
    const d = daysFrom(next, date);
    return { protect: true, reason: (d === 0 ? "Dnes" : d === 1 ? "Zítra" : "Brzy") + " je v plánu " + (isIntensity(next) ? "náročná jízda" : "dlouhá jízda") + fmt(next) + "." };
  }
  const near = (context?.cycling?.plannedWorkouts || []).filter(x => within(x, date, 0, 2) && hardRide(x));
  if (near.length >= 2) return { protect: true, reason: "Během dvou dnů jsou v plánu dvě náročné jízdy." };
  const ctl = num(context?.cycling?.lastRide?.ctl) || num(context?.cycling?.recentActivities?.[0]?.ctl) || null;
  const last48 = (context?.cycling?.recentActivities || []).filter(x => within(x, date, -1, 0)).slice(0, 3).reduce((sum, x) => sum + (num(x.tss) || 0), 0);
  if (last48 >= Math.max(250, (ctl || 0) * 4)) return { protect: true, reason: "Za poslední dva dny máš za sebou velkou jízdní zátěž (" + Math.round(last48) + " TSS)." };
  const ratio = acuteLoadRatio(context);
  if (ratio != null ? ratio >= 1.35 : (num(context?.cycling?.recentRideTss) || 0) >= 1000) return { protect: true, reason: "Jízdní zátěž posledních dvou týdnů je výrazně nad tvým obvyklým objemem." };
  return { protect: false, reason: "" };
}
function recentMuscleExposure(history, contextDate) {
  const exposure = new Map();
  for (const row of history || []) {
    const def = EXERCISES[normalizeExerciseName(row.exercise)];
    if (!def || String(row.type || "WORK").toUpperCase() !== "WORK") continue;
    const age = daysBetween(row.workout_date, contextDate);
    if (age > 7) continue;
    exposure.set(def.muscle, (exposure.get(def.muscle) || 0) + 1);
  }
  return exposure;
}
// Fatigue of each muscle from the last three days only: muscles recover in
// 48–72 hours, so training them twice a week must not cut their volume.
function acuteMuscleLoad(history, contextDate) {
  const load = new Map();
  for (const row of history || []) {
    const def = EXERCISES[normalizeExerciseName(row.exercise)]; if (!def || row.planned) continue;
    const age = daysBetween(row.workout_date, contextDate); if (age > 3) continue;
    const rpe = num(row.rpe), effort = rpe == null ? 0.8 : clamp(rpe / 10, 0.5, 1.1), recency = age <= 1 ? 1 : age === 2 ? 0.6 : 0.3;
    load.set(def.muscle, (load.get(def.muscle) || 0) + def.fatigue * effort * recency);
  }
  return load;
}
function recentMuscleLoad(history, contextDate) {
  const load = new Map();
  for (const row of history || []) {
    const def = EXERCISES[normalizeExerciseName(row.exercise)]; if (!def) continue;
    const age = daysBetween(row.workout_date, contextDate); if (age > 14) continue;
    const rpe = num(row.rpe), effort = rpe == null ? 0.8 : clamp(rpe / 10, 0.5, 1.1), recency = age <= 3 ? 1 : age <= 7 ? 0.65 : 0.35;
    load.set(def.muscle, (load.get(def.muscle) || 0) + def.fatigue * effort * recency);
  }
  return load;
}
// Completed sets plus the exercises of gym plans on the days around (one row
// each), so a second session in the same week picks different exercises.
function selectionHistory(context) {
  const done = context?.strength?.recentCompletedSets || [];
  const planned = (context?.strength?.plannedSessions || []).flatMap(s => (s.exercises || []).map(exercise => ({ exercise, workout_date: s.date, type: "WORK", rpe: null, set_no: 1, planned: true })));
  return [...done, ...planned];
}
// Exercises per session from its length: about 9–10 minutes each with
// warm-ups and rests; the timing check below trims what does not fit.
export function exerciseCountFor(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return 6;
  return m <= 35 ? 3 : m <= 50 ? 5 : m <= 65 ? 6 : m <= 80 ? 7 : 8;
}
const LEG_MUSCLES = new Set(["quads", "hamstrings", "glutes", "adductors", "abductors", "calves"]);
// Sex is taken into account, not used to rank muscle groups: the session's
// structure is the same for everyone. It sets the starting loads without
// history and, in a close call between variants of one movement, leans a
// woman's choice towards the glute-biased one.
export function athleteSex(context, options = {}) {
  const sex = options.sex ?? context?.profile?.sex;
  return sex === "female" || sex === "male" ? sex : "";
}
// The catalogue's default loads come from a male athlete's history. Without
// any own or similar exercise history a woman starts lighter; women are
// relatively stronger in the lower body than in the upper body.
export function startingLoadScale(muscle, sex) {
  if (sex !== "female") return 1;
  return LEG_MUSCLES.has(muscle) ? 0.7 : 0.55;
}
// Exercises stuck at the same load for three sessions without more reps.
export function stalledExercises(rows, date) {
  const byExercise = new Map();
  for (const r of rows || []) {
    const ex = normalizeExerciseName(r.exercise);
    if (!EXERCISES[ex] || String(r.type || "WORK").toUpperCase() !== "WORK" || r.planned) continue;
    (byExercise.get(ex) || byExercise.set(ex, []).get(ex)).push(r);
  }
  return new Set([...byExercise].filter(([ex, list]) => progressionDecision(list, ex, EXERCISES[ex].reps, 1, date)?.stalled).map(([ex]) => ex));
}

function choosePlan(context, options = {}) {
  const history = selectionHistory(context);
  const muscleLoad = recentMuscleLoad(history, context.date);
  const muscleExposure = recentMuscleExposure(history, context.date);
  const dates = completedWorkoutDates(context?.strength?.recentCompletedSets || []);
  const recentWorkoutCount = dates.filter(d => daysBetween(d, context.date) <= 10).length;
  const protection = legProtection(context), weekUpper = options.focusSource === 'week' && options.focus === 'upper';
  const protectLegs = protection.protect || weekUpper;

  const lastExerciseDate = new Map();
  for (const row of history) {
    const d = dateKey(row.workout_date);
    const exercise = normalizeExerciseName(row.exercise);
    if (d && exercise && (!lastExerciseDate.has(exercise) || daysBetween(d, context.date) < daysBetween(lastExerciseDate.get(exercise), context.date))) {
      lastExerciseDate.set(exercise, d);
    }
  }

  // Preferences, not filters: an exercise done or planned within 4 days and a
  // muscle trained this week count against it, but every movement pattern
  // still gets its best available exercise. Ties go to the pattern's main
  // exercise (listed first).
  // A movement group used recently (rows after a row two days ago) counts
  // against all its exercises, so horizontal and vertical pushes and pulls,
  // and knee and hip leg patterns, take turns from session to session.
  const groupRecency = ex => {
    const group = groupOf[ex], last = group && lastGroupDate.get(group);
    return last ? 2 * Math.exp(-daysBetween(last, context.date) / 5) : 0;
  };
  // Three sessions at the same load without more reps: another variant of
  // the movement takes over for a while (a new stimulus), if there is one.
  const stalled = stalledExercises(context?.strength?.recentCompletedSets, context.date), stallSwaps = {};
  const score = (ex, rank = 0, withStall = true) => {
    const def = EXERCISES[ex], last = lastExerciseDate.get(ex);
    const recent = last && daysBetween(last, context.date) <= 4 ? 3 : 0;
    return recent + groupRecency(ex) + (muscleExposure.get(def?.muscle) || 0) * 0.3 + (muscleLoad.get(def?.muscle) || 0) * 0.2 + rank * 0.05 + (emphasis[def?.muscle] || 0) + (usedPatterns.has(def?.pattern) ? 1 : 0) + (withStall && stalled.has(ex) ? 3 : 0);
  };

  // Only a close call between variants: recency and muscle load still decide.
  const female = athleteSex(context, options) === "female";
  const emphasis = female ? { glutes: -0.2, abductors: -0.1 } : {};
  const sexNote = female ? " Výchozí váhy bez historie a výběr variant cviků zohledňují profil (žena)." : "";

  const forceUpper = options.forceProtectLegs === true || options.focus === "upper"&&options.focusSource!=='week';
  const forceLower = options.focus === "lower";
  const recovery=recoverySignals(context),acuteRecovery=(context?.adaptive?.recovery?.score??100)<55||recovery.sleepMin!=null&&recovery.sleepMin<330;

  const candidatesByPattern = {
    horizontalPush: ["DB bench press", "Chest flat press Prime", "Barbell bench press", "DB incline press", "Pec deck", "Cable fly", "Low-to-high cable fly", "Smith machine incline press"],
    horizontalPull: ["Low row", "Standing rowing machine", "One-arm DB row", "Single-arm cable row", "Wide-grip low row", "Barbell row"],
    verticalPush: ["DB shoulder press", "Shoulder press Prime", "DB Arnold press", "Barbell overhead press"],
    verticalPull: ["Lat pulldown", "Cable pullover", "Close-grip lat pulldown"],
    lateralRaise: ["Cable lateral raise", "Standing multi flight", "DB lateral raise"],
    biceps: ["DB curl", "Hammer curl", "Cable curl", "DB incline curl", "Cable rope hammer curl"],
    triceps: ["Cable triceps extension", "Cable overhead triceps extension", "Cable triceps kickback", "DB overhead triceps extension"],
    rearDelts: ["Rear delt pec deck", "Cable rear delt fly", "Face pull", "DB rear delt fly"],
    core: ["Abs bench crunch", "Cable crunch", "Pallof press", "Cable woodchop", "Roman chair"],
    quad: ["Pivot leg press", "Pendulum squat", "Leg extension Prime", "Goblet squat", "DB sumo squat", "Barbell back squat", "Smith machine squat", "Barbell front squat"],
    hinge: ["DB Romanian deadlift", "Barbell Romanian deadlift", "Hip thrust", "Barbell hip thrust", "Cable pull-through", "DB single-leg Romanian deadlift"],
    unilateral: ["DB Bulgarian split squat", "DB reverse lunge", "DB step-up", "Smith machine split squat"],
    posterior: ["Prone leg curl Prime"],
    calves: ["Standing calf raise", "Single-leg calf raise"],
    // Grip and upper traps help posture on the bike and in daily life; they
    // are not a priority, so they take a turn about every second week.
    forearms: ["DB wrist curl", "Cable reverse curl", "DB reverse wrist curl"],
    traps: ["DB shrug", "Smith machine shrug", "Cable upright row", "Barbell shrug"]
  };

  const groupOf = {}, lastGroupDate = new Map();
  for (const [group, list] of Object.entries(candidatesByPattern)) for (const ex of list) groupOf[ex] ??= group;
  for (const [ex, d] of lastExerciseDate) { const group = groupOf[ex]; if (group && (!lastGroupDate.has(group) || d > lastGroupDate.get(group))) lastGroupDate.set(group, d); }

  // Small muscles (arms, core, shoulders, calves) take turns by how few sets
  // they got in the last 14 days; calves of a cyclist or runner also count the riding.
  const sportLoad = sportMuscleLoad(context), accessoryMuscle = { core: "core", biceps: "biceps", triceps: "triceps", lateralRaise: "side_delts", rearDelts: "rear_delts", calves: "calves", forearms: "forearms", traps: "traps" };
  const accessorySets = {};
  for (const row of history) {
    const def = EXERCISES[normalizeExerciseName(row.exercise)];
    if (def && daysBetween(row.workout_date, context.date) <= 14) accessorySets[def.muscle] = (accessorySets[def.muscle] || 0) + (row.planned ? 2 : 1);
  }
  const accessories = Object.keys(accessoryMuscle).map((group, order) => ({ group, order, sets: (accessorySets[accessoryMuscle[group]] || 0) + (group === "calves" ? 2 * (sportLoad.get("calves") || 0) + 2 : 0) + (group === "forearms" || group === "traps" ? 4 : 0) }))
    .sort((a, b) => a.sets - b.sets || a.order - b.order).map(x => x.group);

  // An exercise actually done in the last two days is left out entirely.
  const used = new Set((options.excludeExercises || []).map(normalizeExerciseName));
  for (const row of context?.strength?.recentCompletedSets || []) {
    const ex = normalizeExerciseName(row.exercise);
    if (ex && daysBetween(row.workout_date, context.date) <= 2) used.add(ex);
  }
  // A movement already in the session (e.g. a hip thrust) counts against its twin.
  const usedPatterns = new Set();
  function pick(patterns) {
    const pool = [].concat(patterns).flatMap(p => (candidatesByPattern[p] || []).map((ex, rank) => ({ ex, rank }))).filter(({ ex }) => EXERCISES[ex] && availableAt(ex) && !used.has(ex));
    const ex = pool.slice().sort((a, b) => score(a.ex, a.rank) - score(b.ex, b.rank))[0]?.ex;
    const plain = pool.slice().sort((a, b) => score(a.ex, a.rank, false) - score(b.ex, b.rank, false))[0]?.ex;
    if (ex && plain !== ex && stalled.has(plain)) stallSwaps[ex] = plain;
    if (ex) { used.add(ex); usedPatterns.add(EXERCISES[ex].pattern); }
    return ex;
  }
  // Ordered by priority; the session length decides how many are kept.
  const build = groups => groups.map(pick).filter(Boolean);
  const base = {
    stallSwaps,
    muscleExposure: Object.fromEntries(muscleExposure),
    recentWorkoutCount,
    muscleLoad,
    plannedSessions: context?.strength?.plannedSessions || []
  };

  if (forceUpper || (acuteRecovery && !forceLower)) {
    return {
      ...base,
      name: "Upper Body",
      exercises: build([["horizontalPush", "verticalPush"], ["horizontalPull", "verticalPull"], ["horizontalPull", "verticalPull"], ...accessories.filter(g => g !== "calves").slice(0, 2), ["horizontalPush", "verticalPush"], ...accessories.filter(g => g !== "calves").slice(2)]),
      rationale: (forceUpper
        ? "Požadavek uživatele chrání nohy a soustředí trénink na horní část těla; cviky se vybírají podle čerstvosti a nedávné svalové zátěže."
        : "Velmi slabá regenerace dnes dočasně omezuje zatížení nohou. Dej přednost odpočinku, případný gym zkrať; nohy znovu zařadíme po zlepšení stavu.") + sexNote,
      protectedLegs: true
    };
  }

  if (forceLower) {
    // One knee-dominant movement, one hip hinge, then accessories.
    const exercises = build(["quad", "hinge", "posterior", "unilateral", "core", "calves", "quad"]);
    return {
      ...base,
      name: "Lower Body",
      exercises: exercises.length ? exercises : ["Pivot leg press", "Prone leg curl Prime"],
      rationale: "Požadavek uživatele soustředí trénink na dolní část těla; skladba nejprve zajišťuje různé pohybové vzory a teprve potom vybírá podle čerstvosti a nedávné svalové zátěže." + sexNote,
      protectedLegs: false
    };
  }

  // Full body: the leg pattern whose turn it is (knee or hip), a push and a
  // pull (horizontal or vertical, alternating), the other leg pattern, then
  // the small muscles in turn, a second pull and push for longer sessions.
  const leg = pick(["quad", "hinge", "posterior", "unilateral"]);
  const kneeFirst = ["quad", "unilateral"].some(p => (candidatesByPattern[p] || []).includes(leg));
  const exercises = [leg, ...build([["horizontalPush", "verticalPush"], ["horizontalPull", "verticalPull"], kneeFirst ? ["hinge", "posterior"] : ["quad", "unilateral"], accessories[0], accessories[1], ["horizontalPull", "verticalPull"], accessories[2], ["horizontalPush", "verticalPush"], accessories[3]])].filter(Boolean);
  const reason = protection.reason || (weekUpper ? "Podle plánu týdne je blízko klíčová jízda." : "");
  return {
    ...base,
    name: protectLegs?"Full Body · s rezervou":"Full Body",
    exercises,
    rationale: (protectLegs?"Vyvážený silový trénink zahrnuje i nohy. " + reason + " Proto mají nohy nejvýše 2 pracovní série na cvik a rezervu 3–4 opakování; horní část těla trénuje naplno.":"Vyvážený silový trénink zahrnuje dolní i horní část těla v plné dávce. Výběr cviků zohledňuje skutečné silové tréninky a čerstvost jednotlivých svalů.") + sexNote,
    protectedLegs: protectLegs,
    protectionReason: reason
  };
}
// Three ramp-up sets before the first main lift; later main lifts need one.
function warmupRows(exercise, workKg = null, first = true) {
  const def = EXERCISES[exercise]; if (!def?.warmup) return [];
  const reference = workKg ?? def.baseKg; if (reference == null) return [];
  const rawKg = Math.max(2, reference * 0.4), rawKg2 = Math.max(2, reference * 0.65), rawKg3 = Math.max(2, reference * 0.8);
  const kg = resolveLoad(exercise, rawKg), kg2 = resolveLoad(exercise, rawKg2), kg3 = resolveLoad(exercise, rawKg3);
  const execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION, fmt = x => String(x).replace(".", ",");
  if (!first) return [["WARMUP", exercise, "1", fmt(kg2), "5", "", "", "", "FALSE", "[WARMUP]", "🎥 Video", "", execution]];
  return [["WARMUP", exercise, "1", fmt(kg), "8", "", "", "", "FALSE", "[WARMUP]", "🎥 Video", "", execution], ["WARMUP", exercise, "2", fmt(kg2), "5", "", "", "", "FALSE", "[WARMUP]", "", "", execution], ["WARMUP", exercise, "3", fmt(kg3), "3", "", "", "", "FALSE", "[WARMUP]", "", "", execution]];
}
function adaptiveSetCount(exercise, muscleLoad, recoveryFactorValue, volumeModifier = 1) {
  const def = EXERCISES[exercise];
  const base = Number(def?.sets) || 3;
  const recentLoad = Number(muscleLoad?.get(def?.muscle) || 0);
  let sets = base;

  // Start from the exercise's normal volume, then adapt it to recent
  // muscle-specific load and whole-system recovery.
  if (recentLoad >= 4) sets -= 1;
  else if (recentLoad >= 2.5 && base >= 3) sets -= 1;

  if (recoveryFactorValue < 0.90) sets -= 1;
  else if (recoveryFactorValue >= 0.97 && recentLoad < 0.8) sets += 1;

  // Keep the range deliberately conservative: accessories can move between
  // 2–3 sets, while main movements can move between 2–4 sets.
  const minSets = 2;
  const maxSets = base >= 3 ? 4 : 3;
  sets = Math.round(sets * clamp(volumeModifier, 0.75, 1.05));
  return clamp(sets, minSets, maxSets);
}

const kgText = x => String(x).replace(".", ",");
// What the load is based on, in one short line next to the exercise.
function progressionNote(estimate) {
  if (estimate.source !== "own-history") return "";
  const last = "minule " + (estimate.referenceSets > 1 ? estimate.referenceSets + "× " : "") + estimate.referenceReps + " op. @ " + kgText(estimate.referenceKg) + " kg" + (estimate.referenceRpe != null ? ", RPE " + kgText(estimate.referenceRpe) : "");
  const diff = Math.round((estimate.kg - estimate.referenceKg) * 100) / 100;
  if (estimate.progression === "increase") return "↑ " + last + " → +" + kgText(diff) + " kg";
  if (estimate.progression === "decrease") return "↓ " + last + " → " + kgText(diff) + " kg, ať držíš rozsah opakování";
  if (estimate.progression === "return") return "po delší pauze lehčeji (" + last + ")";
  if (estimate.stalled) return "= " + last + " – 3× bez posunu: přidej opakování, jinak příště vyměníme cvik";
  return "= " + last + " – cíl: o opakování víc";
}
function workRows(exercise, historyMap, factor, protectedLegs, muscleLoad, volumeModifier = 1, maxSets = 4, sex = "", today = null) {
  const def = EXERCISES[exercise], fallbackKg = def.baseKg == null ? null : def.baseKg * startingLoadScale(def.muscle, sex);
  const estimate = estimateStartingLoad({ exercise, history: [...historyMap.values()].flat(), targetReps: def.reps, fallbackKg, loadFactor: factor, today });
  const kg = estimate.kg, execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION;
  const reps = protectedLegs && (def.muscle === "quads" || def.muscle === "hamstrings") ? "8–12" : def.reps;
  const sets = Math.min(adaptiveSetCount(exercise, muscleLoad, factor, volumeModifier), maxSets);
  const progression = progressionNote(estimate);
  const note = (estimate.source === "cross-exercise-estimate" ? def.note + "; odhad z " + estimate.referenceExercise + ", ověř RPE" : def.note) + (progression ? "; " + progression : "");
  const rows = [];
  for (let i = 0; i < sets; i++) rows.push(["WORK", exercise, String(i + 1), kg == null ? "" : kgText(kg), reps, "", "", "", "FALSE", note, i === 0 ? "🎥 Video" : "", "", execution]);
  return { rows, kg, sets, estimate };
}

// Strength deload: after four solid weeks in a row (two or more sessions each
// and none much lighter than the others) the fifth week is lighter, so the
// strength built can show. The week after a deload has a light week among the
// last four, so the next deload comes four weeks later.
export function strengthDeload(history, date) {
  const DAY = 86400000, monday = d => { const t = Date.parse(dateKey(d) + "T12:00:00Z"); return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); };
  if (!dateKey(date)) return null;
  const thisWeek = monday(date), weeks = new Map();
  for (const r of history || []) {
    if (r.planned || String(r.type || "WORK").toUpperCase() !== "WORK" || !dateKey(r.workout_date)) continue;
    const w = monday(r.workout_date); if (w >= thisWeek) continue;
    const e = weeks.get(w) || { sets: 0, days: new Set(), marked: false }; e.sets++; e.days.add(dateKey(r.workout_date)); if (/odlehčen/i.test(String(r.note || ""))) e.marked = true; weeks.set(w, e);
  }
  const last = [1, 2, 3, 4].map(k => weeks.get(new Date(Date.parse(thisWeek + "T12:00:00Z") - k * 7 * DAY).toISOString().slice(0, 10)));
  if (last.some(w => !w || w.days.size < 2)) return null;
  // A lighter week among them (a deload, marked or with clearly fewer sets per session) resets the count.
  const perDay = last.map(w => w.sets / w.days.size), median = [...perDay].sort((a, b) => a - b).slice(1, 3).reduce((a, b) => a + b, 0) / 2;
  if (last.some(w => w.marked) || perDay.some(v => v < median * 0.85)) return null;
  return { weeks: 4, reason: "Čtyři týdny po sobě s plným tréninkem: tento týden je odlehčený (méně sérií, váha se drží, RPE do 7), aby se síla mohla projevit." };
}
export function generateStrengthPlan(context, options = {}) {
  const policy=trainingStatus(context?.athleteState);
  // The gateway explicitly marks its read-only deployment diagnostic; ordinary
  // gym requests and previews still obey the athlete's status.
  if(policy.paused&&!options.diagnosticPreview)throw new Error(policy.headline+'. '+policy.guidance[0]);
  // The shared recovery week decides when it is known; four solid gym weeks
  // in a row are the fallback for athletes without Intervals.icu loads.
  const shared = context?.recoveryWeek;
  const deload = options.noDeload ? null : shared?.recovery ? { shared: true, reason: "Regenerační týden pro celý trénink (" + (shared.reason === "three_weeks" ? "po třech týdnech nad udržovací zátěží" : "po náročném týdnu") + "): posilovna je odlehčená – méně sérií, váha se drží, RPE do 7." } : shared?.known ? null : strengthDeload(context?.strength?.recentCompletedSets, context.date);
  // A deload week holds the loads (no increase, no set to failure).
  const chosen = choosePlan(context, options), factor = deload ? Math.min(recoveryFactor(context), 0.89) : recoveryFactor(context), history = context?.strength?.recentCompletedSets || [], historyMap = recentExerciseMap(history);
  const focusMuscles = options.focusMuscles == null ? null : validateFocusMuscles(options.focusMuscles);
  if (options.focusMuscles != null && !focusMuscles) throw new Error('Vyber 1 až 5 známých partií.');
  const excluded = new Set((options.excludeExercises || []).map(normalizeExerciseName));
  const selection = selectionHistory(context);
  const weeklyExposure = recentMuscleExposure(selection, context.date);
  const weeklyLoad = recentMuscleLoad(selection, context.date);
  const lastExerciseDate = new Map();
  for (const row of selection) {
    const exercise = normalizeExerciseName(row.exercise), date = dateKey(row.workout_date);
    if (exercise && date && (!lastExerciseDate.has(exercise) || daysBetween(date, context.date) < daysBetween(lastExerciseDate.get(exercise), context.date))) lastExerciseDate.set(exercise, date);
  }
  const stalled = stalledExercises(history, context.date), stallSwaps = { ...(chosen.stallSwaps || {}) };
  const focusedExercise = group => {
    const candidates = FOCUS_GROUPS[group].exercises.filter(name => EXERCISES[name] && availableAt(name) && !excluded.has(name));
    if (!candidates.length) throw new Error('Pro partii ' + FOCUS_GROUPS[group].label + ' není dostupný cvik.');
    const score = (name, withStall = true) => {
      const def = EXERCISES[name], last = lastExerciseDate.get(name);
      const recent = last && daysBetween(last, context.date) < 5 ? 2 : 0;
      const legPenalty = chosen.protectedLegs && ['quads', 'hamstrings', 'hips'].includes(group) ? def.fatigue * 2 : 0;
      return recent + (weeklyExposure.get(def.muscle) || 0) * .3 + (weeklyLoad.get(def.muscle) || 0) * .2 + legPenalty + def.fatigue * .1 + (withStall && stalled.has(name) ? 3 : 0);
    };
    const best = candidates.slice().sort((a, b) => score(a) - score(b))[0], plain = candidates.slice().sort((a, b) => score(a, false) - score(b, false))[0];
    if (plain !== best && stalled.has(plain)) stallSwaps[best] = plain;
    return best;
  };
  let exercises = focusMuscles ? focusMuscles.map(focusedExercise) : chosen.exercises.filter(ex => !excluded.has(ex));
  const maxExercises = focusMuscles ? focusMuscles.length : Number(options.maxExercises) || exerciseCountFor(options.durationMinutes);
  exercises = exercises.slice(0, maxExercises);

  // Warm-up exercises must be the first exercises of the session. Keep the
  // relative order otherwise, so each exercise's warm-up sets stay immediately
  // before its work sets and no warm-up exercise is introduced later in the plan.
  exercises = exercises.sort((a, b) => Number(EXERCISES[b]?.warmup === true) - Number(EXERCISES[a]?.warmup === true));

  const rows = [], loadEstimates = [];
  const muscleLoad = acuteMuscleLoad(history, context.date),sportLoad=sportMuscleLoad(context);
  for(const [muscle,dose] of sportLoad)muscleLoad.set(muscle,(muscleLoad.get(muscle)||0)+dose);
  // Legs the athlete asked for are trained in full; only a key ride today or
  // tomorrow keeps a reserve, with three sets instead of two.
  const explicitLegs = options.focus === 'lower' || (focusMuscles || []).some(id => ['quads', 'hamstrings', 'hips', 'calves'].includes(id));
  const nearRide = legProtection(context);
  const durationVolume = Number(options.durationMinutes) > 0 && Number(options.durationMinutes) <= 45 ? .75 : Number(options.durationMinutes) > 0 && Number(options.durationMinutes) <= 60 ? .9 : 1;
  const volumeModifier = Math.min(Number(context?.adaptive?.strengthVolumeModifier) || 1, durationVolume, deload ? 0.6 : 1);
  const maxSets = Number(options.durationMinutes) > 0 && Number(options.durationMinutes) <= 45 ? 2 : Number(options.durationMinutes) > 0 && Number(options.durationMinutes) <= 60 ? 3 : 4;
  let warmedUp = false;
  for (const exercise of exercises) {
    const muscle=EXERCISES[exercise].muscle;
    // A big session of another sport in the last day (a 2-hour run, a 3-hour
    // ride) also lowers the dose of the muscles it used.
    // Legs of an endurance athlete are almost never fresh: a moderate dose
    // (1–1.5) keeps three sets with a reserve, only a big one cuts to two.
    const sport=sportLoad.get(muscle)||0, leg=LEG_MUSCLES.has(muscle);
    const moderated=leg&&(explicitLegs?nearRide.protect:!chosen.protectedLegs&&sport>=1&&sport<1.5);
    const reducedDose=!moderated&&(leg?!explicitLegs&&(chosen.protectedLegs||sport>=1.5):sport>=1);
    const cap=reducedDose?Math.min(2,maxSets):moderated?Math.min(3,maxSets):maxSets;
    const work = workRows(exercise, historyMap, reducedDose||moderated?factor*.9:factor, chosen.protectedLegs&&!explicitLegs, muscleLoad, volumeModifier, cap, athleteSex(context, options), context.date);
    if(reducedDose)for(const row of work.rows)row[9]+='; sportovní zátěž: nejvýše 2 pracovní série, nech 3–4 opakování v rezervě (RPE 6–7)';
    if(deload)for(const row of work.rows)row[9]+='; odlehčený týden: stejná váha, 3 opakování v rezervě';
    if(moderated)for(const row of work.rows)row[9]+=explicitLegs?'; blízko je náročná jízda: nech 2–3 opakování v rezervě (RPE 7)':'; nohy po jízdě: nech 2–3 opakování v rezervě (RPE 7)';
    if(stallSwaps[exercise])for(const row of work.rows)row[9]+='; místo '+stallSwaps[exercise]+': 3 tréninky bez posunu, nový podnět (k původnímu cviku se vrátíme)';
    const warmup = warmupRows(exercise, work.kg, !warmedUp);
    if (warmup.length) warmedUp = true;
    rows.push(...warmup, ...work.rows);
    loadEstimates.push({ exercise, sets: work.sets, reducedDose, moderated, ...work.estimate });
  }
  const requestedMinutes = Number(options.durationMinutes) > 0 ? Number(options.durationMinutes) : Math.max(60, (Number(options.maxExercises) || 5) * 12);
  const configure = () => configureStrengthCoaching(rows, EXERCISES, { factor, muscleLoad, protectedLegs: chosen.protectedLegs, recoveryScore: context?.adaptive?.recovery?.score ?? null });
  configure();
  let timing = estimateStrengthTiming(rows, EXERCISES, requestedMinutes);
  while (timing.totalSeconds > requestedMinutes * 60) {
    // Take a set from the exercise with the most sets (the later one on a tie),
    // so the volume stays even instead of one exercise keeping four sets.
    const names = [...new Set(rows.filter(r => r[0] === 'WORK').map(r => r[1]))];
    const count = name => rows.filter(r => r[0] === 'WORK' && r[1] === name).length;
    const removable = names.slice().reverse().filter(name => count(name) > (focusMuscles ? 1 : 2)).sort((a, b) => count(b) - count(a))[0];
    if (removable) rows.splice(rows.findLastIndex(r => r[0] === 'WORK' && r[1] === removable), 1);
    else if (!focusMuscles && names.length > 1) { const last = names.at(-1); for (let i = rows.length - 1; i >= 0; i--) if (rows[i][1] === last) rows.splice(i, 1); }
    else throw new Error('Zvolené partie se s rozcvičením a pauzami nevejdou do ' + requestedMinutes + ' minut. Vyber méně partií nebo delší čas.');
    configure(); timing = estimateStrengthTiming(rows, EXERCISES, requestedMinutes);
  }
  for (let i = loadEstimates.length - 1; i >= 0; i--) {
    loadEstimates[i].sets = rows.filter(r => r[0] === 'WORK' && r[1] === loadEstimates[i].exercise).length;
    if (!loadEstimates[i].sets) loadEstimates.splice(i, 1);
  }
  const focusLabels = focusMuscles?.map(id => FOCUS_GROUPS[id].label).join(', ');
  const legCaution = explicitLegs && nearRide.protect;
  const cautionText = legCaution ? nearRide.reason + ' Nohy proto mají nejvýše 3 série a je potřeba držet rezervu u nohou 2–3 opakování.' : '';
  const baseRationale = focusMuscles ? 'Zvolené partie: ' + focusLabels + '. Cviky zohledňují nedávné posilování, regeneraci a cyklistickou zátěž. ' + cautionText : chosen.rationale + (cautionText ? ' ' + cautionText : '');
  const fmtDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const nearby = (chosen.plannedSessions || []).map(x => fmtDay(x.date).replace(/\.$/, ''));
  const swapped = Object.entries(stallSwaps).filter(([ex]) => rows.some(r => r[1] === ex)).map(([ex, old]) => old + ' → ' + ex);
  const rationale = baseRationale + (sportLoad.size?' Zátěž z ostatních sportů upravuje dávku zapojených svalů; nenahrazuje jejich silový trénink.':'') + (nearby.length ? ' Cviky se liší od plánu na ' + nearby.join(' a ') + '.' : '') + (swapped.length ? ' Po třech trénincích bez posunu nová varianta: ' + swapped.join(', ') + '.' : '');
  return { date: context.date, planName: (focusMuscles ? 'Cílený trénink · ' + focusLabels : chosen.name) + (deload ? ' · odlehčený týden' : ''), deload, rationale: (deload ? deload.reason + ' ' : '') + rationale + ' Časový plán: přibližně ' + timing.estimatedMinutes + ' z ' + requestedMinutes + ' minut včetně rozcvičení, pauz, nastavování strojů a rezervy.', timing, focusMuscles: focusMuscles || [], loadFactor: factor, protectedLegs: chosen.protectedLegs, recentCompletedSets: history.length, recentCompletedWorkoutCount: chosen.recentWorkoutCount, balance:{sportMuscleLoad:Object.fromEntries(sportLoad),strengthCoverage:strengthCoverage(context,EXERCISES)}, adaptive: { volumeModifier, recoveryScore: context?.adaptive?.recovery?.score ?? null, legReadiness: context?.adaptive?.legReadiness ?? null }, loadEstimates, rows };
}

export { EXERCISES };
