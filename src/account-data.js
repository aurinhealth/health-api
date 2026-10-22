// The user's own data: a download of everything stored for the account, and
// deleting the account with all of it (Nastavení → Účet). The shared food and
// recipe catalogue holds no personal data and stays; the links between the
// user and their contributions are personal and go with the account.
import { L } from './lang.js';
import { PERSONAL_TABLES, publicUser, ownerEmail } from "./tenancy.js";
import { revokeApple } from "./apple-login.js";
import { revokeWhoop } from "./whoop.js";
import { revokeUltrahuman } from "./ultrahuman.js";
import { revokeWahoo } from "./wahoo.js";
import { revokeIntervals } from "./intervals-oauth.js";
import { rememberAiLimits } from "./ai-limit-memory.js";

// Sign-in keys of the connected services are never exported.
const SECRET_TABLES = new Set(["connection_credentials"]);
const missingTable = error => /no such table/i.test(String(error?.message || error));

// The download is NDJSON: a header line, then one line per row
// ({"table":…,"row":…}). A long-used account holds around a million rows, so
// nothing is gathered in memory: each table is read in keyset pages of
// EXPORT_PAGE_ROWS (by rowid) and every page is written out before the next is
// read. The stream pulls, so a slow download does not pile pages up either.
export const EXPORT_FORMAT = "loadwise-export";
export const EXPORT_VERSION = 2;
const EXPORT_PAGE_ROWS = 5000;
const EXPORT_TABLES = Object.keys(PERSONAL_TABLES).filter(table => !SECRET_TABLES.has(table));

// Yields the user's rows table by table, one page at a time. env.DB is the
// user's scoped database; with user data shards it routes each table to the
// database that holds it.
export async function* exportPages(db, userId, { pageRows = EXPORT_PAGE_ROWS } = {}) {
  for (const table of EXPORT_TABLES) {
    let after = 0;
    for (;;) {
      let rows;
      try {
        rows = (await db.prepare(`SELECT rowid AS export_rowid__, * FROM ${table} WHERE user_id = ? AND rowid > ? ORDER BY rowid LIMIT ?`).bind(Number(userId), after, pageRows).all()).results || [];
      } catch (error) {
        if (missingTable(error)) break;
        throw error;
      }
      if (!rows.length) break;
      after = rows[rows.length - 1].export_rowid__;
      yield { table, rows: rows.map(({ export_rowid__, user_id, ...row }) => row) };
      if (rows.length < pageRows) break;
    }
  }
}

export function exportAccountStream(env, user, { now = new Date(), pageRows = EXPORT_PAGE_ROWS } = {}) {
  const encoder = new TextEncoder();
  const header = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), account: { email: user?.email || null, name: user?.name || null } };
  let pages = null;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify(header) + "\n"));
    },
    async pull(controller) {
      pages ||= exportPages(env.DB, env.USER_ID, { pageRows });
      try {
        const next = await pages.next();
        if (next.done) { controller.close(); return; }
        const { table, rows } = next.value;
        let text = "";
        for (const row of rows) text += JSON.stringify({ table, row }) + "\n";
        controller.enqueue(encoder.encode(text));
      } catch (error) {
        console.error("Account export failed", error.message);
        controller.error(error);
      }
    },
    async cancel() {
      await pages?.return();
    }
  }, { highWaterMark: 1 });
}

// Google keeps a granted consent until it is revoked; the app gives it back
// before forgetting the key (here and on disconnecting Google Health).
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
// The keys first, with the accounts at the services that route webhooks to the user.
const FIRST_DELETED = new Set([...SECRET_TABLES, "connection_accounts"]);
const DELETE_ORDER = [...FIRST_DELETED, ...Object.keys(PERSONAL_TABLES).filter(table => !FIRST_DELETED.has(table))];

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
      if (chunks > 0 && (chunks >= maxChunks || Date.now() >= deadline)) return { done: false, deleted, chunks };
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
  return { done: true, deleted, chunks };
}

export async function deleteAccount(env, user, { fetchImpl = fetch, budgetMs = REQUEST_BUDGET_MS, chunkRows = DELETE_CHUNK_ROWS } = {}) {
  if (!user?.id || Number(user.id) !== Number(env.USER_ID)) throw new Error(L("Účet se nepodařilo ověřit.", "The account couldn't be verified."));
  if (user.isOwner) throw new Error(L("Účet správce nejde smazat: patří k němu data a nastavení aplikace.", "The admin account can't be deleted: the app's data and settings belong to it."));
  const google = await revokeGoogle(env, fetchImpl);
  const apple = await revokeApple(env, fetchImpl);
  // WHOOP, Ultrahuman, Wahoo and Intervals.icu (OAuth) would keep Aurin among
  // the allowed apps. A personal Intervals.icu API key is only deleted here.
  const [whoop, ultrahuman, wahoo, intervals] = await Promise.all([revokeWhoop(env, fetchImpl), revokeUltrahuman(env, fetchImpl), revokeWahoo(env, fetchImpl), revokeIntervals(env, fetchImpl)]);
  // What the AI limits counted stays, under hashes of the sign-in, so a new
  // account of the same person does not start them over (ai-limit-memory.js).
  await rememberAiLimits(env, user);
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
    return { status: "ok", google, apple, whoop, ultrahuman, wahoo, intervals, deleted: {}, pending: true };
  }
  if (purge.done) {
    await completeDeletion(env.DB, env.USER_ID, env.USER_DATA_ROUTING === 'true');
  }
  return { status: "ok", google, apple, whoop, ultrahuman, wahoo, intervals, deleted: purge.deleted, pending: !purge.done };
}

