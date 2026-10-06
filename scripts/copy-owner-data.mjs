// Copies the owner's own rows from the live database into the staging copy
// (run by deploy-staging.yml). The live database is only read. Sign-in keys
// for Google and Intervals.icu, sync state and other users' data are never
// copied, so the staging copy cannot act on real accounts or show anyone else.
//
//   node scripts/copy-owner-data.mjs OUT_DIR
//
// Needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SOURCE_DATABASE_ID,
// TARGET_DATABASE_ID and OWNER_EMAIL; REFRESH=true copies again over what
// staging has. Writes SQL files to OUT_DIR for `wrangler d1 execute --file`.
// Each file is imported in one piece and every INSERT is OR IGNORE, so an
// interrupted copy simply continues on the next run. Logs only row counts.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Tables with a user_id column whose rows belong to the owner.
export const OWNER_TABLES = [
  "health_datapoints", "food_logs", "food_log", "personal_foods", "strength_sets",
  "gym_plans", "gym_plan_cancellations", "dashboard_profile", "coach_inbox",
  "training_capabilities", "workout_feedback", "coach_reflections", "fluid_log",
  "workout_schedule_links", "training_profile", "week_plan_preferences",
  "week_plan_overrides", "athlete_state", "assistant_chats", "assistant_messages",
  "exercise_videos"
];
// Catalogues without personal data.
export const SHARED_TABLES = ["shared_foods", "workout_library"];
// Left out on purpose: connection_credentials, provider_tokens (sign-in keys),
// food_google_exports, sync_status, sync_state, api_cache_versions (sync and
// cache state), users, user_invites (other people), schema_meta, d1_migrations.
export const DONE_KEY = "owner_data_copied_at";

const PAGE_ROWS = 5000;
const MAX_STATEMENT_BYTES = 90_000;     // D1 allows 100 KB per statement
const MAX_FILE_BYTES = 25 * 1024 * 1024; // one import each

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") return "'" + value.replaceAll("'", "''") + "'";
  throw new Error(`Unsupported value of type ${typeof value}`);
}

function quoteName(name) {
  return '"' + String(name).replaceAll('"', '""') + '"';
}

// Collects multi-row INSERT statements into files of at most MAX_FILE_BYTES,
// handed to onFile as each one fills up (kept in `files` without onFile).
export class SqlFiles {
  constructor({ maxStatementBytes = MAX_STATEMENT_BYTES, maxFileBytes = MAX_FILE_BYTES, onFile = null } = {}) {
    this.maxStatementBytes = maxStatementBytes;
    this.maxFileBytes = maxFileBytes;
    this.onFile = onFile;
    this.files = [];
    this.count = 0;
    this.current = [];
    this.currentBytes = 0;
    this.pending = null;
  }
  statement(sql) {
    this.flushInsert();
    this.push(sql + ";\n");
  }
  insert(table, columns, values) {
    const tuple = "(" + values.map(sqlLiteral).join(",") + ")";
    const head = `INSERT OR IGNORE INTO ${quoteName(table)} (${columns.map(quoteName).join(",")}) VALUES `;
    const p = this.pending;
    if (p && p.head === head && p.bytes + 1 + Buffer.byteLength(tuple) <= this.maxStatementBytes) {
      p.tuples.push(tuple);
      p.bytes += 1 + Buffer.byteLength(tuple);
      return;
    }
    this.flushInsert();
    this.pending = { head, tuples: [tuple], bytes: Buffer.byteLength(head) + Buffer.byteLength(tuple) };
  }
  flushInsert() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.push(p.head + p.tuples.join(",") + ";\n");
  }
  push(text) {
    const bytes = Buffer.byteLength(text);
    if (this.current.length && this.currentBytes + bytes > this.maxFileBytes) this.endFile();
    this.current.push(text);
    this.currentBytes += bytes;
  }
  endFile() {
    if (this.current.length) {
      const text = this.current.join("");
      this.count++;
      if (this.onFile) this.onFile(text, this.count);
      else this.files.push(text);
    }
    this.current = [];
    this.currentBytes = 0;
  }
  finish() {
    this.flushInsert();
    this.endFile();
    return this.files;
  }
}

async function columnNames(query, db, table) {
  const info = await query(db, `PRAGMA table_info(${quoteName(table)})`);
  const at = info.columns.indexOf("name");
  return info.rows.map(row => row[at]);
}

