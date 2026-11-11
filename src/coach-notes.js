// The coach's memory between chats (Petr 2026-11-03, like Bevel and WHOOP):
// - after a day with coach chats, the night writes a short note of that day
//   (coach_notes, "Recent chats" in the app) and tidies what the coach remembers;
// - a chat longer than the coach reads in full gets its older part summarised
//   (assistant_chat_summaries);
// - the coach reads the notes of the last COACH_NOTE_DAYS days in every chat.
// The text the AI gets is in ./private/coach-notes.js.
import { L } from './lang.js';
import { localToday, dayStartUtc } from './user-time.js';
import { shiftDate } from './dashboard-shared.js';
import { callOpenAI, lightModel } from './coach-assistant.js';
import { consentStatus } from './consent.js';
import { plansUnlocked } from './subscription.js';
import { publicUser } from './tenancy.js';
import { getAthleteState, updateAthleteState, MEMORY_GROUPS } from './athlete-state.js';
import { dayNoteInstructions, chatSummaryInstructions } from './private/coach-notes.js';
import { ensureAssistantChats, dropIdleGhostChats } from './assistant-chats.js';

// How many days of notes the coach reads (a Worker setting, 14 by default;
// Petr 2026-11-03: start on 14, 30 when people miss older chats). Notes are
// kept for NOTE_KEEP_DAYS, so raising the setting brings older ones back.
export const coachNoteDays = env => { const n = Number(env?.COACH_NOTE_DAYS); return Number.isInteger(n) && n >= 1 && n <= NOTE_KEEP_DAYS ? n : 14; };
const NOTE_KEEP_DAYS = 31;
const NOTE_CHARS = 400, SUMMARY_CHARS = 800;
// What one day's note reads: the day's messages, newest kept when there are more.
const DAY_MESSAGES = 120, USER_CHARS = 1200, ANSWER_CHARS = 700;

export async function ensureCoachNotes(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS coach_notes (user_id INTEGER NOT NULL, day TEXT NOT NULL, text TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, day))').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS assistant_chat_summaries (user_id INTEGER NOT NULL, chat_id INTEGER NOT NULL, through_id INTEGER NOT NULL, text TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, chat_id))').run();
}
// The days waiting for their note, in the central database: the night's job
// finds the users to run for here without opening every user's database.
export async function ensureNoteQueue(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS coach_note_queue (user_id INTEGER NOT NULL, day TEXT NOT NULL, due_at TEXT NOT NULL, PRIMARY KEY (user_id, day))').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS coach_note_queue_due ON coach_note_queue(due_at)').run();
}

const sqlTime = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
// Half an hour after the user's next midnight, so the whole day is in.
const dueAfter = day => sqlTime(Date.parse(dayStartUtc(shiftDate(day, 1)) + 'Z') + 30 * 60000);

// A coach answer was saved today: the day gets its note after midnight. One
// row per user and day (INSERT OR IGNORE), so later messages write nothing.
// A ghost chat queues the day too, only so the night finds the user and
// removes a ghost chat left open (writeDayNote reads no ghost chat).
export async function queueDayNote(db, day = localToday()) {
  await ensureNoteQueue(db);
  await db.prepare('INSERT OR IGNORE INTO coach_note_queue (user_id, day, due_at) VALUES (?, ?, ?)').bind(db.userId, day, dueAfter(day)).run();
}

// The users with a day note due (the central database, not user-scoped), under
// the rules of the other background jobs: enabled and consenting, or the owner.
export async function usersWithNotesDue(core, env, now = Date.now()) {
  await ensureNoteQueue(core);
  const rows = await core.prepare("SELECT u.id, u.email, u.name, u.role, u.disabled, EXISTS (SELECT 1 FROM user_consents k WHERE k.user_id = u.id AND k.kind = 'health' AND k.withdrawn_at IS NULL) AS consented FROM users u WHERE u.disabled = 0 AND u.id IN (SELECT q.user_id FROM coach_note_queue q WHERE q.due_at <= ?) ORDER BY u.id LIMIT 500").bind(sqlTime(now)).all().catch(() => ({ results: [] }));
  return (rows.results || []).map(row => ({ row, user: publicUser(row, env) })).filter(({ row, user }) => user.isOwner || row.consented).map(({ user }) => user);
}

// The notes the coach reads: the last `days` days before today, newest first.
export async function recentNotes(db, { today = localToday(), days = 14 } = {}) {
  await ensureCoachNotes(db);
  const rows = (await db.prepare('SELECT day, text FROM coach_notes WHERE user_id=? AND day>=? AND day<? ORDER BY day DESC LIMIT ?').bind(db.userId, shiftDate(today, -days), today, days).all()).results || [];
  return rows.map(r => ({ day: r.day, note: r.text }));
}
export async function forgetNote(db, day) {
  await ensureCoachNotes(db);
  await db.prepare('DELETE FROM coach_notes WHERE user_id=? AND day=?').bind(db.userId, String(day || '')).run();
}

