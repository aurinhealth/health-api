// The athlete's equipment (onboarding.js trainingSetup): the whole gym, own
// stations chosen in the app (equipment "custom" with the station ids), only
// dumbbells or the body weight.
// The whole gym ("gym", also the default) is METAGYM Kutná Hora; exercises for
// the equipment of other gyms need the athlete's own stations.
export function fitsEquipment(name,setup){const equipment=typeof setup==='string'?setup:setup?.equipment;if(!equipment||equipment==='gym')return availableInGym(name);const allowed=(equipment==='custom'||equipment==='home')&&Array.isArray(setup?.stations)&&setup.stations.length?[...setup.stations,'floor_mats']:equipment==='dumbbells'?['dumbbells','adjustable_bench','floor_mats']:['floor_mats'];return EXERCISE_STATIONS[name]?.every(id=>allowed.includes(id))===true;}
import { L, isImperial, kgToLb } from './lang.js';
import { estimateStartingLoad, resolveLoad, progressionDecision, EXERCISE_INTELLIGENCE } from "./strength-intelligence.js";
import { normalizeExerciseName } from "./strength-normalization.js";
import { withoutDisliked } from './exercise-feedback.js';
import { isIntensity } from "./strength-context.js";
import { availableAt as availableInGym, hasKnownStations, EXERCISE_STATIONS } from "./gym-equipment.js";
// A catalog exercise of any gym the app knows (Kutná Hora or the usual
// equipment of others); fitsEquipment then keeps what the athlete's gym has.
const availableAt = hasKnownStations;
import { sportMuscleLoad, strengthCoverage } from './strength-balance.js';
import { trainingStatus } from './training-status.js';
import { configureStrengthCoaching, estimateStrengthTiming } from './strength-timing.js';
import { stretchingFor, warmupFor, routineSize } from './stretching.js';

const DEFAULT_EXECUTION = "BILATERAL";

