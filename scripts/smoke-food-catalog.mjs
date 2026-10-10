import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseConfig} from './provision-user-shards.mjs';
import {cloudflareD1,foodPlan,verifyFoodDatabase} from './food-catalog-tools.mjs';

export async function smokeFoodCatalog({api,foods,oidcToken,fetchImpl=fetch}) {
  if (!oidcToken) throw new Error('Deployment authentication is missing');
  await verifyFoodDatabase(api,foods,{check:async({key,product})=>{
    const response=await fetchImpl('https://petrfitnessdata.eu/app/api/food/search',{
      method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+oidcToken,'Content-Type':'application/json'},
      body:JSON.stringify({name:product.name,barcode:product.barcode})
    });
    const data=await response.json();
    if (!response.ok||data.status!=='ok'||!data.candidates?.some(p=>p.catalog_id===key&&p.barcode===product.barcode)) throw new Error('Live food catalogue lookup failed: HTTP '+response.status);
  }});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const config=parseConfig(readFileSync('wrangler.runtime.jsonc','utf8')),plan=foodPlan(config);
  const foods=plan.selected.d1_databases.find(b=>b.binding==='FOODS')?.database_id;
  const api=cloudflareD1({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN});
  smokeFoodCatalog({api,foods,oidcToken:process.env.OIDC_TOKEN})
    .then(()=>console.log('Live food search returned the independent catalogue canary; synthetic row removed.'))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
