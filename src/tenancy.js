// Multi-user support: every personal row carries user_id, requests run with a
// user-scoped env, and the schema upgrade that adds user_id to existing tables.

const TENANCY_VERSION = "1";
const LOCK_STALE_MS = 5 * 60 * 1000;

// Tables holding one person's data. `pk` replaces a natural primary key with a
// per-user composite key, `unique` replaces a natural unique key, `indexes`
// are (re)created after the rebuild. Tables with an integer `id` keep it.
export const PERSONAL_TABLES = {
  health_datapoints: {
    unique: [["user_id", "source_family", "data_type", "external_id"]],
    indexes: [["user_id", "data_type", "sample_time DESC"], ["user_id", "source_family", "data_type", "start_time"]]
  },
  food_logs: { indexes: [["user_id", "consumed_date", "consumed_at"]] },
  food_log: { indexes: [["user_id", "date"]] },
  personal_foods: { pk: ["user_id", "food_key"] },
  food_google_exports: { pk: ["user_id", "entry_id"] },
  strength_sets: { unique: [["user_id", "source_key"]] },
  gym_plans: { pk: ["user_id", "workout_date"] },
  gym_plan_cancellations: { pk: ["user_id", "workout_date"] },
  dashboard_profile: { pk: ["user_id", "id"] },
  coach_inbox: { indexes: [["user_id", "created_at DESC"]] },
  sync_status: { pk: ["user_id", "sync_name"] },
  connection_credentials: { pk: ["user_id", "provider"] },
  provider_tokens: { pk: ["user_id", "provider"] },
  // Created with user_id from the start (workout-library.js); listed so the
  // scoped database enforces the filter.
  training_capabilities: { pk: ["user_id", "sport", "system"] },
  workout_feedback: {},
  coach_reflections: {},
  fluid_log: {},
  workout_schedule_links: {},
  training_profile: {},
  week_plan_preferences: {},
  week_plan_overrides: {},
  athlete_state: {},
  assistant_chats: {},
  assistant_messages: {},
  exercise_videos: {},
  api_cache_versions: {}
};
const PERSONAL_TABLE_PATTERN = new RegExp("\\b(" + Object.keys(PERSONAL_TABLES).join("|") + ")\\b", "i");

let tenancyReady = false;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function ownerEmail(env) {
  return normalizeEmail(env.OWNER_EMAIL);
}

// Handlers make sure their tables exist (CREATE … IF NOT EXISTS) on every
// request. Each is a write that D1 runs on the primary, one at a time, so once a
// statement has succeeded on this database in this isolate it is not sent again.
const IDEMPOTENT_SCHEMA = /^\s*CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/i;
const schemaDoneByDb = new WeakMap();
const REAL = Symbol("statement");
function schemaStatement(statement, sql, schemaDone) {
  return {
    [REAL]: statement,
    bind: (...values) => schemaStatement(statement.bind(...values), sql, schemaDone),
    async run() {
      if (schemaDone.has(sql)) return { success: true, results: [], meta: { changes: 0 } };
      const result = await statement.run();
      schemaDone.add(sql);
      return result;
    },
    first: (...args) => statement.first(...args),
    all: (...args) => statement.all(...args),
    raw: (...args) => statement.raw(...args)
  };
}

// A D1 facade that refuses statements touching personal tables unless they
// mention user_id, so a missed WHERE clause fails instead of leaking data.
export function scopedDb(db, userId) {
  if (!db) return db;
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("A user id is required for database access");
  if (!schemaDoneByDb.has(db)) schemaDoneByDb.set(db, new Set());
  const schemaDone = schemaDoneByDb.get(db);
  const check = query => {
    const sql = String(query);
    if (/^\s*(CREATE|ALTER|DROP|PRAGMA)\b/i.test(sql)) return;
    if (PERSONAL_TABLE_PATTERN.test(sql) && !/\buser_id\b/i.test(sql)) {
      throw new Error("Unscoped query on personal data: " + sql.replace(/\s+/g, " ").slice(0, 120));
    }
  };
  return {
    userId: id,
    prepare(query) { check(query); const statement = db.prepare(query); return IDEMPOTENT_SCHEMA.test(query) ? schemaStatement(statement, String(query), schemaDone) : statement; },
    batch(statements) { return db.batch(statements.map(s => s?.[REAL] || s)); },
    exec(query) { check(query); return db.exec(query); },
    dump() { throw new Error("dump is not available on a user-scoped database"); }
  };
}