const EXERCISES = {
  'Dead bug': {pattern:'core',muscle:'core',sets:2,reps:'8–12',baseKg:0,warmup:false,note:'Počet opakování na stranu; kontrolovaný pohyb',fatigue:.3},
  'Push-up': {pattern:'push',muscle:'chest',sets:2,reps:'6–12',baseKg:0,warmup:false,note:'Vlastní váha; podle potřeby opři ruce o vyšší plochu',fatigue:.6},
  'Bodyweight squat': {pattern:'quad',muscle:'quads',sets:2,reps:'10–15',baseKg:0,warmup:false,note:'Vlastní váha; pohyb bez bolesti',fatigue:.6},
  'Glute bridge': {pattern:'hinge',muscle:'glutes',sets:2,reps:'10–15',baseKg:0,warmup:false,note:'Vlastní váha',fatigue:.5},
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
  "Barbell good morning": { pattern: "hinge", muscle: "lower_back", unilateral: false, sets: 3, reps: "8–12", baseKg: 30, warmup: true, note: "Spodní záda a hamstringy; osa na zádech z klece, rovná záda, kg = celá osa", fatigue: 0.9 },
  // Equipment of other gyms and home gyms (gym-equipment.js OTHER_STATIONS,
  // added 2026-10-11): chosen only when the athlete marked the station.
  // Bodyweight work: kg = added weight. Assisted machines: kg = counterweight,
  // with no starting guess (it depends on the athlete's body weight).
  "Pull-up": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "5–10", baseKg: 0, warmup: false, note: "Laty; shyby nadhmatem, kg = přidaná zátěž. Když nedáš 5 čistých opakování, zvol asistovaný stroj nebo gumu", fatigue: 0.9 },
  "Chin-up": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "5–10", baseKg: 0, warmup: false, note: "Laty a biceps; shyby podhmatem na šířku ramen, kg = přidaná zátěž", fatigue: 0.9 },
  "Assisted pull-up": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "6–10", baseKg: null, warmup: false, note: "Laty; kg = protizávaží stroje, čím méně, tím těžší. Nastav ho tak, aby ti zbyla 2–3 opakování v rezervě", fatigue: 0.8 },
  "Hanging leg raise": { pattern: "trunk_flexion", muscle: "core", unilateral: false, sets: 3, reps: "8–12", baseKg: 0, warmup: false, note: "Břicho; ve visu na hrazdě bez švihu, s pokrčenými koleny je to lehčí", fatigue: 0.4 },
  "Dips": { pattern: "push", muscle: "triceps", unilateral: false, sets: 3, reps: "6–10", baseKg: 0, warmup: false, note: "Triceps a prsa; na bradlech, dolů jen tak hluboko, aby ramena nebolela, kg = přidaná zátěž", fatigue: 0.8 },
  "Assisted dip": { pattern: "push", muscle: "triceps", unilateral: false, sets: 3, reps: "8–12", baseKg: null, warmup: false, note: "Triceps a prsa; kg = protizávaží stroje, čím méně, tím těžší", fatigue: 0.7 },
  "Kettlebell swing": { pattern: "hinge", muscle: "glutes", unilateral: false, sets: 3, reps: "10–15", baseKg: 16, warmup: false, note: "Hýždě a zadní stehna; švih z kyčlí, ne z ramen, kg = kettlebell", fatigue: 0.7 },
  "EZ bar curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "8–12", baseKg: 20, warmup: false, note: "Biceps; EZ osa ve stoje, kg = osa s kotouči", fatigue: 0.5 },
  "EZ bar skull crusher": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "8–12", baseKg: 20, warmup: false, note: "Triceps; vleže na lavici spouštíš EZ osu za čelo, kg = osa s kotouči", fatigue: 0.5 },
  "Preacher curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "8–12", baseKg: 15, warmup: false, note: "Biceps; Scottova lavice s EZ osou, dole lokty nepropínej švihem, kg = osa s kotouči", fatigue: 0.45 },
  "Band pull-apart": { pattern: "rear_delt", muscle: "rear_delts", unilateral: false, sets: 3, reps: "15–20", baseKg: null, warmup: false, note: "Zadní ramena a lopatky; roztahování gumy před hrudníkem, tuhost gumy podle síly", fatigue: 0.25 },
  "Hack squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: true, note: "Kvadricepsy; hack dřep na stroji, kg = kotouče na stroji", fatigue: 1.3 },
  "Seated leg curl": { pattern: "hamstring", muscle: "hamstrings", unilateral: false, sets: 3, reps: "10–15", baseKg: 35, warmup: false, note: "Hamstringy; zakopávání vsedě, kg = celková zátěž stroje", fatigue: 0.7 },
  "Glute kickback machine": { pattern: "glute_kickback", muscle: "glutes", unilateral: true, sets: 3, reps: "10–15", baseKg: 20, warmup: false, note: "Hýždě; zanožování na stroji, kg = zátěž na jednu stranu", fatigue: 0.4 },
  "Seated calf raise": { pattern: "plantar_flexion", muscle: "calves", unilateral: false, sets: 3, reps: "12–20", baseKg: 30, warmup: false, note: "Lýtka (hlavně šikmý sval lýtkový); vsedě s opěrkou na kolenou, kg = celková zátěž stroje", fatigue: 0.35 },
  "T-bar row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 30, warmup: true, note: "Záda; přítah T-osy v předklonu s rovnými zády, kg = kotouče", fatigue: 1.0 },
  "Chest-supported row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: false, note: "Záda bez zátěže beder; hrudník opřený o opěrku, kg = celková zátěž stroje", fatigue: 0.8 },
  "TRX row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "8–15", baseKg: null, warmup: false, note: "Záda; přítahy v závěsném systému, čím víc vodorovně, tím těžší", fatigue: 0.6 },
  "Barbell incline bench press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "6–10", baseKg: 40, warmup: true, note: "Horní hrudník; šikmá lavice s osou ve stojanu, kg = celá osa", fatigue: 1.0 },
  "Trap bar deadlift": { pattern: "hinge", muscle: "glutes", unilateral: false, sets: 3, reps: "5–8", baseKg: 60, warmup: true, note: "Hýždě, stehna a záda; mrtvý tah s trap barem, rovná záda, kg = osa s kotouči", fatigue: 1.35 },
  "Landmine press": { pattern: "push_vertical", muscle: "shoulders", unilateral: true, sets: 3, reps: "8–12", baseKg: 10, warmup: false, note: "Ramena a horní hrudník; jednoruč šikmo vzhůru, k ramenům šetrnější, kg = kotouče na konci osy", fatigue: 0.7 },
  "Medicine ball slam": { pattern: "slam", muscle: "core", unilateral: false, sets: 3, reps: "8–12", baseKg: 6, warmup: false, note: "Střed těla a výbušnost; medicinbal, který neskáče, kg = medicinbal", fatigue: 0.45 },
  "Box step-up": { pattern: "lunge", muscle: "glutes", unilateral: true, sets: 3, reps: "8–12", baseKg: 0, warmup: false, note: "Hýždě a stehna; výstupy na bednu do výšky kolena, kg = jednoručka v každé ruce (0 = vlastní váha)", fatigue: 0.7 },
  // Machines and cables (MoveKit names, own texts; added 2026-10-18). variantOf:
  // the same movement on another tool, one weight history with the main exercise.
  "Smith Machine Bench Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "6–10", baseKg: 40, warmup: true, note: "Hrudník; rovná lavice pod osou Smithu, kg = kotouče + osa", fatigue: 1 },
  "Smith Machine Decline Bench Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "6–10", baseKg: 40, warmup: true, note: "Spodní hrudník; lavice hlavou dolů pod Smithem, kg = kotouče + osa", fatigue: 1, variantOf: "Smith Machine Bench Press" },
  "Inverted Row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "6–12", baseKg: 0, warmup: false, note: "Záda; přítahy vlastní vahy k ose Smithu, čím níž osa, tím těžší, kg = přidaná zátěž", fatigue: 0.6 },
  "Smith Machine Bent-Over Row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: false, note: "Záda; přítah osy Smithu v předklonu, kg = kotouče + osa", fatigue: 0.95 },
  "Smith Machine Overhead Press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "6–10", baseKg: 30, warmup: true, note: "Ramena; tlak osy Smithu nad hlavu ve stoje, kg = kotouče + osa", fatigue: 0.95 },
  "Smith Machine Seated Overhead Press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "8–12", baseKg: 30, warmup: true, note: "Ramena; vsedě na lavici pod Smithem, kg = kotouče + osa", fatigue: 0.9, variantOf: "Smith Machine Overhead Press" },
  "Smith Machine Close Grip Bench Press": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "6–10", baseKg: 35, warmup: false, note: "Triceps; úzký úchop pod Smithem, kg = kotouče + osa", fatigue: 0.8 },
  "Smith Machine Front Squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "6–10", baseKg: 40, warmup: true, note: "Kvadricepsy; osa Smithu vpředu na ramenou, kg = kotouče + osa", fatigue: 1.2 },
  "Smith Machine Sumo Romanian Deadlift": { pattern: "hinge", muscle: "hamstrings", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: true, note: "Zadní stehna, hýždě a vnitřní stehna; široký postoj u osy Smithu, kg = kotouče + osa", fatigue: 1 },
  "Smith Machine Calf Raise": { pattern: "plantar_flexion", muscle: "calves", unilateral: false, sets: 3, reps: "10–15", baseKg: 40, warmup: false, note: "Lýtka; výpony s osou Smithu na zádech, špičky na kotouči, kg = kotouče + osa", fatigue: 0.45, variantOf: "Standing calf raise" },
  "Cable Bench Chest Fly": { pattern: "horizontal_push", muscle: "chest", unilateral: false, sets: 3, reps: "10–15", baseKg: 7.5, warmup: false, note: "Hrudník; rozpažování vleže na lavici mezi kladkami, kg = jedna strana", fatigue: 0.5 },
  "Cable Bench Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 15, warmup: false, note: "Hrudník; tlak vleže na lavici s madly ze spodních kladek, kg = jedna strana", fatigue: 0.8 },
  "Cable Chest Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "10–15", baseKg: 15, warmup: false, note: "Hrudník; tlak ve stoje od kladek ve výšce hrudníku, kg = jedna strana", fatigue: 0.7 },
  "Cable Decline Bench Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 15, warmup: false, note: "Spodní hrudník; tlak na lavici hlavou dolů s madly z kladek, kg = jedna strana", fatigue: 0.8 },
  "Cable High-to-Low Fly": { pattern: "horizontal_push", muscle: "chest", unilateral: false, sets: 3, reps: "12–15", baseKg: 7.5, warmup: false, note: "Spodní hrudník; kladky nahoře, tah šikmo dolů před boky, kg = jedna strana", fatigue: 0.45 },
  "Cable Incline Bench Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 12.5, warmup: false, note: "Horní hrudník; šikmá lavice mezi spodními kladkami, kg = jedna strana", fatigue: 0.8 },
  "Cable Standing Single Arm Chest Press": { pattern: "push", muscle: "chest", unilateral: true, sets: 3, reps: "10–12", baseKg: 10, warmup: false, note: "Hrudník a střed těla; tlak jednou rukou ve stoje, kg = váha na kladce", fatigue: 0.6 },
  "Single-Arm Cable Fly": { pattern: "horizontal_push", muscle: "chest", unilateral: true, sets: 3, reps: "12–15", baseKg: 7.5, warmup: false, note: "Hrudník; rozpažování jednou rukou na kladce, kg = váha na kladce", fatigue: 0.4 },
  "Cable Row Bar Standing Row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "10–12", baseKg: 25, warmup: false, note: "Záda; přítah rovné tyče ve stoje od kladky ve výšce pasu, kg = váha na kladce", fatigue: 0.6 },
  "Cable Supinating Row": { pattern: "pull", muscle: "back", unilateral: true, sets: 3, reps: "10–12", baseKg: 15, warmup: false, note: "Záda a biceps; přítah jednoruč s vytočením dlaně nahoru, kg = váha na kladce", fatigue: 0.55 },
  "Straight-Arm Lat Pulldown": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "12–15", baseKg: 20, warmup: false, note: "Široký sval zádový; tyč z horní kladky dolů k boků s napnutými pažemi, kg = váha na kladce", fatigue: 0.45 },
  "Straight Arm Rope Pulldown (Light)": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 2, reps: "12–15", baseKg: 15, warmup: false, note: "Široký sval zádový; lehké stahování lana napnutými pažemi, kg = váha na kladce", fatigue: 0.4, variantOf: "Straight-Arm Lat Pulldown" },
  "Cable External Rotation": { pattern: "rear_delt", muscle: "rear_delts", unilateral: true, sets: 2, reps: "12–15", baseKg: 2.5, warmup: false, note: "Rotátorová manžeta a zadní rameno; vytáčení předloktí ven, loket u boku, kg = váha na kladce", fatigue: 0.2 },
  "Cable Front Raise": { pattern: "lateral_raise", muscle: "shoulders", unilateral: false, sets: 2, reps: "12–15", baseKg: 7.5, warmup: false, note: "Přední ramena; předpažování od spodní kladky, kg = váha na kladce", fatigue: 0.35 },
  "Cable Overhead Press": { pattern: "push_vertical", muscle: "shoulders", unilateral: false, sets: 3, reps: "10–12", baseKg: 10, warmup: false, note: "Ramena; tlak nad hlavu s madly ze spodních kladek, kg = jedna strana", fatigue: 0.7 },
  "Cable Single Arm Rear Delt Row": { pattern: "rear_delt", muscle: "rear_delts", unilateral: true, sets: 3, reps: "12–15", baseKg: 7.5, warmup: false, note: "Zadní ramena; přítah jednoruč s loktem vysoko do strany, kg = váha na kladce", fatigue: 0.35 },
  "Leaning Cable Lateral Raise": { pattern: "lateral_raise", muscle: "side_delts", unilateral: true, sets: 3, reps: "12–15", baseKg: 5, warmup: false, note: "Boční ramena; v náklonu od stroje, delší rozsah, kg = váha na kladce", fatigue: 0.35 },
  "Cable Bar Pushdown": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "10–15", baseKg: 20, warmup: false, note: "Triceps; stahování rovné tyče z horní kladky, kg = váha na kladce", fatigue: 0.45 },
  "Cable Overhead Straight Bar Extensions": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "10–15", baseKg: 15, warmup: false, note: "Triceps (dlouhá hlava); tyč za hlavou, zády ke kladce, kg = váha na kladce", fatigue: 0.45 },
  "Cross-Body Cable Tricep Extension": { pattern: "triceps", muscle: "triceps", unilateral: true, sets: 3, reps: "12–15", baseKg: 5, warmup: false, note: "Triceps; jednoruč přes tělo od kladky ve výšce ramen, kg = váha na kladce", fatigue: 0.35 },
  "Reverse-Grip Tricep Pushdown": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "12–15", baseKg: 12.5, warmup: false, note: "Triceps; stahování tyče podhmatem, kg = váha na kladce", fatigue: 0.4 },
  "Single-Arm Overhead Cable Extension": { pattern: "triceps", muscle: "triceps", unilateral: true, sets: 3, reps: "12–15", baseKg: 5, warmup: false, note: "Triceps (dlouhá hlava); jednoruč za hlavou od spodní kladky, kg = váha na kladce", fatigue: 0.35 },
  "Cable Side Bend": { pattern: "core", muscle: "core", unilateral: true, sets: 2, reps: "10–15", baseKg: 15, warmup: false, note: "Šikmé břišní svaly; úklon trupu od spodní kladky, kg = váha na kladce", fatigue: 0.3 },
  "Cable Single Arm Rope Pushdown": { pattern: "triceps", muscle: "triceps", unilateral: true, sets: 3, reps: "12–15", baseKg: 7.5, warmup: false, note: "Triceps; stahování jednou rukou za konec lana, kg = váha na kladce", fatigue: 0.35, variantOf: "Cable triceps extension" },
  "Machine Cable V Bar Push Downs": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "10–15", baseKg: 20, warmup: false, note: "Triceps; stahování V-tyče z horní kladky, kg = váha na kladce", fatigue: 0.45, variantOf: "Cable triceps extension" },
  "Cable Standing Low To High Wood Chopper": { pattern: "rotation", muscle: "core", unilateral: true, sets: 2, reps: "8–12", baseKg: 15, warmup: false, note: "Rotace; tah od spodní kladky šikmo nahoru přes tělo, kg = váha na kladce", fatigue: 0.3, variantOf: "Cable woodchop" },
  "Cable Bench Straight Leg Kickback": { pattern: "glute_kickback", muscle: "glutes", unilateral: true, sets: 3, reps: "12–15", baseKg: 7.5, warmup: false, note: "Hýždě; zanožování napnuté nohy s oporou o lavici, kg = váha na kladce", fatigue: 0.35, variantOf: "Cable glute kickback" },
  "Cable 30 Degree Shrug": { pattern: "shrug", muscle: "traps", unilateral: false, sets: 3, reps: "12–15", baseKg: 20, warmup: false, note: "Trapézy; krčení ramen šikmo nahoru od spodních kladek, kg = jedna strana", fatigue: 0.3, variantOf: "DB shrug" },
  "Cable Wrist Curl": { pattern: "wrist_flexion", muscle: "forearms", unilateral: false, sets: 3, reps: "15–20", baseKg: 10, warmup: false, note: "Předloktí (flexory); předloktí na lavici, tyč ze spodní kladky, dlaně nahoru, kg = váha na kladce", fatigue: 0.2, variantOf: "DB wrist curl" },
  "Cable Bar Face Pull": { pattern: "rear_delt", muscle: "rear_delts", unilateral: false, sets: 3, reps: "12–15", baseKg: 20, warmup: false, note: "Zadní ramena; face pull s rovnou tyčí místo lana, kg = váha na kladce", fatigue: 0.35, variantOf: "Face pull" },
  "Cable Rope Kneeling Face Pull": { pattern: "rear_delt", muscle: "rear_delts", unilateral: false, sets: 3, reps: "12–15", baseKg: 15, warmup: false, note: "Zadní ramena; face pull v kleku, bez pomoci nohou, kg = váha na kladce", fatigue: 0.3, variantOf: "Face pull" },
  "Cable Seated Rope Face Pull": { pattern: "rear_delt", muscle: "rear_delts", unilateral: false, sets: 3, reps: "12–15", baseKg: 15, warmup: false, note: "Zadní ramena; face pull vsedě na lavici, kg = váha na kladce", fatigue: 0.3, variantOf: "Face pull" },
  "Cable Single Leg Laying Leg Curl": { pattern: "hamstring", muscle: "hamstrings", unilateral: true, sets: 3, reps: "10–15", baseKg: 7.5, warmup: false, note: "Zadní stehna; zakopávání vleže na lavici s manžetou na kotníku, kg = váha na kladce", fatigue: 0.5, variantOf: "Prone leg curl Prime" },
  "Cable Single Arm Underhand Grip Row": { pattern: "pull", muscle: "back", unilateral: true, sets: 3, reps: "10–12", baseKg: 20, warmup: false, note: "Záda; přítah jednoruč podhmatem, loket těsně u těla, kg = váha na kladce", fatigue: 0.6, variantOf: "Single-arm cable row" },
  "Straight Bar Bench Mid Rows": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "10–12", baseKg: 30, warmup: false, note: "Střed zad; přítah rovné tyče vsedě na lavici před spodní kladkou, kg = váha na kladce", fatigue: 0.65, variantOf: "Single-arm cable row" },
  "Decline Machine Chest Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: true, note: "Spodní hrudník; madla stroje níž u hrudníku, kg = celková zátěž stroje", fatigue: 0.9 },
  "Incline Machine Chest Press": { pattern: "push", muscle: "chest", unilateral: false, sets: 3, reps: "8–12", baseKg: 35, warmup: true, note: "Horní hrudník; tlak šikmo vzhůru na stroji, kg = celková zátěž stroje", fatigue: 0.9 },
  "Neutral-Grip Lat Pulldown": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 45, warmup: false, note: "Laty; stahování s neutrálním úchopem (dlaně proti sobě) na šíři ramen", fatigue: 0.85 },
  "Single-Arm Lat Pulldown": { pattern: "pull_vertical", muscle: "back", unilateral: true, sets: 3, reps: "10–12", baseKg: 20, warmup: false, note: "Laty; stahování jednou rukou s madlem, kg = celková zátěž stroje", fatigue: 0.6 },
  "Wide-Grip Lat Pulldown": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: false, note: "Laty a horní záda; široký nadhmat na dlouhé tyči", fatigue: 0.85 },
  "Calf Press": { pattern: "plantar_flexion", muscle: "calves", unilateral: false, sets: 3, reps: "12–20", baseKg: 100, warmup: false, note: "Lýtka; výpony špičkami na spodním okraji plošiny leg pressu, kg = celková zátěž stroje", fatigue: 0.45 },
  "Single-Leg Press": { pattern: "quad", muscle: "quads", unilateral: true, sets: 3, reps: "8–12", baseKg: 60, warmup: false, note: "Kvadricepsy a hýždě; leg press jednou nohou, kg = celková zátěž stroje", fatigue: 1, variantOf: "Pivot leg press" },
  "Reverse Hack Squat": { pattern: "hinge", muscle: "glutes", unilateral: false, sets: 3, reps: "8–12", baseKg: 30, warmup: false, note: "Hýždě a zadní stehna; čelem k opěrce hack stroje, boky jdou dozadu, kg = kotouče na stroji", fatigue: 1.1 },
  "Machine Underhand Row": { pattern: "pull", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 35, warmup: false, note: "Záda a biceps; přítahy podhmatem s oporou hrudníku, kg = celková zátěž stroje", fatigue: 0.8 },
  "Hammer Strength High Row": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "8–12", baseKg: 20, warmup: false, note: "Laty a horní záda; tah shora šikmo dolů na stroji na kotouče, kg = kotouče na jednu stranu", fatigue: 0.8 },
  "Hammer Strength Iso-Lateral Row": { pattern: "pull", muscle: "back", unilateral: true, sets: 3, reps: "8–12", baseKg: 20, warmup: false, note: "Záda; přítah každou rukou zvlášť na stroji na kotouče, kg = kotouče na jednu stranu", fatigue: 0.85 },
  "Machine Lat Pullover": { pattern: "pull_vertical", muscle: "back", unilateral: false, sets: 3, reps: "10–15", baseKg: 30, warmup: false, note: "Široký sval zádový; stroj na pullover vsedě, kg = celková zátěž stroje", fatigue: 0.5 },
  "Machine Back Extension": { pattern: "trunk_extension", muscle: "lower_back", unilateral: false, sets: 3, reps: "10–15", baseKg: 30, warmup: false, note: "Spodní záda; záklon vsedě proti opěrce, kg = celková zátěž stroje", fatigue: 0.4 },
  "Reverse Hyperextension": { pattern: "hip_extension", muscle: "glutes", unilateral: false, sets: 3, reps: "10–15", baseKg: 10, warmup: false, note: "Hýždě a spodní záda; zanožování obou nohou vleže na břiše, kg = zátěž kyvadla", fatigue: 0.5 },
  "Machine Preacher Curl": { pattern: "biceps", muscle: "biceps", unilateral: false, sets: 3, reps: "10–12", baseKg: 20, warmup: false, note: "Biceps; bicepsový stroj s oporou paží, kg = celková zátěž stroje", fatigue: 0.4 },
  "Machine Tricep Extension": { pattern: "triceps", muscle: "triceps", unilateral: false, sets: 3, reps: "10–15", baseKg: 25, warmup: false, note: "Triceps; tricepsový stroj vsedě, kg = celková zátěž stroje", fatigue: 0.45 },
  "Belt Squat": { pattern: "quad", muscle: "quads", unilateral: false, sets: 3, reps: "8–12", baseKg: 40, warmup: true, note: "Stehna a hýždě; dřep se závažím na opasku, páteř bez zátěže, kg = zátěž stroje", fatigue: 1.1 },
  "Machine Crunch": { pattern: "trunk_flexion", muscle: "core", unilateral: false, sets: 3, reps: "10–15", baseKg: 30, warmup: false, note: "Břicho; sklapovačky vsedě na stroji, kg = celková zátěž stroje", fatigue: 0.35 },
  "Captain's Chair Knee Raise": { pattern: "trunk_flexion", muscle: "core", unilateral: false, sets: 3, reps: "10–15", baseKg: 0, warmup: false, note: "Břicho; zvedání kolen s oporou předloktí, kg = přidaná zátěž", fatigue: 0.35 },
  "Selectorized Torso Rotation Machine": { pattern: "rotation", muscle: "core", unilateral: true, sets: 2, reps: "10–15", baseKg: 25, warmup: false, note: "Šikmé břišní svaly; otáčení trupu vsedě na stroji, kg = celková zátěž stroje", fatigue: 0.3 }

};

