import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createD1} from './helpers/d1.mjs';
import {userDataEnvironment,deletionDatabase} from '../src/user-data-shards.js';
import {foodCatalogEnvironment,FoodCatalogUnavailable} from '../src/food-catalog-storage.js';
import {PERSONAL_TABLES,_resetTenancyForTest} from '../src/tenancy.js';
import {routedUserDb} from '../src/user-data-routing.js';
import {savePersonalFood,searchFoodCatalog} from '../src/personal-foods.js';
import {saveRecipe,searchRecipes} from '../src/personal-recipes.js';
import {reportFood} from '../src/shared-foods.js';
import {exportAccountData,deleteAccount,finishAccountDeletions} from '../src/account-data.js';
import {sessionCookie} from '../src/dashboard-auth.js';
import {CATALOG_TABLES,cloudflareD1,foodPlan,bindFoodDatabase,provisionFoodDatabase,migrateFoodCatalog,verifyFoodDatabase} from '../scripts/food-catalog-tools.mjs';
import {parseConfig} from '../scripts/provision-user-shards.mjs';
import {smokeFoodCatalog} from '../scripts/smoke-food-catalog.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const user=id=>({id,email:'user'+id+'@example.test',role:'user',isOwner:false});
function database() {
  const db=createD1(); db.sqlite.exec(read('staging/schema.sql'));
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()) {
    if(!db.sqlite.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get(name)) {
      db.sqlite.exec(read('migrations/'+name)); db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name);
    }
  }
  return db;
}
function setup() {
  const core=database(),foods=createD1(),shards=[database(),database()];
  foods.sqlite.exec(read('food-migrations/0001_catalog.sql'));
  core.sqlite.exec("INSERT INTO users(id,email) VALUES(1,'owner@example.test'),(3,'user3@example.test'),(4,'user4@example.test'); INSERT INTO user_data_routes(user_id,shard_key) VALUES(1,'legacy'),(3,'data-001'),(4,'data-002'); INSERT INTO user_data_shards(shard_key,binding_name,state,accepting_new,max_users) VALUES('data-001','USER_DATA_001','ready',1,10),('data-002','USER_DATA_002','ready',1,10); UPDATE schema_meta SET value='1' WHERE key='user_data_sharding_enabled'; INSERT INTO schema_meta(key,value) VALUES('tenancy_version','1')");
  const env={DB:core,FOODS:foods,FOOD_CATALOG_ROUTING:'true',FOOD_CATALOG_DB_ID:'foods',USER_DATA_ROUTING:'true',USER_DATA_001:shards[0],USER_DATA_002:shards[1]};
  const databases={core,foods};
  const api={
    async query(id,sql,params=[]) { const s=databases[id].prepare(sql).bind(...params);return /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql)?s.all():s.run(); },
    async batch(id,statements) { return databases[id].batch(statements.map(s=>databases[id].prepare(s.sql).bind(...(s.params||[])))); }
  };
  return {core,foods,shards,env,api};
}
const product={name:'Test mléko',brand:'Test',barcode:'8590000000008',calories_100g:50,protein_100g:3,carbs_100g:5,fat_100g:2,nutrition_basis:'ml'};
const count=(db,table)=>db.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n;
async function seed(f) {
  const a=await userDataEnvironment(f.env,user(3)),b=await userDataEnvironment(f.env,user(4));
  await savePersonalFood(a.DB,product);await savePersonalFood(b.DB,product);
  const shared=(await searchFoodCatalog(a.DB,'Test mléko')).find(p=>p.catalog_id);
  // search deduplicates the own result first, so get the immutable public ID directly.
  const catalogId=shared?.catalog_id||f.core.sqlite.prepare('SELECT food_key FROM shared_foods').get().food_key;
  await reportFood(a.DB,{catalogId,reason:'Test: ověřit etiketu'});
  await saveRecipe(a.DB,{name:'Test breakfast',servings:1,shared:true,ingredients:[{name:'Milk',quantity:100,unit:'ml',calories:50,protein_g:3,carbs_g:5,fat_g:2}]});
  f.core.sqlite.exec("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,payload_json) VALUES(1,'manual','weight','owner-history','{}'); INSERT INTO food_logs(user_id,consumed_date,recipe_title,kcal) VALUES(1,'2026-10-10','Owner lunch',500)");
  return {a,b,catalogId};
}

