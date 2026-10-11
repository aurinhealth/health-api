import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';
import { verifyShards } from '../scripts/verify-user-shards.mjs';
import { provisionDatabases, shardPlan, parseConfig } from '../scripts/provision-user-shards.mjs';

function fixture() {
  const databases = [createD1(),createD1(),createD1()];
  const schema = readFileSync(new URL('../staging/schema.sql',import.meta.url),'utf8');
  for (const db of databases) {
    db.sqlite.exec(schema);
    // Exercise the exact bootstrap + all pending migration sequence used in CI.
    for (const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()) {
      if (!db.sqlite.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get(name)) {
        db.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
        db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name);
      }
    }
    db.sqlite.exec(readFileSync(new URL('../staging/user-data-shard.sql',import.meta.url),'utf8'));
  }
  databases[0].sqlite.exec("INSERT INTO user_data_shards(shard_key,binding_name,state) VALUES('data-001','USER_DATA_001','ready'),('data-002','USER_DATA_002','ready')");
  const config = {d1_databases:databases.map((_,i)=>({binding:i?'USER_DATA_'+String(i).padStart(3,'0'):'DB',database_id:'db-'+i}))};
  const fetchImpl = async (url,options) => {
    const db = databases[Number(/db-(\d+)\/query$/.exec(url)[1])];
    const {sql,params} = JSON.parse(options.body), statement = db.sqlite.prepare(sql);
    const results = /^SELECT/.test(sql) ? statement.all(...params) : (statement.run(...params),[]);
    return Response.json({success:true,result:[{success:true,results,meta:{size_after:100000}}]});
  };
  return {databases,config,fetchImpl,accountId:'a'.repeat(32),token:'test-token'};
}

test('remote smoke initializes with all pending migrations and cleans only its synthetic rows', async () => {
  const f = fixture();
  f.databases[1].sqlite.exec("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,payload_json) VALUES(3,'manual','weight','real-test-fixture','{}')");
  assert.deepEqual(await verifyShards(f),{verified:2});
  assert.equal(f.databases[1].sqlite.prepare('SELECT COUNT(*) n FROM health_datapoints').get().n,1);
  assert.equal(f.databases[2].sqlite.prepare('SELECT COUNT(*) n FROM health_datapoints').get().n,0);
});

test('verification failure cleans the canary and never touches real user rows', async () => {
  const f = fixture(), fetchImpl = f.fetchImpl;
  f.fetchImpl = async (url,options) => {
    if (JSON.parse(options.body).sql.startsWith('SELECT value_numeric')) return Response.json({success:true,result:[{success:true,results:[{value_numeric:999}]}]});
    return fetchImpl(url,options);
  };
  await assert.rejects(verifyShards(f),/canary failed/);
  assert.ok(f.databases.every(db=>db.sqlite.prepare('SELECT COUNT(*) n FROM health_datapoints WHERE user_id=-1').get().n===0));
});

test('provisioning refuses mismatched core identity and reducing the deployed binding set', async () => {
  const plan = shardPlan(parseConfig(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')),'staging');
  const args = {accountId:'a'.repeat(32),token:'test-token',plan};
  await assert.rejects(provisionDatabases({...args,fetchImpl:async()=>Response.json({success:true,result:[]})}),/identity mismatch/);
  const all = [{name:plan.core.database_name,uuid:plan.core.database_id},{name:plan.core.database_name+'-users-003',uuid:'another'}];
  await assert.rejects(provisionDatabases({...args,fetchImpl:async()=>Response.json({success:true,result:all})}),/Refusing to remove/);
});
