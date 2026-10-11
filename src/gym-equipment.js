import { L } from "./lang.js";

// Equipment of the gym the plans are built for. METAGYM Kutná Hora
// (https://metagym.cz/kutnahora, checked 2026-10-01; the squat rack and the
// Smith machine confirmed by the athlete 2026-10-03): every exercise in the
// strength catalog must be possible on one of these stations.
export const METAGYM_KUTNA_HORA = {
  id: "metagym-kutna-hora",
  name: "METAGYM Kutná Hora",
  url: "https://metagym.cz/kutnahora",
  stations: {
    dumbbells: { label: "Činkárna – sada jednoruček", zone: "Volné váhy a lavice" },
    adjustable_bench: { label: "Polohovací lavice (5×)", zone: "Volné váhy a lavice" },
    bench_press: { label: "Benchpress flat", zone: "Volné váhy a lavice" },
    barbells: { label: "Stojan na rovné osy + trny na kotouče", zone: "Volné váhy a lavice" },
    squat_rack: { label: "Klec na dřepy (power rack)", zone: "Volné váhy a lavice" },
    smith_machine: { label: "Smith stroj", zone: "Volné váhy a lavice" },
    floor_mats: { label: "Podložky na zem", zone: "Volné váhy a lavice" },
    pendulum_squat: { label: "Pendulum squat", zone: "Nohy a hýždě" },
    hip_thrust: { label: "Hip thrust", zone: "Nohy a hýždě" },
    pivot_leg_press: { label: "Pivot leg press", zone: "Nohy a hýždě" },
    leg_extension: { label: "Leg extension Prime", zone: "Nohy a hýždě" },
    prone_leg_curl: { label: "Prone leg curl Prime", zone: "Nohy a hýždě" },
    calf_raise: { label: "Lýtka v polostoji", zone: "Nohy a hýždě" },
    adduction_abduction: { label: "Adduction / abduction", zone: "Nohy a hýždě" },
    lat_pulldown_low_row: { label: "Lat pulldown / low row", zone: "Záda a ramena" },
    standing_row: { label: "Rowing stroj na záda vestoje", zone: "Záda a ramena" },
    shoulder_press: { label: "Shoulder press Prime", zone: "Záda a ramena" },
    multi_flight: { label: "Standing multi flight (roztahování na ramena)", zone: "Záda a ramena" },
    pec_deck: { label: "Pec deck / rear delt", zone: "Záda a ramena" },
    chest_press: { label: "Chest flat press Prime", zone: "Prsa a kladky" },
    cables: { label: "Multi-station kladky (5×)", zone: "Prsa a kladky" },
    abs_bench: { label: "Abs lavička", zone: "Střed těla" },
    roman_chair: { label: "Roman chair", zone: "Střed těla" },
    treadmill: { label: "Běžecký pás (2×)", zone: "Kardio" },
    stairmaster: { label: "Stairmaster", zone: "Kardio" }
  }
};

// Equipment other gyms and home gyms usually have, beyond Kutná Hora: the
// athlete can mark it (src/gym-equipment-ai.js GYM_STATIONS lists it with the
// Kutná Hora stations). Ids are stored in the athlete's setup: keep them stable.
// Not added because Kutná Hora's station covers it: a 45° leg press (leg press),
// a lateral raise machine (multi flight), a pec fly machine (pec deck) and a 45°
// back extension (roman chair).
export const OTHER_STATIONS = {
  pullup_bar: { group: "Volné váhy", label: "Hrazda", en: "Pull-up bar" },
  dip_bars: { group: "Volné váhy", label: "Bradla", en: "Dip bars" },
  kettlebells: { group: "Volné váhy", label: "Kettlebelly", en: "Kettlebells" },
  ez_bar: { group: "Volné váhy", label: "EZ osa", en: "EZ bar" },
  incline_bench_press: { group: "Volné váhy", label: "Šikmá lavice s osou (incline bench)", en: "Incline bench press" },
  preacher_bench: { group: "Volné váhy", label: "Scottova lavice", en: "Preacher bench" },
  trap_bar: { group: "Volné váhy", label: "Trap bar (šestihranná osa)", en: "Trap bar" },
  landmine: { group: "Volné váhy", label: "Landmine (ukotvení osy)", en: "Landmine" },
  plyo_box: { group: "Volné váhy", label: "Plyo box (bedna)", en: "Plyo box" },
  medicine_ball: { group: "Volné váhy", label: "Medicinbal", en: "Medicine ball" },
  resistance_bands: { group: "Volné váhy", label: "Odporové gumy", en: "Resistance bands" },
  suspension_trainer: { group: "Volné váhy", label: "Závěsný systém (TRX)", en: "Suspension trainer (TRX)" },
  assisted_pullup_dip: { group: "Záda a ramena", label: "Asistovaný stroj na shyby a kliky na bradlech", en: "Assisted pull-up / dip machine" },
  t_bar_row: { group: "Záda a ramena", label: "T-bar přítah", en: "T-bar row" },
  chest_supported_row: { group: "Záda a ramena", label: "Přítahy s oporou hrudníku (stroj)", en: "Chest-supported row machine" },
  hack_squat: { group: "Nohy a hýždě", label: "Hack dřep (stroj)", en: "Hack squat machine" },
  seated_leg_curl: { group: "Nohy a hýždě", label: "Zakopávání vsedě (stroj)", en: "Seated leg curl" },
  glute_kickback_machine: { group: "Nohy a hýždě", label: "Zanožování na hýždě (stroj)", en: "Glute kickback machine" },
  seated_calf_raise: { group: "Nohy a hýždě", label: "Lýtka vsedě (stroj)", en: "Seated calf raise machine" },
  sled: { group: "Kardio", label: "Saně (sled)", en: "Sled" },
  battle_ropes: { group: "Kardio", label: "Battle ropes (lana)", en: "Battle ropes" },
  rowing_ergometer: { group: "Kardio", label: "Veslovací trenažér", en: "Rowing ergometer" },
  ski_erg: { group: "Kardio", label: "SkiErg (běžkařský trenažér)", en: "SkiErg" },
  exercise_bike: { group: "Kardio", label: "Rotoped", en: "Exercise bike" },
  air_bike: { group: "Kardio", label: "Air bike (rotoped s rukama)", en: "Air bike" },
  elliptical: { group: "Kardio", label: "Eliptický trenažér", en: "Elliptical" }
};
export const OTHER_STATION_IDS = Object.keys(OTHER_STATIONS);

