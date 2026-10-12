import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const entry=readFileSync(new URL('../src/entrypoint.js',import.meta.url),'utf8');
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
