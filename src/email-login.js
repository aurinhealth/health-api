// Signing in with a one-time code sent by e-mail.
// POST /auth/email/start { email } answers the same way for every address, so the
// page never tells who has access; the code is sent in the background, and only to
// active users, invited addresses and the owner. POST /auth/email/verify
// { email, code } signs in. A code is valid for 10 minutes and allows 5 tries, and after
// 20 wrong codes in a day (UTC) an address is locked until midnight. An address gets at most
// one code a minute and 10 a day. One caller (an IPv4 address or an IPv6 /64, ip-rate-limit.js)
// starts at most 5 sign-ins a minute, 30 an hour and 50 a day, and checks at most 10 codes a
// minute, 30 an hour and 100 a day. All codes together stay under EMAIL_CODES_PER_DAY (500) a
// day, of which addresses that get a code only through OPEN_SIGNUP use at most four fifths,
// so made-up addresses cannot use up the codes of people with an account or an invitation.
import { signText, sessionSecret, timingSafeEqualString, signedInResponse, userSessionCookie } from "./dashboard-auth.js";
import { allowClient, allowRequest } from "./ip-rate-limit.js";
import { normalizeEmail, emailCodeAccess, signInEmailUser, changeUserEmail } from "./tenancy.js";
import { emailConfigured, sendEmail, signInCodeEmail, emailChangeCodeEmail, emailChangedEmail } from "./email-sender.js";
import { siteLang } from "./site-pages.js";
import { reviewCodeActive } from "./app-review.js";
import { L } from "./lang.js";

const CODE_SECONDS = 10 * 60;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_DAY = 10;
const MAX_FAILED_PER_DAY = 20;
const MAX_REVIEW_FAILURES = 20;
const DEFAULT_CODES_PER_DAY = 500;
const RESERVED_SHARE = 0.2;
// Per caller: asking for a code, and checking one.
export const START_LIMITS = { minute: 5, hour: 30, day: 50 };
export const VERIFY_LIMITS = { minute: 10, hour: 30, day: 100 };
const STALE_SECONDS = 2 * 24 * 60 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPIRED = () => L("Kód už neplatí. Nech si poslat nový.", "That code has expired. Send a new one.");
const TOO_MANY = () => L("Příliš mnoho pokusů o přihlášení. Zkus to za chvíli.", "Too many sign-in attempts. Try again in a moment.");
const LOCKED_TODAY = () => L("Na tenhle e-mail bylo zadáno příliš mnoho špatných kódů. Zkus to zítra.", "Too many wrong codes were entered for this email. Try again tomorrow.");
const REVIEW_LOCKED = () => L("Na tenhle e-mail bylo zadáno příliš mnoho špatných kódů.", "Too many wrong codes were entered for this email.");
const today = now => new Date(now).toISOString().slice(0, 10);

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function requestLanguage(request) {
  const asked = String(request.headers.get("X-Interface-Language") || "").slice(0, 2);
  return asked === "cs" || asked === "en" ? asked : siteLang(request);
}

export async function handleEmailLogin(request, env, pathname, ctx) {
  if (pathname !== "/auth/email/start" && pathname !== "/auth/email/verify") return null;
  if (request.method !== "POST") return json({ message: L("Použij POST.", "Use POST.") }, 405);
  if (!emailConfigured(env)) return json({ message: L("Přihlášení kódem z e-mailu není zapnuté.", "Signing in with an email code isn't turned on.") }, 404);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, 403);
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return json({ message: L("Zadej platný e-mail.", "Enter a valid email.") }, 400);
  if (pathname === "/auth/email/start") {
    if (!(await allowClient(env.DB, request, sessionSecret(env), "email", Date.now(), START_LIMITS))) return json({ message: TOO_MANY() }, 429);
    // Whether a code goes out (and how long that takes) stays out of the answer.
    const work = sendCode(env, email, requestLanguage(request)).catch(error => console.error("Sign-in code e-mail failed", error?.code || error?.message));
    if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
    return json({ status: "ok" });
  }
  if (!(await allowClient(env.DB, request, sessionSecret(env), "email-verify", Date.now(), VERIFY_LIMITS))) return json({ message: TOO_MANY() }, 429);
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

