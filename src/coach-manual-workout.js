// The coach's "Zapsat trénink" card (gap 8 of the coach audit; Petr 2026-11-28
// "Ano, podle návrhu"): "Jel jsem hodinu na trenažeru" logs a done workout the
// watch did not record, the way Plus → Log workout does (POST
// /app/api/workouts/manual): Intervals.icu and Google Health from the server,
// Apple Health from the app with the returned activityKey. When a watch's
// record is already in that time, nothing new is logged. Vrátit deletes it
// from Aurin and Intervals.icu (activity-edits.js deleteActivity) and the app
// takes its Apple Health copy away.
import { L } from './lang.js';
import { zonedTime } from './user-time.js';
import { manualWorkoutType, activityTypes } from './activity-type.js';
import { watchWorkoutIn } from './manual-heart-rate.js';

const SPORTS = ['ride', 'run', 'swim', 'gym'];
const NAMES = () => L({ ride: 'Jízda', run: 'Běh', swim: 'Plavání', gym: 'Posilovna' }, { ride: 'Ride', run: 'Run', swim: 'Swim', gym: 'Gym' });
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const minutesOf = clock => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

// The done activities of a day the coach was shown, with their clock times.
function doneOn(context, date) {
  const lists = date === context.date ? [context.today?.training?.completed] : [];
  for (const d of context.week || []) if (d?.date === date) lists.push(d.completed, d.daily?.training?.completed);
  return lists.flatMap(list => Array.isArray(list) ? list : []);
}

// The card, or none: a sport the log takes, today or the last 7 days, already
// over (not later today), 5 to 600 minutes, and no activity already in that time.
export function checkActivityLog(a, context = {}, reason, today) {
  const sport = SPORTS.includes(a.sport) ? a.sport : a.otherType ? 'other' : null;
  const type = sport && manualWorkoutType(sport, a.otherType || null);
  if (!type || sport === 'other' && type !== a.otherType) return [];
  const minutes = Number(a.minutes), time = String(a.time || '');
  if (!DAY.test(String(a.date || '')) || a.date > today || a.date < addDays(today, -7)) return [];
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 600 || !TIME.test(time)) return [];
  const from = minutesOf(time), to = from + minutes, now = String(context.now || '').slice(11, 16);
  if (a.date === today && TIME.test(now) && to > minutesOf(now)) return [];
  // An activity in at least half of that time is the same workout: no second one.
  const overlaps = doneOn(context, a.date).some(x => TIME.test(String(x.start || '')) && TIME.test(String(x.end || ''))
    && Math.min(to, minutesOf(x.end)) - Math.max(from, minutesOf(x.start)) >= Math.min(minutes, minutesOf(x.end) - minutesOf(x.start)) / 2);
  if (overlaps) return [];
  const name = sport === 'other' ? activityTypes().find(t => t.type === type)?.name || type : NAMES()[sport];
  return [{ type: 'activity_log', sport, ...(sport === 'other' ? { otherType: type } : {}), activityName: name, date: a.date, time, minutes, reason }];
}

export const activityLogSummary = a => L('Zapsat trénink: ', 'Log a workout: ') + a.activityName + ' ' + a.minutes + ' min (' + a.date.slice(8, 10).replace(/^0/, '') + '. ' + a.date.slice(5, 7).replace(/^0/, '') + '., ' + a.time + ')';

// A confirmed card. post(body) is POST /app/api/workouts/manual (its JSON); the
// result carries what the app writes to Apple Health and the Vrátit token.
export async function applyActivityLog(env, a, meta, post) {
  const start = zonedTime(a.date + 'T' + a.time + ':00');
  if (!Number.isFinite(start)) throw new Error(L('Neplatný čas tréninku.', 'Invalid workout time.'));
  const window = { start: new Date(start).toISOString(), end: new Date(start + a.minutes * 60000).toISOString() };
  const watch = await watchWorkoutIn(env.DB, env.USER_ID, window).catch(() => null);
  if (watch) throw new Error(L('V tu dobu už je záznam z hodinek, trénink podruhé nezapisuji.', 'A watch record is already there at that time, so the workout isn\'t logged twice.'));
  const saved = await post({ name: a.activityName, date: a.date, sport: a.sport, type: a.otherType || null, minutes: a.minutes, completed: true, time: a.time, ...window, requestId: 'coach-log-' + (meta.draftId || Date.now()) });
  const localId = String(saved.eventId || '').replace(/^planned:/, '');
  const { rememberChange } = await import('./activity-chat-edits.js');
  const undo = await rememberChange(env, { kind: 'manual', id: 'activity:' + localId, activityKey: saved.activityKey || null, ...meta });
  return { status: 'ok', id: 'activity:' + localId, type: saved.type, activityKey: saved.activityKey || null, sends: saved.sends || [], start: window.start, undo };
}
