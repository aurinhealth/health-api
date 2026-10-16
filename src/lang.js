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
import { aiLanguageNote } from './private/lang.js';
export { aiLanguageNote };

// The store holds the language and the units of the request or job.
const current = new AsyncLocalStorage();
const store = () => current.getStore() || {};

export const normalizeLang = value => String(value || '').toLowerCase().startsWith('en') ? 'en' : 'cs';
export const lang = () => store().lang || 'cs';
export const isEnglish = () => lang() === 'en';
// The text in the current language.
export const L = (cs, en) => lang() === 'en' ? en : cs;
export function withLang(value, fn) { return current.run({ ...store(), lang: normalizeLang(value) }, fn); }
// Units follow the device (X-Units: metric|imperial) and are remembered per
// user like the language. The data stays metric; texts for an imperial user convert.
export const normalizeUnits = value => String(value || '').toLowerCase().startsWith('imp') ? 'imperial' : 'metric';
export const units = () => store().units || 'metric';
export const isImperial = () => units() === 'imperial';
export function withUnits(value, fn) { return current.run({ ...store(), units: normalizeUnits(value) }, fn); }
export const KG_PER_LB = 0.45359237, M_PER_MILE = 1609.344;
export const kgToLb = kg => kg / KG_PER_LB;

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

// ---- The remembered language and units of each user ------------------------
const known = new Map();
const schemaDone = new WeakSet();
async function ensureTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS user_language (user_id INTEGER PRIMARY KEY, language TEXT NOT NULL, units TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  // A table made before units existed gets the column, once per database.
  if (schemaDone.has(db)) return;
  schemaDone.add(db);
  await db.prepare('ALTER TABLE user_language ADD COLUMN units TEXT').run().catch(() => {});
}
// fresh skips this isolate's memory (cron jobs: the choice may have changed
// in another isolate).
async function storedPrefs(db, userId, fresh) {
  if (!fresh && known.has(userId)) return known.get(userId);
  await ensureTable(db);
  const row = await db.prepare('SELECT language, units FROM user_language WHERE user_id=?').bind(userId).first();
  const value = { language: normalizeLang(row?.language), units: normalizeUnits(row?.units) };
  known.set(userId, value);
  return value;
}
export async function storedLanguage(db, userId, { fresh = false } = {}) {
  if (!db || userId == null) return 'cs';
  try { return (await storedPrefs(db, userId, fresh)).language; } catch { return 'cs'; }
}
export async function storedUnits(db, userId, { fresh = false } = {}) {
  if (!db || userId == null) return 'metric';
  try { return (await storedPrefs(db, userId, fresh)).units; } catch { return 'metric'; }
}
// Saves the app language of a request when it changed; one write per change.
export async function rememberLanguage(db, userId, value) {
  if (!db || userId == null || !value) return;
  const next = normalizeLang(value);
  if (known.get(userId)?.language === next) return;
  if (await storedLanguage(db, userId) === next) return;
  try {
    await db.prepare('INSERT INTO user_language(user_id,language,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,updated_at=CURRENT_TIMESTAMP').bind(userId, next).run();
    known.set(userId, { ...(known.get(userId) || { units: 'metric' }), language: next });
  } catch { /* the language is remembered on the next request */ }
}
// The same for the units; `language` fills the row of a user seen for the first time.
export async function rememberUnits(db, userId, value, language = 'cs') {
  if (!db || userId == null || !value) return;
  const next = normalizeUnits(value);
  if (known.get(userId)?.units === next) return;
  if (await storedUnits(db, userId) === next) return;
  try {
    await db.prepare('INSERT INTO user_language(user_id,language,units,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET units=excluded.units,updated_at=CURRENT_TIMESTAMP').bind(userId, normalizeLang(language), next).run();
    // A first-seen user's row now carries the request language too: the next read takes it from the table.
    known.delete(userId);
  } catch { /* remembered on the next request */ }
}
export function _resetLanguagesForTest() { known.clear(); }

// An imperial user reads pounds and miles; the data the model gets stays metric.
export function aiUnitsNote() {
  if (!isImperial()) return '';
  return L('\n\nJEDNOTKY: Sportovec používá imperiální jednotky. Piš libry (lb), míle, stopy/palce, °F a fl oz; data jsou metrická, převeď je.',
    '\n\nUNITS: The athlete uses imperial units. Use pounds, miles, feet/inches, °F and fl oz; the data is metric, convert it.');
}

// A table of texts whose values follow the current language when read, for
// module-level constants: bilingual({ a: 'česky' }, { a: 'in English' }).
export function bilingual(cs, en) {
  const table = {};
  for (const key of Object.keys(cs)) Object.defineProperty(table, key, { get: () => L(cs[key], en[key] ?? cs[key]), enumerable: true });
  return table;
}
