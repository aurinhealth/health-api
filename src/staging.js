// The staging copy (wrangler env "staging") runs the same code against its own
// database. Every page it serves says so, and search engines are kept out.
const BADGE = '<div style="position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:2147483647;padding:4px 12px;border-radius:999px;background:#d97706;color:#fff;font:600 12px/1.6 system-ui,sans-serif;letter-spacing:.04em;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25)">TEST · staging</div>';

export function isStaging(env) {
  return env?.ENVIRONMENT === "staging";
}

export async function markStaging(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  const type = headers.get("content-type") || "";
  if (!type.includes("text/html") || !response.body) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  const html = await response.text();
  const marked = html.includes("</body>") ? html.replace("</body>", BADGE + "</body>") : html + BADGE;
  headers.delete("content-length");
  return new Response(marked, { status: response.status, statusText: response.statusText, headers });
}
