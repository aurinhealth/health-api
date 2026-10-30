// One-off: the accounts that existed when user data routing was switched on
// (route 'legacy') still keep their history in the central database
// (health-data), which has no EU jurisdiction. This moves each such account
// to a user data database in the EU, the way a new account starts:
//
//   1. copy the account's rows of every personal table a shard holds (not
//      CENTRAL_PERSONAL_TABLES) to the chosen shard,
//   2. point the account's route at the shard (from then on the Worker reads
//      and writes there),
//   3. copy the rows whose key the shard lacks (what the app wrote in
//      between),
//   4. delete from the central database each row the shard now holds (the
//      same key, or the same row where a table has no key).
// An account already on a shard that still has central rows (a run cut off
// after step 2) gets steps 3 and 4.
//
//   node scripts/move-legacy-users.mjs [--staging]           dry run: counts only
//   node scripts/move-legacy-users.mjs [--staging] --apply   move
//
// Runs in the "Move legacy accounts" workflow with the environment's
// Cloudflare credentials. Safe to run again: a copy never overwrites a row the
// shard has, and a central row goes only once the shard holds it. No row
// contents are logged: the Actions logs are public.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig, shardPlan } from './provision-user-shards.mjs';
import { cloudflareD1 } from './food-catalog-tools.mjs';
import { USER_ROUTES_SQL, routeBinding } from '../src/user-data-shards.js';
import { PERSONAL_TABLES } from '../src/tenancy.js';
import { shardTableNames } from '../src/user-data-routing.js';

// D1 takes at most 100 bound parameters per statement.
const MAX_PARAMS = 99;
const PAGE_ROWS = 200;
const STATEMENT_BYTES = 256 * 1024;
const REQUEST_BYTES = 2 * 1024 * 1024;
const name = value => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Unexpected identifier');
  return value;
};

// Literal names (more tables than D1 takes parameters) of the personal tables
// a shard holds, as the router reads them. The rest (sign-in, consents,
// connections, subscriptions, push) stay in the central database, the food
// contributions in the food catalogue.
const SHARD_TABLE_LIST = `(${shardTableNames(PERSONAL_TABLES).map(t => `'${name(t)}'`).join(',')})`;

async function rows(api, db, sql, params = []) {
  return (await api.query(db, sql, params)).results || [];
}

// The shard a legacy account moves to: ready, open to new accounts, with
// room, and configured for this Worker; the emptiest first.
export async function chooseShard(api, core, plan) {
  const shards = await rows(api, core, `SELECT s.shard_key, s.binding_name, s.state, s.accepting_new, s.max_users,
      (SELECT COUNT(*) FROM user_data_routes r WHERE r.shard_key=s.shard_key) AS users
    FROM user_data_shards s WHERE s.state='ready' AND s.accepting_new=1 ORDER BY users, s.shard_key`);
  for (const shard of shards) {
    if (Number(shard.users) >= Number(shard.max_users)) continue;
    let binding;
    try { binding = routeBinding(shard); } catch { continue; }
    const configured = plan.shards.find(s => s.key === shard.shard_key && s.binding === binding);
    if (configured) return configured;
  }
  throw new Error('No user database has room for the account');
}

// Columns, the key that names a row, and the statement that creates the table.
async function tableInfo(api, db, table) {
  const columns = await rows(api, db, `PRAGMA table_info(${name(table)})`);
  return {
    columns: columns.map(c => c.name),
    definitions: new Map(columns.map(c => [c.name, c])),
    key: columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name)
  };
}

