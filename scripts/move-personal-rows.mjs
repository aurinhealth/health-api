// One-off: rows of manual_activity_pairs and activity_energy_choices written
// before these tables became personal (per-user, sharded) data can still sit
// in the central database (health-data), where the app no longer reads them
// for users on a shard. This copies each such user's rows to the database the
// user is routed to (user_data_routes, as src/user-data-shards.js resolves it)
// and then deletes them from the central database.
//
//   node scripts/move-personal-rows.mjs           dry run: counts only
//   node scripts/move-personal-rows.mjs --apply   copy, verify, delete
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, like the deploy jobs.
// Safe to run again: the copy never overwrites a row the shard already has (a
// row written there after the change is newer), and a central row is deleted
// only once the shard holds a row for the same key. Users on the 'legacy'
// route keep their data in the central database and are left alone. Row
// contents are never printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig, shardPlan } from './provision-user-shards.mjs';
import { USER_ROUTES_SQL, routeBinding } from '../src/user-data-shards.js';
import { PERSONAL_TABLES } from '../src/tenancy.js';
import { MANUAL_PAIRS_TABLE } from '../src/manual-pairs.js';
import { ENERGY_CHOICES_TABLE } from '../src/activity-energy-choices.js';

const COLUMNS = ['user_id', 'date', 'updated_at'];
export const TABLES = [
  { name: 'manual_activity_pairs', create: MANUAL_PAIRS_TABLE, columns: ['user_id', 'planned_id', 'activity_id', 'date', 'updated_at'], pk: PERSONAL_TABLES.manual_activity_pairs.pk },
  { name: 'activity_energy_choices', create: ENERGY_CHOICES_TABLE, columns: ['user_id', 'activity_id', 'date', 'choice', 'updated_at'], pk: PERSONAL_TABLES.activity_energy_choices.pk }
];
for (const table of TABLES) {
  if (!table.pk?.length || !table.pk.every(c => table.columns.includes(c)) || !COLUMNS.every(c => table.columns.includes(c))) throw new Error('Unexpected table definition ' + table.name);
}
const CHUNK = 500;

export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Unexpected number');
    return String(value);
  }
  if (typeof value !== 'string') throw new Error('Unexpected value type');
  if (value.includes('\0')) throw new Error('Unexpected NUL character');
  return "'" + value.replace(/'/g, "''") + "'";
}

// The shard database each routed user's rows belong in. routes: rows of
// USER_ROUTES_SQL; counts: [{table, user_id, n}] from the central database;
// plan: shardPlan(wrangler.jsonc).
export function planMoves(routes, counts, plan) {
  const byUser = new Map(routes.map(r => [Number(r.user_id), r]));
  const result = { moves: [], legacy: [], unrouted: [], unavailable: [] };
  for (const { table, user_id, n } of counts) {
    const userId = Number(user_id), rows = Number(n);
    if (!Number.isSafeInteger(userId) || !(rows > 0)) continue;
    const route = byUser.get(userId);
    if (!route) { result.unrouted.push({ table, userId, rows }); continue; }
    if (route.shard_key === 'legacy') { result.legacy.push({ table, userId, rows }); continue; }
    let binding;
    try { binding = routeBinding(route); } catch { result.unavailable.push({ table, userId, rows, shardKey: route.shard_key }); continue; }
    const shard = plan.shards.find(s => s.key === route.shard_key && s.binding === binding);
    if (!shard) { result.unavailable.push({ table, userId, rows, shardKey: route.shard_key }); continue; }
    result.moves.push({ table, userId, rows, shardKey: shard.key, database: shard.name });
  }
  return result;
}

// INSERT statements for the shard: a key the shard already has is kept. A
// manual pairing is also skipped when the shard pairs that activity with
// another plan (manual-pairs.js keeps one plan per activity).
export function copyStatements(table, rows) {
  const columns = table.columns.join(', ');
  return rows.map(row => {
    const values = table.columns.map(c => sqlLiteral(row[c])).join(', ');
    const guard = table.name === 'manual_activity_pairs' && row.activity_id
      ? ` WHERE NOT EXISTS (SELECT 1 FROM manual_activity_pairs WHERE user_id = ${sqlLiteral(row.user_id)} AND activity_id = ${sqlLiteral(row.activity_id)} AND planned_id != ${sqlLiteral(row.planned_id)})`
      : ' WHERE true';
    // SQLite needs the WHERE before ON CONFLICT in INSERT … SELECT.
    return `INSERT INTO ${table.name} (${columns}) SELECT ${values}${guard} ON CONFLICT DO NOTHING;`;
  });
}

const keyOf = (table, row) => JSON.stringify(table.pk.map(c => row[c]));

