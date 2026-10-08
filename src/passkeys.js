// Passkeys: signing in with the device's fingerprint, face or screen lock instead
// of Google, and managing them in Settings → Account.
//   POST /auth/passkey/options, POST /auth/passkey/verify      sign-in (public)
//   GET /app/api/passkeys                                       the user's passkeys
//   POST /app/api/passkeys/options, POST /app/api/passkeys      adding one
//   DELETE /app/api/passkeys?id=…                               removing one
// The passkey's RP ID is the host the app runs on, so passkeys made on the
// staging copy never work on the live app and the other way round.
import { verifyRegistration, verifyAuthentication, clientDataChallenge, randomChallenge, SUPPORTED_ALGORITHMS, WebAuthnError } from "./webauthn.js";
import { signedInResponse } from "./dashboard-auth.js";
import { findUser } from "./tenancy.js";
import { emailConfigured, sendEmail, passkeyAddedEmail } from "./email-sender.js";
import { requestLanguage } from "./email-login.js";

const CHALLENGE_SECONDS = 5 * 60;
const MAX_OPEN_SIGN_INS = 500;
const MAX_PASSKEYS = 20;
const NOT_VERIFIED = "Přístupový klíč se nepodařilo ověřit. Zkus to znovu.";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const sameOrigin = request => request.headers.get("Origin") === new URL(request.url).origin;

function relyingParty(request) {
  const url = new URL(request.url);
  return { origin: url.origin, rpId: url.hostname };
}

// Passkey providers by AAGUID (github.com/passkeydeveloper/passkey-authenticator-aaguids),
// so Settings can say where each passkey lives.
const PROVIDERS = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "Apple Passwords",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "d3452668-01fd-4c12-926c-83a4204853aa": "Microsoft Password Manager",
  "771b48fd-d3d4-4f74-9232-fc157ab0507a": "Edge on Mac",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6": "Keeper",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
  "f3809540-7f14-49c1-a8b3-8f813b225541": "Enpass",
  "fdb141b2-5d84-443e-8a35-4698c205a502": "KeePassXC"
};

function devicePlatform(userAgent) {
  const ua = String(userAgent || "");
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}

export function passkeyName(aaguid, userAgent) {
  const provider = PROVIDERS[aaguid] || "", platform = devicePlatform(userAgent);
  if (!provider) return platform || "Passkey";
  if (!platform || provider === "Windows Hello" || provider.includes(platform)) return provider;
  return `${provider} (${platform})`;
}

export async function listPasskeys(db, userId) {
  const rows = await db.prepare("SELECT id, name, backed_up, created_at, last_used_at FROM user_passkeys WHERE user_id=? ORDER BY created_at, id").bind(Number(userId)).all().catch(() => ({ results: [] }));
  return (rows.results || []).map(row => ({ id: row.id, name: row.name, synced: Boolean(row.backed_up), createdAt: row.created_at, lastUsedAt: row.last_used_at || null }));
}

const parseTransports = text => { try { const list = JSON.parse(text || "[]"); return Array.isArray(list) ? list : []; } catch { return []; } };

// Challenges are single-use and stored, so a signed answer can never be replayed.
async function issueChallenge(db, purpose, { userId = null, userHandle = null } = {}) {
  const challenge = randomChallenge(), now = Math.floor(Date.now() / 1000);
  const statements = [db.prepare("DELETE FROM auth_challenges WHERE expires_at <= ?").bind(now)];
  // Each user has at most one pending passkey to add; anonymous sign-ins are capped as a whole.
  if (userId !== null) statements.push(db.prepare("DELETE FROM auth_challenges WHERE purpose = ? AND user_id = ?").bind(purpose, userId));
  statements.push(db.prepare("INSERT INTO auth_challenges(challenge, purpose, user_id, user_handle, expires_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM auth_challenges WHERE purpose = ?) < ?")
    .bind(challenge, purpose, userId, userHandle, now + CHALLENGE_SECONDS, purpose, MAX_OPEN_SIGN_INS));
  const results = await db.batch(statements);
  return Number(results.at(-1)?.meta?.changes) > 0 ? challenge : null;
}

