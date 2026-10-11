import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';
import { PERSONAL_TABLES, usersWithProviders, _resetTenancyForTest } from '../src/tenancy.js';
import { registerHooks } from 'node:module';
import { sessionCookie } from '../src/dashboard-auth.js';
import { routedUserDb } from '../src/user-data-routing.js';
import { resolveUserData, userDataEnvironment, deletionDatabase, UserDataUnavailable } from '../src/user-data-shards.js';
import { saveConnectionSecret, connectionEnvironment } from '../src/connection-secrets.js';
import { saveConsent } from '../src/consent.js';
import { exportAccountData, deleteAccount, finishAccountDeletions } from '../src/account-data.js';
import { completeOnboarding } from '../src/onboarding.js';
import { saveSharedFood, searchSharedFoods } from '../src/shared-foods.js';
import { cached } from '../src/api-cache.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function db() {
  const raw = createD1();
  raw.sqlite.exec(read('staging/schema.sql'));
  for (const name of ['0009_account_workflow.sql','0011_account_deletions.sql','0012_user_time_zone.sql','0013_cookbook_and_consents.sql','0014_passkeys_email_codes.sql','0016_support_reports.sql']) raw.sqlite.exec(read('migrations/' + name));
  const prepare = raw.prepare.bind(raw);
  // D1 returns the database's size in meta.size_after on a query.
  raw.prepare = sql => { const statement = prepare(sql), all = statement.all; statement.all = async () => ({ ...await all(), meta: { size_after: raw.size ?? 100000 } }); return statement; };
  return raw;
}
const user = id => ({ id, email: 'user' + id + '@example.test', role: 'user', isOwner: false });
function addUser(core, id) { core.sqlite.prepare("INSERT INTO users(id,email,role) VALUES(?,?,'user')").run(id, user(id).email); }
function setup(count = 2, cap = 10) {
  const core = db(); addUser(core, 1); addUser(core, 2);
  core.sqlite.exec(read('migrations/0017_user_data_shards.sql'));
  const env = { DB: core, USER_DATA_ROUTING: 'true', CONNECTION_KEY: 'a sufficiently long test encryption key' }, shards = [];
  for (let i = 1; i <= count; i++) {
    const suffix = String(i).padStart(3, '0'), shard = db();
    shard.sqlite.exec(read('staging/user-data-shard.sql'));
    env['USER_DATA_' + suffix] = shard; shards.push(shard);
    core.sqlite.prepare("INSERT INTO user_data_shards(shard_key,binding_name,state,accepting_new,max_users) VALUES(?,?,'ready',1,?)").run('data-' + suffix, 'USER_DATA_' + suffix, cap);
  }
  core.sqlite.exec("UPDATE schema_meta SET value='1' WHERE key='user_data_sharding_enabled'");
  return { core, env, shards };
}
const rows = (raw, table, id) => raw.sqlite.prepare('SELECT * FROM ' + table + ' WHERE user_id=?').all(id);
const point = (db, id, value) => db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,value_numeric,payload_json) VALUES(?,'manual','weight','same-external-id',?,'{}')").bind(id, value).run();

test('existing accounts retain their exact original data; new accounts use a sticky shard', async () => {
  const { core, env, shards } = setup();
  await point(core, 1, 80);
  assert.equal((await resolveUserData(env, 1)).db, core);
  addUser(core, 3);
  const scoped = await userDataEnvironment(env, user(3));
  await point(scoped.DB, 3, 70);
  assert.equal(rows(core, 'health_datapoints', 3).length, 0);
  assert.equal(rows(shards[0], 'health_datapoints', 3)[0].value_numeric, 70);
  assert.equal((await resolveUserData(env, 3)).db, shards[0]);
  assert.equal(rows(core, 'health_datapoints', 1)[0].value_numeric, 80);
});

test('simultaneous allocation of 200 accounts respects all shard caps and isolates same sample IDs', async () => {
  const { core, env, shards } = setup(20, 10);
  for (let id = 3; id < 203; id++) addUser(core, id);
  const scoped = await Promise.all(Array.from({length: 200}, (_, i) => userDataEnvironment(env, user(i + 3))));
  await Promise.all(scoped.map(s => point(s.DB, s.USER_ID, s.USER_ID)));
  const counts = core.sqlite.prepare("SELECT shard_key,COUNT(*) n FROM user_data_routes WHERE shard_key!='legacy' GROUP BY shard_key").all();
  assert.equal(counts.length, 20); assert.ok(counts.every(c => c.n === 10));
  assert.equal(shards.reduce((n, s) => n + s.sqlite.prepare('SELECT COUNT(*) n FROM health_datapoints').get().n, 0), 200);
  assert.equal(core.sqlite.prepare('SELECT COUNT(*) n FROM health_datapoints').get().n, 0);
  for (const s of scoped) assert.equal((await s.DB.prepare('SELECT value_numeric FROM health_datapoints WHERE user_id=?').bind(s.USER_ID).first()).value_numeric, s.USER_ID);
  addUser(core, 203); await assert.rejects(resolveUserData(env, 203), UserDataUnavailable);
});

