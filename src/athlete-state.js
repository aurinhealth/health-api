import { reflectionSignals } from './coach-reflection.js';

export const ATHLETE_STATUSES = { active: 'Active', sick: 'Sick', injured: 'Injured', on_break: 'On break' };
const clean = v => String(v || '').trim().slice(0, 500);
async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS athlete_state (user_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL)').run();
}
export async function getAthleteState(db) {
  await ensure(db);
  const row = await db.prepare('SELECT state_json FROM athlete_state WHERE user_id=?').bind(db.userId).first();
  let state = {}; try { state = JSON.parse(row?.state_json || '{}'); } catch { /* defaults */ }
  return { status: 'active', note: '', memories: [], conversation: [], dismissed: [], ...state };
}
export async function updateAthleteState(db, patch) {
  const state = await getAthleteState(db);
  if (patch.status != null) {
    if (!Object.hasOwn(ATHLETE_STATUSES, patch.status)) throw new Error('Neznámý stav.');
    state.status = patch.status; state.note = clean(patch.note); state.changedAt = new Date().toISOString();
  }
  if (patch.memory) state.memories = [...new Set([...state.memories, clean(patch.memory)])].slice(-30);
  if (patch.forget != null) {state.memories = state.memories.filter(x => x !== patch.forget);state.conversation=state.conversation.filter(t=>!String(t.content).includes(patch.forget));}
  if (patch.dismiss) state.dismissed = [...new Set([...state.dismissed, clean(patch.dismiss)])].slice(-30);
  if (patch.turn) state.conversation = [...state.conversation, ...patch.turn].slice(-12);
  await db.prepare('INSERT INTO athlete_state(user_id,state_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json').bind(db.userId, JSON.stringify(state)).run();
  return state;
}
export function explicitPreference(message) {
  return /(?:nemám rád|nemam rad|nemám ráda|nemam rada|nechci|nesnáším|nesnasim|preferuji|preferuju|mám rád|mam rad)/i.test(message) ? clean(message) : null;
}
export function assertTrainingAllowed(state) {
  if (state?.status && state.status !== 'active') throw new Error('Aktuální stav je ' + ATHLETE_STATUSES[state.status] + '. Trénink navrhnu po změně stavu na Active; nyní řeš odpočinek nebo omezení s asistentem.');
}
// A single bad value cannot diagnose illness or injury. Only suggest a break,
// based on multiple recent signals, and always let the athlete decide.
export function proactiveAdvice({ date, fitness = {}, health = {}, week = {}, state = {} }) {
  if (state.status !== 'active') return null;
  const signals = reflectionSignals({ date, wellness: fitness.wellness || [], sleep: health.sleep || [] }).filter(s => ['sleep_short', 'hrv_low', 'rhr_high', 'tsb_low', 'tsb_chronic'].includes(s.id));
  if (signals.length < 2) return null;
  const id = date + ':recovery';
  if (state.dismissed?.includes(id)) return null;
  const remaining = (week.days || []).filter(d => d.date >= date).flatMap(d => (d.daily?.training?.planned || []).filter(a => !/nutrition/i.test(a.name || '')).map(a => ({ date: d.date, id: a.id, name: a.name })));
  return { id, status: 'on_break', headline: 'Více ukazatelů dnes naznačuje slabší regeneraci. Zvážíš On break?', reasons: signals.map(s => s.text), remaining, message: remaining.length ? 'Ještě tě čeká ' + remaining.length + ' tréninků. Můžeme projít týden, zkrátit je nebo některý nahradit odpočinkem.' : 'Můžeme upravit další dny podle tvých možností.' };
}
