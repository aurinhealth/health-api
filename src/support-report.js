// "Nahlásit problém" in the app's Settings: the user's description, an
// optional screenshot and the app's diagnostics (versions, connections, last
// errors, the week's failed requests), with what the server knows went wrong
// for the user (serverSnapshot). Stored per user (migrations/0016_support_reports.sql)
// and e-mailed to the operator (CONTACT_EMAIL, else OWNER_EMAIL) when e-mail
// is set up, led by the findings worth a look (reportFindings).
import { L } from "./lang.js";
import { emailConfigured, sendEmail } from "./email-sender.js";

export const MAX_MESSAGE = 4000;
// Base64 of the JPEG; under D1's 2 MB value limit with room for the rest.
export const MAX_SCREENSHOT_BASE64 = 1_400_000;
export const MAX_DIAGNOSTICS = 32_000;
export const DAILY_REPORTS = 5;
const MIN_GAP_SECONDS = 20;

async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS support_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    screenshot_base64 TEXT,
    diagnostics_json TEXT,
    emailed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_support_reports_user ON support_reports(user_id, created_at DESC)").run();
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// The checked report, or an error with its HTTP status.
export function validateReport(body) {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 3) throw fail(L("Popiš, co se stalo.", "Describe what happened."));
  if (message.length > MAX_MESSAGE) throw fail(L("Popis je příliš dlouhý.", "The description is too long."));
  let screenshot = null;
  if (body.screenshot != null && body.screenshot !== "") {
    if (typeof body.screenshot !== "string") throw fail(L("Snímek obrazovky není platný obrázek.", "The screenshot isn't a valid image."));
    screenshot = body.screenshot.replace(/^data:image\/jpeg;base64,/i, "").replace(/\s+/g, "");
    if (screenshot.length > MAX_SCREENSHOT_BASE64) throw fail(L("Snímek je příliš velký. Vyber menší obrázek.", "The image is too large. Choose a smaller one."), 413);
    // JPEG only: base64 of the FF D8 FF start marker.
    if (!/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(screenshot)) throw fail(L("Snímek obrazovky není platný obrázek.", "The screenshot isn't a valid image."));
  }
  let diagnostics = null;
  if (body.diagnostics != null) {
    if (typeof body.diagnostics !== "object" || Array.isArray(body.diagnostics)) throw fail(L("Diagnostika není platná.", "The diagnostics aren't valid."));
    diagnostics = JSON.stringify(body.diagnostics);
    if (diagnostics.length > MAX_DIAGNOSTICS) throw fail(L("Diagnostika je příliš velká.", "The diagnostics are too large."), 413);
  }
  return { message, screenshot, diagnostics };
}

// A few reports a day per user, not two in a row.
async function assertAllowed(db) {
  const row = await db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN created_at>=datetime('now',?) THEN 1 ELSE 0 END) AS recent FROM support_reports WHERE user_id=? AND created_at>=datetime('now','-1 day')").bind(`-${MIN_GAP_SECONDS} seconds`, db.userId).first();
  if (Number(row?.n || 0) >= DAILY_REPORTS) throw fail(L("Dnešní limit hlášení je vyčerpaný. Zkus to zítra, nebo napiš na podporu e-mailem.", "You've reached today's report limit. Try again tomorrow, or email support."), 429);
  if (Number(row?.recent || 0) > 0) throw fail(L("Před chvílí odešlo hlášení. Další pošli za pár sekund.", "A report was sent a moment ago. Send another in a few seconds."), 429);
}

const cut = (value, length = 300) => value == null ? null : String(value).slice(0, length);