async function takeChallenge(db, challenge, purpose) {
  if (!challenge) return null;
  return db.prepare("DELETE FROM auth_challenges WHERE challenge = ? AND purpose = ? AND expires_at > ? RETURNING challenge, user_id, user_handle")
    .bind(challenge, purpose, Math.floor(Date.now() / 1000)).first();
}

export async function handlePasskeyLogin(request, env, pathname) {
  if (pathname !== "/auth/passkey/options" && pathname !== "/auth/passkey/verify") return null;
  if (request.method !== "POST") return json({ message: "Použij POST." }, 405);
  if (!sameOrigin(request)) return json({ message: "Neplatný původ požadavku." }, 403);
  const db = env.DB, { origin, rpId } = relyingParty(request);
  if (pathname === "/auth/passkey/options") {
    const challenge = await issueChallenge(db, "login");
    if (!challenge) return json({ message: "Právě se přihlašuje moc lidí najednou. Zkus to za pár minut." }, 429);
    return json({ challenge, rpId, timeout: CHALLENGE_SECONDS * 1000, userVerification: "required", allowCredentials: [] });
  }
  const credential = (await request.json().catch(() => ({})))?.credential;
  const issued = await takeChallenge(db, clientDataChallenge(credential), "login");
  if (!issued) return json({ message: "Přihlášení vypršelo. Zkus to znovu." }, 400);
  const stored = typeof credential?.id === "string" && credential.id.length <= 1400
    ? await db.prepare("SELECT id, user_id, user_handle, public_key, alg, sign_count FROM user_passkeys WHERE id = ?").bind(credential.id).first()
    : null;
  // unknownCredential lets the browser drop a passkey that no longer exists here.
  if (!stored) return json({ message: "Tenhle přístupový klíč Loadwise nezná. Přihlas se jinak a přidej si nový v Nastavení → Účet.", unknownCredential: true, rpId }, 401);
  // The passkey names the account it belongs to; it has to be the account it is stored with.
  if (credential.response?.userHandle !== stored.user_handle) return json({ message: NOT_VERIFIED }, 401);
  let result;
  try { result = await verifyAuthentication(credential, { challenge: issued.challenge, origin, rpId, stored: { publicKey: JSON.parse(stored.public_key), alg: stored.alg, signCount: stored.sign_count } }); }
  catch (error) {
    if (!(error instanceof WebAuthnError)) throw error;
    console.warn("Passkey sign-in refused", error.message);
    return json({ message: NOT_VERIFIED }, 401);
  }
  const user = await findUser(db, stored.user_id, env);
  if (!user) return json({ message: "Tento účet nemá do aplikace přístup." }, 403);
  await db.batch([
    db.prepare("UPDATE user_passkeys SET sign_count = MAX(sign_count, ?), backed_up = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(result.signCount, result.backedUp ? 1 : 0, stored.id, stored.user_id),
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id)
  ]);
  // The address lets this device remember which e-mail the passkey belongs to.
  return signedInResponse(user.id, env, { status: "ok", email: user.email });
}

