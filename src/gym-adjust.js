// A gym plan changed by the athlete's words ("bez nohou", "kratší") and the
// rows a proposal is confirmed with: only exercises from the gym's catalog
// (or already in the plan), the plan's own columns, no logged results.
import { MEMORY_RULE } from './athlete-state.js';
import { L } from './lang.js';
import { callOpenAI, lightModel } from './coach-assistant.js';
import { gymExerciseCatalog, gymLoadEstimate } from './gym-catalog.js';
import { GYM_PLAN_COLUMNS } from './gym-plan-store.js';
import { estimateStrengthTiming } from './strength-timing.js';
import { EXERCISE_INTELLIGENCE, resolveLoad } from './strength-intelligence.js';
import { adjustInstructions } from './private/gym-adjust.js';
import { INTENSITIES, intensityOf, assignIntensities } from './gym-intensity.js';

const MAX_ROWS = 80, MAX_EXERCISES = 14, MAX_SETS = 8;
// A known exercise's weight goes to its equipment's step (a bar 17,5 kg, not
// 17; dumbbells by 2,5 kg), any other to half a kilo (Revize 2026-10-16, nález 27).
const kgText = (v, name = null) => { const x = Number(String(v ?? '').replace(',', '.')); return v == null || v === '' || !Number.isFinite(x) ? '' : String(name && EXERCISE_INTELLIGENCE[name] ? resolveLoad(name, x) : Math.round(x * 2) / 2).replace('.', ','); };

// Plan rows as the client sends them, trimmed to known exercises and the
// planning columns (a proposal has no results yet).
export function cleanGymRows(rows, allowed) {
  if (!Array.isArray(rows)) throw new Error(L('Chybí cviky plánu.', 'The plan\'s exercises are missing.'));
  const out = rows.slice(0, MAX_ROWS).map(row => Array.from({ length: GYM_PLAN_COLUMNS.length }, (_, i) => String(row?.[i] ?? '').trim().slice(0, i === 9 ? 300 : 120)))
    .filter(r => /^(WARMUP|WORK|DROP)$/i.test(r[0]) && allowed.has(r[1]))
    .map(r => { r[0] = r[0].toUpperCase(); r[3] = kgText(r[3]); r[5] = r[6] = r[7] = ''; r[8] = 'FALSE'; r[11] = /^(true|1)$/i.test(r[11]) ? 'TRUE' : 'FALSE'; r[12] = /^[A-F]$/.test(r[12]) ? r[12] : ''; r[13] = /^[LP]$/.test(r[13]) ? r[13] : ''; r[14] = intensityOf(r[14]); return r; });
  if (!out.length) throw new Error(L('Plán musí mít aspoň jeden cvik.', 'The plan must have at least one exercise.'));
  return out;
}

export function catalogNames() { return new Set(gymExerciseCatalog().map(e => e.name)); }

const ADJUST_SCHEMA = { type: 'json_schema', name: 'gym_adjust', strict: true, schema: { type: 'object', additionalProperties: false, required: ['answer', 'exercises'], properties: {
  answer: { type: 'string' },
  exercises: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'sets'], properties: {
    name: { type: 'string' },
    sets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'kg', 'reps', 'intensity'], properties: { type: { type: 'string', enum: ['WARMUP', 'WORK', 'DROP'] }, kg: { type: ['number', 'null'] }, reps: { type: 'string' }, intensity: { type: 'string', enum: INTENSITIES } } } }
  } } }
} } };

// The model's numbers are checked (A10): a weight within 0–500 kg or none, reps
// like "8" or "8-10" or the plan's own value.
const kgOf = v => { if (v == null || v === '') return null; const kg = Number(v); return Number.isFinite(kg) && kg >= 0 && kg <= 500 ? kg : null; };
const repsOf = (v, fallback) => { const reps = String(v ?? '').trim().replace(/[–—]/g, '-'); return /^\d+(-\d+)?$/.test(reps) ? reps : fallback; };

