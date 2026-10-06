import { saveConnectionSecret } from './connection-secrets.js';
import { HEALTH_SCOPES, EXTRA_SCOPES } from './google-scopes.js';
const GOOGLE_OAUTH_ORIGIN = "https://petrfitnessdata.eu";
export async function handleGoogleOAuth(request, env, pathname) {
  if (pathname === "/oauth/google" && request.method === "GET") {
    const origin = GOOGLE_OAUTH_ORIGIN; const state = crypto.randomUUID(); const redirectUri = origin + "/oauth/google/callback";
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID); u.searchParams.set("redirect_uri", redirectUri); u.searchParams.set("response_type", "code"); // Google Sheets access is only needed for the owner's legacy strength sheet.
    // ?extra=1 adds the optional scopes on top of what was already granted.
    const extra = new URL(request.url).searchParams.get("extra") === "1";
    u.searchParams.set("scope", [...HEALTH_SCOPES, ...(extra ? Object.values(EXTRA_SCOPES) : [])].join(" ")); if (extra) u.searchParams.set("include_granted_scopes", "true"); u.searchParams.set("access_type", "offline"); u.searchParams.set("prompt", "consent"); u.searchParams.set("state", state);
    return new Response(null,{status:302,headers:{Location:u.toString(),"Set-Cookie":"pfd_google_oauth_state="+encodeURIComponent(state)+"; Max-Age=600; Path=/oauth/google; Secure; HttpOnly; SameSite=Lax"}});
  }
  if (pathname !== "/oauth/google/callback" || request.method !== "GET") return null;
  const url = new URL(request.url); const code=url.searchParams.get("code"); const state=url.searchParams.get("state"); const cookie=request.headers.get("Cookie")||""; const m=cookie.match(/(?:^|;\s*)pfd_google_oauth_state=([^;]+)/);
  if (!code || !state || !m || decodeURIComponent(m[1]) !== state) return html("Google OAuth failed","Invalid or missing OAuth state. Start again from /oauth/google.",400);
  if (url.searchParams.get("error")) return html("Google OAuth cancelled", esc(url.searchParams.get("error")),400);
  const redirectUri=GOOGLE_OAUTH_ORIGIN+"/oauth/google/callback";
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:"authorization_code"})});
  const data=await response.json();
  if (!response.ok || !data.refresh_token) return html("Google OAuth token exchange failed","Google nevrátil oprávnění pro automatickou synchronizaci. Zkus obnovit souhlas v Nastavení.",502);
  await saveConnectionSecret(env,'google',data.refresh_token);
  // What the user actually granted; optional scopes may have been declined.
  await saveConnectionSecret(env,'google_scopes',String(data.scope||HEALTH_SCOPES.join(' ')));
  return new Response(null,{status:302,headers:{Location:'/app#settings','Set-Cookie':'pfd_google_oauth_state=; Path=/oauth/google; Max-Age=0; Secure; HttpOnly; SameSite=Lax','Cache-Control':'no-store'}});
}
function html(title,body,status){return new Response("<!doctype html><html><head><meta charset=\"utf-8\"><title>Loadwise</title></head><body style=\"font-family:system-ui;max-width:760px;margin:50px auto;padding:24px;line-height:1.5\"><h1>"+esc(title)+"</h1>"+body+"</body></html>",{status:status||200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","Referrer-Policy":"no-referrer"}});}
function esc(value){return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\"","&quot;");}
