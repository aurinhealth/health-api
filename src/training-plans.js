import { L } from "./lang.js";
import { buildWorkout, step } from "./workout-model.js";
import { CYCLING_WORKOUTS } from "./cycling-workouts.js";
import { RUNNING_WORKOUTS } from "./running-workouts.js";
// Multi-week training plans: the plan sets the week, the data sets the day.
// A plan is a list of weeks; each week has a phase, a load factor against the
// athlete's maintenance load (CTL × 7), its key sessions (a workout family of
// the catalogue and a level in it), the long session and what the easy days
// are. The week planner places the sessions on the athlete's own training
// days (planWeekRoles), the load targets size them, and the daily coach keeps
// its readiness guardrails: a red morning still turns a key session easy.
// The plans are our own, built on the common principles of endurance
// training: 75–80 % easy volume, a lighter week every 3–4 weeks (Bompa;
// Bell 2022), a taper of 1–2 weeks with less volume and kept intensity
// (Bosquet 2007), and a long run growing by about 10 % a week.

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
export const mondayOf = date => shift(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- the weeks ---------------------------------------------------------------
const q = (family, level) => ({ family, level });
const TEST = { test: true };
const W = (phase, load, keys = [], more = {}) => ({ phase, load, q: keys, ...more });
const long = (minutes, family = null) => ({ minutes, family });

// Running families: run-cruise, run-tempo, run-mp, run-subthreshold, run-vo2,
// run-vo2-short, run-30-30, run-fartlek-pyramid, run-hills, run-reps (running-workouts.js).
const RUN_START = [
  // Run/walk at first, continuous easy running at the end (levels 1:2 → 5:1 min).
  W("base", 1, [], { easy: { family: "run-walk", level: 1, minutes: 25 }, long: { family: "run-walk", level: 1, minutes: 30 } }),
  W("base", 1, [], { easy: { family: "run-walk", level: 1, minutes: 30 }, long: { family: "run-walk", level: 2, minutes: 30 } }),
  W("base", 1, [], { easy: { family: "run-walk", level: 2, minutes: 30 }, long: { family: "run-walk", level: 2, minutes: 35 } }),
  W("base", 1, [], { easy: { family: "run-walk", level: 2, minutes: 35 }, long: { family: "run-walk", level: 3, minutes: 35 } }),
  W("recovery", .7, [], { easy: { family: "run-walk", level: 2, minutes: 25 }, long: { family: "run-walk", level: 2, minutes: 30 } }),
  W("build", 1, [], { easy: { family: "run-walk", level: 3, minutes: 30 }, long: { family: "run-walk", level: 3, minutes: 35 } }),
  W("build", 1, [], { easy: { family: "run-walk", level: 3, minutes: 35 }, long: { family: "run-walk", level: 4, minutes: 40 } }),
  W("build", 1, [], { easy: { family: "run-walk", level: 4, minutes: 35 }, long: { family: "run-walk", level: 4, minutes: 40 } }),
  W("build", 1, [], { easy: { family: "run-easy", minutes: 25 }, long: { family: "run-easy", minutes: 30 } }),
  W("race", .6, [], { easy: { family: "run-easy", minutes: 20 }, race: true })
];
const RUN_10K = [
  W("base", 1, [q("run-fartlek-pyramid", 1)], { long: long(50), strides: true }),
  W("base", 1.03, [q("run-cruise", 1)], { long: long(55), strides: true }),
  W("build", 1.06, [q("run-vo2-short", 1), q("run-tempo", 1)], { long: long(60) }),
  W("recovery", .7, [], { long: long(45), strides: true }),
  W("build", 1.03, [q("run-cruise", 3), q("run-vo2-short", 2)], { long: long(65) }),
  W("build", 1.06, [q("run-vo2", 3), q("run-tempo", 3)], { long: long(70), strides: true }),
  W("build", 1.08, [q("run-cruise", 5), q("run-vo2-short", 3)], { long: long(75, "run-long-progressive") }),
  W("recovery", .75, [q("run-fartlek-pyramid", 2)], { long: long(55), strides: true }),
  W("peak", 1, [q("run-vo2", 5), q("run-cruise", 6)], { long: long(80) }),
  W("race", .5, [q("run-reps", 1)], { strides: true, race: true })
];
const RUN_HALF = [
  W("base", 1, [q("run-cruise", 1)], { long: long(60), strides: true }),
  W("base", 1.03, [q("run-fartlek-pyramid", 1), q("run-tempo", 1)], { long: long(65) }),
  W("build", 1.06, [q("run-cruise", 3), q("run-tempo", 2)], { long: long(75) }),
  W("recovery", .7, [], { long: long(55), strides: true }),
  W("build", 1.03, [q("run-vo2", 1), q("run-tempo", 4)], { long: long(80) }),
  W("build", 1.06, [q("run-cruise", 5), q("run-mp", 1)], { long: long(90, "run-long-progressive") }),
  W("build", 1.08, [q("run-vo2", 3), q("run-tempo", 5)], { long: long(95) }),
  W("recovery", .72, [q("run-fartlek-pyramid", 2)], { long: long(70), strides: true }),
  W("build", 1.05, [q("run-cruise", 7), q("run-tempo", 6)], { long: long(105) }),
  W("peak", 1.08, [q("run-subthreshold", 6), q("run-tempo", 8)], { long: long(110, "run-long-progressive") }),
  W("taper", .75, [q("run-cruise", 5)], { long: long(80), strides: true }),
  W("race", .5, [q("run-reps", 1)], { strides: true, race: true })
];
const RUN_MARATHON = [
  W("base", 1, [q("run-cruise", 1), q("run-fartlek-pyramid", 1)], { long: long(80), strides: true }),
  W("base", 1.03, [q("run-tempo", 2), q("run-vo2-short", 1)], { long: long(90) }),
  W("build", 1.06, [q("run-cruise", 3), q("run-mp", 1)], { long: long(100) }),
  W("recovery", .7, [q("run-fartlek-pyramid", 1)], { long: long(75), strides: true }),
  W("build", 1.03, [q("run-tempo", 4), q("run-vo2", 1)], { long: long(105) }),
  W("build", 1.06, [q("run-cruise", 5), q("run-mp", 2)], { long: long(115, "run-long-progressive") }),
  W("build", 1.08, [q("run-subthreshold", 5), q("run-vo2", 3)], { long: long(125, "run-long-mp") }),
  W("recovery", .72, [q("run-fartlek-pyramid", 2)], { long: long(90), strides: true }),
  W("build", 1.05, [q("run-tempo", 6), q("run-mp", 3)], { long: long(135) }),
  W("build", 1.08, [q("run-cruise", 7), q("run-vo2", 5)], { long: long(150, "run-long-mp") }),
  W("build", 1.1, [q("run-subthreshold", 8), q("run-mp", 4)], { long: long(160) }),
  W("peak", 1, [q("run-tempo", 7), q("run-mp", 5)], { long: long(170, "run-long-mp") }),
  W("taper", .75, [q("run-cruise", 5), q("run-mp", 3)], { long: long(120) }),
  W("taper", .6, [q("run-vo2-short", 2)], { long: long(90), strides: true }),
  W("race", .4, [q("run-reps", 1)], { strides: true, race: true })
];
const RUN_ULTRA = [
  W("base", 1, [q("run-hills", 1)], { long: long(90), strides: true }),
  W("base", 1.03, [q("run-tempo", 2)], { long: long(105) }),
  W("build", 1.06, [q("run-hills", 2), q("run-cruise", 2)], { long: long(120) }),
  W("build", 1.08, [q("run-tempo", 3)], { long: long(135) }),
  W("recovery", .7, [], { long: long(90), strides: true }),
  W("build", 1.04, [q("run-hills", 3), q("run-tempo", 4)], { long: long(150) }),
  W("build", 1.07, [q("run-cruise", 4)], { long: long(165) }),
  W("build", 1.1, [q("run-hills", 4)], { long: long(180), backToBack: 90 }),
  W("build", 1.05, [q("run-tempo", 6)], { long: long(195) }),
  W("recovery", .72, [q("run-fartlek-pyramid", 1)], { long: long(120) }),
  W("build", 1.08, [q("run-hills", 5), q("run-tempo", 7)], { long: long(210), backToBack: 105 }),
  W("build", 1.1, [q("run-cruise", 6)], { long: long(240) }),
  W("peak", 1.05, [q("run-tempo", 8)], { long: long(225), backToBack: 120 }),
  W("taper", .75, [q("run-cruise", 4)], { long: long(150) }),
  W("taper", .6, [q("run-fartlek-pyramid", 1)], { long: long(100), strides: true }),
  W("race", .4, [], { strides: true, race: true })
];
// Between races: three blocks of three weeks and a lighter one, each block a
// step harder, so the form holds without a race to aim at.
const RUN_MAINTAIN = [0, 1, 2].flatMap(b => [
  W("build", 1, [q("run-fartlek-pyramid", 1 + b), q("run-tempo", 2 + b)], { long: long(75 + b * 5), strides: true }),
  W("build", 1.03, [q("run-vo2-short", 1 + b), q("run-cruise", 3 + b)], { long: long(80 + b * 5, "run-long-progressive") }),
  W("build", 1.05, [q("run-30-30", 2 + b), q("run-tempo", 4 + b)], { long: long(85 + b * 5) }),
  W("recovery", .7, [q("run-fartlek-pyramid", 1)], { long: long(60), strides: true })
]);
// Cycling families: ss, ss-over-under, thr, thr-over-under, tempo, vo2 (cycling-workouts.js).
const RIDE_FTP = [
  W("test", 1, [TEST, q("ss", 3)]),
  W("build", 1.04, [q("thr", 2), q("ss", 5)]),
  W("build", 1.07, [q("thr", 4), q("ss-over-under", 2)], { long: long(null, "z2-progressive") }),
  W("recovery", .65, [q("tempo", 2)]),
  W("build", 1.04, [q("thr", 6), q("ss", 8)]),
  W("build", 1.07, [q("thr", 8), q("thr-over-under", 2)], { long: long(null, "z2-durability") }),
  W("peak", 1.1, [q("thr", 9), q("ss-over-under", 4)]),
  W("test", .7, [TEST])
];
const RIDE_VO2 = [
  W("build", 1, [q("vo2", 4), q("thr", 3)]),
  W("build", 1.05, [q("vo2", 6), q("thr", 5)]),
  W("recovery", .65, [q("tempo", 2)]),
  W("build", 1.03, [q("vo2", 8), q("vo2", 5)]),
  W("build", 1.06, [q("vo2", 10), q("thr", 7)]),
  W("recovery", .7, [q("vo2", 5)])
];
const RIDE_BASE = [
  W("base", 1, [q("tempo", 2)], { easy: { family: "z2-cadence" } }),
  W("base", 1.04, [q("tempo", 4)], { easy: { family: "z2-force" } }),
  W("base", 1.07, [q("ss", 2)], { long: long(null, "z2-progressive") }),
  W("recovery", .65, [], { easy: { family: "z2-cadence" } }),
  W("build", 1.04, [q("ss", 4), q("tempo", 5)]),
  W("build", 1.07, [q("ss", 6)], { long: long(null, "z2-durability"), easy: { family: "z2-force" } }),
  W("build", 1.1, [q("ss", 8), q("tempo", 7)], { long: long(null, "z2-durability") }),
  W("recovery", .7, [q("tempo", 3)])
];

// Strength for cyclists: two sessions a week through seven phases, from
// stability and single-leg control with light loads to heavy, low-rep
// strength. Load by RPE (how many repetitions are left in reserve), the
// sets waving 2 → 3 → 2 within a phase. Each exercise slot lists
// alternatives; the athlete's equipment picks the first that fits.
const STABILITY = [["Goblet squat", "Bodyweight squat"], ["DB step-up", "Box step-up"], ["DB single-leg Romanian deadlift", "Glute bridge"], ["Glute bridge", "Hip thrust"], ["One-arm DB row", "Single-arm cable row", "TRX row"], ["Dead bug"], ["Pallof press"]];
const BUILD = [["DB Bulgarian split squat", "Smith machine split squat", "DB reverse lunge"], ["Goblet squat", "Smith machine squat", "Pivot leg press"], ["DB Romanian deadlift", "Barbell Romanian deadlift"], ["Hip thrust", "Barbell hip thrust", "Smith machine hip thrust", "Glute bridge"], ["Single-arm cable row", "One-arm DB row", "Chest-supported row"], ["Lat pulldown", "Assisted pull-up", "Pull-up"], ["Pallof press", "Cable woodchop"]];
const STRENGTH = [["Trap bar deadlift", "Barbell Romanian deadlift", "DB Romanian deadlift"], ["Barbell back squat", "Smith machine squat", "Pivot leg press", "Goblet squat"], ["DB Bulgarian split squat", "Smith machine split squat", "DB reverse lunge"], ["DB single-leg Romanian deadlift"], ["Single-arm cable row", "One-arm DB row"], ["Lat pulldown", "Pull-up", "Assisted pull-up"], ["Hanging leg raise", "Dead bug"], ["Pallof press"]];
const G = (phase, name, sets, reps, rpe, exercises, sessions = 2) => ({ phase, gym: { name, sets, reps, rpe, exercises, sessions }, load: sessions < 2 ? .6 : 1, q: [] });
const phaseWeeks = (phase, name, reps, rpe, exercises, sets) => sets.map(n => G(phase, name, n, reps, rpe, exercises));
const GYM_CYCLING = () => [
  ...phaseWeeks("base", L("Základ", "Foundation"), "12–15", "3–5", STABILITY, [2, 2]),
  ...phaseWeeks("base", L("Stabilita", "Stability"), "10–12", "4–6", STABILITY, [2, 3, 2]),
  ...phaseWeeks("build", L("Rozvoj 1", "Build 1"), "8–10", "5–7", BUILD, [2, 3, 2]),
  ...phaseWeeks("build", L("Rozvoj 2", "Build 2"), "6–8", "6–7", BUILD, [3, 3, 2]),
  G("recovery", L("Přechod", "Transition"), 2, "8–10", "5–6", BUILD, 1),
  ...phaseWeeks("peak", L("Síla 1", "Strength 1"), "4–6", "7–8", STRENGTH, [2, 3, 3]),
  ...phaseWeeks("peak", L("Síla 2", "Strength 2"), "3–5", "7–9", STRENGTH, [3, 3, 2])
];

// days: [fewest, most] training days of the sport a week the plan is made for.
const TEMPLATES = () => [
  { id: "run-5k-start", sport: "run", weeks: RUN_START, days: [3, 3], level: "beginner", race: { km: 5 },
    name: L("Od nuly na 5 km", "Couch to 5 km"), goal: L("Uběhnout 5 km bez zastavení", "Run 5 km without stopping"),
    description: L("Tři běhy týdně, nejdřív s chůzí, na konci souvisle. Pátý týden je lehčí, desátý končí během na 5 km.", "Three runs a week, with walking at first and continuous at the end. Week five is lighter; week ten ends with a 5 km run.") },
  { id: "run-10k", sport: "run", weeks: RUN_10K, days: [3, 5], level: "intermediate", race: { km: 10 },
    name: L("10 km", "10 km"), goal: L("Rychlejší desítka", "A faster 10 km"),
    description: L("Jeden až dva klíčové tréninky týdně (práh, VO₂max), dlouhý běh do 80 minut, rovinky. Každý čtvrtý týden lehčí.", "One or two key sessions a week (threshold, VO₂max), a long run up to 80 minutes, strides. Every fourth week is lighter.") },
  { id: "run-half", sport: "run", weeks: RUN_HALF, days: [4, 5], level: "intermediate", race: { km: 21.1 },
    name: L("Půlmaraton", "Half marathon"), goal: L("Půlmaraton v cílovém čase", "A half marathon at your goal time"),
    description: L("Práh a tempo každý týden, dlouhý běh do 110 minut s rychlým závěrem, týden ladění formy před závodem.", "Threshold and tempo every week, a long run up to 110 minutes with a fast finish, a taper week before the race.") },
  { id: "run-marathon", sport: "run", weeks: RUN_MARATHON, days: [4, 6], level: "advanced", race: { km: 42.2 },
    name: L("Maraton", "Marathon"), goal: L("Maraton v cílovém čase", "A marathon at your goal time"),
    description: L("15 týdnů: dlouhé běhy do tří hodin s bloky v maratonském tempu, práh a VO₂max, lehčí týdny 4 a 8, dva týdny ladění formy.", "15 weeks: long runs up to three hours with marathon-pace blocks, threshold and VO₂max, lighter weeks 4 and 8, a two-week taper.") },
  { id: "run-ultra", sport: "run", weeks: RUN_ULTRA, days: [4, 5], level: "advanced", race: { km: 50, options: [50, 80, 100] },
    name: L("Ultra 50–100 km", "Ultra 50–100 km"), goal: L("Doběhnout ultra v dobré kondici", "Finish an ultra in good shape"),
    description: L("16 týdnů: kopce, tempo, dlouhé běhy do čtyř hodin a víkendy se dvěma dlouhými běhy po sobě. Lehčí týdny 5 a 10, dva týdny ladění formy.", "16 weeks: hills, tempo, long runs up to four hours and weekends with two long runs back to back. Lighter weeks 5 and 10, a two-week taper.") },
  { id: "run-maintain", sport: "run", weeks: RUN_MAINTAIN, days: [4, 5], level: "intermediate",
    name: L("Mezi závody", "Between races"), goal: L("Udržet a posunout formu", "Keep and lift your form"),
    description: L("Tři čtyřtýdenní bloky: fartlek, rychlost, práh a dlouhý běh. Každý blok o stupeň těžší, čtvrtý týden lehčí.", "Three four-week blocks: fartlek, speed, threshold and a long run. Each block a step harder, the fourth week lighter.") },
  { id: "gym-cycling", sport: "gym", weeks: GYM_CYCLING(), days: [2, 4], level: "intermediate",
    name: L("Posilovna ke kolu", "Strength for cyclists"), goal: L("Silnější nohy a stabilní trup na kolo", "Stronger legs and a stable trunk for the bike"),
    description: L("18 týdnů, dva tréninky týdně: od stability a práce na jedné noze k těžké síle s málo opakováními. Zátěž podle RPE, nohy šetří den před náročnou jízdou.", "18 weeks, two sessions a week: from stability and single-leg work to heavy strength with few repetitions. Load by RPE; the legs are spared the day before a hard ride.") },
  { id: "ride-ftp", sport: "ride", weeks: RIDE_FTP, days: [3, 6], level: "intermediate", tests: true,
    name: L("Kolo: FTP", "Cycling: FTP"), goal: L("Vyšší FTP za 8 týdnů", "A higher FTP in 8 weeks"),
    description: L("Začíná a končí testem FTP. Sweet spot a práh s prodlužováním času na prahu, čtvrtý týden lehčí.", "Starts and ends with an FTP test. Sweet spot and threshold with ever longer time at threshold, the fourth week lighter.") },
  { id: "ride-vo2", sport: "ride", weeks: RIDE_VO2, days: [3, 6], level: "advanced",
    name: L("Kolo: VO₂max blok", "Cycling: VO₂max block"), goal: L("Vyšší strop aerobního výkonu", "A higher aerobic ceiling"),
    description: L("Šest týdnů po dvou těžkých a jednom lehčím: VO₂max intervaly a práh, ostatní dny lehce.", "Six weeks of two hard and one lighter: VO₂max intervals and threshold, the other days easy.") },
  { id: "ride-base", sport: "ride", weeks: RIDE_BASE, days: [3, 6], level: "beginner",
    name: L("Kolo: základ", "Cycling: base"), goal: L("Aerobní základ a vytrvalost", "Aerobic base and endurance"),
    description: L("Hodně lehké jízdy, tempo a sweet spot jednou až dvakrát týdně, dlouhá jízda s tempem na konci.", "Plenty of easy riding, tempo and sweet spot once or twice a week, a long ride with tempo at the end.") }
];
export const planTemplates = () => TEMPLATES();
export const getTemplate = id => TEMPLATES().find(t => t.id === id) || null;

// ---- the catalogue -------------------------------------------------------------
const CATALOGUE = { ride: CYCLING_WORKOUTS, run: RUNNING_WORKOUTS };
const LIMITS = { ride: [30, 360], run: [20, 240] };
const familyLevels = (sport, family) => [...new Set(CATALOGUE[sport].filter(w => w.family === family).map(w => w.level).filter(Number.isFinite))].sort((a, b) => a - b);
// A key session one or two levels easier for a beginner, one harder for an
// experienced athlete (their capability in that energy system, level 3 = normal).
export const levelShift = capability => clamp(Math.round((Number(capability?.level) || 3) - 3), -2, 1);
// The catalogue workout for a family, level and length: the wanted level
// (or an easier one) at the nearest length that fits; with none that fits,
// the wanted level's shortest, shortened. Another length is the
// "<id>~<minutes>" resize of workout-library.js. Never a harder level.
export function planWorkoutId(sport, { family, level = null }, minutes, shiftBy = 0) {
  const pool = CATALOGUE[sport].filter(w => w.family === family);
  if (!pool.length) return null;
  const levels = familyLevels(sport, family);
  const wanted = level == null || !levels.length ? null : clamp(level + shiftBy, levels[0], levels.at(-1));
  const target = clamp(Math.round(Number(minutes) || 60), ...LIMITS[sport]);
  const at = l => pool.filter(w => l == null || w.level === l);
  const pick = list => list.reduce((a, w) => Math.abs(w.duration_minutes - target) < Math.abs(a.duration_minutes - target) ? w : a);
  let best = null;
  for (const l of wanted == null ? [null] : levels.filter(x => x <= wanted).reverse()) {
    const fits = at(l).filter(w => w.duration_minutes <= target + 5);
    if (fits.length) { best = pick(fits); break; }
  }
  best ??= at(wanted).reduce((a, w) => w.duration_minutes < a.duration_minutes ? w : a);
  return Math.abs(best.duration_minutes - target) <= 2 ? best.id : best.id + "~" + target;
}
// The shortest catalogue session of a family's level: a key session gets at
// least that much time, so its main set fits.
export function minutesFor(sport, { family, level = null }, shiftBy = 0) {
  const levels = familyLevels(sport, family), wanted = level == null || !levels.length ? null : clamp(level + shiftBy, levels[0], levels.at(-1));
  const list = CATALOGUE[sport].filter(w => w.family === family && (wanted == null || w.level === wanted));
  return list.length ? Math.min(...list.map(w => w.duration_minutes)) : null;
}
const systemOf = (sport, family) => CATALOGUE[sport].find(w => w.family === family)?.primary_system || null;
export { systemOf };
const baseName = id => { const w = Object.values(CATALOGUE).flat().find(x => x.id === String(id).replace(/~\d+$/, "")); return w ? w.name.replace(/ · \d+ min$/, "") : null; };

// ---- race day ----------------------------------------------------------------
// Race pace against threshold speed: about 104 % for 5 km, 100 % for 10 km,
// 96 % for a half, 91 % for a marathon and 80–85 % for an ultra.
const RACE_PACE = km => km <= 5 ? 104 : km <= 10 ? 100 : km <= 21.1 ? 96 : km <= 42.2 ? 91 : km <= 60 ? 85 : 80;
// Without a threshold pace, 6:40/km: a first race should not start too fast.
export const raceMinutes = (km, thresholdPace) => Math.round(km * (Number(thresholdPace) > 0 ? Number(thresholdPace) : 400) / (RACE_PACE(km) / 100) / 60);
export const raceId = (km, minutes) => `race-run-${String(km).replace(".", "_")}-${minutes}`;
export function raceWorkout(id) {
  const m = String(id).match(/^race-run-(\d+(?:_\d)?)-(\d{1,3})$/);
  if (!m) return null;
  const km = Number(m[1].replace("_", ".")), minutes = Number(m[2]), pace = RACE_PACE(km), short = km <= 21.1;
  const label = km === 42.2 ? L("Maraton", "Marathon") : km === 21.1 ? L("Půlmaraton", "Half marathon") : L(`Závod ${km} km`, `Race ${km} km`);
  return buildWorkout({
    id, sport: "run", name: label, system: km <= 10 ? "threshold" : km <= 21.1 ? "tempo" : "endurance", family: "race", tags: ["race"],
    structure: [...(short ? [step(10, 76, null, L("rozklus a pár rovinek", "warm-up jog and a few strides"))] : []), step(minutes, pace, null, L("závodní tempo, první kilometry s rezervou", "race pace, the first kilometres with something in hand")), step(short ? 10 : 5, 65, null, L("výklus nebo chůze", "cool-down jog or walk"))],
    description: L(`${km} km. Tempo vychází z tvého prahového tempa; začni opatrně a zrychli v druhé polovině.`, `${km} km. The pace comes from your threshold pace; start carefully and pick it up in the second half.`)
  });
}

// ---- the plan in a given week -------------------------------------------------
// An active plan: { templateId, startDate (a Monday), raceDate, raceKm }.
export function planWeek(plan, date) {
  const template = plan && getTemplate(plan.templateId);
  if (!template) return null;
  const index = Math.floor(daysBetween(plan.startDate, mondayOf(date)) / 7);
  if (index < 0 || index >= template.weeks.length) return null;
  return { template, index, week: index + 1, weeks: template.weeks.length, spec: template.weeks[index], monday: shift(plan.startDate, index * 7) };
}
// The quality days the week planner should make for the plan's week.
export const planQuality = pw => pw ? pw.spec.q.length : null;

const phaseLabel = phase => ({ base: L("základ", "base"), build: L("rozvoj", "build"), peak: L("vrchol", "peak"), recovery: L("lehčí týden", "lighter week"), taper: L("ladění formy", "taper"), race: L("závod", "race"), test: L("test", "test") })[phase] || phase;
export { phaseLabel };

// The plan on the week's load targets (week-planner.js weekTargets items):
// each item of the plan's sport gets its session, the long day its length.
// Items are { date, sport, slot, role, minutes, tss, intensity }.
// `shifts` is the athlete's capabilities by energy system (workout-library.js
// getCapabilities): a beginner's key sessions are easier, see levelShift.
export function applyPlan(targets, plan, weekStart, { thresholdPace = null, hasPower = true, shifts = {} } = {}) {
  const pw = planWeek(plan, weekStart);
  if (!pw || !targets?.items || pw.template.sport === "gym") return targets;
  const { template, spec } = pw, sport = template.sport;
  const race = template.race && plan.raceDate && plan.raceDate >= weekStart && plan.raceDate <= shift(weekStart, 6) ? plan.raceDate : null;
  const raceKm = Number(plan.raceKm) || template.race?.km;
  let items = targets.items.map(x => ({ ...x }));
  // Nothing of the plan's sport after the race; the race day gets a chip if it has none.
  if (race) {
    items = items.filter(x => x.sport !== sport || x.date <= race);
    if (!items.some(x => x.sport === sport && x.date === race)) items.push({ date: race, sport, slot: 0, role: "race", minutes: raceMinutes(raceKm, thresholdPace), tss: 0, intensity: .9 });
    items.sort((a, b) => a.date.localeCompare(b.date) || (a.slot || 0) - (b.slot || 0));
  }
  const own = items.filter(x => x.sport === sport && (x.slot || 0) === 0);
  const quality = own.filter(x => x.role === "quality" && x.date !== race), longDay = own.find(x => x.role === "long" && x.date !== race);
  let stridesLeft = spec.strides ? 1 : 0;
  const sessionFor = x => {
    if (x.date === race) return { kind: "race", km: raceKm, workoutId: raceId(raceKm, raceMinutes(raceKm, thresholdPace)), label: raceWorkout(raceId(raceKm, 1))?.name };
    if (race && daysBetween(x.date, race) === 1) return { kind: "easy", family: sport === "run" ? "run-easy-strides" : "z2-cadence", minutes: sport === "run" ? 25 : 45 };
    const k = quality.indexOf(x);
    if (k >= 0 && spec.q[k]) {
      if (spec.q[k].test) { const testId = sport === "run" ? "test-run-tt30" : hasPower ? "test-ride-ftp20" : "test-ride-lthr30"; return { kind: "test", workoutId: testId }; }
      return { kind: "quality", ...spec.q[k] };
    }
    if (x === longDay && spec.long) return { kind: "long", family: spec.long.family || spec.easy?.family || (sport === "run" ? "run-long" : "z2"), level: spec.long.level ?? spec.easy?.level ?? null, minutes: spec.long.minutes ?? spec.easy?.minutes ?? null };
    if (x === longDay && spec.easy?.minutes) return { kind: "long", family: spec.easy.family, level: spec.easy.level ?? null, minutes: spec.easy.minutes };
    if (longDay && spec.backToBack && daysBetween(longDay.date, x.date) === 1) return { kind: "long", family: sport === "run" ? "run-long" : "z2", minutes: spec.backToBack };
    if (x.role === "recovery" && !spec.easy) return { kind: "recovery", family: sport === "run" ? "run-recovery" : "z2" };
    if (stridesLeft && sport === "run" && !spec.easy) { stridesLeft--; return { kind: "easy", family: "run-easy-strides" }; }
    return { kind: "easy", family: spec.easy?.family || (sport === "run" ? "run-easy" : "z2"), level: spec.easy?.level ?? null, minutes: spec.easy?.minutes ?? null };
  };
  const roleOf = s => s.kind === "quality" || s.kind === "test" ? "quality" : s.kind === "long" ? "long" : s.kind === "race" ? "race" : s.kind === "recovery" ? "recovery" : "endurance";
  const out = items.map(x => {
    if (x.sport !== sport || (x.slot || 0) !== 0) return x;
    const s = sessionFor(x), shiftBy = s.kind === "quality" ? levelShift(shifts[systemOf(sport, s.family)]) : 0;
    const minutes = s.minutes ?? (s.kind === "race" ? raceMinutes(raceKm, thresholdPace) : s.kind === "quality" ? Math.max(x.minutes, minutesFor(sport, s, shiftBy) || 0) : s.kind === "test" ? Math.max(x.minutes, 60) : x.minutes);
    const workoutId = s.workoutId || (s.family ? planWorkoutId(sport, s, minutes, shiftBy) : null);
    const label = s.kind === "test" ? (sport === "run" ? L("Běžecký test", "Run test") : L("Test FTP", "FTP test")) : s.label || (workoutId && baseName(workoutId)) || x.label;
    const role = roleOf(s), intensity = x.intensity || .7;
    return { ...x, role, label, minutes, tss: Math.round(minutes / 60 * intensity * intensity * 100), plan: { templateId: template.id, week: pw.week, weeks: pw.weeks, phase: spec.phase, kind: s.kind, family: s.family || null, level: s.level ?? null, workoutId } };
  });
  return { ...targets, items: out, plan: { templateId: template.id, name: template.name, week: pw.week, weeks: pw.weeks, phase: spec.phase, phaseLabel: phaseLabel(spec.phase), load: spec.load } };
}

// The week's load factor: the plan's, never above the safety rules (a
// recovery week the data calls stays one; a ramp above 8 a week only holds).
export const planLoad = pw => pw ? { load: pw.spec.load, light: ["recovery", "taper", "race"].includes(pw.spec.phase) || pw.spec.load < .8 } : null;

// The gym plan's session for a date: the week's phase on the first gym days
// of the week, at least a day apart (no strength on consecutive days), as many
// as the phase has sessions. Other gym days are the usual adaptive workouts.
// `days` is the week plan's days (0 = Monday).
export function gymPhaseFor(plan, date, days = []) {
  const pw = planWeek(plan, date);
  if (!pw || pw.template.sport !== "gym") return null;
  const g = pw.spec.gym, picked = [];
  for (let i = 0; i < 7 && picked.length < g.sessions; i++) if ((days[i] || []).includes("gym") && picked.every(p => i - p >= 2)) picked.push(i);
  const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  if (!picked.includes(weekday)) return null;
  const head = L("Posilovna ke kolu", "Strength for cyclists") + " · " + g.name;
  return {
    name: head + L(" · týden ", " · week ") + pw.week + "/" + pw.weeks, phaseName: g.name, sets: g.sets, reps: g.reps, rpe: g.rpe, exercises: g.exercises,
    rationale: L(`Plán ${head}, týden ${pw.week}/${pw.weeks}: ${g.sets} série po ${g.reps} opakováních, RPE ${g.rpe} (tolik opakování nech v rezervě, kolik chybí do 10).`, `Plan ${head}, week ${pw.week}/${pw.weeks}: ${g.sets} sets of ${g.reps} reps, RPE ${g.rpe} (keep as many reps in reserve as are missing to 10).`)
  };
}

// ---- starting a plan -----------------------------------------------------------
// A race plan ends on race day: it starts the Monday (weeks − 1) before the
// race week; a race too close starts the plan later (shorter), down to 60 %
// of it. Other plans start this Monday until Tuesday, else next Monday.
export function planStart(template, { today, raceDate = null }) {
  const thisMonday = mondayOf(today);
  if (template.race && raceDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate) || raceDate <= today) throw new Error(L("Datum závodu musí být v budoucnu.", "The race date must be in the future."));
    const start = shift(mondayOf(raceDate), -(template.weeks.length - 1) * 7);
    if (daysBetween(today, raceDate) > 400) throw new Error(L("Závod je moc daleko, plán začne později.", "The race is too far away; start the plan later."));
    const firstWeek = start >= thisMonday ? 1 : Math.floor(daysBetween(start, thisMonday) / 7) + 1;
    if (template.weeks.length - firstWeek + 1 < Math.ceil(template.weeks.length * .6)) throw new Error(L("Do závodu je na tento plán málo času.", "There isn't enough time before the race for this plan."));
    return { startDate: start, firstWeek, raceDate };
  }
  const weekday = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;
  const start = weekday <= 1 ? thisMonday : shift(thisMonday, 7);
  return { startDate: start, firstWeek: 1, raceDate: template.race ? shift(start, template.weeks.length * 7 - 1) : null };
}
// Training days the plan needs: the athlete's days of the sport first; when
// there are too few, the days with the most free time are added, spread out.
export function planDays(template, prefs) {
  const days = (prefs?.days || []).map(d => [...(d || [])]);
  while (days.length < 7) days.push([]);
  const has = i => days[i].includes(template.sport);
  const added = [];
  const free = i => Number(prefs?.availability?.[i]?.minutes ?? 60);
  while (days.filter((_, i) => has(i)).length < template.days[0]) {
    const options = [0, 1, 2, 3, 4, 5, 6].filter(i => !has(i) && free(i) >= (template.sport === "run" ? 20 : 30));
    if (!options.length) break;
    const near = i => [-1, 1].filter(k => has((i + k + 7) % 7)).length;
    options.sort((a, b) => near(a) - near(b) || free(b) - free(a) || Number(b >= 5) - Number(a >= 5));
    days[options[0]].push(template.sport);
    added.push(options[0]);
  }
  return { days, added: added.sort() };
}

