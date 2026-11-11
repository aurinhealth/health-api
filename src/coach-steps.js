// The coach's thinking steps under a question (the app's CoachSteps): what the
// server really reads and does for this answer, each with a sentence of the
// athlete's own numbers. Titles and sentences come only from these templates,
// never from the model (MDR, no prompt text leaks). A step without data is
// left out. The numbers are the ones Today and Health show: the same
// readiness (readiness.js) and the same rounding as GET /app/api/health.
import { L } from './lang.js';
import { readinessFor } from './readiness.js';

const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
// "7 h 12" (as the coach's answers write a night).
const hm = minutes => { const m = Math.round(minutes); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); };
const short = (text, n = 140) => { const t = String(text || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

// One step: id (sleep, hrv, review, today, notes, writing, check, refine), an
// SF Symbol, the title, the sentence, running or done, and `view`: the app's
// own component the step's sheet shows under the sentence (hrv: the HRV
// detail's range bar and "HRV by night" chart), none for text-only steps.
export const coachStep = (id, icon, title, text = null, status = 'done', view = null) =>
  ({ id, icon, title, ...(text ? { text } : {}), status, ...(view ? { view } : {}) });

// Last night and this morning's HRV against the athlete's usual range.
export function bodySteps({ date, inputs = {} }) {
  const r = readinessFor({ date, google: inputs.health?.wellness || [], intervals: inputs.fitness?.wellness || [], sessions: Array.isArray(inputs.health?.sleep) ? inputs.health.sleep : [], profile: inputs.profile || null, checkin: inputs.checkin || null });
  const c = r?.body?.components || {}, steps = [];
  const slept = num(c.sleep?.minutes), need = num(r?.need?.need);
  if (slept > 0) steps.push(coachStep('sleep', 'moon', L('Dívám se na tvůj poslední spánek', "Looking at last night's sleep"),
    L(`Tuto noc ${hm(slept)} spánku.`, `Last night you slept ${hm(slept)}.`) + (need > 0 ? ' ' + L(`Tvoje potřeba spánku je kolem ${hm(need)}.`, `Your sleep need is about ${hm(need)}.`) : '')));
  const hrv = num(c.hrv?.value), low = num(c.hrv?.low), high = num(c.hrv?.high);
  if (hrv > 0 && low != null && high != null && high > low) {
    const v = Math.round(hrv), lo = Math.round(low), hi = Math.round(high);
    const where = v < lo ? L('pod tvým obvyklým rozmezím', 'below your usual range') : v > hi ? L('nad tvým obvyklým rozmezím', 'above your usual range') : L('v tvém obvyklém rozmezí', 'inside your usual range');
    steps.push(coachStep('hrv', 'waveform.path.ecg', L('Porovnávám HRV s tvým obvyklým rozmezím', 'Comparing your HRV with your usual range'),
      L(`Dnes ráno HRV ${v} ms, ${where} ${lo} až ${hi} ms.`, `This morning your HRV was ${v} ms, ${where} of ${lo} to ${hi} ms.`), 'done', 'hrv'));
  }
  return steps;
}

// The ride or run the coach reviews (coach-ride-reviews.js), up to three.
export function reviewStep(activities = [], status = 'running') {
  if (!activities.length) return null;
  const runs = activities.filter(a => /run|treadmill/i.test(a.type || '')).length;
  const title = runs === activities.length ? L('Prohlížím tvůj poslední běh', 'Reviewing your last run') : runs ? L('Prohlížím tvoje poslední aktivity', 'Reviewing your last activities') : L('Prohlížím tvoji poslední jízdu', 'Reviewing your last ride');
  const line = a => { const m = Math.round(num(a.durationHours) * 60); return short(a.name || a.type, 60) + (m > 0 ? ` ${m} min` : '') + (num(a.tss) > 0 ? `, ${Math.round(a.tss)} TSS` : ''); };
  return coachStep('review', runs === activities.length ? 'figure.run' : 'bicycle', title, activities.slice(0, 3).map(line).join('; ') + '.', status);
}

// What is planned for today, by the plan's own names.
export function todayStep(planned = []) {
  const line = p => { const m = Math.round(num(p.durationHours) * 60); return short(p.name || p.type, 60) + (m > 0 ? `, ${m} min` : ''); };
  return coachStep('today', 'calendar', L('Kontroluji dnešní plán', "Checking today's plan"),
    planned.length ? L('Dnes v plánu: ', 'Planned for today: ') + planned.slice(0, 3).map(line).join('; ') + '.' : L('Na dnešek nemáš nic naplánováno.', 'Nothing is planned for today.'));
}

// The athlete's own notes to finished workouts (coach_reflections.notes, never
// the coach's AI-written reflection text) and what the coach remembers: counts,
// and the newest note in the athlete's words (shown only inside the step's sheet).
export function notesStep(notes = [], memories = []) {
  if (!notes.length && !memories.length) return null;
  const parts = [];
  if (notes.length) parts.push(L(`Poznámky: ${notes.length}`, `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`));
  if (memories.length) parts.push(L(`co si o tobě pamatuji: ${memories.length}`, `${memories.length} ${memories.length === 1 ? 'thing' : 'things'} I remember about you`));
  const newest = notes[0]?.text ? ' ' + L('Nejnovější: ', 'Newest: ') + '„' + short(notes[0].text) + '“' : '';
  return coachStep('notes', 'doc.text', L('Čtu tvoje poznámky a co si pamatuji', 'Reading your notes and what I remember'), parts.join(', ') + '.' + newest);
}

export const writingStep = (status = 'running') => coachStep('writing', 'pencil', L('Píšu odpověď', 'Writing your answer'), null, status);
// The live checker (coach-checker.js): shown by the app only when the check
// passed or rewrote the answer (check.status), never a check that did not run.
export const checkStep = (status = 'running') => coachStep('check', 'checkmark.shield', L('Kontroluji radu proti tvé připravenosti a plánu', 'Checking against your readiness and plan'), null, status);
export const refineStep = (status = 'running') => coachStep('refine', 'arrow.triangle.2.circlepath', L('Upřesňuji odpověď', 'Refining the answer'), null, status);

// The steps as one list, each id once with its latest state, in first-seen order.
export function stepList() {
  const byId = new Map();
  return { add(step) { if (step) byId.set(step.id, step); return step; }, get list() { return [...byId.values()]; } };
}
