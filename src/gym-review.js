// Review of a finished gym session from the day's plan and the athlete's own
// strength history, without AI: every exercise's sets against the plan, the
// change against the last session, the load for next time (the same double
// progression the generator uses) and the day's recovery. Texts follow the app
// language of the request (src/lang.js).
import { parseStrengthPlan } from './strength-history.js';
import { progressionDecision, EXERCISE_INTELLIGENCE } from './strength-intelligence.js';
import { recoverySignals } from './ride-review.js';
import { L as t, isEnglish } from './lang.js';

const n = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const kgText = v => { const s = String(Math.round(v * 10) / 10); return isEnglish() ? s : s.replace('.', ','); };
const e1rm = (kg, reps) => kg > 0 && reps > 0 ? kg * (1 + Math.min(reps, 15) / 30) : null;
function repRange(text) {
  const m = String(text || '').match(/(\d+)\s*(?:[-–]\s*(\d+))?/);
  return m ? { min: Number(m[1]), max: Number(m[2] || m[1]) } : null;
}
const MUSCLES = { chest: ['hrudník', 'chest'], back: ['záda', 'back'], lats: ['široký sval zádový', 'lats'], shoulders: ['ramena', 'shoulders'], side_delts: ['boční ramena', 'side delts'], rear_delts: ['zadní ramena', 'rear delts'], biceps: ['biceps', 'biceps'], triceps: ['triceps', 'triceps'], quads: ['stehna (přední)', 'quads'], hamstrings: ['hamstringy', 'hamstrings'], glutes: ['hýždě', 'glutes'], calves: ['lýtka', 'calves'], core: ['střed těla', 'core'] };
const muscleName = m => MUSCLES[m] ? t(...MUSCLES[m]) : m;
const fmtDate = d => { const [, m, day] = String(d).split('-'); return isEnglish() ? Number(m) + '/' + Number(day) : Number(day) + '. ' + Number(m) + '.'; };

