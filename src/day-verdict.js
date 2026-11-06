// One verdict of the day (Today audit points 7, 26, 27 and D1, 2026-11-04):
// what to do today, as one key from a fixed list, for the line under the
// readiness on Today (ios-native ReadinessHero), the morning push's title
// (push.js readinessMessage), Today's coach card (app-today.js
// readinessSummary) and the facts the AI writes from (screen-texts.js). The
// apps translate the key; the server's own texts come from verdictText.
// The readiness number itself only describes the body ("within your usual
// range"); this line says what to do. Yellow and red never say to keep the
// plan; a sick check-in, signs of illness or a paused athlete rest (IOC 2022:
// rest first). The AI may only soften it (screen-texts.js).
import { L } from "./lang.js";
import { adviceSignals, injuryNote, isHardSession } from "./morning-advice.js";

// hard: green, nothing holding back. steady: yellow, or green with one reason
// to hold back or an injury. easy: red, or green saving the legs for
// tomorrow's hard session. legs: yellow with tired legs. no_intensity: signs
// of illness (breathing or temperature up). rest: a sick check-in or a paused athlete.
export const VERDICT_KEYS = ["hard", "steady", "easy", "legs", "no_intensity", "rest"];

export function verdictText(key) {
  return {
    hard: L("Dobrý den na tvrdý trénink", "Good day for a hard workout"),
    steady: L("Dnes s mírou", "Keep it steady today"),
    easy: L("Dnes v klidu", "Take it easy today"),
    legs: L("Dej nohám pauzu", "Give your legs a break"),
    no_intensity: L("Dnes bez intenzity", "No intensity today"),
    rest: L("Dnes odpočinek", "Rest today")
  }[key] || null;
}

// The verdict from the readiness and what the morning weighs beside it
// (morning-advice.js): `planned` are today's sessions still to do, from the
// same list Today shows (app-today.js todayWorkouts). Null without a score.
export function dayVerdict({ score = null, zone = null, flags = [], missing = [], checkin = null, athleteState = null, sleep = null, planned = [], tomorrow = [], context = null, date = null } = {}) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const sick = checkin === "sick" || (flags || []).includes("checkin_sick");
  const signs = (flags || []).some(f => /^(respiration|skin_temp|wrist_temp)_elevated$/.test(f));
  const rest = Boolean(sick || (athleteState && athleteState !== "active"));
  const noSleep = (missing || []).includes("sleep");
  const sessions = (planned || []).filter(s => s && s.title).slice(0, 2);
  const weighed = Boolean(!rest && !signs && !noSleep && date && context);
  const signals = weighed ? adviceSignals({ date, sleepMinutes: sleep?.minutes, context }) : [];
  const injury = weighed ? injuryNote(context.memories) : null;
  // Two reasons to hold back turn green into yellow, three turn yellow into red.
  const level = zone === "green" && signals.length >= 2 ? "yellow" : zone === "yellow" && signals.length >= 3 ? "red" : zone;
  const legs = level === "yellow" && signals.some(s => s.legs);
  const saveFor = weighed && level === "green" && !signals.length && !sessions.some(isHardSession) ? (tomorrow || []).filter(s => s && s.title).find(isHardSession) || null : null;
  const key = rest ? "rest" : signs ? "no_intensity" : legs ? "legs" : saveFor ? "easy"
    : level === "green" ? (signals.length || injury ? "steady" : "hard")
    : level === "yellow" ? "steady" : level === "red" ? "easy" : null;
  // The ring's colour: rest is red, signs of illness never green.
  const shown = rest ? "red" : signs && level === "green" ? "yellow" : level;
  return { key, level, shown: shown || null, rest, signs, noSleep, sessions, signals, injury, legs, saveFor, weighed };
}