test('duplicate allocation is one assignment; capacity, readiness, and binding failures never fall back', async () => {
  const { core, env, shards } = setup(2, 1);
  addUser(core, 3);
  const routes = await Promise.all(Array.from({length: 15}, () => resolveUserData(env, 3)));
  assert.ok(routes.every(r => r.key === routes[0].key));
  assert.equal(rows(core, 'user_data_routes', 3).length, 1);
  const key = routes[0].key, binding = 'USER_DATA_' + key.slice(-3);
  const saved = env[binding]; delete env[binding];
  await assert.rejects(resolveUserData(env, 3), UserDataUnavailable); env[binding] = saved;
  addUser(core, 4); shards[1].size = 7000000000;
  await assert.rejects(resolveUserData(env, 4), UserDataUnavailable);
  shards[1].size = 100000; shards[1].sqlite.exec('DELETE FROM user_data_shard_meta');
  await assert.rejects(resolveUserData(env, 4), UserDataUnavailable);
  assert.equal(rows(core, 'user_data_routes', 4).length, 0);
});

test('before activation, newly accessed accounts stay on legacy across the cutover', async () => {
  const { core, env } = setup(); addUser(core, 3);
  core.sqlite.exec("UPDATE schema_meta SET value='0' WHERE key='user_data_sharding_enabled'");
  assert.equal((await resolveUserData(env, 3)).db, core);
  core.sqlite.exec("UPDATE schema_meta SET value='1' WHERE key='user_data_sharding_enabled'");
  assert.equal((await resolveUserData(env, 3)).db, core);
});

test('credentials, consents and provider discovery stay central while onboarding and history stay local', async () => {
  const { core, env, shards } = setup(); addUser(core, 3);
  const scoped = await userDataEnvironment(env, user(3));
  await saveConnectionSecret(scoped, 'intervals', 'not-a-real-provider-key');
  await saveConsent(scoped, { health: true });
  const connected = await connectionEnvironment(scoped);
  assert.equal(connected.INTERVALS_API_KEY, 'not-a-real-provider-key');
  assert.equal(rows(core, 'connection_credentials', 3).length, 1);
  assert.equal(rows(shards[0], 'connection_credentials', 3).length, 0);
  assert.equal((await usersWithProviders(core, env, ['intervals'])).length, 1);
  await completeOnboarding(scoped, { profile: { sex:'female',age:30,height:165,activity:'light',goal:'maintain' }, weightKg: 60 });
  assert.equal(rows(shards[0], 'dashboard_profile', 3).length, 1);
  assert.equal(rows(core, 'dashboard_profile', 3).length, 0);
});

test('shared foods are one central catalogue visible to users in different shards', async () => {
  const { core, env } = setup(2, 1); addUser(core, 3); addUser(core, 4);
  const a = await userDataEnvironment(env, user(3)), b = await userDataEnvironment(env, user(4));
  assert.notEqual(a.USER_DATA_SHARD, b.USER_DATA_SHARD);
  const input = { name:'Test banana',brand:'Test',nutrition_basis:'100g',calories_100g:90,protein_100g:1,carbs_100g:20,fat_100g:0 };
  const saved = await saveSharedFood(a.DB, input, 'food-a'); assert.ok(saved);
  assert.equal((await searchSharedFoods(b.DB, 'Test banana')).length, 1);
  assert.equal(core.sqlite.prepare('SELECT COUNT(*) n FROM shared_foods').get().n, 1);
});

test('cross-database joins and batches fail before writing; local transaction rollback still works', async () => {
  const { core, shards } = setup(); const routed = routedUserDb(core, shards[0], PERSONAL_TABLES);
  assert.throws(() => routed.prepare('SELECT * FROM users JOIN health_datapoints ON users.id=health_datapoints.user_id'), /cannot join/);
  assert.throws(() => routed.batch([routed.prepare("INSERT INTO food_logs(user_id,consumed_date,recipe_title,kcal) VALUES(3,'2026-10-10','x',1)"),routed.prepare("DELETE FROM users WHERE id=1")]), /one database/);
  assert.equal(rows(shards[0], 'food_logs', 3).length, 0);
  assert.throws(() => routed.batch([routed.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,payload_json) VALUES(3,'manual','weight','a','{}')"),routed.prepare('INSERT INTO table_that_does_not_exist(user_id) VALUES(3)')]), /one database/);
  // The unknown table above routes centrally, so no statement ran.
  assert.equal(rows(shards[0], 'health_datapoints', 3).length, 0);
  await assert.rejects(routed.batch([routed.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,payload_json) VALUES(3,'manual','weight','a','{}')"),routed.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,payload_json) VALUES(3,'manual','weight','a','{}')")]), /UNIQUE/);
  assert.equal(rows(shards[0], 'health_datapoints', 3).length, 0);
});

