// "Nahlásit problém" in the app's Settings: the user's description, an
// optional screenshot and the app's diagnostics (versions, connections, last
// errors). Stored per user (migrations/0016_support_reports.sql) and e-mailed
// to the operator (CONTACT_EMAIL, else OWNER_EMAIL) when e-mail is set up.
import { L } from "./lang.js";
import { emailConfigured, sendEmail } from "./email-sender.js";

export const MAX_MESSAGE = 4000;
// Base64 of the JPEG; under D1's 2 MB value limit with room for the rest.
export const MAX_SCREENSHOT_BASE64 = 1_400_000;
export const MAX_DIAGNOSTICS = 16_000;
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
  if (Number(row?.n || 0) >= DAILY_REPORTS) throw fail(L("Dnes už jsi poslal několik hlášení. Zkus to zítra, nebo napiš na podporu e-mailem.", "You've already sent several reports today. Try again tomorrow, or email support."), 429);
  if (Number(row?.recent || 0) > 0) throw fail(L("Hlášení už odešlo. Chvíli počkej.", "The report has already been sent. Wait a moment."), 429);
}

function reportEmail(env, { id, message, diagnostics, screenshot }) {
  let pretty = "";
  try { pretty = diagnostics ? JSON.stringify(JSON.parse(diagnostics), null, 2) : ""; } catch { pretty = diagnostics || ""; }
  const who = `${env.USER_EMAIL || "?"} (user ${env.USER_ID ?? env.DB?.userId})`;
  const text = [`Loadwise problem report #${id}`, `From: ${who}`, "", message, "", screenshot ? `Screenshot: stored with the report (${Math.round(screenshot.length * 0.75 / 1024)} kB, support_reports #${id}).` : "Screenshot: none.", "", "Diagnostics:", pretty || "none"].join("\n");
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif"><p><strong>Loadwise problem report #${id}</strong><br>From: ${escape(who)}</p><p style="white-space:pre-wrap">${escape(message)}</p>`
    + (screenshot ? `<p><img alt="Screenshot" style="max-width:360px;border:1px solid #ddd" src="data:image/jpeg;base64,${screenshot}"></p>` : "")
    + `<pre style="font-size:12px;background:#f4f4f5;padding:12px;white-space:pre-wrap">${escape(pretty || "none")}</pre></body></html>`;
  return { subject: `Loadwise: problem report #${id} from ${env.USER_EMAIL || "user " + (env.USER_ID ?? "")}`, text, html };
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