export async function personalTables(api, core, shard) {
  const list = SHARD_TABLE_LIST;
  const central = await rows(api, core, `SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ${list} ORDER BY name`);
  const indexes = await rows(api, core, `SELECT tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND tbl_name IN ${list}`);
  const there = new Set((await rows(api, shard, `SELECT name FROM sqlite_master WHERE type='table' AND name IN ${list}`)).map(r => r.name));
  const tables = [];
  for (const { name: table, sql } of central) {
    const info = await tableInfo(api, core, table);
    if (!info.columns.includes('user_id')) throw new Error('Personal table without user_id: ' + table);
    const spec = PERSONAL_TABLES[table];
    // A key that includes user_id names one person's row; otherwise the whole row does.
    const key = info.key.length && (info.key.includes('user_id') || info.key.join() === 'id') ? info.key
      : spec.unique?.[0] || info.columns;
    let create = [];
    if (there.has(table)) {
      const shardColumns = new Set((await tableInfo(api, shard, table)).columns);
      // A column the app added later (ALTER TABLE in its ensure… helper) that
      // this shard never needed yet comes along with the same definition.
      for (const column of info.columns.filter(c => !shardColumns.has(c))) {
        const { type, notnull, dflt_value: fallback } = info.definitions.get(column);
        if (notnull && fallback == null) throw new Error(`The user database lacks column ${table}.${column}, which has no default`);
        create.push(`ALTER TABLE ${name(table)} ADD COLUMN ${name(column)}${type ? ' ' + type : ''}${notnull ? ' NOT NULL' : ''}${fallback != null ? ' DEFAULT ' + fallback : ''}`);
      }
    } else {
      create = [sql.replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS '),
        ...indexes.filter(i => i.tbl_name === table).map(i => i.sql.replace(/^CREATE (UNIQUE )?INDEX\s+(?!IF NOT EXISTS)/i, 'CREATE $1INDEX IF NOT EXISTS '))];
    }
    tables.push({ name: table, columns: info.columns, key, create, missing: !there.has(table) });
  }
  return tables;
}

// Each row of the account, a page at a time, by rowid.
async function* accountRows(api, db, table, userId) {
  const columns = table.columns.map(name).join(', ');
  for (let after = Number.MIN_SAFE_INTEGER; ;) {
    const page = await rows(api, db, `SELECT rowid AS move_rowid, ${columns} FROM ${name(table.name)} WHERE user_id=? AND rowid>? ORDER BY rowid LIMIT ?`,
      [userId, after, PAGE_ROWS]);
    if (!page.length) return;
    for (const row of page) {
      for (const column of table.columns) {
        const value = row[column];
        if (value !== null && typeof value !== 'string' && typeof value !== 'number') throw new Error(`Unexpected value type in ${table.name}.${column}`);
      }
    }
    yield page;
    after = page[page.length - 1].move_rowid;
  }
}

const size = row => Object.values(row).reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 8), 0);

// Multi-row inserts under D1's parameter limit, each about STATEMENT_BYTES at most.
export function insertStatements(table, page) {
  const perStatement = Math.max(1, Math.floor(MAX_PARAMS / table.columns.length));
  const statements = [];
  let part = [], bytes = 0;
  const flush = () => {
    if (!part.length) return;
    statements.push({
      sql: `INSERT INTO ${name(table.name)} (${table.columns.map(name).join(', ')}) VALUES ${part.map(() => `(${table.columns.map(() => '?').join(', ')})`).join(', ')} ON CONFLICT DO NOTHING`,
      params: part.flatMap(row => table.columns.map(c => row[c])),
      bytes
    });
    part = []; bytes = 0;
  };
  for (const row of page) {
    const n = size(row);
    if (part.length >= perStatement || (part.length && bytes + n > STATEMENT_BYTES)) flush();
    part.push(row); bytes += n;
  }
  flush();
  return statements;
}

// Requests of about REQUEST_BYTES at most.
export function requests(statements) {
  const out = [];
  let current = [], bytes = 0;
  for (const { bytes: n = 0, ...statement } of statements) {
    if (current.length && (bytes + n > REQUEST_BYTES || current.length >= 50)) { out.push(current); current = []; bytes = 0; }
    current.push(statement); bytes += n;
  }
  if (current.length) out.push(current);
  return out;
}

// Integer ids travel with their rows (assistant_messages point at their
// chat's id): another account's row with the same id would keep the copy out.
export async function idClashes(api, core, shard, table, userId) {
  if (table.key.join() !== 'id' || table.missing) return 0;
  const range = (await rows(api, core, `SELECT MIN(id) AS low, MAX(id) AS high FROM ${name(table.name)} WHERE user_id=?`, [userId]))[0];
  if (range?.low == null) return 0;
  const found = await rows(api, shard, `SELECT COUNT(*) AS n FROM ${name(table.name)} WHERE id BETWEEN ? AND ? AND user_id<>?`, [range.low, range.high, userId]);
  return Number(found[0]?.n || 0);
}