test('account export and resumable deletion find both central and shard records', async () => {
  const { core, env, shards } = setup(2, 1); addUser(core, 3); addUser(core, 4);
  const a = await userDataEnvironment(env, user(3)), b = await userDataEnvironment(env, user(4));
  await point(a.DB, 3, 70); await point(b.DB, 4, 80); await saveConsent(a, { health: true });
  const data = await exportAccountData(a, user(3));
  assert.equal(data.tables.health_datapoints[0].value_numeric, 70);
  assert.equal(data.tables.user_consents.length, 1);
  await deleteAccount(a, user(3), { budgetMs: 0, chunkRows: 1 });
  assert.equal(core.sqlite.prepare('SELECT COUNT(*) n FROM users WHERE id=3').get().n, 0);
  for (let i = 0; i < 5 && rows(core, 'account_deletions', 3).length; i++) await finishAccountDeletions(core, { databaseForUser: id => deletionDatabase(env,id), chunkRows: 1 });
  assert.equal(rows(shards[0], 'health_datapoints', 3).length, 0);
  assert.equal(rows(core, 'user_data_routes', 3).length, 0);
  assert.equal(rows(core, 'account_deletions', 3).length, 0);
  assert.equal(rows(shards[1], 'health_datapoints', 4)[0].value_numeric, 80);
});

test('cache entries cannot cross staging/production or a user data shard', async () => {
  const { core, env } = setup(); addUser(core, 3); const scoped = await userDataEnvironment(env, user(3));
  const urls = [], store = { async match(url) { urls.push(url); return null; }, async put() {} };
  await cached(scoped, null, 'key', async () => ({}), { store });
  await cached({ ...scoped, ENVIRONMENT:'staging' }, null, 'key', async () => ({}), { store });
  await cached({ ...scoped, USER_DATA_SHARD:'other' }, null, 'key', async () => ({}), { store });
  assert.equal(new Set(urls).size, 3);
});

test('authenticated API requests route writes and caches; a missing shard returns 503 without writing elsewhere', async () => {
  // Match Wrangler's Text module rule for the browser asset while loading
  // the real request handlers and authentication code in Node.
  const hooks = registerHooks({load(url,context,nextLoad) {
    if (url.endsWith('/dashboard-client.js')) return {format:'module',source:'export default '+JSON.stringify(readFileSync(new URL(url),'utf8')),shortCircuit:true};
    return nextLoad(url,context);
  }});
  let entrypoint;
  try { entrypoint = (await import('../src/entrypoint.js')).default; } finally { hooks.deregister(); }
  const { core, env, shards } = setup(); addUser(core, 3);
  core.sqlite.exec("INSERT INTO schema_meta(key,value) VALUES('tenancy_version','1')");
  _resetTenancyForTest();
  env.SESSION_SECRET = 'test-session-secret'; env.OWNER_EMAIL = user(1).email;
  const cookie = (await sessionCookie(3,Math.floor(Date.now()/1000)+60,env.SESSION_SECRET)).split(';')[0];
  const request = () => new Request('https://petrfitnessdata.eu/app/api/profile',{
    method:'POST',headers:{Cookie:cookie,Origin:'https://petrfitnessdata.eu','Content-Type':'application/json'},body:JSON.stringify({sex:'female',age:30,height:165})
  });
  const response = await entrypoint.fetch(request(),env,{waitUntil(){}});
  assert.equal(response.status,200); assert.equal((await response.json()).status,'ok');
  assert.equal(rows(shards[0],'dashboard_profile',3).length,1);
  assert.equal(rows(shards[0],'api_cache_versions',3).length,1);
  assert.equal(rows(core,'dashboard_profile',3).length,0);
  delete env.USER_DATA_001;
  const failed = await entrypoint.fetch(request(),env,{waitUntil(){}});
  assert.equal(failed.status,503); assert.equal(failed.headers.get('Retry-After'),'30');
  assert.equal(rows(core,'dashboard_profile',3).length,0);
  assert.equal(rows(shards[1],'dashboard_profile',3).length,0);
  const anonymous = await entrypoint.fetch(new Request('https://petrfitnessdata.eu/app/api/me'),env,{waitUntil(){}});
  assert.equal(anonymous.status,401); assert.equal(anonymous.headers.get('X-Storage-Routing'),'1');
  _resetTenancyForTest();
});