export const FOCUS_GROUPS = {
  chest: {label:'Hrudník', exercises:['DB bench press','Chest flat press Prime','Barbell bench press','DB incline press','Pec deck','Cable fly','Low-to-high cable fly','Smith machine incline press','Barbell incline bench press','Smith Machine Bench Press','Cable Bench Chest Fly','Cable Bench Press','Cable Chest Press','Cable Decline Bench Press','Cable High-to-Low Fly','Cable Incline Bench Press','Cable Standing Single Arm Chest Press','Single-Arm Cable Fly','Decline Machine Chest Press','Incline Machine Chest Press']},
  upper_back: {label:'Horní záda', exercises:['Low row','Standing rowing machine','One-arm DB row','Single-arm cable row','Wide-grip low row','Barbell row','T-bar row','Chest-supported row','TRX row','Inverted Row','Smith Machine Bent-Over Row','Cable Row Bar Standing Row','Cable Supinating Row','Machine Underhand Row','Hammer Strength Iso-Lateral Row']},
  lats: {label:'Široký sval zádový', exercises:['Lat pulldown','Cable pullover','Close-grip lat pulldown','Pull-up','Assisted pull-up','Chin-up','Straight-Arm Lat Pulldown','Neutral-Grip Lat Pulldown','Single-Arm Lat Pulldown','Wide-Grip Lat Pulldown','Hammer Strength High Row','Machine Lat Pullover']},
  front_delts: {label:'Přední ramena', exercises:['DB shoulder press','Shoulder press Prime','DB Arnold press','Barbell overhead press','Landmine press','Smith Machine Overhead Press','Cable Front Raise','Cable Overhead Press']},
  side_delts: {label:'Boční ramena', exercises:['Standing multi flight','Cable lateral raise','DB lateral raise','Leaning Cable Lateral Raise']},
  rear_delts: {label:'Zadní ramena', exercises:['Rear delt pec deck','Cable rear delt fly','Face pull','DB rear delt fly','Band pull-apart','Cable External Rotation','Cable Single Arm Rear Delt Row']},
  biceps: {label:'Biceps', exercises:['Cable curl','DB curl','Hammer curl','DB incline curl','Cable rope hammer curl','EZ bar curl','Preacher curl','Machine Preacher Curl']},
  triceps: {label:'Triceps', exercises:['Cable triceps extension','Cable overhead triceps extension','Cable triceps kickback','DB overhead triceps extension','EZ bar skull crusher','Dips','Assisted dip','Smith Machine Close Grip Bench Press','Cable Bar Pushdown','Cable Overhead Straight Bar Extensions','Cross-Body Cable Tricep Extension','Reverse-Grip Tricep Pushdown','Single-Arm Overhead Cable Extension','Machine Tricep Extension']},
  abs: {label:'Břišní svaly', exercises:['Abs bench crunch','Cable crunch','Hanging leg raise','Medicine ball slam','Machine Crunch',"Captain's Chair Knee Raise"]},
  obliques: {label:'Šikmé břišní svaly', exercises:['Pallof press','Cable woodchop','Cable Side Bend','Selectorized Torso Rotation Machine']},
  quads: {label:'Přední stehna', exercises:['Pivot leg press','Pendulum squat','Leg extension Prime','DB Bulgarian split squat','Goblet squat','DB sumo squat','Barbell back squat','Barbell front squat','Smith machine squat','Hack squat','Smith Machine Front Squat','Belt Squat']},
  hamstrings: {label:'Zadní stehna', exercises:['Prone leg curl Prime','DB Romanian deadlift','Barbell Romanian deadlift','DB single-leg Romanian deadlift','Seated leg curl','Trap bar deadlift','Smith Machine Sumo Romanian Deadlift']},
  hips: {label:'Hýždě a kyčle', exercises:['Hip thrust','Abduction machine','Adduction machine','Barbell hip thrust','Leg press high feet','Cable glute kickback','Glute hyperextension','Cable pull-through','Abduction machine forward lean','Cable hip abduction','DB reverse lunge','DB step-up','DB sumo squat','Smith machine hip thrust','Smith machine split squat','Glute kickback machine','Trap bar deadlift','Kettlebell swing','Box step-up','Reverse Hack Squat','Reverse Hyperextension']},
  calves: {label:'Lýtka', exercises:['Standing calf raise','Single-leg calf raise','Seated calf raise','Calf Press']},
  forearms: {label:'Předloktí', exercises:['DB wrist curl','DB reverse wrist curl','Cable reverse curl']},
  traps: {label:'Trapézy', exercises:['DB shrug','Barbell shrug','Smith machine shrug','Cable upright row']},
  lower_back: {label:'Spodní záda', exercises:['Roman chair','Barbell good morning','Machine Back Extension']}
};// English exercise notes and muscle group labels: `note` and `label` follow the
// app language (lang.js).
const NOTE_EN = {
 "Dead bug": "Reps per side; controlled movement",
 "Push-up": "Bodyweight; rest your hands on a higher surface if needed",
 "Bodyweight squat": "Bodyweight; pain-free movement",
 "Glute bridge": "Bodyweight",
 "DB bench press": "Main press; kg = one dumbbell",
 "Low row": "Main pull; kg = total machine load",
 "DB shoulder press": "Free weights; kg = one dumbbell",
 "Pivot leg press": "Main exercise; kg = total machine load",
 "Prone leg curl Prime": "Hamstrings; kg = load per side",
 "Cable curl": "Biceps; kg = cable stack weight",
 "DB curl": "Biceps; kg = one dumbbell",
 "Hammer curl": "Biceps; kg = one dumbbell",
 "Cable triceps extension": "Triceps; kg = cable stack weight",
 "Abs bench crunch": "Core; kg = total machine load",
 "Chest flat press Prime": "Chest; Prime machine",
 "Shoulder press Prime": "Shoulders; Prime machine",
 "Standing rowing machine": "Back; standing rowing machine",
 "Lat pulldown": "Lats; high pulley",
 "Leg extension Prime": "Quads; ideally one leg at a time",
 "Hip thrust": "Glutes; hip thrust",
 "DB Romanian deadlift": "Hamstrings/glutes; kg = one dumbbell",
 "Barbell Romanian deadlift": "Hamstrings/glutes; barbell",
 "DB Bulgarian split squat": "Single-leg strength; kg = one dumbbell",
 "Pendulum squat": "Quads; pendulum squat",
 "Adduction machine": "Adductors; machine",
 "Pec deck": "Chest; pec deck",
 "Rear delt pec deck": "Rear delts; reverse pec deck",
 "Cable lateral raise": "Side delts; one arm at a time on the cable",
 "Abduction machine": "Abductors; machine",
 "Cable rear delt fly": "Rear delts; one arm at a time on the cable",
 "Pallof press": "Anti-rotation; one side at a time",
 "Cable woodchop": "Rotation; one side at a time",
 "Cable pullover": "Lats; cable",
 "Standing calf raise": "Calves; machine",
 "Roman chair": "Core/back extension; machine",
 "Barbell bench press": "Main press; barbell bench press, kg = whole bar",
 "DB incline press": "Upper chest; adjustable bench at 30°, kg = one dumbbell",
 "One-arm DB row": "Back; supported on a bench, kg = one dumbbell",
 "Standing multi flight": "Side delts; standing lateral raise machine",
 "Face pull": "Rear delts and shoulder blades; rope on a cable",
 "Cable overhead triceps extension": "Triceps (long head); rope on a cable, behind the head",
 "Goblet squat": "Squat holding a dumbbell at your chest",
 "Cable crunch": "Core; cable",
 "Cable glute kickback": "Glutes; ankle cuff, low pulley, kg = cable stack weight",
 "Cable pull-through": "Glutes and hamstrings; rope between the legs, move from the hips",
 "Cable hip abduction": "Glute medius; standing leg abduction on a cable",
 "Barbell hip thrust": "Glutes; back on an adjustable bench, padded bar across the hips, kg = whole bar",
 "DB reverse lunge": "Glutes and thighs; reverse lunge, kg = one dumbbell",
 "DB step-up": "Glutes and thighs; step-ups onto an adjustable bench, kg = one dumbbell",
 "DB single-leg Romanian deadlift": "Hamstrings and glutes, stability; kg = one dumbbell",
 "DB sumo squat": "Wide squat with a dumbbell; inner thighs and glutes",
 "Leg press high feet": "Glutes; feet high and wider on the platform, kg = total machine load",
 "Abduction machine forward lean": "Glutes; leaning forward at the edge of the seat",
 "Glute hyperextension": "Glutes; Roman chair with a rounded back, push the hips into the pad",
 "Cable fly": "Chest; cable flyes, kg = one side",
 "Low-to-high cable fly": "Upper chest; low pulleys, pull diagonally up, kg = one side",
 "Single-arm cable row": "Back; one-arm cable row",
 "Close-grip lat pulldown": "Lats; close neutral grip",
 "Wide-grip low row": "Upper back and rear delts; wide grip, elbows out",
 "Barbell row": "Back; bent-over barbell row, kg = whole bar",
 "DB lateral raise": "Side delts; kg = one dumbbell",
 "DB Arnold press": "Shoulders; rotate the palms, seated on an adjustable bench, kg = one dumbbell",
 "DB rear delt fly": "Rear delts; chest supported on an incline bench, kg = one dumbbell",
 "DB incline curl": "Biceps (long head); incline bench, kg = one dumbbell",
 "Cable rope hammer curl": "Biceps and brachialis; rope on a cable",
 "Cable triceps kickback": "Triceps; one arm, bent over at a cable",
 "DB overhead triceps extension": "Triceps (long head); one dumbbell in both hands behind the head",
 "Single-leg calf raise": "Calves; one leg with a dumbbell, hand support",
 "Barbell back squat": "Barbell squat in a rack; kg = whole bar",
 "Barbell front squat": "Barbell front squat in a rack; kg = whole bar",
 "Smith machine squat": "Squat in a Smith machine; kg = plates + Smith bar",
 "Smith machine split squat": "Glutes and thighs; Bulgarian split squat in a Smith machine, rear foot on a bench, kg = plates + bar",
 "Smith machine hip thrust": "Glutes; hip thrust under a Smith bar, back on a bench, kg = plates + bar",
 "Smith machine incline press": "Upper chest; incline bench under a Smith machine, kg = plates + bar",
 "Barbell overhead press": "Shoulders; standing overhead press from a rack, kg = whole bar",
 "DB wrist curl": "Forearms (flexors); forearms on a bench, palms up, kg = one dumbbell",
 "DB reverse wrist curl": "Forearms (extensors); forearms on a bench, palms down, kg = one dumbbell",
 "Cable reverse curl": "Forearms and brachioradialis; overhand grip on a straight bar, low pulley",
 "DB shrug": "Traps; shoulders up to the ears and hold, kg = one dumbbell",
 "Barbell shrug": "Traps; bar from a rack at thigh height, kg = whole bar",
 "Smith machine shrug": "Traps; Smith bar at thigh height, kg = plates + bar",
 "Cable upright row": "Traps and side delts; bar on a low pulley, elbows no higher than the shoulders",
 "Barbell good morning": "Lower back and hamstrings; bar on the back from a rack, flat back, kg = whole bar",
 "Pull-up": "Lats; overhand pull-ups, kg = added weight. If you can't do 5 clean reps, use the assisted machine or a band",
 "Chin-up": "Lats and biceps; underhand pull-ups, shoulder-width grip, kg = added weight",
 "Assisted pull-up": "Lats; kg = machine counterweight, less is harder. Set it so you have 2–3 reps in reserve",
 "Hanging leg raise": "Abs; hanging from a bar without swinging, bent knees make it easier",
 "Dips": "Triceps and chest; on dip bars, go only as deep as your shoulders stay pain-free, kg = added weight",
 "Assisted dip": "Triceps and chest; kg = machine counterweight, less is harder",
 "Kettlebell swing": "Glutes and hamstrings; swing from the hips, not the shoulders, kg = kettlebell",
 "EZ bar curl": "Biceps; standing with an EZ bar, kg = bar with plates",
 "EZ bar skull crusher": "Triceps; lying on a bench, lower the EZ bar behind your forehead, kg = bar with plates",
 "Preacher curl": "Biceps; preacher bench with an EZ bar, don't snap the elbows straight at the bottom, kg = bar with plates",
 "Band pull-apart": "Rear delts and shoulder blades; pull a band apart in front of your chest, pick the band by strength",
 "Hack squat": "Quads; hack squat machine, kg = plates on the machine",
 "Seated leg curl": "Hamstrings; seated leg curl, kg = total machine load",
 "Glute kickback machine": "Glutes; kickback machine, kg = load per side",
 "Seated calf raise": "Calves (mainly the soleus); seated with the pad on your knees, kg = total machine load",
 "T-bar row": "Back; bent-over T-bar row with a flat back, kg = plates",
 "Chest-supported row": "Back without loading the lower back; chest on the pad, kg = total machine load",
 "TRX row": "Back; rows on a suspension trainer, the more horizontal, the harder",
 "Barbell incline bench press": "Upper chest; incline bench with a racked barbell, kg = whole bar",
 "Trap bar deadlift": "Glutes, thighs and back; trap bar deadlift, flat back, kg = bar with plates",
 "Landmine press": "Shoulders and upper chest; one arm, pressing up at an angle, easier on the shoulders, kg = plates on the end of the bar",
 "Medicine ball slam": "Core and power; a non-bouncing medicine ball, kg = ball",
 "Box step-up": "Glutes and thighs; step-ups onto a knee-high box, kg = one dumbbell in each hand (0 = bodyweight)",
 "Smith Machine Bench Press": "Chest; flat bench under the Smith bar, kg = plates + bar",
 "Smith Machine Decline Bench Press": "Lower chest; head-down bench under the Smith bar, kg = plates + bar",
 "Inverted Row": "Back; bodyweight rows to the Smith bar, the lower the bar, the harder, kg = added weight",
 "Smith Machine Bent-Over Row": "Back; bent-over row with the Smith bar, kg = plates + bar",
 "Smith Machine Overhead Press": "Shoulders; standing Smith bar overhead press, kg = plates + bar",
 "Smith Machine Seated Overhead Press": "Shoulders; seated on a bench under the Smith bar, kg = plates + bar",
 "Smith Machine Close Grip Bench Press": "Triceps; close grip under the Smith bar, kg = plates + bar",
 "Smith Machine Front Squat": "Quads; Smith bar on the front of your shoulders, kg = plates + bar",
 "Smith Machine Sumo Romanian Deadlift": "Hamstrings, glutes and adductors; wide stance at the Smith bar, kg = plates + bar",
 "Smith Machine Calf Raise": "Calves; calf raises with the Smith bar on your back, toes on a plate, kg = plates + bar",
 "Cable Bench Chest Fly": "Chest; lying flyes on a bench between the cables, kg = one side",
 "Cable Bench Press": "Chest; bench press with handles from the low pulleys, kg = one side",
 "Cable Chest Press": "Chest; standing press from pulleys at chest height, kg = one side",
 "Cable Decline Bench Press": "Lower chest; head-down bench press with cable handles, kg = one side",
 "Cable High-to-Low Fly": "Lower chest; pulleys high, pull down at an angle in front of your hips, kg = one side",
 "Cable Incline Bench Press": "Upper chest; incline bench between the low pulleys, kg = one side",
 "Cable Standing Single Arm Chest Press": "Chest and core; one-arm standing press, kg = cable stack weight",
 "Single-Arm Cable Fly": "Chest; one-arm cable fly, kg = cable stack weight",
 "Cable Row Bar Standing Row": "Back; standing straight-bar row from a pulley at waist height, kg = cable stack weight",
 "Cable Supinating Row": "Back and biceps; one-arm row turning the palm up, kg = cable stack weight",
 "Straight-Arm Lat Pulldown": "Lats; straight-arm pulldown of a bar from the high pulley to your hips, kg = cable stack weight",
 "Straight Arm Rope Pulldown (Light)": "Lats; light straight-arm pulldown with a rope, kg = cable stack weight",
 "Cable External Rotation": "Rotator cuff and rear delt; rotate your forearm out, elbow at your side, kg = cable stack weight",
 "Cable Front Raise": "Front delts; front raise from the low pulley, kg = cable stack weight",
 "Cable Overhead Press": "Shoulders; overhead press with handles from the low pulleys, kg = one side",
 "Cable Single Arm Rear Delt Row": "Rear delts; one-arm row with the elbow high and out, kg = cable stack weight",
 "Leaning Cable Lateral Raise": "Side delts; leaning away from the machine for a longer range, kg = cable stack weight",
 "Cable Bar Pushdown": "Triceps; straight-bar pushdown from the high pulley, kg = cable stack weight",
 "Cable Overhead Straight Bar Extensions": "Triceps (long head); bar behind your head, back to the pulley, kg = cable stack weight",
 "Cross-Body Cable Tricep Extension": "Triceps; one arm across the body from a pulley at shoulder height, kg = cable stack weight",
 "Reverse-Grip Tricep Pushdown": "Triceps; underhand-grip pushdown, kg = cable stack weight",
 "Single-Arm Overhead Cable Extension": "Triceps (long head); one arm overhead from the low pulley, kg = cable stack weight",
 "Cable Side Bend": "Obliques; side bend away from the low pulley, kg = cable stack weight",
 "Cable Single Arm Rope Pushdown": "Triceps; one-arm pushdown holding one end of the rope, kg = cable stack weight",
 "Machine Cable V Bar Push Downs": "Triceps; V-bar pushdown from the high pulley, kg = cable stack weight",
 "Cable Standing Low To High Wood Chopper": "Rotation; pull from the low pulley diagonally up across the body, kg = cable stack weight",
 "Cable Bench Straight Leg Kickback": "Glutes; straight-leg kickback supported on a bench, kg = cable stack weight",
 "Cable 30 Degree Shrug": "Traps; shrugs angled up and out from the low pulleys, kg = one side",
 "Cable Wrist Curl": "Forearms (flexors); forearms on a bench, bar from the low pulley, palms up, kg = cable stack weight",
 "Cable Bar Face Pull": "Rear delts; face pull with a straight bar instead of a rope, kg = cable stack weight",
 "Cable Rope Kneeling Face Pull": "Rear delts; kneeling face pull without help from the legs, kg = cable stack weight",
 "Cable Seated Rope Face Pull": "Rear delts; seated face pull on a bench, kg = cable stack weight",
 "Cable Single Leg Laying Leg Curl": "Hamstrings; lying leg curl on a bench with a cuff on your ankle, kg = cable stack weight",
 "Cable Single Arm Underhand Grip Row": "Back; one-arm underhand row, elbow close to your body, kg = cable stack weight",
 "Straight Bar Bench Mid Rows": "Mid back; seated straight-bar row on a bench at the low pulley, kg = cable stack weight",
 "Decline Machine Chest Press": "Lower chest; machine handles lower on your chest, kg = total machine load",
 "Incline Machine Chest Press": "Upper chest; inclined machine press, kg = total machine load",
 "Neutral-Grip Lat Pulldown": "Lats; pulldown with a neutral grip (palms facing) at shoulder width",
 "Single-Arm Lat Pulldown": "Lats; one-arm pulldown with a handle, kg = total machine load",
 "Wide-Grip Lat Pulldown": "Lats and upper back; wide overhand grip on the long bar",
 "Calf Press": "Calves; calf presses with the balls of your feet on the bottom edge of the leg press platform, kg = total machine load",
 "Single-Leg Press": "Quads and glutes; one-leg leg press, kg = total machine load",
 "Reverse Hack Squat": "Glutes and hamstrings; facing the pad of the hack squat, hips go back, kg = plates on the machine",
 "Machine Underhand Row": "Back and biceps; underhand rows with chest support, kg = total machine load",
 "Hammer Strength High Row": "Lats and upper back; high row down at an angle on a plate-loaded machine, kg = plates per side",
 "Hammer Strength Iso-Lateral Row": "Back; rows with each arm separately on a plate-loaded machine, kg = plates per side",
 "Machine Lat Pullover": "Lats; seated pullover machine, kg = total machine load",
 "Machine Back Extension": "Lower back; seated extension against the pad, kg = total machine load",
 "Reverse Hyperextension": "Glutes and lower back; lying face down, lift both legs back, kg = pendulum load",
 "Machine Preacher Curl": "Biceps; biceps machine with arm support, kg = total machine load",
 "Machine Tricep Extension": "Triceps; seated triceps machine, kg = total machine load",
 "Belt Squat": "Quads and glutes; squat with the load on a belt, no load on the spine, kg = machine load",
 "Machine Crunch": "Abs; seated crunch machine, kg = total machine load",
 "Captain's Chair Knee Raise": "Abs; knee raises supported on your forearms, kg = added weight",
 "Selectorized Torso Rotation Machine": "Obliques; seated torso rotation machine, kg = total machine load"
};
const GROUP_EN = {"chest": "Chest", "upper_back": "Upper back", "lats": "Lats", "front_delts": "Front delts", "side_delts": "Side delts", "rear_delts": "Rear delts", "biceps": "Biceps", "triceps": "Triceps", "abs": "Abs", "obliques": "Obliques", "quads": "Quads", "hamstrings": "Hamstrings", "hips": "Glutes and hips", "calves": "Calves", "forearms": "Forearms", "traps": "Traps", "lower_back": "Lower back"};
for (const [name, def] of Object.entries(EXERCISES)) { const cs = def.note; Object.defineProperty(def, 'note', { get: () => L(cs, NOTE_EN[name] || cs), enumerable: true }); }
for (const [id, group] of Object.entries(FOCUS_GROUPS)) { const cs = group.label; Object.defineProperty(group, 'label', { get: () => L(cs, GROUP_EN[id] || cs), enumerable: true }); }


