// Trénink → Svaly: how tired each muscle of the exercise catalogue is now and
// when it is rested again, from the gym sets the athlete completed and the
// rides, runs and walks of the last days (Intervals.icu, the app, the watch).
//
// It stands on the muscle model the app already has:
// - the muscles are the catalogue's own (`muscle` of EXERCISES in
//   strength-generator.js), labelled as the gym catalogue labels them;
// - an RPE scales a set and a set to failure recovers 1.3× slower, as in the
//   muscle freshness of fitness-insights.js (setEffort, isFailure);
// - the recovery time constant of each muscle is fitness-insights.js'
//   RECOVERY_DAYS (≈72 h for large muscles after multi-joint lifts, ≈48 h for
//   the rest; Korak 2015, McLester 2003, Morán-Navarro 2017);
// - the legs' share of a ride, run or walk is fitness-insights.js'
//   muscleEvents (training load × share per muscle), and a ride counts 70 %
//   like the gym generator's sportMuscleLoad (strength-balance.js: cycling is
//   concentric work with little muscle damage). These are rough estimates and
//   the response marks them so.
//
// The unit is one hard set (RPE 8) of the muscle. Local fatigue follows the
// number of hard sets a muscle did, not the catalogue's `fatigue`, which says
// how tiring an exercise is for the whole body: three sets of curls tire the
// biceps as much as three sets of squats tire the thighs. The muscles that
// help (SECONDARY below) get their share of each set, so a squat day does
// not leave the glutes looking rested.
//
// Constants, conservative on purpose (when unsure a muscle stays tired longer):
// - RESTED_BELOW: a muscle is rested once less than 1.75 hard sets of fatigue
//   remain, set so that a usual session of 4–6 hard sets leaves the thighs,
//   glutes and hamstrings tired for 48–72 h (about 30 h after 3 sets) and the
//   small muscles of the arms and shoulders for 36–53 h. Sets the muscles do
//   on other days, and what they help with, add up.
// - MAX_HOURS: 96 h at most, the longest the studies above report.
// - FATIGUED_HOURS: "unavené" (red) while a day or more is left, otherwise
//   "zotavuje se" (amber).
// - FULL: the bar is full at 6 hard sets of fatigue, a whole session for one muscle.
// - WINDOW_DAYS: sets and activities of the last 7 days; older ones are
//   have left (almost) nothing.
import { L, num, isImperial, M_PER_MILE } from "./lang.js";
import { EXERCISES } from "./strength-generator.js";
import { normalizeExerciseName } from "./strength-normalization.js";
import { RECOVERY_DAYS, FAILURE_RECOVERY, SET_LOAD, setEffort, isFailure, muscleEvents, activityKind, storedActivities } from "./fitness-insights.js";
import { muscleLabel } from "./gym-catalog.js";
import { sessionOf } from "./activity-match.js";
import { localDate, zonedTime } from "./user-time.js";

const HOUR = 3600000, DAY = 86400000;
export const RESTED_BELOW = 1.75, MAX_HOURS = 96, FATIGUED_HOURS = 24, FULL = 6, WINDOW_DAYS = 7;
const RIDE_SHARE = 0.7;
// A gym day without a known time counts as done at 18:00.
const GYM_HOUR = "T18:00:00";
// An activity is listed under "Z posledních 3 dní" when it left at least half
// a hard set on some muscle (a short walk does not).
const LISTED_FROM = 0.5;

// The catalogue's muscles, in the order the screen lists them when equally tired.
export const MUSCLES = ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "chest", "back", "lower_back", "traps", "shoulders", "side_delts", "rear_delts", "biceps", "triceps", "forearms", "core"];
// Their recovery time constant (days) from fitness-insights.js: the body-map
// muscle each one is (glutes and the hip muscles: "hips", back: the upper back).
const BODY_MAP = { glutes: "hips", abductors: "hips", adductors: "hips", back: "upper_back", shoulders: "front_delts", core: "abs" };
const tauDays = muscle => RECOVERY_DAYS[BODY_MAP[muscle] || muscle] || 1.4;

// The muscles that help in a movement pattern, as a share of the set. The
// primary muscle of the exercise is never counted twice.
export const SECONDARY = {
  push: { triceps: .5, shoulders: .4 },
  horizontal_push: { shoulders: .3 },
  push_vertical: { triceps: .5, side_delts: .3 },
  pull: { biceps: .5, rear_delts: .4 },
  pull_vertical: { biceps: .5, rear_delts: .2 },
  quad: { glutes: .5, adductors: .4 },
  unilateral_quad: { glutes: .6, adductors: .3, hamstrings: .2 },
  lunge: { quads: .6, adductors: .3, hamstrings: .2 },
  glute_press: { quads: .5, hamstrings: .3, adductors: .3 },
  hinge: { hamstrings: .6, glutes: .6, lower_back: .4 },
  hip_extension: { hamstrings: .4 },
  glute_kickback: { hamstrings: .2 },
  hamstring: { calves: .2 },
  trunk_extension: { lower_back: .6, glutes: .3 },
  rear_delt: { traps: .3 },
  lateral_raise: { traps: .2 },
  upright_row: { side_delts: .5, biceps: .2 },
  shrug: { forearms: .3 },
  biceps: { forearms: .3 },
  reverse_curl: { biceps: .4 },
  slam: { shoulders: .3, back: .2 }
};
// Exercises that work differently from their pattern.
const SECONDARY_OF = {
  "Leg extension Prime": {},
  "Cable pullover": { triceps: .2 },
  "Dips": { chest: .5, shoulders: .3 },
  "Assisted dip": { chest: .5, shoulders: .3 },
  "Smith machine incline press": { triceps: .5, shoulders: .4 },
  "Glute bridge": { hamstrings: .3 },
  "Trap bar deadlift": { quads: .5, hamstrings: .5, lower_back: .4 }
};