// Station names in English (lang.js); names that are already English stay.
const STATION_EN = {
 "Činkárna – sada jednoruček": "Dumbbell rack",
 "Polohovací lavice (5×)": "Adjustable bench (5×)",
 "Stojan na rovné osy + trny na kotouče": "Barbell rack + plate posts",
 "Klec na dřepy (power rack)": "Power rack",
 "Smith stroj": "Smith machine",
 "Podložky na zem": "Floor mats",
 "Lýtka v polostoji": "Standing calf raise machine",
 "Rowing stroj na záda vestoje": "Standing rowing machine",
 "Standing multi flight (roztahování na ramena)": "Standing multi flight (shoulder flyes)",
 "Multi-station kladky (5×)": "Multi-station cables (5×)",
 "Abs lavička": "Abs bench",
 "Běžecký pás (2×)": "Treadmill (2×)"
};

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
  "Barbell good morning": ["squat_rack", "barbells"],
  // Equipment of other gyms and home gyms (OTHER_STATIONS, added 2026-10-11).
  "Pull-up": ["pullup_bar"],
  "Chin-up": ["pullup_bar"],
  "Assisted pull-up": ["assisted_pullup_dip"],
  "Hanging leg raise": ["pullup_bar"],
  "Dips": ["dip_bars"],
  "Assisted dip": ["assisted_pullup_dip"],
  "Kettlebell swing": ["kettlebells"],
  "EZ bar curl": ["ez_bar"],
  "EZ bar skull crusher": ["ez_bar", "adjustable_bench"],
  "Preacher curl": ["preacher_bench", "ez_bar"],
  "Band pull-apart": ["resistance_bands"],
  "Hack squat": ["hack_squat"],
  "Seated leg curl": ["seated_leg_curl"],
  "Glute kickback machine": ["glute_kickback_machine"],
  "Seated calf raise": ["seated_calf_raise"],
  "T-bar row": ["t_bar_row"],
  "Chest-supported row": ["chest_supported_row"],
  "TRX row": ["suspension_trainer"],
  "Barbell incline bench press": ["incline_bench_press", "barbells"],
  "Trap bar deadlift": ["trap_bar"],
  "Landmine press": ["landmine", "barbells"],
  "Medicine ball slam": ["medicine_ball"],
  "Box step-up": ["plyo_box"]
};

// The stations an exercise needs, by the gym's own names; a station of other
// gyms (not in this gym) by its generic name.
export function stationLabel(exercise, gym = METAGYM_KUTNA_HORA) {
  return (EXERCISE_STATIONS[exercise] || []).map(id => {
    const label = gym.stations[id]?.label;
    if (label) return L(label, STATION_EN[label] || label);
    return OTHER_STATIONS[id] ? L(OTHER_STATIONS[id].label, OTHER_STATIONS[id].en) : null;
  }).filter(Boolean).join(" + ") || null;
}
// Whether the gym (METAGYM Kutná Hora unless given) has every station of the exercise.
export function availableAt(exercise, gym = METAGYM_KUTNA_HORA) {
  const stations = EXERCISE_STATIONS[exercise];
  return Boolean(stations?.length) && stations.every(id => gym.stations[id]);
}
// A station id the app knows: a Kutná Hora station or one of other gyms.
export function knownStation(id) {
  return Object.hasOwn(METAGYM_KUTNA_HORA.stations, id) || Object.hasOwn(OTHER_STATIONS, id);
}
// A catalog exercise is valid when all its stations are known; whether the
// athlete's own gym has them is decided by their setup (strength-generator.js
// fitsEquipment).
export function hasKnownStations(exercise) {
  const stations = EXERCISE_STATIONS[exercise];
  return Boolean(stations?.length) && stations.every(knownStation);
}
