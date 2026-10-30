// Extra messages to the coach bought in the app (consumable In-App Purchases
// "40 coach messages" and "100 coach messages"). They never run out with the
// week: the coach takes them only once the week's messages and the running
// conversation's extra ones are used up (coach-allowance.js). They belong to the
// account, so they go when it is deleted, and Apple cannot restore them.
// Tables in the central database (user-data-routing.js), because Apple's refund
// notification has no user and the claim has to be one statement:
// - coach_pack_purchases: one row per purchase (transaction id, messages, price),
//   refunded_at once Apple refunds it.
// - coach_pack_balance: how many bought messages the account used.
// - coach_pack_seen: SHA-256 of every transaction id ever counted, kept after the
//   account is deleted, so the same purchase cannot fill a new account again.
// A Sandbox purchase (TestFlight, sandbox testers) adds messages only on the
// test server; on the live one it is recorded but counts for nothing.
import { L } from './lang.js';
import { isStaging } from './staging.js';

export const PACKS = { messages40: 40, messages100: 100 };
export const packMessages = (productId, bundle) => {
  const prefix = bundle + '.coach.';
  return String(productId || '').startsWith(prefix) ? PACKS[String(productId).slice(prefix.length)] || 0 : 0;
};
export const packProducts = bundle => Object.keys(PACKS).map(name => bundle + '.coach.' + name);

const refuse = (message, status = 400) => Object.assign(new Error(message), { status });
const central = env => env.RAW_DB || env.DB;
const tracked = env => Boolean(env?.DB && Number(env.USER_ID) > 0) && env.USER_IS_OWNER !== true;
// Whether a purchase from this App Store environment adds messages here.
export const counts = (env, environment) => environment === 'Production' || isStaging(env);

export async function ensureCoachPacks(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS coach_pack_purchases (transaction_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, messages INTEGER NOT NULL, counted INTEGER NOT NULL, store_environment TEXT, price INTEGER, currency TEXT, purchased_at TEXT NOT NULL, refunded_at TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS coach_pack_purchases_user ON coach_pack_purchases(user_id)'),
    db.prepare('CREATE TABLE IF NOT EXISTS coach_pack_balance (user_id INTEGER PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS coach_pack_seen (transaction_hash TEXT PRIMARY KEY, seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
  ]);
}
async function withTables(db, work) {
  try { return await work(); } catch (error) {
    if (!/no such table/i.test(String(error?.message || error))) throw error;
    await ensureCoachPacks(db);
    return work();
  }
}
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text))))].map(b => b.toString(16).padStart(2, '0')).join('');

// Bought messages that still count (not refunded) minus the used ones; 0 at least.
const BOUGHT = 'SELECT COALESCE(SUM(messages), 0) FROM coach_pack_purchases WHERE user_id = ? AND counted = 1 AND refunded_at IS NULL';

// How many bought messages the account has left.
export async function packMessagesLeft(env) {
  if (!tracked(env)) return 0;
  const db = central(env);
  const row = await withTables(db, () => db.prepare(`SELECT (${BOUGHT}) - COALESCE((SELECT used FROM coach_pack_balance WHERE user_id = ?), 0) AS left`).bind(env.USER_ID, env.USER_ID).first());
  return Math.max(0, Number(row?.left) || 0);
}

// The account's purchases, newest first, for "Your purchases".
export async function packPurchases(env) {
  if (!env?.DB || !(Number(env.USER_ID) > 0)) return [];
  const db = central(env);
  const rows = (await withTables(db, () => db.prepare('SELECT product_id, messages, counted, store_environment, price, currency, purchased_at, refunded_at FROM coach_pack_purchases WHERE user_id = ? ORDER BY purchased_at DESC LIMIT 50').bind(env.USER_ID).all())).results || [];
  return rows.map(r => ({ productId: r.product_id, messages: r.messages, counted: r.counted === 1, environment: r.store_environment, price: r.price == null ? null : r.price / 1000, currency: r.currency || null, purchasedAt: r.purchased_at, refunded: Boolean(r.refunded_at) }));
}

// A checked pack transaction the app sent: its messages go to the account once.
export async function savePackTransaction(env, tx) {
  const messages = packMessages(tx.productId, tx.bundleId);
  const id = String(tx.transactionId || '');
  if (!messages || !id) throw refuse(L('Neplatný doklad o nákupu.', 'Invalid purchase record.'));
  const db = central(env);
  const mine = () => db.prepare('SELECT counted FROM coach_pack_purchases WHERE transaction_id = ? AND user_id = ?').bind(id, env.USER_ID).first();
  const hash = await sha256(id);
  const seen = await withTables(db, () => db.prepare('SELECT 1 AS seen FROM coach_pack_seen WHERE transaction_hash = ?').bind(hash).first());
  const resent = async () => {
    // The app sends a purchase again until it hears back: the second time changes nothing.
    if (!await mine()) throw refuse(L('Tento nákup patří jinému účtu Aurin.', 'This purchase belongs to another Aurin account.'), 409);
    return { status: 'ok', messages, added: false, left: await packMessagesLeft(env) };
  };
  if (seen) return resent();
  const counted = counts(env, tx.environment) ? 1 : 0;
  const price = Number.isFinite(Number(tx.price)) ? Math.round(Number(tx.price)) : null;
  // One transaction: the purchase, its mark and the balance row land together or not at all.
  const [, inserted] = await db.batch([
    db.prepare('INSERT INTO coach_pack_seen(transaction_hash) VALUES(?) ON CONFLICT(transaction_hash) DO NOTHING').bind(hash),
    db.prepare('INSERT INTO coach_pack_purchases(transaction_id, user_id, product_id, messages, counted, store_environment, price, currency, purchased_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(transaction_id) DO NOTHING')
      .bind(id, env.USER_ID, tx.productId, messages, counted, tx.environment, price, tx.currency ? String(tx.currency).slice(0, 3) : null, new Date(Number(tx.purchaseDate) || Date.now()).toISOString()),
    db.prepare('INSERT INTO coach_pack_balance(user_id, used) VALUES(?, 0) ON CONFLICT(user_id) DO NOTHING').bind(env.USER_ID)
  ]);
  // Sent at the same time by another request or account: whoever wrote it first has it.
  if (!inserted?.meta?.changes) return resent();
  return { status: 'ok', messages, added: counted === 1, left: await packMessagesLeft(env) };
}

// Apple refunded or revoked a pack: its messages stop counting (those already used stay used).
export async function refundPackTransaction(db, tx) {
  const at = new Date(Number(tx.revocationDate) || Date.now()).toISOString();
  const result = await withTables(db, () => db.prepare('UPDATE coach_pack_purchases SET refunded_at = ? WHERE transaction_id = ? AND refunded_at IS NULL').bind(at, String(tx.transactionId || '')).run());
  return Boolean(result?.meta?.changes);
}

// Takes one bought message, in one statement whose condition is the balance;
// false when none is left.
export async function takePackMessage(env) {
  if (!tracked(env)) return false;
  const db = central(env);
  const row = await withTables(db, () => db.prepare(`UPDATE coach_pack_balance SET used = used + 1 WHERE user_id = ? AND used < (${BOUGHT}) RETURNING used`).bind(env.USER_ID, env.USER_ID).first());
  return Boolean(row);
}

// The answer failed: the message goes back.
export async function returnPackMessage(env) {
  if (!tracked(env)) return;
  await central(env).prepare('UPDATE coach_pack_balance SET used = used - 1 WHERE user_id = ? AND used > 0').bind(env.USER_ID).run();
}