// The env every handler sees for one user: scoped DB, identity, and no access
// to the owner's legacy global credentials unless this is the owner.
export function userEnv(env, user) {
  const scoped = { ...env, DB: scopedDb(env.DB, user.id), RAW_DB: env.DB, USER_ID: user.id, USER_EMAIL: user.email, USER_ROLE: user.role, USER_IS_OWNER: user.isOwner === true };
  if (!scoped.USER_IS_OWNER) {
    delete scoped.GOOGLE_REFRESH_TOKEN;
    delete scoped.INTERVALS_API_KEY;
  }
  return scoped;
}

// Each call upgrades for at most this long; large tables are copied in chunks
// across several requests or cron runs, so no single D1 query gets too big.
const UPGRADE_BUDGET_MS = 20 * 1000;
const COPY_CHUNK_ROWS = 5000;

// Workers Builds preview versions share the production database, so only the
// production hostnames (and cron runs, which previews never get) may upgrade it.
// The staging copy has its own database and upgrades it from its APP_ORIGIN.
const PRODUCTION_HOSTS = new Set(["petrfitnessdata.eu", "health-api.chelseafc-czsk.workers.dev"]);
export function mayUpgradeFrom(request, env = {}) {
  if (!request) return true;
  const host = new URL(request.url).hostname;
  return PRODUCTION_HOSTS.has(host) || (env.ENVIRONMENT === "staging" && Boolean(env.APP_ORIGIN) && new URL(env.APP_ORIGIN).hostname === host);
}

export async function ensureTenancy(db, env, { budgetMs = UPGRADE_BUDGET_MS, chunkRows = COPY_CHUNK_ROWS, request = null } = {}) {
  if (tenancyReady || !db) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const version = await db.prepare("SELECT value FROM schema_meta WHERE key='tenancy_version'").first();
  if (version?.value === TENANCY_VERSION) { tenancyReady = true; return; }

  const owner = ownerEmail(env);
  if (!owner) throw new Error("OWNER_EMAIL is not configured");
  if (!mayUpgradeFrom(request, env)) throw new TenancyUpgradeInProgress("The database has not been upgraded yet; previews cannot upgrade it.");
  if (!(await acquireLock(db))) throw new TenancyUpgradeInProgress();
  const deadline = Date.now() + budgetMs;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        google_sub TEXT UNIQUE,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at TEXT
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS user_invites (
        email TEXT PRIMARY KEY,
        invited_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare("INSERT INTO users(email, role) VALUES(?, 'admin') ON CONFLICT(email) DO UPDATE SET role='admin'").bind(owner)
    ]);
    const ownerRow = await db.prepare("SELECT id FROM users WHERE email=?").bind(owner).first();
    for (const [table, spec] of Object.entries(PERSONAL_TABLES)) {
      if (!(await upgradeTable(db, table, spec, ownerRow.id, deadline, chunkRows))) throw new TenancyUpgradeInProgress();
    }
    await db.prepare("INSERT INTO schema_meta(key, value) VALUES('tenancy_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP").bind(TENANCY_VERSION).run();
    tenancyReady = true;
  } finally {
    await db.prepare("DELETE FROM schema_meta WHERE key='tenancy_lock'").run();
  }
}

export class TenancyUpgradeInProgress extends Error {
  constructor(message = "Database upgrade in progress, try again in a minute.") { super(message); this.name = "TenancyUpgradeInProgress"; }
}

async function acquireLock(db) {
  const now = Date.now();
  const inserted = await db.prepare("INSERT INTO schema_meta(key, value) VALUES('tenancy_lock', ?) ON CONFLICT(key) DO NOTHING").bind(String(now)).run();
  if (inserted.meta?.changes) return true;
  const lock = await db.prepare("SELECT value FROM schema_meta WHERE key='tenancy_lock'").first();
  if (lock && now - Number(lock.value) > LOCK_STALE_MS) {
    const taken = await db.prepare("UPDATE schema_meta SET value=? WHERE key='tenancy_lock' AND value=?").bind(String(now), lock.value).run();
    return Boolean(taken.meta?.changes);
  }
  return false;
}

