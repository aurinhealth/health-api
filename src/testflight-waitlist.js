// "Join the waitlist" on aurin.health: an e-mail waits here until the owner
// approves it in the app (Nastavení → Testování → Zájemci). Approving adds the
// address to the external TestFlight group through the App Store Connect API,
// and Apple sends the invitation. The group holds at most TESTER_LIMIT people.
// The API key comes from the deploy (deploy-worker.yml): ASC_KEY_ID,
// ASC_ISSUER_ID, ASC_KEY_P8 and, when there are several external groups,
// EXTERNAL_GROUP, the same as the release (vydat.yml).
import { L } from "./lang.js";
import { allowClient, allowRequest } from "./ip-rate-limit.js";
import { sessionSecret } from "./dashboard-auth.js";

export const TESTER_LIMIT = 20;
export const BUNDLE_ID = "eu.petrfitnessdata.loadwise.native";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASC = "https://api.appstoreconnect.apple.com/v1";
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS testflight_waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    invited_at TEXT
  )`).run();
}

export function waitlistEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

// POST /waitlist from the website. The answer is the same whether the address
// was new or already listed, so the form tells nobody who signed up.
// Cloudflare Turnstile shows that a person sent the form (security review 2026-10-25): a bot
// without its token no longer uses up the day's 300 for everyone. TURNSTILE_SECRET_KEY is a
// Worker secret; without it (the test server) the form works as before and the log says so.
export async function handleWaitlistSignup(request, env, pathname, fetchImpl = fetch) {
  if (pathname !== "/waitlist") return null;
  if (request.method !== "POST") return json({ message: "Use POST." }, 405);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ message: "Invalid request origin." }, 403);
  const body = await request.json().catch(() => ({}));
  const email = waitlistEmail(body?.email);
  if (!email) return json({ message: "Enter a valid email." }, 400);
  if (!(await allowClient(env.DB, request, sessionSecret(env), "waitlist", Date.now(), { minute: 3, hour: 10 }))) return json({ message: "Too many tries. Try again later." }, 429);
  if (!(await humanSent(env, request, body?.token, fetchImpl))) return json({ message: "We couldn't check that you're human. Try again." }, 403);
  if (!(await allowRequest(env.DB, "waitlist:all", { day: 300 }))) return json({ message: "Too many tries. Try again later." }, 429);
  await ensure(env.DB);
  await env.DB.prepare("INSERT INTO testflight_waitlist(email) VALUES(?) ON CONFLICT(email) DO NOTHING").bind(email).run();
  return json({ status: "ok" });
}

async function humanSent(env, request, token, fetchImpl) {
  const secret = String(env.TURNSTILE_SECRET_KEY || "");
  if (!secret) { console.error("TURNSTILE_SECRET_KEY is not set; waitlist sign-up not checked"); return true; }
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.set("secret", secret); form.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  const result = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
    .then(r => r.json()).catch(error => { console.error("Turnstile check failed", error.message); return null; });
  return result?.success === true && result.action === "waitlist";
}

// Storage limitation (privacy policy): an address leaves both lists (this one
// and signup_waitlist, tenancy.js) a year after it joined or was invited.
export const WAITLIST_MONTHS = 12;
export async function forgetOldWaitlist(db) {
  let removed = 0;
  for (const sql of [
    `DELETE FROM testflight_waitlist WHERE COALESCE(invited_at, created_at) < datetime('now', '-${WAITLIST_MONTHS} months')`,
    `DELETE FROM signup_waitlist WHERE created_at < datetime('now', '-${WAITLIST_MONTHS} months')`
  ]) {
    try { removed += Number((await db.prepare(sql).run())?.meta?.changes) || 0; }
    catch (error) { if (!/no such table/i.test(String(error?.message))) throw error; }
  }
  return removed;
}

// The owner's list: who waits, who was invited, and how full the group is
// (null when the key is missing or Apple doesn't answer).
export async function listWaitlist(db, env, fetcher = fetch) {
  await ensure(db);
  const rows = (await db.prepare("SELECT id,email,status,created_at,invited_at FROM testflight_waitlist ORDER BY created_at DESC, id DESC LIMIT 300").all()).results || [];
  const people = rows.map(r => ({ id: r.id, email: r.email, status: r.status, createdAt: r.created_at, invitedAt: r.invited_at }));
  let testers = null, error = null;
  if (ascConfigured(env)) {
    try { testers = (await groupTesters(env, fetcher)).length; }
    catch (e) { error = e.message; }
  } else error = keyMissing();
  return { pending: people.filter(p => p.status === "pending"), invited: people.filter(p => p.status === "invited"), testers, limit: TESTER_LIMIT, error };
}

// "approve": the address joins the TestFlight group and gets Apple's invitation;
// "delete": it leaves the list.
export async function decideWaitlist(db, env, { id, decision }, fetcher = fetch) {
  if (!["approve", "delete"].includes(decision)) throw fail(L("Neplatné rozhodnutí.", "Invalid decision."));
  await ensure(db);
  const row = await db.prepare("SELECT id,email,status FROM testflight_waitlist WHERE id=?").bind(Number(id) || 0).first();
  if (!row) throw fail(L("Zájemce nebyl nalezen.", "The person wasn't found."), 404);
  if (decision === "delete") {
    await db.prepare("DELETE FROM testflight_waitlist WHERE id=?").bind(row.id).run();
    return { status: "ok" };
  }
  if (row.status !== "pending") throw fail(L("Zájemce už je pozvaný.", "This person has already been invited."), 409);
  if (!ascConfigured(env)) throw fail(keyMissing(), 503);
  await inviteTester(env, row.email, fetcher);
  await db.prepare("UPDATE testflight_waitlist SET status='invited', invited_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
  return { status: "ok" };
}

const keyMissing = () => L("Server nemá klíč k App Store Connect (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 v GitHub prostředí).", "The server has no App Store Connect key.");
export const ascConfigured = env => Boolean(env?.ASC_KEY_ID && env?.ASC_ISSUER_ID && env?.ASC_KEY_P8);

// Adds the address to the group, or puts a tester Apple already knows into it,
// then asks Apple to send the invitation. A full group refuses.
async function inviteTester(env, email, fetcher) {
  const { app, group } = await appAndGroup(env, fetcher);
  const members = await groupTesters(env, fetcher, group);
  if (members.some(t => String(t.attributes?.email || "").toLowerCase() === email)) return;
  if (members.length >= TESTER_LIMIT) throw fail(L(`Testerů je plno (${TESTER_LIMIT}).`, `The tester group is full (${TESTER_LIMIT}).`), 409);
  const known = (await asc(env, fetcher, "GET", `/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=1`)).data?.[0];
  let tester = known?.id;
  if (tester) await asc(env, fetcher, "POST", `/betaGroups/${group}/relationships/betaTesters`, { data: [{ type: "betaTesters", id: tester }] });
  else tester = (await asc(env, fetcher, "POST", "/betaTesters", { data: { type: "betaTesters", attributes: { email },
    relationships: { betaGroups: { data: [{ type: "betaGroups", id: group }] } } } })).data?.id;
  // Apple usually sends the invitation on its own; asking again only fails when one is already on its way.
  if (tester) await asc(env, fetcher, "POST", "/betaTesterInvitations", { data: { type: "betaTesterInvitations",
    relationships: { app: { data: { type: "apps", id: app } }, betaTester: { data: { type: "betaTesters", id: tester } } } } }).catch(() => {});
}

async function groupTesters(env, fetcher, group) {
  const id = group || (await appAndGroup(env, fetcher)).group;
  return (await asc(env, fetcher, "GET", `/betaGroups/${id}/betaTesters?limit=200&fields[betaTesters]=email`)).data || [];
}

// The app by its bundle ID and the external group: EXTERNAL_GROUP, else the only one.
async function appAndGroup(env, fetcher) {
  const app = (await asc(env, fetcher, "GET", `/apps?filter[bundleId]=${BUNDLE_ID}`)).data?.[0]?.id;
  if (!app) throw fail(L("Aplikace v App Store Connect nebyla nalezena.", "The app wasn't found in App Store Connect."), 502);
  const groups = ((await asc(env, fetcher, "GET", `/apps/${app}/betaGroups?limit=200`)).data || []).filter(g => !g.attributes?.isInternalGroup);
  const name = String(env.EXTERNAL_GROUP || "").trim();
  const group = name ? groups.find(g => g.attributes?.name === name) : groups.length === 1 ? groups[0] : null;
  if (!group) throw fail(L("Externí skupina v TestFlightu nebyla nalezena.", "The external TestFlight group wasn't found."), 502);
  return { app, group: group.id };
}

async function asc(env, fetcher, method, path, body) {
  const response = await fetcher(ASC + path, { method, headers: { Authorization: "Bearer " + await ascToken(env), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || `HTTP ${response.status}`;
    throw fail(L("App Store Connect odmítl požadavek: ", "App Store Connect refused the request: ") + String(detail).slice(0, 200), 502);
  }
  return data;
}

// The API's token: an ES256 JWT signed with the .p8 key, valid for 20 minutes.
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const text64 = value => b64url(new TextEncoder().encode(JSON.stringify(value)));
export async function ascToken(env, now = Date.now()) {
  const der = Uint8Array.from(atob(String(env.ASC_KEY_P8).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const seconds = Math.floor(now / 1000);
  const unsigned = text64({ alg: "ES256", kid: env.ASC_KEY_ID, typ: "JWT" }) + "." + text64({ iss: env.ASC_ISSUER_ID, iat: seconds, exp: seconds + 1200, aud: "appstoreconnect-v1" });
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned));
  return unsigned + "." + b64url(signature);
}
