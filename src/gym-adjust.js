// A gym plan changed by the athlete's words ("bez nohou", "kratší") and the
// rows a proposal is confirmed with: only exercises from the gym's catalog
// (or already in the plan), the plan's own columns, no logged results.
import { callOpenAI, lightModel } from './coach-assistant.js';
import { gymExerciseCatalog } from './gym-catalog.js';
import { GYM_PLAN_COLUMNS } from './gym-plan-store.js';

const MAX_ROWS = 80, MAX_EXERCISES = 14, MAX_SETS = 8;
const kgText = v => v == null || v === '' || !Number.isFinite(Number(String(v).replace(',', '.'))) ? '' : String(Math.round(Number(String(v).replace(',', '.')) * 2) / 2).replace('.', ',');

// Plan rows as the client sends them, trimmed to known exercises and the
// planning columns (a proposal has no results yet).
export function cleanGymRows(rows, allowed) {
  if (!Array.isArray(rows)) throw new Error('Chybí cviky plánu.');
  const out = rows.slice(0, MAX_ROWS).map(row => Array.from({ length: GYM_PLAN_COLUMNS.length }, (_, i) => String(row?.[i] ?? '').trim().slice(0, i === 9 ? 300 : 120)))
    .filter(r => /^(WARMUP|WORK)$/i.test(r[0]) && allowed.has(r[1]))
    .map(r => { r[0] = r[0].toUpperCase(); r[3] = kgText(r[3]); r[5] = r[6] = r[7] = ''; r[8] = 'FALSE'; r[11] = /^(true|1)$/i.test(r[11]) ? 'TRUE' : 'FALSE'; r[12] = /^[A-F]$/.test(r[12]) ? r[12] : ''; return r; });
  if (!out.length) throw new Error('Plán musí mít aspoň jeden cvik.');
  return out;
}

export function catalogNames() { return new Set(gymExerciseCatalog().map(e => e.name)); }

const ADJUST_SCHEMA = { type: 'json_schema', name: 'gym_adjust', strict: true, schema: { type: 'object', additionalProperties: false, required: ['answer', 'exercises'], properties: {
  answer: { type: 'string' },
  exercises: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'sets'], properties: {
    name: { type: 'string' },
    sets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'kg', 'reps'], properties: { type: { type: 'string', enum: ['WARMUP', 'WORK'] }, kg: { type: ['number', 'null'] }, reps: { type: 'string' } } } }
  } } }
} } };

const ADJUST_INSTRUCTIONS = `Jsi trenér posilovny. Uprav silový trénink podle přání sportovce a vrať celý upravený plán.
Používej jen přesné názvy cviků ze seznamu catalog nebo cviky, které už v plánu jsou. Nevymýšlej jiné cviky.
Cviky, kterých se přání netýká, nech beze změny i s jejich vahami, opakováními a rozcvičkou (WARMUP).
U nového cviku nastav váhu podle history (poslední série toho cviku), jinak kg null; opakování jako text, např. "8-10".
Kratší trénink znamená méně sérií nebo cviků, delší víc. Nejvýš ${MAX_EXERCISES} cviků a ${MAX_SETS} sérií na cvik.
V answer jednou až dvěma krátkými českými větami řekni, co jsi změnil.`;

// Rows → the compact plan the model sees, and its answer → plan rows again,
// keeping each kept exercise's own notes, superset and failure set.
export function planForModel(rows) {
  const by = new Map();
  for (const r of rows) { if (!r?.[1]) continue; if (!by.has(r[1])) by.set(r[1], { name: r[1], sets: [] }); by.get(r[1]).sets.push({ type: String(r[0]).toUpperCase() === 'WARMUP' ? 'WARMUP' : 'WORK', kg: r[3] === '' ? null : Number(String(r[3]).replace(',', '.')), reps: String(r[4] || '') }); }
  return [...by.values()];
}
export function rowsFromModel(exercises, original, catalog) {
  const allowed = new Set([...catalog.keys(), ...original.map(r => r?.[1]).filter(Boolean)]), seen = new Set(), rows = [];
  for (const ex of (exercises || []).slice(0, MAX_EXERCISES)) {
    const name = String(ex?.name || '').trim();
    if (!allowed.has(name) || seen.has(name)) continue;
    seen.add(name);
    const own = original.filter(r => r[1] === name), work = own.filter(r => String(r[0]).toUpperCase() !== 'WARMUP'), first = work[0] || own[0];
    const sets = (ex.sets || []).slice(0, MAX_SETS), lastWork = sets.map(s => s.type).lastIndexOf('WORK');
    sets.forEach((s, i) => {
      const warm = s.type === 'WARMUP', failure = !warm && i === lastWork && work.some(r => /^(true|1)$/i.test(r[11]));
      rows.push([warm ? 'WARMUP' : 'WORK', name, '', kgText(s.kg), String(s.reps || '').slice(0, 12), '', '', '', 'FALSE', warm ? '[WARMUP]' : first?.[9] || catalog.get(name)?.note || '', '', failure ? 'TRUE' : 'FALSE', warm ? '' : first?.[12] || '']);
    });
  }
  const seq = new Map();
  for (const r of rows) { const key = r[0] + '|' + r[1], n = (seq.get(key) || 0) + 1; seq.set(key, n); r[2] = String(n); }
  return rows;
}

export async function adjustGymPlan(env, { rows, request, history = [] }) {
  const items = gymExerciseCatalog(), catalog = new Map(items.map(e => [e.name, e]));
  const recent = {};
  for (const h of history) if (h?.exercise && !recent[h.exercise] && Number(h.actual_kg) > 0) recent[h.exercise] = { kg: Number(h.actual_kg), reps: Number(h.actual_reps) || null, date: String(h.workout_date || '').slice(0, 10) };
  const input = JSON.stringify({ request, plan: planForModel(rows), catalog: items.map(e => ({ name: e.name, muscle: e.muscle, reps: e.reps })), history: recent });
  const r = await callOpenAI(env, { instructions: ADJUST_INSTRUCTIONS, input, format: ADJUST_SCHEMA, maxOutputTokens: 4000, model: lightModel(env) });
  const data = JSON.parse(r.text), out = rowsFromModel(data.exercises, rows, catalog);
  if (!out.length) throw new Error('Úpravu se nepodařilo připravit, zkus ji napsat jinak.');
  return { rows: out, answer: String(data.answer || '').trim().slice(0, 400) };
}