// What the server knows went wrong for this user: every sync's state with its
// last error and failed steps, and sends to other apps that failed in the last
// two weeks. Times are UTC.
export async function serverSnapshot(db) {
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all().catch(() => null))?.results || [];
  const syncs = (await all("SELECT sync_name, status, finished_at, updated_at, details_json FROM sync_status WHERE user_id=? ORDER BY sync_name", db.userId)).map(row => {
    let details = {};
    try { details = JSON.parse(row.details_json || "{}") || {}; } catch {}
    const problems = (Array.isArray(details.results) ? details.results : []).filter(r => r?.status && !/^(ok|done|completed|skipped)$/.test(r.status)).slice(0, 5)
      .map(r => ({ source: cut(r.source, 40), status: cut(r.status, 40), message: cut(r.message) }));
    const lastError = details.lastError || details.error;
    return { name: row.sync_name, status: row.status, finishedAt: row.finished_at, updatedAt: row.updated_at, ...(lastError ? { lastError: cut(lastError) } : {}), ...(details.lastErrorAt ? { lastErrorAt: details.lastErrorAt } : {}), ...(problems.length ? { problems } : {}) };
  });
  const failedSends = (await all("SELECT destination, activity_key, status, message, attempts, updated_at FROM sync_sends WHERE user_id=? AND status IN ('error','unknown') AND updated_at>=datetime('now','-14 days') ORDER BY updated_at DESC LIMIT 10", db.userId))
    .map(r => ({ destination: r.destination, activity: cut(r.activity_key, 80), status: r.status, message: cut(r.message), attempts: r.attempts, updatedAt: r.updated_at }));
  return { syncs, failedSends };
}

// One line for each thing worth a look, from the app's diagnostics and the
// server's snapshot; empty when nothing stands out.
export function reportFindings(diagnostics, server, now = Date.now()) {
  const d = diagnostics && typeof diagnostics === "object" ? diagnostics : {};
  const out = [];
  const connections = Array.isArray(d.connections) ? d.connections.filter(c => c?.connected) : [];
  for (const c of connections) {
    if (c.needsReconnect) out.push(`${c.id}: needs reconnecting${c.lastError ? ` (${c.lastError})` : ""}`);
    else if (c.lastError) out.push(`${c.id}: last error ${c.lastErrorAt || ""} ${c.lastError}`);
    const hours = Math.floor((now - Date.parse(c.lastSuccessAt)) / 3_600_000);
    if (hours >= 24) out.push(`${c.id}: nothing new for ${hours} h (last ${c.lastSuccessAt})`);
    if (Array.isArray(c.missingPermissions) && c.missingPermissions.length) out.push(`${c.id}: missing permissions ${c.missingPermissions.join(", ")}`);
  }
  const apple = d.appleHealth;
  if (apple?.on === false && connections.some(c => c.id === "apple")) out.push("apple: switched off on the iPhone, while the account still has it connected");
  if (apple?.lastError) out.push(`apple: ${apple.lastError}`);
  for (const [screen, message] of Object.entries(d.lastErrors && typeof d.lastErrors === "object" ? d.lastErrors : {})) out.push(`on screen (${screen}): ${message}`);
  const recent = Array.isArray(d.recentErrors) ? d.recentErrors : [];
  if (recent.length) out.push(`${recent.length} failed request(s) in the app this week, latest ${[recent[0].at, recent[0].path, recent[0].status, recent[0].message].filter(v => v != null && v !== "").join(" ")}`);
  for (const s of server?.syncs || []) {
    if (/^(error|broken|partial)$/.test(s.status) || s.problems?.length) out.push(`server sync ${s.name}: ${s.status}${s.lastError ? ` (${s.lastError})` : ""}${(s.problems || []).map(p => `; ${p.source} ${p.status}${p.message ? ` ${p.message}` : ""}`).join("")}`);
  }
  if (server?.failedSends?.length) out.push(`${server.failedSends.length} send(s) to other apps failed in the last two weeks`);
  if (d.offline === true) out.push("the phone was offline");
  return out.map(line => cut(line, 400));
}

