// Chats with the AI assistant. Each chat keeps its own messages; the coach
// sees only the turns of the chat it answers in, so a new chat starts clean.
// Only the last 30 days are kept: older messages are neither shown nor given to
// the coach, and once a night they are deleted (forgetOldChatMessages, from the
// nightly cleanups in entrypoint.js). What the coach remembers about the
// athlete (athlete-state.js memories) is kept apart and stays.
import { L } from './lang.js';

const KEEP_DAYS = 30;
const CONTEXT_TURNS = 12, MAX_CONTENT = 16000, SINCE = '-' + KEEP_DAYS + ' days';

export async function ensureAssistantChats(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS assistant_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS assistant_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}

export function chatTitle(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? text.slice(0, 57).replace(/\s+\S*$/, '') + '…' : text || L('Nový chat', 'New chat');
}

const validId = id => Number.isInteger(Number(id)) && Number(id) > 0;

// A chat of this user written in during the last 30 days; an older one counts
// as gone, and the next message starts a new chat.
export async function ownedChat(db, id) {
  if (!validId(id)) return null;
  return db.prepare("SELECT id,title,created_at,updated_at FROM assistant_chats WHERE user_id=? AND id=? AND updated_at>=datetime('now',?)").bind(db.userId, Number(id), SINCE).first();
}

// The last turns of the chat as context for the coach ([] for a new chat).
export async function chatContext(db, chatId) {
  await ensureAssistantChats(db);
  if (!await ownedChat(db, chatId)) return [];
  const rows = (await db.prepare("SELECT role,content FROM assistant_messages WHERE user_id=? AND chat_id=? AND created_at>=datetime('now',?) ORDER BY id DESC LIMIT ?").bind(db.userId, Number(chatId), SINCE, CONTEXT_TURNS).all()).results || [];
  return rows.reverse().map(r => ({ role: r.role, content: r.content }));
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

// The chats of the last 30 days, newest first (a read only: the nightly
// forgetOldChatMessages deletes the older ones).
export async function listChats(db, limit = 50) {
  await ensureAssistantChats(db);
  const rows = (await db.prepare("SELECT c.id,c.title,c.updated_at,(SELECT COUNT(*) FROM assistant_messages m WHERE m.chat_id=c.id AND m.user_id=c.user_id AND m.created_at>=datetime('now',?1)) AS messages FROM assistant_chats c WHERE c.user_id=?2 AND c.updated_at>=datetime('now',?1) ORDER BY c.updated_at DESC, c.id DESC LIMIT ?3").bind(SINCE, db.userId, limit).all()).results || [];
  return rows.map(r => ({ id: r.id, title: r.title, updatedAt: r.updated_at, messages: Number(r.messages) || 0 }));
}

export async function readChat(db, id) {
  await ensureAssistantChats(db);
  const chat = await ownedChat(db, id);
  if (!chat) return null;
  const rows = (await db.prepare("SELECT id,role,content,created_at FROM assistant_messages WHERE user_id=? AND chat_id=? AND created_at>=datetime('now',?) ORDER BY id").bind(db.userId, chat.id, SINCE).all()).results || [];
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
  await db.batch([
    db.prepare('DELETE FROM assistant_messages WHERE user_id=? AND chat_id=?').bind(db.userId, Number(id)),
    db.prepare('DELETE FROM assistant_chats WHERE user_id=? AND id=?').bind(db.userId, Number(id))
  ]);
  return true;
}

// Deletes, for all users of one database at once, the coach chat messages older
// than 30 days and the chats left without messages. A chat still in use then
// starts at its oldest message kept and takes its title from its first question
// kept (as chatTitle, without the cut at a word), so no title quotes a deleted
// message. Also the turns kept before chats existed (athlete_state.conversation,
// no longer written or read). A message is never older than its chat, so only
// chats started over 30 days ago are looked into: the chats are read once, and
// only the messages of those chats.
export async function forgetOldChatMessages(db) {
  const missing = error => { if (!/no such table/i.test(String(error?.message))) throw error; };
  const result = await db.batch([
    db.prepare("DELETE FROM assistant_messages WHERE created_at<datetime('now',?1) AND chat_id IN (SELECT id FROM assistant_chats WHERE created_at<datetime('now',?1))").bind(SINCE),
    db.prepare("DELETE FROM assistant_chats WHERE created_at<datetime('now',?1) AND NOT EXISTS (SELECT 1 FROM assistant_messages m WHERE m.chat_id=assistant_chats.id AND m.user_id=assistant_chats.user_id)").bind(SINCE),
    db.prepare(`UPDATE assistant_chats SET created_at=(SELECT MIN(m.created_at) FROM assistant_messages m WHERE m.chat_id=assistant_chats.id AND m.user_id=assistant_chats.user_id),
      title=COALESCE((SELECT CASE WHEN length(t)>60 THEN rtrim(substr(t,1,57))||'…' ELSE t END FROM (SELECT trim(replace(replace(replace(content,char(13),' '),char(10),' '),char(9),' ')) AS t FROM assistant_messages m WHERE m.chat_id=assistant_chats.id AND m.user_id=assistant_chats.user_id AND m.role='user' AND trim(content)<>'' ORDER BY m.id LIMIT 1)),title)
      WHERE created_at<datetime('now',?1)`).bind(SINCE)
  ]).catch(error => { missing(error); return []; });
  await db.prepare("UPDATE athlete_state SET state_json=json_remove(state_json,'$.conversation') WHERE json_valid(state_json) AND json_type(state_json,'$.conversation') IS NOT NULL").run().catch(missing);
  return { messages: Number(result[0]?.meta?.changes) || 0, chats: Number(result[1]?.meta?.changes) || 0 };
}
