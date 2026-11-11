import { reflectionSignals, fillWellness } from './coach-reflection.js';

import { ATHLETE_STATUSES } from './training-status.js';
import { validDay } from './training-availability.js';
import { L, plural } from './lang.js';
import { localToday } from "./user-time.js";
import { PASSING_WORDS, checkDays, heartSymptom } from './pain-words.js';
import { knownStation } from './gym-equipment.js';
import { MEMORY_RULE } from './private/athlete-state.js';
export { MEMORY_RULE };
export { ATHLETE_STATUSES } from './training-status.js';
const clean = v => String(v || '').trim().slice(0, 500);
// statusUntil is the first calendar day on which the status no longer applies.
export function effectiveAthleteState(state,date=localToday()){
  return state.statusUntil&&validDay(state.statusUntil)&&state.statusUntil<=date
    ? {...state,status:'active',note:'',statusUntil:null,...(state.status==='sick'?{recoveredAt:state.statusUntil,sickFrom:sickStart(state)}:{})} : state;
}
// The first day of Nemoc (changedAt is when it was set), so the return can
// follow how long it lasted (cycling-coach-v2.js).
function sickStart(state){
  const day=String(state.changedAt||'').slice(0,10);
  return validDay(day)?day:null;
}
async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS athlete_state (user_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL)').run();
}
export async function getAthleteState(db,{date=localToday()}={}) {
  await ensure(db);
  const row = await db.prepare('SELECT state_json FROM athlete_state WHERE user_id=?').bind(db.userId).first();
  let state = {}; try { state = JSON.parse(row?.state_json || '{}'); } catch { /* defaults */ }
  // `conversation` is no longer written (chats live in assistant_chats); old rows still read.
  return effectiveAthleteState({ status: 'active', note: '', statusUntil:null, memories: [], memoryMeta: {}, pastMemories: [], memoryOff: false, conversation: [], dismissed: [], ...state },date);
}
// The memories the coach and the other AI features use: none while the athlete
// has "Use memory" off (the list stays and comes back when it is on again).
export const usedMemories = state => state?.memoryOff ? [] : (state?.memories || []);
export async function updateAthleteState(db, patch,{date=localToday()}={}) {
  const state = await getAthleteState(db,{date});
  if (patch.status != null) {
    if (!Object.hasOwn(ATHLETE_STATUSES, patch.status)) throw new Error(L('Neznámý stav.','Unknown status.'));
    const until=patch.statusUntil||null;
    if(until&&(!validDay(until)||until<=date))throw new Error(L('Konec platnosti musí být v budoucnu.','The end date must be in the future.'));
    // The day Nemoc ends: the first days back stay easy (cycling-coach-v2.js).
    if (state.status === 'sick' && patch.status === 'active') { state.recoveredAt = date; state.sickFrom = sickStart(state); }
    state.status = patch.status; state.note = clean(patch.note); state.changedAt = new Date().toISOString();
    state.statusUntil=patch.status==='active'?null:until;
  }
  // A memory added by hand ("memory", with its group) or saved by the coach from
  // the athlete's own words ("saves", marked New in the list for a week).
  if (patch.memory) remember(state, clean(patch.memory), date, { group: patch.group });
  for (const save of Array.isArray(patch.saves) ? patch.saves : []) remember(state, clean(save?.text), date, { group: save?.group, by: 'coach', station: save?.station, until: save?.until, muscles: save?.muscles });
  if (patch.forget != null) {
    const meta = state.memoryMeta[patch.forget];
    // "No longer true" about a pain or an illness keeps it under Past: the coach
    // knows the history but does not coach on it. Deleting from the list erases it.
    if (patch.toPast && state.memories.includes(patch.forget) && groupOf(patch.forget, meta) === 'health') state.pastMemories = [...state.pastMemories.filter(p => p.text !== patch.forget), { text: patch.forget, group: 'health', at: meta?.at || null, endedAt: date }].slice(-PAST_KEEP);
    state.memories = state.memories.filter(x => x !== patch.forget);delete state.memoryMeta[patch.forget];state.conversation=state.conversation.filter(t=>!String(t.content).includes(patch.forget));
  }
  if (patch.forgetPast != null) state.pastMemories = state.pastMemories.filter(p => p.text !== patch.forgetPast);
  // An edited memory keeps its place in the list and counts as new.
  if (patch.edit?.from != null && state.memories.includes(patch.edit.from)) {
    const to = clean(patch.edit.to);
    if (!to) throw new Error(L('Napiš, co si má kouč pamatovat.', 'Write what the coach should remember.'));
    const before = state.memoryMeta[patch.edit.from];
    delete state.memoryMeta[patch.edit.from];
    state.memories = [...new Set(state.memories.map(x => x === patch.edit.from ? to : x))];
    state.memoryMeta[to] = { ...memoryMeta(to, date), group: validGroup(patch.edit.group) || groupOf(patch.edit.from, before), ...(patch.edit.by === 'coach' ? { changed: 'updated', changedAt: date } : {}) };
  }
  // Only the group of a memory changes (the edit sheet's Goals, Training, Health, Life).
  if (patch.regroup?.text != null && state.memories.includes(patch.regroup.text) && validGroup(patch.regroup.group)) state.memoryMeta[patch.regroup.text] = { ...(state.memoryMeta[patch.regroup.text] || memoryMeta(patch.regroup.text, date)), group: patch.regroup.group };
  // "Use memory": off, the coach neither reads nor saves memories.
  if (typeof patch.memoryOff === 'boolean') state.memoryOff = patch.memoryOff;
  // "Still true": the coach asks again in two weeks at the soonest (a lasting
  // illness is not asked about every three days), chest symptoms in two days.
  if (patch.keep != null && state.memoryMeta[patch.keep]?.check) Object.assign(state.memoryMeta[patch.keep], { check: shiftDate(date, heartSymptom(patch.keep) ? HEART_KEEP_DAYS : Math.max(checkDays(patch.keep) || 0, KEEP_DAYS)), keptAt: date });
  // Settings → Oznámení: the morning readiness, the coach's own messages, the
  // water push and hiding the values in them (push.js hidesValues), on until turned off.
  if (patch.notify && typeof patch.notify === 'object') {
    state.notify = { ...(state.notify || {}) };
    for (const key of ['morning', 'coach', 'water', 'private']) if (typeof patch.notify[key] === 'boolean') state.notify[key] = patch.notify[key];
  }
  // Kept by the coach's push (coach-push.js): the last time zone seen and the message waiting for an answer.
  if (patch.zone !== undefined) state.zone = patch.zone;
  if (patch.nudge !== undefined) state.nudge = patch.nudge;
  // Sessions cancelled when switching to Nemoc, Zranění or Pauza: the coach
  // offers them back afterwards. Kept 21 days, at most 14.
  if (Array.isArray(patch.cancelled)) {
    const since = shiftDate(date, -21);
    state.cancelled = [...(state.cancelled || []), ...patch.cancelled.map(c => ({ date: validDay(c?.date) ? c.date : null, name: clean(c?.name).slice(0, 80) || null, type: clean(c?.type).slice(0, 30) || null, minutes: Number(c?.minutes) > 0 ? Math.round(Number(c.minutes)) : null, at: date }))]
      .filter(c => c.at >= since).slice(-14);
  }
  if (patch.dismiss) state.dismissed = [...new Set([...state.dismissed, clean(patch.dismiss)])].slice(-30);
  await db.prepare('INSERT INTO athlete_state(user_id,state_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json').bind(db.userId, JSON.stringify(state)).run();
  return state;
}
// A pain, an injury or an illness passes: the coach asks after a few days
// (pain-words.js checkDays) whether such a memory still holds (memoryCheck),
// so it does not wait for the athlete to delete it.
const KEEP_DAYS = 14, HEART_KEEP_DAYS = 2;
const shiftDate = (day, days) => new Date(Date.parse(day + 'T12:00:00Z') + days * 864e5).toISOString().slice(0, 10);
const PASSING = PASSING_WORDS;
const memoryMeta = (text, date) => ({ at: date, check: checkDays(text) ? shiftDate(date, checkDays(text)) : null });
// What the coach remembers, in four groups (the WHOOP-like sections of the list).
export const MEMORY_GROUPS = ['goals', 'training', 'health', 'life'];
const validGroup = group => MEMORY_GROUPS.includes(group) ? group : null;
// A memory from before the groups: a pain or an illness is Health, the rest Training.
const groupOf = (text, meta) => validGroup(meta?.group) || (PASSING.test(text) || heartSymptom(text) ? 'health' : 'training');
// How many lasting memories and past ones are kept; the oldest go first.
export const MEMORY_KEEP = 50;
const PAST_KEEP = 20;
// New and Updated show for a week after the coach saved or rewrote a memory itself.
const BADGE_DAYS = 7;
// A machine that does not work is left out until the day the athlete said, two
// weeks without one; then the coach asks whether it still holds (point 11).
const BROKEN_DAYS = 14;
// A lasting wish to train a muscle group more ("chci víc zad"): the gym plan
// adds it until the day the athlete said, six weeks without one (point 10).
const FOCUS_DAYS = 42;
const muscleIds = list => Array.isArray(list) ? [...new Set(list.filter(m => /^[a-z_]{2,20}$/.test(m)))].slice(0, 3) : [];
function remember(state, text, date, { group = null, by = null, station = null, until = null, muscles = null } = {}) {
  if (!text || state.memories.includes(text)) return;
  state.memories = [...state.memories, text].slice(-MEMORY_KEEP);
  const until_ = days => validDay(until) && until > date ? until : shiftDate(date, days);
  const broken = knownStation(station) ? { station, check: until_(BROKEN_DAYS) } : muscleIds(muscles).length ? { muscles: muscleIds(muscles), check: until_(FOCUS_DAYS) } : {};
  state.memoryMeta[text] = { ...memoryMeta(text, date), group: validGroup(group) || groupOf(text), ...broken, ...(by === 'coach' ? { changed: 'new', changedAt: date } : {}) };
  state.pastMemories = (state.pastMemories || []).filter(p => p.text !== text);
  for (const key of Object.keys(state.memoryMeta)) if (!state.memories.includes(key)) delete state.memoryMeta[key];
}
// The list for the app: each memory with the day it was saved, its group and
// whether the coach saved or rewrote it this week (New, Updated).
export const memoryList = (state, date = localToday()) => (state.memories || []).map(text => {
  const meta = state.memoryMeta?.[text] || {};
  const badge = meta.changed && meta.changedAt && meta.changedAt > shiftDate(date, -BADGE_DAYS) ? meta.changed : null;
  return { text, since: meta.at || null, check: meta.check || null, group: groupOf(text, meta), badge };
});
// What no longer holds: a past pain or illness, newest first.
export const pastMemoryList = state => [...(state.pastMemories || [])].reverse().map(p => ({ text: p.text, group: p.group || 'health', since: p.at || null, ended: p.endedAt || null }));
// The oldest passing memory whose check day has come: "Is this still true?"
// Chest symptoms are asked about after the first training since they were
// told or last confirmed too (trainedOn: the day of the latest training).
export const heartSince = state => state?.memoryOff ? null : (state?.memories || []).filter(heartSymptom)
  .map(text => state.memoryMeta?.[text]?.keptAt || state.memoryMeta?.[text]?.at).filter(Boolean).sort()[0] || null;