test('catalogue cutover preserves every row and timestamp, retires only old catalogue copies, and leaves history intact',async()=>{
  const f=setup();await seed(f);
  const before=Object.fromEntries(CATALOG_TABLES.map(t=>[t.name,f.core.sqlite.prepare('SELECT '+t.columns.join(',')+' FROM '+t.name+' ORDER BY '+t.keys.join(',')).all()]));
  const originalQuery=f.api.query;let blocked=false;
  f.api.query=async(id,sql,params=[])=>{
    if(!blocked&&id==='core'&&sql.startsWith('SELECT rowid AS copy_rowid')) {
      assert.throws(()=>f.core.sqlite.prepare('INSERT INTO shared_foods(food_key,search_name,product_json) VALUES(?,?,?)').run('late','late','{}'),/catalogue has moved/);
      blocked=true;
    }
    return originalQuery(id,sql,params);
  };
  const result=await migrateFoodCatalog({...f,core:'core',foods:'foods',pageRows:2});
  assert.equal(result.skipped,false);assert.ok(blocked);
  for(const spec of CATALOG_TABLES) {
    assert.deepEqual(f.foods.sqlite.prepare('SELECT '+spec.columns.join(',')+' FROM '+spec.name+' ORDER BY '+spec.keys.join(',')).all(),before[spec.name]);
    assert.equal(count(f.core,spec.name),0);
  }
  assert.equal(count(f.core,'health_datapoints'),1);assert.equal(count(f.core,'food_logs'),1);
  assert.equal(count(f.shards[0],'personal_foods'),1);assert.equal(count(f.shards[1],'personal_foods'),1);
  assert.equal(f.core.sqlite.prepare("SELECT value FROM schema_meta WHERE key='food_catalog_maintenance'").get().value,'0');
  assert.throws(()=>f.core.sqlite.exec("INSERT INTO shared_foods(food_key,search_name,product_json) VALUES('stale','stale','{}')"),/catalogue has moved/);
  f.core.sqlite.exec("INSERT INTO food_logs(user_id,consumed_date,recipe_title,kcal) VALUES(1,'2026-10-10','Still works',1)");
});

test('new and legacy accounts search one catalogue by barcode; reports and shared recipes route with it',async()=>{
  const f=setup();const {catalogId}=await seed(f);await migrateFoodCatalog({...f,core:'core',foods:'foods'});
  const legacy=await userDataEnvironment(f.env,{...user(1),isOwner:true});
  const candidates=await searchFoodCatalog(legacy.DB,'',product.barcode);
  assert.equal(candidates.length,1);assert.equal(candidates[0].catalog_id,catalogId);assert.equal(candidates[0].reports,1);
  assert.equal(candidates[0].user_id,undefined);assert.equal(candidates[0].reason,undefined);
  const b=await userDataEnvironment(f.env,user(4));
  assert.ok((await searchRecipes(b.DB,'breakfast')).some(p=>p.source==='shared_recipe'));
  await reportFood(b.DB,{catalogId,reason:'Another test report'});assert.equal(count(f.foods,'food_reports'),2);
  const plans=f.foods.sqlite.prepare("EXPLAIN QUERY PLAN SELECT food_key FROM shared_foods WHERE json_extract(product_json,'$.barcode')=? ORDER BY updated_at DESC LIMIT 500").all(product.barcode);
  assert.ok(plans.some(r=>/USING INDEX shared_foods_barcode/.test(r.detail)));
});

test('account export and resumable deletion cover food metadata without deleting another account or its private foods',async()=>{
  const f=setup();await seed(f);await migrateFoodCatalog({...f,core:'core',foods:'foods'});
  const a=await userDataEnvironment(f.env,user(3));
  const data=await exportAccountData(a,user(3));assert.equal(data.tables.food_reports.length,1);assert.equal(data.tables.food_contributions.length,1);assert.equal(data.tables.recipe_contributions.length,1);
  await deleteAccount(a,user(3),{budgetMs:0,chunkRows:1});
  for(let i=0;i<5&&count(f.core,'account_deletions');i++)await finishAccountDeletions(f.core,{databaseForUser:id=>deletionDatabase(f.env,id),chunkRows:1});
  assert.equal(count(f.foods,'food_reports'),0);assert.equal(count(f.foods,'recipe_contributions'),0);
  assert.equal(count(f.foods,'food_contributions'),1);assert.equal(count(f.shards[0],'personal_foods'),0);assert.equal(count(f.shards[1],'personal_foods'),1);
  assert.equal(count(f.core,'account_deletions'),0);
});

