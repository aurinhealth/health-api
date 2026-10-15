// Svaly → one muscle: whether it is getting stronger and how often it is
// trained (GET /app/api/muscles/detail?id=quads).
//
// - strength: the best estimated maximum (Epley, sets of 1–12 reps) of the
//   muscle's main exercise per week over the last 8 weeks. The main exercise
//   is the one with the muscle as its catalogue muscle done on the most days.
//   change: the last week against the first, once there are two weeks.
// - calendar: the days of the last 4 weeks (Monday to Sunday, this week
//   last) the muscle got at least one set's worth of work, and the average
//   per finished week against the target of twice a week.
// - recent: the last exercises that worked it as their main muscle, with
//   the heaviest set; best: the heaviest estimated maximum of the 8 weeks.
import { L } from "./lang.js";
import { EXERCISES } from "./strength-generator.js";
import { normalizeExerciseName } from "./strength-normalization.js";
import { muscleLabel } from "./gym-catalog.js";
import { MUSCLES, WEEKLY_TARGET, trainedDays } from "./muscle-fatigue.js";
import { localDate } from "./user-time.js";

const DAY = 86400000, WEEKS = 8, CALENDAR_WEEKS = 4, RECENT = 3;
const dateOnly = v => String(v || "").slice(0, 10);
const shiftDate = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const mondayOf = date => shiftDate(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
const n = v => Number(v) || 0;
export const e1rm = (kg, reps) => kg > 0 && reps >= 1 && reps <= 12 ? kg * (1 + reps / 30) : null;
const own = (exercise, muscle) => EXERCISES[normalizeExerciseName(exercise)]?.muscle === muscle;
const round1 = v => Math.round(v * 10) / 10;

const WEEKDAYS = [["neděle", "Sunday"], ["pondělí", "Monday"], ["úterý", "Tuesday"], ["středa", "Wednesday"], ["čtvrtek", "Thursday"], ["pátek", "Friday"], ["sobota", "Saturday"]];
function dayText(date, today) {
  if (date === today) return L("dnes", "today");
  if (date === shiftDate(today, -1)) return L("včera", "yesterday");
  const days = Math.round((Date.parse(today) - Date.parse(date)) / DAY);
  if (days < 7) { const [cs, en] = WEEKDAYS[new Date(date + "T12:00:00Z").getUTCDay()]; return L(cs, en); }
  const d = new Date(date + "T12:00:00Z");
  return L(`${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`, d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }));
}

// sets: completed WORK sets {workout_date, exercise, actual_kg, actual_reps}.
export function muscleDetail({ sets = [], muscle, today }) {
  const start = mondayOf(shiftDate(today, -7 * (WEEKS - 1)));
  const window = sets.filter(s => dateOnly(s.workout_date) >= start && dateOnly(s.workout_date) <= today);
  const mine = window.filter(s => own(s.exercise, muscle));

  // The main exercise: done on the most days, with weights.
  const daysOf = new Map();
  for (const s of mine) {
    if (!e1rm(n(s.actual_kg), n(s.actual_reps))) continue;
    const name = normalizeExerciseName(s.exercise);
    if (!daysOf.has(name)) daysOf.set(name, new Set());
    daysOf.get(name).add(dateOnly(s.workout_date));
  }
  const main = [...daysOf].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0]?.[0] || null;
  let strength = null;
  if (main) {
    const weeks = new Map();
    for (const s of mine) {
      if (normalizeExerciseName(s.exercise) !== main) continue;
      const v = e1rm(n(s.actual_kg), n(s.actual_reps)), week = mondayOf(dateOnly(s.workout_date));
      if (v && !(weeks.get(week) >= v)) weeks.set(week, v);
    }
    const points = [...weeks].sort((a, b) => a[0].localeCompare(b[0])).map(([week, kg]) => ({ week, kg: round1(kg) }));
    const first = points[0]?.kg, last = points[points.length - 1]?.kg;
    strength = { exercise: main, points, change: points.length >= 2 && first ? Math.round((last - first) / first * 1000) / 1000 : null };
  }

  // How often: the last 4 weeks.
  const calendarFrom = mondayOf(shiftDate(today, -7 * (CALENDAR_WEEKS - 1)));
  const days = trainedDays(window.filter(s => dateOnly(s.workout_date) >= calendarFrom), [muscle]);
  const thisMonday = mondayOf(today);
  const finished = days.filter(d => d < thisMonday).length;
  const calendar = {
    from: calendarFrom, days, target: WEEKLY_TARGET,
    perWeek: round1(finished / (CALENDAR_WEEKS - 1)),
    thisWeek: days.filter(d => d >= thisMonday).length,
    weeks: Array.from({ length: CALENDAR_WEEKS }, (_, i) => {
      const monday = shiftDate(calendarFrom, 7 * i), sunday = shiftDate(monday, 6);
      return { monday, times: days.filter(d => d >= monday && d <= sunday).length };
    })
  };

  // The last exercises, the heaviest set of each.
  const byDayExercise = new Map();
  for (const s of mine) {
    const key = dateOnly(s.workout_date) + "|" + normalizeExerciseName(s.exercise);
    if (!byDayExercise.has(key)) byDayExercise.set(key, []);
    byDayExercise.get(key).push(s);
  }
  const recent = [...byDayExercise].sort((a, b) => b[0].localeCompare(a[0])).slice(0, RECENT).map(([key, list]) => {
    const [date, exercise] = key.split("|");
    const top = list.slice().sort((a, b) => n(b.actual_kg) - n(a.actual_kg) || n(b.actual_reps) - n(a.actual_reps))[0];
    return { exercise, date, day: dayText(date, today), sets: list.length, kg: n(top.actual_kg) || null, reps: n(top.actual_reps) || null };
  });

  let best = null;
  for (const s of mine) {
    const v = e1rm(n(s.actual_kg), n(s.actual_reps));
    if (v && !(best?.e1rm >= v)) best = { exercise: normalizeExerciseName(s.exercise), kg: n(s.actual_kg), reps: n(s.actual_reps), e1rm: round1(v), date: dateOnly(s.workout_date) };
  }
  if (best) best.day = dayText(best.date, today);

  return { status: "ok", date: today, id: muscle, label: muscleLabel(muscle), strength, calendar, recent, best };
}

export async function loadMuscleDetail(db, muscle, { now = Date.now() } = {}) {
  if (!MUSCLES.includes(muscle)) return { status: "error", message: L("Neznámý sval.", "Unknown muscle.") };
  const today = localDate(new Date(now)), since = mondayOf(shiftDate(today, -7 * (WEEKS - 1)));
  const rows = await db.prepare("SELECT workout_date,exercise,actual_kg,actual_reps FROM strength_sets WHERE user_id=? AND completed=1 AND type='WORK' AND workout_date>=? AND workout_date<=?")
    .bind(db.userId, since, today).all().catch(() => ({ results: [] }));
  return muscleDetail({ sets: rows.results || [], muscle, today });
}