// The central rows the shard accounts for: the same key, or (manual pairs) the
// same activity paired with another plan there, which superseded it.
export function coveredRows(table, centralRows, shardRows) {
  const keys = new Set(shardRows.map(r => keyOf(table, r)));
  const activities = new Set(table.name === 'manual_activity_pairs' ? shardRows.filter(r => r.activity_id).map(r => JSON.stringify([r.user_id, r.activity_id])) : []);
  return centralRows.filter(r => keys.has(keyOf(table, r)) || (table.name === 'manual_activity_pairs' && r.activity_id && activities.has(JSON.stringify([r.user_id, r.activity_id]))));
}

export function deleteStatements(table, rows) {
  return rows.map(row => `DELETE FROM ${table.name} WHERE ${table.pk.map(c => `${c} = ${sqlLiteral(row[c])}`).join(' AND ')};`);
}

export function chunks(list, size = CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const userIdList = ids => {
  if (!ids.length || !ids.every(Number.isSafeInteger)) throw new Error('Unexpected user ids');
  return ids.join(',');
};

async function main() {
  const apply = process.argv.includes('--apply');
  const plan = shardPlan(parseConfig(readFileSync('wrangler.jsonc', 'utf8')));
  const central = plan.core.database_name;
  mkdirSync('.wrangler/move-personal-rows', { recursive: true });
  let fileCount = 0;
  function wrangler(args) {
    // Output is parsed, never echoed: it holds personal rows.
    try { return execFileSync('npx', ['--yes', 'wrangler@4.147.0', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error('wrangler d1 command failed on ' + args[2] + ', exit ' + error.status); }
  }
  function query(database, sql) {
    const output = JSON.parse(wrangler(['d1', 'execute', database, '--remote', '--json', '--command', sql]));
    const result = Array.isArray(output) ? output[0] : output;
    if (!result?.success) throw new Error('Query failed on ' + database);
    return result.results || [];
  }
  function execute(database, statements) {
    for (const part of chunks(statements)) {
      const file = `.wrangler/move-personal-rows/${++fileCount}.sql`;
      writeFileSync(file, part.join('\n') + '\n');
      wrangler(['d1', 'execute', database, '--remote', '--file', file]);
    }
  }

  const existing = new Set(query(central, `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${TABLES.map(t => sqlLiteral(t.name)).join(',')})`).map(r => r.name));
  const counts = [];
  for (const table of TABLES) {
    if (!existing.has(table.name)) continue;
    for (const row of query(central, `SELECT user_id, COUNT(*) AS n FROM ${table.name} GROUP BY user_id`)) counts.push({ table: table.name, ...row });
  }
  const routes = query(central, USER_ROUTES_SQL);
  const moves = planMoves(routes, counts, plan);
  const total = list => list.reduce((sum, m) => sum + m.rows, 0);
  for (const table of TABLES) {
    const of = list => list.filter(m => m.table === table.name);
    console.log(`${table.name}: ${total(of(moves.moves))} rows of ${new Set(of(moves.moves).map(m => m.userId)).size} users to move; ${total(of(moves.legacy))} rows stay (legacy route); ${total(of(moves.unrouted))} rows of users without a route; ${total(of(moves.unavailable))} rows on unavailable shards`);
  }
  if (moves.unrouted.length) console.log('Users without a route (deleted accounts or never routed), left in place: ' + [...new Set(moves.unrouted.map(m => m.userId))].join(', '));
  if (moves.unavailable.length) console.log('Users whose shard is not ready, left in place: ' + [...new Set(moves.unavailable.map(m => m.userId))].join(', '));
  if (!apply) { console.log(moves.moves.length ? 'Dry run. Run again with --apply to move the rows.' : 'Nothing to move.'); return; }

  let copied = 0, deleted = 0;
  for (const table of TABLES) {
    const byDatabase = new Map();
    for (const move of moves.moves.filter(m => m.table === table.name)) {
      if (!byDatabase.has(move.database)) byDatabase.set(move.database, []);
      byDatabase.get(move.database).push(move.userId);
    }
    for (const [database, userIds] of byDatabase) {
      const select = `SELECT ${table.columns.join(', ')} FROM ${table.name} WHERE user_id IN (${userIdList(userIds)})`;
      const rows = query(central, select);
      execute(database, [table.create + ';', ...copyStatements(table, rows)]);
      const covered = coveredRows(table, rows, query(database, select));
      execute(central, deleteStatements(table, covered));
      copied += rows.length; deleted += covered.length;
      const left = rows.length - covered.length;
      console.log(`${table.name} → ${database}: ${rows.length} rows copied, ${covered.length} deleted from ${central}${left ? `, ${left} left (not found on the shard)` : ''}`);
    }
  }
  console.log(`Done: ${copied} rows copied, ${deleted} rows deleted from ${central}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
