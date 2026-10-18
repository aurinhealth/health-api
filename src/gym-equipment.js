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

// The equipment picker (app: Kde cvičíš? → a place): body parts and kinds of
// equipment on the left, the stations of the chosen one on the right. A station
// can be under several (a pull-up bar under the back and the core); ticking it
// once ticks it everywhere. Each has one line on what it is.
export const STATION_SECTIONS = [
  { id: "chest", label: "Hrudník", en: "Chest" },
  { id: "back", label: "Záda", en: "Back" },
  { id: "shoulders", label: "Ramena", en: "Shoulders" },
  { id: "arms", label: "Ruce", en: "Arms" },
  { id: "legs", label: "Nohy a hýždě", en: "Legs and glutes" },
  { id: "core", label: "Břicho a trup", en: "Abs and core" },
  { id: "free_weights", label: "Volné váhy", en: "Free weights" },
  { id: "accessories", label: "Gumy a doplňky", en: "Bands and extras" },
  { id: "cables", label: "Kladky", en: "Cables" },
  { id: "cardio", label: "Kardio", en: "Cardio" }
];
export const STATION_SECTION_IDS = STATION_SECTIONS.map(s => s.id);

// id → [sections, Czech line, English line].
export const STATION_PICKER = {
  dumbbells: [["free_weights", "arms", "shoulders"], "Jednoručky v řadě vah, na tlaky, přítahy i bicepsy.", "Dumbbells in a range of weights for presses, rows and curls."],
  adjustable_bench: [["free_weights", "chest"], "Lavice se sklopným opěradlem, rovně i šikmo.", "A bench with a back rest you can tilt, flat or inclined."],
  bench_press: [["chest", "free_weights"], "Rovná lavice se stojany na osu.", "A flat bench with uprights for the barbell."],
  barbells: [["free_weights", "legs", "back"], "Rovná osa s kotouči na mrtvé tahy, přítahy a tlaky.", "A straight bar with plates for deadlifts, rows and presses."],
  squat_rack: [["legs", "free_weights", "shoulders"], "Klec s háky a pojistkami na dřepy s osou.", "A cage with hooks and safeties for barbell squats."],
  smith_machine: [["free_weights", "legs", "chest"], "Osa vedená v kolejnicích, jistí pohyb nahoru a dolů.", "A bar guided on rails, so it only moves up and down."],
  floor_mats: [["core", "accessories"], "Podložka na cviky vleže a s vlastní vahou.", "A mat for floor and bodyweight exercises."],
  pendulum_squat: [["legs"], "Dřep na kyvadlovém stroji, záda opřená.", "A squat on a swinging machine with your back supported."],
  hip_thrust: [["legs"], "Stroj na zvedání pánve vsedě opřený o záda.", "A machine for hip thrusts with your back on a pad."],
  pivot_leg_press: [["legs"], "Tlačíš plošinu nohama vsedě nebo vleže.", "You push a platform away with your legs."],
  leg_extension: [["legs"], "Vsedě propínáš nohy v kolenou proti válci.", "Seated, you straighten your knees against a pad."],
  prone_leg_curl: [["legs"], "Vleže pokrčuješ nohy proti válci u pat.", "Lying face down, you bend your knees against a pad."],
  calf_raise: [["legs"], "Vestoje se zvedáš na špičky s váhou na ramenou.", "Standing, you rise onto your toes with the load on your shoulders."],
  adduction_abduction: [["legs"], "Vsedě stahuješ nebo roztahuješ kolena.", "Seated, you squeeze your knees in or push them out."],
  lat_pulldown_low_row: [["back"], "Stahuješ tyč shora k hrudníku nebo přitahuješ madlo vsedě.", "You pull a bar down to your chest or a handle to your belly."],
  standing_row: [["back"], "Vestoje přitahuješ madla k tělu.", "Standing, you pull the handles towards you."],
  shoulder_press: [["shoulders"], "Vsedě tlačíš madla nad hlavu.", "Seated, you press the handles overhead."],
  multi_flight: [["shoulders"], "Vestoje upažuješ nebo tlačíš proti stroji.", "Standing, you raise your arms out to the sides."],
  pec_deck: [["chest", "shoulders"], "Vsedě stahuješ paže před sebe, obráceně na zadní ramena.", "Seated, you bring your arms together; facing in, it works the rear delts."],
  chest_press: [["chest"], "Vsedě tlačíš madla před sebe.", "Seated, you press the handles forward."],
  cables: [["cables", "arms", "shoulders", "chest"], "Kladky s nastavitelnou výškou a různými madly.", "Pulleys at any height with different handles."],
  abs_bench: [["core"], "Šikmá lavice na zkracovačky a zvedání nohou.", "An inclined bench for crunches and leg raises."],
  roman_chair: [["back", "core", "legs"], "Opora boků, ze které se předkláníš a zvedáš trup.", "A hip pad you bend over and lift your torso from."],
  treadmill: [["cardio"], "Pás na chůzi a běh, i do kopce.", "A belt for walking and running, uphill too."],
  stairmaster: [["cardio"], "Nekonečné schody na stoupání.", "Endless stairs to climb."],
  pullup_bar: [["back", "core"], "Tyč nad hlavou. Visíš na ní a přitahuješ se nahoru.", "A bar overhead. You hang from it and pull yourself up."],
  dip_bars: [["chest", "arms"], "Dvě rovnoběžné žerdě na kliky na bradlech.", "Two parallel bars for dips."],
  kettlebells: [["free_weights", "accessories"], "Koule s uchem na švihy a dřepy.", "A ball with a handle for swings and squats."],
  ez_bar: [["arms", "free_weights"], "Krátká lomená osa, šetří zápěstí u bicepsů.", "A short bent bar that spares your wrists in curls."],
  incline_bench_press: [["chest"], "Šikmá lavice se stojany na osu.", "An inclined bench with uprights for the barbell."],
  preacher_bench: [["arms"], "Opěrka pod paže na bicepsový zdvih.", "A pad under your arms for curls."],
  trap_bar: [["legs", "free_weights"], "Šestihranná osa, stojíš uvnitř a zvedáš.", "A hexagonal bar you stand inside to lift."],
  landmine: [["free_weights", "shoulders"], "Ukotvený konec osy na tlaky a přítahy.", "A bar anchored at one end for presses and rows."],
  plyo_box: [["accessories", "legs"], "Pevná bedna na výstupy a skoky.", "A sturdy box for step-ups and jumps."],
  medicine_ball: [["accessories", "core"], "Těžký míč na hody a údery o zem.", "A heavy ball to throw and slam."],
  resistance_bands: [["accessories"], "Gumy různé síly, dají se uchytit kamkoli.", "Bands of different strength you can anchor anywhere."],
  suspension_trainer: [["accessories", "back"], "Popruhy zavěšené nahoře, cvičíš s vlastní vahou.", "Straps hung overhead for bodyweight exercises."],
  assisted_pullup_dip: [["back", "arms"], "Protiváha ti pomáhá při shybech a bradlech.", "A counterweight helps you with pull-ups and dips."],
  t_bar_row: [["back"], "V předklonu přitahuješ ukotvenou osu.", "Bent over, you row an anchored bar."],
  chest_supported_row: [["back"], "Hrudník opřený, přitahuješ madla k tělu.", "Chest on a pad, you row the handles towards you."],
  hack_squat: [["legs"], "Dřep na šikmých saních se zády opřenými.", "A squat on an angled sled with your back supported."],
  seated_leg_curl: [["legs"], "Vsedě pokrčuješ nohy proti válci.", "Seated, you bend your knees against a pad."],
  glute_kickback_machine: [["legs"], "Zanožuješ nohu proti odporu stroje.", "You push one leg back against the machine."],
  seated_calf_raise: [["legs"], "Vsedě zvedáš paty s váhou na kolenou.", "Seated, you lift your heels with the load on your knees."],
  sled: [["cardio", "legs"], "Saně s kotouči, tlačíš je nebo táhneš.", "A sled with plates to push or pull."],
  battle_ropes: [["cardio"], "Těžká lana, kterými vlníš.", "Heavy ropes you whip in waves."],
  rowing_ergometer: [["cardio"], "Veslovací trenažér na celé tělo.", "A rowing machine for the whole body."],
  ski_erg: [["cardio"], "Stahuješ madla shora jako při běžkách.", "You pull the handles down like on cross-country skis."],
  exercise_bike: [["cardio"], "Rotoped na šlapání.", "A stationary bike."],
  air_bike: [["cardio"], "Rotoped s pohyblivými madly a větrníkem.", "A fan bike with moving handles."],
  elliptical: [["cardio"], "Šlapání v elipse bez nárazů.", "Smooth strides with no impact."]
};

// What the picker shows of a station: its sections and its line.
export function stationPicker(id) {
  const [sections = [], cs = "", en = ""] = STATION_PICKER[id] || [];
  return { sections, description: L(cs, en) };
}
export function stationSections() {
  return STATION_SECTIONS.map(s => ({ id: s.id, label: L(s.label, s.en) }));
}
