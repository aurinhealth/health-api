// A triathlete's week split among ride, run and swim from their history
// (audit/plavani-a-triatlon-research-2026-10-30.md): the weakest or newest
// discipline gets more sessions, short and easy (learning a movement goes by
// how often, not how long: USA Triathlon, Couzens), never extra key intervals.
// The strongest drops to a maintenance dose of two. A run that is new stays
// short (no run above 110 % of the longest of the last 30 days, Frandsen 2025).
// One brick a week (a short run right after a ride) once there are two rides
// and two runs, never in race week. Time otherwise goes about 25/50/25.
// Pure: the year's counts come from training-history.js (`sports`, already in
// the profile suggestions), the manual levels from the setup; no queries here.
import { L } from "./lang.js";

export const TRI_SPORTS = ["ride", "run", "swim"];
const CATEGORY_RANK = { new: 0, occasional: 1, regular: 2 };
// Base time shares (Welsh Triathlon: sprint and olympic 25/50/25).
const SHARE = { ride: .5, run: .25, swim: .25 };
// Short sessions for a discipline that is being learnt, in minutes.
const SHORT = { swim: { new: 30, occasional: 40 }, run: { new: 25, occasional: 35 }, ride: { new: 45, occasional: 60 } };
const MANUAL = { beginner: "new", regular: "occasional", experienced: "regular" };

// new: fewer than 12 sessions in 12 months; occasional: up to 40 or under
// 10 % of the year's hours; regular: more. A level chosen by hand wins.
// Without the year (not counted yet) a discipline is occasional: no priority either way.
export function disciplineCategory(sport, year = null, manual = null) {
  if (MANUAL[manual]) return MANUAL[manual];
  if (!year) return "occasional";
  const own = year[sport] || {}, count = Number(own.count) || 0, hours = Number(own.hours) || 0;
  const total = TRI_SPORTS.reduce((n, s) => n + (Number(year[s]?.hours) || 0), 0);
  if (count < 12) return "new";
  if (count <= 40 || (total > 0 && hours / total < .1)) return "occasional";
  return "regular";
}

// sessions: endurance sessions a week (ride, run and swim together).
// minutes: the week's training time, for the hours each sport gets.
// levels: the manual levels by sport ("auto" or none reads the history).
// daysToRace: no brick in the last week before the race.
export function triathlonSplit({ year = null, levels = {}, sessions = 6, minutes = null, daysToRace = null } = {}) {
  const n = Math.max(3, Math.min(14, Math.round(Number(sessions) || 6)));
  const category = Object.fromEntries(TRI_SPORTS.map(s => [s, disciplineCategory(s, year, levels?.[s])]));
  const rank = s => CATEGORY_RANK[category[s]];
  const lowest = Math.min(...TRI_SPORTS.map(rank)), highest = Math.max(...TRI_SPORTS.map(rank));
  // Ties: swimming first (safety in the water), then running; the strongest: riding first.
  const weak = lowest < highest ? ["swim", "run", "ride"].find(s => rank(s) === lowest) : null;
  const strong = weak ? ["ride", "run", "swim"].find(s => rank(s) === highest) : null;
  const order = weak ? [weak, ...TRI_SPORTS.filter(s => s !== weak && s !== strong), strong] : ["ride", "run", "swim"];
  const count = { ride: 0, run: 0, swim: 0 };
  let left = n;
  // Two of each first, the weak one before the others.
  for (let round = 0; round < 2; round++) for (const s of order) if (left > 0) { count[s]++; left--; }
  // Then the weak one up to three (four once the week has ten), the strongest
  // stays at two until the others have three.
  const cap = s => s === weak ? (n >= 10 ? 4 : 3) : s === strong ? (order.every(o => o === strong || count[o] >= 3) ? 4 : 2) : 4;
  while (left > 0) {
    const next = order.find(s => count[s] < cap(s) && count[s] === Math.min(...order.filter(o => count[o] < cap(o)).map(o => count[o])));
    if (!next) break;
    count[next]++; left--;
  }
  const brick = count.ride >= 2 && count.run >= 2 && !(daysToRace != null && daysToRace <= 7);
  const short = Object.fromEntries(TRI_SPORTS.filter(s => s === weak || category[s] === "new").map(s => [s, SHORT[s][category[s]] || SHORT[s].occasional]));
  // Hours: the short sessions take their time first, the rest goes by the shares.
  let time = null;
  if (Number(minutes) > 0) {
    const fixed = Object.fromEntries(Object.entries(short).map(([s, m]) => [s, m * count[s]]));
    const rest = Math.max(0, Number(minutes) - Object.values(fixed).reduce((a, b) => a + b, 0));
    const open = TRI_SPORTS.filter(s => fixed[s] == null && count[s] > 0), weight = open.reduce((a, s) => a + SHARE[s], 0);
    time = Object.fromEntries(TRI_SPORTS.map(s => [s, Math.round((fixed[s] ?? (weight ? rest * SHARE[s] / weight : 0)) / 5) * 5]));
  }
  // Below the strongest: no key sessions (only the long one stays for the strongest).
  const learning = weak ? TRI_SPORTS.filter(s => rank(s) < highest) : [];
  return { sessions: count, minutes: time, category, weak, strong, learning, brick: brick ? { minutes: category.run === "new" ? 15 : 20 } : null, short, reason: splitReason({ weak, strong, category, count }) };
}

const NAME = () => ({ ride: L("Kolo", "Riding"), run: L("Běh", "Running"), swim: L("Plavání", "Swimming") });
const NUMBER = () => [null, L("jednom", "one"), L("dvou", "two"), L("třech", "three"), L("čtyřech", "four")];

// "Swimming is your newest sport, so it gets more short sessions. Riding stays at two to keep your fitness."
export function splitReason({ weak, strong, category, count }) {
  const name = NAME();
  if (!weak && category.ride === "new") return L("Všechny tři sporty jsou pro tebe nové, takže dostanou stejně krátkých a lehkých tréninků.", "All three sports are new to you, so each gets the same number of short, easy sessions.");
  if (!weak) return L("Všechny tři sporty děláš stejně často, takže čas jde zhruba z poloviny na kolo a po čtvrtině na běh a plavání.", "You do all three sports about as often, so about half the time goes to riding and a quarter each to running and swimming.");
  const why = category[weak] === "new"
    ? L(`${name[weak]} je tvůj nejnovější sport, proto dostane víc krátkých tréninků.`, `${name[weak]} is your newest sport, so it gets more short sessions.`)
    : L(`${name[weak]} děláš nejméně, proto dostane víc krátkých tréninků.`, `${name[weak]} is the sport you do least, so it gets more short sessions.`);
  const keep = strong && count[strong] <= 2 ? " " + L(`${name[strong]} zůstává na ${NUMBER()[count[strong]]}, aby se kondice udržela.`, `${name[strong]} stays at ${NUMBER()[count[strong]]} to keep your fitness.`) : "";
  return why + keep;
}

// The split as the AI week and the coach read it.
export function splitFacts(split) {
  if (!split) return null;
  return { sessionsPerWeek: split.sessions, minutesPerWeek: split.minutes, disciplines: split.category, weakest: split.weak, strongest: split.strong, shortSessionMinutes: split.short, brickRunMinutes: split.brick?.minutes ?? null, why: split.reason };
}
