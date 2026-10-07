// The language of everything the server writes for the user: coach cards,
// timeline texts, reviews, workouts sent to Intervals.icu, AI-written texts.
// It follows the app language (Settings → Appearance and language), sent with
// every app request as X-Interface-Language and remembered per user, so cron
// jobs and Intervals.icu exports use it too. Only free-form chat with the AI
// coach may answer in the language the athlete writes in.
//
// The language is held for the duration of a request or a per-user job, so
// generators deep in the code can write L('česky', 'in English') without
// passing it along.
import { AsyncLocalStorage } from 'node:async_hooks';

const current = new AsyncLocalStorage();

export const normalizeLang = value => String(value || '').toLowerCase().startsWith('en') ? 'en' : 'cs';
export const lang = () => current.getStore() || 'cs';
export const isEnglish = () => lang() === 'en';
// The text in the current language.
export const L = (cs, en) => lang() === 'en' ? en : cs;
export function withLang(value, fn) { return current.run(normalizeLang(value), fn); }

// Czech plural: 1 trénink, 2–4 tréninky, 5+ tréninků; English: 1 workout, 2 workouts.
export function plural(count, cs1, cs2, cs5, en1, en2) {
  const n = Math.abs(Math.round(Number(count) || 0));
  if (lang() === 'en') return n === 1 ? en1 : en2;
  return n === 1 ? cs1 : n >= 2 && n <= 4 ? cs2 : cs5;
}
// A number in the current language: 1,5 in Czech, 1.5 in English.
export function num(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const s = String(Math.round(n * 10 ** digits) / 10 ** digits);
  return lang() === 'en' ? s : s.replace('.', ',');
}

// ---- The remembered language of each user ----------------------------------
const known = new Map();
async function ensureTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS user_language (user_id INTEGER PRIMARY KEY, language TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}
// fresh skips this isolate's memory (cron jobs: the choice may have changed
// in another isolate).
export async function storedLanguage(db, userId, { fresh = false } = {}) {
  if (!db || userId == null) return 'cs';
  if (!fresh && known.has(userId)) return known.get(userId);
  try {
    await ensureTable(db);
    const row = await db.prepare('SELECT language FROM user_language WHERE user_id=?').bind(userId).first();
    const value = normalizeLang(row?.language);
    known.set(userId, value);
    return value;
  } catch { return 'cs'; }
}
// Saves the app language of a request when it changed; one write per change.
export async function rememberLanguage(db, userId, value) {
  if (!db || userId == null || !value) return;
  const next = normalizeLang(value);
  if (known.get(userId) === next) return;
  if (await storedLanguage(db, userId) === next) return;
  try {
    await db.prepare('INSERT INTO user_language(user_id,language,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,updated_at=CURRENT_TIMESTAMP').bind(userId, next).run();
    known.set(userId, next);
  } catch { /* the language is remembered on the next request */ }
}
export function _resetLanguagesForTest() { known.clear(); }

// Added to every AI request (coach-assistant.js callOpenAI). The instructions
// are written in Czech, so English needs saying. Free-form chat answers in the
// language the athlete writes in; what the app stores follows the app language.
// Food parsing and lookups keep the athlete's own food names and have their
// own language handling.
export function aiLanguageNote(feature) {
  if (['food-sentence', 'food-lookup', 'food-photo', 'barcode'].includes(feature)) return '';
  if (feature === 'assistant') return lang() === 'en'
    ? '\n\nLANGUAGE: Reply in the language the athlete writes in (English unless they write in another language). Everything that is saved in the app or sent to Intervals.icu (workout names and descriptions, plans, labels, reasons of proposed actions, memories) must be in English, the app language, regardless of the language of these instructions or the data.'
    : '\n\nJAZYK: Odpovídej v jazyce, ve kterém sportovec píše (obvykle česky). Vše, co se ukládá do aplikace nebo posílá do Intervals.icu (názvy a popisy tréninků, plány, popisky, důvody navržených akcí), piš česky.';
  return lang() === 'en'
    ? '\n\nLANGUAGE: The athlete uses the app in English. Write every user-facing text in natural English, even where these instructions say "česky" or the data is in Czech. Keep names the athlete wrote (foods, workouts, notes) as they are.'
    : '';
}

// A table of texts whose values follow the current language when read, for
// module-level constants: bilingual({ a: 'česky' }, { a: 'in English' }).
export function bilingual(cs, en) {
  const table = {};
  for (const key of Object.keys(cs)) Object.defineProperty(table, key, { get: () => L(cs[key], en[key] ?? cs[key]), enumerable: true });
  return table;
}