// The muscles one set of an exercise works, primary 1 and the helpers their share.
export function setMuscles(exercise) {
  const name = normalizeExerciseName(exercise), def = EXERCISES[name];
  if (!def?.muscle) return {};
  const out = { [def.muscle]: 1 };
  for (const [muscle, share] of Object.entries(SECONDARY_OF[name] || SECONDARY[def.pattern] || {})) if (muscle !== def.muscle) out[muscle] = share;
  return out;
}

const dateOnly = v => String(v || "").slice(0, 10);
const shiftDate = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const storedInstant = v => { const s = String(v || ""); if (!s) return NaN; return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z"); };

// When each gym day ended: a strength workout the watch or Intervals.icu
// recorded that day, else the last set saved that day, else 18:00.
function gymEnds(sets, strengthWorkouts) {
  const saved = new Map(), recorded = new Map();
  for (const s of sets) {
    const date = dateOnly(s.workout_date), at = storedInstant(s.updated_at);
    if (Number.isFinite(at) && localDate(new Date(at)) === date && !(saved.get(date) >= at)) saved.set(date, at);
  }
  for (const w of strengthWorkouts) if (!(recorded.get(w.date) >= w.end)) recorded.set(w.date, w.end);
  return date => recorded.get(date) ?? saved.get(date) ?? zonedTime(date + GYM_HOUR);
}

// Doses of fatigue: {at, muscle, dose, failure, estimated, source}.
export function fatigueDoses({ sets = [], activities = [], now }) {
  const doses = [], sources = new Map();
  const strength = activities.filter(a => a.kind === "strength" && Number.isFinite(a.end)).map(a => ({ date: localDate(new Date(a.end)), end: a.end }));
  const endOf = gymEnds(sets, strength);
  for (const s of sets) {
    const date = dateOnly(s.workout_date), muscles = setMuscles(s.exercise);
    if (!date || !Object.keys(muscles).length) continue;
    const at = Math.min(now, endOf(date));
    if (!Number.isFinite(at)) continue;
    const effort = setEffort(s.rpe), failure = isFailure(s.rpe), key = "gym:" + date;
    if (!sources.has(key)) sources.set(key, { kind: "gym", date, at, muscles: {} });
    const source = sources.get(key);
    for (const [muscle, share] of Object.entries(muscles)) {
      doses.push({ at, muscle, dose: share * effort, failure, estimated: false, source: key });
      source.muscles[muscle] = (source.muscles[muscle] || 0) + share * effort;
    }
  }
  activities.forEach((a, i) => {
    const kind = a.kind || activityKind(a);
    if (!["ride", "run", "walk"].includes(kind) || !Number.isFinite(a.end) || a.end > now) return;
    const key = "activity:" + i, source = { kind, date: localDate(new Date(a.end)), at: a.end, distance: a.distance, minutes: a.minutes, muscles: {} };
    for (const e of muscleEvents({ activities: [{ ...a, date: source.date }] })) {
      const muscle = e.muscle === "hips" ? "glutes" : e.muscle, dose = e.load / SET_LOAD * (kind === "ride" ? RIDE_SHARE : 1);
      doses.push({ at: a.end, muscle, dose, failure: false, estimated: true, source: key });
      source.muscles[muscle] = (source.muscles[muscle] || 0) + dose;
    }
    sources.set(key, source);
  });
  return { doses, sources: [...sources.values()] };
}

const fatigueAt = (doses, t) => doses.reduce((sum, d) => sum + d.dose * Math.exp(-(t - d.at) / (tauDays(d.muscle) * DAY * (d.failure ? FAILURE_RECOVERY : 1))), 0);

// One muscle now: its fatigue (hard sets), the hours until it is rested and its state.
export function muscleState(doses, muscle, now) {
  const own = doses.filter(d => d.muscle === muscle && d.at <= now);
  const fatigue = fatigueAt(own, now);
  let hours = 0;
  while (hours < MAX_HOURS && fatigueAt(own, now + hours * HOUR) >= RESTED_BELOW) hours++;
  const estimated = fatigue > 0 && fatigueAt(own.filter(d => d.estimated), now) / fatigue >= 0.5;
  return { fatigue, hours, state: hours === 0 ? "rested" : hours >= FATIGUED_HOURS ? "fatigued" : "recovering", estimated };
}

const WEEKDAYS = [["neděle", "Sunday"], ["pondělí", "Monday"], ["úterý", "Tuesday"], ["středa", "Wednesday"], ["čtvrtek", "Thursday"], ["pátek", "Friday"], ["sobota", "Saturday"]];
function dayText(date, today) {
  if (date === today) return L("dnes", "today");
  if (date === shiftDate(today, -1)) return L("včera", "yesterday");
  const [cs, en] = WEEKDAYS[new Date(date + "T12:00:00Z").getUTCDay()];
  return L(cs, en);
}
const LEGS = new Set(["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"]);
function sourceTitle(s) {
  if (s.kind === "gym") {
    const total = Object.values(s.muscles).reduce((a, b) => a + b, 0) || 1;
    const legs = Object.entries(s.muscles).filter(([m]) => LEGS.has(m)).reduce((a, [, v]) => a + v, 0) / total;
    const core = (s.muscles.core || 0) / total;
    const part = legs >= .6 ? L("nohy", "legs") : core >= .6 ? L("střed těla", "core") : legs <= .2 ? L("horní část těla", "upper body") : L("celé tělo", "full body");
    return L("Posilovna, ", "Gym, ") + part;
  }
  const name = { ride: L("Jízda", "Ride"), run: L("Běh", "Run"), walk: L("Chůze", "Walk") }[s.kind];
  const km = Number(s.distance) / 1000;
  if (km >= 0.5) {
    const value = isImperial() ? Number(s.distance) / M_PER_MILE : km;
    return name + " " + num(value, value < 10 ? 1 : 0) + (isImperial() ? " mi" : " km");
  }
  const minutes = Math.round(Number(s.minutes) || 0);
  if (minutes <= 0) return name;
  return name + " " + (minutes >= 60 ? Math.floor(minutes / 60) + " h" + (minutes % 60 ? " " + (minutes % 60) + " min" : "") : minutes + " min");
}

// The screen: every muscle with its state, the most tired first, and what
// tired them in the last 3 days. sets: completed WORK sets {workout_date,
// exercise, rpe, updated_at}; activities: {kind, end (ms), tss, durationHours
// or moving_time, distance (m), minutes}; now: ms; today: the user's date.
export function muscleFatigue({ sets = [], activities = [], now, today }) {
  const { doses, sources } = fatigueDoses({ sets, activities, now });
  const muscles = MUSCLES.map((id, order) => {
    const m = muscleState(doses, id, now), readyAt = m.hours ? new Date(now + m.hours * HOUR) : null;
    return {
      id, label: muscleLabel(id), state: m.state, level: Math.round(Math.min(1, m.fatigue / FULL) * 100) / 100,
      hours: m.hours, readyAt: readyAt ? readyAt.toISOString() : null, readyDate: readyAt ? localDate(readyAt) : null,
      estimated: m.estimated, order
    };
  }).sort((a, b) => b.hours - a.hours || b.level - a.level || a.order - b.order).map(({ order, ...m }) => m);
  const from = shiftDate(today, -3);
  const recent = sources.filter(s => s.date >= from && s.date <= today && Math.max(0, ...Object.values(s.muscles)) >= LISTED_FROM)
    .sort((a, b) => b.at - a.at)
    .map(s => ({ kind: s.kind, date: s.date, title: sourceTitle(s), day: dayText(s.date, today), estimated: s.kind !== "gym" }));
  return { status: "ok", date: today, muscles, recent };
}

// Server side: the last week's completed sets and activities from D1.
export async function loadMuscleFatigue(db, { now = Date.now() } = {}) {
  const today = localDate(new Date(now)), since = shiftDate(today, -WINDOW_DAYS);
  // The source and type lists first, so the read stays on the index
  // (user_id, source_family, data_type, start_time).
  const [setRows, activityRows] = await Promise.all([
    db.prepare("SELECT workout_date,exercise,rpe,updated_at FROM strength_sets WHERE user_id=? AND completed=1 AND type='WORK' AND workout_date>=? AND workout_date<=?").bind(db.userId, since, today).all().catch(() => ({ results: [] })),
    db.prepare("SELECT source_family,start_time,end_time,payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local','google-wearables','apple-health') AND data_type IN ('activity','exercise') AND start_time>=? AND ((source_family IN ('intervals','local') AND data_type='activity') OR (source_family IN ('google-wearables','apple-health') AND data_type='exercise')) AND (record_role IS NULL OR record_role!='duplicate')").bind(db.userId, since).all().catch(() => ({ results: [] }))
  ]);
  const activities = storedActivities(activityRows.results || [], { keepRow: true }).map(({ row, ...a }) => {
    const s = sessionOf(row), minutes = s?.minutes || Number(a.moving_time) / 60 || 0;
    return { ...a, kind: activityKind(a), minutes, durationHours: minutes / 60, end: s ? s.at + minutes * 60000 : NaN };
  });
  return muscleFatigue({ sets: setRows.results || [], activities, now, today });
}