test('failed verification keeps the original catalogue and allows a clean retry; successful redeploy never recopy replaces current data',async()=>{
  const f=setup();await seed(f);const original=f.api.query;
  f.api.query=async(id,sql,params=[])=>{
    const result=await original(id,sql,params);
    if(id==='foods'&&sql.startsWith('SELECT food_key,search_name,product_json'))result.results[0].search_name='corruption';
    return result;
  };
  await assert.rejects(migrateFoodCatalog({...f,core:'core',foods:'foods'}),/verification failed/);
  assert.equal(f.core.sqlite.prepare("SELECT value FROM schema_meta WHERE key='food_catalog_state'").get().value,'legacy');assert.equal(count(f.core,'shared_foods'),1);
  f.api.query=original;
  await migrateFoodCatalog({...f,core:'core',foods:'foods'});
  f.foods.sqlite.exec("INSERT INTO shared_foods(food_key,search_name,product_json) VALUES('new-after-cutover','new','{}')");
  assert.deepEqual(await migrateFoodCatalog({...f,core:'core',foods:'foods'}),{skipped:true});assert.equal(count(f.foods,'shared_foods'),2);
});

test('budget and ownership checks fail safely; already populated unrelated food stores cannot be replaced',async()=>{
  let f=setup();await seed(f);
  await assert.rejects(migrateFoodCatalog({...f,core:'core',foods:'foods',maxRows:0}),/row budget/);
  assert.equal(f.core.sqlite.prepare("SELECT value FROM schema_meta WHERE key='food_catalog_state'").get().value,'legacy');assert.equal(count(f.core,'shared_foods'),1);
  f=setup();f.foods.sqlite.exec("INSERT INTO shared_foods(food_key,search_name,product_json) VALUES('unrelated','unrelated','{}')");
  await assert.rejects(migrateFoodCatalog({...f,core:'core',foods:'foods'}),/populated/);
  f=setup();f.foods.sqlite.exec("INSERT INTO food_catalog_meta(key,value) VALUES('legacy_source_id','another-core')");
  await assert.rejects(migrateFoodCatalog({...f,core:'core',foods:'foods'}),/another environment/);
  f=setup();f.core.sqlite.exec('ALTER TABLE shared_foods ADD COLUMN custom_note TEXT');
  await assert.rejects(migrateFoodCatalog({...f,core:'core',foods:'foods'}),/Unexpected catalogue columns/);
  assert.equal(f.core.sqlite.prepare("SELECT value FROM schema_meta WHERE key='food_catalog_state'").get().value,'legacy');
});

test('a lost activation response never rolls back committed routing; a rerun completes cleanup without replacing new rows',async()=>{
  const f=setup();await seed(f);const original=f.api.query;let lost=false;
  f.api.query=async(id,sql,params=[])=>{
    const result=await original(id,sql,params);
    if(!lost&&id==='core'&&sql.startsWith("UPDATE schema_meta SET value='ready'")){lost=true;throw new Error('Synthetic lost response');}
    return result;
  };
  await assert.rejects(migrateFoodCatalog({...f,core:'core',foods:'foods'}),/lost response/);
  assert.equal(f.core.sqlite.prepare("SELECT value FROM schema_meta WHERE key='food_catalog_state'").get().value,'ready');
  const active=await userDataEnvironment(f.env,user(4));await savePersonalFood(active.DB,{...product,name:'New food after activation'});
  f.api.query=original;assert.deepEqual(await migrateFoodCatalog({...f,core:'core',foods:'foods'}),{skipped:true});
  assert.equal(count(f.foods,'shared_foods'),2);assert.equal(count(f.core,'food_contributions'),0);
});