// App Review: APP_REVIEW_EMAIL gets the fixed code APP_REVIEW_CODE (six digits, a secret) instead
// of a random one, so Apple's reviewer can sign in without the inbox, but only until the end of
// the APP_REVIEW_UNTIL day (UTC); without that date it gets a random code like anyone (app-review.js).
// The usual limits still apply: the code works only after "send code", for 10 minutes and 5 tries,
// and as the code stays the same, wrong tries also add up over its whole life (MAX_REVIEW_FAILURES).
// Never for the owner (here) or an admin (fixedReviewCode): their sign-in stays on random codes.
export function reviewCode(env, email, now = Date.now()) {
  const address = normalizeEmail(env?.APP_REVIEW_EMAIL), code = String(env?.APP_REVIEW_CODE || "").trim();
  if (!address || address !== email || address === normalizeEmail(env?.OWNER_EMAIL)) return null;
  return /^\d{6}$/.test(code) && reviewCodeActive(env, now) ? code : null;
}

async function fixedReviewCode(db, env, email, now) {
  const code = reviewCode(env, email, now);
  if (!code) return null;
  const user = await db.prepare("SELECT role FROM users WHERE email=?").bind(email).first();
  return user?.role === "admin" ? null : code;
}

// Returns true when a code went out.
export async function sendCode(env, email, lang = "cs", { now = Date.now(), code } = {}) {
  const access = await emailCodeAccess(env.DB, env, email);
  if (!access) return false;
  const sent = code || await fixedReviewCode(env.DB, env, email, now) || randomCode();
  return claimAndSend(env.DB, env, email, sent, "email-code", signInCodeEmail(lang, sent), now, { open: access === "open" });
}

// `open`: the address gets a code only because anyone may sign up, so it draws on the open share.
async function claimAndSend(db, env, email, code, purpose, message, now, { open = false } = {}) {
  const seconds = Math.floor(now / 1000), day = today(now);
  // The address's own limits are checked first, so a code it would not get spends no budget.
  const current = await db.prepare("SELECT sent_at, day, day_count, fail_day, fail_count FROM email_login_codes WHERE email=?").bind(email).first();
  if (current && (current.sent_at > seconds - RESEND_SECONDS || (current.day === day && current.day_count >= MAX_SENDS_PER_DAY) || (current.fail_day === day && current.fail_count >= MAX_FAILED_PER_DAY))) return false;
  // All codes together: the budget of a day, so an open sign-up cannot turn the sender into a spam
  // source. The open share is claimed first: a refusal there never takes from the shared budget.
  if (open && !(await allowRequest(db, "email-codes:open:day", { day: openCodesPerDay(env) }, now))) { console.warn("Sign-in code e-mail budget of the day for new addresses is used up"); return false; }
  if (!(await allowRequest(db, "email-codes:day", { day: codesPerDay(env) }, now))) { console.warn("Sign-in code e-mail budget of the day is used up"); return false; }
  // Claimed before sending, so two quick requests never send two codes or pass the daily limit; the
  // code it replaces is read in the same transaction, to put it back if the e-mail does not go out.
  const hash = await codeHash(env, email, code, purpose);
  const [before, claimed] = await db.batch([
    db.prepare("SELECT code_hash, expires_at, attempts FROM email_login_codes WHERE email=?").bind(email),
    db.prepare(`INSERT INTO email_login_codes(email, code_hash, expires_at, attempts, sent_at, day, day_count) VALUES(?, ?, ?, 0, ?, ?, 1)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at,
      day_count = CASE WHEN day = excluded.day THEN day_count + 1 ELSE 1 END, day = excluded.day
    WHERE email_login_codes.sent_at <= ? AND (email_login_codes.day IS NOT excluded.day OR email_login_codes.day_count < ?)`)
      .bind(email, hash, seconds + CODE_SECONDS, seconds, day, seconds - RESEND_SECONDS, MAX_SENDS_PER_DAY)
  ]);
  if (!(Number(claimed.meta?.changes) > 0)) return false;
  await db.prepare("DELETE FROM email_login_codes WHERE sent_at < ?").bind(seconds - STALE_SECONDS).run().catch(() => {});
  try {
    await sendEmail(env, { to: email, ...message });
  } catch (error) {
    // Nobody got the new code: the one before it works again, and tries on either still count.
    const previous = before.results?.[0];
    await db.prepare("UPDATE email_login_codes SET code_hash = ?, expires_at = ?, attempts = attempts + ? WHERE email = ? AND code_hash = ?")
      .bind(previous?.code_hash ?? null, Number(previous?.expires_at) || 0, Number(previous?.attempts) || 0, email, hash).run().catch(() => {});
    throw error;
  }
  return true;
}