export function memoryCheck(state, date = localToday(), { trainedOn = null } = {}) {
  if (state?.memoryOff) return null;
  const trained = trainedOn && (state.memories || []).find(text => heartSymptom(text) && trainedOn > (state.memoryMeta?.[text]?.keptAt || state.memoryMeta?.[text]?.at || date));
  if (trained) return { id: 'memory:trained:' + trainedOn + ':' + trained, kind: 'memory_check', memory: trained, headline: L('Objevilo se to i na tréninku?', 'Did it come back during training?'), reasons: [trained], message: null };
  const due = memoryList(state).filter(m => m.check && m.check <= date).sort((a, b) => a.check.localeCompare(b.check))[0];
  const headline = heartSymptom(due?.text) ? L('Trvají ty potíže pořád?', 'Are the symptoms still there?') : L('Platí to pořád?', 'Is this still true?');
  return due ? { id: 'memory:' + due.check + ':' + due.text, kind: 'memory_check', memory: due.text, headline, reasons: [due.text], message: null } : null;
}
// Nemoc or Zranění without an end day: after 3 days of Nemoc, 7 of Zranění,
// the coach asks whether the athlete is better, again every 3 or 7 days until
// they answer (audit 2026-11-07, point 3). "Not yet" dismisses this round.
const STATUS_CHECK_DAYS = { sick: 3, injured: 7 };
export function statusCheck(state, date = localToday()) {
  const every = STATUS_CHECK_DAYS[state?.status], from = sickStart(state || {});
  if (!every || state.statusUntil || !from) return null;
  const days = Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5);
  const id = 'status:' + state.status + ':' + from + ':' + Math.floor(days / every);
  if (days < every || (state.dismissed || []).includes(id)) return null;
  const sick = state.status === 'sick';
  return { id, kind: 'status_check', status: state.status, headline: sick ? L('Je ti už líp?', 'Feeling better?') : L('Jak je na tom zranění?', 'How is the injury?'),
    reasons: [sick ? L(`Nemoc máš zapnutou ${days} ${days < 5 ? 'dny' : 'dní'}.`, `You have had Sick on for ${days} days.`) : L(`Zranění máš zapnuté ${days} dní.`, `You have had Injured on for ${days} days.`)],
    message: L('Až budeš zase v pořádku, vrátím tě k tréninku, první dny lehčeji.', 'Once you are fine again I will bring you back to training, easier for the first days.') };
}
// The stations that do not work now: the gym plan, swaps and the coach leave them out.
export const brokenStations = (state, date = localToday()) => state?.memoryOff ? [] : [...new Set((state?.memories || [])
  .map(text => state.memoryMeta?.[text]).filter(m => m?.station && m.check > date).map(m => m.station))];