// The session's focus: "legs", "lower body" or "nohy" is the lower body,
// "upper body" or "vršek" the upper, "full body" none; anything else is refused
// instead of quietly giving a full-body plan (Revize 2026-10-16, nález 28).
export function normalizeGymFocus(value){
  if(value==null||value==='')return undefined;
  const v=String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
  if(/^(?:lower(?: body)?|legs?|leg day|nohy|dolni cast tela)$/.test(v))return 'lower';
  if(/^(?:upper(?: body)?|horni cast tela|vrsek)$/.test(v))return 'upper';
  if(/^(?:full(?: ?body)?|cele telo)$/.test(v))return undefined;
  throw new Error(L('Neznámé zaměření tréninku: '+String(value).slice(0,40)+'. Vyber horní nebo dolní část těla, nebo celé tělo.','Unknown workout focus: '+String(value).slice(0,40)+'. Choose upper body, lower body or full body.'));
}
export function validateFocusMuscles(value){
  if(!Array.isArray(value)||value.length<1||value.length>5)return null;
  const unique=[...new Set(value.map(String))];
  return unique.length===value.length&&unique.every(id=>Object.hasOwn(FOCUS_GROUPS,id))?unique:null;
}

// Pain or an injury the coach remembers ("koleno bolí při dřepech") leaves out
// the exercises that load that part: the knee squats, lunges and presses, the
// shoulder overhead and bench presses, the lower back deadlifts and good
// mornings (Revize 2026-10-16, nález 24). "Nebolí" is no pain.
const PAIN = /(?<!ne)bol[ií]|bolest|zran|nat[áa]h|podvrt|v[ýy]ron|natekl|hurt|pain|sore|injur|sprain|strain|ache/i;
const PAIN_AREAS = [
  { part: /kolen|knee/i, exercises: /squat|lunge|leg press|step-up|leg extension/i, label: ['kolena', 'knee'] },
  { part: /ramen|shoulder/i, exercises: /shoulder press|overhead press|arnold|landmine press|bench press|incline press|chest flat press|chest press|^dips$|assisted dip/i, label: ['ramene', 'shoulder'] },
  { part: /z[aá]d(?:a|ech|ou)(?!\p{L})|bedr|k[řr][íi][žz]|p[áa]te[řr]|plot[ée]nk|(?<!\p{L})back(?!\p{L})|lumbar/iu, exercises: /deadlift|good morning/i, label: ['zad', 'lower back'] }
];
export function painfulExercises(memories) {
  const areas = PAIN_AREAS.filter(a => (Array.isArray(memories) ? memories : []).some(m => PAIN.test(String(m)) && a.part.test(String(m))));
  return { parts: areas.map(a => L(a.label[0], a.label[1])), avoid: new Set(Object.keys(EXERCISES).filter(name => areas.some(a => a.exercises.test(name)))) };
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
// A run loads the legs harder per hour than a ride: 90 minutes is long.
const hardRun = x => isIntensity(x) || (num(x?.durationHours) || 0) >= 1.5;
// Form (TSB = CTL − ATL, Banister's fitness–fatigue model as Intervals.icu
// reports it with each activity) says how much fatigue the endurance training
// left. It replaces an acute:chronic load ratio, which adds no predictive
// value of its own (Impellizzeri 2020, 2021).
function rideForm(context) {
  const a = context?.cycling?.lastRide || context?.cycling?.recentActivities?.[0];
  const ctl = num(a?.ctl), atl = num(a?.atl);
  return ctl != null && atl != null && ctl > 0 ? ctl - atl : null;
}
function recoveryFactor(context) {
  const recentTss = num(context?.cycling?.recentRideTss) || 0, recentHours = num(context?.cycling?.recentRideHours) || 0;
  const recent = context?.cycling?.recentActivities || [], signals = recoverySignals(context), form = rideForm(context);
  let factor = 1;
  if (form != null) { if (form <= -30) factor *= 0.90; else if (form <= -20) factor *= 0.94; else if (form <= -10) factor *= 0.97; }
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
    return { protect: true, reason: L((d === 0 ? "Dnes" : d === 1 ? "Zítra" : "Brzy") + " je v plánu " + (isIntensity(next) ? "náročná jízda" : "dlouhá jízda"), (isIntensity(next) ? "A hard ride" : "A long ride") + " is planned " + (d === 0 ? "today" : d === 1 ? "tomorrow" : "soon")) + fmt(next) + "." };
  }
  const run = context?.running?.nextRun;
  if (run && within(run, date, 0, 1) && hardRun(run)) {
    const d = daysFrom(run, date);
    return { protect: true, reason: L((d === 0 ? "Dnes" : d === 1 ? "Zítra" : "Brzy") + " je v plánu " + (isIntensity(run) ? "náročný běh" : "dlouhý běh"), (isIntensity(run) ? "A hard run" : "A long run") + " is planned " + (d === 0 ? "today" : d === 1 ? "tomorrow" : "soon")) + fmt(run) + "." };
  }
  const nearRides = (context?.cycling?.plannedWorkouts || []).filter(x => within(x, date, 0, 2) && hardRide(x)), nearRuns = (context?.running?.plannedWorkouts || []).filter(x => within(x, date, 0, 2) && hardRun(x));
  const near = [...nearRides, ...nearRuns];
  if (near.length >= 2 && nearRuns.length) return { protect: true, reason: nearRides.length ? L("Během dvou dnů jsou v plánu dva náročné tréninky.", "Two hard sessions are planned within two days.") : L("Během dvou dnů jsou v plánu dva náročné běhy.", "Two hard runs are planned within two days.") };
  if (near.length >= 2) return { protect: true, reason: L("Během dvou dnů jsou v plánu dvě náročné jízdy.", "Two hard rides are planned within two days.") };
  const ctl = num(context?.cycling?.lastRide?.ctl) || num(context?.cycling?.recentActivities?.[0]?.ctl) || null;
  const last48 = (context?.cycling?.recentActivities || []).filter(x => within(x, date, -1, 0)).slice(0, 3).reduce((sum, x) => sum + (num(x.tss) || 0), 0);
  if (last48 >= Math.max(250, (ctl || 0) * 4)) return { protect: true, reason: L("Za poslední dva dny máš za sebou velkou jízdní zátěž (", "You've had a big riding load over the last two days (") + Math.round(last48) + " TSS)." };
  const form = rideForm(context);
  if (form != null ? form <= -25 : (num(context?.cycling?.recentRideTss) || 0) >= 1000) return { protect: true, reason: L("Jízdní únava je vysoká (forma TSB ", "Riding fatigue is high (TSB form ") + (form != null ? Math.round(form) : "—") + L("), nohy dnes šetřím.", "), so I'm sparing your legs today.") };
  return { protect: false, reason: "" };
}
// What the AI adjustment on the gym screen sees of the day: readiness, the
// athlete's status and whether and why the legs are spared, with the other
// sports' leg load (Revize 2026-10-16, nález 27).
export function gymDayFacts(context) {
  const r = context?.adaptive?.recovery, legs = legProtection(context), sport = sportMuscleLoad(context);
  return { readiness: { zone: r?.zone || null, score: r?.score ?? null, flags: r?.flags || [] }, athleteStatus: context?.athleteState?.status || 'active', legs: { protect: legs.protect, reason: legs.reason || null, sportLoad: Object.fromEntries([...sport].filter(([m]) => LEG_MUSCLES.has(m)).map(([m, v]) => [m, Math.round(v * 100) / 100])) } };
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
// The variants of each main exercise, in catalog order.
const VARIANTS = {};
for (const [name, def] of Object.entries(EXERCISES)) if (def.variantOf) (VARIANTS[def.variantOf] ||= []).push(name);
export const variantsOf = name => VARIANTS[name] || [];
// The member of a main exercise's family (it and its variants) for the date:
// blocks of five ISO weeks (Monday to Sunday) take turns, so a variant stays
// 4–6 weeks of training before the next one. Variants that do not fit are skipped.
export function variantFor(name, date, fits = () => true) {
  const family = [name, ...variantsOf(name).filter(fits)];
  const day = Math.floor(Date.parse(dateKey(date) + "T12:00:00Z") / 86400000);
  if (family.length < 2 || !Number.isFinite(day)) return name;
  return family[Math.floor(Math.floor((day + 3) / 7) / 5) % family.length];
}
export function stalledExercises(rows, date) {
  const byExercise = new Map();
  for (const r of rows || []) {
    const ex = normalizeExerciseName(r.exercise);
    if (!EXERCISES[ex] || String(r.type || "WORK").toUpperCase() !== "WORK" || r.planned) continue;
    (byExercise.get(ex) || byExercise.set(ex, []).get(ex)).push(r);
  }
  return new Set([...byExercise].filter(([ex, list]) => progressionDecision(list, ex, EXERCISES[ex].reps, 1, date)?.stalled).map(([ex]) => ex));
}

// The athlete's thumbs (exercise-feedback.js): disliked exercises are left
// out while the pattern or group has another one; a liked one wins a close call.
const LIKED_BONUS = 0.4;
function taste(options) {
  return { liked: new Set((options.likedExercises || []).map(normalizeExerciseName)), disliked: new Set((options.dislikedExercises || []).map(normalizeExerciseName)) };
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
    return recent + groupRecency(ex) + (muscleExposure.get(def?.muscle) || 0) * 0.3 + (muscleLoad.get(def?.muscle) || 0) * 0.2 + rank * 0.05 + (emphasis[def?.muscle] || 0) + (usedPatterns.has(def?.pattern) ? 1 : 0) + (withStall && stalled.has(ex) ? 3 : 0) - (liked.has(ex) ? LIKED_BONUS : 0);
  };

  // Only a close call between variants: recency and muscle load still decide.
  const female = athleteSex(context, options) === "female";
  const emphasis = female ? { glutes: -0.2, abductors: -0.1 } : {};
  const sexNote = female ? L(" Výchozí váhy bez historie a výběr variant cviků zohledňují profil (žena).", " Starting weights without history and the choice of exercise variants take your profile (female) into account.") : "";

  const forceUpper = options.forceProtectLegs === true || options.focus === "upper"&&options.focusSource!=='week';
  const forceLower = options.focus === "lower";
  const { liked, disliked } = taste(options);
  const recovery=recoverySignals(context),acuteRecovery=(context?.adaptive?.recovery?.score??100)<55||recovery.sleepMin!=null&&recovery.sleepMin<330;

  const candidatesByPattern = {
    horizontalPush: ["DB bench press", "Chest flat press Prime", "Barbell bench press", "DB incline press", "Pec deck", "Cable fly", "Low-to-high cable fly", "Smith machine incline press", "Barbell incline bench press", "Smith Machine Bench Press", "Cable Bench Chest Fly", "Cable Bench Press", "Cable Chest Press", "Cable Decline Bench Press", "Cable High-to-Low Fly", "Cable Incline Bench Press", "Cable Standing Single Arm Chest Press", "Single-Arm Cable Fly", "Decline Machine Chest Press", "Incline Machine Chest Press"],
    horizontalPull: ["Low row", "Standing rowing machine", "One-arm DB row", "Single-arm cable row", "Wide-grip low row", "Barbell row", "Chest-supported row", "T-bar row", "TRX row", "Inverted Row", "Smith Machine Bent-Over Row", "Cable Row Bar Standing Row", "Cable Supinating Row", "Machine Underhand Row", "Hammer Strength Iso-Lateral Row"],
    verticalPush: ["DB shoulder press", "Shoulder press Prime", "DB Arnold press", "Barbell overhead press", "Landmine press", "Smith Machine Overhead Press", "Cable Overhead Press"],
    verticalPull: ["Lat pulldown", "Cable pullover", "Close-grip lat pulldown", "Pull-up", "Assisted pull-up", "Chin-up", "Straight-Arm Lat Pulldown", "Neutral-Grip Lat Pulldown", "Single-Arm Lat Pulldown", "Wide-Grip Lat Pulldown", "Hammer Strength High Row", "Machine Lat Pullover"],
    lateralRaise: ["Cable lateral raise", "Standing multi flight", "DB lateral raise", "Leaning Cable Lateral Raise"],
    biceps: ["DB curl", "Hammer curl", "Cable curl", "DB incline curl", "Cable rope hammer curl", "EZ bar curl", "Preacher curl", "Machine Preacher Curl"],
    triceps: ["Cable triceps extension", "Cable overhead triceps extension", "Cable triceps kickback", "DB overhead triceps extension", "EZ bar skull crusher", "Dips", "Assisted dip", "Smith Machine Close Grip Bench Press", "Cable Bar Pushdown", "Cable Overhead Straight Bar Extensions", "Cross-Body Cable Tricep Extension", "Reverse-Grip Tricep Pushdown", "Single-Arm Overhead Cable Extension", "Machine Tricep Extension"],
    rearDelts: ["Rear delt pec deck", "Cable rear delt fly", "Face pull", "DB rear delt fly", "Band pull-apart", "Cable External Rotation", "Cable Single Arm Rear Delt Row"],
    core: ["Abs bench crunch", "Cable crunch", "Pallof press", "Cable woodchop", "Roman chair", "Hanging leg raise", "Medicine ball slam", "Cable Side Bend", "Machine Back Extension", "Machine Crunch", "Captain's Chair Knee Raise", "Selectorized Torso Rotation Machine"],
    quad: ["Pivot leg press", "Pendulum squat", "Leg extension Prime", "Goblet squat", "DB sumo squat", "Barbell back squat", "Smith machine squat", "Barbell front squat", "Hack squat", "Smith Machine Front Squat", "Belt Squat"],
    hinge: ["DB Romanian deadlift", "Barbell Romanian deadlift", "Hip thrust", "Barbell hip thrust", "Cable pull-through", "DB single-leg Romanian deadlift", "Trap bar deadlift", "Kettlebell swing", "Glute kickback machine", "Smith Machine Sumo Romanian Deadlift", "Reverse Hack Squat", "Reverse Hyperextension"],
    unilateral: ["DB Bulgarian split squat", "DB reverse lunge", "DB step-up", "Smith machine split squat", "Box step-up"],
    posterior: ["Prone leg curl Prime", "Seated leg curl"],
    calves: ["Standing calf raise", "Single-leg calf raise", "Seated calf raise", "Calf Press"],
    // Grip and upper traps help posture on the bike and in daily life; they
    // are not a priority, so they take a turn about every second week.
    forearms: ["DB wrist curl", "Cable reverse curl", "DB reverse wrist curl"],
    traps: ["DB shrug", "Smith machine shrug", "Cable upright row", "Barbell shrug"]
  };

  // Bodyweight work last in its pattern, and in its movement group like the rest: a
  // leg day yesterday counts against a bodyweight squat too (Revize 2026-10-16, nález 25).
  candidatesByPattern.horizontalPush.push('Push-up');candidatesByPattern.quad.push('Bodyweight squat');candidatesByPattern.hinge.push('Glute bridge');candidatesByPattern.core.push('Dead bug');
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
    // A disliked exercise only when the pattern has nothing else.
    const pool = withoutDisliked([].concat(patterns).flatMap(p => (candidatesByPattern[p] || []).map((ex, rank) => ({ ex, rank }))).filter(({ ex }) => EXERCISES[ex] && availableAt(ex) && fitsEquipment(ex,context.trainingSetup) && !used.has(ex)), disliked, x => x.ex);
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
        ? L("Na tvoje přání šetřím nohy a trénink soustředím na horní část těla; cviky vybírám podle čerstvosti a nedávné svalové zátěže.", "As you asked, I'm sparing your legs and focusing on the upper body; exercises are chosen by freshness and recent muscle load.")
        : L("Velmi slabá regenerace dnes dočasně omezuje zatížení nohou. Dej přednost odpočinku, případný gym zkrať; nohy znovu zařadíme, až se stav zlepší.", "Very poor recovery temporarily limits leg loading today. Prioritize rest and keep any gym session short; legs come back once you've recovered.")) + sexNote,
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
      rationale: L("Na tvoje přání soustředím trénink na dolní část těla; skladba nejprve zajistí různé pohybové vzory a teprve potom vybírá podle čerstvosti a nedávné svalové zátěže.", "As you asked, the workout focuses on the lower body; it first covers different movement patterns and then chooses by freshness and recent muscle load.") + sexNote,
      protectedLegs: false
    };
  }

  // Full body: the leg pattern whose turn it is (knee or hip), a push and a
  // pull (horizontal or vertical, alternating), the other leg pattern, then
  // the small muscles in turn, a second pull and push for longer sessions.
  const leg = pick(["quad", "hinge", "posterior", "unilateral"]);
  const kneeFirst = ["quad", "unilateral"].some(p => (candidatesByPattern[p] || []).includes(leg));
  const exercises = [leg, ...build([["horizontalPush", "verticalPush"], ["horizontalPull", "verticalPull"], kneeFirst ? ["hinge", "posterior"] : ["quad", "unilateral"], accessories[0], accessories[1], ["horizontalPull", "verticalPull"], accessories[2], ["horizontalPush", "verticalPush"], accessories[3]])].filter(Boolean);
  const reason = protection.reason || (weekUpper ? L("Podle plánu týdne je blízko klíčový trénink.", "According to the week plan, a key session is coming up.") : "");
  return {
    ...base,
    name: protectLegs?L("Full Body · s rezervou","Full Body · with reserve"):"Full Body",
    exercises,
    rationale: (protectLegs?L("Vyvážený silový trénink zahrnuje i nohy. " + reason + " Proto mají nohy nejvýše 2 pracovní série na cvik a rezervu 3–4 opakování; horní část těla trénuje naplno.", "A balanced strength workout includes the legs too. " + reason + " So the legs get at most 2 work sets per exercise with 3–4 reps in reserve; the upper body trains in full."):L("Vyvážený silový trénink zahrnuje dolní i horní část těla v plné dávce. Výběr cviků zohledňuje skutečné silové tréninky a čerstvost jednotlivých svalů.", "A balanced strength workout covers the lower and upper body at a full dose. The choice of exercises takes your actual strength sessions and the freshness of each muscle into account.")) + sexNote,
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

const kgText = x => L(String(x).replace(".", ","), String(x));
// What the load is based on, in one short line next to the exercise.
function progressionNote(estimate) {
  if (estimate.source !== "own-history") return "";
  // An imperial athlete reads the load in lb, the plan's numbers stay kg (Revize 2026-10-16, nález 28).
  const load = kg => isImperial() ? kgText(Math.round(kgToLb(kg) * 10) / 10) + " lb" : kgText(kg) + " kg";
  const last = L("minule ", "last time ") + (estimate.referenceSets > 1 ? estimate.referenceSets + "× " : "") + estimate.referenceReps + L(" op. @ ", " reps @ ") + load(estimate.referenceKg) + (estimate.referenceRpe != null ? ", RPE " + kgText(estimate.referenceRpe) : "");
  const diff = Math.round((estimate.kg - estimate.referenceKg) * 100) / 100, signed = (diff > 0 ? "+" : "") + load(diff);
  if (estimate.progression === "increase") return "↑ " + last + " → " + signed;
  if (estimate.progression === "decrease") return "↓ " + last + " → " + signed + L(", ať udržíš rozsah opakování", " to stay in the rep range");
  if (estimate.progression === "return") return L("po delší pauze lehčeji (", "lighter after a longer break (") + last + ")";
  if (estimate.stalled) return "= " + last + L(" – 3× bez posunu: přidej opakování, jinak příště vyměníme cvik", " – 3× without progress: add a rep, otherwise we'll swap the exercise next time");
  return "= " + last + L(" – cíl: o opakování víc", " – goal: one more rep");
}
// Someone with no strength sets here yet: the catalogue loads (an experienced
// athlete's working weights) are cut to a careful first guess. What they then
// actually lift drives the next session (own-history progression).
export const FIRST_SESSION_LOAD = 0.6;
const FIRST_SESSION_NOTE = () => L("první trénink: váha je opatrný odhad, uprav ji tak, aby ti zbyla 2–3 opakování v rezervě (RPE 7)", "first session: the weight is a careful estimate; adjust it so you have 2–3 reps in reserve (RPE 7)");
const CATALOGUE_SCALE = { beginner: FIRST_SESSION_LOAD, regular: 0.8, experienced: 1 };
const NEW_EXERCISE_NOTE = () => L("nový cvik: váha je odhad, uprav ji tak, aby ti zbyla 2–3 opakování v rezervě", "new exercise: the weight is an estimate; adjust it so you have 2–3 reps in reserve");
const TEST_SET_NOTE = () => L("zkušební série: začni lehčí vahou, se kterou zvládneš opakování s rezervou 3–4; podle ní nastav další série (RPE 7–8)", "test set: start with a lighter weight you can do with 3–4 reps in reserve; set the next sets from it (RPE 7–8)");
// Core work keeps its own repetitions when a training plan sets them for the rest.
const CORE_PATTERNS = new Set(["core", "anti_rotation", "rotation", "trunk_flexion", "trunk_extension", "slam"]);
// The athlete's gym goal (onboarding.js trainingSetup.goal): strength is few
// heavy reps on the main lifts, muscle the middle range, fitness many light
// reps, and two steps in between. "auto" follows the main sport
// (recommendedGoal). A beginner's main lifts stay at 6–8 even for strength,
// while the technique settles.
export const STRENGTH_GOALS = ['auto', 'strength', 'strength_muscle', 'muscle', 'muscle_fitness', 'fitness'];
// A cyclist needs strong legs without much weight (strength and muscle), a
// runner light, durable legs (muscle and fitness), a lifter muscle. Without a
// known sport each exercise keeps its own range ("auto").
export function recommendedGoal(mainSport, experience) {
  const goal = { cycling: 'strength_muscle', running: 'muscle_fitness', triathlon: 'muscle_fitness', strength: 'muscle' }[mainSport] || 'auto';
  return experience === 'beginner' && goal === 'strength_muscle' ? 'muscle' : goal;
}
export function goalReps(def, goal, experience) {
  if (!def || !goal || goal === 'auto' || CORE_PATTERNS.has(def.pattern) || !def.baseKg) return def?.reps;
  const main = def.warmup === true, heavy = def.fatigue >= .7, beginner = experience === 'beginner';
  if (goal === 'strength') return main ? (beginner ? '6–8' : '3–6') : heavy ? '6–8' : def.reps;
  if (goal === 'strength_muscle') return main ? (beginner ? '6–8' : '5–8') : heavy ? '6–10' : '8–12';
  if (goal === 'muscle') return main ? '6–10' : '8–12';
  if (goal === 'muscle_fitness') return main ? '8–12' : '12–15';
  if (goal === 'fitness') return '12–15';
  return def.reps;
}
// A dumbbell the athlete has, before the note is written: up to the next one
// for a step up (steps of 5 kg would otherwise round every increase away), down
// for a step back, else the nearest. A step up that no dumbbell allows holds.
export function dumbbellFor(estimate, weights) {
  const have = (Array.isArray(weights) ? weights : []).map(Number).filter(kg => kg > 0).sort((a, b) => a - b), kg = Number(estimate?.kg);
  if (!have.length || !(kg > 0)) return estimate;
  const up = estimate.progression === "increase", down = estimate.progression === "decrease" || estimate.progression === "return";
  const best = up ? have.find(w => w >= kg - 1e-9) ?? have.at(-1) : down ? [...have].reverse().find(w => w <= kg + 1e-9) ?? have[0] : have.reduce((a, b) => Math.abs(b - kg) < Math.abs(a - kg) ? b : a);
  const out = { ...estimate, kg: best };
  if (estimate.referenceKg != null && best === Number(estimate.referenceKg) && (up || down)) out.progression = "hold";
  return out;
}
function workRows(exercise, historyMap, factor, protectedLegs, muscleLoad, volumeModifier = 1, maxSets = 4, sex = "", today = null, firstSession = false, planReps = null, goal = 'auto', experience = '', dumbbells = null) {
  // The catalogue's loads are an experienced athlete's: anyone else starts an
  // exercise new to them lighter, as on the first session.
  const def = EXERCISES[exercise], fallbackKg = def.baseKg == null ? null : def.baseKg * startingLoadScale(def.muscle, sex) * (firstSession ? FIRST_SESSION_LOAD : CATALOGUE_SCALE[experience] ?? CATALOGUE_SCALE.regular);
  const ownReps = planReps && !CORE_PATTERNS.has(def.pattern) ? planReps : goalReps(def, goal, experience);
  // Legs spared for a key session: the higher rep range at the load held (no
  // step up) and no extra set, so never more than the 2 sets the caller allows
  // (Revize 2026-10-16, nález 26).
  const spared = protectedLegs && LEG_MUSCLES.has(def.muscle);
  const reps = spared && ["quads", "hamstrings", "glutes"].includes(def.muscle) ? "8–12" : ownReps;
  let estimate = estimateStartingLoad({ exercise, history: [...historyMap.values()].flat(), targetReps: reps, fallbackKg, loadFactor: factor, today });
  if (spared && estimate.progression === "increase") estimate = { ...estimate, kg: estimate.referenceKg, progression: "hold" };
  if (EXERCISE_INTELLIGENCE[exercise]?.loadUnit === "per_hand_kg") estimate = dumbbellFor(estimate, dumbbells);
  const kg = estimate.kg, execution = def.unilateral ? "UNILATERAL" : DEFAULT_EXECUTION;
  // Strength for an experienced athlete: one more set of the main lifts.
  const extra = !spared && !planReps && (goal === 'strength' || goal === 'strength_muscle') && experience === 'experienced' && def.warmup ? 1 : 0;
  const sets = Math.min(adaptiveSetCount(exercise, muscleLoad, factor, volumeModifier) + extra, maxSets + extra);
  const progression = progressionNote(estimate);
  const note = (estimate.source === "cross-exercise-estimate" ? def.note + L("; odhad z ", "; estimated from ") + estimate.referenceExercise + L(", ověř RPE", ", check the RPE") : def.note) + (progression ? "; " + progression : "") + (firstSession ? "; " + FIRST_SESSION_NOTE() : estimate.source === "catalogue-default" && kg != null ? "; " + NEW_EXERCISE_NOTE() : "");
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
    const e = weeks.get(w) || { sets: 0, days: new Set(), marked: false }; e.sets++; e.days.add(dateKey(r.workout_date)); if (/odlehčen|deload/i.test(String(r.note || ""))) e.marked = true; weeks.set(w, e);
  }
  const last = [1, 2, 3, 4].map(k => weeks.get(new Date(Date.parse(thisWeek + "T12:00:00Z") - k * 7 * DAY).toISOString().slice(0, 10)));
  if (last.some(w => !w || w.days.size < 2)) return null;
  // A lighter week among them (a deload, marked or with clearly fewer sets per session) resets the count.
  const perDay = last.map(w => w.sets / w.days.size), median = [...perDay].sort((a, b) => a - b).slice(1, 3).reduce((a, b) => a + b, 0) / 2;
  if (last.some(w => w.marked) || perDay.some(v => v < median * 0.85)) return null;
  return { weeks: 4, reason: L("Čtyři týdny po sobě s plným tréninkem: tento týden je odlehčený (méně sérií, stejná váha, RPE do 7), aby se síla mohla projevit.", "Four full training weeks in a row: this is a deload week (fewer sets, same weight, RPE up to 7) so the strength you've built can show.") };
}
// Dumbbell exercises ask for a dumbbell the athlete has: the nearest of their
// weights (kg per hand), the lighter one when two are as near.
export function snapDumbbells(rows, weights) {
  const have = (Array.isArray(weights) ? weights : []).map(Number).filter(kg => kg > 0).sort((a, b) => a - b);
  if (!have.length) return rows;
  for (const row of rows) {
    if (EXERCISE_INTELLIGENCE[row[1]]?.loadUnit !== "per_hand_kg") continue;
    const kg = Number(String(row[3] ?? "").replace(",", "."));
    if (!(kg > 0)) continue;
    const best = have.reduce((a, b) => Math.abs(b - kg) < Math.abs(a - kg) ? b : a);
    row[3] = String(best).replace(".", ",");
  }
  return rows;
}

