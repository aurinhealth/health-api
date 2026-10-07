// Account imports share one orchestration for onboarding and Refresh. Each
// connector keeps its own claim; partial measurements stay usable by the app.
import legacyHealthApi, {googleToken} from './index.js';
import {dashboardSyncStatus,startDashboardSync} from './dashboard-sync.js';
import {refreshSuggestions} from './profile-suggestions.js';
import {bumpCacheVersion} from './api-cache.js';
import {retryWorkoutExports} from './local-workouts.js';
import {syncWeights} from './weight-sync.js';
import {syncWellnessToIntervals} from './wellness-sync.js';
import {L} from './lang.js';
const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

export async function initialImport(env,ctx,{provider:onlyProvider,force=false}={}){
  const providers=(env.CONNECTED_PROVIDERS||[]).filter(provider=>!onlyProvider||provider===onlyProvider);if(!providers.length)return {status:'idle'};
  const runs=[];
  // Separate claims prevent a second connector from being lost during the first import.
  for(const provider of providers){
    const name='initial_'+provider;
    await dashboardSyncStatus(env.DB);
    const old=await env.DB.prepare('SELECT status FROM sync_status WHERE user_id=? AND sync_name=?').bind(env.USER_ID,name).first();
    if(old?.status==='done'&&!force)continue;
    runs.push(await startDashboardSync(env.DB,ctx,async()=>{
      const response=await legacyHealthApi.fetch(new Request('https://internal/sync/'+provider,{method:'POST'}),env,ctx);
      const data=await response.json();
      // Publish usable partial data before optional suggestions/export retries.
      await bumpCacheVersion(env.DB);
      if(!response.ok)throw new Error(L('Import se nepodařilo zahájit.', 'The import couldn\'t be started.'));
      await refreshSuggestions(env,{googleToken,force:true}).catch(()=>null);
      await retryWorkoutExports(env).catch(()=>null);
      const status=['error','partial'].includes(data.status)?data.status:provider==='google'?'queued':'done';
      return [{source:provider,status,importStatus:data.status,...(provider==='intervals'?{parts:{activities:data.activities,planned:data.planned,weight:data.weight}}:{})}];
    },name));
  }
  return {status:runs.length?'running':'done'};
}

export async function recentDashboardImport(env,ctx){
  const providers=env.CONNECTED_PROVIDERS||[],jobs=[];
  const collect=async(source,path)=>{
    try{const response=await legacyHealthApi.fetch(new Request('https://internal'+path,{method:'POST'}),env,ctx),data=await response.json();return {source,status:response.ok?data.status||'ok':'error',...(source==='intervals'?{parts:{activities:data.activities,planned:data.planned,weight:data.weight}}:{})};}
    catch(error){console.error('Recent sync failed',source,error.message);return {source,status:'error'};}
  };
  if(providers.includes('google'))jobs.push(collect('google','/sync/google/recent'));
  if(providers.includes('intervals'))jobs.push(collect('intervals','/sync/intervals/recent'));
  const results=await Promise.all(jobs);
  results.push(...await retryWorkoutExports(env).catch(()=>[{source:'exports',status:'error'}]));
  results.push(await collect('matching','/sync/match'));
  if(providers.includes('intervals')){
    const outgoing=await Promise.allSettled([
      syncWeights(env,{googleToken}),
      syncWellnessToIntervals(env,{sleepSessions:(from,to)=>legacyHealthApi.fetch(new Request('https://internal/health/sleep?start='+from+'&end='+shiftDate(to,1)),env,ctx).then(r=>r.json()).then(d=>d.sessions||[])})
    ]);
    outgoing.forEach((r,i)=>results.push({source:i?'wellness':'weight',status:r.status==='fulfilled'?'ok':'error'}));
  }
  await refreshSuggestions(env,{googleToken,force:true}).catch(()=>null);
  await bumpCacheVersion(env.DB);
  return results;
}
