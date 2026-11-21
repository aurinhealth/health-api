// A key workout of the calendar missed in the last two days (Intervals.icu, the app's
// own plans, the gym): Today's coach card proposes a day for it. The plans of
// the app's training templates have their own (training-plans.js missedSession).
// Rules, as coaches give them: a missed easy session is let go; a key one
// (intervals, a test, a long one, a gym session) moves to the first day ahead
// this week (to Sunday) that is not next to another hard day, in place of an easy session
// that day; no such day, then let it go. Today is left out on a red morning.
// Offered the day after the miss and once more the next day, then it goes.
import { L } from "./lang.js";
import { isHardSession, isQualityName } from "./session-intensity.js";
import { shiftDate } from "./dashboard-shared.js";

const TO = () => [L("na pondělí", "to Monday"), L("na úterý", "to Tuesday"), L("na středu", "to Wednesday"), L("na čtvrtek", "to Thursday"), L("na pátek", "to Friday"), L("na sobotu", "to Saturday"), L("na neděli", "to Sunday")];
const ON = () => [L("V pondělí", "On Monday"), L("V úterý", "On Tuesday"), L("Ve středu", "On Wednesday"), L("Ve čtvrtek", "On Thursday"), L("V pátek", "On Friday"), L("V sobotu", "On Saturday"), L("V neděli", "On Sunday")];
const FROM = () => [L("Z pondělí", "From Monday"), L("Z úterý", "From Tuesday"), L("Ze středy", "From Wednesday"), L("Ze čtvrtka", "From Thursday"), L("Z pátku", "From Friday"), L("Ze soboty", "From Saturday"), L("Z neděle", "From Sunday")];
const weekday = date => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
const LONG_MINUTES = { ride: 150, run: 90, swim: 75 };

const gym = a => a.sport === "strength";
const long = a => a.minutes != null && a.minutes >= (LONG_MINUTES[a.sport] ?? Infinity);
// A hard ride, run or swim: a long one, or hard by its name or load (a swim by its name: "10×100 threshold").
const hardEndurance = a => !gym(a) && (long(a) || (["ride", "run"].includes(a.sport) ? isHardSession({ name: a.title, sport: a.sport, durationHours: a.minutes ? a.minutes / 60 : null }) : a.sport === "swim" && isQualityName(a.title)));
// A key session: a gym session or a hard ride, run or swim.
export const isKey = a => gym(a) || hardEndurance(a);
// One decision per session; a day's gym plan and its strength event are one session.
export const missedKey = a => (gym(a) ? "gym:" + a.date : String(a.id));

// `days` are the training calendar's days from three days back to next
// Monday (app-calendar.js buildCalendar; a Sunday miss is offered on Monday), `decided` the keys let go already, `red` a red morning.
export function missedWorkout({ days = [], today, decided = new Set(), red = false }) {
  const monday = shiftDate(today, -weekday(today));
  const items = days.flatMap(d => (d.activities || []).map(a => ({ ...a, date: a.date || d.date })));
  const candidates = items.filter(a => a.status === "missed" && a.date < today && a.date >= shiftDate(today, -2) && (a.eventId || String(a.id).startsWith("gym:")) && isKey(a) && !decided.has(missedKey(a)));
  // The latest; of a day's gym plan and its strength event, the plan (it moves both).
  const missed = candidates.sort((a, b) => b.date.localeCompare(a.date) || Number(Boolean(a.eventId)) - Number(Boolean(b.eventId)))[0];
  if (!missed) return null;
  const ahead = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i)).filter(d => d >= today);
  const on = date => items.filter(a => a.date === date && a.status !== "missed");
  const fits = date => {
    if (red && date === today) return false;
    const there = on(date);
    // A gym split: any day without another gym session.
    if (gym(missed)) return !there.some(gym);
    // Not on or next to another hard ride, run or swim (one done yesterday counts), not on a gym day.
    if ([-1, 0, 1].some(k => on(shiftDate(date, k)).some(hardEndurance)) || there.some(gym)) return false;
    // What it replaces must be an easy planned session the app can remove.
    return there.every(a => a.status === "planned" && a.eventId);
  };
  const suggest = ahead.find(fits) || null;
  const replaces = suggest && !gym(missed) ? on(suggest).map(a => ({ eventId: a.eventId, title: a.title })) : [];
  return { key: missedKey(missed), eventId: missed.eventId || null, gymDate: gym(missed) && !missed.eventId ? missed.date : null,
    title: missed.title, sport: missed.sport, date: missed.date, minutes: missed.minutes ?? null, suggest, replaces, days: ahead };
}

// The card's words: what was missed, then the key sentence on what to do.
export function missedWorkoutView(m, today) {
  if (!m) return null;
  const text = (shiftDate(today, -1) === m.date ? L("Včera", "Yesterday") : ON()[weekday(m.date)]) + L(" zůstal nesplněný trénink ", " you missed ") + m.title + ".";
  const to = m.suggest === today ? L("na dnešek", "to today") : m.suggest ? TO()[weekday(m.suggest)] : null;
  const advice = to ? L("Přesuň ho ", "Move it ") + to + "?" : L("Nech ho být, zbytek týdne zůstává podle plánu.", "Let it go, the rest of the week stays as planned.");
  const detail = to ? FROM()[weekday(m.date)] + (m.replaces.length ? L(", místo: ", ", replaces ") + m.replaces.map(r => r.title).join(", ") : "") : null;
  const move = to ? (m.suggest === today ? L("Přesunout na dnešek", "Move to today") : L("Přesunout ", "Move ") + to) : null;
  return { ...m, text, advice, detail, move };
}

// The sessions let go ("Skip it"), kept two weeks: the card does not come back for them.
async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS missed_decisions (user_id INTEGER NOT NULL, item_key TEXT NOT NULL, decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, item_key))").run();
}
export async function missedDecisions(db) {
  await ensure(db);
  const rows = (await db.prepare("SELECT item_key FROM missed_decisions WHERE user_id=? AND decided_at>=datetime('now','-14 days')").bind(db.userId).all()).results || [];
  return new Set(rows.map(r => r.item_key));
}
// skip: true lets it go, false brings the card back (its Undo).
export async function decideMissed(db, key, skip) {
  if (!/^[A-Za-z0-9:_-]{1,90}$/.test(String(key || ""))) throw new Error(L("Neplatný trénink.", "Invalid workout."));
  await ensure(db);
  if (skip) await db.prepare("INSERT INTO missed_decisions(user_id,item_key) VALUES(?,?) ON CONFLICT(user_id,item_key) DO UPDATE SET decided_at=CURRENT_TIMESTAMP").bind(db.userId, key).run();
  else await db.prepare("DELETE FROM missed_decisions WHERE user_id=? AND item_key=?").bind(db.userId, key).run();
}
