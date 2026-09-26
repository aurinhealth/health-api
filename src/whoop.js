const AUTH="https://api.prod.whoop.com/oauth/oauth2/";
const SCOPES="offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement";
async function table(env){await env.DB.prepare("CREATE TABLE IF NOT EXISTS provider_tokens (provider TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, updated_at TEXT NOT NULL)").run();}
async function key(env){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.STRENGTH_API_KEY));return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
function encode(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes)));}
function decode(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function save(env,tokens){const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),new TextEncoder().encode(JSON.stringify(tokens)));await table(env);await env.DB.prepare("INSERT INTO provider_tokens(provider,ciphertext,updated_at) VALUES ('whoop',?,?) ON CONFLICT(provider) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at").bind(encode(iv)+'.'+encode(encrypted),new Date().toISOString()).run();}
async function read(env){await table(env);const row=await env.DB.prepare("SELECT ciphertext FROM provider_tokens WHERE provider='whoop'").first();if(!row)return null;const [iv,data]=row.ciphertext.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},await key(env),decode(data))));}
export async function hasWhoopConnection(env){if(!env.DB||!env.STRENGTH_API_KEY)return false;return Boolean(await read(env));}
function reply(message,status=400){return new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
export async function whoopOAuth(request,env,authorized){
  const url=new URL(request.url);if(!url.pathname.startsWith('/oauth/whoop'))return null;
  if(!authorized)return reply('Připojení vyžaduje přihlášení do dashboardu.',401);
  if(!env.WHOOP_CLIENT_ID||!env.WHOOP_CLIENT_SECRET||!env.STRENGTH_API_KEY||!env.DB)return reply('WHOOP není nakonfigurovaný: nastav Client ID a Client Secret aplikace na serveru.',503);
  const callback=url.origin+'/oauth/whoop/callback';
  if(url.pathname==='/oauth/whoop'&&request.method==='GET'){
    const state=crypto.randomUUID(),auth=new URL(AUTH+'auth');for(const [k,v]of Object.entries({client_id:env.WHOOP_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:SCOPES,state}))auth.searchParams.set(k,v);
    return new Response(null,{status:302,headers:{Location:auth.href,'Set-Cookie':'pfd_whoop_state='+state+'; Path=/oauth/whoop; Max-Age=600; Secure; HttpOnly; SameSite=Lax','Cache-Control':'no-store'}});
  }
  if(url.pathname!=='/oauth/whoop/callback'||request.method!=='GET')return reply('Neplatná cesta.',404);
  const cookie=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('pfd_whoop_state='))?.slice(16);
  if(!cookie||cookie!==url.searchParams.get('state'))return reply('Neplatný OAuth state. Začni znovu v Nastavení.');
  if(url.searchParams.has('error')||!url.searchParams.get('code'))return reply('Připojení WHOOP nebylo povolené.');
  const res=await fetch(AUTH+'token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.WHOOP_CLIENT_ID,client_secret:env.WHOOP_CLIENT_SECRET,redirect_uri:callback,code:url.searchParams.get('code'),grant_type:'authorization_code'})});
  if(!res.ok)return reply('WHOOP nedokončil připojení. Zkontroluj registraci a callback.',502);
  const tokens=await res.json();if(!tokens.access_token||!tokens.refresh_token)return reply('WHOOP nevrátil potřebné oprávnění pro synchronizaci.',502);
  await save(env,{...tokens,expires_at:Date.now()+tokens.expires_in*1000});
  return new Response(null,{status:302,headers:{Location:'/app#settings','Set-Cookie':'pfd_whoop_state=; Path=/oauth/whoop; Max-Age=0; Secure; HttpOnly; SameSite=Lax','Cache-Control':'no-store'}});
}
// Shared promise prevents refresh-token rotation races within this isolate.
let refreshPending=null;
async function token(env){const stored=await read(env);if(!stored)throw new Error('WHOOP není připojený.');if(stored.expires_at>Date.now()+60000)return stored.access_token;if(!refreshPending)refreshPending=(async()=>{const response=await fetch(AUTH+'token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:env.WHOOP_CLIENT_ID,client_secret:env.WHOOP_CLIENT_SECRET,refresh_token:stored.refresh_token,scope:'offline'})});if(!response.ok)throw new Error('Obnov připojení WHOOP v Nastavení.');const fresh=await response.json();if(!fresh.access_token||!fresh.refresh_token)throw new Error('Obnov připojení WHOOP.');await save(env,{...fresh,expires_at:Date.now()+fresh.expires_in*1000});return fresh.access_token;})().finally(()=>{refreshPending=null;});return refreshPending;}
export async function whoopData(env){const access=await token(env),start=new Date(Date.now()-30*86400000).toISOString();async function list(path){let records=[],next;for(let i=0;i<5;i++){const url=new URL('https://api.prod.whoop.com/developer/v2/'+path);url.searchParams.set('start',start);url.searchParams.set('limit','25');if(next)url.searchParams.set('nextToken',next);const res=await fetch(url,{headers:{Authorization:'Bearer '+access}});if(!res.ok)throw new Error('WHOOP data nejsou dostupná ('+res.status+').');const data=await res.json();records.push(...(data.records||[]));next=data.next_token;if(!next)break;}return records;}
  const [recovery,sleep,cycles]=await Promise.all([list('recovery'),list('activity/sleep'),list('cycle')]);return {status:'ok',source:'whoop',recovery,sleep,cycles};
}
