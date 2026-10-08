import { L } from "./lang.js";

// Equipment a strength plan can use. Each athlete ticks what their gym or home
// has ("Moje vybavení" next to the gym plan's Generovat); the generator, the
// exercise picker, the replacements and the AI coach's swaps only use
// exercises whose every station is ticked. The list began as the equipment of
// METAGYM Kutná Hora (checked 2026-10-01) and keeps those ids; the names are
// generic so any gym's machines fit them.
export const EQUIPMENT_ZONES = [
  { id: "free", cs: "Volné váhy a lavice", en: "Free weights and benches" },
  { id: "legs", cs: "Nohy a hýždě", en: "Legs and glutes" },
  { id: "upper", cs: "Záda a ramena", en: "Back and shoulders" },
  { id: "chest", cs: "Prsa a kladky", en: "Chest and cables" },
  { id: "core", cs: "Střed těla", en: "Core" }
];
export const EQUIPMENT = [
  { id: "floor_mats", zone: "free", cs: "Podložka na zem", en: "Floor mat" },
  { id: "dumbbells", zone: "free", cs: "Jednoručky", en: "Dumbbells" },
  { id: "adjustable_bench", zone: "free", cs: "Polohovací lavice", en: "Adjustable bench" },
  { id: "barbells", zone: "free", cs: "Osa s kotouči", en: "Barbell and plates" },
  { id: "bench_press", zone: "free", cs: "Lavice na benchpress se stojany", en: "Bench press bench with rack" },
  { id: "squat_rack", zone: "free", cs: "Klec nebo stojany na dřepy", en: "Squat rack or power rack" },
  { id: "smith_machine", zone: "free", cs: "Smith stroj", en: "Smith machine" },
  { id: "pivot_leg_press", zone: "legs", cs: "Leg press", en: "Leg press" },
  { id: "pendulum_squat", zone: "legs", cs: "Pendulum nebo hack dřep", en: "Pendulum or hack squat" },
  { id: "leg_extension", zone: "legs", cs: "Předkopávání (leg extension)", en: "Leg extension machine" },
  { id: "prone_leg_curl", zone: "legs", cs: "Zakopávání (leg curl)", en: "Leg curl machine" },
  { id: "hip_thrust", zone: "legs", cs: "Stroj na hip thrust", en: "Hip thrust machine" },
  { id: "adduction_abduction", zone: "legs", cs: "Stroj na přitahování a roznožování", en: "Adduction / abduction machine" },
  { id: "calf_raise", zone: "legs", cs: "Stroj na lýtka", en: "Calf raise machine" },
  { id: "lat_pulldown_low_row", zone: "upper", cs: "Horní a spodní kladka (stahování, přítahy vsedě)", en: "Lat pulldown and seated row" },
  { id: "standing_row", zone: "upper", cs: "Stroj na přítahy (row)", en: "Row machine" },
  { id: "shoulder_press", zone: "upper", cs: "Stroj na tlaky na ramena", en: "Shoulder press machine" },
  { id: "multi_flight", zone: "upper", cs: "Stroj na upažování", en: "Lateral raise machine" },
  { id: "pec_deck", zone: "upper", cs: "Pec deck (rozpažování, zadní ramena)", en: "Pec deck / rear delt machine" },
  { id: "chest_press", zone: "chest", cs: "Stroj na tlaky na prsa", en: "Chest press machine" },
  { id: "cables", zone: "chest", cs: "Kladky (kabelová věž, crossover)", en: "Cable station (crossover)" },
  { id: "abs_bench", zone: "core", cs: "Lavice na břicho", en: "Abs bench" },
  { id: "roman_chair", zone: "core", cs: "Roman chair (hyperextenze)", en: "Roman chair (back extension)" }
];
const BY_ID = new Map(EQUIPMENT.map(e => [e.id, e]));
export const ALL_STATIONS = EQUIPMENT.map(e => e.id);
// Quick choices in the equipment sheet. "gym" is the whole list: everything
// the app had before the choice existed.
export const EQUIPMENT_PRESETS = {
  bodyweight: ["floor_mats"],
  dumbbells: ["floor_mats", "dumbbells", "adjustable_bench"],
  gym: ALL_STATIONS
};

// Known ids only, once each, in the list's order; null when it is not a list.
export function normalizeStations(list) {
  if (!Array.isArray(list)) return null;
  const chosen = new Set(list.map(String));
  return ALL_STATIONS.filter(id => chosen.has(id));
}
export function presetOf(stations) {
  const list = normalizeStations(stations) || [];
  return Object.entries(EQUIPMENT_PRESETS).find(([, ids]) => ids.length === list.length && ids.every(id => list.includes(id)))?.[0] || "custom";
}
export const equipmentLabel = id => { const e = BY_ID.get(id); return e ? L(e.cs, e.en) : null; };

