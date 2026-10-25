import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';
import { parseConfig, shardPlan, runtimeConfig, provisionDatabases, ACTIVATION_SQL } from '../scripts/provision-user-shards.mjs';

const config = () => parseConfig(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
test('generated bindings preserve assets and never reuse the central database ID', () => {
  const c = config(), prod = shardPlan(c);
  assert.equal(prod.shards.length, 20);
  const generated = runtimeConfig(c,'',prod,prod.shards.map((s,i) => ({name:s.name,uuid:'shard-'+i,jurisdiction:'eu'})));
  assert.equal(generated.d1_databases.length, 21);
  assert.deepEqual(generated.assets,c.assets);
  assert.throws(() => runtimeConfig(c,'',prod,prod.shards.map(s => ({name:s.name,uuid:prod.core.database_id,jurisdiction:'eu'}))), /Invalid/);
  assert.throws(() => shardPlan(c,'other'), /Unsupported/);
});

test('the test server gets its own two user databases and keeps its own address', () => {
  const c = config(), prod = shardPlan(c), stage = shardPlan(c,'staging');
  assert.equal(stage.shards.length, 2);
  assert.equal(stage.core.database_name, 'health-data-staging');
  assert.notEqual(stage.core.database_id, prod.core.database_id);
  assert.ok(prod.shards.every(s => !stage.shards.some(t => t.name === s.name)));
  const generated = runtimeConfig(c,'staging',stage,stage.shards.map((s,i) => ({name:s.name,uuid:'staging-'+i,jurisdiction:'eu'})));
  assert.equal(generated.env.staging.d1_databases.length, 3);
  assert.equal(generated.d1_databases.length, 1);
  assert.deepEqual(generated.env.staging.routes, c.env.staging.routes);
  assert.throws(() => runtimeConfig(c,'staging',stage,stage.shards.map(s => ({name:s.name,uuid:stage.core.database_id,jurisdiction:'eu'}))), /Invalid/);
});

test('JSONC parser leaves HTTPS URLs, comment-looking strings and escapes intact', () => {
  assert.deepEqual(parseConfig('/* start */ { "url":"https://x.test/a//b", "text":"/*value*/\\\"", // comment\n "yes":true }'), {url:'https://x.test/a//b',text:'/*value*/"',yes:true});
});

test('provisioning reuses existing EU databases and creates only missing names', async () => {
  const plan = shardPlan(config()), calls = [];
  const existing = {name:plan.shards[0].name,uuid:'existing',jurisdiction:'eu'};
  const fetchImpl = async (url, options) => {
    calls.push({url,method:options.method||'GET',body:options.body});
    assert.equal(options.headers.Authorization,'Bearer test-token'); assert.ok(options.signal);
    const result = url.includes('?') ? [existing,{name:plan.core.database_name,uuid:plan.core.database_id}] : options.method==='POST' ? {name:JSON.parse(options.body).name,uuid:'new',jurisdiction:'eu'} : existing;
    return Response.json({success:true,result,result_info:{total_pages:1}});
  };
  const databases = await provisionDatabases({accountId:'a'.repeat(32),token:'test-token',plan,fetchImpl});
  assert.equal(databases.length,20);
  assert.equal(calls.filter(c=>c.method==='POST').length,19);
  assert.equal(JSON.parse(calls.find(c=>c.method==='POST').body).jurisdiction,'eu');
  await assert.rejects(provisionDatabases({accountId:'a'.repeat(32),token:'test-token',plan,fetchImpl:async()=>Response.json({success:false},{status:403})}),/HTTP 403/);
});

test('the test server refuses a Cloudflare account that also holds the live databases', async () => {
  const plan = shardPlan(config(),'staging'), live = shardPlan(config());
  const accountWith = extra => async url => Response.json({success:true,result:url.includes('?') ? [{name:plan.core.database_name,uuid:plan.core.database_id},...extra] : {name:plan.shards[0].name,uuid:'s',jurisdiction:'eu'},result_info:{total_pages:1}});
  for (const name of [live.core.database_name, live.shards[0].name, 'petrfitness-foods']) {
    await assert.rejects(provisionDatabases({accountId:'a'.repeat(32),token:'t',plan,fetchImpl:accountWith([{name,uuid:'live'}])}),/sees the live databases/);
  }
  await assert.rejects(provisionDatabases({accountId:'a'.repeat(32),token:'t',plan:live,fetchImpl:accountWith([])}),/identity mismatch/);
});

test('cutover pins preexisting accounts once; rerunning activation does not pin future new users to legacy', () => {
  const db = createD1(); db.sqlite.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); CREATE TABLE user_data_routes(user_id INTEGER PRIMARY KEY,shard_key TEXT); CREATE TABLE schema_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); INSERT INTO schema_meta VALUES('user_data_sharding_enabled','0',NULL); INSERT INTO users VALUES(1),(2)");
  db.sqlite.exec(ACTIVATION_SQL);
  assert.equal(db.sqlite.prepare("SELECT value FROM schema_meta").get().value,'1');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM user_data_routes').get().n,2);
  db.sqlite.exec('INSERT INTO users VALUES(3)'); db.sqlite.exec(ACTIVATION_SQL);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM user_data_routes').get().n,2);
});
