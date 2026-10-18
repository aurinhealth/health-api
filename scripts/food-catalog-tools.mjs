// Shared deployment helpers. No row contents, SQL parameters or credentials
// are logged: the repository and Actions logs are public.
import { createHash } from 'node:crypto';

export const CATALOG_TABLES = [
  {name:'shared_foods',columns:['food_key','search_name','product_json','updated_at'],keys:['food_key']},
  {name:'shared_recipes',columns:['catalog_id','recipe_json','search_name','updated_at'],keys:['catalog_id']},
  {name:'food_contributions',columns:['user_id','personal_id','catalog_id'],keys:['user_id','personal_id']},
  {name:'recipe_contributions',columns:['user_id','recipe_id','catalog_id'],keys:['user_id','recipe_id']},
  {name:'food_reports',columns:['user_id','catalog_id','reason','created_at'],keys:['user_id','catalog_id']}
];

export function cloudflareD1({accountId,token,fetchImpl=fetch}) {
  if (!/^[a-f0-9]{32}$/i.test(accountId||'') || !token) throw new Error('Cloudflare credentials are missing');
  async function request(path,options={}) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database${path}`,{
      ...options,signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Cloudflare D1 request failed: HTTP '+response.status);
    return data;
  }
  async function batch(id,statements) {
    if (!statements.length) return [];
    const data = await request('/'+id+'/query',{method:'POST',body:JSON.stringify({batch:statements})});
    if (!Array.isArray(data.result) || data.result.length !== statements.length || data.result.some(r=>!r.success)) throw new Error('Cloudflare D1 batch failed');
    return data.result;
  }
  async function query(id,sql,params=[]) { return (await batch(id,[{sql,params}]))[0]; }
  return {request,batch,query};
}

export function foodPlan(config,environment='') {
  if (!['','staging'].includes(environment)) throw new Error('Unsupported environment');
  const selected = environment?config.env?.[environment]:config;
  const core = selected?.d1_databases?.find(d=>d.binding==='DB');
  if (core?.database_name !== (environment?'health-data-staging':'health-data')) throw new Error('Unexpected central database');
  return {selected,core,name:environment?'petrfitness-foods-staging':'petrfitness-foods'};
}

export async function provisionFoodDatabase(api,plan) {
  const all=[];
  for (let page=1;;page++) {
    const data=await api.request('?per_page=100&page='+page); all.push(...data.result);
    if (page >= (data.result_info?.total_pages||1)) break;
    if (page>=100) throw new Error('Too many database pages');
  }
  if (!all.some(d=>d.uuid===plan.core.database_id&&d.name===plan.core.database_name)) throw new Error('Central database identity mismatch');
  const existing=all.find(d=>d.name===plan.name);
  const db=existing?(await api.request('/'+existing.uuid)).result:(await api.request('',{method:'POST',body:JSON.stringify({name:plan.name,jurisdiction:'eu'})})).result;
  if (db.name!==plan.name || !db.uuid || db.jurisdiction!=='eu' || plan.selected.d1_databases.some(b=>b.binding!=='FOODS'&&b.database_id===db.uuid)) throw new Error('Unexpected food database identity');
  return db;
}

export function bindFoodDatabase(config,environment,db) {
  const result=structuredClone(config),plan=foodPlan(result,environment);
  if (!db?.uuid || db.name!==plan.name || db.jurisdiction!=='eu') throw new Error('Invalid food database');
  plan.selected.d1_databases = [...plan.selected.d1_databases.filter(b=>b.binding!=='FOODS'),{binding:'FOODS',database_name:db.name,database_id:db.uuid,migrations_dir:'food-migrations'}];
  if (new Set(plan.selected.d1_databases.map(d=>d.database_id)).size!==plan.selected.d1_databases.length) throw new Error('Duplicate database binding');
  plan.selected.vars.FOOD_CATALOG_ROUTING='true'; plan.selected.vars.FOOD_CATALOG_DB_ID=db.uuid;
  return result;
}

async function state(api,core) {
  return Object.fromEntries((await api.query(core,"SELECT key,value FROM schema_meta WHERE key IN ('food_catalog_state','food_catalog_database_id','food_catalog_cleanup_done')")).results.map(r=>[r.key,r.value]));
}
async function metadata(api,foods) {
  return Object.fromEntries((await api.query(foods,'SELECT key,value FROM food_catalog_meta')).results.map(r=>[r.key,r.value]));
}
async function counts(api,id) {
  const results=await api.batch(id,CATALOG_TABLES.map(t=>({sql:`SELECT COUNT(*) AS n FROM ${t.name}`,params:[]})));
  return Object.fromEntries(results.map((r,i)=>[CATALOG_TABLES[i].name,Number(r.results[0].n)]));
}
async function fingerprint(api,id,spec,pageRows) {
  const hash=createHash('sha256'); let offset=0;
  for (;;) {
    const rows=(await api.query(id,`SELECT ${spec.columns.join(',')} FROM ${spec.name} ORDER BY ${spec.keys.join(',')} LIMIT ? OFFSET ?`,[pageRows,offset])).results;
    for (const row of rows) hash.update(JSON.stringify(spec.columns.map(c=>row[c]))+'\n');
    if (rows.length<pageRows) break;
    offset+=rows.length;
  }
  return hash.digest('hex');
}
async function emptyTarget(api,id,pageRows) {
  for (const table of CATALOG_TABLES) for (;;) {
    const r=await api.query(id,`DELETE FROM ${table.name} WHERE rowid IN (SELECT rowid FROM ${table.name} LIMIT ?)`,[pageRows]);
    if ((r.meta?.changes||0)<pageRows) break;
  }
}

// Keep the frozen tables/triggers after cleanup so even a stale Worker cannot
// recreate an unguarded old catalogue. The bypass exists only inside a single
// atomic D1 batch; another invocation never sees it enabled.
export async function cleanupLegacyCatalog(api,core,{pageRows=100}={}) {
  for (const table of CATALOG_TABLES) for (;;) {
    const result=await api.batch(core,[
      {sql:"UPDATE schema_meta SET value='1' WHERE key='food_catalog_maintenance' AND (SELECT value FROM schema_meta WHERE key='food_catalog_state')='ready'",params:[]},
      {sql:`DELETE FROM ${table.name} WHERE rowid IN (SELECT rowid FROM ${table.name} LIMIT ?)`,params:[pageRows]},
      {sql:"UPDATE schema_meta SET value='0' WHERE key='food_catalog_maintenance'",params:[]}
    ]);
    if ((result[1].meta?.changes||0)<pageRows) break;
  }
  await api.query(core,"INSERT INTO schema_meta(key,value) VALUES('food_catalog_cleanup_done','1') ON CONFLICT(key) DO UPDATE SET value='1'");
}

export async function migrateFoodCatalog({api,core,foods,pageRows=100,maxRows=50000,log=()=>{}}) {
  if (core===foods || !core || !foods) throw new Error('Invalid food cutover databases');
  if (!Number.isInteger(pageRows)||pageRows<1||pageRows>500) throw new Error('Invalid page size');
  let current=await state(api,core),meta=await metadata(api,foods);
  if (meta.schema_version!=='1') throw new Error('Food database is not initialized');
  if (current.food_catalog_database_id && current.food_catalog_database_id!==foods) throw new Error('Food database directory mismatch');
  if (meta.legacy_source_id && meta.legacy_source_id!==core) throw new Error('Food database belongs to another environment');
  if (current.food_catalog_state==='ready') {
    if (current.food_catalog_database_id!==foods || meta.legacy_source_id!==core || meta.copy_verified!=='1') throw new Error('Activated food catalogue metadata mismatch');
    if (current.food_catalog_cleanup_done!=='1') await cleanupLegacyCatalog(api,core,{pageRows});
    log('Food catalogue is already active; history copy skipped.');
    return {skipped:true};
  }
  if (!['legacy','copying'].includes(current.food_catalog_state) || (meta.copy_verified==='1'&&current.food_catalog_state==='legacy')) throw new Error('Unsafe food catalogue cutover state');
  for (const spec of CATALOG_TABLES) for (const id of [core,foods]) {
    const columns=(await api.query(id,`PRAGMA table_info(${spec.name})`)).results.map(r=>r.name).sort();
    if (JSON.stringify(columns)!==JSON.stringify([...spec.columns].sort())) throw new Error('Unexpected catalogue columns for '+spec.name);
  }
  if (!meta.legacy_source_id) {
    const targetCounts=await counts(api,foods);
    if (Object.values(targetCounts).some(n=>n!==0)) throw new Error('Refusing to replace a populated food database');
    await api.query(foods,"INSERT INTO food_catalog_meta(key,value) VALUES('legacy_source_id',?)",[core]);
  }
  // Freeze before reading/copying. Triggers catch every in-flight old writer.
  await api.batch(core,[
    {sql:"INSERT INTO schema_meta(key,value) VALUES('food_catalog_database_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params:[foods]},
    {sql:"UPDATE schema_meta SET value='copying',updated_at=CURRENT_TIMESTAMP WHERE key='food_catalog_state' AND value IN ('legacy','copying')",params:[]}
  ]);
  try {
    const sourceCounts=await counts(api,core);
    if (Object.values(sourceCounts).reduce((a,b)=>a+b,0)>maxRows) throw new Error('Catalogue exceeds the bounded cutover row budget');
    await emptyTarget(api,foods,pageRows);
    for (const spec of CATALOG_TABLES) {
      let after=0;
      for (;;) {
        const rows=(await api.query(core,`SELECT rowid AS copy_rowid,${spec.columns.join(',')} FROM ${spec.name} WHERE rowid>? ORDER BY rowid LIMIT ?`,[after,pageRows])).results;
        if (!rows.length) break;
        await api.batch(foods,rows.map(row=>({sql:`INSERT INTO ${spec.name}(${spec.columns.join(',')}) VALUES(${spec.columns.map(()=>'?').join(',')})`,params:spec.columns.map(c=>row[c])})));
        after=rows.at(-1).copy_rowid;
      }
      const sourceHash=await fingerprint(api,core,spec,pageRows),targetHash=await fingerprint(api,foods,spec,pageRows);
      if (sourceHash!==targetHash) throw new Error('Food catalogue verification failed for '+spec.name);
      log('Verified '+spec.name+': '+sourceCounts[spec.name]+' rows.');
    }
    const targetCounts=await counts(api,foods);
    if (JSON.stringify(sourceCounts)!==JSON.stringify(targetCounts)) throw new Error('Food catalogue counts mismatch');
    await api.query(foods,"INSERT INTO food_catalog_meta(key,value) VALUES('copy_verified','1') ON CONFLICT(key) DO UPDATE SET value='1'");
    await api.query(core,"UPDATE schema_meta SET value='ready',updated_at=CURRENT_TIMESTAMP WHERE key='food_catalog_state' AND value='copying'");
    current=await state(api,core);
    if (current.food_catalog_state!=='ready'||current.food_catalog_database_id!==foods) throw new Error('Food catalogue activation failed');
    await cleanupLegacyCatalog(api,core,{pageRows});
    log('Food catalogue activated; personal diaries and health history unchanged.');
    return {skipped:false,counts:sourceCounts};
  } catch (error) {
    // A timed-out response may have committed activation. Never switch an
    // active catalogue back to the now-stale legacy copy.
    try {
      current=await state(api,core);
      if (current.food_catalog_state==='copying') {
        await api.query(foods,"DELETE FROM food_catalog_meta WHERE key='copy_verified'");
        await api.query(core,"UPDATE schema_meta SET value='legacy',updated_at=CURRENT_TIMESTAMP WHERE key='food_catalog_state' AND value='copying'");
      }
    } catch { /* Unknown state stays frozen; a serialized rerun resumes it. */ }
    throw error;
  }
}

export async function verifyFoodDatabase(api,foods,{check=async()=>{}}={}) {
  const meta=await metadata(api,foods);
  if (meta.schema_version!=='1') throw new Error('Food database is not initialized');
  const key='deployment:'+crypto.randomUUID(),product={name:'Synthetic deployment canary',barcode:'8590000000000'};
  try {
    await api.query(foods,'INSERT INTO shared_foods(food_key,search_name,product_json) VALUES(?,?,?)',[key,'synthetic deployment canary',JSON.stringify(product)]);
    const rows=(await api.query(foods,"SELECT food_key FROM shared_foods WHERE json_extract(product_json,'$.barcode')=? AND food_key=?",[product.barcode,key])).results;
    if (rows[0]?.food_key!==key) throw new Error('Food database barcode smoke test failed');
    await check({key,product});
  } finally { await api.query(foods,'DELETE FROM shared_foods WHERE food_key=?',[key]); }
}
