// What else the morning push's advice weighs beside the readiness score
// (Petr, 2026-10-27: a 68 after 5:54 of sleep and three gym days in a row
// said "Go hard today" while Google said to rest the legs). The advice also
// looks at the night's length, the days before (training days in a row of any
// sport, a long session yesterday, tired legs, readiness low for days, the
// form), the journal (alcohol last night), a pain or injury the coach was told
// about and the hard session of tomorrow. push.js readinessMessage turns the
// signals into the title and the body; entrypoint.js morningContext reads them.
import { L, plural } from "./lang.js";

const shiftDay = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// Below six hours a night counts as short (coach-engine.js sleepLow).
export const SHORT_NIGHT_MINUTES = 360;
// Three days of training in a row up to yesterday, a session of at least
// 20 minutes of anything but walking (a watch detects walks every day).
export const STREAK_DAYS = 3;
const TRAINING_MINUTES = 20;
// Yesterday this long (any sport but walks) is a big day.
const LONG_DAY_MINUTES = 150;
// Intervals.icu's form, where its "high risk" zone begins.
const LOW_FORM = -25;
// A pain or injury noted for the coach (athlete-state.js PASSING, without illness and pregnancy).
const HURT = /bol[ií]|bolest|zran|natáh|natah|podvrt|výron|vyron|nateklé|natekl|hurt|pain|sore|injur|sprain|strain/i;

// The days in a row with training up to yesterday, and whether they were all gym.
export function trainingStreak(activities = [], date) {
  const byDay = new Map();
  for (const a of activities) {
    if (!a?.date || a.date >= date || a.kind === "walk" || !(num(a.minutes) >= TRAINING_MINUTES)) continue;
    byDay.set(a.date, [...(byDay.get(a.date) || []), a.kind]);
  }
  let days = 0, gym = true;
  for (let d = shiftDay(date, -1); byDay.has(d); d = shiftDay(d, -1)) { days++; gym = gym && byDay.get(d).every(k => k === "strength"); }
  return { days, gym: days > 0 && gym };
}

// The reasons to hold back today, most telling first: [{id, text}].
export function adviceSignals({ date, sleepMinutes = null, context = {} } = {}) {
  const c = context || {}, out = [];
  const streak = trainingStreak(c.activities || [], date);
  if (streak.days >= STREAK_DAYS) out.push({ id: "streak", legs: streak.gym || null, text: streak.gym
    ? L(`${streak.days} ${plural(streak.days, "den", "dny", "dní")} posilovny po sobě`, `${streak.days} gym days in a row`)
    : L(`${streak.days} ${plural(streak.days, "tréninkový den", "tréninkové dny", "tréninkových dní")} po sobě`, `${streak.days} training days in a row`) });
  if (num(sleepMinutes) != null && num(sleepMinutes) > 0 && num(sleepMinutes) < SHORT_NIGHT_MINUTES) out.push({ id: "short_night", text: L("krátká noc", "a short night") });
  if (c.legs === "fatigued") out.push({ id: "legs", legs: true, text: L("unavené nohy", "tired legs") });
  const yesterday = (c.activities || []).filter(a => a?.date === shiftDay(date, -1) && a.kind !== "walk").reduce((m, a) => m + (num(a.minutes) || 0), 0);
  if (yesterday >= LONG_DAY_MINUTES) out.push({ id: "long_yesterday", text: L("včera dlouhý trénink", "a long session yesterday") });
  if (num(c.lowDays) >= 2) out.push({ id: "low_days", text: L(`připravenost nižší už ${num(c.lowDays) + 1} ${plural(num(c.lowDays) + 1, "den", "dny", "dní")}`, `readiness low for ${num(c.lowDays) + 1} days`) });
  if (num(c.tsb) != null && num(c.tsb) <= LOW_FORM) out.push({ id: "low_form", text: L("nízká forma", "low form") });
  if (c.alcohol) out.push({ id: "alcohol", text: L("včera alkohol", "alcohol last night") });
  return out;
}

// A pain or an injury from what the athlete told the coach (Settings → Paměť kouče).
export const injuryNote = memories => (Array.isArray(memories) ? memories : []).map(m => String(m || "").trim()).filter(m => m && HURT.test(m)).at(-1) || null;

// Today's planned sessions that load the legs hard: a run, a hard ride, a gym day with legs.
const HARD_NAME = /threshold|práh|prah|vo2|vo₂|interval|sweet ?spot|tempo|race|závod|zavod|sprint|hill|kopc|4×|5×|3×/i;
export const isHardSession = s => Boolean(s && (s.hard === true || (s.sport !== "strength" && HARD_NAME.test(String(s.title || "")))));

// "A, B and C" in the athlete's language, capitalised.
export function reasonsSentence(signals) {
  const texts = signals.slice(0, 2).map(s => s.text);
  if (!texts.length) return "";
  const joined = texts.length === 1 ? texts[0] : texts[0] + L(" a ", " and ") + texts[1];
  return joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
}