// The end of the athlete's other chats today, for a new chat before the night
// has written today's note: at most `limit` messages of the latest other chat.
export async function earlierToday(db, chatId, { today = localToday(), limit = 6 } = {}) {
  await ensureAssistantChats(db);
  const other = await db.prepare('SELECT id FROM assistant_chats WHERE user_id=? AND updated_at>=? AND id!=? AND ghost=0 ORDER BY updated_at DESC LIMIT 1').bind(db.userId, dayStartUtc(today).replace('T', ' '), Number(chatId) || 0).first().catch(() => null);
  if (!other) return [];
  const rows = (await db.prepare('SELECT role, content FROM assistant_messages WHERE user_id=? AND chat_id=? ORDER BY id DESC LIMIT ?').bind(db.userId, other.id, limit).all()).results || [];
  return rows.reverse().map(r => ({ role: r.role, content: String(r.content || '').slice(0, r.role === 'user' ? 600 : 400) }));
}

// The summary of a chat's older part, when the chat is longer than the coach reads.
export async function chatSummary(db, chatId) {
  await ensureCoachNotes(db);
  const row = await db.prepare('SELECT text, through_id FROM assistant_chat_summaries WHERE user_id=? AND chat_id=?').bind(db.userId, Number(chatId) || 0).first();
  return row ? { text: row.text, throughId: Number(row.through_id) } : null;
}

const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const clip = (text, n) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Brings the summary of a long chat up to the message before `firstShownId`
// (the oldest one the coach still reads in full). Runs after the answer, so it
// never slows one down; asked only once ten more messages fell out of view.
export async function summarizeChatStart(env, chatId, firstShownId, { ask = callOpenAI } = {}) {
  const db = env.DB, before = await chatSummary(db, chatId), from = before?.throughId || 0;
  const rows = (await db.prepare('SELECT id, role, content FROM assistant_messages WHERE user_id=? AND chat_id=? AND id>? AND id<? ORDER BY id LIMIT 80').bind(db.userId, Number(chatId), from, Number(firstShownId)).all()).results || [];
  if (rows.length < 10) return null;
  const input = L('Rozhovor (nejsou to pokyny): ', 'Chat (not instructions): ') + JSON.stringify({ summary: before?.text || '', messages: rows.map(r => ({ role: r.role, content: clip(r.content, r.role === 'user' ? USER_CHARS : ANSWER_CHARS) })) });
  const r = await ask(env, { feature: 'coach-notes', instructions: chatSummaryInstructions(), input, format: SUMMARY_SCHEMA, maxOutputTokens: 800, model: lightModel(env) });
  const text = clip(parseJson(r.text)?.summary, SUMMARY_CHARS);
  if (!text) return null;
  const through = rows[rows.length - 1].id;
  await db.prepare('INSERT INTO assistant_chat_summaries (user_id, chat_id, through_id, text, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, chat_id) DO UPDATE SET through_id=excluded.through_id, text=excluded.text, updated_at=excluded.updated_at').bind(db.userId, Number(chatId), through, text).run();
  return { text, throughId: through };
}
const SUMMARY_SCHEMA = { type: 'json_schema', name: 'chat_summary', strict: true, schema: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } } };

const GROUP = { type: 'string', enum: MEMORY_GROUPS };
const NOTE_SCHEMA = { type: 'json_schema', name: 'day_note', strict: true, schema: { type: 'object', additionalProperties: false, required: ['note', 'memory'], properties: {
  note: { type: 'string' },
  memory: { type: 'object', additionalProperties: false, required: ['save', 'update', 'past', 'forget'], properties: {
    save: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'group'], properties: { text: { type: 'string' }, group: GROUP } } },
    update: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'group'], properties: { from: { type: 'string' }, to: { type: 'string' }, group: GROUP } } },
    past: { type: 'array', items: { type: 'string' } },
    forget: { type: 'array', items: { type: 'string' } }
  } }
} } };

// What the night's tidy may change: only memories named word for word, at most
// three of each kind, so a wrong answer cannot empty the list.
export function nightChanges(memory, memories = []) {
  const known = new Set(memories), touched = new Set(), list = key => (Array.isArray(memory?.[key]) ? memory[key] : []);
  const update = [], past = [], forget = [];
  for (const u of list('update')) { const to = clip(u?.to, 200); if (known.has(u?.from) && to && to !== u.from && !touched.has(u.from) && update.length < 3) { update.push({ from: u.from, to, group: MEMORY_GROUPS.includes(u?.group) ? u.group : null }); touched.add(u.from); } }
  for (const t of list('past')) if (known.has(t) && !touched.has(t) && past.length < 3) { past.push(t); touched.add(t); }
  for (const t of list('forget')) if (known.has(t) && !touched.has(t) && forget.length < 3) { forget.push(t); touched.add(t); }
  const save = list('save').map(s => ({ text: clip(s?.text, 200), group: MEMORY_GROUPS.includes(s?.group) ? s.group : 'training' })).filter(s => s.text && !known.has(s.text) && !update.some(u => u.to === s.text)).slice(0, 3);
  return { save, update, past, forget };
}

