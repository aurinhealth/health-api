// Chats with the AI assistant. Each chat keeps its own messages; the coach
// reads the last CONTEXT_MESSAGES of the chat it answers in, and what came
// before them and in other chats through the notes of coach-notes.js.
// Chats untouched for 90 days are removed when the list is read.
import { L } from './lang.js';
import { localToday } from './user-time.js';
import { shiftDate } from './dashboard-shared.js';
import { ensureCoachNotes, ensureNoteQueue } from './coach-notes.js';

// 60 messages are 30 questions with their answers, a whole week's allowance
// (Petr 2026-11-03); CONTEXT_CHARS keeps a chat of very long answers in check.
export const CONTEXT_MESSAGES = 60;
const KEEP_DAYS = 90, CONTEXT_CHARS = 60000, MAX_CONTENT = 16000;

export async function ensureAssistantChats(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS assistant_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS assistant_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}

export function chatTitle(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? text.slice(0, 57).replace(/\s+\S*$/, '') + '…' : text || L('Nový chat', 'New chat');
}

const validId = id => Number.isInteger(Number(id)) && Number(id) > 0;

export async function ownedChat(db, id) {
  if (!validId(id)) return null;
  return db.prepare('SELECT id,title,created_at,updated_at FROM assistant_chats WHERE user_id=? AND id=?').bind(db.userId, Number(id)).first();
}

// The last messages of the chat as context for the coach ([] for a new chat),
// newest kept within CONTEXT_CHARS. `firstId` is the oldest message read, so a
// longer chat knows where its summary has to reach (coach-notes.js).
export async function chatContext(db, chatId, { withIds = false } = {}) {
  await ensureAssistantChats(db);
  if (!await ownedChat(db, chatId)) return withIds ? { turns: [], firstId: null, more: false } : [];
  const rows = (await db.prepare('SELECT id,role,content FROM assistant_messages WHERE user_id=? AND chat_id=? ORDER BY id DESC LIMIT ?').bind(db.userId, Number(chatId), CONTEXT_MESSAGES + 1).all()).results || [];
  let chars = 0, kept = [];
  for (const r of rows.slice(0, CONTEXT_MESSAGES)) { chars += String(r.content || '').length; if (kept.length && chars > CONTEXT_CHARS) break; kept.push(r); }
  const turns = kept.reverse().map(r => ({ role: r.role, content: r.content }));
  if (!withIds) return turns;
  return { turns, firstId: kept[0]?.id ?? null, more: rows.length > kept.length };
}

// Store one question and its answer; a missing or foreign chat becomes a new one.
export async function appendChatTurn(db, chatId, message, answer) {
  await ensureAssistantChats(db);
  let chat = await ownedChat(db, chatId);
  if (!chat) {
    const created = await db.prepare('INSERT INTO assistant_chats(user_id,title) VALUES(?,?)').bind(db.userId, chatTitle(message)).run();
    chat = { id: created.meta?.last_row_id };
  }
  const insert = (role, content) => db.prepare('INSERT INTO assistant_messages(chat_id,user_id,role,content) VALUES(?,?,?,?)').bind(chat.id, db.userId, role, String(content || '').slice(0, MAX_CONTENT));
  await db.batch([insert('user', message), insert('assistant', answer), db.prepare('UPDATE assistant_chats SET updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?').bind(db.userId, chat.id)]);
  return chat.id;
}

export async function listChats(db, limit = 50) {
  await ensureAssistantChats(db);
  const old = (await db.prepare("SELECT id FROM assistant_chats WHERE user_id=? AND updated_at<datetime('now',?)").bind(db.userId, '-' + KEEP_DAYS + ' days').all()).results || [];
  for (const row of old) await deleteChat(db, row.id);
  const rows = (await db.prepare('SELECT c.id,c.title,c.updated_at,(SELECT COUNT(*) FROM assistant_messages m WHERE m.chat_id=c.id AND m.user_id=c.user_id) AS messages FROM assistant_chats c WHERE c.user_id=? ORDER BY c.updated_at DESC, c.id DESC LIMIT ?').bind(db.userId, limit).all()).results || [];
  return rows.map(r => ({ id: r.id, title: r.title, updatedAt: r.updated_at, messages: Number(r.messages) || 0 }));
}

export async function readChat(db, id) {
  await ensureAssistantChats(db);
  const chat = await ownedChat(db, id);
  if (!chat) return null;
  const rows = (await db.prepare('SELECT id,role,content,created_at FROM assistant_messages WHERE user_id=? AND chat_id=? ORDER BY id').bind(db.userId, chat.id).all()).results || [];
  return { id: chat.id, title: chat.title, updatedAt: chat.updated_at, messages: rows.map(r => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at })) };
}

// A chat that starts with the coach's own push ("Tři krátké noci za sebou"),
// for the athlete's answer written in the notification.
export async function startChatWithCoach(db, title, text) {
  await ensureAssistantChats(db);
  const created = await db.prepare('INSERT INTO assistant_chats(user_id,title) VALUES(?,?)').bind(db.userId, chatTitle(title || text)).run();
  const id = created.meta?.last_row_id;
  await db.prepare('INSERT INTO assistant_messages(chat_id,user_id,role,content) VALUES(?,?,?,?)').bind(id, db.userId, 'assistant', String(text || '').slice(0, MAX_CONTENT)).run();
  return id;
}

// The id of the chat's last answer, which the proposals made with it point to.
export async function lastAnswerId(db, chatId) {
  if (!validId(chatId)) return null;
  const row = await db.prepare("SELECT MAX(id) AS id FROM assistant_messages WHERE user_id=? AND chat_id=? AND role='assistant'").bind(db.userId, Number(chatId)).first();
  return row?.id ?? null;
}

export async function deleteChat(db, id) {
  await ensureAssistantChats(db);
  if (!validId(id)) return false;
  const chat = await ownedChat(db, id);
  await db.batch([
    db.prepare('DELETE FROM assistant_messages WHERE user_id=? AND chat_id=?').bind(db.userId, Number(id)),
    db.prepare('DELETE FROM assistant_chats WHERE user_id=? AND id=?').bind(db.userId, Number(id))
  ]);
  // The coach forgets the chat: its summary goes, and the notes of the days it
  // ran are written again from the chats that remain (coach-notes.js).
  if (chat) await forgetChatNotes(db, chat).catch(error => console.error('Chat notes not cleared', error.message));
  return true;
}
async function forgetChatNotes(db, chat) {
  await ensureCoachNotes(db);
  await db.prepare('DELETE FROM assistant_chat_summaries WHERE user_id=? AND chat_id=?').bind(db.userId, Number(chat.id)).run();
  const day = at => localToday(new Date(String(at).replace(' ', 'T') + 'Z'));
  const days = [];
  for (let d = day(chat.created_at), last = day(chat.updated_at); d <= last && days.length < 31; d = shiftDate(d, 1)) days.push(d);
  if (!days.length) return;
  await ensureNoteQueue(db);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  for (const d of days) {
    await db.prepare('DELETE FROM coach_notes WHERE user_id=? AND day=?').bind(db.userId, d).run();
    // Today's note is written after midnight anyway; an earlier day is written again now.
    if (d < localToday()) await db.prepare('INSERT INTO coach_note_queue (user_id, day, due_at) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET due_at=excluded.due_at').bind(db.userId, d, now).run();
  }
}