export const codesPerDay = env => { const n = Number(env?.EMAIL_CODES_PER_DAY); return Number.isInteger(n) && n > 0 ? n : DEFAULT_CODES_PER_DAY; };
// What addresses that get a code only through OPEN_SIGNUP may use of it; the rest is kept for the others.
export const openCodesPerDay = env => { const all = codesPerDay(env); return all - Math.ceil(all * RESERVED_SHARE); };

async function verifyCode(env, email, input) {
  const refused = await useCode(env.DB, env, email, input, "email-code");
  if (refused) return refused;
  const user = await signInEmailUser(env.DB, env, email);
  if (!user) return json({ message: L("Tento e-mail nemá do Aurinu přístup.", "This email doesn't have access to Aurin.") }, 403);
  return signedInResponse(user.id, env, { status: "ok", created: user.created });
}

// Checks and uses up a code; returns the refusal, or null when the code was right.
async function useCode(db, env, email, input, purpose) {
  const code = String(input || "").replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(code)) return json({ message: L("Kód má šest číslic.", "The code has six digits.") }, 400);
  const time = Date.now(), now = Math.floor(time / 1000), day = today(time);
  // Every try is counted before the comparison, for the code and for the address's day, so
  // parallel guesses cannot get past either limit; a right code takes its try back below.
  const row = await db.prepare(`UPDATE email_login_codes SET attempts = attempts + 1,
      fail_count = CASE WHEN fail_day IS ? THEN fail_count + 1 ELSE 1 END, fail_day = ?
    WHERE email = ? AND code_hash IS NOT NULL AND expires_at > ? AND attempts < ? AND (fail_day IS NOT ? OR fail_count < ?)
    RETURNING code_hash, attempts`).bind(day, day, email, now, MAX_ATTEMPTS, day, MAX_FAILED_PER_DAY).first();
  if (!row) {
    const locked = await db.prepare("SELECT email FROM email_login_codes WHERE email = ? AND fail_day = ? AND fail_count >= ?").bind(email, day, MAX_FAILED_PER_DAY).first();
    return locked ? json({ message: LOCKED_TODAY() }, 429) : json({ message: EXPIRED() }, 400);
  }
  // The fixed App Review code: tries add up over its whole life, whichever code was sent last.
  const review = purpose === "email-code" ? await reviewTriesKey(db, env, email, time) : null;
  if (review && !(await claimReviewTry(db, review, now))) return json({ message: REVIEW_LOCKED() }, 429);
  if (!timingSafeEqualString(row.code_hash, await codeHash(env, email, code, purpose))) {
    return json({ message: row.attempts >= MAX_ATTEMPTS ? EXPIRED() : L("Kód nesedí. Zkontroluj ho, nebo si nech poslat nový.", "That code is wrong. Check it or send a new one.") }, 400);
  }
  // Used up, so the same code never signs in twice.
  const used = await db.prepare("UPDATE email_login_codes SET code_hash = NULL, fail_count = MAX(fail_count - 1, 0) WHERE email = ? AND code_hash = ? RETURNING email").bind(email, row.code_hash).first();
  if (!used) return json({ message: EXPIRED() }, 400);
  if (review) await db.prepare("UPDATE review_code_failures SET failed = MAX(failed - 1, 0) WHERE key = ?").bind(review).run();
  return null;
}

