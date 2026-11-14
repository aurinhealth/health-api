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

// "Vrať to zpátky" in the chat (Chat v1): the last change of today's gym plan
// confirmed in this chat goes back, as its card's "Vrátit" does. Read as an
// allow-list like the yes: only undo words and fillers, no question.
const UNDO = new Set(['vrat', 'vratit', 'vratte', 'vratime', 'undo', 'revert']);
const UNDO_FILLER = new Set([...FILLER, 'zpatky', 'zpet', 'back', 'tu', 'tuhle', 'tuto', 'tenhle', 'ten', 'posledni', 'zmenu', 'change', 'that', 'last', 'puvodni', 'puvodne', 'jak', 'bylo', 'was', 'as', 'radsi', 'nakonec', 'mi', 'me', 'na', 'plan', 'dekuju', 'dekuji']);
// "Dej to zpátky", "Put it back": a putting-back verb only together with back.
const BACK = new Set(['zpatky', 'zpet', 'back']), PUT = new Set(['dej', 'put']);
export function chatUndo(message) {
  const m = plain(message).trim();
  if (!m || m.length > 200 || m.includes('?')) return false;
  const words = m.split(/[^\p{L}']+/u).filter(Boolean), back = words.some(w => BACK.has(w));
  const verb = w => UNDO.has(w) || (back && PUT.has(w));
  return words.some(verb) && words.every(w => verb(w) || UNDO_FILLER.has(w));
}
// The last change of today's gym plan confirmed in this chat that can still
// go back. Stale when a later change of this chat's plan was confirmed (its
// undo used already): an older one goes back only by its own card's button.
export async function lastUndoInChat(db, chatId, since) {
  if (!Number.isInteger(Number(chatId)) || !Number(chatId)) return null;
  await db.prepare('CREATE TABLE IF NOT EXISTS activity_undo (user_id INTEGER NOT NULL, token TEXT NOT NULL, change_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, token))').run();
  const chat = '%"chatId":' + Number(chatId) + ',%';
  const row = await db.prepare("SELECT token,change_json,created_at FROM activity_undo WHERE user_id=? AND created_at>=? AND change_json LIKE ? ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(db.userId, since, chat).first();
  if (!row) return null;
  let c; try { c = JSON.parse(row.change_json); } catch { return null; }
  if (!['gym_plan', 'planned'].includes(c.kind) || c.chatId !== Number(chatId)) return null;
  // A ride or run changed by two cards of one answer (a new one and the old
  // one off the plan) goes back as a whole.
  if (c.kind === 'planned') {
    const rows = c.messageId ? ((await db.prepare("SELECT token,change_json FROM activity_undo WHERE user_id=? AND created_at>=? AND change_json LIKE ? ORDER BY created_at DESC,rowid DESC").bind(db.userId, since, chat).all()).results || []) : [];
    const same = rows.map(r => { try { return { token: r.token, c: JSON.parse(r.change_json) }; } catch { return null; } }).filter(r => r && r.c.kind === 'planned' && !r.c.undone && r.c.messageId === c.messageId && r.c.chatId === Number(chatId));
    // All of it went back by the cards' Vrátit: an older change stays (as for the gym below).
    if (c.undone && !same.length) return { token: row.token, tokens: [], proposal: c.proposal || '', stale: true };
    const all = same.length ? same : [{ token: row.token, c }];
    return { token: all[0].token, tokens: all.map(r => r.token), proposal: all.map(r => r.c.proposal).filter(Boolean).join(', ') };
  }
  // Confirmed after this change was made (cards may be confirmed in any order).
  const later = c.draftId ? ((await db.prepare("SELECT draft_json FROM coach_inbox WHERE user_id=? AND status='confirmed' AND id<>? AND confirmed_at>? AND draft_json LIKE ?").bind(db.userId, c.draftId, row.created_at, chat).all()).results || []) : [];
  const gymChange = a => ['gym_swap', 'gym_add', 'gym_remove'].includes(a?.type) || (a?.type === 'workout' && a.sport === 'gym' && (a.trim || a.replace));
  const stale = later.some(r => { try { return gymChange(JSON.parse(r.draft_json).action); } catch { return false; } });
  return { token: row.token, tokens: [row.token], proposal: c.proposal || '', ...(stale ? { stale: true } : {}) };
}
