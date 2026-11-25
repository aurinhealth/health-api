// Averages over 30 days, 90 days and a year for the coach's chat, so "what was
// my average sleep over the last year?" gets the real number instead of "I only
// have the last 7 nights". Computed here, never by the model from daily rows.
// Loaded only when the message asks about a longer stretch (asksHistory); the
// route reads a year of nights, daily values, fitness and weights for it.
// Each average says how many days (nights) had a value, so the coach can say
// when a period is only partly covered.

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const dayOf = r => String(r?.id || r?.date || "").slice(0, 10);

export const HISTORY_PERIODS = [30, 90, 365];

// A past stretch, an average or a trend: "za rok", "posledních 30 dní",
// "průměr", "last 3 months", "average", "trend"; not a plan for the next weeks.
const ASKS = /(?<!\p{L})(?:průměr\p{L}*|prumer\p{L}*|dlouhodob\p{L}*|vývoj\p{L}*|vyvoj\p{L}*|vyvíj\p{L}*|vyvij\p{L}*|trend\p{L}*|histori\p{L}*|letos|loni|ročn\p{L}*|rocn\p{L}*|average\p{L}*|avg|long[- ]term|over time|this year)(?!\p{L})|(?<!\p{L})(?:posledn\p{L}*|uplynul\p{L}*|minul\p{L}*|celý|cely|last|past|previous|whole)\s+(?:\d+\s*)?(?:rok\p{L}*|let|měsíc\p{L}*|mesic\p{L}*|měsíc|dn[íiy]|den|týd\p{L}*|tyd\p{L}*|year\p{L}*|months?|days?|weeks?)(?!\p{L})|(?<!\p{L})za\s+rok(?!\p{L})/iu;
export const asksHistory = message => ASKS.test(String(message || ""));

// The night of each day: the longest main sleep (naps aside), as the chat's
// sleep rows (coach-assistant.js sleepNights) count it.
function nightMinutes(sessions) {
  const byDay = new Map();
  for (const s of sessions || []) {
    const day = String(s?.date || s?.endTime || "").slice(0, 10), minutes = num(s?.durationMin);
    if (!day || !(minutes > 0) || s.nap) continue;
    if (!byDay.has(day) || minutes > byDay.get(day)) byDay.set(day, minutes);
  }
  return byDay;
}
// One value per day of `key` from rows ({ id, [key] }), the last row of a day winning.
function daily(rows, key) {
  const byDay = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const day = dayOf(r), v = num(r?.[key]);
    if (day && v != null && v > 0) byDay.set(day, v);
  }
  return byDay;
}
const inWindow = (map, from, to) => [...map].filter(([d]) => d >= from && d <= to).sort(([a], [b]) => a.localeCompare(b));

// sessions: sleep sessions (/health/sleep); wellness: merged daily rows with
// hrv, restingHR and steps (health-series-store.js seriesRows); fitness: the
// fitness rows (/app/api/fitness: ctl, daily load, Intervals weight); weights:
// { "YYYY-MM-DD": kg } from the app's own store. Returns { periods } or null.
export function historyFacts({ date, sessions = [], wellness = [], fitness = [], weights = {} } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const nights = nightMinutes(sessions);
  const hrv = daily(wellness, "hrv"), rhr = daily(wellness, "restingHR"), steps = daily(wellness, "steps");
  const weight = new Map([...daily(fitness, "weight"), ...Object.entries(weights || {}).map(([d, v]) => [d, num(v)]).filter(([, v]) => v > 0)]);
  const ctl = new Map((Array.isArray(fitness) ? fitness : []).map(r => [dayOf(r), num(r?.ctl)]).filter(([d, v]) => d && v != null));
  const load = new Map((Array.isArray(fitness) ? fitness : []).map(r => [dayOf(r), num(r?.ctlLoad ?? r?.atlLoad ?? r?.load)]).filter(([d, v]) => d && v != null && v >= 0));
  const periods = [];
  for (const days of HISTORY_PERIODS) {
    const from = shift(date, -(days - 1)), p = { days, from, to: date };
    const avg = (map, digits = 0) => { const xs = inWindow(map, from, date).map(([, v]) => v); return xs.length ? { average: round(mean(xs), digits), days: xs.length } : null; };
    const s = inWindow(nights, from, date).map(([, v]) => v);
    if (s.length) p.sleep = { averageMinutes: Math.round(mean(s)), nights: s.length, shortestMinutes: Math.round(Math.min(...s)), longestMinutes: Math.round(Math.max(...s)) };
    const h = avg(hrv); if (h) p.hrv = { averageMs: h.average, days: h.days };
    const r = avg(rhr); if (r) p.restingHR = { averageBpm: r.average, days: r.days };
    const st = avg(steps); if (st) p.steps = { averagePerDay: st.average, days: st.days };
    const w = inWindow(weight, from, date);
    if (w.length) p.weight = { averageKg: round(mean(w.map(([, v]) => v)), 1), firstKg: round(w[0][1], 1), lastKg: round(w.at(-1)[1], 1), days: w.length };
    const l = inWindow(load, from, date);
    // Weekly load over the days the record covers (rest days count as 0).
    if (l.length) p.training = { averageWeeklyLoadTss: Math.round(l.reduce((a, [, v]) => a + v, 0) / l.length * 7), days: l.length };
    const c = inWindow(ctl, from, date);
    if (c.length >= 2) p.training = { ...(p.training || {}), ctlStart: round(c[0][1], 1), ctlEnd: round(c.at(-1)[1], 1) };
    if (Object.keys(p).length > 3) periods.push(p);
  }
  // The first day with a value within the year read: "I have your sleep only
  // since 3 June" when a period asked for reaches further back.
  const first = map => [...map.keys()].filter(d => d >= shift(date, -364) && d <= date).sort()[0] || null;
  const since = Object.fromEntries([["sleep", nights], ["hrv", hrv], ["restingHR", rhr], ["steps", steps], ["weight", weight], ["training", load]].map(([k, m]) => [k, first(m)]).filter(([, d]) => d));
  return periods.length ? { periods, dataSince: since } : null;
}
