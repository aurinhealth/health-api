// "Odpovědět" on the coach's push: the athlete writes the answer in the
// notification, the coach answers with another push. Each one can be answered
// again; one proposal in the answer gets "Potvrdit" and "Ne" right there
// (PushRegistration.swift CoachPush).
import { L } from './lang.js';
import { actionSummary, withoutActionsNote } from './coach-actions.js';

// The phone's notification categories (PushRegistration.swift).
export const COACH_REPLY_CATEGORY = 'COACH_REPLY';
export const COACH_ACTION_CATEGORY = 'COACH_ACTION';
// What the athlete may write in a notification.
export const PUSH_REPLY_CHARS = 1000;
// A notification shows about four lines; the whole answer is in the chat.
const BODY_CHARS = 600;

// Markdown out: a notification shows plain text.
export function plainText(text) {
  return withoutActionsNote(text)
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '· ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function shortBody(text, max = BODY_CHARS) {
  const t = plainText(text);
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

// The chat's opening: the push the athlete answers, as the coach's message.
export function pushOpening(title, body) {
  const t = String(title || '').trim().slice(0, 200), b = String(body || '').trim().slice(0, 1000);
  return t && b ? `**${t}**\n\n${b}` : t || b;
}

// Deleting or merging an activity, removing a planned workout, a new plan and
// a status change are confirmed only in the app, where the card shows them.
const APP_ONLY = new Set(['activity_delete', 'activity_merge', 'rest', 'plan', 'status']);

// The push with the coach's answer: {alert, category, data}. One small proposal
// is confirmed from the notification, which names it first (the body is hidden
// on the lock screen when health values are); others only in the app.
export function replyPush(result, chatId) {
  const actions = (result?.actions || []).filter(a => a?.draftId != null);
  const one = actions.length === 1 && !APP_ONLY.has(actions[0].type) ? actions[0] : null;
  const head = one ? L('Návrh: ', 'Proposal: ') + actionSummary(one) + '\n' : '';
  const more = actions.length && !one ? (actions.length > 1 ? L(' Návrhy potvrdíš v aplikaci.', ' Confirm the proposals in the app.') : L(' Návrh potvrdíš v aplikaci.', ' Confirm the proposal in the app.')) : '';
  const body = (head + shortBody(result?.answer || '', BODY_CHARS - more.length - head.length)).trim() + more;
  return {
    alert: { title: L('Kouč', 'Coach'), body: body || L('Odpověď je v aplikaci.', 'The answer is in the app.') },
    category: one ? COACH_ACTION_CATEGORY : COACH_REPLY_CATEGORY,
    data: { coach: { kind: 'reply', chatId: chatId ?? null, ...(one ? { draftId: one.draftId } : {}) } }
  };
}

// The coach could not answer: the reason, and the chat to try again in.
export function failedReplyPush(message, chatId) {
  return {
    alert: { title: L('Kouč', 'Coach'), body: shortBody(message || L('Kouč teď neodpověděl. Zkus to v aplikaci.', "The coach didn't answer. Try again in the app.")) },
    category: null,
    data: { coach: { kind: 'reply', chatId: chatId ?? null } }
  };
}
