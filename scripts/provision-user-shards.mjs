// Runs in the existing deployment jobs with their Cloudflare credentials.
// Credentials stay in GitHub Actions; they are never stored in a Worker or
// uploaded artifact. Only empty, independently named databases are provisioned.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseConfig(text) {
  let output = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (!quoted && c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; output += '\n'; continue; }
    if (!quoted && c === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; output += ' '; continue; }
    output += c;
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
  }
  return JSON.parse(output);
}

export function shardPlan(config, environment = '') {
  if (environment !== '' && environment !== 'staging') throw new Error('Unsupported environment');
  const selected = environment ? config.env?.[environment] : config;
  const core = selected?.d1_databases?.find(d => d.binding === 'DB');
  const expected = environment ? 'health-data-staging' : 'health-data';
  if (!core || core.database_name !== expected) throw new Error('Unexpected central database');
  const count = Number(selected.vars?.USER_DATA_SHARD_COUNT);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Invalid shard count');
  return { core, shards: Array.from({ length: count }, (_, i) => {
    const suffix = String(i + 1).padStart(3, '0');
    return { key: 'data-' + suffix, binding: 'USER_DATA_' + suffix, name: expected + '-users-' + suffix };
  }) };
}

export function runtimeConfig(config, environment, plan, databases) {
  const result = structuredClone(config), selected = environment ? result.env[environment] : result;
  selected.d1_databases = [plan.core, ...plan.shards.map(shard => {
    const db = databases.find(d => d.name === shard.name);
    if (!db?.uuid || db.uuid === plan.core.database_id || db.jurisdiction !== 'eu') throw new Error('Invalid shard database');
    return { binding: shard.binding, database_name: shard.name, database_id: db.uuid, migrations_dir: 'migrations' };
  })];
  if (new Set(selected.d1_databases.map(d => d.database_id)).size !== selected.d1_databases.length) throw new Error('Duplicate database binding');
  selected.vars.USER_DATA_ROUTING = 'true';
  return result;
}

export const ACTIVATION_SQL = `
INSERT INTO user_data_routes(user_id,shard_key)
  SELECT id,'legacy' FROM users
  WHERE (SELECT value FROM schema_meta WHERE key='user_data_sharding_enabled')='0'
  ON CONFLICT(user_id) DO NOTHING;
UPDATE schema_meta SET value='1',updated_at=CURRENT_TIMESTAMP
  WHERE key='user_data_sharding_enabled' AND value='0';
`;

export async function provisionDatabases({ accountId, token, plan, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/i.test(accountId || '') || !token) throw new Error('Cloudflare credentials are missing');
  async function request(path, options = {}) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database${path}`, {
      ...options, signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Cloudflare D1 request failed: HTTP ' + response.status);
    return data;
  }
  const all = [];
  for (let page = 1; ; page++) {
    const data = await request('?per_page=100&page=' + page);
    all.push(...data.result);
    if (page >= (data.result_info?.total_pages || 1)) break;
    if (page >= 100) throw new Error('Too many database pages');
  }
  const databases = [];
  const core = all.find(d => d.uuid === plan.core.database_id);
  if (!core || core.name !== plan.core.database_name) throw new Error('Central database identity mismatch');
  const plannedNames = new Set(plan.shards.map(s => s.name));
  if (all.some(d => d.name?.startsWith(plan.core.database_name + '-users-') && !plannedNames.has(d.name))) {
    throw new Error('Refusing to remove existing user database bindings; increase or preserve shard count');
  }
  for (const shard of plan.shards) {
    let db = all.find(d => d.name === shard.name);
    if (db) db = (await request('/' + db.uuid)).result;
    else db = (await request('', { method: 'POST', body: JSON.stringify({ name: shard.name, jurisdiction: 'eu' }) })).result;
    if (db.name !== shard.name || !db.uuid || db.uuid === plan.core.database_id || db.jurisdiction !== 'eu') throw new Error('Unexpected existing shard');
    databases.push(db);
  }
  return databases;
}

async function main() {
  const environment = process.argv.includes('--staging') ? 'staging' : '';
  const activate = process.argv.includes('--activate');
  const config = parseConfig(readFileSync('wrangler.jsonc', 'utf8'));
  const plan = shardPlan(config, environment);
  const configPath = 'wrangler.runtime.jsonc';
  mkdirSync('.wrangler/user-shards', { recursive: true });
  const envArgs = environment ? ['--env', environment] : [];
  function wrangler(args) {
    // Remote schema/migration output is never echoed: a later data migration
    // could quote rows. Show only the operation and database name ourselves.
    try { return execFileSync('npx', ['--yes', 'wrangler@4', ...args, '--config', configPath, ...envArgs], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); }
    catch (error) { throw new Error('Shard deployment command failed, exit ' + error.status); }
  }
  if (activate) {
    const file = '.wrangler/user-shards/activate.sql';
    writeFileSync(file, ACTIVATION_SQL);
    wrangler(['d1', 'execute', plan.core.database_name, '--remote', '--file', file]);
    console.log('User data routing activated; existing histories remain on legacy DB.');
    return;
  }
  const databases = await provisionDatabases({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN, plan });
  writeFileSync(configPath, JSON.stringify(runtimeConfig(config, environment, plan, databases), null, 2) + '\n');
  const registry = [];
  for (const shard of plan.shards) {
    console.log('Preparing user database ' + shard.name);
    wrangler(['d1', 'execute', shard.name, '--remote', '--file', 'staging/schema.sql']);
    wrangler(['d1', 'migrations', 'apply', shard.name, '--remote']);
    wrangler(['d1', 'execute', shard.name, '--remote', '--file', 'staging/user-data-shard.sql']);
    // On later deploys preserve operator capacity/drain settings. Re-registering
    // does not reopen a full database or change existing user assignments.
    registry.push(`INSERT INTO user_data_shards(shard_key,binding_name,state,accepting_new,max_users,max_bytes) VALUES('${shard.key}','${shard.binding}','ready',1,10,7000000000) ON CONFLICT(shard_key) DO NOTHING;`);
  }
  const file = '.wrangler/user-shards/register.sql';
  writeFileSync(file, registry.join('\n') + '\n');
  wrangler(['d1', 'execute', plan.core.database_name, '--remote', '--file', file]);
  console.log('Prepared ' + plan.shards.length + ' user databases; no personal history was copied.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
