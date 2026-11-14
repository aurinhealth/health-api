// "Potvrzuju, udělej to" in the chat: the open cards under the coach's last
// answer are confirmed as if tapped, through the same checks (Petr 2026-11-14:
// a clear yes in the text did nothing and the coach showed the same cards again).
import { actionSummary } from './coach-actions.js';
import { ensureCoachInboxTable } from './coach-inbox.js';

const plain = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// Anywhere in the message: words that only confirm.
const STRONG = /potvrz\p{L}*|potvrd\p{L}*|souhlas\p{L}*|(?:proved|udelej|zarid)\s+(?:to|je|tu|ty)\b|confirm\p{L}*|\bagree[ds]?\b|\bgo ahead\b|\bdo it\b|\bapply (?:it|them)\b/u;
// At the start only: a short yes ("Ano, a přidej biceps"), not "ok, a co zítra".
const WEAK = /^(?:ano|jo|jasne|beru|platí|plati|yes|yep|yeah|sure)\b/u;
// No, not now, or only one of them: the cards stay for a tap.
const REFUSE = /(?<!\p{L})(?:ne|nech\p{L}*|nedel\p{L}*|neprovad\p{L}*|nepotvr\p{L}*|nesouhlas\p{L}*|pockej|zatim|radsi|no|not|don'?t|wait|later|instead)(?!\p{L})/u;
const SELECT = /(?<!\p{L})(?:jen|jenom|pouze|prvni|druh\p{L}*|treti|posledni|jednu|jeden|only|first|second|third|last|one of)(?!\p{L})/u;

export function chatConfirmation(message) {
  const m = plain(message).trim();
  if (!m || m.length > 400 || REFUSE.test(m) || SELECT.test(m)) return false;
  // A question about confirming ("Mám to potvrdit?") is no confirmation.
  const sentences = m.split(/(?<=[.!?\n])/);
  return WEAK.test(m) || sentences.some(s => STRONG.test(s) && !/\?\s*$/.test(s));
}

// The open cards under the chat's last answer, oldest first.
export async function openDraftsOfLastAnswer(db, chatId) {
  if (!Number.isInteger(Number(chatId)) || !Number(chatId)) return [];
  const last = await db.prepare("SELECT id FROM assistant_messages WHERE user_id=? AND chat_id=? AND role='assistant' ORDER BY id DESC LIMIT 1").bind(db.userId, Number(chatId)).first();
  if (!last) return [];
  await ensureCoachInboxTable(db);
  const rows = (await db.prepare("SELECT id,draft_json FROM coach_inbox WHERE user_id=? AND status='draft' AND draft_json LIKE ? ORDER BY id").bind(db.userId, '%"chatId":' + Number(chatId) + ',"messageId":' + last.id + '%').all()).results || [];
  return rows.map(r => { try { const d = JSON.parse(r.draft_json); return d.kind === 'coach_action' && d.chatId === Number(chatId) && d.messageId === last.id && !d.ghost ? { draftId: r.id, action: d.action } : null; } catch { return null; } }).filter(Boolean);
}

// Each card confirmed through `confirm(draftId)` (the card's own endpoint);
// what the coach is told: the change and done or why it failed.
export async function confirmInChat(drafts, confirm) {
  const out = [];
  for (const d of drafts) {
    const proposal = actionSummary(d.action);
    try { const r = await confirm(d.draftId); out.push(r.ok ? { proposal, done: true, action: d.action } : { proposal, done: false, reason: r.message || '' }); }
    catch (error) { out.push({ proposal, done: false, reason: error.message }); }
  }
  return out;
}

// A card the answer brings again for a change just made is left out.
export const notConfirmedAgain = (actions, confirmed) => {
  const done = new Set(confirmed.filter(c => c.done).map(c => c.proposal));
  return actions.filter(a => !done.has(actionSummary(a)));
};
