// HTTPS and the browser's security headers for everything the Worker answers;
// main.js wraps the app in this. Static files in public/ never reach it
// (public/_headers gives them the same).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Only what no page relies on: other sites cannot frame the app (clickjacking),
// the browser does not guess content types, remembers HTTPS for a year (on
// the subdomains too), ignores <base> and plugins, and gives no page the
// camera, microphone, location or payments (passkeys stay allowed), and runs
// no script: a page with scripts of its own names them (scriptPolicy), so text
// that slipped into a page unescaped still cannot run. public/_headers sends
// the same to the static files, which never reach the Worker.
const BASE_POLICY = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": BASE_POLICY + "; script-src 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
};

// The policy for a page whose own inline scripts are in `markup`: only those
// scripts run, by their SHA-256 (the browser hashes what stands between
// <script> and </script>). Pass the code's own script constants, never the
// page with the user's text in it. A JSON-LD block is data and needs no hash.
// `origins` are sites whose scripts the page loads (Cloudflare Turnstile).
const policies = new Map();
export function scriptPolicy(markup, origins = []) {
  const key = origins.join(" ") + "\n" + markup;
  if (!policies.has(key)) {
    const hashes = [...markup.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, code]) => `'sha256-${sha256Base64(code)}'`);
    if (policies.size > 50) policies.clear();
    policies.set(key, `${BASE_POLICY}; script-src ${[...hashes, ...origins].join(" ") || "'none'"}`);
  }
  return policies.get(key);
}

// SHA-256 without crypto.subtle, which only answers asynchronously; pages are
// built synchronously. Checked against crypto.subtle in tests/web-security.test.mjs.
const primes = [];
for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n);
const fraction = x => (x - Math.floor(x)) * 2 ** 32 >>> 0;
const K = primes.map(p => fraction(Math.cbrt(p)));
const H = primes.slice(0, 8).map(p => fraction(Math.sqrt(p)));
function sha256Base64(text) {
  const bytes = new TextEncoder().encode(text), bits = bytes.length * 8;
  const padded = new Uint8Array((bytes.length + 72) & ~63);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32)); view.setUint32(padded.length - 4, bits >>> 0);
  const h = H.slice(), w = new Uint32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = view.getUint32(block + i * 4);
      else w[i] = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) + w[i - 7] + (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 16];
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i] | 0;
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c)) | 0;
      k = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
    }
    [a, b, c, d, e, f, g, k].forEach((v, i) => { h[i] = h[i] + v | 0; });
  }
  const out = new DataView(new ArrayBuffer(32));
  h.forEach((v, i) => out.setUint32(i * 4, v >>> 0));
  return btoa(String.fromCharCode(...new Uint8Array(out.buffer)));
}

// A header the app sets itself (for example Referrer-Policy: no-referrer on the
// Google sign-in pages) wins.
export function withSecurityHeaders(response) {
  if (response.status === 101 || response.webSocket) return response;
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!secured.headers.has(name)) secured.headers.set(name, value);
  }
  // Response.json says only "application/json", and Safari then shows a message
  // opened in the browser (the connect sheet) as Latin-1: "NeplatnÃ½".
  if (/^application\/json\s*$/i.test(secured.headers.get("Content-Type") || "")) secured.headers.set("Content-Type", "application/json; charset=utf-8");
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
