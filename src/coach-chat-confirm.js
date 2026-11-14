// "Potvrzuju, udělej to" in the chat: the open cards under the coach's last
// answer are confirmed as if tapped, through the same checks (Petr 2026-11-14:
// a clear yes in the text did nothing and the coach showed the same cards again).
// A miss only leaves the cards for a tap; a false yes changes the plan, so the
// words are read strictly and only plan changes of today's training go this way.
import { actionSummary } from './coach-actions.js';
import { ensureCoachInboxTable } from './coach-inbox.js';

const plain = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// Read as an allow-list (review of #1087: every deny-list left holes such as
// "Udělej to lehčí" or "Do it next week"): the message holds only confirming
// words and fillers. One clause after "a"/"and" may ask to add something
// ("…tak to potvrď a přidej tam biceps"); the coach answers that part.
const STRONG = new Set(['potvrzuju', 'potvrzuji', 'potvrzujeme', 'potvrd', 'potvrdte', 'potvrdim', 'souhlasim', 'souhlasime', 'proved', 'provedte', 'udelej', 'udelejte', 'zarid', 'confirm', 'confirmed', 'agree', 'go', 'ahead', 'do']);
const WEAK = new Set(['ano', 'jo', 'jasne', 'yes', 'yep', 'yeah', 'sure']);
const FILLER = new Set(['to', 'je', 'ty', 'it', 'them', 'ja', 'ti', 'vam', 'tak', 'uz', 'v', 'chatu', 'tady', 'prosim', 'please', 'diky', 'dik', 'thanks', 'thank', 'you', 'i', 'oba', 'obe', 'vse', 'vsechno', 'both', 'all', 'of', 'zmeny', 'navrhy', 'the', 'changes', 'tedy', 'teda', 'klidne', 'super', 'fajn', 'great']);
const ADD = /^(?:prid\p{L}*|add)(?!\p{L})/u;

// 'strong' for a confirming verb, 'weak' for a bare yes (which a question in
// the coach's last answer may have asked for something else), false otherwise.
export function chatConfirmation(message) {
  const m = plain(message).trim();
  if (!m || m.length > 300 || m.includes('?')) return false;
  const [head, ...more] = m.split(/[\s,]+(?:a|and)\s+(?=prid|add)/u);
  // The add clause is one request: no second "a", "ale" or comma after it.
  if (more.length > 1 || (more.length && (!ADD.test(more[0]) || /,|(?<!\p{L})(?:a|and|ale|but)(?!\p{L})/u.test(more[0])))) return false;
  const words = head.split(/[^\p{L}']+/u).filter(Boolean);
  if (!words.length || !words.every(w => STRONG.has(w) || WEAK.has(w) || FILLER.has(w))) return false;
  // A bare yes opens the message ("Ty jo" is wonder, not a yes).
  return words.some(w => STRONG.has(w)) ? 'strong' : WEAK.has(words[0]) ? 'weak' : false;
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
