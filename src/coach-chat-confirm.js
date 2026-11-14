// "Potvrzuju, udělej to" in the chat: the open cards under the coach's last
// answer are confirmed as if tapped, through the same checks (Petr 2026-11-14:
// a clear yes in the text did nothing and the coach showed the same cards again).
// A miss only leaves the cards for a tap; a false yes changes the plan, so the
// words are read strictly and only plan changes of today's training go this way.
import { actionSummary } from './coach-actions.js';
import { ensureCoachInboxTable } from './coach-inbox.js';

const plain = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// Verbs that confirm, anywhere in a sentence that is no question.
const STRONG = /(?<!\p{L})(?:potvrzuj\p{L}*|potvrd(?:’|')?(?:te|im|it)?(?!\p{L})|souhlasim|souhlasime|(?:proved|udelej|zarid)\s+(?:to|je)(?!\p{L})|confirm(?:ed)?(?!\p{L})|i agree|go ahead|do it)/u;
// A bare yes, only as the whole message: "Ano", "Jo, potvrzuju", "Yes please".
const WEAK = /^(?:ano|jo|jasne|beru|yes|yep|yeah|sure|ok|okay)[\s,.!]*(?:(?:prosim|please|diky|thanks|potvrzuju|potvrzuji|souhlasim|udelej to|do it|go ahead)[\s,.!]*)?$/u;
// A no, a doubt, a later, a change or a pick: the cards stay for a tap.
const REFUSE = /(?<!\p{L})(?:ne|nech\p{L}*|ned\p{L}*|nem\p{L}*|nep\p{L}*|nes\p{L}*|nev\p{L}*|nikdy|pockej|zatim|radsi|ale|misto|bez|jinak|jine\p{L}*|zitra|pozdeji|vecer|rano|az|zpet|rozmysl\p{L}*|uvidim|mozna|no|not|never|don'?t|can'?t|cannot|won'?t|wait|later|tomorrow|tonight|instead|but|without|except|maybe|back)(?!\p{L})/u;
const SELECT = /(?<!\p{L})(?:jen|jenom|pouze|prvn\p{L}*|druh\p{L}*|tret\p{L}*|posledn\p{L}*|jednu|jeden|jedn\p{L}*|s\s+(?:tou|tim|timhle|tou\s+\p{L}+)|only|first|second|third|last|one of|with the)(?!\p{L})/u;
// "Souhlasím, že…" agrees with a sentence, not with the cards.
const THAT = /souhlas\p{L}*,?\s+(?:ze|s tim,? ze)|agree that/u;

// 'strong' for a confirming verb, 'weak' for a bare yes (which a question in
// the coach's last answer may have asked for something else), false otherwise.
export function chatConfirmation(message) {
  const m = plain(message).trim();
  if (!m || m.length > 300 || m.includes('?') || REFUSE.test(m) || SELECT.test(m) || THAT.test(m)) return false;
  if (WEAK.test(m)) return 'weak';
  return STRONG.test(m) ? 'strong' : false;
}

// The changes a yes in the text may make: today's training plan only. A rest,
// a status, a plan or a change of a done activity still needs the tap.
export const CHAT_CONFIRMABLE = new Set(['gym_swap', 'gym_add', 'gym_remove', 'workout', 'move', 'week_sport']);

// The open cards under the chat's last answer, made since `since` (today), oldest first.
export async function openDraftsOfLastAnswer(db, chatId, since) {
  if (!Number.isInteger(Number(chatId)) || !Number(chatId)) return [];
  const last = await db.prepare("SELECT id FROM assistant_messages WHERE user_id=? AND chat_id=? AND role='assistant' ORDER BY id DESC LIMIT 1").bind(db.userId, Number(chatId)).first();
  if (!last) return [];
  await ensureCoachInboxTable(db);
  const rows = (await db.prepare("SELECT id,draft_json FROM coach_inbox WHERE user_id=? AND status='draft' AND created_at>=? AND draft_json LIKE ? ORDER BY id").bind(db.userId, since, '%"chatId":' + Number(chatId) + ',"messageId":' + last.id + '%').all()).results || [];
  return rows.map(r => { try { const d = JSON.parse(r.draft_json); return d.kind === 'coach_action' && d.chatId === Number(chatId) && d.messageId === last.id && !d.ghost && CHAT_CONFIRMABLE.has(d.action?.type) ? { draftId: r.id, action: d.action } : null; } catch { return null; } }).filter(Boolean);
}

// Does the coach's last answer end its text with a question ("Mám ti dát i lehké vyjetí?")?
// Then a bare "Jo" answers it, not the cards.
export const answerAsks = conversation => {
  const last = [...(conversation || [])].reverse().find(t => t.role === 'assistant');
  return /\?\s*$/.test(String(last?.content || '').replace(/\n*\[(?:Návrhy|Proposals):[^\]]*\]\s*$/, '').trim());
};

// Each card confirmed through `confirm(draftId)` (the card's own endpoint);
// what the coach is told: the change and done or why it failed.
export async function confirmInChat(drafts, confirm) {
  const out = [];
  for (const d of drafts) {
    const proposal = actionSummary(d.action);
    try { const r = await confirm(d.draftId); out.push(r.ok ? { proposal, done: true, draftId: d.draftId, action: d.action } : { proposal, done: false, reason: r.message || '' }); }
    catch (error) { out.push({ proposal, done: false, reason: error.message }); }
  }
  return out;
}

// A card the answer brings again for a change just made is left out.
export const notConfirmedAgain = (actions, confirmed) => {
  const done = new Set(confirmed.filter(c => c.done).map(c => c.proposal));
  return actions.filter(a => !done.has(actionSummary(a)));
};
