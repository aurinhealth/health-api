// Equipment of the gym the plans are built for. METAGYM Kutná Hora
// (https://metagym.cz/kutnahora, checked 2026-10-01): every exercise in the
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
  "Roman chair": ["roman_chair"]
};

export function stationLabel(exercise, gym = METAGYM_KUTNA_HORA) {
  return (EXERCISE_STATIONS[exercise] || []).map(id => gym.stations[id]?.label).filter(Boolean).join(" + ") || null;
}
export function availableAt(exercise, gym = METAGYM_KUTNA_HORA) {
  const stations = EXERCISE_STATIONS[exercise];
  return Boolean(stations?.length) && stations.every(id => gym.stations[id]);
}
