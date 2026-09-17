import { handleOAuth } from "./oauth.js";

export async function handleOAuthCompat(request, env, pathname) {
  const origin = new URL(request.url).origin;
  const response = await handleOAuth(request, env, pathname);
  if (!response) return null;

  if (pathname === "/.well-known/oauth-authorization-server" && request.method === "GET") {
    const metadata = await response.clone().json().catch(() => null);
    if (!metadata) return response;
    metadata.scopes_supported = Array.from(new Set([...(metadata.scopes_supported || []), "offline_access"]));
    metadata.authorization_response_iss_parameter_supported = true;
    return json(metadata, response.status);
  }

  if (pathname === "/authorize" && request.method === "POST" && response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location");
    if (!location) return response;
    const target = new URL(location);
    target.searchParams.set("iss", origin);
    const headers = new Headers(response.headers);
    headers.set("Location", target.toString());
    return new Response(null, { status: response.status, headers });
  }

  if (pathname === "/token" && request.method === "POST" && response.status >= 200 && response.status < 300) {
    const token = await response.clone().json().catch(() => null);
    if (!token) return response;
    token.scope = Array.from(new Set(String(token.scope || "").split(/\s+/).filter(Boolean).concat("offline_access"))).join(" ");
    return json(token, response.status);
  }

  return response;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" }
  });
}