export async function copyAccount(api, core, shard, tables, userId) {
  let copied = 0;
  for (const table of tables) {
    for await (const page of accountRows(api, core, table, userId)) {
      for (const request of requests(insertStatements(table, page))) await api.batch(shard, request);
      copied += page.length;
    }
  }
  return copied;
}

const keyOf = (columns, row) => JSON.stringify(columns.map(c => row[c]));

// After the switch: copies each central row whose key the shard lacks (what
// the app wrote during the first copy; a key the shard has is newer there),
// then deletes from the central database each row the shard holds. Returns
// per table the rows copied, deleted and left.
export async function settleAccount(api, core, shard, tables, userId) {
  const result = [];
  for (const table of tables) {
    const held = new Set();
    const readShard = async () => {
      held.clear();
      for await (const page of accountRows(api, shard, table, userId)) for (const row of page) held.add(keyOf(table.key, row));
    };
    await readShard();
    const missing = [];
    for await (const page of accountRows(api, core, table, userId)) {
      for (const row of page) if (!held.has(keyOf(table.key, row))) missing.push(row);
    }
    if (missing.length) {
      for (let i = 0; i < missing.length; i += PAGE_ROWS) {
        for (const request of requests(insertStatements(table, missing.slice(i, i + PAGE_ROWS)))) await api.batch(shard, request);
      }
      await readShard();
    }
    let left = 0;
    const doomed = [];
    for await (const page of accountRows(api, core, table, userId)) {
      for (const row of page) {
        if (held.has(keyOf(table.key, row))) doomed.push(row.move_rowid);
        else left++;
      }
    }
    const statements = [];
    for (let i = 0; i < doomed.length; i += MAX_PARAMS - 1) {
      const ids = doomed.slice(i, i + MAX_PARAMS - 1);
      statements.push({ sql: `DELETE FROM ${name(table.name)} WHERE user_id=? AND rowid IN (${ids.map(() => '?').join(',')})`, params: [userId, ...ids] });
    }
    for (let i = 0; i < statements.length; i += 50) await api.batch(core, statements.slice(i, i + 50));
    result.push({ table: table.name, copied: missing.length, deleted: doomed.length, left });
  }
  return result;
}

function settled(log, userId, database, result) {
  const deleted = result.reduce((s, r) => s + r.deleted, 0), copied = result.reduce((s, r) => s + r.copied, 0);
  const left = result.filter(r => r.left);
  log(`Account ${userId}: ${copied} late rows copied, ${deleted} rows deleted from the central database` + (left.length ? `; left there (no matching row in ${database}): ${left.map(r => `${r.table} ${r.left}`).join(', ')}` : ''));
  return { deleted, left };
}

// Accounts already routed to a shard that still have personal rows in the
// central database (a move cut off after the switch).
async function leftoverAccounts(api, core, plan, ids) {
  const list = SHARD_TABLE_LIST;
  const present = (await rows(api, core, `SELECT name FROM sqlite_master WHERE type='table' AND name IN ${list}`)).map(r => r.name);
  const users = new Set();
  for (const table of present) {
    for (const row of await rows(api, core, `SELECT DISTINCT user_id FROM ${name(table)}`)) users.add(Number(row.user_id));
  }
  const routes = new Map((await rows(api, core, USER_ROUTES_SQL)).map(r => [Number(r.user_id), r]));
  const found = [];
  for (const userId of [...users].sort((x, y) => x - y)) {
    const route = routes.get(userId);
    if (!route || route.shard_key === 'legacy' || !Number.isSafeInteger(userId)) continue;
    let binding;
    try { binding = routeBinding(route); } catch { continue; }
    const target = plan.shards.find(s => s.key === route.shard_key && s.binding === binding);
    if (target && ids[target.name] && ids[target.name] !== core) found.push({ userId, target, shard: ids[target.name] });
  }
  return found;
}

