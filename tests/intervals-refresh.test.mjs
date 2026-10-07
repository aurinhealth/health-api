import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const client=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
function ui(responses){
  const button={disabled:false,textContent:'Obnovit'},out={textContent:''},notice={textContent:'Část importu se nepodařila.'},calls=[];
  const elements={settings:{},importStatus:notice,refresh:button};
  const context=vm.createContext({
    $:id=>elements[id],uiText:cs=>cs,
    document:{querySelectorAll:selector=>selector==='[data-intervals-refresh]'?[button]:[out],addEventListener(){}},
    jsonFetch:async(path,options)=>{calls.push({path,method:options?.method||'GET'});const next=responses.shift();if(next instanceof Error)throw next;assert.ok(next,'unexpected request');return next;},
    markDataChanged(){},load:async()=>{},toast(){},setTimeout:resolve=>resolve(),refreshCoachLifecycle:async()=>{}
  });
  vm.runInContext(client.slice(client.indexOf('function accountImportMessage('),client.indexOf('async function pollAccountImport(')),context);
  return {context,button,out,notice,calls};
}
test('connected Intervals card offers refresh in settings and onboarding without changing the key form',()=>{
  const context=vm.createContext({esc:x=>x,GOOGLE_PERMISSION_LABELS:{},intervalsKeyFormHtml:()=>'<form></form>'});
  vm.runInContext(client.slice(client.indexOf('function serviceCardHtml('),client.indexOf('// Connecting Intervals.icu')),context);
  for(const back of ['setup','settings']){
    const html=context.serviceCardHtml({id:'intervals',name:'Intervals.icu',connected:true},back);
    assert.match(html,/type="button" data-intervals-refresh>Obnovit/);
    assert.match(html,/data-provider-sync-status aria-live="polite"/);
  }
  assert.doesNotMatch(context.serviceCardHtml({id:'intervals',connected:false},'settings'),/data-intervals-refresh/);
  assert.doesNotMatch(context.serviceCardHtml({id:'google',connected:true},'settings'),/data-intervals-refresh/);
});
test('Intervals refresh polls its own import and replaces the stale account warning after success',async()=>{
  const {context,button,out,notice,calls}=ui([{status:'running'},{status:'running'},{status:'done'},{status:'done'}]);
  await context.refreshIntervals();
  assert.equal(button.disabled,false);assert.equal(button.textContent,'Obnovit');
  assert.match(out.textContent,/Intervals.icu je obnovené/);assert.match(notice.textContent,/Historie je načtená/);
  assert.deepEqual(calls.map(c=>c.method),['POST','GET','GET','GET']);
  assert.deepEqual(calls.map(c=>c.path),['/app/api/connections/intervals/sync','/app/api/connections/intervals/sync','/app/api/connections/intervals/sync','/app/api/sync']);
});
test('a retry retains a real Intervals failure and does not hide a different connector failure',async()=>{
  const failed={status:'partial',results:[{source:'intervals',status:'partial',parts:{planned:{status:'error',message:'HTTP 403'}}}]};
  const a=ui([{status:'running'},failed,failed]);await a.context.refreshIntervals();
  assert.match(a.out.textContent,/Intervals.icu · kalendář \(HTTP 403\)/);assert.match(a.notice.textContent,/Část importu/);assert.equal(a.button.disabled,false);
  const b=ui([{status:'running'},{status:'done'},{status:'partial',results:[{source:'google',status:'error'}]}]);await b.context.refreshIntervals();
  assert.match(b.out.textContent,/Intervals.icu je obnovené/);assert.match(b.notice.textContent,/Část importu/);
});
test('the general Refresh button also updates the warning rather than leaving the initial page text',async()=>{
  const {context,notice,button}=ui([{status:'accepted'},{status:'done'}]);
  const start=client.indexOf("$('refresh').onclick=async()=>{");
  vm.runInContext(client.slice(start,client.indexOf('$("prevWeek").onclick',start)),context);
  await button.onclick();assert.match(notice.textContent,/Historie je načtená/);
});
test('Intervals refresh endpoint requires authentication, same origin and a connection, and scopes status',async()=>{
  const start=entry.indexOf("  if(url.pathname==='/app/api/connections/intervals/sync'");
  const route=entry.slice(start,entry.indexOf("  if(url.pathname==='/app/api/sync'",start));
  const calls=[],context=vm.createContext({Response,L:cs=>cs,dashboardSyncStatus:async(db,name)=>{calls.push(name);return {status:'done'};},initialImport:async(env,ctx,options)=>{calls.push(options);return {status:'running'};}});
  vm.runInContext('async function route(request,url,session,env,ctx){'+route+'}',context);
  const url=new URL('https://loadwise.test/app/api/connections/intervals/sync'),env={CONNECTED_PROVIDERS:['intervals'],DB:{}};
  const post=origin=>new Request(url,{method:'POST',headers:origin?{Origin:origin}:{}});
  assert.equal((await context.route(post(url.origin),url,{signedIn:false},env,{})).status,401);
  assert.equal((await context.route(post('https://other.test'),url,{signedIn:true},env,{})).status,403);
  assert.equal((await context.route(post(url.origin),url,{signedIn:true},{CONNECTED_PROVIDERS:[]},{})).status,409);
  assert.equal(calls.length,0);
  assert.equal((await context.route(post(url.origin),url,{signedIn:true},env,{})).status,202);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{provider:'intervals',force:true});
  const response=await context.route(new Request(url),url,{signedIn:true},env,{});
  assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(calls[1],'initial_intervals');
});
