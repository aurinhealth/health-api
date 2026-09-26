import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionStatus} from '../src/connections.js';
import {whoopOAuth} from '../src/whoop.js';
import {saveConnectionSecret,connectionEnvironment} from '../src/connection-secrets.js';
test('saved provider credentials are encrypted and used by subsequent requests',async()=>{
 const rows=[];const DB={prepare(sql){return {bind(...args){this.args=args;return this;},async run(){if(sql.startsWith('INSERT'))rows.push({provider:this.args[0],encrypted:this.args[1]});return {success:true};},async all(){return {results:rows};}};}};
 const env={DB,STRENGTH_API_KEY:'encryption-key',GOOGLE_REFRESH_TOKEN:'old-google',INTERVALS_API_KEY:'old-intervals'};
 await saveConnectionSecret(env,'google','new-google-secret');await saveConnectionSecret(env,'intervals','new-intervals-secret');
 assert.ok(rows.every(r=>!r.encrypted.includes('new-')));
 const resolved=await connectionEnvironment(env);assert.equal(resolved.GOOGLE_REFRESH_TOKEN,'new-google-secret');assert.equal(resolved.INTERVALS_API_KEY,'new-intervals-secret');assert.equal(env.GOOGLE_REFRESH_TOKEN,'old-google');
});
test('connection status does not mistake client configuration for consent or expose credentials',async()=>{
 const result=await connectionStatus({GOOGLE_CLIENT_ID:'private-id',GOOGLE_CLIENT_SECRET:'private-secret',INTERVALS_API_KEY:'private-key'});
 assert.equal(result.providers.find(p=>p.id==='google').connected,false);
 assert.equal(result.providers.find(p=>p.id==='intervals').connected,true);
 assert.equal(result.providers.find(p=>p.id==='apple').connectUrl,null);
 assert.ok(!JSON.stringify(result).includes('private-'));
});
test('WHOOP refuses unauthenticated and unconfigured authorization',async()=>{
 const req=new Request('https://petrfitnessdata.eu/oauth/whoop');
 assert.equal((await whoopOAuth(req,{},false)).status,401);
 assert.equal((await whoopOAuth(req,{},true)).status,503);
});
test('WHOOP consent requests offline scope and binds callback to secure state cookie',async()=>{
 const res=await whoopOAuth(new Request('https://petrfitnessdata.eu/oauth/whoop'),{WHOOP_CLIENT_ID:'id',WHOOP_CLIENT_SECRET:'secret',STRENGTH_API_KEY:'key',DB:{}},true);
 const target=new URL(res.headers.get('Location'));
 assert.equal(res.status,302);assert.equal(target.searchParams.get('redirect_uri'),'https://petrfitnessdata.eu/oauth/whoop/callback');
 assert.ok(target.searchParams.get('scope').includes('offline'));
 assert.ok(res.headers.get('Set-Cookie').includes('HttpOnly'));
 assert.ok(res.headers.get('Set-Cookie').includes(target.searchParams.get('state')));
});
test('WHOOP rejects missing or mismatched state before exchanging tokens',async()=>{
 const res=await whoopOAuth(new Request('https://petrfitnessdata.eu/oauth/whoop/callback?code=code&state=bad',{headers:{Cookie:'pfd_whoop_state=expected'}}),{WHOOP_CLIENT_ID:'id',WHOOP_CLIENT_SECRET:'secret',STRENGTH_API_KEY:'key',DB:{}},true);
 assert.equal(res.status,400);
});
