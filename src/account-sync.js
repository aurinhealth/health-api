// Account imports share one orchestration for onboarding and Refresh. Each
// connector keeps its own claim; partial measurements stay usable by the app.
import legacyHealthApi, {googleToken} from './index.js';
import {dashboardSyncStatus,startDashboardSync} from './dashboard-sync.js';
import {refreshSuggestions} from './profile-suggestions.js';
import {bumpCacheVersion} from './api-cache.js';
import {retryWorkoutExports} from './local-workouts.js';
import {syncWeights} from './weight-sync.js';
import {syncWellnessToIntervals} from './wellness-sync.js';
import {syncUltrahuman} from './ultrahuman.js';
import {syncWhoop} from './whoop.js';
import {syncWahoo,retryWahooExports} from './wahoo.js';
import {L} from './lang.js';
// A failed part says in plain words what did not come and, when it is known, why
// (Settings → Data sources shows it under "Last sync had errors").
const GOOGLE_PARTS={sleep:['spánek','sleep'],'daily-heart-rate-variability':['HRV','HRV'],'daily-resting-heart-rate':['klidový tep','resting heart rate'],steps:['kroky','steps'],
  'active-energy-burned':['aktivní energie','active energy'],exercise:['tréninky','workouts'],weight:['váha','weight'],food:['jídlo','food']};
export function syncReason(message){
  const m=String(message||'');
  if(/HTTP 429|rate.?limit/i.test(m))return L('služba odmítla další dotazy, zkus to později','the service refused more requests, try again later');
  if(/HTTP 401|invalid_grant|unauthori[sz]ed/i.test(m))return L('přihlášení vypršelo, připoj službu znovu','the sign-in expired, connect the service again');
  if(/HTTP 403|permission/i.test(m))return L('chybí oprávnění','a permission is missing');
  if(/HTTP 5\d\d/.test(m))return L('služba měla výpadek','the service had an outage');
  if(/timeout|timed out|abort/i.test(m))return L('služba neodpověděla včas','the service didn\'t answer in time');
  return null;
}
const withReason=(text,message)=>{const why=syncReason(message);return why?text+' ('+why+')':text;};
export function googleFailure(parts=[]){
  const bad=parts.filter(r=>r&&(r.status==='error'||r.status==='partial'));if(!bad.length)return null;
  const name=r=>{const n=GOOGLE_PARTS[r.type];return n?L(n[0],n[1]):String(r.type||'?');};
  const failed=bad.filter(r=>r.status==='error'),cut=bad.filter(r=>r.status==='partial'),bits=[];
  if(failed.length)bits.push(withReason(L('nestáhlo se: ','not downloaded: ')+failed.map(name).join(', '),failed.map(r=>r.message).find(syncReason)));
  if(cut.length)bits.push(L('jen zčásti: ','only partly: ')+cut.map(name).join(', '));
  return bits.join('; ');
}
const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

export async function initialImport(env,ctx,{provider:onlyProvider,force=false}={}){
  // Ultrahuman imported its history when it was connected (ultrahuman.js).
  const providers=(env.CONNECTED_PROVIDERS||[]).filter(provider=>['google','intervals'].includes(provider)&&(!onlyProvider||provider===onlyProvider));if(!providers.length)return {status:'idle'};
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
    try{
      const response=await legacyHealthApi.fetch(new Request('https://internal'+path,{method:'POST'}),env,ctx),data=await response.json();
      const status=response.ok?data.status||'ok':'error';
      const message=status==='ok'?null:source==='google'&&Array.isArray(data.results)?googleFailure(data.results):withReason(L('synchronizace selhala','the sync failed'),data.error||(response.ok?'':'HTTP '+response.status));
      return {source,status,...(message?{message}:{}),...(source==='intervals'?{parts:{activities:data.activities,planned:data.planned,weight:data.weight}}:{})};
    }
    catch(error){console.error('Recent sync failed',source,error.message);return {source,status:'error',message:withReason(L('synchronizace selhala','the sync failed'),error.message)};}
  };
  if(providers.includes('google'))jobs.push(collect('google','/sync/google/recent'));
  if(providers.includes('intervals'))jobs.push(collect('intervals','/sync/intervals/recent'));
  if(providers.includes('ultrahuman'))jobs.push(syncUltrahuman(env,{days:3}).then(r=>({source:'ultrahuman',status:r.status})).catch(()=>({source:'ultrahuman',status:'error'})));
  if(providers.includes('whoop'))jobs.push(syncWhoop(env,{days:3}).then(r=>({source:'whoop',status:r.status})).catch(()=>({source:'whoop',status:'error'})));
  if(providers.includes('wahoo'))jobs.push(syncWahoo(env,{days:3}).then(r=>({source:'wahoo',status:r.status})).catch(()=>({source:'wahoo',status:'error'})));
  const results=await Promise.all(jobs);
  results.push(...await retryWorkoutExports(env).catch(()=>[{source:'exports',status:'error'}]));
  if(providers.includes('wahoo'))await retryWahooExports(env).catch(()=>null);
  results.push(await collect('matching','/sync/match'));
  if(providers.includes('intervals')){
    const outgoing=await Promise.allSettled([
      syncWeights(env,{googleToken}),
      syncWellnessToIntervals(env,{sleepSessions:(from,to)=>legacyHealthApi.fetch(new Request('https://internal/health/sleep?start='+from+'&end='+shiftDate(to,1)),env,ctx).then(r=>r.json()).then(d=>d.sessions||[])})
    ]);
    outgoing.forEach((r,i)=>{
      if(r.status==='fulfilled')return results.push({source:i?'wellness':'weight',status:'ok'});
      console.error('Intervals.icu sync failed',i?'wellness':'weight',r.reason?.message);
      results.push({source:i?'wellness':'weight',status:'error',message:withReason(i?L('zdravotní hodnoty se do Intervals.icu neposlaly','health values were not sent to Intervals.icu'):L('váha se do Intervals.icu neposlala','weight was not sent to Intervals.icu'),r.reason?.message)});
    });
  }
  await refreshSuggestions(env,{googleToken,force:true}).catch(()=>null);
  await bumpCacheVersion(env.DB);
  return results;
}
