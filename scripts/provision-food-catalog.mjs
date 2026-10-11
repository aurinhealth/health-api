import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseConfig} from './provision-user-shards.mjs';
import {cloudflareD1,foodPlan,provisionFoodDatabase,bindFoodDatabase,migrateFoodCatalog,verifyFoodDatabase} from './food-catalog-tools.mjs';

async function main() {
  const environment=process.argv.includes('--staging')?'staging':'';
  const config=parseConfig(readFileSync('wrangler.runtime.jsonc','utf8')),plan=foodPlan(config,environment);
  const api=cloudflareD1({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN});
  if (process.argv.includes('--migrate')) {
    const binding=plan.selected.d1_databases.find(d=>d.binding==='FOODS');
    if (!binding||binding.database_name!==plan.name) throw new Error('Food database binding is missing');
    // Verify existence/identity before any copied row or cutover flag is written.
    const db=(await api.request('/'+binding.database_id)).result;
    if (db.name!==plan.name||db.uuid!==binding.database_id||db.jurisdiction!=='eu') throw new Error('Food database identity mismatch');
    await verifyFoodDatabase(api,db.uuid);
    console.log('Verified independent food database and barcode lookup; synthetic row removed.');
    await migrateFoodCatalog({api,core:plan.core.database_id,foods:db.uuid,log:console.log});
    return;
  }
  const db=await provisionFoodDatabase(api,plan);
  writeFileSync('wrangler.runtime.jsonc',JSON.stringify(bindFoodDatabase(config,environment,db),null,2)+'\n');
  console.log('Preparing food database '+db.name+' (EU).');
  try {
    execFileSync('npx',['--yes','wrangler@4','d1','migrations','apply',db.name,'--remote','--config','wrangler.runtime.jsonc',...(environment?['--env',environment]:[])],{encoding:'utf8',maxBuffer:16*1024*1024});
  } catch (error) { throw new Error('Food schema deployment failed, exit '+error.status); }
  console.log('Food database prepared; catalogue cutover waits for the new Worker.');
}
if (process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