// ---- storage -------------------------------------------------------------------
async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS training_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, template_id TEXT NOT NULL, sport TEXT NOT NULL, start_date TEXT NOT NULL, race_date TEXT, race_km REAL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
const fromRow = r => r ? { id: r.id, templateId: r.template_id, sport: r.sport, startDate: r.start_date, raceDate: r.race_date || null, raceKm: r.race_km ?? null, status: r.status } : null;
// The active plan, or null; a plan past its last week is finished. An
// endurance plan (ride or run) and a gym plan can run side by side.
export async function activePlan(db, today = null, { gym = false } = {}) {
  await ensure(db);
  const plan = fromRow(await db.prepare(`SELECT * FROM training_plans WHERE user_id=? AND status='active' AND sport${gym ? "=" : "<>"}'gym' ORDER BY id DESC LIMIT 1`).bind(db.userId).first());
  const template = plan && getTemplate(plan.templateId);
  if (plan && today && (!template || today >= shift(plan.startDate, template.weeks.length * 7))) {
    await db.prepare("UPDATE training_plans SET status='done',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(db.userId, plan.id).run();
    return null;
  }
  return plan;
}
export async function startPlan(db, { templateId, startDate, raceDate = null, raceKm = null }) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(L("Neznámý plán.", "Unknown plan."));
  await ensure(db);
  await stopPlan(db, { gym: template.sport === "gym" });
  const km = template.race ? (template.race.options?.includes(Number(raceKm)) ? Number(raceKm) : template.race.km) : null;
  await db.prepare("INSERT INTO training_plans(user_id,template_id,sport,start_date,race_date,race_km,status) VALUES(?,?,?,?,?,?,'active')").bind(db.userId, template.id, template.sport, startDate, raceDate, km).run();
  return activePlan(db, null, { gym: template.sport === "gym" });
}
export async function stopPlan(db, { gym = false } = {}) {
  await ensure(db);
  await db.prepare(`UPDATE training_plans SET status='stopped',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='active' AND sport${gym ? "=" : "<>"}'gym'`).bind(db.userId).run();
}