test('an interrupted frozen copy can resume, and cleanup failure never leaves the legacy bypass enabled',async()=>{
  const f=setup();await seed(f);
  f.core.sqlite.exec("UPDATE schema_meta SET value='copying' WHERE key='food_catalog_state'; INSERT INTO schema_meta(key,value) VALUES('food_catalog_database_id','foods')");
  f.foods.sqlite.exec("INSERT INTO food_catalog_meta(key,value) VALUES('legacy_source_id','core'),('copy_verified','1')");
  const original=f.api.batch;let fail=true;
  f.api.batch=async(id,statements)=>{
    if(fail&&id==='core'&&statements[0]?.sql.includes("food_catalog_maintenance")){
      fail=false;const broken=[...statements];broken[1]={sql:'DELETE FROM table_that_does_not_exist',params:[]};return original(id,broken);
    }
    return original(id,statements);
  };
  await assert.rejects(migrateFoodCatalog({...f,core:'core',foods:'foods'}),/no such table/);
  assert.equal(f.core.sqlite.prepare("SELECT value FROM schema_meta WHERE key='food_catalog_state'").get().value,'ready');
  assert.equal(f.core.sqlite.prepare("SELECT value FROM schema_meta WHERE key='food_catalog_maintenance'").get().value,'0');
  f.api.batch=original;await migrateFoodCatalog({...f,core:'core',foods:'foods'});assert.equal(count(f.core,'shared_foods'),0);
});

test('ready routing fails closed on missing/aliased bindings or unknown state; cross-store transactions fail before writing',async()=>{
  const f=setup();await migrateFoodCatalog({...f,core:'core',foods:'foods'});
  assert.equal((await foodCatalogEnvironment(f.env)).FOOD_CATALOG_DB,f.foods);
  await assert.rejects(foodCatalogEnvironment({...f.env,FOODS:undefined}),FoodCatalogUnavailable);
  await assert.rejects(foodCatalogEnvironment({...f.env,FOODS:f.core}),FoodCatalogUnavailable);
  await assert.rejects(foodCatalogEnvironment({...f.env,FOOD_CATALOG_DB_ID:'another'}),FoodCatalogUnavailable);
  const routed=routedUserDb(f.core,f.shards[0],PERSONAL_TABLES,f.foods);
  assert.throws(()=>routed.prepare('SELECT * FROM shared_foods JOIN personal_foods ON shared_foods.food_key=personal_foods.food_key WHERE user_id=3'),/cannot join/);
  assert.throws(()=>routed.batch([routed.prepare("INSERT INTO shared_foods(food_key,search_name,product_json) VALUES('not-written','x','{}')"),routed.prepare("DELETE FROM users WHERE id=4")]),/one database/);
  assert.equal(count(f.foods,'shared_foods'),0);
  f.core.sqlite.exec("UPDATE schema_meta SET value='broken' WHERE key='food_catalog_state'");await assert.rejects(foodCatalogEnvironment(f.env),FoodCatalogUnavailable);
});

test('migration-aware authenticated API pauses food operations only, then serves the real shared catalogue after activation',async()=>{
  const f=setup();await seed(f);
  const hooks=registerHooks({load(url,context,nextLoad){if(url.endsWith('/dashboard-client.js'))return {format:'module',source:'export default '+JSON.stringify(readFileSync(new URL(url),'utf8')),shortCircuit:true};return nextLoad(url,context);}});
  let entrypoint;try{entrypoint=(await import('../src/entrypoint.js')).default;}finally{hooks.deregister();}
  _resetTenancyForTest();f.env.SESSION_SECRET='test-session-key';f.env.OWNER_EMAIL='owner@example.test';
  const cookie=(await sessionCookie(4,Math.floor(Date.now()/1000)+60,f.env.SESSION_SECRET)).split(';')[0];
  const request=(path,body)=>new Request('https://petrfitnessdata.eu'+path,{method:'POST',headers:{Cookie:cookie,Origin:'https://petrfitnessdata.eu','Content-Type':'application/json'},body:JSON.stringify(body)});
  f.core.sqlite.exec("UPDATE schema_meta SET value='copying' WHERE key='food_catalog_state'");
  assert.equal((await entrypoint.fetch(request('/app/api/food/search',{barcode:product.barcode}),f.env,{waitUntil(){}})).status,503);
  assert.equal((await entrypoint.fetch(request('/app/api/profile',{sex:'female',age:30,height:165}),f.env,{waitUntil(){}})).status,200);
  f.core.sqlite.exec("UPDATE schema_meta SET value='legacy' WHERE key='food_catalog_state'");await migrateFoodCatalog({...f,core:'core',foods:'foods'});
  const response=await entrypoint.fetch(request('/app/api/food/search',{barcode:product.barcode}),f.env,{waitUntil(){}});
  assert.equal(response.status,200);assert.equal((await response.json()).product.barcode,product.barcode);
  delete f.env.FOODS;assert.equal((await entrypoint.fetch(request('/app/api/food/search',{barcode:product.barcode}),f.env,{waitUntil(){}})).status,503);
  const anonymous=await entrypoint.fetch(new Request('https://petrfitnessdata.eu/app/api/me'),f.env,{waitUntil(){}});assert.equal(anonymous.headers.get('X-Food-Catalog-Routing'),'1');_resetTenancyForTest();
});