// Rebuilds an existing table with user_id and per-user keys, copying every
// column it actually has (the production schema of some tables predates this
// repository). Rows are copied in rowid order and the progress is stored, so an
// interrupted upgrade resumes where it stopped; the old and new tables are
// swapped in one batch at the end. Returns false when the time budget ran out.
// Tables that do not exist yet are created later by their code.
async function upgradeTable(db, table, spec, ownerId, deadline, chunkRows) {
  const master = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").bind(table).first();
  if (!master) return true;
  const columns = (await db.prepare(`PRAGMA table_info(${table})`).all()).results || [];
  if (columns.some(c => c.name === "user_id")) return true;
  const plan = rebuildPlan(table, spec, columns, /AUTOINCREMENT/i.test(master.sql || ""), ownerId);
  const cursorKey = `tenancy_cursor:${table}`;
  const tempExists = await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?").bind(plan.temp).first();
  if (!tempExists) {
    await db.batch([
      db.prepare(plan.create),
      db.prepare("INSERT INTO schema_meta(key, value) VALUES(?, '0') ON CONFLICT(key) DO UPDATE SET value='0'").bind(cursorKey)
    ]);
  }
  let cursor = Number((await db.prepare("SELECT value FROM schema_meta WHERE key=?").bind(cursorKey).first())?.value || 0);
  // At least one chunk per call, so every run makes progress.
  for (let chunk = 0; ; chunk++) {
    if (chunk > 0 && Date.now() >= deadline) return false;
    const last = await db.prepare(`SELECT MAX(rowid) AS last FROM (SELECT rowid FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?)`).bind(cursor, chunkRows).first();
    if (last?.last == null) break;
    await db.batch([
      db.prepare(plan.copy).bind(cursor, last.last),
      db.prepare("UPDATE schema_meta SET value=?, updated_at=CURRENT_TIMESTAMP WHERE key=?").bind(String(last.last), cursorKey)
    ]);
    cursor = Number(last.last);
  }
  await db.batch([...plan.swap.map(sql => db.prepare(sql)), db.prepare("DELETE FROM schema_meta WHERE key=?").bind(cursorKey)]);
  return true;
}

export function rebuildPlan(table, spec, columns, autoincrement, ownerId) {
  const temp = `${table}__tenancy`;
  const names = columns.map(c => c.name);
  const intPk = !spec.pk && columns.filter(c => c.pk).length === 1 && columns.find(c => c.pk && /^INTEGER$/i.test(c.type));
  const defs = [`user_id INTEGER NOT NULL`];
  for (const c of columns) {
    let def = `${quote(c.name)} ${c.type || ""}`.trim();
    if (intPk && c.pk) def += " PRIMARY KEY" + (autoincrement ? " AUTOINCREMENT" : "");
    else if (c.notnull) def += " NOT NULL";
    // Parenthesised so expression defaults such as datetime('now') stay valid.
    if (c.dflt_value != null && !(intPk && c.pk)) def += ` DEFAULT (${c.dflt_value})`;
    defs.push(def);
  }
  if (spec.pk) defs.push(`PRIMARY KEY (${spec.pk.map(quote).join(", ")})`);
  for (const unique of spec.unique || []) defs.push(`UNIQUE (${unique.map(quote).join(", ")})`);
  const columnList = names.map(quote).join(", ");
  return {
    temp,
    create: `CREATE TABLE ${temp} (${defs.join(", ")})`,
    // OR IGNORE keeps a repeated chunk (after an interrupted run) harmless.
    copy: `INSERT OR IGNORE INTO ${temp} (user_id, ${columnList}) SELECT ${Number(ownerId)}, ${columnList} FROM ${table} WHERE rowid > ? AND rowid <= ? ORDER BY rowid`,
    swap: [
      `DROP TABLE ${table}`,
      `ALTER TABLE ${temp} RENAME TO ${table}`,
      // Only indexes whose columns this table actually has.
      ...(spec.indexes || []).map((cols, i) => [cols, i]).filter(([cols]) => cols.every(col => col === "user_id" || names.includes(col.split(" ")[0])))
        .map(([cols, i]) => `CREATE INDEX IF NOT EXISTS idx_${table}_user_${i} ON ${table}(${cols.join(", ")})`)
    ]
  };
}

function quote(name) {
  return /^[a-z_][a-z0-9_]*$/i.test(name) ? name : `"${String(name).replace(/"/g, '""')}"`;
}

// Users and invitations.

