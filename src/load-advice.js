// The coach's conclusion above Training's load cards (Petr 2026-11-20,
// decision 6 of the redesign 602 review): the last 7 days against the usual
// 28 (workload-ratio.js level) in one or two sentences, and below the usual
// one easy session of the main sport on the next free day, which "Add to
// plan" writes only after the tap (POST /app/api/training/add-easy). Rules,
// never the AI (AI-7).
import { L } from "./lang.js";

const MAIN = { cycling: "ride", running: "run", swimming: "swim", triathlon: "ride" };
const SPORTS = ["ride", "run", "swim"];
const MINUTES = { ride: 60, run: 40, swim: 40 };
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const WEEKDAYS = [["v neděli", "Sun"], ["v pondělí", "Mon"], ["v úterý", "Tue"], ["ve středu", "Wed"], ["ve čtvrtek", "Thu"], ["v pátek", "Fri"], ["v sobotu", "Sat"]];
const dayName = d => { const [cs, en] = WEEKDAYS[new Date(d + "T12:00:00Z").getUTCDay()]; return L(cs, en); };
const oneEasy = s => ({ ride: L("Jedna lehká jízda", "One easy ride"), run: L("Jeden lehký běh", "One easy run"), swim: L("Jedno lehké plavání", "One easy swim") })[s];

// The endurance sport an easy session is added in: the main one, else the
// one done most in the last weeks (sessions: [{sport, status}]); null for an
// athlete who only lifts (the generators write rides, runs and swims).
export function easySport(mainSport, sessions = []) {
  if (MAIN[mainSport]) return MAIN[mainSport];
  const count = new Map();
  for (const s of sessions || []) if (s?.status === "done" && SPORTS.includes(s.sport)) count.set(s.sport, (count.get(s.sport) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// The first day from tomorrow, up to a week ahead, with nothing planned
// (planned: a Set of dates with a planned session or gym plan).
export function freeDay(date, planned) {
  for (let i = 1; i <= 7; i++) { const d = shift(date, i); if (!planned.has(d)) return d; }
  return null;
}

// level: workload-ratio.js LOAD_LEVELS. Null without a level (under the
// history it needs).
export function loadAdvice({ level = null, date, sport = null, planned = new Set() } = {}) {
  if (!level) return null;
  const below = level === "wellBelow" || level === "below";
  const on = below && sport ? freeDay(date, planned) : null;
  const add = on ? { kind: "add_easy", sport, date: on, minutes: MINUTES[sport] } : null;
  const easy = add ? " " + oneEasy(sport) + L(` ${dayName(on)} ji vrátí.`, ` on ${dayName(on)} brings it back.`) : "";
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