test('remote canary cleanup is exact and provisioning preserves all 20 user database bindings',async()=>{
  const f=setup();await verifyFoodDatabase(f.api,'foods');assert.equal(count(f.foods,'shared_foods'),0);
  const config=parseConfig(read('wrangler.jsonc'));config.d1_databases.push(...Array.from({length:20},(_,i)=>({binding:'USER_DATA_'+String(i+1).padStart(3,'0'),database_id:'shard-'+i})));
  const plan=foodPlan(config),db={name:plan.name,uuid:'catalog',jurisdiction:'eu'};
  const generated=bindFoodDatabase(config,'',db);assert.equal(generated.d1_databases.length,22);assert.equal(generated.vars.FOOD_CATALOG_DB_ID,'catalog');assert.deepEqual(generated.routes,config.routes);
  assert.notEqual(foodPlan(config,'staging').name,plan.name);
  assert.throws(()=>bindFoodDatabase(config,'',{...db,uuid:plan.core.database_id}),/Duplicate/);
  let creates=0;
  const api={request:async(path,options)=>{if(path.startsWith('?'))return {result:[{name:plan.core.database_name,uuid:plan.core.database_id}]};if(options?.method==='POST'){creates++;assert.equal(JSON.parse(options.body).jurisdiction,'eu');return {result:db};}throw new Error('Unexpected request');}};
  assert.equal((await provisionFoodDatabase(api,plan)).uuid,'catalog');assert.equal(creates,1);
});

test('Cloudflare batch client keeps row values in structured parameters and rejects failed statements without logging them',async()=>{
  const api=cloudflareD1({accountId:'a'.repeat(32),token:'test-token',fetchImpl:async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer test-token');const body=JSON.parse(options.body);assert.deepEqual(body.batch[0].params,['private test value']);return Response.json({success:true,result:[{success:true,results:[{ok:1}]}]});
  }});
  assert.equal((await api.query('foods','SELECT ?',['private test value'])).results[0].ok,1);
  const failed=cloudflareD1({accountId:'a'.repeat(32),token:'test-token',fetchImpl:async()=>Response.json({success:true,result:[{success:false,error:'private row contents'}]})});
  await assert.rejects(failed.query('foods','SELECT 1'),error=>error.message==='Cloudflare D1 batch failed');
});

test('live search smoke proves the Worker reads FOODS and cleans its exact canary even on a failed API response',async()=>{
  const f=setup();
  await smokeFoodCatalog({api:f.api,foods:'foods',oidcToken:'test-oidc',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://petrfitnessdata.eu/app/api/food/search');assert.equal(options.headers.Authorization,'Bearer test-oidc');
    const barcode=JSON.parse(options.body).barcode;
    const row=f.foods.sqlite.prepare("SELECT food_key,product_json FROM shared_foods WHERE json_extract(product_json,'$.barcode')=?").get(barcode);
    return Response.json({status:'ok',candidates:[{...JSON.parse(row.product_json),catalog_id:row.food_key}]});
  }});assert.equal(count(f.foods,'shared_foods'),0);
  await assert.rejects(smokeFoodCatalog({api:f.api,foods:'foods',oidcToken:'test-oidc',fetchImpl:async()=>Response.json({status:'ok',candidates:[]})}),/lookup failed/);
  assert.equal(count(f.foods,'shared_foods'),0);
});
