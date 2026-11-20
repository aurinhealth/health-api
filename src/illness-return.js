// Back from Nemoc (athlete-state.js recoveredAt, set when Sick ends): how the
// return goes, in one place for the ride and run coach (cycling-coach-v2.js)
// and the app's "Easing back in" card (GET /app/api/athlete-state). The
// server sets the length; the athlete gets no Slowly/Balanced/Quickly choice
// (Petr, 2026-11-16, T-FYZIO-1 A):
// - 3 easy days in a row from the day Sick ends; after more than 7 days ill
//   the whole first week (audit wave 2, 9.3: an estimate after Elliott 2020,
//   a graded return);
// - the first day only recovery, at most 45 min (30 for a short day), then
//   endurance without intensity, at most 75 min (40);
// - the gym holds the weights with one set less (strength-generator.js
//   afterIllness);
// - after more than 7 days ill, a sentence about a doctor (as training-status.js
//   says while Sick lasts), never naming an illness.
import { L } from "./lang.js";

export const SHORT_ILLNESS_EASY_DAYS = 3;
export const LONG_ILLNESS_DAYS = 7;
export const LONG_ILLNESS_EASY_DAYS = 7;
// Minutes at most: [usual, short day], first day and the easy days after it.
export const FIRST_DAY_MINUTES = [45, 30];
export const EASY_DAY_MINUTES = [75, 40];

const diff = (a, b) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5);
const day = v => { const d = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; };

// How many days Sick lasted, null when the start is unknown.
export function illnessDays(state) {
  const back = day(state?.recoveredAt), from = day(state?.sickFrom);
  return back && from ? diff(back, from) : null;
}
export function easyDaysAfterIllness(state) {
  const ill = illnessDays(state);
  return ill != null && ill > LONG_ILLNESS_DAYS ? LONG_ILLNESS_EASY_DAYS : SHORT_ILLNESS_EASY_DAYS;
}
// The day of the return on `date`, 0 = the day Sick ended; null outside the easy days.
export function returnDay(state, date) {
  const back = day(state?.recoveredAt), on = day(date);
  if (!back || !on) return null;
  const since = diff(on, back);
  return since >= 0 && since < easyDaysAfterIllness(state) ? since : null;
}

// The card for the app, null outside the easy days or while still Sick.
export function illnessReturn(state, date) {
  if (!state || (state.status && state.status !== "active")) return null;
  const since = returnDay(state, date);
  if (since == null) return null;
  const easyDays = easyDaysAfterIllness(state), long = easyDays === LONG_ILLNESS_EASY_DAYS;
  const until = new Date(Date.parse(day(state.recoveredAt) + "T12:00:00Z") + (easyDays - 1) * 864e5).toISOString().slice(0, 10);
  return {
    from: day(state.recoveredAt),
    until,
    day: since + 1,
    easyDays,
    longIllness: long,
    text: long ? L("Jeden lehký týden, pak se vrátí i těžší tréninky.", "One easy week, then harder sessions come back.")
      : L("3 lehké dny, pak se vrátí i těžší tréninky.", "3 easy days, then harder sessions come back."),
    rows: [
      L(`Den 1: jen regenerace, nejvýš ${FIRST_DAY_MINUTES[0]} min`, `Day 1: recovery, up to ${FIRST_DAY_MINUTES[0]} min`),
      L(`Další dny: lehce, nejvýš ${EASY_DAY_MINUTES[0]} min, bez intenzity`, `Next days: easy, up to ${EASY_DAY_MINUTES[0]} min, no intensity`),
      L("Posilovna: stejné váhy, o sérii méně", "Gym: same weights, one set less")
    ],
    caution: L("Když se potíže během tréninku vrátí, přestaň a odpočívej.", "If symptoms come back during the session, stop and rest."),
    doctor: long ? L("Nemoc trvala víc než týden: když se potíže vrátí nebo se necítíš dobře, poraď se před těžším tréninkem s lékařem.", "You were ill for more than a week: if symptoms come back or you don't feel well, see a doctor before harder sessions.") : null
  };
}