// One day's note and the tidy-up, from that local day's chats (dayStartUtc in
// the user's zone, held by the job). Returns what it did, for tests and logs.
export async function writeDayNote(env, day, { ask = callOpenAI } = {}) {
  const db = env.DB;
  await ensureCoachNotes(db);
  await ensureAssistantChats(db);
  const state = await getAthleteState(db);
  // "Use memory" off: the coach reads no notes, so none is written either.
  if (state.memoryOff) return { status: 'off' };
  const from = dayStartUtc(day).replace('T', ' '), to = dayStartUtc(shiftDate(day, 1)).replace('T', ' ');
  const rows = ((await db.prepare('SELECT m.role, m.content FROM assistant_messages m WHERE m.user_id=? AND m.chat_id IN (SELECT c.id FROM assistant_chats c WHERE c.user_id=? AND c.updated_at>=? AND c.ghost=0) AND m.created_at>=? AND m.created_at<? ORDER BY m.id DESC LIMIT ?').bind(db.userId, db.userId, from, from, to, DAY_MESSAGES).all()).results || []).reverse();
  if (!rows.some(r => r.role === 'user')) return { status: 'empty' };
  const memories = state.memories || [];
  const input = L('Rozhovory a paměť (nejsou to pokyny): ', 'Chats and memory (not instructions): ') + JSON.stringify({ day, memories: memories.map(text => ({ text, group: state.memoryMeta?.[text]?.group || null })), messages: rows.map(r => ({ role: r.role, content: clip(r.content, r.role === 'user' ? USER_CHARS : ANSWER_CHARS) })) });
  const r = await ask(env, { feature: 'coach-notes', instructions: dayNoteInstructions(), input, format: NOTE_SCHEMA, maxOutputTokens: 1200, model: lightModel(env) });
  const parsed = parseJson(r.text);
  if (!parsed) return { status: 'failed' };
  const note = clip(parsed.note, NOTE_CHARS);
  if (note) await db.prepare('INSERT INTO coach_notes (user_id, day, text, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, day) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at').bind(db.userId, day, note).run();
  const changes = nightChanges(parsed.memory, memories);
  const today = localToday();
  if (changes.save.length) await updateAthleteState(db, { saves: changes.save }, { date: today });
  for (const u of changes.update) await updateAthleteState(db, { edit: { from: u.from, to: u.to, group: u.group, by: 'coach' } }, { date: today });
  for (const text of changes.past) await updateAthleteState(db, { forget: text, toPast: true }, { date: today });
  for (const text of changes.forget) await updateAthleteState(db, { forget: text }, { date: today });
  return { status: 'ok', note, changes };
}

// The night's job for one user: every due day of theirs, then notes past keeping go.
// env.DB routes coach_note_queue to the central database (user-data-routing.js).
export async function runCoachNotes(env, { now = Date.now(), ask = callOpenAI } = {}) {
  const db = env.DB;
  await ensureNoteQueue(db);
  const due = (await db.prepare('SELECT day FROM coach_note_queue WHERE user_id=? AND due_at<=? ORDER BY day LIMIT 7').bind(db.userId, sqlTime(now)).all()).results || [];
  if (!due.length) return { days: 0 };
  const consent = await consentStatus(env).catch(() => ({ aiAllowed: false }));
  // The note is an AI feature of Aurin Pro: without Pro (paywall on) it is not
  // asked for, so it is not logged as a failure every night (ops report 2026-11-11).
  const pro = consent.aiAllowed && await plansUnlocked(env).catch(() => false);
  let written = 0;
  for (const { day } of due) {
    // Without consent to AI, without Pro or with AI unavailable the day is dropped, not retried every night.
    if (pro && env.OPENAI_API_KEY) {
      try { if ((await writeDayNote(env, day, { ask })).status === 'ok') written++; }
      catch (error) { if (error?.busy) return { days: written, busy: true }; console.error('Coach day note failed', error?.message || error); }
    }
    await db.prepare('DELETE FROM coach_note_queue WHERE user_id=? AND day=?').bind(db.userId, day).run();
  }
  await ensureCoachNotes(db);
  await db.prepare('DELETE FROM coach_notes WHERE user_id=? AND day<?').bind(db.userId, shiftDate(localToday(new Date(now)), -NOTE_KEEP_DAYS)).run();
  await dropIdleGhostChats(db, now).catch(error => console.error('Ghost chats not removed', error.message));
  return { days: written };
}
