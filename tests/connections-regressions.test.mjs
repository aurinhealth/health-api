import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionStatus} from '../src/connections.js';
import {saveConnectionSecret,connectionEnvironment,deleteConnectionSecret,missingProviders} from '../src/connection-secrets.js';

// Minimal in-memory stand-in for connection_credentials keyed by (user_id, provider).
function credentialsDb(){
 const rows=new Map();
 return {rows,prepare(sql){const st={args:[],bind(...args){st.args=args;return st;},async run(){if(sql.startsWith('INSERT')){const [user,provider,encrypted]=st.args;rows.set(user+':'+provider,{user,provider,encrypted});}if(sql.startsWith('DELETE')){rows.delete(st.args[0]+':'+st.args[1]);}return {success:true};},async all(){return {results:[...rows.values()].filter(r=>r.user===st.args[0])};}};return st;}};
}

test('saved provider credentials are encrypted and loaded only for their user',async()=>{
 const DB=credentialsDb();
 const alice={DB,STRENGTH_API_KEY:'encryption-key',USER_ID:1};
 const bob={DB,STRENGTH_API_KEY:'encryption-key',USER_ID:2};
 await saveConnectionSecret(alice,'google','alice-google-secret');await saveConnectionSecret(alice,'intervals','alice-intervals-secret');
 assert.ok([...DB.rows.values()].every(r=>!r.encrypted.includes('alice-')));
 const resolved=await connectionEnvironment(alice);
 assert.equal(resolved.GOOGLE_REFRESH_TOKEN,'alice-google-secret');assert.equal(resolved.INTERVALS_API_KEY,'alice-intervals-secret');
 assert.deepEqual(missingProviders(resolved),[]);
 const other=await connectionEnvironment(bob);
 assert.equal(other.GOOGLE_REFRESH_TOKEN,undefined);assert.equal(other.INTERVALS_API_KEY,undefined);
 assert.deepEqual(missingProviders(other),['google','intervals']);
});

test('disconnecting removes only that provider',async()=>{
 const DB=credentialsDb(),env={DB,STRENGTH_API_KEY:'k',USER_ID:3};
 await saveConnectionSecret(env,'google','g');await saveConnectionSecret(env,'intervals','i');
 await deleteConnectionSecret(env,'intervals');
 const resolved=await connectionEnvironment(env);
 assert.equal(resolved.GOOGLE_REFRESH_TOKEN,'g');assert.equal(resolved.INTERVALS_API_KEY,undefined);
 assert.deepEqual(missingProviders(resolved),['intervals']);
});

test('credentials cannot be saved without a signed-in user',async()=>{
 await assert.rejects(saveConnectionSecret({DB:credentialsDb(),STRENGTH_API_KEY:'k'},'google','x'));
});

test('connection status does not mistake client configuration for consent or expose credentials',async()=>{
 const result=await connectionStatus({GOOGLE_CLIENT_ID:'private-id',GOOGLE_CLIENT_SECRET:'private-secret',INTERVALS_API_KEY:'private-key'});
 assert.equal(result.providers.find(p=>p.id==='google').connected,false);
 assert.equal(result.providers.find(p=>p.id==='intervals').connected,true);
 assert.deepEqual(result.providers.map(p=>p.id),['google','intervals']);
 assert.ok(!JSON.stringify(result).includes('private-'));
});
