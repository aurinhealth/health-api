// Swimming workout catalog for the pool: sets in metres with rests at the
// wall, intensity as % of CSS speed (critical swim speed, 100 % = threshold
// pace per 100 m; Swim Smooth's zones: easy ≈ CSS + 8–10 s, steady + 6 s,
// threshold at CSS, speed faster). Beginners start with short lengths and
// drills: swimming is learnt by swimming often, not far (USA Triathlon, Swim
// Smooth). Minutes are at 2:00/100 m until the athlete's CSS is known.
// Written in both languages here, not through workout-i18n.js.
import { buildWorkout, swimMinutes, rep, sec } from "./workout-model.js";

function catalog(t) {
  const swim = (meters, pace, note = null) => ({ durationMinutes: swimMinutes(meters, pace), power: pace, meters, note });
  const rest = seconds => ({ durationMinutes: sec(seconds), power: 0, rest: true, note: null });
  const set = (repeats, meters, pace, restSeconds, note = null) => rep(repeats, [swim(meters, pace, note), rest(restSeconds)]);
  const WU = [swim(200, 86, t("rozplavání, volně", "warm-up, easy"))];
  const CD = [swim(100, 84, t("vyplavání", "cool-down"))];
  const DRILLS = [t("catch-up: ruka čeká na ruku", "catch-up: one hand waits for the other"), t("prsty po hladině", "fingertip drag"),
    t("kraul na boku, nohy", "kick on the side"), t("jednou rukou", "single arm"), t("6 kopů, 1 záběr, 6 kopů", "6-1-6")];
  const drills = count => rep(1, Array.from({ length: count }, (_, i) => [swim(50, 88, DRILLS[i % DRILLS.length]), rest(20)]).flat());
  const sw = props => buildWorkout({ sport: "swim", sourceName: "Aurin", ...props });
  const out = [];
  const add = (key, system, levels, name, structureOf, desc, tags = []) => levels.forEach((level, index) => {
    const structure = structureOf(level);
    out.push(sw({ id: `${key}-${level.join("x")}`, name: name(level), system, structure, family: key, level: index + 1, tags: ["aurin-original", key, ...tags], description: desc }));
  });

  // First lengths: for someone who cannot swim 400 m without stopping yet.
  add("swim-first", "endurance", [[8, 25], [10, 25], [12, 25], [8, 50], [10, 50], [6, 100]],
    ([r, m]) => t(`První délky ${r}×${m} m`, `First lengths ${r}×${m} m`),
    ([r, m]) => [swim(50, 84, t("rozplavání, klidně s pauzou", "warm-up, stop when you need")), set(r, m, 86, m >= 100 ? 40 : 30, t("klidně, dýchej do vody", "easy, breathe out into the water")), swim(50, 82, t("vyplavání", "cool-down"))],
    t("Krátké délky s dlouhou pauzou: zvykneš si na dýchání a souvislé plavání bez únavy.", "Short lengths with long rests: you get used to breathing and swimming without stopping."), ["beginner"]);
  // Technique: drills, then easy swimming that uses them.
  add("swim-technique", "endurance", [[4, 4], [6, 4], [8, 6]],
    ([d, r]) => t(`Technika ${d}×50 drily`, `Technique ${d}×50 drills`),
    ([d, r]) => [...WU, drills(d), set(r, 100, 91, 20, t("plynule, mysli na drily", "smooth, think of the drills")), ...CD],
    t("Drily na polohu těla, záběr a dýchání, pak plavání, kde je zkusíš použít.", "Drills for body position, the catch and breathing, then swimming where you use them."), ["technique"]);
  // Endurance: long repeats a little slower than CSS.
  add("swim-endurance", "endurance", [[3, 300], [4, 300], [3, 400], [4, 400], [2, 800], [3, 600]],
    ([r, m]) => t(`Vytrvalost ${r}×${m} m`, `Endurance ${r}×${m} m`),
    ([r, m]) => [...WU, drills(2), set(r, m, 93, 30, t("plynule, stejné tempo", "steady, even pace")), ...CD],
    t("Delší úseky o kus pomaleji než prahové tempo: vytrvalost a stejnoměrné tempo.", "Longer repeats a little slower than threshold pace: endurance and even pacing."));
  // CSS: threshold repeats with short rests.
  add("swim-css", "threshold", [[6, 100], [8, 100], [10, 100], [4, 200], [5, 200], [6, 200], [3, 400]],
    ([r, m]) => t(`Práh ${r}×${m} m`, `Threshold ${r}×${m} m`),
    ([r, m]) => [...WU, drills(2), set(r, m, 100, m >= 400 ? 30 : m >= 200 ? 20 : 15, t("prahové tempo (CSS)", "threshold pace (CSS)")), swim(200, 86, t("volně, piškot", "easy, pull buoy")), ...CD],
    t("Úseky v prahovém tempu s krátkou pauzou: naučí tě držet rychlost i unavený.", "Repeats at threshold pace with short rests teach you to hold speed when tired."), ["css"]);
  // Speed: short fast repeats with full rests.
  add("swim-speed", "vo2max", [[8, 50], [10, 50], [12, 50], [6, 100], [8, 100]],
    ([r, m]) => t(`Rychlost ${r}×${m} m`, `Speed ${r}×${m} m`),
    ([r, m]) => [...WU, drills(2), set(r, m, 106, m >= 100 ? 40 : 25, t("rychle, technika drží", "fast, keep your technique")), swim(200, 86, t("volně", "easy")), ...CD],
    t("Krátké rychlé úseky s delší pauzou: rychlost bez rozpadlé techniky.", "Short fast repeats with longer rests: speed without losing technique."));
  add("swim-sprint", "sprint", [[6, 25], [8, 25], [10, 25]],
    ([r, m]) => t(`Sprinty ${r}×${m} m`, `Sprints ${r}×${m} m`),
    ([r, m]) => [...WU, drills(2), set(r, m, 115, 45, t("naplno", "all out")), swim(200, 86, t("volně", "easy")), ...CD],
    t("Krátké sprinty s plnou pauzou: síla záběru a rychlost.", "Short sprints with full rests: a stronger catch and speed."));
  // Recovery: easy swimming, partly with a pull buoy.
  add("swim-recovery", "recovery", [[600], [800], [1000], [1200]],
    ([m]) => t(`Volné plavání ${m} m`, `Easy swim ${m} m`),
    ([m]) => [swim(m / 2, 84, t("volně", "easy")), swim(m / 2, 84, t("volně, piškot", "easy, pull buoy"))],
    t("Lehké plavání: uvolní ramena a záda po náročnějších dnech.", "Easy swimming loosens shoulders and back after harder days."), ["recovery"]);
  // Continuous swims: the goal of the swim plans ("400 m without stopping", "1,500 m").
  add("swim-continuous", "endurance", [[300], [400], [600], [800], [1000], [1200], [1500]],
    ([m]) => t(`Souvisle ${m} m`, `Continuous ${m} m`),
    ([m]) => [swim(100, 84, t("rozplavání, volně", "warm-up, easy")), swim(m, 88, t("souvisle, klidné tempo, pravidelný dech", "without stopping, an easy pace, steady breathing")), swim(100, 82, t("vyplavání", "cool-down"))],
    t("Souvislé plavání bez zastavení: klidné tempo, které vydržíš celou vzdálenost.", "Swimming without stopping: an easy pace you can hold for the whole distance."), ["continuous"]);
  // Open water practice: goes by time outside (workout-model.js adaptStructure).
  add("swim-open-water", "endurance", [[1000], [1500], [2000]],
    ([m]) => t(`Volná voda ≈ ${m} m`, `Open water ≈ ${m} m`),
    ([m]) => [swim(200, 86, t("rozplavání, zvykni si na vodu", "warm-up, get used to the water")), rep(6, [swim(50, 96, t("podívej se dopředu každých 6 záběrů", "look ahead every 6 strokes")), swim(50, 88, t("volně", "easy"))]), swim(m - 900, 95, t("plynule v závodním úsilí", "steady at race effort")), swim(100, 84, t("vyplavání", "cool-down"))],
    t("Orientace ve vodě a plynulé tempo jako v závodě. Nikdy neplav sám.", "Sighting and a steady race effort. Never swim alone."), ["open-water"]);
  return out;
}

export const SWIMMING_WORKOUTS = catalog(cs => cs);
export const SWIMMING_WORKOUTS_EN = catalog((cs, en) => en);
