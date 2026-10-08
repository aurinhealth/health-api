// Signing in with a one-time code sent by e-mail.
// POST /auth/email/start { email } answers the same way for every address, so the
// page never tells who has access; the code is sent in the background, and only to
// active users, invited addresses and the owner. POST /auth/email/verify
// { email, code } signs in. A code is valid for 10 minutes and allows 5 tries; an
// address gets at most one code a minute and 10 a day.
import { signText, sessionSecret, timingSafeEqualString, signedInResponse } from "./dashboard-auth.js";
import { normalizeEmail, mayGetEmailCode, signInEmailUser, changeUserEmail } from "./tenancy.js";
import { emailConfigured, sendEmail, signInCodeEmail, emailChangeCodeEmail, emailChangedEmail } from "./email-sender.js";
import { siteLang } from "./site-pages.js";

const CODE_SECONDS = 10 * 60;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_DAY = 10;
const STALE_SECONDS = 2 * 24 * 60 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRED = "Kód už neplatí. Nech si poslat nový.";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function requestLanguage(request) {
  const asked = String(request.headers.get("X-Interface-Language") || "").slice(0, 2);
  return asked === "cs" || asked === "en" ? asked : siteLang(request);
}

export async function handleEmailLogin(request, env, pathname, ctx) {
  if (pathname !== "/auth/email/start" && pathname !== "/auth/email/verify") return null;
  if (request.method !== "POST") return json({ message: "Použij POST." }, 405);
  if (!emailConfigured(env)) return json({ message: "Přihlášení kódem z e-mailu není zapnuté." }, 404);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ message: "Neplatný původ požadavku." }, 403);
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return json({ message: "Zadej platný e-mail." }, 400);
  if (pathname === "/auth/email/start") {
    // Whether a code goes out (and how long that takes) stays out of the answer.
    const work = sendCode(env, email, requestLanguage(request)).catch(error => console.error("Sign-in code e-mail failed", error?.code || error?.message));
    if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
    return json({ status: "ok" });
  }
  return verifyCode(env, email, body?.code);
}

function randomCode() {
  // Rejection sampling keeps all 1,000,000 codes equally likely.
  const limit = Math.floor(0x100000000 / 1e6) * 1e6, buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return String(buffer[0] % 1e6).padStart(6, "0");
}

// Only a keyed hash of the code is stored; it is tied to the address and to what the code is for
// (signing in, or moving a given account to this address), so one never works as the other.
function codeHash(env, email, code, purpose = "email-code") {
  return signText(purpose + ":" + email + ":" + code, sessionSecret(env));
}

// Returns true when a code went out.
export async function sendCode(env, email, lang = "cs", { now = Date.now(), code = randomCode() } = {}) {
  if (!(await mayGetEmailCode(env.DB, env, email))) return false;
  return claimAndSend(env.DB, env, email, code, "email-code", signInCodeEmail(lang, code), now);
}

async function claimAndSend(db, env, email, code, purpose, message, now) {
  const seconds = Math.floor(now / 1000), day = new Date(now).toISOString().slice(0, 10);
  // Claimed before sending, so two quick requests never send two codes or pass the daily limit.
  const claimed = await db.prepare(`INSERT INTO email_login_codes(email, code_hash, expires_at, attempts, sent_at, day, day_count) VALUES(?, ?, ?, 0, ?, ?, 1)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at,
      day_count = CASE WHEN day = excluded.day THEN day_count + 1 ELSE 1 END, day = excluded.day
    WHERE email_login_codes.sent_at <= ? AND (email_login_codes.day IS NOT excluded.day OR email_login_codes.day_count < ?)`)
    .bind(email, await codeHash(env, email, code, purpose), seconds + CODE_SECONDS, seconds, day, seconds - RESEND_SECONDS, MAX_SENDS_PER_DAY).run();
  if (!(Number(claimed.meta?.changes) > 0)) return false;
  await db.prepare("DELETE FROM email_login_codes WHERE sent_at < ?").bind(seconds - STALE_SECONDS).run().catch(() => {});
  await sendEmail(env, { to: email, ...message });
  return true;
}

async function verifyCode(env, email, input) {
  const refused = await useCode(env.DB, env, email, input, "email-code");
  if (refused) return refused;
  const user = await signInEmailUser(env.DB, env, email);
  if (!user) return json({ message: "Tento e-mail nemá do aplikace přístup." }, 403);
  return signedInResponse(user.id, env, { status: "ok", created: user.created });
}

