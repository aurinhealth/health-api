// HTTPS and the browser's security headers for everything the Worker answers;
// main.js wraps the app in this. Static files in public/ never reach it.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Only what no page relies on: other sites cannot frame the app (clickjacking),
// the browser does not guess content types, remembers HTTPS for a year and
// ignores <base> and plugins. Limiting scripts needs nonces on the inline
// scripts first.
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
};

// A header the app sets itself (for example Referrer-Policy: no-referrer on the
// Google sign-in pages) wins.
export function withSecurityHeaders(response) {
  if (response.status === 101 || response.webSocket) return response;
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!secured.headers.has(name)) secured.headers.set(name, value);
  }
  return secured;
}

// Plain HTTP goes to the same address on HTTPS (the session cookie is
// HTTPS-only anyway); local development (wrangler dev) stays on http.
export function httpsRedirect(request) {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || LOCAL_HOSTS.has(url.hostname)) return null;
  url.protocol = "https:";
  return Response.redirect(url.toString(), request.method === "GET" || request.method === "HEAD" ? 301 : 308);
}

export function secured(app) {
  return {
    scheduled: (controller, env, ctx) => app.scheduled(controller, env, ctx),
    async fetch(request, env, ctx) {
      return withSecurityHeaders(httpsRedirect(request) || await app.fetch(request, env, ctx));
    }
  };
}