// The muscle groups the athlete wants trained more for a while.
export const focusGroups = (state, date = localToday()) => state?.memoryOff ? [] : [...new Set((state?.memories || [])
  .map(text => state.memoryMeta?.[text]).filter(m => m?.muscles?.length && m.check > date).flatMap(m => m.muscles))];
// The day each Health memory was told or last confirmed with "Still true",
// so the coach sees a knee pain from six weeks ago as old (audit 4.6).
export const healthMemorySince = state => state?.memoryOff ? [] : memoryList(state).filter(m => m.group === 'health')
  .map(m => ({ text: m.text, since: state.memoryMeta?.[m.text]?.keptAt || m.since })).filter(m => m.since);
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
// What the coach's answer saves from the athlete's own words: at most three
// short new memories, each with its group (Training when it gave none).
export function memorySaves(proposed, memories = []) {
  const known = new Set(memories), saves = [];
  for (const s of Array.isArray(proposed?.save) ? proposed.save : []) {
    const text = clean(s?.text).slice(0, 200);
    if (text && !known.has(text) && !saves.some(x => x.text === text)) saves.push({ text, group: validGroup(s?.group) || 'training', ...(knownStation(s?.station) ? { station: s.station, until: validDay(s?.until) ? s.until : null } : muscleIds(s?.muscles).length ? { muscles: muscleIds(s.muscles), until: validDay(s?.until) ? s.until : null } : {}) });
  }
  return saves.slice(0, 3);
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
  if (state?.status && state.status !== 'active') throw new Error(L('Máš nastavený stav ' + { sick: 'Nemoc', injured: 'Zranění', on_break: 'Pauza' }[state.status] + '. Trénink navrhnu, až ho přepneš na Aktivní. Zatím můžeš s AI probrat odpočinek nebo svá omezení.', 'Your status is ' + { sick: 'Sick', injured: 'Injured', on_break: 'Rest' }[state.status] + '. I\'ll suggest training once you switch it to Active. Until then, you can talk to AI about rest or your limitations.'));
}
// A single bad value cannot diagnose illness or injury. Only suggest a break,
// based on multiple recent signals, and always let the athlete decide.
export function proactiveAdvice({ date, fitness = {}, health = {}, week = {}, state = {}, readiness = null }) {
  if (state.status !== 'active') return null;
  // HRV and resting HR from the watch where Intervals.icu has none: without
  // Intervals the form rows carry only the load (own-fitness.js). With the
  // day's readiness (readiness.js) its HRV and resting HR with their normal
  // win, the numbers Today and the Health detail show.
  const c = readiness?.components || {}, part = x => (x && x.value != null && x.baseline != null ? { value: x.value, usual: x.baseline } : null);
  const body = readiness ? { hrv: part(c.hrv), restingHR: part(c.restingHR) } : null;
  const signals = reflectionSignals({ date, wellness: fillWellness(fitness.wellness || [], health.wellness || []), sleep: health.sleep || [], body }).filter(s => ['sleep_short', 'hrv_low', 'rhr_high', 'tsb_low', 'tsb_chronic'].includes(s.id));
  if (signals.length < 2) return null;
  const id = date + ':recovery';
  if (state.dismissed?.includes(id)) return null;
  const remaining = (week.days || []).filter(d => d.date >= date).flatMap(d => (d.daily?.training?.planned || []).filter(a => !/nutrition/i.test(a.name || '')).map(a => ({ date: d.date, id: a.id, name: a.name })));
  return { id, status: 'on_break', headline: L('Více ukazatelů dnes naznačuje slabší regeneraci. Zvážíš pauzu?', 'Several metrics suggest weaker recovery today. Would you consider a break?'), reasons: signals.map(s => s.text), remaining, message: remaining.length ? L('Tento týden tě ještě ' + plural(remaining.length, 'čeká', 'čekají', 'čeká') + ' ' + remaining.length + ' ' + plural(remaining.length, 'trénink', 'tréninky', 'tréninků') + '. ' + (remaining.length === 1 ? 'Můžeme ho zkrátit nebo nahradit odpočinkem.' : 'Můžeme je zkrátit nebo některý nahradit odpočinkem.'), 'You have ' + remaining.length + ' more ' + plural(remaining.length, '', '', '', 'workout', 'workouts') + ' this week. ' + (remaining.length === 1 ? 'We can shorten it or swap it for rest.' : 'We can shorten them or swap one for rest.')) : L('Můžeme upravit další dny podle tvých možností.', 'We can adjust the coming days to what works for you.') };
}