// A saved or shared workout (workout-templates.js) planned for the athlete:
// its exercises, order, sets and repetitions stay; the loads come from the
// athlete's own history and today's readiness, as in a generated plan. An
// exercise outside the catalogue keeps its sets with no load.
export function templateStrengthPlan(context, template, options = {}) {
  const policy = trainingStatus(context?.athleteState);
  if (policy.paused) throw new Error(policy.headline + '. ' + policy.guidance[0]);
  const factor = recoveryFactor(context), history = context?.strength?.recentCompletedSets || [], historyMap = recentExerciseMap(history);
  const firstSession = !history.length, sex = athleteSex(context, options);
  const rows = [], loadEstimates = [];
  let warmedUp = false;
  for (const item of template.exercises || []) {
    const exercise = EXERCISES[item.name] ? item.name : normalizeExerciseName(item.name);
    const sets = Math.max(1, Math.min(10, Number(item.sets) || 3)), reps = String(item.reps || '10');
    if (!EXERCISES[exercise]) {
      // An exercise the app doesn't know has no weight to start from: the
      // first set is a test set, and its weight sets the rest.
      rows.push(["WORK", item.name, "1", "", reps, "", "", "", "FALSE", TEST_SET_NOTE(), "🎥 Video", "", DEFAULT_EXECUTION]);
      for (let i = 1; i < sets; i++) rows.push(["WORK", item.name, String(i + 1), "", reps, "", "", "", "FALSE", L("váhu podle zkušební série", "weight from the test set"), "", "", DEFAULT_EXECUTION]);
      continue;
    }
    const work = workRows(exercise, historyMap, factor, false, new Map(), 1, 10, sex, context.date, firstSession, reps, 'auto', '', context?.trainingSetup?.dumbbellWeights);
    const first = work.rows[0];
    const own = Array.from({ length: sets }, (_, i) => { const r = first.slice(); r[2] = String(i + 1); r[4] = CORE_PATTERNS.has(EXERCISES[exercise].pattern) ? first[4] : reps; r[10] = i === 0 ? first[10] : ""; return r; });
    const warmup = warmupRows(exercise, work.kg, !warmedUp);
    if (warmup.length) warmedUp = true;
    rows.push(...warmup, ...own);
    loadEstimates.push({ exercise, sets, ...work.estimate });
  }
  if (!rows.some(r => r[0] === 'WORK')) throw new Error(L('Trénink nemá žádný cvik.', 'The workout has no exercise.'));
  configureStrengthCoaching(rows, EXERCISES, { factor, recoveryScore: context?.adaptive?.recovery?.score ?? null, firstSession });
  const timing = estimateStrengthTiming(rows, EXERCISES, 600);
  snapDumbbells(rows, context?.trainingSetup?.dumbbellWeights);
  const from = String(options.fromName || '').trim();
  const rationale = (from ? L('Trénink ti posílá ' + from + '. ', from + ' sent you this workout. ') : '') + L('Cviky, série a opakování zůstaly, váhy jsou podle tvých tréninků a dnešní připravenosti.', 'The exercises, sets and reps stay; the weights follow your own workouts and today\'s readiness.') + (firstSession ? ' ' + L('První trénink v aplikaci: váhy jsou opatrný odhad, uprav je tak, aby ti zbyla 2–3 opakování v rezervě.', 'Your first workout in the app: the weights are a careful estimate; adjust them so you keep 2–3 reps in reserve.') : '');
  return { date: context.date, planName: String(template.name || L('Trénink', 'Workout')).slice(0, 80), deload: null, rationale, timing, focusMuscles: [], loadFactor: factor, protectedLegs: false, recentCompletedSets: history.length, loadEstimates, rows, template: true };
}

