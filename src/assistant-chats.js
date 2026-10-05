// Chats with the AI assistant. Each chat keeps its own messages; the coach
// sees only the turns of the chat it answers in, so a new chat starts clean.
// Chats untouched for 90 days are removed when the list is read.
const KEEP_DAYS = 90, CONTEXT_TURNS = 12, MAX_CONTENT = 16000;

export async function ensureAssistantChats(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS assistant_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS assistant_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}

export function chatTitle(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? text.slice(0, 57).replace(/\s+\S*$/, '') + '…' : text || 'Nový chat';
}

const validId = id => Number.isInteger(Number(id)) && Number(id) > 0;

async function ownedChat(db, id) {
  if (!validId(id)) return null;
  return db.prepare('SELECT id,title,created_at,updated_at FROM assistant_chats WHERE user_id=? AND id=?').bind(db.userId, Number(id)).first();
}

// The last turns of the chat as context for the coach ([] for a new chat).
export async function chatContext(db, chatId) {
  await ensureAssistantChats(db);
  if (!await ownedChat(db, chatId)) return [];
  const rows = (await db.prepare('SELECT role,content FROM assistant_messages WHERE user_id=? AND chat_id=? ORDER BY id DESC LIMIT ?').bind(db.userId, Number(chatId), CONTEXT_TURNS).all()).results || [];
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
  const rows = (await db.prepare('SELECT role,content,created_at FROM assistant_messages WHERE user_id=? AND chat_id=? ORDER BY id').bind(db.userId, chat.id).all()).results || [];
  return { id: chat.id, title: chat.title, updatedAt: chat.updated_at, messages: rows.map(r => ({ role: r.role, content: r.content, createdAt: r.created_at })) };
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
