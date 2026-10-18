// The weekly allowance of messages to the coach (audit/aurin-pro-ai-limity-plan-2026-10-18.md).
// Every answered message the user writes to the coach counts; food sentences,
// generated plans, buttons and failed answers do not. The week is Monday to
// Sunday in the user's time and a new one starts on Monday at midnight.
// - A conversation started within WORKOUT_CHAT_HOURS after the end of a
//   workout counts as one message up to COACH_WORKOUT_CHAT_MESSAGES messages;
//   any further one counts as usual.
// - Once the allowance is used up, a conversation still going on gets
//   COACH_EXTRA_MESSAGES more, so it does not stop mid-thought.
// The owner has no allowance. The numbers are Worker settings (wrangler.jsonc).
import { L } from './lang.js';
import { localToday } from './user-time.js';
import { mondayOfDate, shiftDate } from './dashboard-shared.js';
import { sessionOf } from './activity-match.js';

const n = (value, fallback) => { const v = Number(value); return value !== undefined && value !== null && value !== '' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback; };
export const coachWeeklyMessages = env => n(env.COACH_WEEKLY_MESSAGES, 30);
export const coachExtraMessages = env => n(env.COACH_EXTRA_MESSAGES, 2);
export const coachWorkoutChatMessages = env => n(env.COACH_WORKOUT_CHAT_MESSAGES, 5);
const WORKOUT_CHAT_HOURS = 3;
// A conversation counts as still going on while its last message is this recent.
const RUNNING_MINUTES = 30;
// The app says how many are left from 75 % on: 7 of 30, 4 of 15.
export const nearAt = limit => Math.floor(limit / 4 + 0.25);

const tracked = env => Boolean(env?.DB && Number(env.USER_ID) > 0) && env.USER_IS_OWNER !== true;
const sqlTime = text => Date.parse(String(text || '').replace(' ', 'T') + 'Z');

// kind: 'message' (counts), 'workout' (a conversation after a workout: its
// first message counts, the next ones up to the cap do not) or 'extra'.
async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS coach_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, week TEXT NOT NULL, chat_id INTEGER, kind TEXT NOT NULL, counted INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS coach_messages_user_week ON coach_messages(user_id, week)').run();
}

// { limit, used, left, resetsOn, near } for this week; null when there is none.
export async function coachAllowance(env, today = localToday()) {
  if (!tracked(env)) return null;
  await ensure(env.DB);
  const week = mondayOfDate(today), limit = coachWeeklyMessages(env);
  const row = await env.DB.prepare('SELECT COUNT(*) AS used FROM coach_messages WHERE user_id = ? AND week = ? AND counted = 1').bind(env.USER_ID, week).first();
  const used = Number(row?.used) || 0, left = Math.max(0, limit - used);
  return { limit, used, left, resetsOn: shiftDate(week, 7), near: left <= nearAt(limit) };
}

// This week's messages of one conversation: how many, what kind it started as,
// how many extra ones it had and when the last one was.
async function chatState(env, chatId, today) {
  if (!(Number(chatId) > 0)) return null;
  const rows = (await env.DB.prepare('SELECT kind, created_at FROM coach_messages WHERE user_id = ? AND week = ? AND chat_id = ? ORDER BY id')
    .bind(env.USER_ID, mondayOfDate(today), Number(chatId)).all()).results || [];
  if (!rows.length) return null;
  return { count: rows.length, workout: rows[0].kind === 'workout', extras: rows.filter(r => r.kind === 'extra').length, last: sqlTime(rows.at(-1).created_at) };
}

// The end of the last workout from the watches and services (health_datapoints), in ms.
export async function lastWorkoutEnd(env, now = Date.now()) {
  const from = new Date(now - 36 * 3600000).toISOString().slice(0, 10);
  const rows = (await env.DB.prepare("SELECT data_type, source_family, start_time, end_time, payload_json FROM health_datapoints WHERE user_id = ? AND data_type IN ('activity','exercise') AND start_time >= ? AND (record_role IS NULL OR record_role != 'duplicate')")
    .bind(env.USER_ID, from).all().catch(() => ({ results: [] }))).results || [];
  let last = null;
  for (const row of rows) {
    const s = sessionOf(row);
    const end = s && Number.isFinite(s.at) ? s.at + (Number(s.minutes) || 0) * 60000 : NaN;
    if (Number.isFinite(end) && end <= now && (last === null || end > last)) last = end;
  }
  return last;
}

// How the next message of this conversation would count.
async function nextKind(env, chatId, today, now) {
  const chat = await chatState(env, chatId, today);
  if (chat) return { chat, kind: chat.workout && chat.count < coachWorkoutChatMessages(env) ? 'workout-free' : 'message' };
  const end = await lastWorkoutEnd(env, now).catch(() => null);
  return { chat: null, kind: end !== null && now - end <= WORKOUT_CHAT_HOURS * 3600000 ? 'workout' : 'message' };
}

// Before the coach is asked: whether this message may go and how it will
// count. Throws (status 429, coachAllowance) when the week's messages are used up.
export async function claimCoachMessage(env, chatId, { today = localToday(), now = Date.now() } = {}) {
  const allowance = await coachAllowance(env, today);
  if (!allowance) return null;
  const { chat, kind } = await nextKind(env, chatId, today, now);
  if (kind === 'workout-free' || allowance.left > 0) return { kind };
  if (chat && chat.last > now - RUNNING_MINUTES * 60000 && chat.extras < coachExtraMessages(env)) return { kind: 'extra' };
  const error = new Error(L('Zprávy koučovi na tento týden jsou vyčerpané.', 'Your coach messages for this week are used up.'));
  Object.assign(error, { limit: true, status: 429, coachAllowance: { ...allowance, exhausted: true } });
  throw error;
}

// After the coach answered: the message is logged. Returns the allowance to
// show, with `notice` on the message that crossed into the last quarter and
// `more: false` once not even this conversation can go on (the app then
// shows the used-up card instead of waiting for a refused message).
export async function recordCoachMessage(env, chatId, claim, { today = localToday(), now = Date.now() } = {}) {
  if (!tracked(env) || !claim) return null;
  const before = await coachAllowance(env, today);
  const kind = claim.kind === 'workout-free' ? 'workout' : claim.kind, counted = claim.kind === 'message' || claim.kind === 'workout' ? 1 : 0;
  await env.DB.prepare('INSERT INTO coach_messages (user_id, week, chat_id, kind, counted) VALUES (?, ?, ?, ?, ?)')
    .bind(env.USER_ID, mondayOfDate(today), Number(chatId) > 0 ? Number(chatId) : null, kind, counted).run();
  const after = await coachAllowance(env, today);
  const more = await claimCoachMessage(env, chatId, { today, now }).then(() => true, () => false);
  return { ...after, notice: !before.near && after.near, more };
}