async function ownerId(query, db, email) {
  const result = await query(db, "SELECT id FROM users WHERE email = ?", [email]);
  const id = Number(result.rows[0]?.[0]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// query(db, sql, params) answers { columns, rows } like D1's /raw endpoint.
export async function buildCopy({ query, source, target, ownerEmail, refresh = false, log = () => {}, files = new SqlFiles(), pageRows = PAGE_ROWS }) {
  const email = String(ownerEmail || "").trim().toLowerCase();
  if (!email) throw new Error("OWNER_EMAIL is not set");
  const sourceOwner = await ownerId(query, source, email);
  if (!sourceOwner) throw new Error("The owner is not in the live database");
  const targetOwner = await ownerId(query, target, email);
  if (!targetOwner) throw new Error("The owner is not in the staging database yet; open the staging copy once first");

  if (!refresh) {
    const done = await query(target, "SELECT value FROM schema_meta WHERE key = ?", [DONE_KEY]);
    if (done.rows.length) {
      log(`Owner data already copied (${done.rows[0][0]}); nothing to do.`);
      return { skipped: true, files: [], counts: {} };
    }
  }

  const counts = {};
  // Until the copy has finished, a later run continues it.
  if (refresh) files.statement(`DELETE FROM schema_meta WHERE key = ${sqlLiteral(DONE_KEY)}`);
  const tables = [...OWNER_TABLES.map(name => ({ name, owner: true })), ...SHARED_TABLES.map(name => ({ name, owner: false }))];
  for (const table of tables) {
    const sourceColumns = await columnNames(query, source, table.name);
    const targetColumns = new Set(await columnNames(query, target, table.name));
    const columns = sourceColumns.filter(name => targetColumns.has(name));
    if (!columns.length || (table.owner && !columns.includes("user_id"))) {
      log(`${table.name}: not in both databases, skipped`);
      continue;
    }
    if (refresh) files.statement(`DELETE FROM ${quoteName(table.name)}` + (table.owner ? ` WHERE user_id = ${targetOwner}` : ""));
    const userAt = columns.indexOf("user_id");
    let last = null, copied = 0;
    for (;;) {
      const where = [table.owner ? `user_id = ${sourceOwner}` : "", last === null ? "" : `rowid > ${last}`].filter(Boolean);
      const page = await query(source, `SELECT rowid, ${columns.map(quoteName).join(", ")} FROM ${quoteName(table.name)}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY rowid LIMIT ${pageRows}`);
      for (const row of page.rows) {
        last = Number(row[0]);
        const values = row.slice(1);
        if (table.owner) values[userAt] = targetOwner;
        files.insert(table.name, columns, values);
      }
      copied += page.rows.length;
      if (page.rows.length < pageRows) break;
    }
    counts[table.name] = copied;
    log(`${table.name}: ${copied} rows`);
  }
  files.statement(`INSERT INTO schema_meta (key, value) VALUES (${sqlLiteral(DONE_KEY)}, ${sqlLiteral(new Date().toISOString())}) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
  return { skipped: false, files: files.finish(), fileCount: files.count, counts };
}

function d1Query({ accountId, token, fetchImpl = fetch }) {
  return async function query(db, sql, params = []) {
    for (let attempt = 1; ; attempt++) {
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${db}/raw`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params })
      });
      const body = await response.json().catch(() => null);
      const result = body?.result?.[0];
      if (response.ok && body?.success && result?.success !== false) {
        const { columns, rows } = result?.results || {};
        if (!Array.isArray(columns) || !Array.isArray(rows)) throw new Error("Unexpected D1 response shape");
        return { columns, rows };
      }
      // Error texts only, never the statement or its values.
      const message = (body?.errors || []).map(e => e.message).join("; ").slice(0, 300) || `HTTP ${response.status}`;
      if (attempt >= 5 || (response.status < 500 && response.status !== 429)) throw new Error(`D1 query failed: ${message}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  };
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("Usage: node scripts/copy-owner-data.mjs OUT_DIR");
  const env = process.env;
  for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "SOURCE_DATABASE_ID", "TARGET_DATABASE_ID", "OWNER_EMAIL"]) {
    if (!env[name]) throw new Error(`${name} is not set`);
  }
  if (env.SOURCE_DATABASE_ID === env.TARGET_DATABASE_ID) throw new Error("The source and target databases must differ");
  mkdirSync(outDir, { recursive: true });
  const files = new SqlFiles({ onFile: (text, n) => writeFileSync(join(outDir, String(n).padStart(3, "0") + ".sql"), text) });
  const result = await buildCopy({
    query: d1Query({ accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN }),
    source: env.SOURCE_DATABASE_ID,
    target: env.TARGET_DATABASE_ID,
    ownerEmail: env.OWNER_EMAIL,
    refresh: env.REFRESH === "true",
    log: line => console.log(line),
    files
  });
  console.log(result.skipped ? "No files written." : `${result.fileCount} file(s) to import.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
