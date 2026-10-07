// User-declared status has priority over measured readiness, without changing
// historical measurements or diagnosing a condition from sensor data.
import { L } from './lang.js';

export const ATHLETE_STATUSES = { active: 'Active', sick: 'Sick', injured: 'Injured', on_break: 'On break' };
const label = status => ({ active: L('Trénink', 'Training'), sick: L('Nemoc', 'Sick'), injured: L('Zranění', 'Injured'), on_break: L('Pauza', 'On break') })[status];
const headline = status => ({ sick: L('Nemoc · odpočinek během nemoci', 'Sick · rest while you are ill'), injured: L('Zranění · respektuj omezení', 'Injured · respect your limitations'), on_break: L('Pauza · tréninková přestávka', 'On break · training break') })[status] || null;
export function trainingStatus(state = {}) {
  const raw = typeof state === 'string' ? { status: state } : state || {};
  const status = Object.hasOwn(ATHLETE_STATUSES, raw.status) ? raw.status : 'active';
  const paused = status !== 'active', note = String(raw.note || '').trim().slice(0, 500);
  return { status, label: label(status), paused, note, headline: headline(status),
    guidance: paused ? [status === 'sick' ? L('Běžné tréninky jsou pozastavené; teď dej prostor odpočinku.', 'Regular training is paused; give yourself room to rest now.') : status === 'injured' ? L('Běžné tréninky jsou pozastavené. Náhradní sport ani cviky nenavrhnu, dokud neupřesníš svá omezení.', 'Regular training is paused. I won\'t suggest an alternative sport or exercises until you describe your limitations.') : L('Pauza má přednost před plánovaným objemem i dobrými ukazateli regenerace.', 'The break takes priority over the planned volume and good recovery metrics.'), ...(note ? [L('Tvoje omezení: ', 'Your limitations: ') + note] : []), L('Kalendář se automaticky nemění. K běžným doporučením se vrátíš přepnutím stavu na Trénink.', 'The calendar does not change automatically. Switch your status back to Training to get regular recommendations again.')] : [] };
}