// Rows → the compact plan the model sees, and its answer → plan rows again,
// keeping each kept exercise's own notes, superset and failure set.
export function planForModel(rows) {
  const by = new Map();
  for (const r of rows) { if (!r?.[1]) continue; if (!by.has(r[1])) by.set(r[1], { name: r[1], sets: [] }); const type = String(r[0]).toUpperCase(); by.get(r[1]).sets.push({ type: type === 'WARMUP' || type === 'DROP' ? type : 'WORK', kg: r[3] === '' ? null : Number(String(r[3]).replace(',', '.')), reps: String(r[4] || ''), intensity: intensityOf(r[14]) }); }
  return [...by.values()];
}
export function rowsFromModel(exercises, original, catalog) {
  const allowed = new Set([...catalog.keys(), ...original.map(r => r?.[1]).filter(Boolean)]), seen = new Set(), rows = [];
  for (const ex of (exercises || []).slice(0, MAX_EXERCISES)) {
    const name = String(ex?.name || '').trim();
    if (!allowed.has(name) || seen.has(name)) continue;
    seen.add(name);
    const own = original.filter(r => r[1] === name), work = own.filter(r => String(r[0]).toUpperCase() === 'WORK'), first = work[0] || own[0];
    const sets = (ex.sets || []).slice(0, MAX_SETS), lastWork = sets.map(s => s.type).lastIndexOf('WORK');
    sets.forEach((s, i) => {
      // A drop set needs a work set before it; its reps are "max".
      if (s.type === 'DROP' && !rows.some(r => r[1] === name && r[0] === 'WORK')) return;
      const drop = s.type === 'DROP', warm = s.type === 'WARMUP', failure = !warm && !drop && (i === lastWork && work.some(r => /^(true|1)$/i.test(r[11])) || intensityOf(s.intensity) === 'F');
      const planned = (warm ? own.find(r => String(r[0]).toUpperCase() === 'WARMUP') : null) || first;
      // A note's "+2,5 kg" or "= last time" belongs to the old load: it goes when the AI changed the weight.
      const kg = kgText(kgOf(s.kg), name), note = warm ? '[WARMUP]' : first?.[9] != null && first[9] !== '' ? (kg !== first[3] ? withoutProgression(first[9]) : first[9]) : catalog.get(name)?.note || '';
      const intensity = warm ? 'W' : drop ? 'D' : intensityOf(s.intensity) === 'W' || intensityOf(s.intensity) === 'D' ? '' : intensityOf(s.intensity);
      rows.push([warm ? 'WARMUP' : drop ? 'DROP' : 'WORK', name, '', kg, drop ? 'max' : repsOf(s.reps, String(planned?.[4] || '')).slice(0, 12), '', '', '', 'FALSE', drop ? DROP_NOTE() : note, '', failure ? 'TRUE' : 'FALSE', warm || drop ? '' : first?.[12] || '', '', intensity]);
    });
  }
  const seq = new Map();
  for (const r of rows) { if (r[0] === 'DROP') { r[2] = String(seq.get('WORK|' + r[1]) || 1); continue; } const key = r[0] + '|' + r[1], n = (seq.get(key) || 0) + 1; seq.set(key, n); r[2] = String(n); }
  return assignIntensities(rows);
}

const DROP_NOTE = () => L('dropset: hned bez pauzy, co nejvíc čistých opakování', 'drop set: straight away, no rest, as many clean reps as you can');

// The generator's progression part of a note ("↑ minule 3× 10 op. @ 20 kg → +2,5 kg", "= minule …", a return after a break).
export const withoutProgression = note => String(note || '').replace(/;\s*(?:[↑↓=] |po delší pauze lehčeji \(|lighter after a longer break \()[^;\[]*\)?/g, ' ').replace(/\s+/g, ' ').replace(/ ;/g, ';').trim();

// A session longer than the time it has loses work sets, one at a time from
// the exercise with the most (the later one on a tie); each keeps at least one.
export function fitGymMinutes(rows, minutes, catalog = EXERCISE_INTELLIGENCE) {
  if (!(Number(minutes) > 0)) return rows;
  let out = rows;
  for (let guard = 0; guard < 60 && estimateStrengthTiming(out, catalog, minutes).totalSeconds > minutes * 60; guard++) {
    const counts = new Map();
    for (const r of out) if (r[0] === 'WORK') counts.set(r[1], (counts.get(r[1]) || 0) + 1);
    const most = [...counts].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1])[0];
    if (!most) break;
    const i = out.map(r => r[0] === 'WORK' && r[1] === most[0]).lastIndexOf(true);
    out = out.filter((_, j) => j !== i);
  }
  return out;
}