// Checks and uses up a code; returns the refusal, or null when the code was right.
async function useCode(db, env, email, input, purpose) {
  const code = String(input || "").replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(code)) return json({ message: "Kód má šest číslic." }, 400);
  const now = Math.floor(Date.now() / 1000);
  // Every try is counted before the comparison, so parallel guesses cannot get past the limit.
  const row = await db.prepare("UPDATE email_login_codes SET attempts = attempts + 1 WHERE email = ? AND code_hash IS NOT NULL AND expires_at > ? AND attempts < ? RETURNING code_hash, attempts")
    .bind(email, now, MAX_ATTEMPTS).first();
  if (!row) return json({ message: EXPIRED }, 400);
  if (!timingSafeEqualString(row.code_hash, await codeHash(env, email, code, purpose))) {
    return json({ message: row.attempts >= MAX_ATTEMPTS ? EXPIRED : "Kód nesedí. Zkontroluj ho, nebo si nech poslat nový." }, 400);
  }
  // Used up, so the same code never signs in twice.
  const used = await db.prepare("UPDATE email_login_codes SET code_hash = NULL WHERE email = ? AND code_hash = ? RETURNING email").bind(email, row.code_hash).first();
  if (!used) return json({ message: EXPIRED }, 400);
  return null;
}

const CHANGE_REFUSED = {
  invalid: ["Zadej platný e-mail.", 400],
  same: ["Tohle je tvůj současný e-mail.", 400],
  owner: ["E-mail správce aplikace se mění v nastavení Workeru (OWNER_EMAIL).", 400],
  taken: ["Tenhle e-mail už má jiný účet.", 409],
  missing: ["Účet nebyl nalezen.", 404]
};
export const emailChangeRefusal = error => json({ message: CHANGE_REFUSED[error][0] }, CHANGE_REFUSED[error][1]);

// Settings → Account: moving the account to another address. The code goes to the new address,
// so only someone who reads it can move the account there; the old address is told afterwards.
//   POST /app/api/account/email/start { email }        sends the code
//   POST /app/api/account/email/verify { email, code } changes the address
export async function handleEmailChange(request, env, url, session, ctx) {
  if (url.pathname !== "/app/api/account/email/start" && url.pathname !== "/app/api/account/email/verify") return null;
  if (request.method !== "POST") return json({ message: "Použij POST." }, 405);
  if (!session.signedIn || !session.user) return json({ message: "Přihlas se do dashboardu." }, 401);
  if (!emailConfigured(env)) return json({ message: "Posílání e-mailů není zapnuté." }, 404);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ message: "Neplatný původ požadavku." }, 403);
  const db = env.RAW_DB || env.DB, user = session.user, body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email), purpose = "email-change:" + user.id;
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return emailChangeRefusal("invalid");
  if (url.pathname === "/app/api/account/email/start") {
    if (email === normalizeEmail(user.email)) return emailChangeRefusal("same");
    if (user.isOwner || email === normalizeEmail(env.OWNER_EMAIL)) return emailChangeRefusal("owner");
    if (await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first()) return emailChangeRefusal("taken");
    const code = randomCode(), lang = requestLanguage(request);
    const sent = await claimAndSend(db, env, email, code, purpose, emailChangeCodeEmail(lang, code), Date.now());
    if (!sent) return json({ message: "Kód na tuhle adresu jsme poslali před chvílí. Další můžeš chtít za minutu." }, 429);
    return json({ status: "ok" });
  }
  const refused = await useCode(db, env, email, body?.code, purpose);
  if (refused) return refused;
  const changed = await changeUserEmail(db, env, user.id, email);
  if (changed.error) return emailChangeRefusal(changed.error);
  await notifyOldAddress(env, changed, requestLanguage(request), ctx);
  return json({ status: "ok", email: changed.email });
}

export async function notifyOldAddress(env, { previous, email }, lang, ctx) {
  if (!emailConfigured(env) || !previous) return;
  const notice = sendEmail(env, { to: previous, ...emailChangedEmail(lang, email) }).catch(error => console.error("E-mail change notice failed", error?.code || error?.message));
  if (ctx?.waitUntil) ctx.waitUntil(notice); else await notice;
}