export function publicUser(row, env) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name || null, role: row.role, isAdmin: row.role === "admin", isOwner: normalizeEmail(row.email) === ownerEmail(env) };
}

export async function findUser(db, id, env) {
  const row = await db.prepare("SELECT id, email, name, role, disabled FROM users WHERE id=?").bind(Number(id)).first();
  if (!row || row.disabled) return null;
  return publicUser(row, env);
}

export async function ownerUser(db, env) {
  const row = await db.prepare("SELECT id, email, name, role, disabled FROM users WHERE email=?").bind(ownerEmail(env)).first();
  return row && !row.disabled ? publicUser(row, env) : null;
}

// Signs a verified Google identity in. Only the owner, existing users and
// invited emails get an account; the invitation is consumed on first login.
export async function signInGoogleUser(db, env, { sub, email, name }) {
  const address = normalizeEmail(email);
  if (!sub || !address) return null;
  let row = await db.prepare("SELECT id, email, name, role, disabled, google_sub FROM users WHERE google_sub=?").bind(String(sub)).first();
  if (!row) {
    row = await db.prepare("SELECT id, email, name, role, disabled, google_sub FROM users WHERE email=?").bind(address).first();
    if (row && row.google_sub && row.google_sub !== String(sub)) return null;
  }
  if (!row) {
    const invite = await db.prepare("SELECT email FROM user_invites WHERE email=?").bind(address).first();
    if (!invite && address !== ownerEmail(env)) return null;
    await db.prepare("INSERT INTO users(email, role) VALUES(?, ?)").bind(address, address === ownerEmail(env) ? "admin" : "user").run();
    row = await db.prepare("SELECT id, email, name, role, disabled, google_sub FROM users WHERE email=?").bind(address).first();
  }
  if (row.disabled) return null;
  await db.batch([
    db.prepare("UPDATE users SET google_sub=?, email=?, name=?, last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(sub), address, name ? String(name).slice(0, 120) : row.name, row.id),
    db.prepare("DELETE FROM user_invites WHERE email=?").bind(address)
  ]);
  return publicUser({ ...row, email: address, name: name || row.name }, env);
}

export async function listUsersAndInvites(db) {
  const [users, invites] = await Promise.all([
    db.prepare("SELECT id, email, name, role, disabled, created_at, last_login_at FROM users ORDER BY id").all(),
    db.prepare("SELECT email, created_at FROM user_invites ORDER BY created_at DESC").all()
  ]);
  return { users: users.results || [], invites: invites.results || [] };
}

export async function inviteUser(db, email, invitedBy) {
  const address = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 254) throw new Error("Zadej platný e-mail.");
  const existing = await db.prepare("SELECT id FROM users WHERE email=?").bind(address).first();
  if (existing) throw new Error("Tento uživatel už má přístup.");
  await db.prepare("INSERT INTO user_invites(email, invited_by) VALUES(?, ?) ON CONFLICT(email) DO NOTHING").bind(address, Number(invitedBy) || null).run();
  return address;
}

export async function removeInvite(db, email) {
  await db.prepare("DELETE FROM user_invites WHERE email=?").bind(normalizeEmail(email)).run();
}

export async function setUserDisabled(db, env, id, disabled) {
  const row = await db.prepare("SELECT email FROM users WHERE id=?").bind(Number(id)).first();
  if (!row) throw new Error("Uživatel neexistuje.");
  if (normalizeEmail(row.email) === ownerEmail(env)) throw new Error("Správce nelze zablokovat.");
  await db.prepare("UPDATE users SET disabled=? WHERE id=?").bind(disabled ? 1 : 0, Number(id)).run();
}

// Users that have at least one of the given providers connected, for cron
// jobs and automations that act on everyone's data.
export async function usersWithProviders(db, env, providers) {
  const placeholders = providers.map(() => "?").join(", ");
  const rows = await db.prepare(`SELECT DISTINCT u.id, u.email, u.name, u.role, u.disabled FROM users u JOIN connection_credentials c ON c.user_id = u.id WHERE u.disabled = 0 AND c.provider IN (${placeholders}) ORDER BY u.id`).bind(...providers).all().catch(() => ({ results: [] }));
  const list = (rows.results || []).map(row => publicUser(row, env));
  const owner = await ownerUser(db, env);
  if (owner && !list.some(u => u.id === owner.id)) list.unshift(owner);
  return list;
}

export function _resetTenancyForTest() { tenancyReady = false; }
