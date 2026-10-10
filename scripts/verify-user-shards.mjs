// Deployment smoke test: only transient synthetic rows (negative user_id),
// never a real user's samples. The exact unique canary is removed in finally.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig } from './provision-user-shards.mjs';

export async function verifyShards({ accountId, token, config, environment = '', fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/i.test(accountId || '') || !token) throw new Error('Cloudflare credentials are missing');
  const selected = environment ? config.env?.[environment] : config;
  const bindings = selected?.d1_databases || [], core = bindings.find(b => b.binding==='DB');
  const shards = bindings.filter(b => /^USER_DATA_\d{3}$/.test(b.binding));
  if (!core || !shards.length || new Set(bindings.map(b=>b.database_id)).size!==bindings.length) throw new Error('Invalid deployed bindings');
  const canary = 'deployment:' + crypto.randomUUID();
  async function query(id, sql, params = []) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${id}/query`, {
      method:'POST', signal:AbortSignal.timeout(30000), headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}, body:JSON.stringify({sql,params})
    });
    const data = await response.json();
    if (!response.ok || !data.success || !data.result?.[0]?.success) throw new Error('D1 verification failed: HTTP '+response.status);
    return data.result[0];
  }
  const registry = (await query(core.database_id,'SELECT shard_key,binding_name,state FROM user_data_shards')).results;
  let verified = 0;
  for (const shard of shards) {
    const row = registry.find(r => r.binding_name===shard.binding);
    if (!row || row.state!=='ready') throw new Error('Shard is not registered');
    const marker = await query(shard.database_id,'SELECT version FROM user_data_shard_meta WHERE id=1');
    if (marker.results?.[0]?.version!==1 || !Number.isFinite(marker.meta?.size_after)) throw new Error('Shard is not initialized');
    // Identical external ID in each DB, different value: accidental reuse of
    // a binding would surface as an unexpected value or a unique violation.
    try {
      await query(shard.database_id,"INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,value_numeric,payload_json) VALUES(-1,'deployment-test','shard-canary',?,?,'{}')",[canary,++verified]);
      const result = await query(shard.database_id,"SELECT value_numeric FROM health_datapoints WHERE user_id=-1 AND source_family='deployment-test' AND data_type='shard-canary' AND external_id=?",[canary]);
      if (result.results?.[0]?.value_numeric!==verified) throw new Error('Shard canary failed');
    } finally {
      await query(shard.database_id,"DELETE FROM health_datapoints WHERE user_id=-1 AND source_family='deployment-test' AND data_type='shard-canary' AND external_id=?",[canary]);
    }
  }
  return { verified };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyShards({ accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,
    config:parseConfig(readFileSync('wrangler.runtime.jsonc','utf8')),environment:process.argv.includes('--staging')?'staging':''
  }).then(result=>console.log('Verified '+result.verified+' independent user databases; synthetic rows removed.'))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
