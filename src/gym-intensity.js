// How hard a set is meant to be, or was, as one letter (column 14 of a gym
// plan, "[Intenzita X]" in a history note). The letters follow GymRat's,
// the same in every language: W warm-up, T technique, E easy, M moderate,
// H high, F failure, PR personal record, D a drop set (a row of type DROP:
// lighter weight straight after the set above it, no rest).
export const INTENSITIES = ['W', 'T', 'E', 'M', 'H', 'F', 'PR', 'D'];

// RPE the letter stands for in progression and muscle fatigue (null: not a
// work set). PR and D count as near the limit.
const RPE = { W: null, T: 5, E: 6, M: 7.5, H: 9, F: 10, PR: 9, D: 10 };

export function intensityOf(value) {
  const v = String(value ?? '').trim().toUpperCase();
  return INTENSITIES.includes(v) ? v : '';
}

export function intensityRpe(letter) {
  const v = intensityOf(letter);
  return v ? RPE[v] : null;
}

// A set saved before the letters (RPE 6–10 from "Jak to šlo?").
export function intensityFromRpe(rpe) {
  const n = Number(String(rpe ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 10 ? 'F' : n >= 8 ? 'H' : n >= 7 ? 'M' : n >= 6 ? 'E' : 'T';
}

// The letter each set of a generated plan is meant to be done at, read from
// what the plan already says: warm-ups W, a set to failure F, the reserve a
// note asks for (3–4 reps E, 2–3 reps M), a plan phase's RPE, else M with the
// last work set of an exercise H. A letter already there is kept.
export function assignIntensities(rows, { phaseRpe = null } = {}) {
  const phase = parseFloat(String(phaseRpe ?? '').replace(',', '.'));
  const lastWork = new Map();
  rows.forEach((r, i) => { if (r?.[0] === 'WORK') lastWork.set(r[1], i); });
  rows.forEach((r, i) => {
    if (!r?.[1] || intensityOf(r[14])) return;
    const note = String(r[9] || '');
    let letter;
    if (r[0] === 'WARMUP') letter = 'W';
    else if (r[0] === 'DROP') letter = 'D';
    else if (/^(true|1)$/i.test(String(r[11] ?? ''))) letter = 'F';
    else if (/3–4 (?:opakování|reps)|rezervou 3–4|3 opakování v rezervě|3 reps in reserve/.test(note)) letter = 'E';
    else if (/2–3 (?:opakování|reps)|rezervu 2–3/.test(note)) letter = 'M';
    else if (Number.isFinite(phase) && phase > 0) letter = phase < 7 ? 'E' : phase < 8.5 ? 'M' : 'H';
    else letter = lastWork.get(r[1]) === i ? 'H' : 'M';
    while (r.length < 14) r.push('');
    r[14] = letter;
  });
  return rows;
}