// While the fixed review code applies to this address: the key its wrong tries are counted under,
// a keyed hash of the address and the code, so a new APP_REVIEW_CODE starts from nothing.
async function reviewTriesKey(db, env, email, now) {
  const code = await fixedReviewCode(db, env, email, now);
  return code ? "review:" + (await signText("review-code:" + email + ":" + code, sessionSecret(env))).slice(0, 32) : null;
}

async function claimReviewTry(db, key, now) {
  const claimed = await db.prepare(`INSERT INTO review_code_failures(key, failed, updated_at) VALUES(?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET failed = failed + 1, updated_at = excluded.updated_at WHERE review_code_failures.failed < ?`)
    .bind(key, now, MAX_REVIEW_FAILURES).run();
  return Number(claimed.meta?.changes) > 0;
}

const CHANGE_REFUSED = {
  invalid: [() => L("Zadej platný e-mail.", "Enter a valid email."), 400],
  same: [() => L("Tohle je tvůj současný e-mail.", "That's your current email."), 400],
  owner: [() => L("E-mail správce aplikace se mění v nastavení Workeru (OWNER_EMAIL).", "The app owner's email is changed in the Worker settings (OWNER_EMAIL)."), 400],
  taken: [() => L("Tenhle e-mail už má jiný účet.", "Another account already uses this email."), 409],
  missing: [() => L("Účet nebyl nalezen.", "Account not found."), 404]
};
export const emailChangeRefusal = error => json({ message: CHANGE_REFUSED[error][0]() }, CHANGE_REFUSED[error][1]);

// Settings → Account: moving the account to another address. The code goes to the new address,
// so only someone who reads it can move the account there; the old address is told afterwards.
//   POST /app/api/account/email/start { email }        sends the code
//   POST /app/api/account/email/verify { email, code } changes the address
export async function handleEmailChange(request, env, url, session, ctx) {
  if (url.pathname !== "/app/api/account/email/start" && url.pathname !== "/app/api/account/email/verify") return null;
  if (request.method !== "POST") return json({ message: L("Použij POST.", "Use POST.") }, 405);
  if (!session.signedIn || !session.user) return json({ message: L("Přihlášení vypršelo. Přihlas se znovu.", "Your session has expired. Sign in again.") }, 401);
  if (!emailConfigured(env)) return json({ message: L("Posílání e-mailů není zapnuté.", "Sending emails isn't turned on.") }, 404);
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, 403);
  const db = env.RAW_DB || env.DB, user = session.user, body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email), purpose = "email-change:" + user.id;
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return emailChangeRefusal("invalid");
  if (url.pathname === "/app/api/account/email/start") {
    if (email === normalizeEmail(user.email)) return emailChangeRefusal("same");
    if (user.isOwner || email === normalizeEmail(env.OWNER_EMAIL)) return emailChangeRefusal("owner");
    if (await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first()) return emailChangeRefusal("taken");
    const code = randomCode(), lang = requestLanguage(request);
    const sent = await claimAndSend(db, env, email, code, purpose, emailChangeCodeEmail(lang, code), Date.now());
    if (!sent) return json({ message: L("Kód na tuhle adresu jsme poslali před chvílí. Další můžeš chtít za minutu.", "We sent a code to this address a moment ago. You can ask for another in a minute.") }, 429);
    return json({ status: "ok" });
  }
  const refused = await useCode(db, env, email, body?.code, purpose);
  if (refused) return refused;
  const changed = await changeUserEmail(db, env, user.id, email);
  if (changed.error) return emailChangeRefusal(changed.error);
  await notifyOldAddress(env, changed, requestLanguage(request), ctx);
  // The change signs every other device out (session_epoch); this one gets a fresh cookie.
  const response = json({ status: "ok", email: changed.email });
  response.headers.append("Set-Cookie", await userSessionCookie(db, user.id, sessionSecret(env)));
  return response;
}

export async function notifyOldAddress(env, { previous, email }, lang, ctx) {
  if (!emailConfigured(env) || !previous) return;
  const notice = sendEmail(env, { to: previous, ...emailChangedEmail(lang, email) }).catch(error => console.error("E-mail change notice failed", error?.code || error?.message));
  if (ctx?.waitUntil) ctx.waitUntil(notice); else await notice;
}