export async function moveLegacyUsers({ api, plan, ids, apply, log = console.log }) {
  const core = plan.core.database_id;
  const legacy = (await rows(api, core, USER_ROUTES_SQL + " WHERE r.shard_key='legacy' ORDER BY r.user_id")).map(r => Number(r.user_id));
  const leftovers = await leftoverAccounts(api, core, plan, ids);
  if (!legacy.length && !leftovers.length) { log('No account is on the legacy route.'); return []; }
  if (legacy.length) log(`Accounts on the legacy route: ${legacy.join(', ')}`);
  const moved = [];
  for (const { userId, target, shard } of leftovers) {
    const tables = await personalTables(api, core, shard);
    log(`Account ${userId} is on ${target.name} but still has rows in the central database`);
    if (!apply) continue;
    const creates = tables.flatMap(t => t.create).map(sql => ({ sql, params: [] }));
    if (creates.length) await api.batch(shard, creates);
    moved.push({ userId, shard: target.name, ...settled(log, userId, target.name, await settleAccount(api, core, shard, tables, userId)) });
  }
  for (const userId of legacy) {
    if (!Number.isSafeInteger(userId)) throw new Error('Unexpected user id');
    const target = await chooseShard(api, core, plan);
    const shard = ids[target.name];
    if (!shard || shard === core) throw new Error('Unknown user database ' + target.name);
    const tables = await personalTables(api, core, shard);
    let total = 0;
    for (const table of tables) {
      const n = Number((await rows(api, core, `SELECT COUNT(*) AS n FROM ${name(table.name)} WHERE user_id=?`, [userId]))[0]?.n || 0);
      table.rows = n;
      total += n;
      if (n && await idClashes(api, core, shard, table, userId)) throw new Error(`${table.name}: ids of account ${userId} are taken in ${target.name}; nothing was moved`);
    }
    const added = tables.reduce((n, t) => n + t.create.filter(sql => /^ALTER/.test(sql)).length, 0);
    if (added) log(`${target.name} gets ${added} columns it lacks (${tables.filter(t => t.create.some(sql => /^ALTER/.test(sql))).map(t => t.name).join(', ')})`);
    log(`Account ${userId} → ${target.name}: ${total} rows in ${tables.filter(t => t.rows).length} tables (${tables.filter(t => t.rows).map(t => `${t.name} ${t.rows}`).join(', ')})`);
    if (!apply) continue;

    const creates = tables.flatMap(t => t.create).map(sql => ({ sql, params: [] }));
    if (creates.length) await api.batch(shard, creates);
    await copyAccount(api, core, shard, tables, userId);
    const switched = await api.query(core, "UPDATE user_data_routes SET shard_key=? WHERE user_id=? AND shard_key='legacy'", [target.key, userId]);
    if (Number(switched.meta?.changes) !== 1) throw new Error(`The route of account ${userId} changed meanwhile; its rows stay in the central database`);
    log(`Account ${userId} now reads and writes ${target.name}`);
    moved.push({ userId, shard: target.name, ...settled(log, userId, target.name, await settleAccount(api, core, shard, tables, userId)) });
  }
  if (!apply) log('Dry run. Run again with apply to move the accounts.');
  return moved;
}

// Retries a request that failed on the way (D1 sometimes answers 429 or 5xx);
// every statement here can run twice without harm.
function patient(api) {
  async function batch(id, statements) {
    for (let attempt = 1; ; attempt++) {
      try { return await api.batch(id, statements); }
      catch (error) {
        if (attempt >= 4) throw error;
        await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
  }
  return { batch, query: async (id, sql, params = []) => (await batch(id, [{ sql, params }]))[0] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const environment = process.argv.includes('--staging') ? 'staging' : '';
  const plan = shardPlan(parseConfig(readFileSync('wrangler.jsonc', 'utf8')), environment);
  const cloudflare = cloudflareD1({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN });
  (async () => {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const data = await cloudflare.request('?per_page=100&page=' + page);
      all.push(...data.result);
      if (page >= (data.result_info?.total_pages || 1)) break;
    }
    const ids = {};
    for (const shard of plan.shards) {
      const db = all.find(d => d.name === shard.name);
      if (db && db.uuid !== plan.core.database_id && db.jurisdiction === 'eu') ids[shard.name] = db.uuid;
    }
    await moveLegacyUsers({ api: patient(cloudflare), plan, ids, apply: process.argv.includes('--apply') });
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
