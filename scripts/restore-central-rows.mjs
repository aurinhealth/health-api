// One-off repair: before #599 the account move (move-legacy-users.mjs) also
// copied CENTRAL_PERSONAL_TABLES to a user's shard and deleted them centrally.
// The app reads those tables only from the central database, so the 2026-10-25
// run left some accounts without their consents, connections, push token or
// shared workouts. This copies each such row back from every shard to the
// central database and then deletes the shard copy:
//
//   1. insert the row centrally unless its key is taken (ON CONFLICT DO
//      NOTHING: a row the app wrote since stays),
//   2. delete the shard copy once the central database holds that key for the
//      same account; otherwise the row stays on the shard and is counted.
//
//   node scripts/restore-central-rows.mjs [--staging]           dry run: counts only
//   node scripts/restore-central-rows.mjs [--staging] --apply   restore
//
// Runs in the "Restore central rows" workflow. Safe to run again. No row
// contents are logged: the Actions logs are public.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig, shardPlan } from './provision-user-shards.mjs';
import { cloudflareD1 } from './food-catalog-tools.mjs';
import { CENTRAL_PERSONAL_TABLES, FOOD_CATALOG_TABLES } from '../src/user-data-routing.js';
import { PERSONAL_TABLES } from '../src/tenancy.js';

const PAGE_ROWS = 200;
const name = value => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Unexpected identifier');
  return value;
};
// The food contributions live in the food catalogue, which this does not touch.
const TABLES = [...CENTRAL_PERSONAL_TABLES].filter(t => !FOOD_CATALOG_TABLES.has(t)).sort();
const LIST = `(${TABLES.map(t => `'${name(t)}'`).join(',')})`;

async function rows(api, db, sql, params = []) {
  return (await api.query(db, sql, params)).results || [];
}

async function columnsOf(api, db, table) {
  return rows(api, db, `PRAGMA table_info(${name(table)})`);
}

// The columns that name a row: the primary key, else the table's unique key,
// else the whole row.
function keyOf(table, central) {
  const pk = central.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
  if (pk.length) return pk;
  return PERSONAL_TABLES[table]?.unique?.[0] || central.map(c => c.name);
}

export async function restoreCentralRows({ api, plan, ids, apply, log = console.log }) {
  const core = plan.core.database_id;
  const result = [];
  for (const shard of plan.shards) {
    const db = ids[shard.name];
    if (!db || db === core) continue;
    const present = (await rows(api, db, `SELECT name FROM sqlite_master WHERE type='table' AND name IN ${LIST} ORDER BY name`)).map(r => r.name);
    for (const table of present) {
      const central = await columnsOf(api, core, table);
      if (!central.length) { log(`${shard.name}: ${table} has no table in the central database; left`); continue; }
      const there = new Set((await columnsOf(api, db, table)).map(c => c.name));
      const columns = central.map(c => c.name).filter(c => there.has(c));
      if (!columns.includes('user_id')) throw new Error('Central personal table without user_id: ' + table);
      const key = keyOf(table, central);
      if (!key.every(c => columns.includes(c))) throw new Error(`${shard.name}: ${table} lacks key columns`);
      const total = Number((await rows(api, db, `SELECT COUNT(*) AS n FROM ${name(table)}`))[0]?.n || 0);
      if (!total) continue;
      const users = (await rows(api, db, `SELECT DISTINCT user_id FROM ${name(table)} ORDER BY user_id`)).map(r => Number(r.user_id));
      log(`${shard.name}: ${table} ${total} rows (accounts ${users.join(', ')})`);
      // Per row: back to the central database (missing there), already there for the same
      // account (a newer row the app wrote; the shard copy only goes), or kept on the shard
      // (another account holds the key). The dry run counts the same probe without changing anything.
      let restored = 0, kept = 0, left = 0;
      const probe = row => rows(api, core, `SELECT user_id FROM ${name(table)} WHERE ${key.map(c => `${name(c)} IS ?`).join(' AND ')} LIMIT 1`, key.map(c => row[c]));
      for (let after = Number.MIN_SAFE_INTEGER; ;) {
        const page = await rows(api, db, `SELECT rowid AS restore_rowid, ${columns.map(name).join(', ')} FROM ${name(table)} WHERE rowid>? ORDER BY rowid LIMIT ?`, [after, PAGE_ROWS]);
        if (!page.length) break;
        after = page[page.length - 1].restore_rowid;
        for (const row of page) {
          const before = await probe(row);
          if (before.length && Number(before[0].user_id) !== Number(row.user_id)) { left++; continue; }
          if (before.length) kept++; else restored++;
          if (!apply) continue;
          if (!before.length) {
            await api.query(core, `INSERT INTO ${name(table)} (${columns.map(name).join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`, columns.map(c => row[c]));
            const held = await probe(row);
            if (!held.length || Number(held[0].user_id) !== Number(row.user_id)) { restored--; left++; continue; }
          }
          await api.query(db, `DELETE FROM ${name(table)} WHERE rowid=?`, [row.restore_rowid]);
        }
      }
      log(`${shard.name}: ${table} ${apply ? '' : 'would be '}${restored} back in the central database, ${kept} already there for the same account (shard copy ${apply ? 'deleted' : 'to delete'}), ${left} left on the shard (key held by another account)`);
      result.push({ shard: shard.name, table, rows: total, restored, kept, left });
    }
  }
  if (!result.length) log('No central rows on any user database.');
  if (!apply && result.length) log('Dry run. Run again with apply to restore the rows.');
  return result;
}

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
    await restoreCentralRows({ api: patient(cloudflare), plan, ids, apply: process.argv.includes('--apply') });
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
