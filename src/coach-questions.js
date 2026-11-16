// A coach question with answer chips (redesign Coach chat, AI-4 and AI-7,
// 2026-11-16): the server puts a question under a coach message ("All good",
// "Rest", "Sick", "Injured" after a training gap; the server templates of the
// proactive messages), and a tap on one of its chips is a free reply
// (coach-allowance.js claimFreeReply). Only a chip the server stored counts:
// the app sends the message id and the chip's text, the question must belong
// to that chat's latest coach message, the chip must be one of its own and
// each question takes one free answer.
const MAX_CHIPS = 4;
const clean = v => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

export async function ensureCoachQuestions(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS coach_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL, chips_json TEXT NOT NULL, answered_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS coach_questions_message ON coach_questions(user_id, message_id)").run();
}

// Keeps the chips under a coach message the server wrote (a template).
export async function saveCoachQuestion(db, { chatId, messageId, chips }) {
  const list = [...new Set((Array.isArray(chips) ? chips : []).map(clean).filter(Boolean))].slice(0, MAX_CHIPS);
  if (!(Number(chatId) > 0) || !(Number(messageId) > 0) || list.length < 2) return null;
  await ensureCoachQuestions(db);
  return (await db.prepare("INSERT INTO coach_questions (user_id, chat_id, message_id, chips_json) VALUES (?, ?, ?, ?) RETURNING id").bind(db.userId, Number(chatId), Number(messageId), JSON.stringify(list)).first())?.id ?? null;
}

// The chips of the chat's latest coach message, for the app ([] without a question).
export async function questionChips(db, chatId, messageId) {
  try {
    const row = await db.prepare("SELECT chips_json, answered_at FROM coach_questions WHERE user_id = ? AND chat_id = ? AND message_id = ?").bind(db.userId, Number(chatId), Number(messageId)).first();
    if (!row || row.answered_at) return [];
    return JSON.parse(row.chips_json || "[]");
  } catch (error) { if (/no such table/i.test(String(error?.message || error))) return []; throw error; }
}

// A tap on a chip (`reply`: { messageId, chip }) as the message `message`:
// true once it is marked answered, false for anything else (then the message
// counts as any other). One statement, so two taps take one answer.
export async function takeChipAnswer(db, chatId, reply, message) {
  const messageId = Number(reply?.messageId), chip = clean(reply?.chip);
  if (!(Number(chatId) > 0) || !(messageId > 0) || !chip || clean(message) !== chip) return false;
  try {
    const last = await db.prepare("SELECT id FROM assistant_messages WHERE user_id = ? AND chat_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1").bind(db.userId, Number(chatId)).first();
    if (Number(last?.id) !== messageId) return false;
    const row = await db.prepare("UPDATE coach_questions SET answered_at = CURRENT_TIMESTAMP WHERE user_id = ? AND chat_id = ? AND message_id = ? AND answered_at IS NULL AND EXISTS (SELECT 1 FROM json_each(chips_json) WHERE value = ?) RETURNING id")
      .bind(db.userId, Number(chatId), messageId, chip).first();
    return Boolean(row?.id);
  } catch (error) { if (/no such table/i.test(String(error?.message || error))) return false; throw error; }
}