// Settings → Account. Needs the browser session (an API key cannot add passkeys).
export async function handlePasskeyApi(request, env, url, session, ctx) {
  if (url.pathname !== "/app/api/passkeys" && url.pathname !== "/app/api/passkeys/options") return null;
  if (!session.signedIn || !session.user) return json({ message: "Přihlas se do dashboardu." }, 401);
  const db = env.RAW_DB, user = session.user, { origin, rpId } = relyingParty(request);
  const handleOf = async () => (await db.prepare("SELECT user_handle FROM user_passkeys WHERE user_id = ? LIMIT 1").bind(user.id).first())?.user_handle || null;
  if (request.method === "GET" && url.pathname === "/app/api/passkeys") return json({ status: "ok", rpId, userHandle: await handleOf(), passkeys: await listPasskeys(db, user.id) });
  if (!sameOrigin(request)) return json({ message: "Neplatný původ požadavku." }, 403);
  if (request.method === "POST" && url.pathname === "/app/api/passkeys/options") {
    const existing = (await db.prepare("SELECT id, user_handle, transports FROM user_passkeys WHERE user_id = ?").bind(user.id).all()).results || [];
    if (existing.length >= MAX_PASSKEYS) return json({ message: `Účet už má ${MAX_PASSKEYS} přístupových klíčů. Nejdřív nějaký odeber.` }, 400);
    // One random id per user, never the e-mail or the account number.
    const userHandle = existing[0]?.user_handle || randomChallenge(32);
    const challenge = await issueChallenge(db, "register", { userId: user.id, userHandle });
    if (!challenge) return json({ message: "Zkus to za pár minut." }, 429);
    return json({
      challenge,
      rp: { id: rpId, name: "Loadwise" },
      user: { id: userHandle, name: user.email, displayName: user.name || user.email },
      pubKeyCredParams: SUPPORTED_ALGORITHMS.map(alg => ({ type: "public-key", alg })),
      timeout: CHALLENGE_SECONDS * 1000,
      attestation: "none",
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: existing.map(row => ({ type: "public-key", id: row.id, transports: parseTransports(row.transports) }))
    });
  }
  if (request.method === "POST" && url.pathname === "/app/api/passkeys") {
    const credential = (await request.json().catch(() => ({})))?.credential;
    const issued = await takeChallenge(db, clientDataChallenge(credential), "register");
    if (!issued || Number(issued.user_id) !== user.id) return json({ message: "Přidání vypršelo. Zkus to znovu." }, 400);
    let result;
    try { result = await verifyRegistration(credential, { challenge: issued.challenge, origin, rpId }); }
    catch (error) {
      if (!(error instanceof WebAuthnError)) throw error;
      console.warn("Passkey registration refused", error.message);
      return json({ message: NOT_VERIFIED }, 400);
    }
    const name = passkeyName(result.aaguid, request.headers.get("User-Agent"));
    const inserted = await db.prepare(`INSERT INTO user_passkeys(id, user_id, user_handle, public_key, alg, sign_count, transports, name, backed_up)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM user_passkeys WHERE user_id = ?) < ? ON CONFLICT(id) DO NOTHING`)
      .bind(result.credentialId, user.id, issued.user_handle, JSON.stringify(result.publicKey), result.alg, result.signCount, JSON.stringify(result.transports), name, result.backedUp ? 1 : 0, user.id, MAX_PASSKEYS).run();
    if (!(Number(inserted.meta?.changes) > 0)) return json({ message: "Tenhle přístupový klíč už v Loadwise je." }, 409);
    // Someone who got into the account cannot add a way back in unnoticed.
    if (emailConfigured(env)) {
      const notice = sendEmail(env, { to: user.email, ...passkeyAddedEmail(requestLanguage(request), name) }).catch(error => console.error("Passkey notice e-mail failed", error?.code || error?.message));
      if (ctx?.waitUntil) ctx.waitUntil(notice); else await notice;
    }
    return json({ status: "ok", name, rpId, userHandle: issued.user_handle, passkeys: await listPasskeys(db, user.id) });
  }
  if (request.method === "DELETE" && url.pathname === "/app/api/passkeys") {
    // The handle goes back with the list, so the browser can forget the removed passkey too.
    const userHandle = await handleOf();
    await db.prepare("DELETE FROM user_passkeys WHERE id = ? AND user_id = ?").bind(String(url.searchParams.get("id") || ""), user.id).run();
    return json({ status: "ok", rpId, userHandle, passkeys: await listPasskeys(db, user.id) });
  }
  return json({ message: "Nepodporovaná metoda." }, 405);
}