async function completeDeletion(db, userId, routed) {
  const statements = [db.prepare('DELETE FROM account_deletions WHERE user_id=?').bind(userId)];
  if (routed) statements.push(db.prepare('DELETE FROM user_data_routes WHERE user_id=?').bind(userId));
  // Keep the retry marker and its data location together until both can be
  // removed atomically on the central database.
  await db.batch(statements);
}

// Every minute: removes the rest of the data of deleted accounts, oldest
// first. An entry whose account still exists is dropped untouched (ids are
// never reused). An account whose deletion fails (its data database offline or
// unbound, a statement that keeps failing) is put back with the error and
// tried again later, waiting longer after each attempt, and the run goes on
// with the next account, so one stuck deletion never holds up the others. The
// daily ops report lists the ones that keep failing (ops-report.js). One run
// handles at most MAX_ACCOUNTS_PER_RUN accounts, which share the time and
// chunk budget (an account costs a query per table besides its chunks).
// Returns what happened to each account, or null when none was due.
const MAX_ACCOUNTS_PER_RUN = 3;
const DELETION_RETRY_MINUTES = attempts => Math.min(5 * 2 ** Math.max(0, attempts - 1), 6 * 60);
const sqlTime = date => date.toISOString().slice(0, 19).replace("T", " ");
const errorText = error => String(error?.message ?? error ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

export async function finishAccountDeletions(db, { budgetMs = CRON_BUDGET_MS, chunkRows = DELETE_CHUNK_ROWS, maxChunks = MAX_CHUNKS, maxAccounts = MAX_ACCOUNTS_PER_RUN, databaseForUser = null, now = () => new Date() } = {}) {
  const deadline = Date.now() + budgetMs;
  const results = [];
  let chunksLeft = maxChunks;
  while (results.length < maxAccounts && chunksLeft > 0 && (!results.length || Date.now() < deadline)) {
    let next;
    try {
      next = await db.prepare("SELECT user_id, attempts FROM account_deletions WHERE retry_after IS NULL OR retry_after <= ? ORDER BY requested_at, user_id LIMIT 1").bind(sqlTime(now())).first();
    } catch (error) {
      if (missingTable(error)) return null;
      throw error;
    }
    if (!next) break;
    const userId = Number(next.user_id);
    let result;
    try {
      result = await finishOne(db, userId, { deadline, chunkRows, maxChunks: chunksLeft, databaseForUser });
    } catch (error) {
      const attempts = Number(next.attempts || 0) + 1;
      const retryAfter = new Date(now().getTime() + DELETION_RETRY_MINUTES(attempts) * 60000);
      console.error("Account deletion failed", userId, `attempt ${attempts}`, errorText(error));
      await db.prepare("UPDATE account_deletions SET attempts = ?, last_error = ?, retry_after = ? WHERE user_id = ?").bind(attempts, errorText(error), sqlTime(retryAfter), userId).run();
      results.push({ userId, done: false, failed: errorText(error), attempts });
      continue;
    }
    chunksLeft -= result.chunks || 0;
    delete result.chunks;
    results.push(result);
    // Out of time or chunks: this account goes on in the next run.
    if (!result.done && !result.skipped) break;
  }
  return results.length ? results : null;
}

async function finishOne(db, userId, { deadline, chunkRows, maxChunks, databaseForUser }) {
  if (await db.prepare("SELECT 1 AS present FROM users WHERE id = ?").bind(userId).first()) {
    await db.prepare("DELETE FROM account_deletions WHERE user_id = ?").bind(userId).run();
    return { userId, done: false, skipped: "account exists" };
  }
  const data = databaseForUser ? await databaseForUser(userId) : db;
  const { done, deleted, chunks } = await purgeUserData(data, userId, { deadline, chunkRows, maxChunks });
  if (done) {
    await completeDeletion(db, userId, Boolean(databaseForUser));
  }
  return { userId, done, deleted: Object.values(deleted).reduce((sum, n) => sum + n, 0), chunks };
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
