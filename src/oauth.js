import { timingSafeEqualString } from "./dashboard-auth.js";
const CLIENT_ID_PREFIX = "health-strength-";
const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 24 * 3600;
const ALLOWED_CLIENT_ORIGINS = ["https://chatgpt.com", "https://chat.openai.com", "https://platform.openai.com"];

export function oauthMetadata(origin) {
  return {
    issuer: `${origin}/`,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["strength:read", "strength:write"],
    client_id_metadata_document_supported: false
  };
}

export function protectedResourceMetadata(origin) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [`${origin}/`],
    scopes_supported: ["strength:read", "strength:write"],
    bearer_methods_supported: ["header"]
  };
}

export async function handleOAuth(request, env, pathname) {
  const origin = new URL(request.url).origin;
  if (pathname === "/.well-known/oauth-protected-resource" && request.method === "GET") return json(protectedResourceMetadata(origin));
  if (pathname === "/.well-known/oauth-authorization-server" && request.method === "GET") return json(oauthMetadata(origin));
  if (pathname === "/register" && request.method === "POST") return handleRegister(request);
  if (pathname === "/authorize" && request.method === "GET") return handleAuthorizeGet(request);
  if (pathname === "/authorize" && request.method === "POST") return handleAuthorizePost(request, env);
  if (pathname === "/token" && request.method === "POST") return handleToken(request, env);
  return null;
}

async function handleRegister(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (!redirectUris.length || redirectUris.some((u) => !isAllowedRedirect(u))) return json({ error: "invalid_client_metadata", error_description: "Only HTTPS ChatGPT/OpenAI redirect URIs are supported." }, 400);
  const clientId = `${CLIENT_ID_PREFIX}${crypto.randomUUID()}`;
  return json({ client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, 201);
}

function handleAuthorizeGet(request) {
  const url = new URL(request.url);
  const q = Object.fromEntries(["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"].map((k) => [k, url.searchParams.get(k) || ""]));
  if (q.response_type !== "code" || !q.client_id || !isAllowedRedirect(q.redirect_uri) || !q.code_challenge || q.code_challenge_method !== "S256") return new Response("Invalid OAuth authorization request", { status: 400 });
  return html(`<h1>Health &amp; Strength</h1><p>ChatGPT is requesting access to your personal strength-training data and workout tools.</p><form method="post" action="/authorize"><input type="hidden" name="client_id" value="${esc(q.client_id)}"><input type="hidden" name="redirect_uri" value="${esc(q.redirect_uri)}"><input type="hidden" name="state" value="${esc(q.state)}"><input type="hidden" name="code_challenge" value="${esc(q.code_challenge)}"><input type="hidden" name="code_challenge_method" value="${esc(q.code_challenge_method)}"><label>Enter your existing Health &amp; Strength API key to authorize this connection:<br><input name="authorization_key" type="password" required style="width:100%;padding:8px"></label><p><button type="submit">Authorize ChatGPT</button></p></form>`);
}

async function handleAuthorizePost(request, env) {
  const form = await request.formData();
  const redirectUri = String(form.get("redirect_uri") || "");
  const clientId = String(form.get("client_id") || "");
  const state = String(form.get("state") || "");
  const challenge = String(form.get("code_challenge") || "");
  const method = String(form.get("code_challenge_method") || "");
  const key = String(form.get("authorization_key") || "");
  if (!clientId || !isAllowedRedirect(redirectUri) || method !== "S256" || !challenge) return new Response("Invalid OAuth authorization request", { status: 400 });
  if (!env.STRENGTH_API_KEY || !timingSafeEqualString(key, env.STRENGTH_API_KEY)) return html("<h1>Authorization failed</h1><p>The authorization key is incorrect.</p>", 403);
  const payload = { typ: "code", client_id: clientId, redirect_uri: redirectUri, challenge, exp: Math.floor(Date.now() / 1000) + 300, iat: Math.floor(Date.now() / 1000) };
  const code = await sign(payload, env.STRENGTH_API_KEY);
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}

async function handleToken(request, env) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") || "");
  const secret = env.STRENGTH_API_KEY;
  if (!secret) return json({ error: "server_error" }, 500);
  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const clientId = String(form.get("client_id") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    const verifier = String(form.get("code_verifier") || "");
    const payload = await verify(code, secret);
    if (!payload || payload.typ !== "code" || payload.client_id !== clientId || payload.redirect_uri !== redirectUri || payload.exp < Math.floor(Date.now() / 1000)) return json({ error: "invalid_grant" }, 400);
    const digest = await sha256(verifier);
    if (base64url(digest) !== payload.challenge) return json({ error: "invalid_grant" }, 400);
    return json({ access_token: secret, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: await sign({ typ: "refresh", client_id: clientId, exp: Math.floor(Date.now() / 1000) + REFRESH_TTL, iat: Math.floor(Date.now() / 1000) }, secret), scope: "strength:read strength:write" });
  }
  if (grantType === "refresh_token") {
    const refresh = String(form.get("refresh_token") || "");
    const payload = await verify(refresh, secret);
    if (!payload || payload.typ !== "refresh" || payload.exp < Math.floor(Date.now() / 1000)) return json({ error: "invalid_grant" }, 400);
    return json({ access_token: secret, token_type: "Bearer", expires_in: ACCESS_TTL, scope: "strength:read strength:write" });
  }
  return json({ error: "unsupported_grant_type" }, 400);
}

async function sign(payload, secret) {
  const data = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(new TextEncoder().encode(data), secret);
  return `${data}.${base64url(sig)}`;
}
async function verify(token, secret) {
  try {
    const [data, sig] = String(token).split(".");
    if (!data || !sig) return null;
    const expected = await hmac(new TextEncoder().encode(data), secret);
    if (!timingSafeEqual(expected, fromBase64url(sig))) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64url(data)));
  } catch { return null; }
}
async function hmac(data, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}
async function sha256(value) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
function timingSafeEqual(a,b) { if (a.length !== b.length) return false; let x=0; for(let i=0;i<a.length;i++) x|=a[i]^b[i]; return x===0; }
function base64url(bytes) { let s=""; for(const b of bytes) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function fromBase64url(s) { s=s.replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4)s+="="; const bin=atob(s); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }
function isAllowedRedirect(value) { try { const u=new URL(value); return u.protocol === "https:" && ALLOWED_CLIENT_ORIGINS.includes(u.origin); } catch { return false; } }
function esc(value) { return String(value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"}})}
function html(body,status=200){return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Health &amp; Strength Authorization</title></head><body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:20px">${body}</body></html>`,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}})}
