// The coach's conclusion above Training's load cards (Petr 2026-11-20,
// decision 6 of the redesign 602 review): the last 7 days against the usual
// 28 (workload-ratio.js level) in one or two sentences, and below the usual
// one easy session of the main sport on the next free day, which "Add to
// plan" writes only after the tap (POST /app/api/workouts/add-easy). Rules,
// never the AI (AI-7).
import { L } from "./lang.js";

const MAIN = { cycling: "ride", running: "run", swimming: "swim", triathlon: "ride" };
const SPORTS = ["ride", "run", "swim"];
const MINUTES = { ride: 60, run: 40, swim: 40 };
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const oneEasy = s => ({ ride: L("Jedna lehká jízda", "One easy ride"), run: L("Jeden lehký běh", "One easy run"), swim: L("Jedno lehké plavání", "One easy swim") })[s];

// The endurance sport an easy session is added in: the main one, else the
// one done most in the last weeks (sessions: [{sport, status}]); null for an
// athlete who only lifts (the generators write rides, runs and swims).
export function easySport(mainSport, sessions = []) {
  if (MAIN[mainSport]) return MAIN[mainSport];
  // A lifter's load is the gym: no ride or run to add.
  if (mainSport === "strength") return null;
  const count = new Map();
  for (const s of sessions || []) if (s?.status === "done" && SPORTS.includes(s.sport)) count.set(s.sport, (count.get(s.sport) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// Tomorrow or the day after when nothing is planned in the next three days
// (planned: a Set of dates with a planned session or gym plan). A session
// already planned that soon brings the load back on its own, and so does the
// one "Add to plan" just wrote: the card does not offer another.
export function freeDay(date, planned) {
  if ([1, 2, 3].some(i => planned.has(shift(date, i)))) return null;
  return shift(date, 1);
}

// level: workload-ratio.js LOAD_LEVELS. Null without a level (under the
// history it needs).
// hold: no session to add while the athlete is sick, injured or on a break
// (training-status.js) or in a race's taper or race week, where low load is the point.
export function loadAdvice({ level = null, date, sport = null, planned = new Set(), hold = false } = {}) {
  if (!level) return null;
  const below = (level === "wellBelow" || level === "below") && !hold;
  const on = below && sport ? freeDay(date, planned) : null;
  const add = on ? { kind: "add_easy", sport, date: on, minutes: MINUTES[sport] } : null;
  const easy = add ? " " + oneEasy(sport) + L(" zítra ji pomůže vrátit.", " tomorrow helps bring it back.") : "";
  const text = {
    wellBelow: L("Zátěž je hodně pod tvou obvyklou.", "Your load is far below your usual.") + easy,
    below: L("Zátěž je trochu pod tvou obvyklou.", "Your load is a little below your usual.") + easy,
    usual: L("Zátěž je v tvém obvyklém rozmezí. Pokračuj podle plánu.", "Your load is in your usual range. Keep going as planned."),
    above: L("Zátěž je nad tvou obvyklou. Další dny raději lehce.", "Your load is above your usual. Keep the next days easy."),
    wellAbove: L("Zátěž je hodně nad tvou obvyklou. Další trénink lehce nebo volno.", "Your load is far above your usual. Make the next session easy or take a day off.")
  }[level];
  if (!text) return null;
  return { level, text, ...(add ? { action: add } : {}) };
}