export function buildGymReview({ values = null, history = [], date, wellness = [], fitness = {} } = {}) {
  let parsed = null;
  try { parsed = values ? parseStrengthPlan(values) : null; } catch { parsed = null; }
  const work = (parsed?.rows || []).filter(r => r.type === 'WORK');
  if (!work.length) return null;
  const done = work.filter(r => r.completed && n(r.actualKg) != null && n(r.actualReps) != null);
  if (!done.length) return null;
  const before = (history || []).filter(r => String(r.workout_date || '').slice(0, 10) < date);
  const byExercise = new Map();
  for (const r of work) (byExercise.get(r.exercise) || byExercise.set(r.exercise, []).get(r.exercise)).push(r);

  const exercises = [], wins = [], fixes = [], next = [], load = [];
  for (const [name, rows] of byExercise) {
    const sets = rows.map(r => {
      const range = repRange(r.plannedReps), kg = n(r.actualKg), reps = n(r.actualReps), finished = r.completed && kg != null && reps != null;
      const status = !finished ? 'missing' : range && reps < range.min ? 'under' : range && reps > range.max ? 'over' : 'in';
      return { plannedKg: n(r.plannedKg), plannedReps: r.plannedReps || null, kg, reps, rpe: n(r.rpe), status, toFailure: r.toFailure };
    });
    const finished = sets.filter(s => s.status !== 'missing');
    const best = finished.reduce((a, s) => Math.max(a, e1rm(s.kg, s.reps) || 0), 0);
    const own = before.filter(r => r.exercise === name);
    const lastDate = own.map(r => String(r.workout_date).slice(0, 10)).sort().at(-1);
    const lastBest = lastDate ? own.filter(r => String(r.workout_date).slice(0, 10) === lastDate).reduce((a, r) => Math.max(a, e1rm(n(r.actual_kg), n(r.actual_reps)) || 0), 0) : null;
    const range = repRange(rows[0].plannedReps);
    const rows4progression = [...own, ...finished.map(s => ({ workout_date: date, actual_kg: s.kg, actual_reps: s.reps, rpe: s.rpe }))];
    const decision = finished.length ? progressionDecision(rows4progression, name, rows[0].plannedReps, 1, date) : null;
    const rpes = finished.map(s => s.rpe).filter(v => v != null && v > 0);
    exercises.push({ name, muscle: EXERCISE_INTELLIGENCE[name]?.muscle || null, plannedSets: sets.length, doneSets: finished.length, sets, best, lastBest, lastDate, decision, maxRpe: rpes.length ? Math.max(...rpes) : null, range });
  }

  const planned = exercises.reduce((a, e) => a + e.plannedSets, 0), completed = exercises.reduce((a, e) => a + e.doneSets, 0);
  const under = exercises.filter(e => e.sets.some(s => s.status === 'under')), skipped = exercises.filter(e => e.doneSets < e.plannedSets);
  const verdict = completed < planned ? t('Odcvičeno ' + completed + ' z ' + planned + ' pracovních sérií.', completed + ' of ' + planned + ' work sets done.')
    : under.length ? t('Všechny série hotové, u některých cviků pod plánovanými opakováními.', 'All sets done, some exercises below the planned reps.')
    : t('Povedený trénink: všechny série v plánovaném rozsahu.', 'A good session: every set within the planned range.');

  // Progress against the last time the exercise was done.
  const up = exercises.filter(e => e.lastBest && e.best > e.lastBest * 1.01), down = exercises.filter(e => e.lastBest && e.best < e.lastBest * .95);
  for (const e of up.slice(0, 3)) wins.push(t(e.name + ': odhad maxima ' + kgText(e.best) + ' kg, o ' + kgText(e.best - e.lastBest) + ' kg víc než minule (' + fmtDate(e.lastDate) + ').', e.name + ': estimated max ' + kgText(e.best) + ' kg, ' + kgText(e.best - e.lastBest) + ' kg more than on ' + fmtDate(e.lastDate) + '.'));
  const clean = exercises.filter(e => e.doneSets === e.plannedSets && e.sets.every(s => s.status !== 'under') && !up.includes(e));
  if (clean.length) wins.push(t('Podle plánu: ' + clean.map(e => e.name).join(', ') + '.', 'As planned: ' + clean.map(e => e.name).join(', ') + '.'));
  for (const e of new Set([...skipped, ...under])) {
    const low = e.sets.filter(x => x.status === 'under'), parts = [];
    if (e.doneSets < e.plannedSets) parts.push(t(e.doneSets + ' z ' + e.plannedSets + ' sérií', e.doneSets + ' of ' + e.plannedSets + ' sets'));
    if (low.length) parts.push(low.map(x => kgText(x.kg) + '×' + x.reps).join(t(' a ', ' and ')) + t(' pod rozsahem ' + e.range.min + '–' + e.range.max + ' opakování', ' below the ' + e.range.min + '–' + e.range.max + ' rep range'));
    fixes.push(e.name + ': ' + parts.join(', ') + '.');
  }
  for (const e of exercises.filter(e => e.maxRpe != null && e.maxRpe >= 9.5 && !under.includes(e))) fixes.push(t(e.name + ': RPE ' + kgText(e.maxRpe) + ', série skoro do selhání. Nech si 1–2 opakování v rezervě.', e.name + ': RPE ' + kgText(e.maxRpe) + ', close to failure. Keep 1–2 reps in reserve.'));
  for (const e of down) fixes.push(t(e.name + ': odhad maxima o ' + kgText(e.lastBest - e.best) + ' kg níž než minule (' + fmtDate(e.lastDate) + '). Jednou se to stane; pokud se to zopakuje, zkontroluj spánek a regeneraci.', e.name + ': estimated max ' + kgText(e.lastBest - e.best) + ' kg lower than on ' + fmtDate(e.lastDate) + '. It happens; if it repeats, check sleep and recovery.'));

  // Next time: the load the generator will use.
  const plan = exercises.filter(e => e.decision).map(e => {
    const d = e.decision, kg = kgText(d.kg);
    if (d.decision === 'increase') return t(e.name + ' ' + kg + ' kg (+' + kgText(d.kg - d.topKg) + ')', e.name + ' ' + kg + ' kg (+' + kgText(d.kg - d.topKg) + ')');
    if (d.decision === 'decrease') return t(e.name + ' ' + kg + ' kg (−' + kgText(d.topKg - d.kg) + ')', e.name + ' ' + kg + ' kg (−' + kgText(d.topKg - d.kg) + ')');
    return t(e.name + ' ' + kg + ' kg, přidat opakování', e.name + ' ' + kg + ' kg, add reps') + (d.stalled ? t(' (třetí trénink beze změny, zkus jinou variantu)', ' (third session without change, try a variation)') : '');
  });
  if (plan.length) next.push(...plan.slice(0, 6));

  // Volume by muscle group and the day's recovery.
  const tonnage = exercises.reduce((a, e) => a + e.sets.filter(s => s.status !== 'missing').reduce((x, s) => x + s.kg * s.reps, 0), 0);
  const groups = new Map();
  for (const e of exercises) if (e.muscle && e.doneSets) groups.set(e.muscle, (groups.get(e.muscle) || 0) + e.doneSets);
  if (tonnage > 0) load.push(t('Objem ' + Math.round(tonnage).toLocaleString('cs-CZ') + ' kg (váha × opakování)', 'Volume ' + Math.round(tonnage).toLocaleString('en-US') + ' kg (load × reps)') + (groups.size ? t(', série podle partií: ', ', sets by muscle group: ') + [...groups].sort((a, b) => b[1] - a[1]).map(([m, c]) => muscleName(m) + ' ' + c).join(', ') : '') + '.');
  const rec = recoverySignals(wellness, date), flags = [rec.hrv?.drop, rec.rhr?.high, rec.sleep?.nights >= 3].filter(Boolean).length;
  if (rec.hrv?.drop) load.push(t('Ranní HRV ' + Math.round(rec.hrv.value) + ' je pod tvým běžným rozsahem (' + Math.round(rec.hrv.low) + '–' + Math.round(rec.hrv.high) + ').', 'Morning HRV ' + Math.round(rec.hrv.value) + ' is below your usual range (' + Math.round(rec.hrv.low) + '–' + Math.round(rec.hrv.high) + ').'));
  if (flags >= 2) load.push(t('Regenerace je dnes slabší: další těžký trénink nohou nebo intervaly nech až na den, kdy se HRV a spánek vrátí.', 'Recovery is weaker today: leave the next heavy leg session or intervals until HRV and sleep are back.'));
  const legs = ['quads', 'hamstrings', 'glutes'].reduce((a, m) => a + (groups.get(m) || 0), 0);
  if (legs >= 6) load.push(t('Hodně sérií na nohy (' + legs + '): zítřejší jízdu nebo běh drž spíš lehce.', 'Plenty of leg sets (' + legs + '): keep tomorrow\'s ride or run on the easy side.'));
  void fitness;

  const table = { columns: [t('Cvik', 'Exercise'), t('Plán', 'Plan'), t('Odcvičeno', 'Done'), 'RPE'], rows: exercises.map(e => [e.name, e.plannedSets + '× ' + (e.sets[0].plannedKg != null ? kgText(e.sets[0].plannedKg) + ' kg × ' : '') + (e.sets[0].plannedReps || '—'), e.sets.filter(s => s.status !== 'missing').map(s => kgText(s.kg) + '×' + s.reps).join(', ') || '—', e.maxRpe != null ? kgText(e.maxRpe) : '—']) };
  const sets = exercises.map(e => ({ name: e.name, sets: e.sets.map(s => ({ label: s.status === 'missing' ? (s.plannedKg != null ? kgText(s.plannedKg) + '×' + (s.plannedReps || '') : '—') : kgText(s.kg) + '×' + s.reps, status: s.status })) }));
  const sections = [
    wins.length ? { kind: 'good', label: t('Co se povedlo', 'What went well'), items: wins } : null,
    fixes.length ? { kind: 'fix', label: t('Co příště líp', 'Do better next time'), items: fixes } : null,
    next.length ? { kind: 'next', label: t('Příště', 'Next time'), items: next } : null,
    load.length ? { kind: 'load', label: t('Zátěž a regenerace', 'Load and recovery'), items: load } : null
  ].filter(Boolean);
  return { verdict, table, sets, sections, actions: [] };
}
