import { reflectionSignals } from './coach-reflection.js';

import { ATHLETE_STATUSES } from './training-status.js';
import { validDay } from './training-availability.js';
export { ATHLETE_STATUSES } from './training-status.js';
const clean = v => String(v || '').trim().slice(0, 500);
const pragueDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// statusUntil is the first calendar day on which the status no longer applies.
export function effectiveAthleteState(state,date=pragueDay()){
  return state.statusUntil&&validDay(state.statusUntil)&&state.statusUntil<=date
    ? {...state,status:'active',note:'',statusUntil:null} : state;
}
async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS athlete_state (user_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL)').run();
}
export async function getAthleteState(db,{date=pragueDay()}={}) {
  await ensure(db);
  const row = await db.prepare('SELECT state_json FROM athlete_state WHERE user_id=?').bind(db.userId).first();
  let state = {}; try { state = JSON.parse(row?.state_json || '{}'); } catch { /* defaults */ }
  // `conversation` is no longer written (chats live in assistant_chats); old rows still read.
  return effectiveAthleteState({ status: 'active', note: '', statusUntil:null, memories: [], conversation: [], dismissed: [], ...state },date);
}
export async function updateAthleteState(db, patch,{date=pragueDay()}={}) {
  const state = await getAthleteState(db,{date});
  if (patch.status != null) {
    if (!Object.hasOwn(ATHLETE_STATUSES, patch.status)) throw new Error('Neznámý stav.');
    const until=patch.statusUntil||null;
    if(until&&(!validDay(until)||until<=date))throw new Error('Konec platnosti musí být v budoucnu.');
    state.status = patch.status; state.note = clean(patch.note); state.changedAt = new Date().toISOString();
    state.statusUntil=patch.status==='active'?null:until;
  }
  if (patch.memory) state.memories = [...new Set([...state.memories, clean(patch.memory)])].slice(-30);
  if (patch.forget != null) {state.memories = state.memories.filter(x => x !== patch.forget);state.conversation=state.conversation.filter(t=>!String(t.content).includes(patch.forget));}
  if (patch.dismiss) state.dismissed = [...new Set([...state.dismissed, clean(patch.dismiss)])].slice(-30);
  await db.prepare('INSERT INTO athlete_state(user_id,state_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json').bind(db.userId, JSON.stringify(state)).run();
  return state;
}
// A lasting preference ("Nechci běhat"), not a remark about one day or a
// question: "Nechci dnes nohy" or "Nechci zítra kolo?" are not remembered.
const TEMPORARY=/\?|(?<!\p{L})(?:dnes|dneska|dnešní\p{L}*|zítra|zítřejší\p{L}*|teď|ted|tentokrát|(?:tento|tenhle|tenhleten) (?:týden|víkend))(?!\p{L})/iu;
export function explicitPreference(message) {
  const text=String(message||'');
  if(TEMPORARY.test(text))return null;
  return /(?:nemám rád|nemam rad|nemám ráda|nemam rada|nechci|nesnáším|nesnasim|preferuji|preferuju|mám rád|mam rad)/i.test(text) ? clean(text) : null;
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
