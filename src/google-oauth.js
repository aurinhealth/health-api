const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly","https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly","https://www.googleapis.com/auth/googlehealth.sleep.readonly","https://www.googleapis.com/auth/googlehealth.nutrition.readonly","https://www.googleapis.com/auth/googlehealth.nutrition.writeonly"];
export async function handleGoogleOAuth(request, env, pathname) {
  if (pathname === "/oauth/google" && request.method === "GET") {
    const origin = new URL(request.url).origin; const state = crypto.randomUUID(); const redirectUri = origin + "/oauth/google/callback";
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID); u.searchParams.set("redirect_uri", redirectUri); u.searchParams.set("response_type", "code"); u.searchParams.set("scope", GOOGLE_SCOPES.join(" ")); u.searchParams.set("access_type", "offline"); u.searchParams.set("prompt", "consent"); u.searchParams.set("state", state);
    return new Response(null,{status:302,headers:{Location:u.toString(),"Set-Cookie":"pfd_google_oauth_state="+encodeURIComponent(state)+"; Max-Age=600; Path=/oauth/google; Secure; HttpOnly; SameSite=Lax"}});
  }
  if (pathname !== "/oauth/google/callback" || request.method !== "GET") return null;
  const url = new URL(request.url); const code=url.searchParams.get("code"); const state=url.searchParams.get("state"); const cookie=request.headers.get("Cookie")||""; const m=cookie.match(/(?:^|;\\s*)pfd_google_oauth_state=([^;]+)/);
  if (!code || !state || !m || decodeURIComponent(m[1]) !== state) return html("Google OAuth failed","Invalid or missing OAuth state. Start again from /oauth/google.",400);
  if (url.searchParams.get("error")) return html("Google OAuth cancelled", esc(url.searchParams.get("error")),400);
  const redirectUri=url.origin+"/oauth/google/callback";
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:"authorization_code"})});
  const data=await response.json();
  if (!response.ok || !data.refresh_token) return html("Google OAuth token exchange failed","Google did not return a refresh token. Response: "+esc(JSON.stringify(data)),502);
  const body="<p>Google returned a new refresh token with the requested Health scopes.</p><p><strong>Do not share this token in chat or email.</strong></p><p>Copy it into the Cloudflare Worker secret <code>GOOGLE_REFRESH_TOKEN</code>, replacing the old value.</p><textarea style=\"width:100%;min-height:110px;font-family:monospace\" readonly>"+esc(data.refresh_token)+"</textarea><p>After replacing the secret, the Worker will automatically obtain short-lived access tokens when needed.</p><p><strong>Granted scopes:</strong> "+esc(data.scope||GOOGLE_SCOPES.join(" "))+"</p>";
  return html("Google OAuth completed",body,200);
}
function html(title,body,status){return new Response("<!doctype html><html><head><meta charset=\"utf-8\"><title>Petr Fitness Data</title></head><body style=\"font-family:system-ui;max-width:760px;margin:50px auto;padding:24px;line-height:1.5\"><h1>"+esc(title)+"</h1>"+body+"</body></html>",{status:status||200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","Referrer-Policy":"no-referrer"}});}
function esc(value){return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\"","&quot;");}