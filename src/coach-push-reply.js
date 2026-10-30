// "Odpovědět" on the coach's push: the athlete writes the answer in the
// notification, the coach answers with another push. Each one can be answered
// again; one proposal in the answer gets "Potvrdit" and "Ne" right there
// (PushRegistration.swift CoachPush).
import { L } from './lang.js';
import { privateAlert } from './push.js';

// The phone's notification categories (PushRegistration.swift).
export const COACH_REPLY_CATEGORY = 'COACH_REPLY';
export const COACH_ACTION_CATEGORY = 'COACH_ACTION';
// What the athlete may write in a notification.
export const PUSH_REPLY_CHARS = 1000;
// A notification shows about four lines; the whole answer is in the chat.
const BODY_CHARS = 600;

// Markdown out: a notification shows plain text.
export function plainText(text) {
  return String(text || '')
    .replace(/\[(?:Návrhy|Proposals): [^\]]*\]/g, '')
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

// The push with the coach's answer: {alert, category, data}. One proposal is
// confirmed from the notification; several only in the app. hide: the answer
// goes in `private`, the banner says only that the coach replied (push.js hidesValues).
export function replyPush(result, chatId, { hide = false } = {}) {
  const actions = (result?.actions || []).filter(a => a?.draftId != null);
  const one = actions.length === 1 ? actions[0] : null;
  const more = actions.length > 1 ? L(' Návrhy potvrdíš v aplikaci.', ' Confirm the proposals in the app.') : '';
  const body = shortBody(result?.answer || '', BODY_CHARS - more.length) + more;
  const alert = { title: L('Kouč', 'Coach'), body: body || L('Odpověď je v aplikaci.', 'The answer is in the app.') };
  return {
    alert: hide ? privateAlert('reply') : alert,
    category: one ? COACH_ACTION_CATEGORY : COACH_REPLY_CATEGORY,
    data: { coach: { kind: 'reply', chatId: chatId ?? null, ...(one ? { draftId: one.draftId } : {}) }, ...(hide ? { private: alert } : {}) }
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