export function generateStrengthPlan(context, options = {}) {
  const policy=trainingStatus(context?.athleteState);
  // The gateway explicitly marks its read-only deployment diagnostic; ordinary
  // gym requests and previews still obey the athlete's status.
  if(policy.paused&&!options.diagnosticPreview)throw new Error(policy.headline+'. '+policy.guidance[0]);
  // A red morning or signs of illness (breathing or temperature raised in
  // sleep, a sick check-in) leave the gym out today, as the ride and the run
  // (Revize doporučování tréninků 2026-10-16, nález 22).
  const today=context?.adaptive?.recovery,ill=(today?.flags||[]).some(f=>/^(respiration|skin_temp|wrist_temp)_elevated$/.test(f))||context?.checkin==='sick';
  if(!options.diagnosticPreview&&(today?.zone==='red'||ill))throw new Error(ill?L('Dech nebo teplota ve spánku jsou vyšší než obvykle, může jít o začátek nemoci. Posilovnu dnes vynech, nanejvýš lehké protažení.','Your breathing or temperature in sleep is higher than usual, which may be an oncoming illness. Skip the gym today, at most some easy stretching.'):L('Připravenost je dnes nízká (červená zóna). Posilovnu dnes vynech, nanejvýš lehké protažení.','Readiness is low today (red zone). Skip the gym today, at most some easy stretching.'));
  options = { ...options, focus: normalizeGymFocus(options.focus) };
  const pain = painfulExercises(context?.athleteState?.memories);
  if (pain.avoid.size) options = { ...options, excludeExercises: [...(options.excludeExercises || []), ...pain.avoid] };
  // The shared recovery week decides when it is known; four solid gym weeks
  // in a row are the fallback for athletes without Intervals.icu loads.
  const shared = context?.recoveryWeek;
  const deload = options.noDeload ? null : shared?.recovery ? { shared: true, reason: L("Regenerační týden pro celý trénink (" + (shared.reason === "three_weeks" ? "po třech týdnech nad udržovací zátěží" : shared.reason === "hrv_trend" ? "HRV za poslední týden pod tvým běžným pásmem" : "po náročném týdnu") + "): posilovna je odlehčená – méně sérií, váha se drží, RPE do 7.", "Recovery week for all training (" + (shared.reason === "three_weeks" ? "after three weeks above maintenance load" : shared.reason === "hrv_trend" ? "HRV over the last week below your usual range" : "after a hard week") + "): the gym is lighter – fewer sets, weights held, RPE up to 7.") } : shared?.known ? null : strengthDeload(context?.strength?.recentCompletedSets, context.date);
  // A deload week holds the loads (no increase, no set to failure).
  const chosen = choosePlan(context, options), factor = deload ? Math.min(recoveryFactor(context), 0.89) : recoveryFactor(context), history = context?.strength?.recentCompletedSets || [], historyMap = recentExerciseMap(history);
  const firstSession = !history.length;
  const focusMuscles = options.focusMuscles == null ? null : validateFocusMuscles(options.focusMuscles);
  const planPhase = !focusMuscles && options.planPhase?.exercises?.length ? options.planPhase : null;
  if (options.focusMuscles != null && !focusMuscles) throw new Error(L('Vyber 1 až 5 známých partií.', 'Choose 1 to 5 known muscle groups.'));
  const excluded = new Set((options.excludeExercises || []).map(normalizeExerciseName));
  const { liked, disliked } = taste(options);
  const selection = selectionHistory(context);
  const weeklyExposure = recentMuscleExposure(selection, context.date);
  const weeklyLoad = recentMuscleLoad(selection, context.date);
  const lastExerciseDate = new Map();
  for (const row of selection) {
    const exercise = normalizeExerciseName(row.exercise), date = dateKey(row.workout_date);
    if (exercise && date && (!lastExerciseDate.has(exercise) || daysBetween(date, context.date) < daysBetween(lastExerciseDate.get(exercise), context.date))) lastExerciseDate.set(exercise, date);
  }
  const stalled = stalledExercises(history, context.date), stallSwaps = { ...(chosen.stallSwaps || {}) };
  // The group's exercises, best first (the first one may carry a stall swap).
  const rankedExercises = group => {
    const candidates = withoutDisliked(FOCUS_GROUPS[group].exercises.filter(name => EXERCISES[name] && availableAt(name) && fitsEquipment(name,context.trainingSetup) && !excluded.has(name)), disliked);
    if (!candidates.length) throw new Error(L('Pro partii ' + FOCUS_GROUPS[group].label + ' není dostupný cvik.', 'No exercise is available for ' + FOCUS_GROUPS[group].label + '.'));
    const score = (name, withStall = true) => {
      const def = EXERCISES[name], last = lastExerciseDate.get(name);
      const recent = last && daysBetween(last, context.date) < 5 ? 2 : 0;
      const legPenalty = chosen.protectedLegs && ['quads', 'hamstrings', 'hips'].includes(group) ? def.fatigue * 2 : 0;
      // The group's list is curated main movement first (hip thrust before
      // abduction), so its order breaks near ties.
      const order = FOCUS_GROUPS[group].exercises.indexOf(name) * .05;
      return recent + (weeklyExposure.get(def.muscle) || 0) * .3 + (weeklyLoad.get(def.muscle) || 0) * .2 + legPenalty + def.fatigue * .1 + order + (withStall && stalled.has(name) ? 3 : 0) - (liked.has(name) ? LIKED_BONUS : 0);
    };
    const ranked = candidates.slice().sort((a, b) => score(a) - score(b)), best = ranked[0], plain = candidates.slice().sort((a, b) => score(a, false) - score(b, false))[0];
    if (plain !== best && stalled.has(plain)) stallSwaps[best] = plain;
    return ranked;
  };
  const maxExercises = Number(options.maxExercises) || exerciseCountFor(options.durationMinutes);
  let exercises;
  if (focusMuscles) {
    // Chosen groups fill the session's length: the best exercise of each group
    // first, then the next ones in turn (95 minutes of glutes, biceps and rear
    // delts is 8 exercises, not 3). The timing check below trims any excess.
    // Legs kept fresh for a key ride get their one best exercise, no more.
    const ranked = focusMuscles.map(group => chosen.protectedLegs && ['quads', 'hamstrings', 'hips', 'calves'].includes(group) ? rankedExercises(group).slice(0, 1) : rankedExercises(group)), next = ranked.map(() => 0);
    exercises = [];
    const total = Math.max(focusMuscles.length, maxExercises);
    for (let added = true; added && exercises.length < total;) {
      added = false;
      for (let g = 0; g < ranked.length && exercises.length < total; g++) {
        while (next[g] < ranked[g].length && exercises.includes(ranked[g][next[g]])) next[g]++;
        if (next[g] < ranked[g].length) { exercises.push(ranked[g][next[g]++]); added = true; }
      }
    }
  } else if (planPhase) {
    // A training plan's phase (training-plans.js): its exercises, each the first
    // of its alternatives the athlete's equipment allows.
    exercises = [...new Set(planPhase.exercises.map(slot => [].concat(slot).find(name => EXERCISES[name] && availableAt(name) && fitsEquipment(name, context.trainingSetup) && !excluded.has(name) && !disliked.has(name))).filter(Boolean))].slice(0, maxExercises);
  } else {
    exercises = chosen.exercises.filter(ex => !excluded.has(ex)&&fitsEquipment(ex,context.trainingSetup)).slice(0, maxExercises);
  }

  // A main exercise with variants (variantOf): the same one for five weeks,
  // then the next one the athlete's equipment allows.
  const fits = name => availableAt(name) && fitsEquipment(name, context.trainingSetup) && !excluded.has(name) && !disliked.has(name);
  exercises = [...new Set(exercises.map(ex => variantFor(ex, context.date, fits)))];

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
  const experience = context.trainingSetup?.experience || '', chosenGoal = STRENGTH_GOALS.includes(context.trainingSetup?.goal) ? context.trainingSetup.goal : 'auto';
  const sport = context.profile?.mainSport || context.trainingSetup?.history?.mainSport || '';
  const goal = planPhase ? 'auto' : chosenGoal === 'auto' ? recommendedGoal(sport, experience) : chosenGoal;
  const maxSets = Math.min(experience==='beginner'?2:Number(options.durationMinutes) > 0 && Number(options.durationMinutes) <= 45 ? 2 : Number(options.durationMinutes) > 0 && Number(options.durationMinutes) <= 60 ? 3 : 4, goal === 'fitness' ? 3 : 4);
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
    const cap=Math.min(reducedDose?Math.min(2,maxSets):moderated?Math.min(3,maxSets):maxSets,planPhase?.sets||4);
    const work = workRows(exercise, historyMap, reducedDose||moderated?factor*.9:factor, chosen.protectedLegs&&!explicitLegs, muscleLoad, volumeModifier, cap, athleteSex(context, options), context.date, firstSession, planPhase?.reps||null, goal, experience, context?.trainingSetup?.dumbbellWeights);
    if(planPhase)for(const row of work.rows)row[9]+=L('; '+planPhase.phaseName+': RPE '+planPhase.rpe,'; '+planPhase.phaseName+': RPE '+planPhase.rpe);
    if(reducedDose)for(const row of work.rows)row[9]+=L('; sportovní zátěž: nejvýše 2 pracovní série, nech si 3–4 opakování v rezervě (RPE 6–7)','; load from other sports: at most 2 work sets, keep 3–4 reps in reserve (RPE 6–7)');
    // One instruction per set: the deload's reserve replaces "one more rep".
    if(deload)for(const row of work.rows)row[9]=row[9].replace(/ – (?:cíl: o opakování víc|goal: one more rep)/,'')+L('; odlehčený týden: stejná váha, 3 opakování v rezervě','; deload week: same weight, 3 reps in reserve');
    if(moderated)for(const row of work.rows)row[9]+=explicitLegs?L('; blízko je náročný trénink: nech si 2–3 opakování v rezervě (RPE 7)','; a hard session is coming up: keep 2–3 reps in reserve (RPE 7)'):L('; nohy po vytrvalostním tréninku: nech si 2–3 opakování v rezervě (RPE 7)','; legs after endurance training: keep 2–3 reps in reserve (RPE 7)');
    if(stallSwaps[exercise])for(const row of work.rows)row[9]+=L('; místo '+stallSwaps[exercise]+': 3 tréninky bez posunu, nový podnět (k původnímu cviku se vrátíme)','; instead of '+stallSwaps[exercise]+': 3 sessions without progress, a new stimulus (we\'ll return to the original exercise)');
    const warmup = warmupRows(exercise, work.kg, !warmedUp);
    if (warmup.length) warmedUp = true;
    rows.push(...warmup, ...work.rows);
    loadEstimates.push({ exercise, sets: work.sets, reducedDose, moderated, ...work.estimate });
  }
  const requestedMinutes = Number(options.durationMinutes) > 0 ? Number(options.durationMinutes) : Math.max(60, (Number(options.maxExercises) || 5) * 12);
  const configure = () => configureStrengthCoaching(rows, EXERCISES, { factor, muscleLoad, protectedLegs: chosen.protectedLegs, recoveryScore: context?.adaptive?.recovery?.score ?? null, firstSession: firstSession || experience === 'beginner', goal });
  configure();
  // The warm-up before and the stretching after (each on unless turned off in
  // Posilovna) come on top of the chosen time, which is for the lifting.
  const withWarmup = context.trainingSetup?.warmup !== false, withStretching = context.trainingSetup?.stretching !== false;
  const muscleOf = name => EXERCISES[name]?.muscle;
  let warmup = null, stretching = null;
  const size = routineSize(requestedMinutes);
  const routinesNow = () => { warmup = withWarmup ? warmupFor(rows, muscleOf, { ...size.warmup, cardio: context.trainingSetup?.warmupCardio !== false }) : null; stretching = withStretching ? stretchingFor(rows, muscleOf, size.stretching) : null; };
  routinesNow();
  const measure = () => estimateStrengthTiming(rows, EXERCISES, requestedMinutes);
  let timing = measure();
  while (timing.totalSeconds > requestedMinutes * 60) {
    // Take a set from the exercise with the most sets (the later one on a tie),
    // so the volume stays even instead of one exercise keeping four sets.
    const names = [...new Set(rows.filter(r => r[0] === 'WORK').map(r => r[1]))];
    const count = name => rows.filter(r => r[0] === 'WORK' && r[1] === name).length;
    const removable = names.slice().reverse().filter(name => count(name) > (focusMuscles ? 1 : 2)).sort((a, b) => count(b) - count(a))[0];
    if (removable) rows.splice(rows.findLastIndex(r => r[0] === 'WORK' && r[1] === removable), 1);
    else if (!focusMuscles && names.length > 1) { const last = names.at(-1); for (let i = rows.length - 1; i >= 0; i--) if (rows[i][1] === last) rows.splice(i, 1); }
    else throw new Error(L('Zvolené partie se s rozcvičením a pauzami nevejdou do ' + requestedMinutes + ' minut. Vyber méně partií nebo delší čas.', 'The chosen muscle groups with warm-up and rests don\'t fit into ' + requestedMinutes + ' minutes. Choose fewer groups or more time.'));
    configure(); routinesNow(); timing = measure();
  }
  for (let i = loadEstimates.length - 1; i >= 0; i--) {
    loadEstimates[i].sets = rows.filter(r => r[0] === 'WORK' && r[1] === loadEstimates[i].exercise).length;
    if (!loadEstimates[i].sets) loadEstimates.splice(i, 1);
  }
  const focusLabels = focusMuscles?.map(id => FOCUS_GROUPS[id].label).join(', ');
  const legCaution = explicitLegs && nearRide.protect;
  const cautionText = legCaution ? nearRide.reason + L(' Nohy proto mají nejvýše 3 série a je potřeba u nich držet rezervu 2–3 opakování.', ' So the legs get at most 3 sets and you should keep 2–3 reps in reserve on them.') : '';
  const baseRationale = focusMuscles ? L('Zvolené partie: ', 'Chosen muscle groups: ') + focusLabels + L('. Cviky zohledňují nedávné posilování, regeneraci a cyklistickou zátěž. ', '. The exercises take recent strength work, recovery and cycling load into account. ') + cautionText : chosen.rationale + (cautionText ? ' ' + cautionText : '');
  const fmtDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString(L('cs-CZ', 'en-GB'), { weekday: 'short', day: 'numeric', month: L('numeric', 'short'), timeZone: 'UTC' });
  const nearby = (chosen.plannedSessions || []).map(x => fmtDay(x.date).replace(/\.$/, ''));
  const swapped = Object.entries(stallSwaps).filter(([ex]) => rows.some(r => r[1] === ex)).map(([ex, old]) => old + ' → ' + ex);
  const extraMinutes = [warmup && [L('rozcvička', 'warm-up'), warmup.minutes], stretching && [L('protažení', 'stretching'), stretching.minutes]].filter(Boolean);
  const extraText = extraMinutes.length ? L(' Navíc ', ' On top: ') + extraMinutes.map(([name, min]) => name + ' ' + min + ' min').join(L(' a ', ' and ')) + '.' : '';
  const goalLine = {
    strength: L('síla: hlavní cviky v nižším počtu opakování s delší pauzou', 'strength: the main lifts in fewer reps with longer rests'),
    strength_muscle: L('síla a svaly: těžší hlavní cviky, doplňky ve středním rozsahu', 'strength and muscle: heavier main lifts, accessories in the middle range'),
    muscle: L('svaly: střední rozsah opakování', 'muscle: the middle rep range'),
    muscle_fitness: L('svaly a kondice: víc opakování a kratší pauzy', 'muscle and fitness: more reps and shorter rests'),
    fitness: L('kondice: hodně opakování a krátké pauzy', 'fitness: many reps and short rests')
  }[goal];
  const goalText = goalLine ? (chosenGoal === 'auto' ? L('Cíl podle tvého sportu – ', 'Goal from your sport – ') : L('Cíl ', 'Goal ')) + goalLine + '. ' : '';
  const rationale = goalText + (firstSession ? L('První trénink v aplikaci: váhy jsou opatrný odhad a žádná série nejde do selhání; po zapsání skutečných vah se další trénink řídí tvými výkony. ', 'Your first workout in the app: weights are a careful estimate and no set goes to failure; once you log your actual weights, the next workout follows your performance. ') : '') + baseRationale + (pain.parts.length ? L(' Podle toho, co si trenér pamatuje o bolesti (' + pain.parts.join(', ') + '), vynechávám cviky, které ji zatěžují.', ' From what the coach remembers about pain (' + pain.parts.join(', ') + '), I leave out exercises that load it.') : '') + (sportLoad.size?L(' Zátěž z ostatních sportů upravuje dávku zapojených svalů; nenahrazuje jejich silový trénink.', ' Load from other sports adjusts the dose for the muscles involved; it doesn\'t replace their strength training.'):'') + (nearby.length ? L(' Cviky se liší od plánu na ' + nearby.join(' a ') + '.', ' The exercises differ from the plan for ' + nearby.join(' and ') + '.') : '') + (swapped.length ? L(' Po třech trénincích bez posunu nová varianta: ', ' A new variant after three sessions without progress: ') + swapped.join(', ') + '.' : '');
  snapDumbbells(rows, context?.trainingSetup?.dumbbellWeights);
  if(!rows.some(r=>r[0]==='WORK'))throw new Error(L('Pro toto vybavení nebyl nalezen vhodný cvik. Uprav vybavení v průvodci.', 'No suitable exercise was found for this equipment. Adjust your equipment in the setup guide.'));
  return { date: context.date, planName: (focusMuscles ? L('Cílený trénink · ', 'Targeted workout · ') + focusLabels : planPhase ? planPhase.name : chosen.name) + (deload ? L(' · odlehčený týden', ' · deload week') : ''), deload, rationale: (deload ? deload.reason + ' ' : '') + (planPhase ? planPhase.rationale + ' ' : '') + rationale + L(' Časový plán: přibližně ' + timing.estimatedMinutes + ' z ' + requestedMinutes + ' minut včetně rozcvičení, pauz, nastavování strojů a rezervy.', ' Time plan: about ' + timing.estimatedMinutes + ' of ' + requestedMinutes + ' minutes including warm-up, rests, machine setup and a buffer.') + extraText, timing: { ...timing, routineSeconds: (warmup?.seconds || 0) + (stretching?.seconds || 0) }, warmup, stretching, goal, focusMuscles: focusMuscles || [], loadFactor: factor, protectedLegs: chosen.protectedLegs, recentCompletedSets: history.length, recentCompletedWorkoutCount: chosen.recentWorkoutCount, balance:{sportMuscleLoad:Object.fromEntries(sportLoad),strengthCoverage:strengthCoverage(context,EXERCISES)}, adaptive: { volumeModifier, recoveryScore: context?.adaptive?.recovery?.score ?? null, legReadiness: context?.adaptive?.legReadiness ?? null }, loadEstimates, rows };
}

export { EXERCISES };
