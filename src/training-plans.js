import { L, plural } from "./lang.js";
import { buildWorkout, step, MAX_MINUTES } from "./workout-model.js";
import { CYCLING_WORKOUTS } from "./cycling-workouts.js";
import { RUNNING_WORKOUTS } from "./running-workouts.js";
import { SWIMMING_WORKOUTS, SWIMMING_WORKOUTS_EN } from "./swimming-workouts.js";
import { workoutNameEn } from "./workout-i18n.js";
import { testFor } from "./threshold-check.js";
import { RACE_PACE, rideRace, RIDE_RACES, durationShare } from "./race-estimate.js";
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
// Faster 5 km: one VO₂max and one threshold session a week (Daniels: at most
// about 8 % of the week at VO₂max pace), a long run up to an hour.
const RUN_5K = [
  W("base", 1, [q("run-fartlek-pyramid", 1), q("run-cruise", 1)], { long: long(50), strides: true }),
  W("build", 1.04, [q("run-vo2-short", 1), q("run-tempo", 1)], { long: long(55), strides: true }),
  W("build", 1.07, [q("run-vo2", 2), q("run-cruise", 3)], { long: long(60) }),
  W("recovery", .7, [q("run-30-30", 1)], { long: long(45), strides: true }),
  W("build", 1.04, [q("run-vo2", 3), q("run-tempo", 3)], { long: long(60), strides: true }),
  W("peak", 1.07, [q("run-vo2-short", 4), q("run-cruise", 5)], { long: long(65) }),
  W("peak", 1, [q("run-reps", 2), q("run-tempo", 4)], { long: long(55), strides: true }),
  W("race", .55, [q("run-reps", 1)], { strides: true, race: true })
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

// Cycling races with a date: the plan ends on race day. A gran fondo and an
// MTB marathon build long rides (up to five hours) on sweet spot and
// threshold; a time trial and a hill climb build time at threshold and
// VO₂max. A lighter week every third or fourth, a taper week of less volume
// with the intensity kept, and openers in the race week.
const RIDE_GRANFONDO = [
  W("base", 1, [q("tempo", 2)], { long: long(150, "z2") }),
  W("base", 1.04, [q("ss", 2)], { long: long(180, "z2-progressive") }),
  W("build", 1.07, [q("ss", 4), q("thr", 2)], { long: long(210, "z2-durability") }),
  W("recovery", .65, [q("tempo", 2)]),
  W("build", 1.04, [q("ss", 6), q("tempo-surges", 2)], { long: long(225, "z2-durability") }),
  W("build", 1.07, [q("thr", 4), q("ss", 8)], { long: long(240, "z2-durability") }),
  W("build", 1.1, [q("ss-over-under", 3), q("tempo", 6)], { long: long(270, "z2-durability") }),
  W("recovery", .7, [q("tempo", 3)]),
  W("peak", 1.08, [q("thr", 6), q("ss", 10)], { long: long(285, "z2-durability") }),
  W("peak", 1.1, [q("ss-over-under", 4), q("tempo", 8)], { long: long(300, "z2-durability") }),
  W("taper", .7, [q("thr", 3)], { long: long(150, "z2-progressive") }),
  W("race", .5, [q("vo2-30-30", 1)], { race: true })
];
const RIDE_MTB = [
  W("base", 1, [q("tempo-force", 2)], { long: long(150, "z2-force") }),
  W("build", 1.04, [q("thr", 2), q("vo2-30-30", 1)], { long: long(165, "z2") }),
  W("build", 1.07, [q("ss-over-under", 2), q("vo2", 3)], { long: long(180, "z2-durability") }),
  W("recovery", .65, [q("tempo", 2)]),
  W("build", 1.05, [q("thr-over-under", 2), q("vo2-40-20", 2)], { long: long(195, "z2-durability") }),
  W("build", 1.08, [q("vo2", 6), q("ana-late-attacks", 1)], { long: long(210, "z2-durability") }),
  W("recovery", .7, [q("tempo-surges", 1)]),
  W("peak", 1.08, [q("thr-race-finish", 2), q("vo2", 8)], { long: long(225, "z2-durability") }),
  W("taper", .7, [q("vo2-30-30", 2)], { long: long(120, "z2") }),
  W("race", .5, [q("sprint-10", 1)], { race: true })
];
const RIDE_TT = [
  W("build", 1, [q("thr", 2), q("ss", 3)]),
  W("build", 1.04, [q("thr-progressive", 2), q("vo2", 3)]),
  W("build", 1.07, [q("thr", 5), q("ss-over-under", 2)], { long: long(null, "z2-progressive") }),
  W("recovery", .65, [q("tempo", 2)]),
  W("build", 1.05, [q("thr", 7), q("vo2", 5)]),
  W("peak", 1.08, [q("thr-progressive", 4), q("thr", 9)], { long: long(null, "z2-progressive") }),
  W("taper", .7, [q("thr", 4)]),
  W("race", .5, [q("vo2-30-30", 1)], { race: true })
];
const RIDE_CLIMB = [
  W("build", 1, [q("thr", 2), q("tempo-force", 2)]),
  W("build", 1.04, [q("vo2", 3), q("thr", 4)]),
  W("build", 1.07, [q("thr-over-under", 2), q("vo2-pyramid", 1)], { long: long(null, "z2-force") }),
  W("recovery", .65, [q("tempo-force", 1)]),
  W("build", 1.05, [q("thr-hard-start", 2), q("vo2", 6)]),
  W("peak", 1.08, [q("thr", 8), q("vo2-hard-start", 2)], { long: long(null, "z2-force") }),
  W("taper", .7, [q("thr", 4)]),
  W("race", .5, [q("vo2-30-30", 1)], { race: true })
];

// Strength for cyclists: two sessions a week through seven phases, from
// stability and single-leg control with light loads to heavy, low-rep
// strength. Load by RPE (how many repetitions are left in reserve), the
// sets waving 2 → 3 → 2 within a phase. Each exercise slot lists
// alternatives; the athlete's equipment picks the first that fits.
const STABILITY = [["Goblet squat", "Bodyweight squat"], ["DB step-up", "Box step-up"], ["DB single-leg Romanian deadlift", "Glute bridge"], ["Glute bridge", "Hip thrust"], ["One-arm DB row", "Single-arm cable row", "TRX row"], ["Dead bug"], ["Pallof press"]];
const BUILD = [["DB Bulgarian split squat", "Smith machine split squat", "DB reverse lunge"], ["Goblet squat", "Smith machine squat", "Pivot leg press"], ["DB Romanian deadlift", "Barbell Romanian deadlift"], ["Hip thrust", "Barbell hip thrust", "Smith machine hip thrust", "Glute bridge"], ["Single-arm cable row", "One-arm DB row", "Chest-supported row"], ["Lat pulldown", "Assisted pull-up", "Pull-up"], ["Pallof press", "Cable woodchop"]];
const STRENGTH = [["Trap bar deadlift", "Barbell Romanian deadlift", "DB Romanian deadlift"], ["Barbell back squat", "Smith machine squat", "Pivot leg press", "Goblet squat"], ["DB Bulgarian split squat", "Smith machine split squat", "DB reverse lunge"], ["DB single-leg Romanian deadlift"], ["Single-arm cable row", "One-arm DB row"], ["Lat pulldown", "Pull-up", "Assisted pull-up"], ["Hanging leg raise", "Dead bug"], ["Pallof press"]];
const G = (phase, name, sets, reps, rpe, exercises, sessions = 2, more = {}) => ({ phase, gym: { name, sets, reps, rpe, exercises, sessions, ...more }, load: sessions < 2 || phase === "recovery" ? .6 : 1, q: [] });
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

// More gym plans, each slot's alternatives ending with dumbbells and body
// weight, so a home gym or a hotel room still gets the movement. Load by RPE
// with a lighter week every fourth or so (Helms 2014; Schoenfeld 2017 for
// 10–20 sets a muscle a week in the muscle plan).
// Svaly: three full-body sessions, 8–12 repetitions, sets growing.
const MUSCLE = [["Barbell back squat", "Hack squat", "Pivot leg press", "Smith machine squat", "Goblet squat", "Bodyweight squat"],
  ["Barbell bench press", "Chest flat press Prime", "DB bench press", "Push-up"],
  ["Lat pulldown", "Pull-up", "Assisted pull-up", "One-arm DB row", "TRX row"],
  ["Barbell Romanian deadlift", "DB Romanian deadlift", "Single Leg Glute Bridge"],
  ["Low row", "Chest-supported row", "Single-arm cable row", "One-arm DB row"],
  ["DB shoulder press", "Shoulder press Prime", "Barbell overhead press", "Push-up"],
  ["Cable lateral raise", "DB lateral raise"],
  ["Cable curl", "DB curl", "Hammer curl"],
  ["Cable triceps extension", "DB overhead triceps extension", "Diamond Push Ups"]];
// Síla: the three lifts heavy, with a strength test at the start and the end.
const LIFTS = [["Barbell back squat", "Smith machine squat", "Goblet squat", "Bodyweight squat"],
  ["Barbell bench press", "Smith Machine Bench Press", "DB bench press", "Push-up"],
  ["Barbell Deadlift", "Trap bar deadlift", "Barbell Romanian deadlift", "DB Romanian deadlift", "Single Leg Glute Bridge"]];
const STRONG = [...LIFTS, ["Barbell row", "Chest-supported row", "One-arm DB row", "TRX row"], ["Barbell overhead press", "DB shoulder press", "Push-up"], ["Pull-up", "Assisted pull-up", "Lat pulldown", "One-arm DB row"], ["Hanging leg raise", "Dead bug"]];
// Posilovna k běhu: one leg at a time, calves and the trunk; two sessions.
const RUNNER = [["DB Bulgarian split squat", "Smith machine split squat", "Bulgarian Split Squat", "Forward Lunge"],
  ["DB step-up", "Box step-up", "Walking Lunge"],
  ["DB single-leg Romanian deadlift", "Barbell Romanian deadlift", "Single Leg Glute Bridge"],
  ["Hip thrust", "Barbell hip thrust", "Glute bridge"],
  ["Single-leg calf raise", "Standing calf raise", "Eccentric Calf Lowers"],
  ["Nordic Hamstring Curl", "Seated leg curl", "Prone leg curl Prime", "Single Leg Glute Bridge"],
  ["Pallof press", "Dead bug"], ["Dead bug", "Bird Dog"]];
// Posilovna pro plavce: pulling, the rotator cuff, the shoulder blades, the
// trunk and the legs' push-off; little pressing. Water plus dry-land
// resistance training improves swimming most (network meta-analysis of 36
// RCTs, 2025); weak shoulders and trunk raise the risk of shoulder pain.
const SWIMMER = [["Lat pulldown", "Pull-up", "Assisted pull-up", "Inverted Row", "One-arm DB row"],
  ["Straight-Arm Lat Pulldown", "Cable pullover", "Dumbbell Pullover"],
  ["Single-arm cable row", "One-arm DB row", "TRX row"],
  ["Cable External Rotation", "Band External Rotation", "Prone Y-T Raises"],
  ["Face pull", "Band pull-apart", "DB rear delt fly", "Prone Y-T Raises"],
  ["Goblet squat", "Bodyweight squat"],
  ["Squat Jump", "Box Jump"],
  ["Pallof press", "Dead bug"], ["Dead bug", "Bird Dog"]];
// Doma bez vybavení: body weight only, whatever the athlete has at home.
const HOME = [["Bodyweight squat"], ["Push-up", "Bodyweight Knee Push Ups"], ["Forward Lunge", "Walking Lunge"], ["Single Leg Glute Bridge", "Glute bridge"],
  ["Supermans"], ["Diamond Push Ups", "Bodyweight Knee Push Ups"], ["Cossack Squat", "Bodyweight Alternating Lateral Lunge"], ["Eccentric Calf Lowers", "Bent-Knee Soleus Raise"], ["Dead bug"], ["Bicycle Crunches", "Reverse Crunch"]];
const TEST_KEYS = () => L("Dřep, bench, mrtvý tah: odhad maxima", "Squat, bench, deadlift: estimated max");
const GYM_MUSCLE = () => [
  ...[3, 3, 4].map(n => G("build", L("Objem 1", "Volume 1"), n, "10–12", "7", MUSCLE, 3)),
  G("recovery", L("Odpočinek", "Recovery"), 2, "10", "6", MUSCLE, 2),
  ...[3, 4, 4].map(n => G("build", L("Objem 2", "Volume 2"), n, "8–10", "7–8", MUSCLE, 3)),
  ...[4, 4].map(n => G("peak", L("Vrchol", "Peak"), n, "6–8", "8–9", MUSCLE, 3)),
  G("recovery", L("Odpočinek", "Recovery"), 2, "8–10", "6", MUSCLE, 2)
];
const GYM_STRENGTH = () => [
  G("test", L("Test síly", "Strength test"), 2, "5", "6–7", STRONG, 3, { test: LIFTS }),
  ...[["8", "7"], ["6–8", "7–8"]].map(([reps, rpe]) => G("build", L("Objem", "Volume"), 4, reps, rpe, STRONG, 3)),
  G("recovery", L("Odpočinek", "Recovery"), 2, "6", "6", STRONG, 2),
  ...[4, 5, 5].map(n => G("build", L("Síla", "Strength"), n, "5", "8", STRONG, 3)),
  G("recovery", L("Odpočinek", "Recovery"), 2, "5", "6", STRONG, 2),
  ...[4, 4, 3].map(n => G("peak", L("Síla 2", "Strength 2"), n, "3", "8–9", STRONG, 3)),
  G("test", L("Test síly", "Strength test"), 2, "3", "6", STRONG, 2, { test: LIFTS })
];
const GYM_RUNNING = () => [
  ...[2, 2, 3].map(n => G("base", L("Základ", "Foundation"), n, "12–15", "5–6", RUNNER)),
  ...[2, 3, 3].map(n => G("build", L("Rozvoj", "Build"), n, "8–10", "6–7", RUNNER)),
  G("recovery", L("Odpočinek", "Recovery"), 2, "8–10", "5", RUNNER, 1),
  ...[3, 3, 2].map(n => G("peak", L("Síla", "Strength"), n, "5–6", "7–8", RUNNER))
];
const GYM_SWIMMING = () => [
  ...[2, 2, 3].map(n => G("base", L("Základ", "Foundation"), n, "12–15", "5–6", SWIMMER)),
  ...[2, 3, 3].map(n => G("build", L("Rozvoj", "Build"), n, "8–12", "6–7", SWIMMER)),
  G("recovery", L("Odpočinek", "Recovery"), 2, "10", "5", SWIMMER, 1),
  ...[3, 3, 2].map(n => G("peak", L("Síla", "Strength"), n, "6–8", "7–8", SWIMMER))
];
const GYM_HOME = () => [
  ...[2, 3, 3].map(n => G("base", L("Základ", "Foundation"), n, "12–15", "6–7", HOME, 3)),
  G("recovery", L("Odpočinek", "Recovery"), 2, "10–12", "5", HOME, 2),
  ...[3, 3, 4].map(n => G("build", L("Rozvoj", "Build"), n, "12–20", "7–8", HOME, 3)),
  G("peak", L("Vrchol", "Peak"), 4, "15–20", "8–9", HOME, 3)
];

// days: [fewest, most] training days of the sport a week the plan is made for.
// Swimming (swimming-workouts.js families): learning by short lengths first,
// then continuous swims that grow; three swims a week (USA Triathlon).
const SWIM_400 = [
  W("base", 1, [], { easy: { family: "swim-first", level: 1 }, long: { family: "swim-first", level: 2 } }),
  W("base", 1, [], { easy: { family: "swim-first", level: 2 }, long: { family: "swim-first", level: 3 } }),
  W("base", 1, [], { easy: { family: "swim-first", level: 3 }, long: { family: "swim-first", level: 4 } }),
  W("recovery", .7, [], { easy: { family: "swim-first", level: 2 }, long: { family: "swim-first", level: 3 } }),
  W("build", 1, [], { easy: { family: "swim-first", level: 4 }, long: { family: "swim-first", level: 5 } }),
  W("build", 1, [], { easy: { family: "swim-technique", level: 1 }, long: { family: "swim-first", level: 6 } }),
  W("build", 1, [], { easy: { family: "swim-first", level: 5 }, long: { family: "swim-continuous", level: 1 } }),
  W("peak", .9, [], { easy: { family: "swim-technique", level: 1 }, long: { family: "swim-continuous", level: 2 } })
];
const SWIM_1500 = [
  W("base", 1, [q("swim-technique", 1)], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-continuous", level: 2 } }),
  W("base", 1.03, [q("swim-endurance", 1)], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-continuous", level: 3 } }),
  W("build", 1.06, [q("swim-css", 1)], { easy: { family: "swim-technique", level: 2 }, long: { family: "swim-continuous", level: 4 } }),
  W("recovery", .7, [], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-continuous", level: 3 } }),
  W("build", 1.03, [q("swim-css", 2)], { easy: { family: "swim-recovery", level: 2 }, long: { family: "swim-continuous", level: 5 } }),
  W("build", 1.06, [q("swim-endurance", 3)], { easy: { family: "swim-technique", level: 2 }, long: { family: "swim-continuous", level: 5 } }),
  W("build", 1.08, [q("swim-css", 4)], { easy: { family: "swim-recovery", level: 2 }, long: { family: "swim-continuous", level: 6 } }),
  W("recovery", .72, [q("swim-technique", 2)], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-continuous", level: 4 } }),
  W("peak", 1.05, [q("swim-css", 5)], { easy: { family: "swim-recovery", level: 2 }, long: { family: "swim-continuous", level: 6 } }),
  W("peak", .9, [q("swim-speed", 1)], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-continuous", level: 7 } })
];
// Faster swimming (CSS): a CSS test in weeks 1, 6 and 10 (retest every 4–6
// weeks); threshold sets once or twice a week (Swim Smooth: 47 of 57 swimmers
// faster after 10 weeks of one CSS set a week, 2.6 % on average), speed once.
const SWIM_CSS = [
  W("test", .8, [TEST], { easy: { family: "swim-technique", level: 1 }, long: { family: "swim-endurance", level: 1 } }),
  W("build", 1, [q("swim-css", 1)], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-endurance", level: 2 } }),
  W("build", 1.04, [q("swim-css", 2), q("swim-speed", 1)], { easy: { family: "swim-technique", level: 2 }, long: { family: "swim-endurance", level: 2 } }),
  W("recovery", .7, [q("swim-technique", 2)], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-continuous", level: 3 } }),
  W("build", 1.04, [q("swim-css", 3), q("swim-speed", 2)], { easy: { family: "swim-recovery", level: 2 }, long: { family: "swim-endurance", level: 3 } }),
  W("test", .85, [TEST], { easy: { family: "swim-technique", level: 2 }, long: { family: "swim-endurance", level: 3 } }),
  W("build", 1.06, [q("swim-css", 5), q("swim-sprint", 1)], { easy: { family: "swim-recovery", level: 2 }, long: { family: "swim-endurance", level: 4 } }),
  W("recovery", .72, [q("swim-technique", 3)], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-continuous", level: 4 } }),
  W("peak", 1.06, [q("swim-css", 6), q("swim-speed", 4)], { easy: { family: "swim-recovery", level: 2 }, long: { family: "swim-endurance", level: 5 } }),
  W("test", .8, [TEST], { easy: { family: "swim-recovery", level: 1 }, long: { family: "swim-technique", level: 1 } })
];
// Open-water race (TrainingPeaks open-water plans: 8–24 weeks, 3–4 swims a
// week): CSS once a week, sighting in the pool, a long swim that grows to
// about 80 % of the race (`share` of its metres), a taper week. Open water
// itself once a week in the last 8 weeks, by the athlete's open-water setting
// (adaptive-week.js withOpenWater).
const OW = (phase, load, keys, share, easy = { family: "swim-recovery", level: 1 }) => W(phase, load, keys, { easy, long: { family: "swim-continuous", share } });
const SWIM_OPEN_WATER = [
  OW("base", 1, [q("swim-technique", 2)], .3),
  OW("base", 1.03, [q("swim-endurance", 2)], .35),
  OW("build", 1.06, [q("swim-css", 2), q("swim-sighting", 1)], .4),
  OW("recovery", .7, [q("swim-technique", 2)], .3),
  OW("build", 1.03, [q("swim-css", 3), q("swim-sighting", 2)], .45, { family: "swim-recovery", level: 2 }),
  OW("build", 1.06, [q("swim-endurance", 4), q("swim-sighting", 2)], .5, { family: "swim-recovery", level: 2 }),
  OW("build", 1.08, [q("swim-css", 5), q("swim-sighting", 3)], .55, { family: "swim-recovery", level: 2 }),
  OW("recovery", .72, [q("swim-technique", 3)], .4),
  OW("peak", 1.05, [q("swim-css", 6), q("swim-sighting", 3)], .65, { family: "swim-recovery", level: 3 }),
  OW("peak", 1.08, [q("swim-endurance", 5), q("swim-sighting", 4)], .8, { family: "swim-recovery", level: 3 }),
  OW("taper", .75, [q("swim-css", 3)], .4),
  W("race", .5, [q("swim-speed", 1)], { easy: { family: "swim-recovery", level: 1 }, race: true })
];

// ---- triathlon -------------------------------------------------------------------
// One plan for three sports: each week has its sessions per sport (swim, ride,
// run, the app's order Ride, Run, Swim), each with at most one key session, and
// a brick (a short run straight after the long ride) from the build on.
// Base, build and peak with every fourth week lighter, then the taper; the
// last week is the race (Friel, The Triathlete's Training Bible; USA Triathlon).
// Long sessions grow from `from` to `to` minutes; the brick from 15 to `brick`.
export const TRI_SPORTS = ["ride", "run", "swim"];
const ramp = (a, b, t) => Math.round((a + (b - a) * t) / 5) * 5;
// `only`: the sports of a race with fewer legs (a duathlon, an aquabike, an aquathlon).
function triWeeks(n, { taper = 1, ride, run, swim, brick, race: hasRace = true, only = TRI_SPORTS }) {
  // Without a race the last weeks are the peak and nothing tapers.
  const race = hasRace ? n - 1 : n, taperFrom = hasRace ? race - taper : n, peakFrom = taperFrom - 3, buildFrom = Math.round(taperFrom * .4);
  return Array.from({ length: n }, (_, i) => {
    const t = Math.min(1, i / Math.max(1, peakFrom)), light = i < taperFrom && (i + 1) % 4 === 0;
    const phase = i === race ? "race" : i >= taperFrom ? "taper" : light ? "recovery" : i >= peakFrom ? "peak" : i >= buildFrom ? "build" : "base";
    const lvl = (a, b) => Math.max(1, Math.round(a + (b - a) * t));
    const tag = (k, sport) => ({ ...k, sport });
    const key = {
      base: { ride: q("tempo", lvl(1, 4)), run: q(i % 2 ? "run-hills" : "run-fartlek-pyramid", lvl(1, 3)), swim: q(i % 2 ? "swim-endurance" : "swim-technique", lvl(1, 3)) },
      build: { ride: q(i % 2 ? "thr" : "ss", lvl(2, 8)), run: q(i % 2 ? "run-tempo" : "run-cruise", lvl(1, 7)), swim: q("swim-css", lvl(1, 6)) },
      peak: { ride: q("thr", lvl(4, 9)), run: q("run-subthreshold", lvl(2, 8)), swim: q("swim-css", lvl(3, 7)) },
      recovery: { swim: q("swim-technique", 1) },
      taper: { ride: q("thr", 3), run: q("run-cruise", 3), swim: q("swim-speed", 1) },
      race: { swim: q("swim-speed", 1) }
    }[phase];
    const scale = phase === "recovery" ? .7 : phase === "taper" ? .6 : 1;
    const longOf = (sport, [a, b], family) => phase === "race" ? null : long(Math.round(ramp(a, b, t) * scale / 5) * 5, family);
    const all = {
      ride: () => ({ q: key.ride ? [tag(key.ride, "ride")] : [], long: longOf("ride", ride, phase === "peak" ? "z2-durability" : null) }),
      run: () => ({ q: key.run ? [tag(key.run, "run")] : [], long: longOf("run", run, null) }),
      swim: () => ({ q: key.swim ? [tag(key.swim, "swim")] : [], long: phase === "race" ? null : { family: "swim-continuous", level: Math.min(7, Math.round(swim[0] + (swim[1] - swim[0]) * t * scale)) } })
    };
    const sports = Object.fromEntries(only.map(s => [s, all[s]()]));
    const load = { base: 1 + .03 * (i % 4), build: 1.04 + .02 * (i % 4), peak: 1.08, recovery: .7, taper: .72, race: .5 }[phase];
    return { phase, load, q: only.flatMap(s => sports[s].q), sports, brick: brick && ["build", "peak"].includes(phase) ? ramp(15, brick, t) : null, ...(phase === "race" ? { race: true } : {}) };
  });
}
// Race distances: swim metres, ride and run km; `ride` is the race-estimate.js kind.
export const TRI_RACES = { sprint: { swim: 750, ride: 20, run: 5, ride_kind: "tri-short" }, olympic: { swim: 1500, ride: 40, run: 10, ride_kind: "tri-short" }, half: { swim: 1900, ride: 90, run: 21.1, ride_kind: "tri-half" }, full: { swim: 3800, ride: 180, run: 42.2, ride_kind: "tri-full" },
  // Races with other legs, in their order (World Triathlon standard distances).
  "du-sprint": { legs: [["run", 5], ["ride", 20], ["run", 2.5]], ride_kind: "du-short" },
  "du-standard": { legs: [["run", 10], ["ride", 40], ["run", 5]], ride_kind: "du-short" },
  aquabike: { legs: [["swim", 1500], ["ride", 40]], ride_kind: "aquabike" },
  "aquabike-half": { legs: [["swim", 1900], ["ride", 90]], ride_kind: "aquabike-half" },
  "aquabike-full": { legs: [["swim", 3800], ["ride", 180]], ride_kind: "aquabike-full" },
  aquathlon: { legs: [["swim", 1000], ["run", 5]] } };
// A race's legs in order: [sport, distance] (swim in metres, ride and run in km).
export const raceLegs = r => r?.legs || (r ? [["swim", r.swim], ["ride", r.ride], ["run", r.run]] : []);
const TRI_TEMPLATES = () => [
  { id: "tri-sprint", sport: "triathlon", weeks: triWeeks(12, { ride: [60, 100], run: [35, 60], swim: [2, 5], brick: 20 }), days: [5, 7], perSport: { ride: 2, run: 2, swim: 2 }, level: "beginner", race: { km: 25.75, tri: "sprint" },
    name: L("Sprint", "Sprint"), goal: L("750 m, 20 km, 5 km", "750 m, 20 km, 5 km"),
    description: L("12 týdnů, dvakrát týdně každý sport. Jeden klíčový trénink na sport, od sedmého týdne brick (běh hned po kole). Každý čtvrtý týden lehčí, týden ladění formy před závodem.", "12 weeks, each sport twice a week. One key session per sport, a brick (a run straight after the ride) from week seven. Every fourth week is lighter, a taper week before the race.") },
  { id: "tri-olympic", sport: "triathlon", weeks: triWeeks(16, { ride: [75, 150], run: [45, 80], swim: [3, 7], brick: 30 }), days: [5, 7], perSport: { ride: 3, run: 3, swim: 2 }, level: "intermediate", race: { km: 51.5, tri: "olympic" },
    name: L("Olympijský", "Olympic"), goal: L("1,5 km, 40 km, 10 km", "1.5 km, 40 km, 10 km"),
    description: L("16 týdnů: tři jízdy a tři běhy, dvě plavání, práh na kole i v běhu, CSS v bazénu a brick od budování. Každý čtvrtý týden lehčí, týden ladění formy.", "16 weeks: three rides and three runs, two swims, threshold on the bike and the run, CSS in the pool and a brick from the build. Every fourth week is lighter, a taper week.") },
  { id: "tri-half", sport: "triathlon", weeks: triWeeks(20, { taper: 2, ride: [90, 240], run: [60, 120], swim: [4, 7], brick: 40 }), days: [6, 7], perSport: { ride: 3, run: 3, swim: 3 }, level: "advanced", race: { km: 113, tri: "half" },
    name: L("Poloviční (70.3)", "Half (70.3)"), goal: L("1,9 km, 90 km, 21,1 km", "1.9 km, 90 km, 21.1 km"),
    description: L("20 týdnů, tři tréninky každého sportu: dlouhá jízda do čtyř hodin, dlouhý běh do dvou, brick až 40 minut. Každý čtvrtý týden lehčí, dva týdny ladění formy.", "20 weeks, three sessions of each sport: a long ride up to four hours, a long run up to two, a brick up to 40 minutes. Every fourth week is lighter, a two-week taper.") },
  { id: "tri-full", sport: "triathlon", weeks: triWeeks(24, { taper: 2, ride: [120, 330], run: [75, 165], swim: [5, 7], brick: 45 }), days: [6, 7], perSport: { ride: 3, run: 3, swim: 3 }, level: "advanced", race: { km: 226, tri: "full" },
    name: L("Dlouhý triatlon", "Full distance"), goal: L("3,8 km, 180 km, 42,2 km", "3.8 km, 180 km, 42.2 km"),
    description: L("24 týdnů: dlouhá jízda do pěti a půl hodiny, dlouhý běh do necelých tří, brick až 45 minut a jídlo trénované na dlouhých dnech. Každý čtvrtý týden lehčí, dva týdny ladění formy.", "24 weeks: a long ride up to five and a half hours, a long run up to nearly three, a brick up to 45 minutes and fuelling practised on the long days. Every fourth week is lighter, a two-week taper.") },
  // Two of the three sports: a duathlon (run, ride, run), an aquabike (swim,
  // ride) and an aquathlon (swim, run); a brick only where a run follows the ride.
  { id: "du-sprint", sport: "triathlon", sports: ["ride", "run"], weeks: triWeeks(10, { ride: [60, 100], run: [35, 60], swim: [1, 1], brick: 20, only: ["ride", "run"] }), days: [4, 6], perSport: { ride: 2, run: 3 }, level: "beginner", race: { km: 27.5, tri: "du-sprint" },
    name: L("Sprint duatlon", "Sprint duathlon"), goal: L("Běh 5 km, kolo 20 km, běh 2,5 km", "5 km run, 20 km ride, 2.5 km run"),
    description: L("10 týdnů: dvě jízdy a tři běhy, jeden klíčový trénink na sport a od budování běh hned po kole. Každý čtvrtý týden lehčí, týden ladění formy.", "10 weeks: two rides and three runs, one key session per sport and a run straight after the ride from the build. Every fourth week is lighter, a taper week.") },
  { id: "du-standard", sport: "triathlon", sports: ["ride", "run"], weeks: triWeeks(12, { ride: [75, 150], run: [45, 80], swim: [1, 1], brick: 30, only: ["ride", "run"] }), days: [5, 7], perSport: { ride: 3, run: 3 }, level: "intermediate", race: { km: 55, tri: "du-standard" },
    name: L("Standardní duatlon", "Standard duathlon"), goal: L("Běh 10 km, kolo 40 km, běh 5 km", "10 km run, 40 km ride, 5 km run"),
    description: L("12 týdnů: tři jízdy a tři běhy, práh na kole i v běhu a od budování běh hned po kole, na unavených nohou. Každý čtvrtý týden lehčí, týden ladění formy.", "12 weeks: three rides and three runs, threshold on the bike and the run, and a run straight after the ride from the build, on tired legs. Every fourth week is lighter, a taper week.") },
  { id: "aquabike", sport: "triathlon", sports: ["ride", "swim"], weeks: triWeeks(12, { ride: [75, 150], run: [1, 1], swim: [3, 7], brick: 0, only: ["ride", "swim"] }), days: [4, 6], perSport: { ride: 3, swim: 3 }, level: "intermediate", race: { km: 41.5, tri: "aquabike" },
    name: L("Aquabike", "Aquabike"), goal: L("Plavání 1,5 km, kolo 40 km", "1.5 km swim, 40 km ride"),
    description: L("12 týdnů: tři plavání a tři jízdy, CSS v bazénu a práh na kole, bez běhu. Každý čtvrtý týden lehčí, týden ladění formy.", "12 weeks: three swims and three rides, CSS in the pool and threshold on the bike, no running. Every fourth week is lighter, a taper week.") },
  // The long aquabikes (TrainingPeaks: 14–18 weeks for the half, about 22 for
  // the full): the ride ends the race, so it can be harder than a triathlon's.
  { id: "aquabike-half", sport: "triathlon", sports: ["ride", "swim"], weeks: triWeeks(16, { taper: 2, ride: [90, 210], run: [1, 1], swim: [4, 7], brick: 0, only: ["ride", "swim"] }), days: [5, 7], perSport: { ride: 3, swim: 3 }, level: "advanced", race: { km: 91.9, tri: "aquabike-half" },
    name: L("Poloviční aquabike", "Half aquabike"), goal: L("Plavání 1,9 km, kolo 90 km", "1.9 km swim, 90 km ride"),
    description: L("16 týdnů: tři plavání a tři jízdy, dlouhá jízda do tří a půl hodiny, CSS v bazénu a práh na kole. Každý čtvrtý týden lehčí, dva týdny ladění formy.", "16 weeks: three swims and three rides, a long ride up to three and a half hours, CSS in the pool and threshold on the bike. Every fourth week is lighter, a two-week taper.") },
  { id: "aquabike-full", sport: "triathlon", sports: ["ride", "swim"], weeks: triWeeks(20, { taper: 2, ride: [120, 330], run: [1, 1], swim: [5, 7], brick: 0, only: ["ride", "swim"] }), days: [5, 7], perSport: { ride: 3, swim: 3 }, level: "advanced", race: { km: 183.8, tri: "aquabike-full" },
    name: L("Dlouhý aquabike", "Full aquabike"), goal: L("Plavání 3,8 km, kolo 180 km", "3.8 km swim, 180 km ride"),
    description: L("20 týdnů: tři plavání a tři jízdy, dlouhá jízda do pěti a půl hodiny a jídlo trénované na dlouhých dnech. Každý čtvrtý týden lehčí, dva týdny ladění formy.", "20 weeks: three swims and three rides, a long ride up to five and a half hours and fuelling practised on the long days. Every fourth week is lighter, a two-week taper.") },
  { id: "aquathlon", sport: "triathlon", sports: ["run", "swim"], weeks: triWeeks(10, { ride: [1, 1], run: [35, 60], swim: [2, 6], brick: 0, only: ["run", "swim"] }), days: [4, 6], perSport: { run: 3, swim: 3 }, level: "beginner", race: { km: 6, tri: "aquathlon" },
    name: L("Aquatlon", "Aquathlon"), goal: L("Plavání 1 km, běh 5 km", "1 km swim, 5 km run"),
    description: L("10 týdnů: tři plavání a tři běhy, CSS v bazénu a tempo v běhu. Každý čtvrtý týden lehčí, týden ladění formy.", "10 weeks: three swims and three runs, CSS in the pool and tempo running. Every fourth week is lighter, a taper week.") },
  // Without a race: two or three sports the athlete picks, six sessions a week
  // shared among them, a key session per sport, no bricks.
  { id: "multi-base", sport: "triathlon", choose: true, weeks: triWeeks(12, { ride: [60, 150], run: [40, 80], swim: [2, 6], brick: 0, race: false }), days: [4, 7], perSport: { ride: 2, run: 2, swim: 2 }, level: "intermediate",
    name: L("Multisport", "Multisport"), goal: L("Kondice ve dvou nebo třech sportech", "Fitness in two or three sports"),
    description: L("12 týdnů bez závodu: vyber si dva nebo tři sporty. Šest tréninků týdně se mezi ně rozdělí, každý sport má jeden klíčový trénink. Každý čtvrtý týden lehčí.", "12 weeks without a race: pick two or three sports. Six sessions a week are shared among them, each sport has one key session. Every fourth week is lighter.") }
];
// The sports a plan trains: a multisport plan its race's (a triathlon all three)
// or the ones the athlete picked (`plan.sports`, Ride, Run, Swim order).
// `of`: a sport, a template or a plan.
export function planSports(of) {
  const template = typeof of === "string" ? null : of?.template || (of?.templateId ? getTemplate(of.templateId) : of);
  const sport = typeof of === "string" ? of : template?.sport || of?.sport;
  if (sport !== "triathlon") return sport ? [sport] : [];
  // A plan that picks its sports without them (started from an older app): ride and run.
  if (template?.choose) return chosenSports(of?.sports) || ["ride", "run"];
  return template?.sports || TRI_SPORTS;
}
// The sports a plan's done sessions count in: a plan with picked sports all
// three, so weeks before a change of sports keep what was done.
export function planDoneSports(of) {
  const template = typeof of === "string" ? null : of?.template || (of?.templateId ? getTemplate(of.templateId) : of);
  return template?.choose ? TRI_SPORTS : planSports(of);
}
// Two or three of ride, run and swim in the app's order, or null.
export const chosenSports = list => { const s = TRI_SPORTS.filter(x => [].concat(list || []).includes(x)); return s.length >= 2 ? s : null; };
// A multisport plan's sessions a week per sport: a plan with picked sports
// shares the template's sessions among them (six: 3 + 3 or 2 + 2 + 2).
export function perSportOf(template, plan = null) {
  if (!template?.perSport) return null;
  const sports = planSports({ ...(plan || {}), template });
  if (!template.choose) return Object.fromEntries(sports.map(s => [s, template.perSport[s] || 0]));
  const total = Object.values(template.perSport).reduce((a, b) => a + b, 0);
  return Object.fromEntries(sports.map((s, i) => [s, Math.floor(total / sports.length) + (i < total % sports.length ? 1 : 0)]));
}
const TEMPLATES = () => [
  { id: "run-5k-start", sport: "run", weeks: RUN_START, days: [3, 3], level: "beginner", race: { km: 5 },
    name: L("Od nuly na 5 km", "Couch to 5 km"), goal: L("Uběhnout 5 km bez zastavení", "Run 5 km without stopping"),
    description: L("Tři běhy týdně, nejdřív s chůzí, na konci souvisle. Pátý týden je lehčí, desátý končí během na 5 km.", "Three runs a week, with walking at first and continuous at the end. Week five is lighter; week ten ends with a 5 km run.") },
  { id: "run-5k", sport: "run", weeks: RUN_5K, days: [3, 5], level: "intermediate", race: { km: 5 },
    name: L("Rychlejší 5 km", "Faster 5 km"), goal: L("Zaběhnout 5 km rychleji", "Run 5 km faster"),
    description: L("8 týdnů: každý týden intervaly VO₂max a práh, dlouhý běh do hodiny a rovinky. Čtvrtý týden lehčí, poslední týden ladění formy a závod.", "8 weeks: VO₂max intervals and threshold every week, a long run up to an hour and strides. Week four is lighter, the last week a taper and the race.") },
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
  { id: "swim-400", sport: "swim", weeks: SWIM_400, days: [3, 3], level: "beginner",
    name: L("Uplavat 400 m", "Learn to swim 400 m"), goal: L("Uplavat 400 m bez zastavení", "Swim 400 m without stopping"),
    description: L("8 týdnů, tři plavání týdně: krátké délky s pauzou a technika, na konci souvislé plavání. Čtvrtý týden je lehčí.", "8 weeks, three swims a week: short lengths with rests and technique, then swimming without stopping at the end. Week four is lighter.") },
  { id: "swim-1500", sport: "swim", weeks: SWIM_1500, days: [3, 4], level: "intermediate",
    name: L("1 500 m bez zastavení", "1,500 m without stopping"), goal: L("Uplavat 1 500 m vcelku", "Swim 1,500 m in one go"),
    description: L("10 týdnů, tři až čtyři plavání týdně: jednou týdně práh (CSS) nebo vytrvalost, souvislé plavání roste ze 400 na 1 500 m. Lehčí týdny 4 a 8.", "10 weeks, three to four swims a week: threshold (CSS) or endurance once a week, and the continuous swim grows from 400 to 1,500 m. Weeks 4 and 8 are lighter.") },
  { id: "swim-css", sport: "swim", weeks: SWIM_CSS, days: [3, 4], level: "intermediate", tests: true,
    name: L("Rychlejší plavání", "Faster swimming"), goal: L("Rychlejší CSS za 10 týdnů", "A faster CSS in 10 weeks"),
    description: L("10 týdnů, tři až čtyři plavání: test CSS v prvním, šestém a desátém týdnu, mezi tím prahové série, které se zrychlují, a jednou týdně rychlost. Lehčí týdny 4 a 8.", "10 weeks, three to four swims: a CSS test in weeks one, six and ten, threshold sets that get faster in between and speed once a week. Lighter weeks 4 and 8.") },
  { id: "swim-open-water", sport: "swim", weeks: SWIM_OPEN_WATER, days: [3, 4], level: "intermediate", race: { km: 3.8, options: [1.5, 3.8, 5], swim: true },
    name: L("Závod ve volné vodě", "Open-water race"), goal: L("1,5, 3,8 nebo 5 km v jezeře či moři", "1.5, 3.8 or 5 km in a lake or the sea"),
    description: L("12 týdnů, tři až čtyři plavání: jednou týdně práh, orientace v bazénu a dlouhé plavání, které roste k délce závodu. Posledních osm týdnů jednou týdně volná voda, nikdy ne sám. Týden ladění formy.", "12 weeks, three to four swims: threshold once a week, sighting in the pool and a long swim that grows towards the race. Open water once a week in the last eight weeks, never alone. A taper week.") },
  { id: "gym-cycling", sport: "gym", weeks: GYM_CYCLING(), days: [2, 4], level: "intermediate",
    name: L("Posilovna ke kolu", "Strength for cyclists"), goal: L("Silnější nohy a stabilní trup na kolo", "Stronger legs and a stable trunk for the bike"),
    description: L("18 týdnů, dva tréninky týdně: od stability a práce na jedné noze k těžké síle s málo opakováními. Zátěž podle RPE, nohy šetří den před náročnou jízdou.", "18 weeks, two sessions a week: from stability and single-leg work to heavy strength with few repetitions. Load by RPE; the legs are spared the day before a hard ride.") },
  { id: "gym-muscle", sport: "gym", weeks: GYM_MUSCLE(), days: [3, 4], level: "intermediate",
    name: L("Svaly", "Muscle"), goal: L("Víc svalů, celé tělo", "More muscle, the whole body"),
    description: L("10 týdnů, tři tréninky celého těla týdně, 8–12 opakování a série přibývají. Čtvrtý týden a poslední jsou lehčí.", "10 weeks, three full-body sessions a week, 8–12 repetitions with sets growing. Week four and the last week are lighter.") },
  { id: "gym-strength", sport: "gym", weeks: GYM_STRENGTH(), days: [3, 4], level: "intermediate", tests: true,
    name: L("Síla", "Strength"), goal: L("Těžší dřep, bench a mrtvý tah", "A heavier squat, bench and deadlift"),
    description: L("12 týdnů, tři tréninky týdně. Na začátku a na konci test síly, mezi tím objem a pak síla s málo opakováními, každý čtvrtý týden lehčí.", "12 weeks, three sessions a week. A strength test at the start and the end, volume first and then heavy strength with few repetitions, every fourth week lighter.") },
  { id: "gym-running", sport: "gym", weeks: GYM_RUNNING(), days: [2, 3], level: "beginner",
    name: L("Posilovna k běhu", "Strength for runners"), goal: L("Silné nohy a trup na běh", "Strong legs and trunk for running"),
    description: L("10 týdnů, dva tréninky týdně: práce na jedné noze, lýtka, zadní strana stehen a trup. Nohy šetří den před klíčovým během.", "10 weeks, two sessions a week: single-leg work, calves, hamstrings and the trunk. The legs are spared the day before a key run.") },
  { id: "gym-swimming", sport: "gym", weeks: GYM_SWIMMING(), days: [2, 3], level: "beginner",
    name: L("Posilovna k plavání", "Strength for swimmers"), goal: L("Tahy, ramena, trup a odraz", "Pulling, shoulders, trunk and push-off"),
    description: L("10 týdnů, dva tréninky týdně: stahování a přítahy, vnější rotace ramene, lopatky, trup a výskoky pro odraz od stěny. Hodí se i k triatlonu.", "10 weeks, two sessions a week: pulldowns and rows, shoulder external rotation, the shoulder blades, the trunk and jumps for the push-off from the wall. Suits triathletes too.") },
  { id: "gym-home", sport: "gym", weeks: GYM_HOME(), days: [3, 4], level: "beginner", equipment: "bodyweight",
    name: L("Doma bez vybavení", "At home, no equipment"), goal: L("Jen s vlastní vahou", "Body weight only"),
    description: L("8 týdnů, tři tréninky týdně jen s vlastní vahou, ať máš vybrané jakékoli vybavení. Přibývají série a opakování.", "8 weeks, three sessions a week with body weight only, whatever equipment you have chosen. Sets and repetitions grow.") },
  { id: "ride-granfondo", sport: "ride", weeks: RIDE_GRANFONDO, days: [3, 6], level: "intermediate", race: { km: 160, options: [100, 160, 200], ride: "granfondo" },
    name: L("Gran fondo", "Gran fondo"), goal: L("Dlouhý závod 100–200 km", "A long race of 100–200 km"),
    description: L("12 týdnů: dlouhé jízdy až do pěti hodin, sweet spot a práh, lehčí týdny 4 a 8, týden ladění formy před závodem.", "12 weeks: long rides up to five hours, sweet spot and threshold, lighter weeks 4 and 8, a taper week before the race.") },
  { id: "ride-mtb", sport: "ride", weeks: RIDE_MTB, days: [3, 6], level: "intermediate", race: { km: 80, options: [50, 80, 100], ride: "mtb" },
    name: L("MTB maraton", "MTB marathon"), goal: L("50–100 km v terénu", "50–100 km off-road"),
    description: L("10 týdnů: dlouhé jízdy, VO₂max a krátké nástupy do kopců, práh s nástupy, lehčí týdny 4 a 7, týden ladění formy.", "10 weeks: long rides, VO₂max and short surges for the climbs, threshold with surges, lighter weeks 4 and 7, a taper week.") },
  { id: "ride-tt", sport: "ride", weeks: RIDE_TT, days: [3, 5], level: "intermediate", race: { km: 40, options: [20, 40], ride: "tt" },
    name: L("Časovka", "Time trial"), goal: L("Rychlejší časovka 20–40 km", "A faster 20–40 km time trial"),
    description: L("8 týdnů: čím dál delší čas na prahu a VO₂max, čtvrtý týden lehčí, týden ladění formy před závodem.", "8 weeks: ever longer time at threshold and VO₂max, the fourth week lighter, a taper week before the race.") },
  { id: "ride-climb", sport: "ride", weeks: RIDE_CLIMB, days: [3, 5], level: "intermediate", race: { km: 10, options: [5, 10, 15], ride: "climb" },
    name: L("Závod do kopce", "Hill climb"), goal: L("Výjezd na čas", "A climb against the clock"),
    description: L("8 týdnů: práh a VO₂max, silová jízda v nízké kadenci, čtvrtý týden lehčí, týden ladění formy před závodem.", "8 weeks: threshold and VO₂max, low-cadence force work, the fourth week lighter, a taper week before the race.") },
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
export const planTemplates = () => [...TEMPLATES(), ...TRI_TEMPLATES()];
// The starter plan of every sport is free; every other plan is an Aurin Pro
// "adaptive training plan" once the paywall is on (paywallOn in subscription.js; Petr, 3 Nov 2026).
// A plan already running goes on to its end.
export const FREE_PLANS = new Set(["ride-base", "run-5k-start", "swim-400", "gym-muscle", "tri-sprint"]);
export const getTemplate = id => planTemplates().find(t => t.id === id) || null;

// ---- the catalogue -------------------------------------------------------------
const CATALOGUE = { ride: CYCLING_WORKOUTS, run: RUNNING_WORKOUTS, swim: SWIMMING_WORKOUTS };
const LIMITS = { ride: [30, MAX_MINUTES.ride], run: [20, MAX_MINUTES.run], swim: [15, 120] };
const familyLevels = (sport, family) => [...new Set(CATALOGUE[sport].filter(w => w.family === family).map(w => w.level).filter(Number.isFinite))].sort((a, b) => a - b);
// A key session one or two levels easier for a beginner, up to three harder for
// a strong athlete (their capability in that energy system, level 3 = normal,
// "experienced" starts at 4 and climbs with each workout done well).
export const levelShift = capability => clamp(Math.round((Number(capability?.level) || 3) - 3), -2, 3);
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
  // A swim keeps its metres: never resized to a length.
  if (sport === "swim") return best.id;
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
// The cycling catalogue names its sessions in English; in Czech the plan says Práh, Nad/pod prahem.
export const planName = name => name == null ? name : L(String(name).replace(/ \(\d+\/\d+\)/, "").replace("Threshold Over-Under", "Nad/pod prahem").replace("Over-Under", "Nad/pod prahem").replace("Sub-threshold", "Pod prahem").replace("Threshold", "Práh").replace("Sweet Spot", "Sweet spot"), String(name));
// A swim is named in both languages in its catalogue (swimming-workouts.js).
// The catalog is in Czech: in English a swim takes its English twin, a run or ride its English name
// ("Fartlek pyramida 1-2-3-2-1" was left in English plans' week keys and session labels).
const baseName = id => {
  let w = Object.values(CATALOGUE).flat().find(x => x.id === String(id).replace(/~\d+$/, ""));
  if (!w) return null;
  if (w.sport === "swim") w = L(w, SWIMMING_WORKOUTS_EN.find(x => x.id === w.id) || w);
  const name = w.sport === "swim" ? w.name : L(w.name, workoutNameEn(w.name));
  return name.replace(/ · \d+ min$/, "");
};

// A plan's test session by sport.
const testLabel = sport => sport === "run" ? L("Běžecký test", "Run test") : sport === "swim" ? L("Test CSS", "CSS test") : L("Test FTP", "FTP test");
// The level of a swim family whose main swim is the longest up to `meters`
// (the open-water plan's long swim as a share of its race; "swim-continuous-3000"
// swims 3000 m besides its warm-up); its first level when even that is longer.
function swimLevelFor(family, meters) {
  const list = CATALOGUE.swim.filter(w => w.family === family).sort((a, b) => a.level - b.level);
  const main = w => Number(w.id.slice(family.length + 1)) || w.distance_meters;
  return (list.filter(w => main(w) <= meters).at(-1) || list[0])?.level ?? null;
}

// ---- race day ----------------------------------------------------------------
// Running: race pace against threshold speed (race-estimate.js RACE_PACE), or
// the pace of the athlete's goal time. Without a threshold pace, 6:40/km: a
// first race should not start too fast.
export const raceMinutes = (km, thresholdPace) => Math.round(km * (Number(thresholdPace) > 0 ? Number(thresholdPace) : 400) / (RACE_PACE(km) / 100) / 60);
// "race-run-<km>-<minutes>", with "-p<pace>" the goal pace as % of threshold speed.
export const raceId = (km, minutes, pace = null) => `race-run-${String(km).replace(".", "_")}-${minutes}` + (pace ? `-p${pace}` : "");
// Cycling: "race-ride-<race>-<km>-<minutes>"; the power follows the race (race-estimate.js rideRace).
export const rideRaceId = (kind, km, minutes) => `race-ride-${kind}-${String(km).replace(".", "_")}-${minutes}`;
const RIDE_RACE_NAMES = () => ({ granfondo: L("Gran fondo", "Gran fondo"), mtb: L("MTB maraton", "MTB marathon"), tt: L("Časovka", "Time trial"), climb: L("Závod do kopce", "Hill climb"), "du-short": L("Duatlon: kolo", "Duathlon: bike"), aquabike: L("Aquabike: kolo", "Aquabike: bike"), "aquabike-half": L("Aquabike: kolo", "Aquabike: bike"), "aquabike-full": L("Aquabike: kolo", "Aquabike: bike"), "tri-short": L("Triatlon: kolo", "Triathlon: bike"), "tri-half": L("Triatlon: kolo", "Triathlon: bike"), "tri-full": L("Triatlon: kolo", "Triathlon: bike") });
// A triathlon's swim: "race-swim-<metres>-<minutes>", a little slower than CSS the longer it is.
export const swimRaceId = (meters, minutes) => `race-swim-${meters}-${minutes}`;
const swimRaceShare = meters => meters <= 750 ? 97 : meters <= 1500 ? 95 : meters <= 1900 ? 93 : meters <= 3800 ? 90 : 88;
// A swim race on its own in open water: its share of CSS, about 3 % slower
// without walls to push off (sighting, waves); without a CSS 2:00 /100 m.
export const openWaterMinutes = (meters, swimCss = null) => {
  const css = Number(swimCss) >= 60 && Number(swimCss) <= 240 ? Number(swimCss) : 120;
  return Math.round(meters / 100 * css * 100 / swimRaceShare(meters) * 1.03 / 60);
};
// The run after the ride: about 6 % slower than the same race fresh; after a
// swim about 3 %; a duathlon's first run held back about 2 % for what follows.
const TRI_RUN = 1.06, RUN_AFTER = { ride: TRI_RUN, swim: 1.03, none: 1.02 };
// A multisport race day: its legs in order, each with its minutes and workout
// (`legs`), the first leg of each sport also by sport (`swim`, `ride`, `run`).
export function triRaceDay(tri, { thresholdPace = null, ftp = null, weight = null, swimCss = null } = {}) {
  const r = TRI_RACES[tri];
  if (!r) return null;
  const css = Number(swimCss) >= 60 && Number(swimCss) <= 240 ? Number(swimCss) : 120;
  const legs = raceLegs(r).map(([sport, distance], i, all) => {
    if (sport === "swim") {
      const minutes = Math.round(distance / 100 * css * 100 / swimRaceShare(distance) / 60);
      return { sport, meters: distance, minutes, workoutId: swimRaceId(distance, minutes) };
    }
    if (sport === "ride") {
      const ride = rideRace(r.ride_kind, distance, { ftp, weight });
      return { sport, km: distance, minutes: ride.minutes, workoutId: rideRaceId(r.ride_kind, distance, ride.minutes) + "-leg" };
    }
    const slower = RUN_AFTER[all[i - 1]?.[0] || "none"], minutes = Math.round(raceMinutes(distance, thresholdPace) * slower);
    // "-leg": only the race, so the next leg starts when this one ends (planned-links.js).
    return { sport, km: distance, minutes, workoutId: raceId(distance, minutes, Math.round(RACE_PACE(distance) / slower)) + "-leg" };
  });
  return {
    legs, ...Object.fromEntries(TRI_SPORTS.map(s => [s, legs.find(x => x.sport === s)]).filter(([, x]) => x)),
    minutes: legs.reduce((sum, x) => sum + x.minutes, 0) + 5 * (legs.length - 1)
  };
}
// The race day of a plan: its minutes and workout. `target` is the goal time
// in seconds of a running race.
export function raceDay(template, km, { thresholdPace = null, ftp = null, weight = null, target = null, swimCss = null } = {}) {
  if (template?.sport === "swim") { const meters = Math.round(km * 1000), minutes = openWaterMinutes(meters, swimCss); return { minutes, workoutId: swimRaceId(meters, minutes) + "-ow" }; }
  const kind = template?.race?.ride;
  if (template?.sport === "ride" && RIDE_RACES[kind]) {
    const r = rideRace(kind, km, { ftp, weight });
    return { minutes: r.minutes, workoutId: rideRaceId(kind, km, r.minutes) };
  }
  if (Number(target) > 0) {
    const minutes = Math.round(Number(target) / 60), pace = Number(thresholdPace) > 0 ? Math.round(Number(thresholdPace) * km / Number(target) * 100) : null;
    return { minutes, workoutId: raceId(km, minutes, pace && pace >= 60 && pace <= 130 ? pace : null) };
  }
  const minutes = raceMinutes(km, thresholdPace);
  return { minutes, workoutId: raceId(km, minutes) };
}
export function raceWorkout(id) {
  const swim = String(id).match(/^race-swim-(\d{3,4})-(\d{1,3})(-ow)?$/);
  if (swim) return swimRaceWorkout(id, Number(swim[1]), Number(swim[2]), Boolean(swim[3]));
  const ride = String(id).match(/^race-ride-(granfondo|mtb|tt|climb|du-short|aquabike-half|aquabike-full|aquabike|tri-short|tri-half|tri-full)-(\d+(?:_\d)?)-(\d{1,3})(-leg)?$/);
  if (ride) return rideRaceWorkout(id, ride[1], Number(ride[2].replace("_", ".")), Number(ride[3]), Boolean(ride[4]));
  const m = String(id).match(/^race-run-(\d+(?:_\d)?)-(\d{1,3})(?:-p(\d{2,3}))?(-leg)?$/);
  if (!m) return null;
  const km = Number(m[1].replace("_", ".")), minutes = Number(m[2]), goal = m[3] ? Number(m[3]) : null, pace = goal || RACE_PACE(km), short = km <= 21.1, leg = Boolean(m[4]);
  // A multisport race's run ("-leg"): the race itself, the clock already running.
  if (leg) return buildWorkout({
    id, sport: "run", name: L(`Závod ${km} km`, `Race ${km} km`), system: km <= 10 ? "threshold" : km <= 21.1 ? "tempo" : "endurance", family: "race", tags: ["race"],
    structure: [step(minutes, pace, null, L("závodní tempo, první kilometr na nohy z předchozí části", "race pace, the first kilometre to find your legs after the last leg"))],
    description: L(`${km} km v závodním tempu. Prvním kilometrem si najdi krok, pak drž tempo.`, `${km} km at race pace. Find your stride in the first kilometre, then hold the pace.`)
  });
  const label = km === 42.2 ? L("Maraton", "Marathon") : km === 21.1 ? L("Půlmaraton", "Half marathon") : L(`Závod ${km} km`, `Race ${km} km`);
  return buildWorkout({
    id, sport: "run", name: label, system: km <= 10 ? "threshold" : km <= 21.1 ? "tempo" : "endurance", family: "race", tags: ["race"],
    structure: [...(short ? [step(10, 76, null, L("rozklus a pár rovinek", "warm-up jog and a few strides"))] : []), step(minutes, pace, null, goal ? L("tempo na cílový čas, první kilometry s rezervou", "goal-time pace, the first kilometres with something in hand") : L("závodní tempo, první kilometry s rezervou", "race pace, the first kilometres with something in hand")), step(short ? 10 : 5, 65, null, L("výklus nebo chůze", "cool-down jog or walk"))],
    description: goal
      ? L(`${km} km. Tempo vychází z tvého cílového času; začni opatrně a zrychli v druhé polovině.`, `${km} km. The pace comes from your goal time; start carefully and pick it up in the second half.`)
      : L(`${km} km. Tempo vychází z tvého prahového tempa; začni opatrně a zrychli v druhé polovině.`, `${km} km. The pace comes from your threshold pace; start carefully and pick it up in the second half.`)
  });
}
// A multisport race's swim: steady at its share of CSS, the first 200 m calmer.
// The open-water race of a swim plan ("-ow"): the whole race, sighting and
// food on the long ones.
function swimRaceWorkout(id, meters, minutes, openWater = false) {
  const share = swimRaceShare(meters);
  return buildWorkout({
    id, sport: "swim", name: openWater ? L(`Závod ve volné vodě ${meters} m`, `Open-water race ${meters} m`) : L(`Závod: plavání ${meters} m`, `Race swim ${meters} m`), system: meters <= 1500 ? "threshold" : "endurance", family: "race", tags: ["race"],
    structure: [{ ...step(minutes, share, null, openWater ? L("závodní tempo, start klidně, dopředu se dívej každých 6–8 záběrů", "race pace, start calmly, look ahead every 6–8 strokes") : L("závodní tempo, prvních 200 m klidně a najdi si místo", "race pace, the first 200 m calm while you find your space")), meters }],
    description: openWater
      ? L(`${meters} m kolem ${share} % CSS. Začni klidně a najdi si místo, plav rovnoměrně za nohama rychlejšího plavce, když to jde.${meters >= 3800 ? " Na občerstvovacích bójkách pij a vezmi si sacharidy." : ""} Ve studené vodě neopren a pomalý start.`, `${meters} m at about ${share} % of CSS. Start calmly and find your space, swim evenly on the feet of a faster swimmer when you can.${meters >= 3800 ? " Drink and take carbs at the feed buoys." : ""} In cold water a wetsuit and a slow start.`)
      : L(`${meters} m kolem ${share} % CSS. Plav rovnoměrně, závod po plavání pokračuje.`, `${meters} m at about ${share} % of CSS. Swim evenly; the race goes on after the swim.`)
  });
}
// A cycling race day: a gran fondo and an MTB marathon at their share of FTP
// with food every hour; a time trial and a hill climb after a warm-up with a
// short effort, at the power the duration allows.
// leg: a multisport race's ride, only the race itself (no warm-up, the clock is running).
function rideRaceWorkout(id, kind, km, minutes, leg = false) {
  const race = RIDE_RACES[kind], name = RIDE_RACE_NAMES()[kind] + " " + km + " km";
  const steady = Boolean(race.low), share = steady ? Math.round((race.low + race.high) * 50) : Math.round(durationShare(minutes) * 100);
  const structure = leg && !steady ? [step(minutes, share, null, L("závod: rovnoměrně, posledních pár minut naplno", "race: even, the last few minutes all out"))] : steady
    ? [step(minutes, share, null, L("závodní tempo, první hodinu u spodní hranice", "race pace, the first hour at the low end"))]
    : [step(15, 55, null, L("rozjetí", "warm-up")), step(3, 95, null, L("krátce v závodním tempu", "briefly at race pace")), step(5, 50, null, L("volně", "easy")),
       step(minutes, share, null, L("závod: rovnoměrně, posledních pár minut naplno", "race: even, the last few minutes all out")), step(10, 50, null, L("vyjetí", "cool-down"))];
  const description = steady
    ? L(`${km} km. Drž ${Math.round(race.low * 100)}–${Math.round(race.high * 100)} % FTP, do kopců nejvýš ${kind === "mtb" ? 105 : 90} % FTP. Jez 60–90 g sacharidů za hodinu a pij od začátku.`, `${km} km. Hold ${Math.round(race.low * 100)}–${Math.round(race.high * 100)} % of FTP, no more than ${kind === "mtb" ? 105 : 90} % of FTP on the climbs. Eat 60–90 g of carbohydrate an hour and drink from the start.`)
    : L(`${km} km${kind === "climb" ? " do kopce" : ""}. Kolem ${share} % FTP po celou dobu, prvních pět minut spíš o kousek níž.`, `${km} km${kind === "climb" ? " uphill" : ""}. About ${share} % of FTP the whole way, the first five minutes a little lower.`);
  return buildWorkout({ id, sport: "ride", name, system: steady ? "endurance" : "threshold", family: "race", tags: ["race"], structure, description });
}

// ---- the plan in a given week -------------------------------------------------
// An active plan: { templateId, startDate (a Monday), raceDate, raceKm }.
export function planWeek(plan, date) {
  const template = plan && getTemplate(plan.templateId);
  if (!template) return null;
  const raw = Math.floor(daysBetween(plan.startDate, mondayOf(date)) / 7);
  // A lighter week chosen before repeating the first week falls before the start.
  let index = raw === -1 && (plan.lightWeeks || []).includes(mondayOf(date)) ? 0 : raw;
  if (index < 0 || index >= template.weeks.length) return null;
  const monday = mondayOf(date), position = index;
  // The recovery week moved sooner (trendProposal): it takes this week's place, this week takes its place.
  const pulled = plan.pulled;
  if (pulled && monday === pulled.at) index = pulled.from;
  else if (pulled && index === pulled.from && monday > pulled.at) index = pulled.to;
  const week = template.weeks[index];
  // A multisport plan with picked sports: only their sessions.
  const picked = template.choose ? planSports({ ...plan, template }) : null;
  const base = picked ? { ...week, q: week.q.filter(k => picked.includes(k.sport)), sports: Object.fromEntries(picked.map(s => [s, week.sports[s]])) } : week;
  // Back after an illness or a break in a race plan (the race date stays):
  // the first week or two are lighter, with one key session at most.
  const returning = !base.race && plan.returnFrom && monday >= plan.returnFrom && monday < shift(plan.returnFrom, 7 * (plan.returnWeeks || 1));
  // A lighter week the athlete chose in a review, before repeating a week.
  const light = !base.race && (plan.lightWeeks || []).includes(monday);
  // A level up from a Monday on (trendProposal): harder key sessions and 5 % more time, never in a lighter week.
  const up = plan.stepUp && monday >= plan.stepUp.from && !["recovery", "taper", "race", "test"].includes(base.phase) && !base.race ? plan.stepUp.by : 0;
  const spec = light ? { ...base, phase: "recovery", load: Math.min(base.load, .65), q: [], light: true }
    : returning ? { ...base, load: Math.min(base.load, .8), q: base.q.slice(0, 1), returning: true }
    : up ? { ...base, load: Math.round(base.load * 1.05 * 100) / 100, stepUp: up } : base;
  return { template, index, week: position + 1, weeks: template.weeks.length, spec, monday, ...(pulled && monday === pulled.at ? { pulled: true } : {}) };
}
// The plan as it was made, without the changes of the athlete (moved,
// shortened, skipped sessions, fewer days) and of the app (a lighter week, a
// week back after a break): what planChanges compares a week against.
export const planOriginal = plan => plan && { ...plan, moves: [], edits: {}, lightWeeks: [], returnFrom: null, weekDays: {}, pulled: null, stepUp: null };
// The quality days the week planner should make for the plan's week.
export const planQuality = pw => pw ? pw.spec.q.length : null;

// The phase as a heading: a test week of a ride plan is the FTP test.
const phaseLabel = (phase, sport = null) => ({ base: L("Základ", "Base"), build: L("Budování", "Build"), peak: L("Vrchol", "Peak"), recovery: L("Odpočinek", "Recovery"), taper: L("Ladění", "Taper"), race: L("Závod", "Race"), test: sport === "ride" || sport === "run" || sport === "swim" ? testLabel(sport) : L("Test", "Test") })[phase] || phase;
export { phaseLabel };

// The plan on the week's load targets (week-planner.js weekTargets items):
// each item of the plan's sport gets its session, the long day its length.
// Items are { date, sport, slot, role, minutes, tss, intensity }.
// `shifts` is the athlete's capabilities by energy system (workout-library.js
// getCapabilities): a beginner's key sessions are easier, see levelShift.
// `done` is the set of dates with a session of the plan's sport so far and
// `today` the athlete's day: a key session (intervals, a test, the long one)
// missed on an earlier day moves to the next easy day of the week that is
// not next to another key day.
// The plan's sport's sessions without a family of their own.
const EASY_FAMILY = { ride: "z2", run: "run-easy", swim: "swim-recovery" };
const LONG_FAMILY = { ride: "z2", run: "run-long", swim: "swim-endurance" };
const RECOVERY_FAMILY = { ride: "z2", run: "run-recovery", swim: "swim-recovery" };
export function applyPlan(targets, plan, weekStart, { thresholdPace = null, hasPower = true, shifts = {}, ftp = null, weight = null, swimCss = null } = {}) {
  const pw = planWeek(plan, weekStart);
  if (!pw || !targets?.items || pw.template.sport === "gym") return targets;
  if (pw.template.sport === "triathlon") return applyTriathlon(targets, plan, weekStart, pw, { thresholdPace, shifts, ftp, weight, swimCss });
  const { template, spec } = pw, sport = template.sport;
  const race = template.race && plan.raceDate && plan.raceDate >= weekStart && plan.raceDate <= shift(weekStart, 6) ? plan.raceDate : null;
  const raceKm = Number(plan.raceKm) || template.race?.km;
  const day = race ? raceDay(template, raceKm, { thresholdPace, ftp, weight, target: plan.target, swimCss }) : null;
  const weekEnd = shift(weekStart, 7), inWeek = d => d >= weekStart && d < weekEnd;
  // Started mid-week: nothing of the plan before its first day.
  let items = targets.items.map(x => ({ ...x }));
  if (plan.firstDay && plan.firstDay > weekStart && plan.firstDay < shift(weekStart, 7)) {
    const before = x => x.sport === sport && x.date < plan.firstDay;
    // Its key sessions go to the days left, not next to each other.
    let lost = items.filter(x => before(x) && x.role === "quality").length;
    items = items.filter(x => !before(x));
    for (const x of items) {
      if (!lost || x.sport !== sport || (x.slot || 0) !== 0 || ["quality", "long"].includes(x.role)) continue;
      if (items.some(y => y.sport === sport && y.role === "quality" && Math.abs(daysBetween(y.date, x.date)) === 1)) continue;
      x.role = "quality"; lost--;
    }
  }
  // The athlete's own changes this week: a session moved to another day, shortened or skipped.
  const edits = Object.entries(plan.edits || {}).filter(([d]) => inWeek(d)), ownAt = d => items.find(x => x.sport === sport && (x.slot || 0) === 0 && x.date === d);
  const swaps = edits.filter(([d, e]) => e.to && inWeek(e.to) && ownAt(d)).map(([d, e]) => ({ from: d, to: e.to, swap: Boolean(ownAt(e.to)) }));
  for (const m of swaps) if (!m.swap) items.push({ date: m.to, sport, slot: 0, role: "endurance", minutes: ownAt(m.from).minutes, tss: 0, intensity: .7 });
  // A missed key session moved to another day (the athlete's choice, planChoice):
  // the day gets a session of the sport if it has none.
  const moves = (plan.moves || []).filter(m => m.to && m.from >= weekStart && m.from < shift(weekStart, 7) && m.to >= weekStart && m.to < shift(weekStart, 7));
  for (const m of moves) if (!items.some(x => x.sport === sport && (x.slot || 0) === 0 && x.date === m.to)) items.push({ date: m.to, sport, slot: 0, role: "endurance", minutes: items.find(x => x.sport === sport && x.date === m.from)?.minutes || 45, tss: 0, intensity: .7 });
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.slot || 0) - (b.slot || 0));
  // Nothing of the plan's sport after the race; the race day gets a chip if it has none.
  if (race) {
    items = items.filter(x => x.sport !== sport || x.date <= race);
    if (!items.some(x => x.sport === sport && x.date === race)) items.push({ date: race, sport, slot: 0, role: "race", minutes: day.minutes, tss: 0, intensity: .9 });
    items.sort((a, b) => a.date.localeCompare(b.date) || (a.slot || 0) - (b.slot || 0));
  }
  const own = items.filter(x => x.sport === sport && (x.slot || 0) === 0);
  const quality = own.filter(x => x.role === "quality" && x.date !== race);
  // A ride plan's long ride (a gran fondo's up to five hours) needs a day even
  // when the week has no long one: the last easy day, at a weekend if it can.
  const easyDays = own.filter(x => x.role !== "quality" && x.role !== "race" && x.date !== race && !(race && daysBetween(x.date, race) <= 1));
  const longDay = own.find(x => x.role === "long" && x.date !== race) || (sport === "ride" && spec.long?.minutes ? easyDays.filter(x => weekdayOf(x.date) >= 5).at(-1) || easyDays.at(-1) : undefined);
  let stridesLeft = spec.strides ? 1 : 0;
  const sessionFor = x => {
    if (x.date === race) return { kind: "race", km: raceKm, workoutId: day.workoutId, label: raceWorkout(day.workoutId)?.name };
    if (race && daysBetween(x.date, race) === 1) return sport === "swim" ? { kind: "easy", family: "swim-recovery", level: 1 } : { kind: "easy", family: sport === "run" ? "run-easy-strides" : "z2-cadence", minutes: sport === "run" ? 25 : 45 };
    const k = quality.indexOf(x);
    if (k >= 0 && spec.q[k]) {
      if (spec.q[k].test) return { kind: "test", workoutId: testFor(sport, hasPower), ...(sport === "swim" ? { minutes: 45 } : {}) };
      return { kind: "quality", ...spec.q[k] };
    }
    if (x === longDay && spec.long) return { kind: "long", family: spec.long.family || spec.easy?.family || LONG_FAMILY[sport], level: spec.long.share ? swimLevelFor(spec.long.family, spec.long.share * raceKm * 1000) : spec.long.level ?? spec.easy?.level ?? null, minutes: spec.long.minutes ?? spec.easy?.minutes ?? null };
    if (x === longDay && spec.easy?.minutes) return { kind: "long", family: spec.easy.family, level: spec.easy.level ?? null, minutes: spec.easy.minutes };
    if (longDay && spec.backToBack && daysBetween(longDay.date, x.date) === 1) return { kind: "long", family: LONG_FAMILY[sport], minutes: spec.backToBack };
    if (x.role === "recovery" && !spec.easy) return { kind: "recovery", family: RECOVERY_FAMILY[sport] };
    if (stridesLeft && sport === "run" && !spec.easy) { stridesLeft--; return { kind: "easy", family: "run-easy-strides" }; }
    return { kind: "easy", family: spec.easy?.family || EASY_FAMILY[sport], level: spec.easy?.level ?? null, minutes: spec.easy?.minutes ?? null };
  };
  const moved = new Map(), dropped = new Set(edits.filter(([, e]) => e.skip).map(([d]) => d));
  if (moves.length || swaps.length) {
    const planned = new Map(own.map(x => [x.date, sessionFor(x)]));
    stridesLeft = spec.strides ? 1 : 0;
    for (const m of moves) { const s = planned.get(m.from), to = own.find(x => x.date === m.to); if (s && to) moved.set(to, { ...s, movedFrom: m.from }); }
    for (const m of swaps) {
      const a = planned.get(m.from), b = planned.get(m.to), from = own.find(x => x.date === m.from), to = own.find(x => x.date === m.to);
      if (a && to) moved.set(to, { ...a, movedFrom: m.from });
      if (m.swap && b && from) moved.set(from, { ...b, movedFrom: m.to }); else dropped.add(m.from);
    }
  }
  const shortened = Object.fromEntries(edits.filter(([, e]) => Number(e.minutes) > 0).map(([d, e]) => [d, Math.round(Number(e.minutes))]));
  const roleOf = s => s.kind === "quality" || s.kind === "test" ? "quality" : s.kind === "long" ? "long" : s.kind === "race" ? "race" : s.kind === "recovery" ? "recovery" : "endurance";
  const out = items.map(x => {
    if (x.sport !== sport || (x.slot || 0) !== 0) return x;
    const s = moved.get(x) || sessionFor(x), shiftBy = s.kind === "quality" ? levelShift(shifts[systemOf(sport, s.family)]) + (spec.stepUp || 0) : 0;
    const minutes = (s.kind !== "race" && shortened[x.date]) || (s.minutes ?? (s.kind === "race" ? day.minutes : s.kind === "quality" ? Math.max(x.minutes, minutesFor(sport, s, shiftBy) || 0) : s.kind === "test" ? Math.max(x.minutes, 60) : x.minutes));
    const workoutId = s.workoutId || (s.family ? planWorkoutId(sport, s, minutes, shiftBy) : null);
    const label = s.kind === "test" ? testLabel(sport) : s.label || (workoutId && planName(baseName(workoutId))) || x.label;
    const role = roleOf(s), intensity = x.intensity || .7;
    return { ...x, role, label, minutes, tss: Math.round(minutes / 60 * intensity * intensity * 100), plan: { templateId: template.id, week: pw.week, weeks: pw.weeks, phase: spec.phase, kind: s.kind, family: s.family || null, level: s.level ?? null, workoutId, ...(shiftBy ? { shiftBy } : {}), ...(s.movedFrom ? { movedFrom: s.movedFrom } : {}) } };
  });
  let kept = out.filter(x => !(x.sport === sport && (x.slot || 0) === 0 && dropped.has(x.date)));
  // Time for fewer days this week: the easy sessions go first, then the long one; key sessions stay.
  const days = Number(plan.weekDays?.[weekStart]);
  if (days > 0) {
    const mine = kept.filter(x => x.sport === sport && (x.slot || 0) === 0 && x.plan), rank = x => ({ recovery: 0, easy: 1, long: 2 })[x.plan.kind] ?? 9;
    const drop = new Set([...mine].sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date)).filter(x => rank(x) < 9).slice(0, Math.max(0, mine.length - days)));
    kept = kept.filter(x => !drop.has(x));
  }
  return { ...targets, items: kept, plan: { templateId: template.id, name: template.name, week: pw.week, weeks: pw.weeks, phase: spec.phase, phaseLabel: phaseLabel(spec.phase, sport), load: spec.load, returning: Boolean(spec.returning) } };
}

// A triathlon plan's week: per sport, the long session on the day with the
// most time (the ride at a weekend if it can), the key session on another day
// away from that sport's long one and from the other sports' hard days, the
// rest easy; the brick run after the long ride (the athlete's run that day, or
// one added). Race week: the three legs on race day, nothing after it.
// The athlete's skipped and shortened days count; moving a session is for
// single-sport plans.
function applyTriathlon(targets, plan, weekStart, pw, { thresholdPace = null, shifts = {}, ftp = null, weight = null, swimCss = null } = {}) {
  const { template, spec } = pw, weekEnd = shift(weekStart, 7), inWeek = d => d >= weekStart && d < weekEnd;
  const race = plan.raceDate && inWeek(plan.raceDate) ? plan.raceDate : null;
  const day = race && template.race?.tri ? triRaceDay(template.race.tri, { thresholdPace, ftp, weight, swimCss }) : null;
  // The plan's sports only: a duathlete's own swim stays as the athlete planned it.
  const SPORTS = planSports({ ...plan, template }), mine = x => SPORTS.includes(x.sport);
  let items = targets.items.map(x => ({ ...x }));
  if (plan.firstDay && inWeek(plan.firstDay)) items = items.filter(x => !mine(x) || x.date >= plan.firstDay);
  if (day) {
    // Race day and after: nothing else of ride, run or swim, the athlete's own sessions too.
    items = items.filter(x => !TRI_SPORTS.includes(x.sport) || x.date < race);
    // In the race's order (a triathlon swim, ride, run; a duathlon run, ride, run).
    day.legs.forEach((leg, i) => items.push({ date: race, sport: leg.sport, slot: i, role: "race", leg: i, minutes: leg.minutes, tss: 0, intensity: .85 }));
  }
  const edits = Object.fromEntries(Object.entries(plan.edits || {}).filter(([d]) => inWeek(d)));
  items = items.filter(x => !(mine(x) && x.date !== race && edits[x.date]?.skip));
  const plain = x => mine(x) && !x.brick && x.date !== race;
  const nearRace = x => race && daysBetween(x.date, race) <= 1, weekend = x => weekdayOf(x.date) >= 5;
  const subOf = sport => spec.sports?.[sport] || { q: [] }, ownOf = sport => items.filter(x => x.sport === sport && plain(x));
  // Each sport's long day first. The run on the long ride's day is the brick
  // (or easy), never the long run or a key session.
  const longs = {}, freeOf = sport => ownOf(sport).filter(x => !nearRace(x) && !(sport === "run" && x.date === longs.ride?.date));
  for (const sport of SPORTS) longs[sport] = subOf(sport).long ? [...freeOf(sport)].sort((a, b) => (sport === "swim" ? 0 : weekend(b) - weekend(a)) || b.minutes - a.minutes)[0] || null : null;
  const longRide = longs.ride;
  if (spec.brick && longRide && !race) { const run = ownOf("run").find(x => x.date === longRide.date); if (run) run.brick = true; }
  // Key sessions, one per sport, each far from its sport's long day. The
  // ride's and the run's are picked together: none next to the other or to a
  // ride's or run's long day (the week repeats, so Sunday is next to Monday)
  // when the week allows, the two apart first. A swim's not on their days.
  const longDates = [longRide, longs.run].filter(Boolean).map(x => x.date), apart = (a, b) => { const d = Math.abs(daysBetween(a, b)) % 7; return Math.min(d, 7 - d); };
  const key = {};
  // A lighter week the athlete chose has no key sessions, a week back after a break one.
  let keysLeft = spec.light ? 0 : spec.returning ? 1 : Infinity;
  for (const sport of SPORTS) if (subOf(sport).q[0] && keysLeft > 0) { key[sport] = subOf(sport).q[0]; keysLeft--; }
  const options = sport => key[sport] ? freeOf(sport).filter(x => x !== longs[sport]) : [], orNone = list => list.length ? list : [null];
  const far = (sport, x) => x ? Math.abs(daysBetween(x.date, longs[sport]?.date || x.date)) : 0;
  const near = x => x ? longDates.filter(d => apart(d, x.date) < 2).length : 0;
  const bad = ([r, u]) => (r && u && apart(r.date, u.date) < 2 ? 10 : 0) + near(r) + near(u);
  const total = (f, [r, u]) => f("ride", r) + f("run", u), minutes = (_, x) => x?.minutes || 0;
  const [ride, run] = orNone(options("ride")).flatMap(r => orNone(options("run")).map(u => [r, u])).sort((a, b) => bad(a) - bad(b) || total(far, b) - total(far, a) || total(minutes, b) - total(minutes, a))[0];
  // Next to each other whatever the days: one of them, by turns week by week.
  const dropped = ride && run && apart(ride.date, run.date) < 2 ? (pw.week % 2 ? run : ride) : null;
  const hard = [...longDates, ...[ride, run].filter(x => x && x !== dropped).map(x => x.date)];
  const swim = options("swim").sort((a, b) => Number(hard.includes(a.date)) - Number(hard.includes(b.date)) || far("swim", b) - far("swim", a) || b.minutes - a.minutes)[0];
  for (const [sport, x] of [["ride", ride], ["run", run], ["swim", swim]]) if (x && x !== dropped) x.key = key[sport];
  const out = new Map();
  for (const sport of SPORTS) {
    const own = ownOf(sport), longDay = longs[sport], sub = subOf(sport);
    for (const x of own) {
      const s = nearRace(x) ? { kind: "easy", family: EASY_FAMILY[sport], minutes: sport === "ride" ? 40 : sport === "run" ? 20 : 20 }
        : x === longDay ? { kind: "long", family: sub.long.family || LONG_FAMILY[sport], level: sub.long.level ?? null, minutes: sub.long.minutes ?? null }
        : x.key ? { kind: "quality", ...x.key }
        : { kind: x.role === "recovery" ? "recovery" : "easy", family: x.role === "recovery" ? RECOVERY_FAMILY[sport] : EASY_FAMILY[sport] };
      out.set(x, s);
    }
  }
  const result = [];
  for (const x of items) {
    if (!mine(x)) { result.push(x); continue; }
    const base = { templateId: template.id, week: pw.week, weeks: pw.weeks, phase: spec.phase };
    if (x.date === race && x.role === "race" && day) {
      const { leg: i, ...rest } = x, leg = day.legs[i], label = raceWorkout(leg.workoutId)?.name;
      result.push({ ...rest, label, plan: { ...base, kind: "race", family: null, level: null, workoutId: leg.workoutId } });
      continue;
    }
    if (x.brick) {
      // The brick stays only after this week's long ride, at the plan's minutes.
      if (!spec.brick || !longRide || x.date !== longRide.date) continue;
      const minutes = spec.brick;
      result.push({ ...x, role: "recovery", label: L("Běh po kole", "Brick run"), minutes, maxMinutes: minutes, tss: Math.round(minutes / 60 * .5 * 100), plan: { ...base, kind: "brick", family: "run-easy", level: null, workoutId: planWorkoutId("run", { family: "run-easy" }, minutes) } });
      continue;
    }
    const s = out.get(x);
    if (!s) { result.push(x); continue; }
    const shiftBy = s.kind === "quality" ? levelShift(shifts[x.sport]?.[systemOf(x.sport, s.family)]) + (spec.stepUp || 0) : 0;
    let minutes = Number(edits[x.date]?.minutes) > 0 ? Math.round(Number(edits[x.date].minutes)) : s.minutes ?? (s.kind === "quality" ? Math.max(x.minutes, minutesFor(x.sport, s, shiftBy) || 0) : x.minutes);
    const workoutId = s.family ? planWorkoutId(x.sport, s, minutes, shiftBy) : null;
    // A swim is its metres: the time is the workout's.
    if (x.sport === "swim" && workoutId && !edits[x.date]?.minutes) minutes = CATALOGUE.swim.find(w => w.id === workoutId)?.duration_minutes ?? minutes;
    const role = s.kind === "quality" ? "quality" : s.kind === "long" ? "long" : s.kind === "recovery" ? "recovery" : "endurance", intensity = x.intensity || .7;
    const { key, ...clean } = x;
    result.push({ ...clean, role, label: (workoutId && planName(baseName(workoutId))) || x.label, minutes, tss: Math.round(minutes / 60 * intensity * intensity * 100), plan: { ...base, kind: s.kind, family: s.family || null, level: s.level ?? null, workoutId } });
  }
  // The brick when the week had none: a short run after the long ride.
  if (spec.brick && longRide && SPORTS.includes("run") && !race && !result.some(x => x.brick)) {
    const minutes = spec.brick;
    result.push({ date: longRide.date, sport: "run", slot: (longRide.slot || 0) + 1, role: "recovery", brick: true, label: L("Běh po kole", "Brick run"), minutes, maxMinutes: minutes, tss: Math.round(minutes / 60 * .5 * 100), intensity: .7,
      plan: { templateId: template.id, week: pw.week, weeks: pw.weeks, phase: spec.phase, kind: "brick", family: "run-easy", level: null, workoutId: planWorkoutId("run", { family: "run-easy" }, minutes) } });
  }
  result.sort((a, b) => a.date.localeCompare(b.date) || (a.slot || 0) - (b.slot || 0));
  return { ...targets, items: result, plan: { templateId: template.id, name: template.name, week: pw.week, weeks: pw.weeks, phase: spec.phase, phaseLabel: phaseLabel(spec.phase, "triathlon"), load: spec.load, returning: Boolean(spec.returning) } };
}

// ---- why a session changed ------------------------------------------------------
// The week's plan sessions (`items`, applyPlan then capWeekTargets) against
// the same week of the plan as it was made (`original`, planOriginal): each
// changed session gets `change`, what changed, why in a few words (`line`) and
// a sentence (`text`), and the session it was (`original`). kind: moved,
// shorter, easier. A session the athlete skipped is not in the week at all.
const DAY_SHORT = () => [L("po", "Mon"), L("út", "Tue"), L("st", "Wed"), L("čt", "Thu"), L("pá", "Fri"), L("so", "Sat"), L("ne", "Sun")];
const DAY_ON = () => [L("V pondělí", "on Monday"), L("V úterý", "on Tuesday"), L("Ve středu", "on Wednesday"), L("Ve čtvrtek", "on Thursday"), L("V pátek", "on Friday"), L("V sobotu", "on Saturday"), L("V neděli", "on Sunday")];
const DAY_ACC = () => [L("na pondělí", "to Monday"), L("na úterý", "to Tuesday"), L("na středu", "to Wednesday"), L("na čtvrtek", "to Thursday"), L("na pátek", "to Friday"), L("na sobotu", "to Saturday"), L("na neděli", "to Sunday")];
// A red morning (planRedMorning): the numbers that made it red and where the key session went.
const redText = (r, to) => {
  const hrv = r.hrv ? L(`HRV ${r.hrv} ms proti tvému normálu ${r.low}–${r.high} ms`, `HRV ${r.hrv} ms against your normal ${r.low}–${r.high} ms`) : "";
  const sleep = r.sleep ? L(`spánek ${hours(r.sleep)}`, `sleep ${hours(r.sleep)}`) : "";
  const numbers = [hrv, sleep].filter(Boolean).join(", ");
  return L("Regenerace je dnes ráno v červené", "Recovery is in the red this morning") + (numbers ? ": " + numbers : "") + L(`. Náročný trénink by dnes víc vzal, než dal, proto se přesunul ${to}.`, `. A hard session today would cost more than it gives, so it moved ${to}.`);
};
const DAY_FROM = () => [L("z pondělí", "from Monday"), L("z úterý", "from Tuesday"), L("ze středy", "from Wednesday"), L("ze čtvrtka", "from Thursday"), L("z pátku", "from Friday"), L("ze soboty", "from Saturday"), L("z neděle", "from Sunday")];
export function planChanges(items = [], original = [], plan, weekStart) {
  const pw = planWeek(plan, weekStart);
  if (!pw) return items;
  const at = (list, date, sport, slot = 0) => list.find(o => o.plan && o.date === date && o.sport === sport && (o.slot || 0) === slot && !o.brick);
  const was = o => o ? { label: o.label, minutes: o.minutes, date: o.date } : null;
  return items.map(x => {
    if (!x.plan || x.brick || x.plan.kind === "race") return x;
    const from = x.plan.movedFrom, o = at(original, from || x.date, x.sport, x.slot || 0), edit = plan.edits?.[x.date];
    let change = null;
    const red = plan.edits?.[x.date]?.auto === "red" ? plan.edits[x.date] : null, redFrom = from && plan.edits?.[from]?.auto === "red" ? plan.edits[from] : null;
    const key = red && at(original, x.date, x.sport, x.slot || 0);
    if (red && key && KEY_KINDS.includes(key.plan.kind)) {
      change = { kind: "easier", alert: true, line: L("Lehčí: regenerace v červené", "Easier: red recovery"), text: redText(red, DAY_ACC()[weekdayOf(red.to)]), original: { ...was(key), now: red.to } };
    } else if (redFrom) {
      change = { kind: "moved", alert: true, line: L("Přesunuto z ", "Moved from ") + DAY_SHORT()[weekdayOf(from)], text: redText(redFrom, DAY_ACC()[weekdayOf(x.date)]), original: was(o) };
    } else if (from) {
      const own = Boolean(plan.edits?.[from]?.to);
      const d = weekdayOf(from);
      change = { kind: "moved", line: L("Přesunuto z ", "Moved from ") + DAY_SHORT()[d],
        text: own ? L("Přesunuto ", "You moved it here ") + DAY_FROM()[d] + "." : L(DAY_ON()[d] + " zůstal nesplněný, proto je přesunutý sem.", "Missed " + DAY_ON()[d] + ", so it moved here."), original: was(o) };
    } else if (Number(edit?.minutes) > 0 && o && x.minutes < o.minutes) {
      change = { kind: "shorter", line: L("Kratší: tvoje úprava", "Shorter: your change"), text: L(`Zkráceno z ${o.minutes} na ${x.minutes} min podle tvé volby.`, `You shortened it from ${o.minutes} to ${x.minutes} min.`), original: was(o) };
    } else if (o && KEY_KINDS.includes(o.plan.kind) && !KEY_KINDS.includes(x.plan.kind) && (pw.spec.light || pw.spec.returning)) {
      change = pw.spec.light
        ? { kind: "easier", line: L("Lehčí: odlehčený týden", "Easier: lighter week"), text: L("Tento týden je odlehčený podle tvé volby, bez náročných tréninků.", "You chose a lighter week, so it has no hard sessions."), original: was(o) }
        : { kind: "easier", line: L("Lehčí: návrat po pauze", "Easier: back after a break"), text: L("První týden po pauze je lehčí, nejvýš s jedním náročným tréninkem.", "The first week back after a break is lighter, with one hard session at most."), original: was(o) };
    } else if (o && KEY_KINDS.includes(o.plan.kind) && !KEY_KINDS.includes(x.plan.kind) && pw.pulled) {
      const p = plan.pulled || {}, sleep = p.sleep ? L(` a spánek v průměru ${hours(p.sleep)}`, `, sleep ${hours(p.sleep)} on average`) : "";
      change = { kind: "easier", line: L("Bylo: ", "Was: ") + o.label, text: L(`Odpočinkový týden se posunul na teď: HRV pod tvým normálem${p.below ? ` ${p.below} ${plural(p.below, "den", "dny", "dní", "day", "days")} ze 7` : ""}${sleep}.`, `The recovery week moved to now: HRV below your normal${p.below ? ` on ${p.below} of 7 days` : ""}${sleep}.`), original: was(o) };
    } else if (o && x.plan.kind === "quality" && pw.spec.stepUp && x.plan.workoutId !== o.plan.workoutId) {
      change = { kind: "harder", line: L("Těžší: zvládáš víc", "Harder: ready for more"), text: L("Klíčové tréninky ti šly lehčeji, než plán čekal, a HRV je stabilní, proto je tenhle o úroveň těžší.", "Your key sessions felt easier than planned and HRV is steady, so this one is a level harder."), original: was(o) };
    } else if (Number(x.planMinutes) > x.minutes) {
      change = { kind: "shorter", line: L(`Kratší: na ${x.minutes} min je volno`, `Shorter: ${x.minutes} min free`), text: L(`Volný čas toho dne na něj nechává ${x.minutes} min, proto je kratší než ${x.planMinutes} min v plánu.`, `Your free time that day leaves ${x.minutes} min for it, so it is shorter than the plan's ${x.planMinutes} min.`), original: { label: x.label, minutes: x.planMinutes, date: x.date } };
    }
    return change ? { ...x, plan: { ...x.plan, change } } : x;
  });
}

const KEY_KINDS = ["quality", "test", "long"];
// A key session of this week (intervals, a test, the long one) on a past day
// with no session of the sport, not yet decided on: the latest one, with the
// day the app suggests for it (the first easy day ahead not next to another
// key day) and the days left in the week. `targets` are applyPlan's.
export function missedSession(targets, plan, weekStart, today, doneDates = []) {
  const sport = getTemplate(plan?.templateId)?.sport;
  if (!sport || sport === "gym" || sport === "triathlon" || !targets?.items) return null;
  const done = new Set(doneDates), decided = new Set((plan.moves || []).map(m => m.from));
  const own = targets.items.filter(x => x.sport === sport && (x.slot || 0) === 0 && x.plan);
  const missed = own.filter(x => x.date < today && x.date >= weekStart && KEY_KINDS.includes(x.plan.kind) && !x.plan.movedFrom && !done.has(x.date) && !decided.has(x.date)).at(-1);
  if (!missed) return null;
  const days = Array.from({ length: 7 }, (_, i) => shift(weekStart, i)).filter(d => d >= today);
  if (!days.length) return null;
  const keyDays = own.filter(x => x.date >= today && KEY_KINDS.includes(x.plan.kind)).map(x => x.date);
  const race = own.find(x => x.plan.kind === "race")?.date;
  const suggest = own.find(x => x.date >= today && !KEY_KINDS.includes(x.plan.kind) && x.plan.kind !== "race" && !(race && daysBetween(x.date, race) <= 2) && keyDays.every(d => Math.abs(daysBetween(d, x.date)) >= 2))?.date || null;
  return { type: "missed", date: missed.date, label: missed.label, kind: missed.plan.kind, workoutId: missed.plan.workoutId, suggest, days };
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
  const g = pw.spec.gym, sessions = gymSessions(plan, pw), picked = gymPickDays(days, sessions);
  const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  if (!picked.includes(weekday)) return null;
  // Without the athlete's own number the phase stays as the plan was made: full body.
  const chosen = sessions !== g.sessions || Number(plan?.perWeek) > 0, part = chosen ? gymPart(sessions, picked.indexOf(weekday)) : null;
  const head = pw.template.name + " · " + g.name + (part ? " · " + GYM_PARTS()[part] : ""), week = L(" · týden ", " · week ") + pw.week + "/" + pw.weeks;
  const equipment = pw.template.equipment || null;
  // A test week: its first session is the strength test (one heavy set of 3–5
  // after the warm-up sets, the estimated max from it); the others are light.
  if (g.test && weekday === picked[0]) return {
    name: head + week, phaseName: g.name, sets: 1, reps: "3–5", rpe: "9", exercises: g.test, test: true, equipment,
    rationale: L(`Plán ${pw.template.name}, týden ${pw.week}/${pw.weeks}: test síly. Po rozcvičovacích sériích jedna těžká série, kde zvládneš 3–5 opakování s jedním v rezervě; z ní se spočítá tvoje maximum. Když nemáš velkou činku, test proběhne na nejbližším cviku, na který vybavení máš.`, `Plan ${pw.template.name}, week ${pw.week}/${pw.weeks}: strength test. After the warm-up sets, one heavy set where you manage 3–5 repetitions with one in reserve; your max is worked out from it. Without a barbell the test runs on the closest exercise your equipment allows.`)
  };
  // The seventh day of seven is light: mobility and the trunk, nothing heavy.
  if (part === "light") return {
    name: head + week, phaseName: g.name, sets: 2, reps: "10–12", rpe: "5–6", exercises: MOBILITY, equipment,
    rationale: L(`Plán ${pw.template.name}, týden ${pw.week}/${pw.weeks}: lehký den na pohyblivost a střed těla. Sedm dní v týdnu nechává tělu jen tento den na zotavení.`, `Plan ${pw.template.name}, week ${pw.week}/${pw.weeks}: a light day for mobility and the trunk. Seven days a week leaves only this day for recovery.`)
  };
  const sets = chosen ? gymSets(g, sessions, g.sessions, part) : g.sets, exercises = part ? gymPartSlots(g.exercises, part, equipment) : g.exercises;
  return {
    name: head + week, phaseName: g.name, sets, reps: g.reps, rpe: g.rpe, exercises, equipment,
    rationale: L(`Plán ${head}, týden ${pw.week}/${pw.weeks}: ${sets} série po ${g.reps} opakováních, RPE ${g.rpe} (tolik opakování nech v rezervě, kolik chybí do 10).`, `Plan ${head}, week ${pw.week}/${pw.weeks}: ${sets} sets of ${g.reps} reps, RPE ${g.rpe} (keep as many reps in reserve as are missing to 10).`)
  };
}

// ---- the gym plan's sessions a week ----------------------------------------------
// The athlete picks 2–7 sessions a week (`perWeek`); without a choice each
// phase keeps its own. A lighter phase (fewer sessions in the template)
// stays lighter. Up to three sessions are full body, four upper and lower
// body, five and six push, pull and legs, the seventh a light mobility day
// (the split of the gym generator, PR #350). The weekly sets per muscle stay
// about the same: two full-body sessions get more sets each, a split day one
// set more for its fewer exercises (Schoenfeld 2017: 10–20 sets a muscle a week).
export const GYM_PER_WEEK = [2, 7];
export const gymUsual = template => Math.max(...template.weeks.map(w => w.gym?.sessions || 0));
export function gymSessions(plan, pw) {
  const g = pw.spec.gym, n = Math.round(Number(plan?.perWeek));
  if (!(n >= GYM_PER_WEEK[0] && n <= GYM_PER_WEEK[1])) return g.sessions;
  return g.sessions < gymUsual(pw.template) ? Math.max(1, Math.min(n, g.sessions)) : n;
}
// The gym days the plan uses: the first ones of the week, two days apart up to
// three sessions (a day apart when the days are too close), any day for a split.
export function gymPickDays(days = [], sessions) {
  const gym = [0, 1, 2, 3, 4, 5, 6].filter(i => (days[i] || []).includes("gym"));
  if (sessions >= 4) return gym.slice(0, sessions);
  for (const gap of [2, 1]) {
    const picked = [];
    for (const i of gym) if (picked.length < sessions && picked.every(p => i - p >= gap)) picked.push(i);
    if (picked.length >= Math.min(sessions, gym.length) || gap === 1) return picked;
  }
  return [];
}
export const gymPart = (sessions, k) => sessions <= 3 || k < 0 ? null : k === 6 ? "light" : sessions === 4 ? ["upper", "lower"][k % 2] : ["push", "pull", "legs"][k % 3];
export const GYM_PARTS = () => ({ upper: L("horní polovina", "upper body"), lower: L("dolní polovina", "lower body"), push: L("tlaky", "push"), pull: L("tahy", "pull"), legs: L("nohy", "legs"), light: L("lehký den", "light day") });
export const gymSplitName = sessions => sessions <= 3 ? L("Celé tělo", "Full body") : sessions === 4 ? L("Horní / dolní", "Upper / Lower") : sessions <= 6 ? L("Tlaky / tahy / nohy", "Push / Pull / Legs") + (sessions === 6 ? " ×2" : "") : L("Tlaky / tahy / nohy ×2 + pohyblivost", "PPL ×2 + mobility");
// `phase`: the phase's own sessions, so a lighter phase keeps its lighter week.
export function gymSets(g, sessions, phase, part = null) {
  if (part) return Math.min(5, g.sets + 1);
  return clamp(Math.round(g.sets * (phase || sessions) / Math.max(1, sessions)), 2, 6);
}
const CORE = /dead bug|pallof|plank|crunch|leg raise|bird dog|superman|woodchop/i;
const LEGS = /squat|lunge|step-up|deadlift|thrust|glute|calf|leg curl|leg press|nordic|soleus|cossack/i;
const PULL = /row|pull|chin|curl/i;
const slotPart = slot => { const name = [].concat(slot)[0] || ""; return CORE.test(name) ? "core" : LEGS.test(name) ? "legs" : PULL.test(name) ? "pull" : "push"; };
const EXTRA = {
  legs: [["DB Bulgarian split squat", "Smith machine split squat", "DB reverse lunge", "Forward Lunge"], ["Seated leg curl", "Prone leg curl Prime", "Single Leg Glute Bridge"], ["Standing calf raise", "Single-leg calf raise", "Eccentric Calf Lowers"], ["Hip thrust", "Glute bridge"]],
  pull: [["Low row", "Chest-supported row", "Single-arm cable row", "One-arm DB row"], ["Cable curl", "DB curl", "Hammer curl"]],
  push: [["DB shoulder press", "Shoulder press Prime", "Push-up"], ["Cable lateral raise", "DB lateral raise"], ["Cable triceps extension", "DB overhead triceps extension", "Diamond Push Ups"]]
};
// The bodyweight plan's own fill-ups: nothing a home without equipment lacks
// (a table or a low bar for the inverted row, a chair for the dips).
const EXTRA_HOME = {
  legs: [["Forward Lunge", "Walking Lunge"], ["Single Leg Glute Bridge", "Glute bridge"], ["Eccentric Calf Lowers", "Bent-Knee Soleus Raise"], ["Cossack Squat", "Bodyweight Alternating Lateral Lunge"]],
  pull: [["Inverted Row", "Prone Y-T Raises"], ["Prone Y-T Raises", "Supermans"]],
  push: [["Push-up", "Bodyweight Knee Push Ups"], ["Bench Dips", "Diamond Push Ups"], ["Diamond Push Ups", "Bodyweight Knee Push Ups"]]
};
const MOBILITY = [["Cossack Squat", "Bodyweight Alternating Lateral Lunge"], ["Bird Dog"], ["Dead bug"], ["Glute bridge", "Single Leg Glute Bridge"], ["Pallof press"]];
// A split day's exercises: the phase's slots of that part (the trunk on leg
// days), filled up to four with more of the same part.
export function gymPartSlots(slots, part, equipment = null) {
  const extra = equipment === "bodyweight" ? EXTRA_HOME : EXTRA;
  const parts = { upper: ["push", "pull"], lower: ["legs", "core"], push: ["push"], pull: ["pull"], legs: ["legs", "core"] }[part] || [];
  const out = slots.filter(slot => parts.includes(slotPart(slot)));
  const first = new Set(out.map(slot => [].concat(slot)[0]));
  for (const p of parts) for (const slot of extra[p] || []) if (out.filter(x => slotPart(x) !== "core").length < 4 && !first.has(slot[0])) { out.push(slot); first.add(slot[0]); }
  return out;
}

// ---- starting a plan -----------------------------------------------------------
// A race plan ends on race day: it starts the Monday (weeks − 1) before the
// race week; a race too close starts the plan later (shorter), down to 60 %
// of it. Other plans start this Monday until Tuesday, else next Monday.
export function planStart(template, { today, raceDate = null, startDate = null }) {
  const thisMonday = mondayOf(today);
  if (template.race && raceDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate) || raceDate <= today) throw new Error(L("Datum závodu musí být v budoucnu.", "The race date must be in the future."));
    const start = shift(mondayOf(raceDate), -(template.weeks.length - 1) * 7);
    if (daysBetween(today, raceDate) > 400) throw new Error(L("Závod je moc daleko. Plán založ, až bude méně než rok před ním.", "The race is too far away. Start the plan when it's less than a year away."));
    const firstWeek = start >= thisMonday ? 1 : Math.floor(daysBetween(start, thisMonday) / 7) + 1;
    if (template.weeks.length - firstWeek + 1 < Math.ceil(template.weeks.length * .6)) throw new Error(L("Do závodu je na tento plán málo času.", "There isn't enough time before the race for this plan."));
    return { startDate: start, firstWeek, raceDate };
  }
  // A day the athlete chose: the plan's weeks run Monday to Sunday, the first
  // one from that day (its key sessions on the days left).
  if (startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < today || daysBetween(today, startDate) > 120) throw new Error(L("Vyber začátek v příštích 4 měsících.", "Pick a start within the next 4 months."));
    const monday = mondayOf(startDate);
    return { startDate: monday, firstWeek: 1, firstDay: startDate > monday ? startDate : null, raceDate: template.race ? shift(monday, template.weeks.length * 7 - 1) : null };
  }
  const weekday = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7;
  const start = weekday <= 1 ? thisMonday : shift(thisMonday, 7);
  return { startDate: start, firstWeek: 1, raceDate: template.race ? shift(start, template.weeks.length * 7 - 1) : null };
}
// Training days the plan needs: the athlete's days of the sport first; when
// there are too few, the days with the most free time are added, spread out.
// `count`: the sessions a week the athlete chose (the plan's range, 2–7 for a
// gym plan); more days of the sport than that leave out the ones with the
// least free time (`removed`).
// `sports`: the sports the athlete picked for a multisport plan; `allowed`: the
// only weekdays a multisport plan may use (the athlete chose its days).
export function planDays(template, prefs, count = null, sports = null, allowed = null) {
  // A multisport plan: each sport's days in turn (ride, run, swim), a second sport may share a day.
  if (template.sport === "triathlon") {
    const per = perSportOf(template, { sports }), list = Object.keys(per);
    const days = Array.from({ length: 7 }, (_, i) => [...(prefs?.days?.[i] || [])]), added = new Set();
    const free = i => Number(prefs?.availability?.[i]?.minutes ?? 60), busy = i => days[i].filter(x => list.includes(x)).length;
    // Round by round, so no sport takes all the best days: a day of its own
    // first, then a second session on the day with the most time.
    for (let round = 0; round < 4; round++) for (const sport of list) {
      if (days.filter(d => d.includes(sport)).length >= Math.min(round + 1, per[sport])) continue;
      const near = i => [-1, 1].filter(k => days[(i + k + 7) % 7].includes(sport)).length;
      // Days the athlete chose count whatever their free time.
      const options = [0, 1, 2, 3, 4, 5, 6].filter(i => (allowed ? allowed.includes(i) : free(i) >= (sport === "ride" ? 30 : 20)) && !days[i].includes(sport) && busy(i) < 2)
        .sort((a, b) => busy(a) - busy(b) || near(a) - near(b) || free(b) - free(a));
      if (!options.length) continue;
      days[options[0]].push(sport);
      added.add(options[0]);
    }
    return { days, added: [...added].sort() };
  }
  const days = (prefs?.days || []).map(d => [...(d || [])]);
  while (days.length < 7) days.push([]);
  const has = i => days[i].includes(template.sport);
  const added = [], removed = [];
  const free = i => Number(prefs?.availability?.[i]?.minutes ?? 60);
  const range = template.sport === "gym" ? GYM_PER_WEEK : template.days;
  const want = Number(count) > 0 ? clamp(Math.round(Number(count)), range[0], range[1]) : template.days[0];
  if (Number(count) > 0) {
    const mine = [0, 1, 2, 3, 4, 5, 6].filter(has).sort((a, b) => free(a) - free(b) || b - a);
    for (const i of mine.slice(0, Math.max(0, mine.length - want))) { days[i] = days[i].filter(x => x !== template.sport); removed.push(i); }
  }
  while (days.filter((_, i) => has(i)).length < want) {
    const options = [0, 1, 2, 3, 4, 5, 6].filter(i => !has(i) && free(i) >= (template.sport === "swim" ? 15 : template.sport === "run" ? 20 : 30));
    if (!options.length) break;
    const near = i => [-1, 1].filter(k => has((i + k + 7) % 7)).length;
    options.sort((a, b) => near(a) - near(b) || free(b) - free(a) || Number(b >= 5) - Number(a >= 5));
    days[options[0]].push(template.sport);
    added.push(options[0]);
  }
  return { days, added: added.sort((a, b) => a - b), removed: removed.sort((a, b) => a - b) };
}

// ---- storage -------------------------------------------------------------------
let migrated = false;
async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS training_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, template_id TEXT NOT NULL, sport TEXT NOT NULL, start_date TEXT NOT NULL, race_date TEXT, race_km REAL, status TEXT NOT NULL DEFAULT 'active', state_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  // Tables made before the plan kept its pauses and shifts.
  if (migrated) return;
  try { await db.prepare("ALTER TABLE training_plans ADD COLUMN state_json TEXT NOT NULL DEFAULT '{}'").run(); } catch { /* already there */ }
  migrated = true;
}
const parseState = text => { try { return JSON.parse(text || "{}") || {}; } catch { return {}; } };
// state: pauseFrom/pauseUntil (an illness or a break going on), shiftedWeeks
// (weeks the plan moved later), returnFrom/returnWeeks (lighter weeks after a
// break in a race plan) and reviewed (the last week checked for missed sessions).
const fromRow = r => r ? { id: r.id, templateId: r.template_id, sport: r.sport, startDate: r.start_date, raceDate: r.race_date || null, raceKm: r.race_km ?? null, status: r.status, ...parseState(r.state_json) } : null;
// firstDay: the plan started mid-week (its first week from that day); edits:
// the athlete's own changes by day ({ to } moved, { minutes } shortened,
// { skip }); weekDays: fewer training days in a week ({ monday: days });
// start: FTP, fitness and the estimate when the plan started (its result);
// seen: the finished plan's result was closed; target: a running race's goal
// time in seconds; perWeek: a gym plan's sessions a week the athlete chose.
const STATE_KEYS = ["pauseFrom", "pauseUntil", "shiftedWeeks", "returnFrom", "returnWeeks", "reviewed", "moves", "lightWeeks", "proposal", "undo", "firstDay", "edits", "weekDays", "start", "seen", "target", "perWeek", "sports", "pulled", "stepUp", "trendChecked", "redChecked", "estimates", "threshold", "goalKept"];
async function savePlan(db, plan) {
  const state = Object.fromEntries(STATE_KEYS.filter(k => plan[k] != null).map(k => [k, plan[k]]));
  await db.prepare("UPDATE training_plans SET start_date=?,state_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(plan.startDate, JSON.stringify(state), db.userId, plan.id).run();
}

// ---- illness, a break, missed weeks --------------------------------------------
// While the athlete's status is sick, injured or on a break the plan waits.
// Back to training after 4 days or more, the plan proposes what next
// (planChoice): a lighter week, the plan moved later by the weeks away (not
// with a race: its day stays) or going on unchanged. Shorter breaks only cost
// their sessions.
export function planPause(plan, state, today) {
  const template = plan && getTemplate(plan.templateId);
  if (!template) return { plan, changed: false };
  const away = state?.status && state.status !== "active";
  if (away) {
    if (plan.pauseFrom && (plan.pauseUntil || null) === (state.statusUntil || null)) return { plan, changed: false };
    return { plan: { ...plan, pauseFrom: plan.pauseFrom || today, pauseUntil: state.statusUntil || null }, changed: true };
  }
  if (!plan.pauseFrom) return { plan, changed: false };
  const from = plan.pauseFrom > plan.startDate ? plan.pauseFrom : plan.startDate, end = plan.pauseUntil && plan.pauseUntil < today ? plan.pauseUntil : today;
  const days = daysBetween(from, end), out = { ...plan, pauseFrom: null, pauseUntil: null };
  if (days >= 4 && end > plan.startDate) {
    const options = template.race ? ["light", "continue"] : ["light", "shift", "continue"];
    out.proposal = { type: "return", days, weeks: Math.min(6, Math.ceil(days / 7)), from: mondayOf(today), options };
  }
  return { plan: out, changed: true };
}
// A finished week whose key sessions were not all done, not even on another
// day of that week: the plan proposes repeating it, going on, or a lighter
// week before repeating it (planChoice). A race plan keeps its race day and
// goes on without asking.
// keyDates: the week's key session days; doneDates: days with a session of the sport.
export function planReview(plan, weekStart, { keyDates = [], doneDates = [] } = {}) {
  const template = plan && getTemplate(plan.templateId);
  if (!template || plan.reviewed >= weekStart) return { plan, changed: false, proposed: false };
  const out = { ...plan, reviewed: weekStart };
  const skipped = new Set((plan.moves || []).filter(m => !m.to).map(m => m.from));
  const done = new Set(doneDates), missed = keyDates.filter(d => !done.has(d) && !skipped.has(d)).sort();
  // A missed session done later that week on a day without a key session counts.
  const madeUp = missed.length ? doneDates.filter(d => d > missed[0] && !keyDates.includes(d)).length : 0;
  const last = planWeek(plan, shift(weekStart, -7));
  const propose = !template.race && !plan.proposal && missed.length > madeUp && last != null && planWeek(plan, weekStart) != null;
  if (propose) out.proposal = { type: "week", weekStart, week: last.week, next: last.week + 1, done: keyDates.length - missed.length + Math.min(madeUp, missed.length), total: keyDates.length, options: ["repeat", "continue", "light"] };
  return { plan: out, changed: true, proposed: propose };
}

// ---- the plan follows the trend --------------------------------------------------
// Checked on Mondays, for a ride, run, swim or multisport plan (not the gym).
// - HRV below the athlete's normal over the week before (week-planner.js
//   hrvWeekTrendDown, as HRV-guided training: Plews 2012; Javaloyes 2019):
//   the next recovery week within three weeks moves to this week and this
//   week takes its place, so a race day stays. `hrv`: hrvTrend for the card.
// - Every key session of the last three weeks done (`keysDone`), felt easy
//   (`rpe`: the athletes' ratings, at least three, 6.5 or less on average)
//   and HRV steady: one level up from next Monday, at most two, three weeks apart.
// The plan applies it at once and says so; "keep" (planChoice) puts it back.
const EASY_PHASES = ["recovery", "taper", "race", "test"];
export function trendProposal(plan, monday, { hrvDown = false, hrv = null, keysDone = false, rpe = [] } = {}) {
  const template = getTemplate(plan?.templateId), pw = planWeek(plan, monday);
  if (!template || template.sport === "gym" || !pw || plan.proposal || plan.pauseFrom) return null;
  const easy = w => !w || EASY_PHASES.includes(w.spec.phase) || w.spec.light || w.spec.returning || w.spec.race || w.pulled;
  if (hrvDown) {
    if (easy(pw) || (plan.pulled && monday <= plan.pulled.until)) return null;
    for (let k = 1; k <= 3; k++) {
      const ahead = planWeek(plan, shift(monday, 7 * k));
      if (ahead?.spec.phase === "recovery" && !ahead.spec.race) return { type: "lighter", applied: true, weekStart: monday, from: ahead.index, to: pw.index, weeks: k, week: pw.week, recoveryWeek: ahead.week, hrv };
    }
    return null;
  }
  const ratings = rpe.map(Number).filter(v => v >= 1 && v <= 10), mean = ratings.reduce((a, b) => a + b, 0) / (ratings.length || 1);
  const next = planWeek(plan, shift(monday, 7)), by = (plan.stepUp?.by || 0) + 1;
  if (!keysDone || ratings.length < 3 || mean > 6.5 || by > 2 || easy(next) || (plan.stepUp && daysBetween(plan.stepUp.from, monday) < 21)) return null;
  return { type: "harder", applied: true, weekStart: monday, from: shift(monday, 7), by };
}
// The Monday's check on the plan (trendProposal): the plan with the change
// applied and the proposal saying so, or the plan only marked as checked.
// `estimate` (a running race's estimate now, seconds) and `thresholdPace` are
// kept for the race goal card (race-estimate.js goalCheck): the week's estimate
// and the threshold pace before and now.
export function planTrend(plan, monday, data = {}) {
  const record = data.estimate > 0 ? { estimates: { ...(plan.estimates || {}), [monday]: Math.round(data.estimate) } } : {};
  if (Number(data.thresholdPace) > 0) record.threshold = { before: plan.threshold?.now ?? null, now: Math.round(Number(data.thresholdPace)), at: monday };
  const checked = { ...plan, trendChecked: monday, ...record }, proposal = trendProposal(checked, monday, data);
  return proposal ? { ...planChoice(checked, { ...proposal, applied: false }, "ok", { today: monday }), proposal } : checked;
}

// A red morning (readiness.js zone red): today's key session of the plan, not
// done, swaps with the first easy day ahead this week that is not next to
// another key day (as a missed one, missedSession), never close to a race. It
// is no question: on red the hard session does not stay (feedback rule: red
// blocks), and its day says why (planChanges). Nothing when no day fits: the
// coach keeps today easy. `numbers`: { hrv, low, high, sleep } for the reason.
export function planRedMorning(plan, targets, today, numbers = {}) {
  const sport = getTemplate(plan?.templateId)?.sport;
  if (!sport || sport === "gym" || sport === "triathlon" || plan.edits?.[today]) return null;
  const own = (targets?.items || []).filter(x => x.sport === sport && (x.slot || 0) === 0 && x.plan);
  if (!own.some(x => x.date === today && ["quality", "test"].includes(x.plan.kind) && !x.plan.movedFrom)) return null;
  const keyDays = own.filter(x => x.date > today && KEY_KINDS.includes(x.plan.kind)).map(x => x.date), race = own.find(x => x.plan.kind === "race")?.date;
  const to = own.find(x => x.date > today && !KEY_KINDS.includes(x.plan.kind) && x.plan.kind !== "race" && !(race && daysBetween(x.date, race) <= 2) && keyDays.every(d => Math.abs(daysBetween(d, x.date)) >= 2))?.date;
  if (!to) return null;
  const n = v => Number(v) > 0 ? Math.round(Number(v)) : null;
  return { ...plan, edits: { ...(plan.edits || {}), [today]: { to, auto: "red", hrv: n(numbers.hrv), low: n(numbers.low), high: n(numbers.high), sleep: n(numbers.sleep) } } };
}

// The athlete's answer to a proposal ("keep" leaves the plan as it is).
// missed: "move" to `date`, or "skip". week: "repeat" the last week,
// "continue", or "light" (a lighter week now, then the last week again).
// return: "light" (a lighter week or two now), "shift" (the plan moves later
// by the weeks away) or "continue". The plan before the change is kept for undo.
export function planChoice(plan, proposal, choice, { today, date = null } = {}) {
  // A change the plan made already (trendProposal): OK keeps it, "keep" puts the plan back.
  if (proposal.applied) return choice === "keep" ? { ...planUndo(plan), proposal: null } : { ...plan, proposal: null };
  const snapshot = Object.fromEntries(["startDate", ...STATE_KEYS.filter(k => k !== "undo")].map(k => [k, plan[k] ?? null]));
  const out = { ...plan, undo: snapshot, proposal: null };
  const monday = mondayOf(today);
  if (proposal.type === "missed") {
    if (choice === "move" && !(date && date >= today && date < shift(monday, 7))) throw new Error(L("Vyber den do konce týdne.", "Pick a day before the week ends."));
    out.moves = [...(plan.moves || []).filter(m => m.from >= shift(monday, -7)), { from: proposal.date, to: choice === "move" ? date : null }];
  } else if (proposal.type === "week") {
    if (choice === "repeat") Object.assign(out, { startDate: shift(plan.startDate, 7), shiftedWeeks: (plan.shiftedWeeks || 0) + 1 });
    if (choice === "light") Object.assign(out, { startDate: shift(plan.startDate, 14), shiftedWeeks: (plan.shiftedWeeks || 0) + 2, lightWeeks: [...(plan.lightWeeks || []), monday] });
  } else if (proposal.type === "return") {
    if (choice === "light") Object.assign(out, { returnFrom: monday, returnWeeks: proposal.days >= 14 ? 2 : 1 });
    if (choice === "shift" && !getTemplate(plan.templateId)?.race) Object.assign(out, { startDate: shift(plan.startDate, 7 * proposal.weeks), shiftedWeeks: (plan.shiftedWeeks || 0) + proposal.weeks });
  } else if (proposal.type === "lighter" && choice === "ok") {
    out.pulled = { at: proposal.weekStart, from: proposal.from, to: proposal.to, until: shift(proposal.weekStart, 7 * proposal.weeks), below: proposal.hrv?.below ?? null, sleep: proposal.hrv?.sleep ?? null };
  } else if (proposal.type === "harder" && choice === "ok") {
    out.stepUp = { from: proposal.from, by: proposal.by };
  }
  return out;
}
export function planUndo(plan) {
  if (!plan?.undo) return plan;
  return { ...plan, ...plan.undo, undo: null };
}
// The active plan, or null; a plan past its last week is finished. An
// endurance plan (ride or run) and a gym plan can run side by side.
export async function activePlan(db, today = null, { gym = false, state = null } = {}) {
  await ensure(db);
  let plan = fromRow(await db.prepare(`SELECT * FROM training_plans WHERE user_id=? AND status='active' AND sport${gym ? "=" : "<>"}'gym' ORDER BY id DESC LIMIT 1`).bind(db.userId).first());
  const template = plan && getTemplate(plan.templateId);
  if (plan && today && (!template || today >= shift(plan.startDate, template.weeks.length * 7))) {
    await db.prepare("UPDATE training_plans SET status='done',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?").bind(db.userId, plan.id).run();
    return null;
  }
  if (plan && state && today) {
    const r = planPause(plan, state, today);
    if (r.changed) { plan = r.plan; await savePlan(db, plan); }
  }
  return plan;
}
export async function reviewPlan(db, plan, weekStart, data) {
  const r = planReview(plan, weekStart, data);
  if (r.changed) await savePlan(db, r.plan);
  return r;
}
export async function savePlanState(db, plan) { await savePlan(db, plan); return plan; }
export async function startPlan(db, { templateId, startDate, raceDate = null, raceKm = null, state = {} }) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(L("Neznámý plán.", "Unknown plan."));
  await ensure(db);
  await stopPlan(db, { gym: template.sport === "gym" });
  const km = template.race ? (template.race.options?.includes(Number(raceKm)) ? Number(raceKm) : template.race.km) : null;
  const saved = Object.fromEntries(STATE_KEYS.filter(k => state[k] != null).map(k => [k, state[k]]));
  await db.prepare("INSERT INTO training_plans(user_id,template_id,sport,start_date,race_date,race_km,status,state_json) VALUES(?,?,?,?,?,?,'active',?)").bind(db.userId, template.id, template.sport, startDate, raceDate, km, JSON.stringify(saved)).run();
  return activePlan(db, null, { gym: template.sport === "gym" });
}
export async function stopPlan(db, { gym = false } = {}) {
  await ensure(db);
  await db.prepare(`UPDATE training_plans SET status='stopped',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='active' AND sport${gym ? "=" : "<>"}'gym'`).bind(db.userId).run();
}

// The ride or run plan (or the gym plan) finished in the last 3 weeks whose result was not closed.
export async function finishedPlan(db, today, { gym = false } = {}) {
  await ensure(db);
  const plan = fromRow(await db.prepare(`SELECT * FROM training_plans WHERE user_id=? AND status='done' AND sport${gym ? "=" : "<>"}'gym' ORDER BY id DESC LIMIT 1`).bind(db.userId).first());
  const template = plan && getTemplate(plan.templateId);
  if (!template || plan.seen) return null;
  const end = shift(plan.startDate, template.weeks.length * 7 - 1);
  return daysBetween(end, today) <= 21 ? { ...plan, endDate: end } : null;
}
export async function closePlanResult(db, id) {
  await ensure(db);
  const plan = fromRow(await db.prepare("SELECT * FROM training_plans WHERE user_id=? AND id=?").bind(db.userId, Number(id) || 0).first());
  if (plan) await savePlan(db, { ...plan, seen: true });
}
// The athlete's own change of a session of this week (the plan's week view):
// { date, op: "move", to } | { date, op: "minutes", minutes } | { date, op: "skip" } | { date, op: "reset" }.
export function planEdit(plan, { date, op, to = null, minutes = null }, today) {
  const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  if (!valid(date) || date < today) throw new Error(L("Tento trénink už nejde změnit.", "This session can no longer be changed."));
  const edits = Object.fromEntries(Object.entries(plan.edits || {}).filter(([d]) => d >= shift(mondayOf(today), -7)));
  // A red morning's swap (planRedMorning) stays: the hard session does not come back that day.
  if (edits[date]?.auto === "red" && (op === "reset" || op === "move")) throw new Error(L("Po červeném ránu zůstane náročný trénink na jiném dni.", "After a red morning the hard session stays on another day."));
  if (op === "move") {
    if (!valid(to) || to < today || mondayOf(to) !== mondayOf(date) || to === date) throw new Error(L("Vyber jiný den tohoto týdne.", "Pick another day of this week."));
    edits[date] = { to };
  } else if (op === "minutes") {
    const m = Math.round(Number(minutes));
    if (!(m >= 20 && m <= MAX_MINUTES.ride)) throw new Error(L(`Délka musí být 20–${MAX_MINUTES.ride} minut.`, `The length must be 20–${MAX_MINUTES.ride} minutes.`));
    edits[date] = { ...(edits[date]?.to ? {} : edits[date]), minutes: m };
  } else if (op === "skip") edits[date] = { skip: true };
  else if (op === "reset") delete edits[date];
  else throw new Error(L("Neznámá změna.", "Unknown change."));
  return { ...plan, edits };
}
// Training days this week only (2–7), or null for the usual week.
export function planWeekDays(plan, monday, days) {
  const weekDays = Object.fromEntries(Object.entries(plan.weekDays || {}).filter(([m]) => m >= shift(monday, -7)));
  if (days == null) delete weekDays[monday];
  else { const n = Math.round(Number(days)); if (!(n >= 1 && n <= 7)) throw new Error(L("Vyber 1–7 dní.", "Pick 1–7 days.")); weekDays[monday] = n; }
  return { ...plan, weekDays };
}

// ---- what the plan will look like ---------------------------------------------
// An estimate for the plan's weeks before it starts: the sessions on the
// athlete's days of the sport (the plan's range), the time from the usual
// load (fitness × 7) times the week's load, at the plan sport's typical
// intensity, and no more than the days' free time. Fitness follows what each
// week does (a 42-day average moves 1 − e^(−7/42) ≈ 15 % of the way a week),
// so a lot of free time is a ceiling the plan grows into, not the first
// week. With two weeks in turn (shift work) each week takes its own time. The
// week planner makes the real week from the same load, so the numbers are
// close but not exact.
const isWeekBOf = (monday, alternate) => {
  const weeks = Math.round((Date.parse(monday + "T12:00:00Z") - Date.parse(mondayOf(alternate) + "T12:00:00Z")) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2 === 1;
};
const GYM_DAY = [30, 90];
const setMinutes = m => m == null || m === "" || !Number.isFinite(Number(m)) ? null : Math.max(0, Number(m));
export function planPreview(template, { ctl = null, days = [], firstDay = null, startDate, availability = [], availabilityB = null, alternate = null, perWeek = null, sports = null } = {}) {
  const sport = template.sport, gym = sport === "gym", tri = sport === "triathlon";
  // A triathlon week has its sessions per sport, some days two.
  const n = tri ? Object.values(template.perSport).reduce((a, b) => a + b, 0) : clamp(days.length || template.days[0], template.days[0], template.days[1]);
  const start = Math.max(Number(ctl) || 35, 20), intensity = sport === "run" ? .75 : .72, perTss = 60 / (intensity * intensity * 100);
  // A day set to no time counts as 0; only a day without a set time is open.
  const minutesOf = (list, i) => setMinutes(list?.[i]?.minutes);
  // Days without a set time do not limit the week.
  const freeOf = list => days.length ? days.reduce((sum, i) => sum + (minutesOf(list, i) ?? Infinity), 0) : Infinity;
  const shifts = Boolean(alternate && availabilityB);
  const listFor = i => shifts && isWeekBOf(shift(startDate, i * 7), alternate) ? availabilityB : availability;
  const firstFrom = firstDay ? (new Date(firstDay + "T12:00:00Z").getUTCDay() + 6) % 7 : 0;
  const picked = planSports({ template, sports }), summary = templateSummary(template, template.choose ? picked : null);
  // A gym plan: its days (the first gym days of the week, two apart up to three
  // sessions), the part of the body each trains and the day's time up to 90 minutes.
  const gymDays = sessions => gymPickDays(Array.from({ length: 7 }, (_, i) => days.includes(i) ? ["gym"] : []), sessions);
  const gymMinutes = (list, i) => clamp(minutesOf(list, i) ?? 60, 0, GYM_DAY[1]);
  let fitness = start;
  const weeks = template.weeks.map((w, i) => {
    const list = listFor(i), free = freeOf(list), b = shifts && list === availabilityB;
    const left = i === 0 && firstFrom ? days.filter(d => d >= firstFrom).length : days.length;
    if (gym) {
      const sessions = gymSessions({ perWeek }, { spec: w, template }), picked = gymDays(sessions);
      return { week: i + 1, phase: w.phase, phaseLabel: summary.weeks[i].phaseLabel, keys: summary.weeks[i].keys, race: Boolean(w.race), sessions, minutes: picked.reduce((sum, d) => sum + gymMinutes(list, d), 0) || sessions * 60, tss: 0, ...(b ? { weekB: true } : {}) };
    }
    const sessions = i === 0 && firstFrom ? Math.min(n, Math.max(tri ? Math.round(n * left / Math.max(1, days.length)) : left, Math.min(n, w.q.length))) : n;
    const share = sessions / n, want = fitness * 7 * w.load * share * perTss, capped = want > free * share;
    const minutes = Math.round(Math.min(want, free * share) / 5) * 5;
    fitness += (minutes / perTss / 7 - fitness) * (1 - Math.exp(-7 / 42));
    const keys = summary.weeks[i].keys;
    return { week: i + 1, phase: w.phase, phaseLabel: summary.weeks[i].phaseLabel, keys, race: Boolean(w.race), sessions, minutes, tss: Math.round(minutes / perTss), ...(capped ? { capped: true } : {}), ...(b ? { weekB: true } : {}) };
  });
  const sum = k => weeks.reduce((a, w) => a + w[k], 0);
  return { startDate, firstDay, endDate: shift(startDate, template.weeks.length * 7 - 1), days, weeks, totals: { sessions: sum("sessions"), minutes: sum("minutes"), tss: sum("tss") },
    time: planTime(template, { days, availability, availabilityB: shifts ? availabilityB : null, alternate: shifts ? mondayOf(alternate) : null, fitness: start, perTss, n }),
    ...(gym ? { gym: gymPreview(template, { perWeek, days, availability, gymDays, gymMinutes }) } : {}) };
}
// The free time the plan works with: each weekday's minutes (both weeks with
// shift work), the plan days' total and the range that suits the plan at the
// athlete's fitness now: the usual week's time from fitness (the lower end)
// to its hardest week (the upper end). Less than the lower end: the plan
// keeps its key sessions and shortens the easy ones (`short`).
function planTime(template, { days, availability, availabilityB, alternate, fitness, perTss, n }) {
  const perDay = list => Array.from({ length: 7 }, (_, i) => Number(list?.[i]?.minutes) > 0 ? Number(list[i].minutes) : null);
  const total = list => days.some(i => setMinutes(list?.[i]?.minutes) == null) ? null : days.reduce((sum, i) => sum + setMinutes(list[i].minutes), 0);
  const out = { days: perDay(availability), total: total(availability), ...(availabilityB ? { daysB: perDay(availabilityB), totalB: total(availabilityB), alternate } : {}) };
  if (template.sport === "gym") return out;
  const loads = template.weeks.filter(w => !w.race).map(w => w.load), round = m => Math.round(m / 15) * 15;
  const suits = [round(fitness * 7 * perTss), round(fitness * 7 * Math.max(...loads) * perTss * 1.15)];
  const least = [out.total, out.totalB].filter(x => x != null);
  const short = least.length ? Math.min(...least) < suits[0] * .85 : false;
  const note = template.sport === "run"
    ? L("Na tento plán je času málo. Klíčové běhy zůstanou, lehké se zkrátí a odhad cíle bude opatrnější.", "Time is short for this plan. The key runs stay, the easy ones get shorter and the goal estimate is more careful.")
    : template.sport === "ride" ? L("Na tento plán je času málo. Klíčové jízdy zůstanou, lehké se zkrátí a odhad cíle bude opatrnější.", "Time is short for this plan. The key rides stay, the easy ones get shorter and the goal estimate is more careful.")
    : L("Na tento plán je času málo. Klíčové tréninky zůstanou, lehké se zkrátí a odhad cíle bude opatrnější.", "Time is short for this plan. The key sessions stay, the easy ones get shorter and the goal estimate is more careful.");
  return { ...out, suits, short, ...(short ? { note } : {}), sessions: n };
}
function gymPreview(template, { perWeek, days, availability, gymDays, gymMinutes }) {
  const usual = gymUsual(template), n = Number(perWeek) >= GYM_PER_WEEK[0] && Number(perWeek) <= GYM_PER_WEEK[1] ? Math.round(Number(perWeek)) : usual;
  const picked = gymDays(n), parts = GYM_PARTS();
  return {
    perWeek: n, usual, range: GYM_PER_WEEK, split: gymSplitName(n),
    days: picked.map((d, k) => ({ day: d, part: gymPart(n, k), label: gymPart(n, k) ? parts[gymPart(n, k)] : L("celé tělo", "full body"), minutes: gymMinutes(availability, d) })),
    ...(picked.some(d => gymMinutes(availability, d) < GYM_DAY[0]) ? { short: true, note: L("Některý den má méně než 30 minut. Trénink ten den bude krátký, nebo si vyber jiný den.", "A day has less than 30 minutes. That session will be short, or pick another day.") } : {}),
    ...(n === 7 ? { noRest: true, note: L("Sedm dní bez volna: sedmý den je lehký, jen pohyblivost a střed těla.", "Seven days without rest: the seventh is light, only mobility and the trunk.") } : {})
  };
}
// How much of each past week was done, in %: days with a session of the
// sport (gym days for a gym plan) against the sessions the week had (the
// usual days, fewer when the athlete asked for fewer, without skipped ones
// and days before the start).
export function planCompletion(plan, { days = [], doneDates = [], today }) {
  const template = getTemplate(plan.templateId);
  if (!template) return {};
  const n = clamp(days.length || template.days[0], template.days[0], template.days[1]), done = new Set(doneDates), out = {};
  for (let i = 0; i < template.weeks.length; i++) {
    const monday = shift(plan.startDate, i * 7), end = shift(monday, 7);
    if (end > today) break;
    // A gym week has its own number of sessions.
    let planned = template.weeks[i].gym ? Math.min(gymSessions(plan, { spec: template.weeks[i], template }), days.length || 7) : Number(plan.weekDays?.[monday]) || n;
    if (plan.firstDay && monday === mondayOf(plan.firstDay)) planned = Math.min(planned, Math.max(1, days.filter(d => shift(monday, d) >= plan.firstDay).length));
    planned -= Object.entries(plan.edits || {}).filter(([d, e]) => e.skip && d >= monday && d < end).length;
    const did = [...done].filter(d => d >= monday && d < end).length;
    out[i + 1] = planned > 0 ? Math.round(Math.min(did, planned) / planned * 100) : 100;
  }
  return out;
}

// ---- what the app shows ----------------------------------------------------------
const keyLabel = (sport, k) => k.test ? testLabel(sport) : planName(baseName(planWorkoutId(sport, k, sport === "swim" ? 45 : sport === "run" ? 60 : 90))) || k.family;
// A multisport race's legs for the app: `legList` in order; `legs` by sport for a triathlon (older apps read it).
function raceLegsSummary(r) {
  if (!r) return {};
  const legList = raceLegs(r).map(([sport, d]) => ({ sport, ...(sport === "swim" ? { meters: d } : { km: d }) }));
  return { legList, ...(r.legs ? {} : { legs: { swimMeters: r.swim, rideKm: r.ride, runKm: r.run } }) };
}
// `sports`: a plan's picked sports (only their key sessions).
export function templateSummary(t, sports = null) {
  return {
    id: t.id, sport: t.sport, name: t.name, goal: t.goal, description: t.description, level: t.level, weeksCount: t.weeks.length, days: t.days,
    race: t.race ? { km: t.race.km, options: t.race.options || null, kind: t.race.ride || t.race.tri || null, ...(t.race.tri ? raceLegsSummary(TRI_RACES[t.race.tri]) : {}) } : null, ...(t.perSport ? { perSport: t.perSport, sports: planSports(t), ...(t.choose ? { choose: true } : {}) } : {}), tests: Boolean(t.tests),
    weeks: t.weeks.map((w, i) => ({ week: i + 1, phase: w.phase, phaseLabel: w.gym ? w.gym.name : phaseLabel(w.phase, t.sport), load: w.load, keys: w.gym?.test ? [TEST_KEYS(), L(`${w.gym.sessions}× týdně`, `${w.gym.sessions}× a week`)] : w.gym ? [L(`${w.gym.sessions}× týdně`, `${w.gym.sessions}× a week`), `${w.gym.sets} × ${w.gym.reps}`, "RPE " + w.gym.rpe] : [...w.q.filter(k => !sports || !k.sport || sports.includes(k.sport)).map(k => keyLabel(k.sport || t.sport, k)), ...(t.sport === "swim" && w.long?.family ? [keyLabel(t.sport, w.long)] : [])], longMinutes: w.sports ? (w.sports.ride || w.sports.run)?.long?.minutes ?? null : w.long?.minutes ?? w.easy?.minutes ?? null, race: Boolean(w.race),
      ...(w.sports ? { long: Object.fromEntries(Object.keys(w.sports).map(s => [s, s === "swim" ? (w.sports.swim.long ? keyLabel("swim", w.sports.swim.long) : null) : w.sports[s].long?.minutes ?? null])), brick: w.brick ?? null } : {}) }))
  };
}
export function planSummary(plan, today) {
  const template = plan && getTemplate(plan.templateId);
  if (!template) return null;
  const pw = planWeek(plan, today), started = today >= plan.startDate;
  return { id: plan.id, templateId: template.id, sport: template.sport, name: template.name, goal: template.goal, startDate: plan.startDate, firstDay: plan.firstDay || null, endDate: shift(plan.startDate, template.weeks.length * 7 - 1), weekDays: plan.weekDays?.[mondayOf(today)] ?? null, raceDate: plan.raceDate, raceKm: plan.raceKm, target: plan.target ?? null, week: pw?.week ?? (started ? template.weeks.length : 0), weeksCount: template.weeks.length, phase: pw?.spec.phase ?? null, phaseLabel: pw ? pw.spec.gym?.name ?? phaseLabel(pw.spec.phase, template.sport) : null, started, paused: Boolean(plan.pauseFrom), shiftedWeeks: plan.shiftedWeeks || 0, returning: Boolean(pw?.spec.returning || pw?.spec.light), ...(template.sport === "gym" ? { perWeek: pw ? gymSessions(plan, pw) : plan.perWeek ?? gymUsual(template), split: gymSplitName(pw ? gymSessions(plan, pw) : plan.perWeek ?? gymUsual(template)) } : {}), ...(template.perSport ? { sports: planSports(plan), perSport: perSportOf(template, plan) } : {}), template: templateSummary(template, template.choose ? planSports(plan) : null) };
}

// ---- a proposal in words (Today's plan card) -----------------------------------
const ACC = () => [L("na pondělí", "to Monday"), L("na úterý", "to Tuesday"), L("na středu", "to Wednesday"), L("na čtvrtek", "to Thursday"), L("na pátek", "to Friday"), L("na sobotu", "to Saturday"), L("na neděli", "to Sunday")];
const LOC = () => [L("V pondělí", "On Monday"), L("V úterý", "On Tuesday"), L("Ve středu", "On Wednesday"), L("Ve čtvrtek", "On Thursday"), L("V pátek", "On Friday"), L("V sobotu", "On Saturday"), L("V neděli", "On Sunday")];
const weekdayOf = date => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
const dayMonth = date => { const d = new Date(date + "T12:00:00Z"); return d.getUTCDate() + ". " + (d.getUTCMonth() + 1) + "."; };
// { type, title, text, options: [{ id, label, date?, recommended? }], button }
export function proposalView(proposal, plan, today) {
  if (!proposal) return null;
  const race = plan?.raceDate && getTemplate(plan.templateId)?.race ? plan.raceDate : null;
  if (proposal.type === "missed") {
    const when = daysBetween(proposal.date, today) === 1 ? L("Včera", "Yesterday") : LOC()[weekdayOf(proposal.date)];
    const options = [
      ...(proposal.suggest ? [{ id: "move", date: proposal.suggest, label: L("Přesunout ", "Move ") + ACC()[weekdayOf(proposal.suggest)], recommended: true }] : []),
      { id: "pick", label: L("Vybrat jiný den", "Pick another day") },
      { id: "skip", label: L("Vynechat", "Skip it"), recommended: !proposal.suggest }
    ];
    return { type: "missed", title: L("Vynechaný trénink", "Missed session"), text: when + L(" zůstal nesplněný trénink: ", " you missed ") + proposal.label + ".", options, days: proposal.days, button: L("Přesunout", "Move") };
  }
  if (proposal.type === "week") {
    return { type: "week", title: L("Revize plánu", "Plan review"), text: L("Minulý týden je hotovo ", "Last week you did ") + proposal.done + L(" ze ", " of ") + proposal.total + L(" klíčových tréninků.", " key sessions."), button: L("Použít", "Apply"), options: [
      { id: "repeat", label: L("Zopakovat týden ", "Repeat week ") + proposal.week, recommended: true },
      { id: "continue", label: L("Pokračovat týdnem ", "Go on with week ") + proposal.next },
      { id: "light", label: L("Odlehčený týden, pak týden ", "A lighter week, then week ") + proposal.week }] };
  }
  if (proposal.type === "return") {
    const weeks = proposal.weeks;
    return { type: "return", title: L("Návrat do tréninku", "Back to training"), text: proposal.days + L(" dní bez tréninku.", " days without training.") + (race ? L(" Závod ", " Race on ") + dayMonth(race) : ""), button: L("Použít", "Apply"), options: [
      { id: "light", label: L("Lehčí týden, pak dál podle plánu", "A lighter week, then the plan as it is"), recommended: true },
      ...(proposal.options.includes("shift") ? [{ id: "shift", label: L("Posunout plán o ", "Move the plan by ") + weeks + " " + plural(weeks, "týden", "týdny", "týdnů", "week", "weeks") }] : []),
      { id: "continue", label: L("Pokračovat beze změny", "Go on unchanged") }] };
  }
  // A change the plan made already (trendProposal): OK, or keep the plan as it was.
  if (proposal.type === "lighter") {
    const h = proposal.hrv || {}, sleep = h.sleep ? L(` a spal jsi v průměru ${hours(h.sleep)}`, ` and you slept ${hours(h.sleep)} on average`) : "";
    const why = h.below ? L(`Tvoje HRV bylo ${h.below} ${plural(h.below, "den", "dny", "dní", "day", "days")} z posledních 7 pod tvým normálem${sleep}.`, `Your HRV has been below your normal on ${h.below} of the last 7 days${sleep}.`) : L("Tvoje HRV je poslední týden pod tvým normálem.", "Your HRV has been below your normal over the last week.");
    return { type: "lighter", title: L("Plán upraven", "Plan adapted"), headline: L("Tento týden je lehčí", "This week is lighter"), text: why + L(` Odpočinkový týden se posouvá z ${proposal.recoveryWeek}. týdne na teď.`, ` The recovery week moves forward from week ${proposal.recoveryWeek} to now.`),
      options: [{ id: "ok", label: "OK", recommended: true }], button: "OK", keep: L("Nechat plán", "Keep the plan"), ...(h.values ? { chart: { values: h.values, low: h.low, high: h.high } } : {}) };
  }
  if (proposal.type === "harder") {
    return { type: "harder", title: L("Plán upraven", "Plan adapted"), headline: L("Zlepšuješ se rychle", "You are adapting fast"), text: L("Všechny klíčové tréninky posledních 3 týdnů máš hotové a šly ti lehčeji, než plán čekal. HRV je stabilní. Od příštího týdne jsou klíčové tréninky o úroveň těžší a týden o 5 % delší.", "You finished every key session of the last 3 weeks and they felt easier than planned. HRV is steady. From next week the key sessions are one level harder and the week 5 % longer."),
      options: [{ id: "ok", label: "OK", recommended: true }], button: "OK", keep: L("Nechat jak bylo", "Keep it as it was") };
  }
  return null;
}
const hours = minutes => Math.floor(minutes / 60) + " h " + String(Math.round(minutes % 60)).padStart(2, "0") + " min";