// Dumbbells the athlete has (kg per hand), the nearest one.
export function snapGymDumbbells(rows, weights) {
  const have = (Array.isArray(weights) ? weights : []).map(Number).filter(kg => kg > 0);
  if (!have.length) return rows;
  for (const r of rows) {
    const kg = Number(String(r[3] || '').replace(',', '.'));
    if (EXERCISE_INTELLIGENCE[r[1]]?.loadUnit !== 'per_hand_kg' || !(kg > 0)) continue;
    r[3] = kgText(have.reduce((a, b) => Math.abs(b - kg) < Math.abs(a - kg) ? b : a));
  }
  return rows;
}

// Work sets left without a weight get an estimate from the athlete's history of
// the exercise or a variant; a warm-up before them half and three quarters of it.
export function fillGymLoads(rows, history = []) {
  const cache = new Map(), estimate = name => { if (!cache.has(name)) cache.set(name, gymLoadEstimate(name, history)); return cache.get(name); };
  for (const r of rows) if (r[0] === 'WORK' && r[3] === '' && estimate(r[1])) r[3] = kgText(estimate(r[1]).kg, r[1]);
  for (const name of new Set(rows.filter(r => r[0] === 'WARMUP' && r[3] === '').map(r => r[1]))) {
    const work = rows.find(r => r[1] === name && r[0] === 'WORK' && r[3] !== ''), warm = rows.filter(r => r[1] === name && r[0] === 'WARMUP');
    if (work) warm.forEach((r, i) => { if (r[3] === '') r[3] = kgText(Number(work[3].replace(',', '.')) * (warm.length > 1 && i === warm.length - 1 ? .75 : .5), name); });
  }
  return rows;
}
// day: today's readiness, the athlete's status and the legs' load (gymDayFacts), as the generator sees them (Revize 2026-10-16, nález 27).
export async function adjustGymPlan(env, { rows, request, history = [], taste = {}, ratings = [], equipment = null, dumbbells = null, minutes = null, day = null, ask = null }) {
  // Only exercises the athlete's equipment allows (as "Přidat cvik" offers them); the plan's own stay.
  const inPlan = new Set(rows.map(r => r?.[1]).filter(Boolean));
  const items = gymExerciseCatalog().filter(e => inPlan.has(e.name) || !equipment || equipment(e.name)), catalog = new Map(items.map(e => [e.name, e]));
  const recent = {};
  for (const h of history) if (h?.exercise && !recent[h.exercise] && Number(h.actual_kg) > 0) recent[h.exercise] = { kg: Number(h.actual_kg), reps: Number(h.actual_reps) || null, date: String(h.workout_date || '').slice(0, 10) };
  const input = JSON.stringify({ request, plan: planForModel(rows), catalog: items.map(e => ({ name: e.name, muscle: e.muscle, reps: e.reps })), history: recent, liked: taste.liked || [], disliked: taste.disliked || [], minutes: Number(minutes) > 0 ? Number(minutes) : null, ratings, ...(day ? { readiness: day.readiness, athleteStatus: day.athleteStatus, legs: day.legs } : {}), ...(taste.memories?.length ? { preferenceMemory: taste.memories } : {}) });
  const params = { instructions: adjustInstructions() + MEMORY_RULE(), input, format: ADJUST_SCHEMA, maxOutputTokens: 4000, model: lightModel(env) };
  const r = ask ? await ask(env, { feature: "gym-adjust", ...params }) : await callOpenAI(env, { feature: "gym-adjust", ...params });
  const data = JSON.parse(r.text), out = fitGymMinutes(snapGymDumbbells(fillGymLoads(rowsFromModel(data.exercises, rows, catalog), history), dumbbells), minutes);
  if (!out.length) throw new Error(L('Úpravu se nepodařilo připravit, zkus ji napsat jinak.', 'The change couldn\'t be prepared; try wording it differently.'));
  return { rows: out, answer: String(data.answer || '').trim().slice(0, 400) };
}

export { MAX_EXERCISES };
export { MAX_SETS };