// ---- what the app shows ----------------------------------------------------------
const keyLabel = (sport, k) => k.test ? (sport === "run" ? L("Běžecký test", "Run test") : L("Test FTP", "FTP test")) : baseName(planWorkoutId(sport, k, sport === "run" ? 60 : 90)) || k.family;
export function templateSummary(t) {
  return {
    id: t.id, sport: t.sport, name: t.name, goal: t.goal, description: t.description, level: t.level, weeksCount: t.weeks.length, days: t.days,
    race: t.race ? { km: t.race.km, options: t.race.options || null } : null, tests: Boolean(t.tests),
    weeks: t.weeks.map((w, i) => ({ week: i + 1, phase: w.phase, phaseLabel: w.gym ? w.gym.name : phaseLabel(w.phase), load: w.load, keys: w.gym ? [L(`${w.gym.sessions}× týdně`, `${w.gym.sessions}× a week`), `${w.gym.sets} × ${w.gym.reps}`, "RPE " + w.gym.rpe] : w.q.map(k => keyLabel(t.sport, k)), longMinutes: w.long?.minutes ?? w.easy?.minutes ?? null, race: Boolean(w.race) }))
  };
}
export function planSummary(plan, today) {
  const template = plan && getTemplate(plan.templateId);
  if (!template) return null;
  const pw = planWeek(plan, today), started = today >= plan.startDate;
  return { id: plan.id, templateId: template.id, sport: template.sport, name: template.name, goal: template.goal, startDate: plan.startDate, raceDate: plan.raceDate, raceKm: plan.raceKm, week: pw?.week ?? (started ? template.weeks.length : 0), weeksCount: template.weeks.length, phase: pw?.spec.phase ?? null, phaseLabel: pw ? pw.spec.gym?.name ?? phaseLabel(pw.spec.phase) : null, started, template: templateSummary(template) };
}