// Where each catalog exercise is done.
export const EXERCISE_STATIONS = {
  "DB bench press": ["dumbbells", "adjustable_bench"],
  "Barbell bench press": ["bench_press", "barbells"],
  "DB incline press": ["dumbbells", "adjustable_bench"],
  "Chest flat press Prime": ["chest_press"],
  "Pec deck": ["pec_deck"],
  "Low row": ["lat_pulldown_low_row"],
  "Standing rowing machine": ["standing_row"],
  "One-arm DB row": ["dumbbells", "adjustable_bench"],
  "Lat pulldown": ["lat_pulldown_low_row"],
  "Cable pullover": ["cables"],
  "DB shoulder press": ["dumbbells", "adjustable_bench"],
  "Shoulder press Prime": ["shoulder_press"],
  "Standing multi flight": ["multi_flight"],
  "Cable lateral raise": ["cables"],
  "Rear delt pec deck": ["pec_deck"],
  "Cable rear delt fly": ["cables"],
  "Face pull": ["cables"],
  "Cable curl": ["cables"],
  "DB curl": ["dumbbells"],
  "Hammer curl": ["dumbbells"],
  "Cable triceps extension": ["cables"],
  "Cable overhead triceps extension": ["cables"],
  "Pivot leg press": ["pivot_leg_press"],
  "Pendulum squat": ["pendulum_squat"],
  "Leg extension Prime": ["leg_extension"],
  "Goblet squat": ["dumbbells"],
  "Dead bug": ["floor_mats"], "Push-up": ["floor_mats"], "Bodyweight squat": ["floor_mats"], "Glute bridge": ["floor_mats"],
  "DB Bulgarian split squat": ["dumbbells", "adjustable_bench"],
  "Prone leg curl Prime": ["prone_leg_curl"],
  "Hip thrust": ["hip_thrust"],
  "DB Romanian deadlift": ["dumbbells"],
  "Barbell Romanian deadlift": ["barbells"],
  "Adduction machine": ["adduction_abduction"],
  "Abduction machine": ["adduction_abduction"],
  "Standing calf raise": ["calf_raise"],
  "Abs bench crunch": ["abs_bench"],
  "Cable crunch": ["cables"],
  "Pallof press": ["cables"],
  "Cable woodchop": ["cables"],
  "Roman chair": ["roman_chair"],
  "Cable glute kickback": ["cables"],
  "Cable pull-through": ["cables"],
  "Cable hip abduction": ["cables"],
  "Barbell hip thrust": ["barbells", "adjustable_bench", "floor_mats"],
  "DB reverse lunge": ["dumbbells"],
  "DB step-up": ["dumbbells", "adjustable_bench"],
  "DB single-leg Romanian deadlift": ["dumbbells"],
  "DB sumo squat": ["dumbbells"],
  "Leg press high feet": ["pivot_leg_press"],
  "Abduction machine forward lean": ["adduction_abduction"],
  "Glute hyperextension": ["roman_chair"],
  "Cable fly": ["cables"],
  "Low-to-high cable fly": ["cables"],
  "Single-arm cable row": ["cables"],
  "Close-grip lat pulldown": ["lat_pulldown_low_row"],
  "Wide-grip low row": ["lat_pulldown_low_row"],
  "Barbell row": ["barbells"],
  "DB lateral raise": ["dumbbells"],
  "DB Arnold press": ["dumbbells", "adjustable_bench"],
  "DB rear delt fly": ["dumbbells", "adjustable_bench"],
  "DB incline curl": ["dumbbells", "adjustable_bench"],
  "Cable rope hammer curl": ["cables"],
  "Cable triceps kickback": ["cables"],
  "DB overhead triceps extension": ["dumbbells", "adjustable_bench"],
  "Single-leg calf raise": ["dumbbells"],
  "Barbell back squat": ["squat_rack", "barbells"],
  "Barbell front squat": ["squat_rack", "barbells"],
  "Smith machine squat": ["smith_machine"],
  "Smith machine split squat": ["smith_machine", "adjustable_bench"],
  "Smith machine hip thrust": ["smith_machine", "adjustable_bench"],
  "Smith machine incline press": ["smith_machine", "adjustable_bench"],
  "Barbell overhead press": ["squat_rack", "barbells"],
  "DB wrist curl": ["dumbbells", "adjustable_bench"],
  "DB reverse wrist curl": ["dumbbells", "adjustable_bench"],
  "Cable reverse curl": ["cables"],
  "DB shrug": ["dumbbells"],
  "Barbell shrug": ["squat_rack", "barbells"],
  "Smith machine shrug": ["smith_machine"],
  "Cable upright row": ["cables"],
  "Barbell good morning": ["squat_rack", "barbells"]

};

export function stationLabel(exercise) {
  return (EXERCISE_STATIONS[exercise] || []).map(equipmentLabel).filter(Boolean).join(" + ") || null;
}
// Whether every station of the exercise is in the athlete's equipment (a list
// or a Set of ids; the whole list when not given).
export function availableAt(exercise, stations = ALL_STATIONS) {
  const needed = EXERCISE_STATIONS[exercise], has = stations instanceof Set ? id => stations.has(id) : id => stations.includes(id);
  return Boolean(needed?.length) && needed.every(has);
}
// The stations of a training setup; the whole list when nothing is known.
export function stationsOf(setup) {
  return new Set(normalizeStations(setup?.stations) || EQUIPMENT_PRESETS[setup?.equipment] || ALL_STATIONS);
}
