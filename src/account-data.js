// The user's own data: a download of everything stored for the account, and
// deleting the account with all of it (Nastavení → Účet). The shared food and
// recipe catalogue holds no personal data and stays; the links between the
// user and their contributions are personal and go with the account.
import { L } from './lang.js';
import { PERSONAL_TABLES, publicUser, ownerEmail } from "./tenancy.js";

// Sign-in keys of the connected services are never exported.
const SECRET_TABLES = new Set(["connection_credentials"]);
const missingTable = error => /no such table/i.test(String(error?.message || error));

export async function exportAccountData(env, user) {
  const tables = {};
  for (const table of Object.keys(PERSONAL_TABLES)) {
    if (SECRET_TABLES.has(table)) continue;
    try {
      const rows = (await env.DB.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).bind(env.USER_ID).all()).results || [];
      if (rows.length) tables[table] = rows.map(({ user_id, ...row }) => row);
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
  }
  return { exportedAt: new Date().toISOString(), account: { email: user?.email || null, name: user?.name || null }, tables };
}

// Google keeps a granted consent until it is revoked; the app gives it back
// before forgetting the key (here and on disconnecting Google Health).
// Intervals.icu has no revoke call: its key or token is deleted here and the
// user can remove the app at intervals.icu/settings.
export async function revokeGoogle(env, fetchImpl = fetch) {
  if (!env.GOOGLE_REFRESH_TOKEN) return "none";
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: env.GOOGLE_REFRESH_TOKEN }) });
    return response.ok ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}

// A long-used account holds around a million rows (Google Health samples every
// few minutes). One DELETE over all of them runs past D1's time limit for a
// statement, so rows go in chunks. What the request has no time for is
// finished by the cron (finishAccountDeletions); the sign-in keys go first.
const DELETE_CHUNK_ROWS = 5000;
const REQUEST_BUDGET_MS = 15 * 1000;
const CRON_BUDGET_MS = 20 * 1000;
// D1 allows 1000 queries per Worker invocation; the cron run shares them with
// the syncs. One call makes at most this many plus one per table.
const MAX_CHUNKS = 200;
const DELETE_ORDER = [...SECRET_TABLES, ...Object.keys(PERSONAL_TABLES).filter(table => !SECRET_TABLES.has(table))];

// Deletes the user's rows table by table, at most chunkRows per statement.
// Returns done=false when the time or chunk budget ran out; calling it again
// continues. Only chunks that deleted rows count toward maxChunks (an empty
// table costs one query per call), and at least one runs per call, so every
// call makes progress.
export async function purgeUserData(db, userId, { deadline = Date.now() + REQUEST_BUDGET_MS, chunkRows = DELETE_CHUNK_ROWS, maxChunks = MAX_CHUNKS } = {}) {
  const deleted = {};
  let chunks = 0;
  for (const table of DELETE_ORDER) {
    for (;;) {
      if (chunks > 0 && (chunks >= maxChunks || Date.now() >= deadline)) return { done: false, deleted };
      let changes;
      try {
        changes = (await db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE user_id = ? LIMIT ?)`).bind(Number(userId), chunkRows).run())?.meta?.changes || 0;
      } catch (error) {
        if (missingTable(error)) break;
        throw error;
      }
      if (changes) { chunks++; deleted[table] = (deleted[table] || 0) + changes; }
      if (changes < chunkRows) break;
    }
  }
  return { done: true, deleted };
}

export async function deleteAccount(env, user, { fetchImpl = fetch, budgetMs = REQUEST_BUDGET_MS, chunkRows = DELETE_CHUNK_ROWS } = {}) {
  if (!user?.id || Number(user.id) !== Number(env.USER_ID)) throw new Error(L("Účet se nepodařilo ověřit.", "The account couldn't be verified."));
  if (user.isOwner) throw new Error(L("Účet správce nejde smazat: patří k němu data a nastavení aplikace.", "The admin account can't be deleted: the app's data and settings belong to it."));
  const google = await revokeGoogle(env, fetchImpl);
  // The account row goes first, together with the note that its data is to be
  // removed: the session no longer signs anyone in, signing in again needs a
  // new invitation (and gets a new id), and the cron finishes the data if this
  // request runs out of time or fails halfway.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO account_deletions(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING").bind(env.USER_ID),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(env.USER_ID)
  ]);
  let purge;
  try {
    purge = await purgeUserData(env.DB, env.USER_ID, { deadline: Date.now() + budgetMs, chunkRows });
  } catch (error) {
    console.error("Account data deletion continues in the cron", error.message);
    return { status: "ok", google, deleted: {}, pending: true };
  }
  if (purge.done) await env.DB.prepare("DELETE FROM account_deletions WHERE user_id = ?").bind(env.USER_ID).run();
  return { status: "ok", google, deleted: purge.deleted, pending: !purge.done };
}

// Every minute: removes the rest of the data of one deleted account. An entry
// whose account still exists is dropped untouched (ids are never reused).
export async function finishAccountDeletions(db, { budgetMs = CRON_BUDGET_MS, chunkRows = DELETE_CHUNK_ROWS, maxChunks = MAX_CHUNKS } = {}) {
  let next;
  try {
    next = await db.prepare("SELECT user_id FROM account_deletions ORDER BY requested_at, user_id LIMIT 1").first();
  } catch (error) {
    if (missingTable(error)) return null;
    throw error;
  }
  if (!next) return null;
  const userId = Number(next.user_id);
  if (await db.prepare("SELECT 1 AS present FROM users WHERE id = ?").bind(userId).first()) {
    await db.prepare("DELETE FROM account_deletions WHERE user_id = ?").bind(userId).run();
    return { userId, done: false, skipped: "account exists" };
  }
  const { done, deleted } = await purgeUserData(db, userId, { deadline: Date.now() + budgetMs, chunkRows, maxChunks });
  if (done) await db.prepare("DELETE FROM account_deletions WHERE user_id = ?").bind(userId).run();
  return { userId, done, deleted: Object.values(deleted).reduce((sum, n) => sum + n, 0) };
}

// Storage limitation (privacy policy): an account nobody has signed in to for
// two years is deleted with all its data. Signing in is the sign of use: a
// session lasts at most 30 days (dashboard-auth.js), so someone using the app
// signs in at least monthly. Every sign-in method must set last_login_at. The
// owner's account is never deleted.
export const INACTIVE_MONTHS = 24;
export async function inactiveAccounts(db, env, { now = new Date(), limit = 10 } = {}) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - INACTIVE_MONTHS);
  const rows = await db.prepare("SELECT id, email, name, role, disabled FROM users WHERE lower(email) <> ? AND COALESCE(last_login_at, created_at) < ? ORDER BY id LIMIT ?")
    .bind(ownerEmail(env), cutoff.toISOString().slice(0, 19).replace("T", " "), limit).all();
  return (rows.results || []).map(row => publicUser(row, env)).filter(user => !user.isOwner);
}
