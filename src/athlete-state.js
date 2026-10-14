import { reflectionSignals } from './coach-reflection.js';

import { ATHLETE_STATUSES } from './training-status.js';
import { validDay } from './training-availability.js';
import { L, plural } from './lang.js';
import { localToday } from "./user-time.js";
export { ATHLETE_STATUSES } from './training-status.js';
const clean = v => String(v || '').trim().slice(0, 500);
// statusUntil is the first calendar day on which the status no longer applies.
export function effectiveAthleteState(state,date=localToday()){
  return state.statusUntil&&validDay(state.statusUntil)&&state.statusUntil<=date
    ? {...state,status:'active',note:'',statusUntil:null} : state;
}
async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS athlete_state (user_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL)').run();
}
export async function getAthleteState(db,{date=localToday()}={}) {
  await ensure(db);
  const row = await db.prepare('SELECT state_json FROM athlete_state WHERE user_id=?').bind(db.userId).first();
  let state = {}; try { state = JSON.parse(row?.state_json || '{}'); } catch { /* defaults */ }
  // `conversation` is no longer written (chats live in assistant_chats); old rows still read.
  return effectiveAthleteState({ status: 'active', note: '', statusUntil:null, memories: [], memoryMeta: {}, conversation: [], dismissed: [], ...state },date);
}
export async function updateAthleteState(db, patch,{date=localToday()}={}) {
  const state = await getAthleteState(db,{date});
  if (patch.status != null) {
    if (!Object.hasOwn(ATHLETE_STATUSES, patch.status)) throw new Error(L('Neznámý stav.','Unknown status.'));
    const until=patch.statusUntil||null;
    if(until&&(!validDay(until)||until<=date))throw new Error(L('Konec platnosti musí být v budoucnu.','The end date must be in the future.'));
    state.status = patch.status; state.note = clean(patch.note); state.changedAt = new Date().toISOString();
    state.statusUntil=patch.status==='active'?null:until;
  }
  if (patch.memory) remember(state, clean(patch.memory), date);
  if (patch.forget != null) {state.memories = state.memories.filter(x => x !== patch.forget);delete state.memoryMeta[patch.forget];state.conversation=state.conversation.filter(t=>!String(t.content).includes(patch.forget));}
  // An edited memory keeps its place in the list and counts as new.
  if (patch.edit?.from != null && state.memories.includes(patch.edit.from)) {
    const to = clean(patch.edit.to);
    if (!to) throw new Error(L('Napiš, co si má kouč pamatovat.', 'Write what the coach should remember.'));
    delete state.memoryMeta[patch.edit.from];
    state.memories = [...new Set(state.memories.map(x => x === patch.edit.from ? to : x))];
    state.memoryMeta[to] = memoryMeta(to, date);
  }
  // "Still true": the coach asks again in two weeks.
  if (patch.keep != null && state.memoryMeta[patch.keep]?.check) state.memoryMeta[patch.keep].check = shiftDate(date, CHECK_DAYS);
  if (patch.dismiss) state.dismissed = [...new Set([...state.dismissed, clean(patch.dismiss)])].slice(-30);
  await db.prepare('INSERT INTO athlete_state(user_id,state_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json').bind(db.userId, JSON.stringify(state)).run();
  return state;
}
// A pain, an injury or an illness passes: the coach asks after two weeks
// whether such a memory still holds (memoryCheck), so it does not wait for the
// athlete to delete it.
const CHECK_DAYS = 14;
const shiftDate = (day, days) => new Date(Date.parse(day + 'T12:00:00Z') + days * 864e5).toISOString().slice(0, 10);
const PASSING = /bol[ií]|bolest|zran|natáh|natah|podvrt|výron|vyron|nateklé|natekl|nemoc|nachlaz|chřip|chrip|těhot|tehot|hurt|pain|sore|injur|sprain|strain|ill\b|sick|cold\b|flu\b|pregnan/i;
const memoryMeta = (text, date) => ({ at: date, check: PASSING.test(text) ? shiftDate(date, CHECK_DAYS) : null });
function remember(state, text, date) {
  if (!text || state.memories.includes(text)) return;
  state.memories = [...state.memories, text].slice(-30);
  state.memoryMeta[text] = memoryMeta(text, date);
  for (const key of Object.keys(state.memoryMeta)) if (!state.memories.includes(key)) delete state.memoryMeta[key];
}
// The list for the app: each memory with the day it was saved.
export const memoryList = state => (state.memories || []).map(text => ({ text, since: state.memoryMeta?.[text]?.at || null, check: state.memoryMeta?.[text]?.check || null }));
// The oldest passing memory whose check day has come: "Is this still true?"
export function memoryCheck(state, date = localToday()) {
  const due = memoryList(state).filter(m => m.check && m.check <= date).sort((a, b) => a.check.localeCompare(b.check))[0];
  return due ? { id: 'memory:' + due.check + ':' + due.text, kind: 'memory_check', memory: due.text, headline: L('Platí to pořád?', 'Is this still true?'), reasons: [due.text], message: null } : null;
}
// What the coach's answer says to forget or rewrite, kept only when it names a
// memory exactly as it is saved; a rewrite to the same text is no change.
export function memoryChanges(proposed, memories = []) {
  const known = new Set(memories), forgotten = [], updated = [];
  for (const text of Array.isArray(proposed?.forget) ? proposed.forget : []) if (known.has(text) && !forgotten.includes(text)) forgotten.push(text);
  for (const u of Array.isArray(proposed?.update) ? proposed.update : []) {
    const to = clean(u?.to);
    if (known.has(u?.from) && !forgotten.includes(u.from) && to && to !== u.from && !updated.some(x => x.from === u.from)) updated.push({ from: u.from, to });
  }
  return { forgotten, updated };
}
// A lasting preference ("Nechci běhat"), not a remark about one day or a
// question: "Nechci dnes nohy" or "Nechci zítra kolo?" are not remembered.
const TEMPORARY=/\?|(?<!\p{L})(?:dnes|dneska|dnešní\p{L}*|zítra|zítřejší\p{L}*|teď|ted|tentokrát|(?:tento|tenhle|tenhleten) (?:týden|víkend)|today|tonight|tomorrow|now|this (?:time|week|weekend))(?!\p{L})/iu;
const PROPOSAL_REF=/(?:\bplán\w*|návrh\w*|variant\w*|možnost\w*|tenhle|tohle|tuhle|tento trénink|\bto\b[,.!?]|\bthis\b|\bthat\b|\bit\b[,.!?]|\boption|\bproposal|\bplan\b|\bversion)/i;
export function explicitPreference(message) {
  const text=String(message||'');
  if(TEMPORARY.test(text))return null;
  // About the coach's proposal ("I like this plan, but…", "nechci to, dej jinou
  // variantu"), not a lasting habit, so nothing to keep for every later answer.
  if(PROPOSAL_REF.test(text))return null;
  return /(?:nemám rád|nemam rad|nemám ráda|nemam rada|nechci|nesnáším|nesnasim|preferuji|preferuju|mám rád|mam rad|mám ráda|mam rada|\bi (?:don'?t|do not) (?:like|want|enjoy)\b|\bi (?:hate|prefer|like|love|enjoy)\b)/i.test(text) ? clean(text) : null;
}
export function assertTrainingAllowed(state) {
  if (state?.status && state.status !== 'active') throw new Error(L('Aktuální stav je ' + { sick: 'Nemoc', injured: 'Zranění', on_break: 'Pauza' }[state.status] + '. Trénink navrhnu po změně stavu na Trénink; teď s AI řeš odpočinek nebo svá omezení.', 'Your current status is ' + ATHLETE_STATUSES[state.status] + '. I\'ll suggest training once you switch your status back to Training; for now, talk to AI about rest or your limitations.'));
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
  return { id, status: 'on_break', headline: L('Více ukazatelů dnes naznačuje slabší regeneraci. Zvážíš pauzu?', 'Several metrics suggest weaker recovery today. Would you consider a break?'), reasons: signals.map(s => s.text), remaining, message: remaining.length ? L('Ještě tě ' + plural(remaining.length, 'čeká', 'čekají', 'čeká') + ' ' + remaining.length + ' ' + plural(remaining.length, 'trénink', 'tréninky', 'tréninků') + '. Můžeme projít týden, zkrátit je nebo některý nahradit odpočinkem.', 'You still have ' + remaining.length + ' ' + plural(remaining.length, '', '', '', 'workout', 'workouts') + ' ahead. We can go through the week, shorten them or replace one with rest.') : L('Můžeme upravit další dny podle tvých možností.', 'We can adjust the coming days to what works for you.') };
}
