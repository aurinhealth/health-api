import { L } from './lang.js';
// Provider credentials per user (the Google, Intervals.icu and Ultrahuman keys, and the
// app's Apple sign-in token that deleting the account revokes), AES-GCM
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
// The stored value now (another request may have saved a newer one since env was loaded); null when none or unreadable.
export async function readConnectionSecret(env,provider){try{const uid=userId(env);await table(env);const row=await env.DB.prepare('SELECT encrypted FROM connection_credentials WHERE user_id=? AND provider=?').bind(uid,provider).first();return row?await decryptSecret(env,uid,provider,row.encrypted):null;}catch{return null;}}
// An OAuth pair ({access_token,refresh_token,expires_at} in seconds, WHOOP, Wahoo and Ultrahuman)
// is refreshed two minutes before it runs out.
export const tokensDue=(tokens,now=Date.now())=>Boolean(tokens?.expires_at)&&tokens.expires_at*1000<=now+120000;
// WHOOP and Wahoo take a refresh token back at its first use, so two requests refreshing
// the same pair at once (the hourly import and the app) got one refusal, and the
// connection was marked broken. One request at a time refreshes, under a 30-second lease
// (sync_status 'refresh_<provider>'); the others take the pair it saves. A refused refresh
// still uses a pair another request saved in the meantime. `refresh(tokens)` gives the new
// pair's text or null; the pair in use is returned (and saved), or null when refused.
const leaseName=provider=>'refresh_'+provider;
async function leaseRefresh(env,provider,id){try{await env.DB.prepare('CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))').run();const claim=await env.DB.prepare("INSERT INTO sync_status(user_id,sync_name,status,started_at,updated_at) VALUES(?,?,'running',?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET status='running',started_at=excluded.started_at,finished_at=NULL,updated_at=excluded.updated_at WHERE sync_status.status!='running' OR sync_status.updated_at<datetime('now','-30 seconds')").bind(userId(env),leaseName(provider),id).run();return claim.meta?.changes!==0;}catch{return true;}}
const releaseRefresh=(env,provider,id)=>env.DB.prepare("UPDATE sync_status SET status='done',finished_at=datetime('now'),updated_at=datetime('now') WHERE user_id=? AND sync_name=? AND started_at=?").bind(userId(env),leaseName(provider),id).run().catch(()=>null);
const parsed=text=>{try{return JSON.parse(text);}catch{return null;}};
export async function refreshConnectionTokens(env,provider,held,refresh,{now=Date.now(),pause=500,patience=15000}={}){
  for(const until=Date.now()+patience;;){
    const id=new Date().toISOString()+'.'+crypto.randomUUID(),lease=await leaseRefresh(env,provider,id);
    try{
      const current=(await readConnectionSecret(env,provider))??held,tokens=parsed(current);
      if(current!==held&&tokens?.access_token&&!tokensDue(tokens,now))return current;
      // A lease never given back (a request that died) is not waited for longer than `patience`.
      if(lease||Date.now()>until){
        const text=await refresh(tokens);
        if(text){await saveConnectionSecret(env,provider,text);return text;}
        const after=await readConnectionSecret(env,provider),again=parsed(after);
        return after&&after!==current&&again?.access_token&&!tokensDue(again,now)?after:null;
      }
    }finally{if(lease)await releaseRefresh(env,provider,id);}
    await new Promise(resolve=>setTimeout(resolve,pause));
  }
}
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
    if(row.provider==='google')resolved.GOOGLE_REFRESH_TOKEN=plain;if(row.provider==='intervals')resolved.INTERVALS_API_KEY=plain;if(row.provider==='intervals_athlete')resolved.INTERVALS_ATHLETE_ID=plain;if(row.provider==='google_scopes')resolved.GOOGLE_SCOPES=plain.split(/\s+/).filter(Boolean);if(row.provider==='apple')resolved.APPLE_REFRESH_TOKEN=plain;if(row.provider==='ultrahuman')resolved.ULTRAHUMAN_TOKEN=plain;if(row.provider==='whoop')resolved.WHOOP_TOKEN=plain;if(row.provider==='wahoo')resolved.WAHOO_TOKEN=plain;
  }
  if(resolved.GOOGLE_REFRESH_TOKEN)resolved.CONNECTED_PROVIDERS.push('google');if(resolved.INTERVALS_API_KEY)resolved.CONNECTED_PROVIDERS.push('intervals');if(resolved.ULTRAHUMAN_TOKEN)resolved.CONNECTED_PROVIDERS.push('ultrahuman');if(resolved.WHOOP_TOKEN)resolved.CONNECTED_PROVIDERS.push('whoop');if(resolved.WAHOO_TOKEN)resolved.CONNECTED_PROVIDERS.push('wahoo');return resolved;
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
