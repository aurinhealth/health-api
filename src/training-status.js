// User-declared status has priority over measured readiness, without changing
// historical measurements or diagnosing a condition from sensor data.
import { L } from './lang.js';

export const ATHLETE_STATUSES = { active: 'Active', sick: 'Sick', injured: 'Injured', on_break: 'Rest' };
const label = status => ({ active: L('Aktivní', 'Active'), sick: L('Nemoc', 'Sick'), injured: L('Zranění', 'Injured'), on_break: L('Pauza', 'Rest') })[status];
const headline = status => ({ sick: L('Nemoc, odpočívej', 'Ill, take a rest'), injured: L('Zranění, respektuj omezení', 'Injured, respect your limitations'), on_break: L('Tréninková pauza', 'A break from training') })[status] || null;
// Nemoc set more than 7 days ago: the guidance adds a doctor (audit wave 2,
// 9.5, after Elliott 2020), without naming any illness.
const longIll = raw => raw.status === 'sick' && Date.now() - Date.parse(raw.changedAt || '') > 7 * 864e5;
export function trainingStatus(state = {}) {
  const raw = typeof state === 'string' ? { status: state } : state || {};
  const status = Object.hasOwn(ATHLETE_STATUSES, raw.status) ? raw.status : 'active';
  const paused = status !== 'active', note = String(raw.note || '').trim().slice(0, 500);
  return { status, label: label(status), paused, note, headline: headline(status),
    guidance: paused ? [status === 'sick' ? L('Běžné tréninky jsou pozastavené; teď dej prostor odpočinku.', 'Regular training is paused; give yourself room to rest now.') + (longIll(raw) ? L(' Když se to nelepší, poraď se s lékařem.', " If it isn't getting better, see a doctor.") : '') : status === 'injured' ? L('Běžné tréninky jsou pozastavené. Náhradní sport ani cviky nenavrhnu, dokud neupřesníš svá omezení.', 'Regular training is paused. I won\'t suggest an alternative sport or exercises until you describe your limitations.') : L('Pauza má přednost před plánovaným objemem i dobrými ukazateli regenerace.', 'The break takes priority over the planned volume and good recovery metrics.'), ...(note ? [L('Tvoje omezení: ', 'Your limitations: ') + note] : []), L('Kalendář se automaticky nemění. K běžným doporučením se vrátíš přepnutím stavu na Aktivní.', 'The calendar does not change automatically. Switch your status back to Active to get regular recommendations again.')] : [] };
}
