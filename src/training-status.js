// User-declared status has priority over measured readiness, without changing
// historical measurements or diagnosing a condition from sensor data.
export const ATHLETE_STATUSES = { active: 'Active', sick: 'Sick', injured: 'Injured', on_break: 'On break' };
const HEADLINES = { sick: 'Sick · odpočinek během nemoci', injured: 'Injured · respektuj omezení zranění', on_break: 'On break · tréninková pauza' };
export function trainingStatus(state = {}) {
  const raw = typeof state === 'string' ? { status: state } : state || {};
  const status = Object.hasOwn(ATHLETE_STATUSES, raw.status) ? raw.status : 'active';
  const paused = status !== 'active', note = String(raw.note || '').trim().slice(0, 500);
  return { status, label: ATHLETE_STATUSES[status], paused, note, headline: HEADLINES[status] || null,
    guidance: paused ? [status === 'sick' ? 'Běžné tréninky jsou pozastavené; nyní dej prostor odpočinku.' : status === 'injured' ? 'Běžné tréninky jsou pozastavené. Náhradní sport ani cviky nenavrhuji bez upřesnění tvých omezení.' : 'Pauza má přednost před plánovaným objemem i dobrými ukazateli regenerace.', ...(note ? ['Tvoje omezení: ' + note] : []), 'Kalendář se automaticky nemění. Návrat k běžným doporučením obnovíš přepnutím na Active.'] : [] };
}
