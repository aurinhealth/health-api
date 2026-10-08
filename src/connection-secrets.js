import { L } from './lang.js';
// Provider credentials per user (the Google and Intervals.icu keys), AES-GCM
// encrypted. CONNECTION_KEY is their own key: rows written with it start with
// "v2." and are bound to their user and provider, so a row copied to another
// account does not decrypt. Rows saved before CONNECTION_KEY existed were
// encrypted with a key derived from STRENGTH_API_KEY; they stay readable and
// migrateConnectionSecrets re-encrypts them, after which STRENGTH_API_KEY no
// longer guards anyone's keys. Changing or removing CONNECTION_KEY later
// disconnects everyone (each user connects again).
const V2 = 'v2.';
async function table(env){await env.DB.prepare('CREATE TABLE IF NOT EXISTS connection_credentials (user_id INTEGER NOT NULL, provider TEXT NOT NULL, encrypted TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, provider))').run();}
// A value shorter than this is a paste mistake, not a key; it is not used.
let shortKeyReported=false;
function hasConnectionKey(env){const value=String(env.CONNECTION_KEY||'');if(value&&value.length<32&&!shortKeyReported){shortKeyReported=true;console.error('CONNECTION_KEY is shorter than 32 characters and is ignored');}return value.length>=32;}
async function connectionKey(env){if(!hasConnectionKey(env))throw new Error('CONNECTION_KEY is not set');const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.CONNECTION_KEY),'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new Uint8Array(32),info:new TextEncoder().encode('loadwise connection credentials')},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function legacyKey(env){if(!env.STRENGTH_API_KEY)throw new Error(L('Chybí zabezpečení propojení.', 'Connection security is missing.'));const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.STRENGTH_API_KEY));return crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);}
const enc=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const dec=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const boundTo=(uid,provider)=>new TextEncoder().encode(Number(uid)+':'+provider);
function userId(env){const id=Number(env.USER_ID);if(!Number.isInteger(id)||id<=0)throw new Error(L('Připojení vyžaduje přihlášeného uživatele.', 'Connecting requires a signed-in user.'));return id;}
async function encryptSecret(env,uid,provider,value){
  const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(value);
  if(hasConnectionKey(env))return V2+enc(iv)+'.'+enc(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:boundTo(uid,provider)},await connectionKey(env),plain));
  return enc(iv)+'.'+enc(await crypto.subtle.encrypt({name:'AES-GCM',iv},await legacyKey(env),plain));
}
async function decryptSecret(env,uid,provider,stored){
  const v2=stored.startsWith(V2),[iv,cipher]=(v2?stored.slice(V2.length):stored).split('.');
  const plain=v2?await crypto.subtle.decrypt({name:'AES-GCM',iv:dec(iv),additionalData:boundTo(uid,provider)},await connectionKey(env),dec(cipher)):await crypto.subtle.decrypt({name:'AES-GCM',iv:dec(iv)},await legacyKey(env),dec(cipher));
  return new TextDecoder().decode(plain);
}
export async function saveConnectionSecret(env,provider,value){const uid=userId(env);await table(env);await env.DB.prepare('INSERT INTO connection_credentials(user_id,provider,encrypted,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at').bind(uid,provider,await encryptSecret(env,uid,provider,value),new Date().toISOString()).run();}
export async function deleteConnectionSecret(env,provider){const uid=userId(env);await table(env);await env.DB.prepare('DELETE FROM connection_credentials WHERE user_id=? AND provider=?').bind(uid,provider).run();}
// Loads the signed-in user's credentials into env. Only the owner falls back to
// the legacy global secrets; userEnv() already removed them for everyone else.
// A key that does not decrypt counts as not connected, so the user can connect
// again instead of every request failing.
export async function connectionEnvironment(env){
  if(!env.DB||!env.USER_ID||!(hasConnectionKey(env)||env.STRENGTH_API_KEY))return env;
  await table(env);
  const uid=userId(env),result=await env.DB.prepare('SELECT provider,encrypted FROM connection_credentials WHERE user_id=?').bind(uid).all();
  const resolved={...env,CONNECTED_PROVIDERS:[]};
  for(const row of result.results||[]){
    let plain;
    try{plain=await decryptSecret(env,uid,row.provider,row.encrypted);}
    catch(error){console.error('Connection key unreadable',uid,row.provider,error.message);continue;}
    if(row.provider==='google')resolved.GOOGLE_REFRESH_TOKEN=plain;if(row.provider==='intervals')resolved.INTERVALS_API_KEY=plain;if(row.provider==='google_scopes')resolved.GOOGLE_SCOPES=plain.split(/\s+/).filter(Boolean);
  }
  if(resolved.GOOGLE_REFRESH_TOKEN)resolved.CONNECTED_PROVIDERS.push('google');if(resolved.INTERVALS_API_KEY)resolved.CONNECTED_PROVIDERS.push('intervals');return resolved;
}
// Cron: re-encrypts the rows saved before CONNECTION_KEY with it (all users,
// so env.DB is the whole database). A row saved again in the meantime is left
// as the new save wrote it.
export async function migrateConnectionSecrets(env,{limit=100}={}){
  if(!env.DB||!hasConnectionKey(env)||!env.STRENGTH_API_KEY)return {migrated:0,failed:0};
  await table(env);
  const rows=(await env.DB.prepare("SELECT user_id,provider,encrypted FROM connection_credentials WHERE encrypted NOT LIKE 'v2.%' LIMIT ?").bind(limit).all()).results||[];
  let migrated=0,failed=0;
  for(const row of rows){
    try{
      const encrypted=await encryptSecret(env,row.user_id,row.provider,await decryptSecret(env,row.user_id,row.provider,row.encrypted));
      const update=await env.DB.prepare('UPDATE connection_credentials SET encrypted=? WHERE user_id=? AND provider=? AND encrypted=?').bind(encrypted,row.user_id,row.provider,row.encrypted).run();
      if(update.meta?.changes!==0)migrated++;
    }catch(error){failed++;console.error('Connection key migration failed',row.user_id,row.provider,error.message);}
  }
  return {migrated,failed};
}
// Dashboard data needs both required sources connected.
export const REQUIRED_PROVIDERS=['google','intervals'];
export function missingProviders(env){const connected=env.CONNECTED_PROVIDERS||[];return REQUIRED_PROVIDERS.filter(p=>!connected.includes(p));}
