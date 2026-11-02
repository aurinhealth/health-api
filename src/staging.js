// The test server (wrangler env "staging", staging.aurin.health) runs the same
// code against its own databases. Every page it serves says so, and search
// engines are kept out.
const BADGE = '<div style="position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:2147483647;padding:4px 12px;border-radius:999px;background:#d97706;color:#fff;font:600 12px/1.6 system-ui,sans-serif;letter-spacing:.04em;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25)">TEST · staging</div>';

export function isStaging(env) {
  return env?.ENVIRONMENT === "staging";
}

// The owner on the test server: no limits of an account and no group brake,
// so the coach evaluation keeps running (ai-usage.js, ai-total.js).
export const ownerUnlimited = env => env?.USER_IS_OWNER === true && isStaging(env);

export async function markStaging(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Aurin-Server", "staging");
  const type = headers.get("content-type") || "";
  if (!type.includes("text/html") || !response.body) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  const html = await response.text();
  const marked = html.includes("</body>") ? html.replace("</body>", BADGE + "</body>") : html + BADGE;
  headers.delete("content-length");
  return new Response(marked, { status: response.status, statusText: response.statusText, headers });
}

// Who sees Nastavení → Testování → Server in the app: on the test server
// everyone (so they can switch back), on the live server the owner and the
// e-mails in the Worker secret INTERNAL_TESTERS (comma separated), the internal
// TestFlight group. External testers never see it.
export function internalTester(env, user) {
  if (!user) return false;
  if (isStaging(env) || user.isOwner === true) return true;
  const emails = String(env?.INTERNAL_TESTERS || "").split(/[,\s]+/).map(email => email.trim().toLowerCase()).filter(Boolean);
  return emails.includes(String(user.email || "").trim().toLowerCase());
}