function reportEmail(env, { id, message, diagnostics, screenshot }) {
  let parsed = null;
  try { parsed = diagnostics ? JSON.parse(diagnostics) : null; } catch {}
  const pretty = parsed ? JSON.stringify(parsed, null, 2) : diagnostics || "";
  const findings = reportFindings(parsed, parsed?.server);
  const who = `${env.USER_EMAIL || "?"} (user ${env.USER_ID ?? env.DB?.userId})`;
  const text = [`Aurin problem report #${id}`, `From: ${who}`, "", message, "", findings.length ? ["Worth a look:", ...findings.map(f => `- ${f}`)].join("\n") : "Nothing stands out in the diagnostics.", "", screenshot ? `Screenshot: stored with the report (${Math.round(screenshot.length * 0.75 / 1024)} kB, support_reports #${id}).` : "Screenshot: none.", "", "Diagnostics:", pretty || "none"].join("\n");
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif"><p><strong>Aurin problem report #${id}</strong><br>From: ${escape(who)}</p><p style="white-space:pre-wrap">${escape(message)}</p>`
    + (findings.length ? `<p><strong>Worth a look:</strong></p><ul>${findings.map(f => `<li>${escape(f)}</li>`).join("")}</ul>` : "<p>Nothing stands out in the diagnostics.</p>")
    + (screenshot ? `<p><img alt="Screenshot" style="max-width:360px;border:1px solid #ddd" src="data:image/jpeg;base64,${screenshot}"></p>` : "")
    + `<pre style="font-size:12px;background:#f4f4f5;padding:12px;white-space:pre-wrap">${escape(pretty || "none")}</pre></body></html>`;
  return { subject: `Aurin: problem report #${id} from ${env.USER_EMAIL || "user " + (env.USER_ID ?? "")}`, text, html };
}

export function supportAddress(env) {
  const value = String(env?.CONTACT_EMAIL || env?.OWNER_EMAIL || "").trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : "";
}

// Stores the report and e-mails it when possible; {id, emailed}.
export async function saveSupportReport(env, body) {
  const report = validateReport(body);
  await ensure(env.DB);
  await assertAllowed(env.DB);
  // The server's side goes with the app's, so the stored report is whole.
  const server = await serverSnapshot(env.DB).catch(() => null);
  if (server) report.diagnostics = JSON.stringify({ ...(report.diagnostics ? JSON.parse(report.diagnostics) : {}), server });
  const result = await env.DB.prepare("INSERT INTO support_reports(user_id,message,screenshot_base64,diagnostics_json) VALUES(?,?,?,?)").bind(env.DB.userId, report.message, report.screenshot, report.diagnostics).run();
  const id = Number(result?.meta?.last_row_id) || null;
  let emailed = false;
  const to = supportAddress(env);
  if (to && emailConfigured(env)) {
    try {
      await sendEmail(env, { to, ...reportEmail(env, { id, ...report }) });
      emailed = true;
      await env.DB.prepare("UPDATE support_reports SET emailed=1 WHERE user_id=? AND id=?").bind(env.DB.userId, id).run();
    } catch (error) { console.error("Support report e-mail failed", error?.code || error?.message); }
  }
  return { id, emailed };
}

export async function handleSupportReport(request, env, { signedIn, origin }) {
  if (request.method !== "POST") return Response.json({ message: L("Nepodporovaná metoda.", "Unsupported method.") }, { status: 405 });
  if (!signedIn) return Response.json({ message: L("Přihlas se do dashboardu.", "Sign in to the app.") }, { status: 401 });
  if (request.headers.get("Origin") !== origin) return Response.json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, { status: 403 });
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_SCREENSHOT_BASE64 + MAX_DIAGNOSTICS + MAX_MESSAGE * 4 + 4096) return Response.json({ message: L("Hlášení je příliš velké.", "The report is too large.") }, { status: 413 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return Response.json({ message: L("Neplatné hlášení.", "Invalid report.") }, { status: 400 });
    const saved = await saveSupportReport(env, body);
    return Response.json({ status: "ok", ...saved, message: L("Díky, hlášení odešlo.", "Thanks, the report has been sent.") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.status) return Response.json({ status: "error", message: error.message }, { status: error.status });
    console.error("Support report failed", error.message);
    return Response.json({ status: "error", message: L("Hlášení se nepodařilo uložit.", "The report couldn't be saved.") }, { status: 500 });
  }
}
