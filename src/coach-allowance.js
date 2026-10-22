// The weekly allowance of messages to the coach (audit/aurin-pro-ai-limity-plan-2026-10-18.md).
// Every answered message the user writes to the coach counts; food sentences,
// generated plans, buttons and failed answers do not. The week is Monday to
// Sunday in the user's time and a new one starts on Monday at midnight.
// - A conversation started within WORKOUT_CHAT_HOURS after the end of a
//   workout counts as one message up to COACH_WORKOUT_CHAT_MESSAGES messages;
//   any further one counts as usual.
// - Once the allowance is used up, a conversation still going on gets
//   COACH_EXTRA_MESSAGES more, so it does not stop mid-thought.
// - A new account of someone who deleted their account this week starts with
//   the messages the deleted one used (coach_carryover, ai-limit-memory.js).
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

// Kept with the accounts (central database), as it is written when an account is created.
export async function ensureCoachCarryover(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS coach_carryover (user_id INTEGER PRIMARY KEY, week TEXT NOT NULL, used INTEGER NOT NULL)').run();
}

// The messages this week that a deleted account of the same person used.
async function carriedOver(env, week) {
  await ensureCoachCarryover(env.DB);
  const row = await env.DB.prepare('SELECT used FROM coach_carryover WHERE user_id = ? AND week = ?').bind(env.USER_ID, week).first();
  return Number(row?.used) || 0;
}

// { limit, used, left, resetsOn, near } for this week; null when there is none.
export async function coachAllowance(env, today = localToday()) {
  if (!tracked(env)) return null;
  await ensure(env.DB);
  const week = mondayOfDate(today), limit = coachWeeklyMessages(env);
  const row = await env.DB.prepare('SELECT COUNT(*) AS used FROM coach_messages WHERE user_id = ? AND week = ? AND counted = 1').bind(env.USER_ID, week).first();
  const used = (Number(row?.used) || 0) + await carriedOver(env, week), left = Math.max(0, limit - used);
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

// Whether the next message may go and how it will count, without taking it.
// Throws (status 429, coachAllowance) when the week's messages are used up.
export async function checkCoachMessage(env, chatId, { today = localToday(), now = Date.now() } = {}) {
  const allowance = await coachAllowance(env, today);
  if (!allowance) return null;
  const { chat, kind } = await nextKind(env, chatId, today, now);
  if (kind === 'workout-free' || allowance.left > 0) return { kind, before: allowance };
  if (chat && chat.last > now - RUNNING_MINUTES * 60000 && chat.extras < coachExtraMessages(env)) return { kind: 'extra', before: allowance };
  const error = new Error(L('Zprávy koučovi na tento týden jsou vyčerpané.', 'Your coach messages for this week are used up.'));
  Object.assign(error, { limit: true, status: 429, coachAllowance: { ...allowance, exhausted: true } });
  throw error;
}

const storedKind = kind => kind === 'workout-free' ? 'workout' : kind;
const countedKind = kind => kind === 'message' || kind === 'workout' ? 1 : 0;

// Before the coach is asked: the message is taken from the allowance in one
// statement whose condition is the limit itself, so messages sent at once
// cannot all pass a count none of them is in yet. A row whose answer failed is
// given back (releaseCoachMessage); one left by a Worker that died stays.
export async function claimCoachMessage(env, chatId, { today = localToday(), now = Date.now() } = {}) {
  const week = mondayOfDate(today), chat = Number(chatId) > 0 ? Number(chatId) : null;
  for (let attempt = 0; ; attempt++) {
    const claim = await checkCoachMessage(env, chatId, { today, now });
    if (!claim) return null;
    const kind = storedKind(claim.kind), counted = countedKind(claim.kind);
    const [condition, ...values] = counted
      ? ['SELECT COUNT(*) FROM coach_messages WHERE user_id = ? AND week = ? AND counted = 1', env.USER_ID, week, coachWeeklyMessages(env) - await carriedOver(env, week)]
      : claim.kind === 'extra'
        ? ["SELECT COUNT(*) FROM coach_messages WHERE user_id = ? AND week = ? AND chat_id = ? AND kind = 'extra'", env.USER_ID, week, chat, coachExtraMessages(env)]
        : ['SELECT COUNT(*) FROM coach_messages WHERE user_id = ? AND week = ? AND chat_id = ?', env.USER_ID, week, chat, coachWorkoutChatMessages(env)];
    const row = await env.DB.prepare(`INSERT INTO coach_messages (user_id, week, chat_id, kind, counted) SELECT ?, ?, ?, ?, ? WHERE (${condition}) < ? RETURNING id`)
      .bind(env.USER_ID, week, chat, kind, counted, ...values).first();
    if (row?.id) return { ...claim, id: row.id };
    // Another message took the last one in between: ask again how this one counts.
    if (attempt >= 2) throw Object.assign(new Error(L('Zprávy koučovi na tento týden jsou vyčerpané.', 'Your coach messages for this week are used up.')), { limit: true, status: 429, coachAllowance: { ...await coachAllowance(env, today), exhausted: true } });
  }
}

// The answer failed before it was logged: the message is not counted.
export async function releaseCoachMessage(env, claim) {
  if (!tracked(env) || !claim?.id || claim.recorded) return;
  await env.DB.prepare('DELETE FROM coach_messages WHERE id = ? AND user_id = ?').bind(claim.id, env.USER_ID).run();
}

// After the coach answered: the message is logged under its chat. Returns the
// allowance to show, with `notice` on the message that crossed into the last
// quarter and `more: false` once not even this conversation can go on (the
// app then shows the used-up card instead of waiting for a refused message).
export async function recordCoachMessage(env, chatId, claim, { today = localToday(), now = Date.now() } = {}) {
  if (!tracked(env) || !claim) return null;
  const before = claim.before || await coachAllowance(env, today), chat = Number(chatId) > 0 ? Number(chatId) : null;
  // A claim without a row (its read failed) is logged here, as before.
  if (claim.id) await env.DB.prepare('UPDATE coach_messages SET chat_id = ?, created_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(chat, claim.id, env.USER_ID).run();
  else await env.DB.prepare('INSERT INTO coach_messages (user_id, week, chat_id, kind, counted) VALUES (?, ?, ?, ?, ?)')
    .bind(env.USER_ID, mondayOfDate(today), chat, storedKind(claim.kind), countedKind(claim.kind)).run();
  claim.recorded = true;
  const after = await coachAllowance(env, today);
  const more = await checkCoachMessage(env, chatId, { today, now }).then(() => true, () => false);
  return { ...after, notice: !before.near && after.near, more };
}
