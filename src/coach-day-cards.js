// The coach's "Ranní odpověď" and "Pocit z tréninku" cards (gaps 5 and 9 of
// the coach audit; Petr 2026-11-28 "Ano, podle návrhu").
// "Vlastně jsem dnes unavený" changes today's morning answer as Today's
// three answers do (morning-checkin.js): the day's advice follows it, the
// readiness never does. "Ta jízda byla těžká, 8 z 10" rates a done activity
// the coach was shown, as the activity's detail does for a session not paired
// with a plan: the coach's note of that day with its RPE (coach-reflection.js),
// which the coach and the day's advice read. Vrátit puts each back.
import { L } from './lang.js';
import { getCheckin, saveCheckin } from './morning-checkin.js';

const FEELINGS = ['fresh', 'normal', 'tired'];
const NAMES = () => L({ fresh: 'Svěží', normal: 'Normál', tired: 'Unavený' }, { fresh: 'Fresh', normal: 'Normal', tired: 'Tired' });
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export const feelingName = feeling => NAMES()[feeling] || feeling;

// Today's answer, only when it changes.
export function checkFeeling(a, context = {}, reason, today) {
  if (!FEELINGS.includes(a.feeling)) return [];
  const from = FEELINGS.includes(context.today?.feeling) ? context.today.feeling : null;
  if (from === a.feeling) return [];
  return [{ type: 'feeling', feeling: a.feeling, from, date: today, reason }];
}

// The done activities the coach was shown today and yesterday, with their day.
function doneActivities(context, today) {
  const out = new Map(), days = [today, addDays(today, -1)];
  const add = (list, date) => { for (const x of Array.isArray(list) ? list : []) if (x?.id != null && !out.has(String(x.id))) out.set(String(x.id), { ...x, date }); };
  add(context.today?.training?.completed, today);
  for (const d of context.week || []) if (days.includes(d?.date)) { add(d.completed, d.date); add(d.daily?.training?.completed, d.date); }
  return out;
}

// RPE 1 to 10 of a done activity of today or yesterday.
export function checkEffort(a, context = {}, reason, today) {
  const activity = doneActivities(context, today).get(String(a.activityId || '')), rpe = Number(a.rpe);
  if (!activity || !Number.isInteger(rpe) || rpe < 1 || rpe > 10) return [];
  const name = String(activity.name || activity.type || '').slice(0, 120);
  return [{ type: 'effort', activityId: String(activity.id), activityName: name, date: activity.date, ...(/^\d\d:\d\d$/.test(String(activity.start || '')) ? { time: activity.start } : {}), rpe, reason }];
}

const dayLabel = date => date.slice(8, 10).replace(/^0/, '') + '. ' + date.slice(5, 7).replace(/^0/, '') + '.';
export const feelingSummary = a => L('Ranní odpověď: ', 'Morning answer: ') + feelingName(a.feeling) + (a.from ? L(' místo ', ' instead of ') + feelingName(a.from) : '');
export const effortSummary = a => L('Pocit z tréninku: ', 'Workout effort: ') + a.activityName + ' (' + dayLabel(a.date) + (a.time ? ', ' + a.time : '') + ') ' + a.rpe + L(' z 10', ' of 10');

export async function applyFeeling(env, a, meta) {
  const before = await getCheckin(env.DB, a.date);
  await saveCheckin(env.DB, a.date, a.feeling);
  const { rememberChange } = await import('./activity-chat-edits.js');
  const undo = await rememberChange(env, { kind: 'feeling', date: a.date, before, after: a.feeling, ...meta });
  return { status: 'ok', date: a.date, feeling: a.feeling, undo };
}

// record({date, workoutId, rpe}) stores the day's note as the detail's Uložit does.
export async function applyEffort(env, a, meta, record) {
  await record({ date: a.date, workoutId: a.activityId, rpe: a.rpe });
  const row = await env.DB.prepare('SELECT id FROM coach_reflections WHERE user_id = ? AND date = ? AND workout_id = ? ORDER BY id DESC LIMIT 1').bind(env.USER_ID, a.date, a.activityId).first();
  const { rememberChange } = await import('./activity-chat-edits.js');
  const undo = await rememberChange(env, { kind: 'effort', reflectionId: row?.id ?? null, date: a.date, ...meta });
  return { status: 'ok', date: a.date, activityId: a.activityId, rpe: a.rpe, undo };
}

// Vrátit: the answer as it was, only while it is still the card's; the rating's note gone.
export async function undoDayCard(env, change, fail) {
  if (change.kind === 'feeling') {
    if (await getCheckin(env.DB, change.date) !== change.after) throw fail(L('Odpověď se od té změny upravila, vrátit ji už nejde.', 'The answer has changed since, it can no longer be undone.'));
    await saveCheckin(env.DB, change.date, change.before ?? null);
    return { date: change.date, feeling: change.before ?? null };
  }
  if (change.reflectionId != null) await env.DB.prepare('DELETE FROM coach_reflections WHERE id = ? AND user_id = ?').bind(change.reflectionId, env.USER_ID).run();
  return { date: change.date };
}
