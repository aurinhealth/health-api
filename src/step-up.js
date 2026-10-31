// Confirming it's you before the changes someone with a stolen session could use to take the
// account over or carry its data off: changing the e-mail, adding a passkey, downloading the data,
// pausing health data and deleting the account. The session alone is not enough for them; the user also shows, within
// the last STEP_UP_SECONDS, a passkey of the account or a code sent to its e-mail (or has just
// signed in). The proof is the signed STEP_UP_COOKIE (dashboard-auth.js), so nothing is stored.
//   POST /app/api/account/step-up/start             sends the code to the account's e-mail
//   POST /app/api/account/step-up/verify { code }   the code
//   POST /app/api/account/step-up/passkey/options   a passkey challenge for the account
//   POST /app/api/account/step-up/passkey { credential }
// A guarded route without the proof answers 403 step_up_required with the ways the account has.
import { hasStepUp, stepUpCookie, sessionSecret } from "./dashboard-auth.js";
import { sendStepUpCode, useStepUpCode } from "./email-login.js";
import { stepUpPasskeyOptions, verifyStepUpPasskey } from "./passkeys.js";
import { emailConfigured } from "./email-sender.js";
import { L } from "./lang.js";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// "pe•••@gmail.com": enough to recognise the address, not enough to learn it.
export function maskedEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "";
  return local.slice(0, Math.min(2, Math.max(1, local.length - 1))) + "•••@" + domain;
}

async function hasPasskey(db, userId) {
  return Boolean(await db.prepare("SELECT 1 FROM user_passkeys WHERE user_id = ? LIMIT 1").bind(userId).first().catch(() => null));
}

// The refusal when the request needs the check and has no proof, else null.
export async function requireStepUp(request, env, session) {
  const user = session?.user;
  if (!session?.signedIn || !user) return null;
  if (await hasStepUp(request, sessionSecret(env), user.id, user.sessionEpoch)) return null;
  const passkey = await hasPasskey(env.RAW_DB || env.DB, user.id), email = emailConfigured(env) && Boolean(user.email);
  // With no way to confirm (no passkey, e-mails off) the account could never be deleted: let it through.
  if (!passkey && !email) { console.warn("Step-up skipped: the account has no passkey and e-mails are off"); return null; }
  return json({
    status: "step_up_required",
    message: L("Nejdřív potvrď, že jsi to ty.", "Confirm it's you first."),
    stepUp: { passkey, email: email ? maskedEmail(user.email) : null }
  }, 403);
}

function verified(env, user) {
  return stepUpCookie(user.id, user.sessionEpoch, sessionSecret(env)).then(cookie => {
    const response = json({ status: "ok" });
    response.headers.append("Set-Cookie", cookie);
    return response;
  });
}

export async function handleStepUpApi(request, env, url, session) {
  if (!url.pathname.startsWith("/app/api/account/step-up/")) return null;
  if (request.method !== "POST") return json({ message: L("Použij POST.", "Use POST.") }, 405);
  if (!session?.signedIn || !session.user) return json({ message: L("Přihlášení vypršelo. Přihlas se znovu.", "Your session has expired. Sign in again.") }, 401);
  if (request.headers.get("Origin") !== url.origin) return json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, 403);
  const user = session.user;
  if (url.pathname === "/app/api/account/step-up/start") {
    if (!emailConfigured(env) || !user.email) return json({ message: L("Posílání e-mailů není zapnuté.", "Sending emails isn't turned on.") }, 404);
    const result = await sendStepUpCode(request, env, user);
    if (result.refused) return result.refused;
    // A code sent less than a minute ago (the sheet was closed and opened again) is still the one to type in.
    return json({ status: "ok", email: maskedEmail(user.email), ...(result.pending ? { pending: true } : {}) });
  }
  if (url.pathname === "/app/api/account/step-up/verify") {
    const body = await request.json().catch(() => ({}));
    const refused = await useStepUpCode(request, env, user, body?.code);
    return refused || verified(env, user);
  }
  if (url.pathname === "/app/api/account/step-up/passkey/options") return stepUpPasskeyOptions(request, env, user);
  if (url.pathname === "/app/api/account/step-up/passkey") {
    const credential = (await request.json().catch(() => ({})))?.credential;
    if (!(await verifyStepUpPasskey(request, env, user, credential))) return json({ message: L("Přístupový klíč se nepodařilo ověřit. Zkus to znovu.", "Couldn't verify the passkey. Try again.") }, 400);
    return verified(env, user);
  }
  return json({ message: L("Nenalezeno.", "Not found.") }, 404);
}
