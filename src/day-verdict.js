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
// tomorrow's hard session. legs: yellow with tired legs. no_intensity:
// breathing or temperature up (easy allowed). rest: a sick check-in or a paused athlete.
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

// Breathing or temperature in sleep above the usual range, alone: no
// intensity, easy training allowed. Only red, illness or pain block (Petr's
// answer to O22, 2026-11-06). The ordinary causes come with it, so the text
// hints at no illness (MDR); the morning push and Today's coach card say the same.
export function signsAdvice() {
  return L("Teplota nebo dech ve spánku jsou nad tvým obvyklým rozmezím. Může za tím být horko, alkohol, pozdní jídlo, stres nebo tvrdý trénink. Dnes bez intenzity, jen lehce.",
    "Your temperature or breathing in sleep is above your usual range. Heat, alcohol, a late meal, stress or hard training can do this. No intensity today, easy training only.");
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
  // Two reasons to hold back turn green into yellow. Yellow stays yellow
  // however many there are: it warns once and still lets the athlete train,
  // red comes only from the body (audit 2026-11-06, 4.3, Petr's answer to O4).
  const level = zone === "green" && signals.length >= 2 ? "yellow" : zone;
  const legs = level === "yellow" && signals.some(s => s.legs);
  const saveFor = weighed && level === "green" && !signals.length && !sessions.some(isHardSession) ? (tomorrow || []).filter(s => s && s.title).find(isHardSession) || null : null;
  const key = rest ? "rest" : signs ? "no_intensity" : legs ? "legs" : saveFor ? "easy"
    : level === "green" ? (signals.length || injury ? "steady" : "hard")
    : level === "yellow" ? "steady" : level === "red" ? "easy" : null;
  // The ring's colour is the readiness colour Today and the Watch show, not
  // the advice (audit 2026-11-06, 4.3); only rest is red and signs of illness
  // never green.
  const shown = rest ? "red" : signs && zone === "green" ? "yellow" : zone;
  return { key, level, shown: shown || null, rest, signs, noSleep, sessions, signals, injury, legs, saveFor, weighed };
}

// The line under the readiness in the redesign (D-DNES-2, AI-2, 2026-11-16):
// what the numbers say, from the numbers only: the body's zone, breathing or
// temperature up and a missing night. Advice (tired legs, saving the legs for
// tomorrow, the morning answer) stays in the coach card. Never "hard workout"
// with breathing or temperature up, without last night or on a rest day (Sick
// in the Journal, Sick, Injured or Rest: the status pill says why).
// hard: green. steady: yellow. easy: red. signs: breathing or temperature
// above the usual range. usual: green without last night. paused: a rest day.
export const NUMBERS_LINE_KEYS = ["hard", "steady", "easy", "signs", "usual", "paused"];

// hold: the day's decision (day-decision.js) is not a hard day, or the
// training is done: a green morning then only says the usual range.
export function numbersLine({ zone = null, flags = [], missing = [], rest = false, hold = false } = {}) {
  if (!zone) return null;
  if (rest) return "paused";
  if ((flags || []).some(f => /^(respiration|skin_temp|wrist_temp)_elevated$/.test(f))) return "signs";
  if (zone === "green") return hold || (missing || []).includes("sleep") ? "usual" : "hard";
  return zone === "yellow" ? "steady" : zone === "red" ? "easy" : null;
}

export function numbersLineText(key) {
  return {
    hard: L("Tvoje čísla zvládnou tvrdý trénink", "Your numbers support a hard workout"),
    steady: L("Tvoje čísla jsou pro den s mírou", "Your numbers support a steady day"),
    easy: L("Tvoje čísla ukazují na lehký den", "Your numbers suggest an easy day"),
    signs: L("Teplota nebo dech ve spánku jsou nad tvým obvyklým rozmezím", "Your temperature or breathing in sleep is above your usual range"),
    usual: L("Tvoje čísla jsou v obvyklém rozmezí", "Your numbers are within your usual range"),
    paused: L("Trénink je dnes pozastavený", "Training is paused today")
  }[key] || null;
}
