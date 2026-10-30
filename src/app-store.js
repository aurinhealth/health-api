// Aurin Pro bought in the iPhone app (StoreKit 2, ProStore.swift). The app
// sends each signed transaction (a JWS) to POST /app/api/subscription/transaction
// and Apple sends App Store Server Notifications V2 to /webhooks/app-store
// (renewals, expiry, refunds, revocation). Both are checked here against
// Apple's certificate chain, without a key or a call to Apple: the x5c chain in
// the JWS header must end in Apple Root CA - G3 (pinned by its SHA-256), the
// intermediate and the leaf must carry Apple's marker extensions, each
// certificate must be signed by the next and valid when the JWS was signed, and
// the leaf's key must have signed the JWS. Then the subscriptions row of the
// account is set: plan 'ai' with valid_until = expiresDate, or 'free' when the
// purchase was refunded or revoked.
// The account is found by the appAccountToken the app passes to the purchase
// (a random UUID per account, appAccountToken below) or, for an offer code
// redeemed outside the app (no token), by the account that sent the
// transaction first; later notifications find it by the original transaction id.
// Worker settings (wrangler secret put or vars, see docs/app-store.md):
// APP_STORE_APP_ID: the app's Apple ID from App Store Connect (App Information).
//   Once it is set the store counts as set up (checkoutAvailable) and production
//   notifications must name this app.
// APP_STORE_BUNDLE_ID: optional, health.aurin.app unless set.
import { L } from './lang.js';
import { packProducts, savePackTransaction, refundPackTransaction } from './coach-packs.js';

// SHA-256 of Apple Root CA - G3 (https://www.apple.com/certificateauthority/).
export const APPLE_ROOT_CA_G3 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
const LEAF_MARKER = '1.2.840.113635.100.6.11.1';
const INTERMEDIATE_MARKER = '1.2.840.113635.100.6.2.1';

export const bundleId = env => String(env?.APP_STORE_BUNDLE_ID || 'health.aurin.app');
// The two plans of the subscription group "Aurin Pro" (App Store Connect).
export const proProducts = env => [bundleId(env) + '.pro.monthly', bundleId(env) + '.pro.yearly'];
export const storeConfigured = env => Boolean(String(env?.APP_STORE_APP_ID || '').trim());

const refuse = (message, status = 400) => Object.assign(new Error(message), { status });

// ---- DER, just enough for X.509 ----
function tlv(bytes, at) {
  const tag = bytes[at];
  let length = bytes[at + 1], header = 2;
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n < 1 || n > 4) throw refuse('Bad certificate');
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + bytes[at + 2 + i];
    header += n;
  }
  const start = at + header, end = start + length;
  if (end > bytes.length) throw refuse('Bad certificate');
  return { tag, start, end, raw: bytes.subarray(at, end), body: bytes.subarray(start, end) };
}
function children(node) {
  const out = [];
  for (let at = 0; at < node.body.length;) { const child = tlv(node.body, at); out.push(child); at = child.end; }
  return out;
}
function oid(body) {
  const parts = [Math.floor(body[0] / 40), body[0] % 40];
  let value = 0;
  for (let i = 1; i < body.length; i++) { value = value * 128 + (body[i] & 0x7f); if (!(body[i] & 0x80)) { parts.push(value); value = 0; } }
  return parts.join('.');
}
function derTime(node) {
  const text = new TextDecoder().decode(node.body);
  // UTCTime YYMMDDHHMMSSZ (years 1950–2049) or GeneralizedTime YYYYMMDDHHMMSSZ.
  const full = node.tag === 0x17 ? (Number(text.slice(0, 2)) >= 50 ? '19' : '20') + text : text;
  return Date.UTC(+full.slice(0, 4), +full.slice(4, 6) - 1, +full.slice(6, 8), +full.slice(8, 10), +full.slice(10, 12), +full.slice(12, 14));
}

function parseCertificate(der) {
  const cert = tlv(der, 0);
  const [tbs, algorithm, signature] = children(cert);
  const fields = children(tbs);
  const rest = fields[0].tag === 0xa0 ? fields.slice(1) : fields;
  const [, , issuer, validity, subject, spki, ...more] = rest;
  const [notBefore, notAfter] = children(validity);
  const extensions = [];
  const wrapper = more.find(node => node.tag === 0xa3);
  if (wrapper) for (const ext of children(children(wrapper)[0])) extensions.push(oid(children(ext)[0].body));
  const keyAlgorithm = children(children(spki)[0]);
  return {
    der, tbs: tbs.raw, issuer: issuer.raw, subject: subject.raw, spki: spki.raw,
    curve: keyAlgorithm[1] ? oid(keyAlgorithm[1].body) : null,
    signatureAlgorithm: oid(children(algorithm)[0].body),
    // A BIT STRING: the first byte counts unused bits.
    signature: signature.body.subarray(1),
    notBefore: derTime(notBefore), notAfter: derTime(notAfter), extensions
  };
}

const CURVES = { '1.2.840.10045.3.1.7': ['P-256', 32], '1.3.132.0.34': ['P-384', 48] };
const HASHES = { '1.2.840.10045.4.3.2': 'SHA-256', '1.2.840.10045.4.3.3': 'SHA-384' };

// An ECDSA signature in DER (SEQUENCE of r and s) as WebCrypto's r||s.
function rawSignature(der, size) {
  const [r, s] = children(tlv(der, 0)).map(node => node.body);
  const out = new Uint8Array(size * 2);
  const put = (value, offset) => { const v = value.subarray(Math.max(0, value.length - size)); if (value.length - v.length && value.subarray(0, value.length - v.length).some(b => b)) throw refuse('Bad signature'); out.set(v, offset + size - v.length); };
  put(r, 0); put(s, size);
  return out;
}

async function publicKey(cert) {
  const curve = CURVES[cert.curve];
  if (!curve) throw refuse('Unsupported key');
  return crypto.subtle.importKey('spki', cert.spki, { name: 'ECDSA', namedCurve: curve[0] }, false, ['verify']);
}

async function signedBy(cert, issuer) {
  const hash = HASHES[cert.signatureAlgorithm], curve = CURVES[issuer.curve];
  if (!hash || !curve) throw refuse('Unsupported certificate signature');
  if (!equalBytes(cert.issuer, issuer.subject)) return false;
  return crypto.subtle.verify({ name: 'ECDSA', hash }, await publicKey(issuer), rawSignature(cert.signature, curve[1]), cert.tbs);
}

const equalBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const base64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const base64url = text => base64(String(text).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '='));
const json = bytes => JSON.parse(new TextDecoder().decode(bytes));

// The payload of a JWS signed by Apple's App Store, or an error with status 400.
// roots: SHA-256 fingerprints of the trusted root (Apple's; the tests pass their own).
export async function verifyAppStoreJws(jws, { roots = [APPLE_ROOT_CA_G3] } = {}) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw refuse(L('Neplatný doklad o nákupu.', 'Invalid purchase record.'));
  let header, payload;
  try { header = json(base64url(parts[0])); payload = json(base64url(parts[1])); } catch { throw refuse(L('Neplatný doklad o nákupu.', 'Invalid purchase record.')); }
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw refuse(L('Neplatný doklad o nákupu.', 'Invalid purchase record.'));
  const bad = () => refuse(L('Doklad o nákupu nepodepsal App Store.', 'The purchase record is not signed by the App Store.'));
  let leaf, intermediate, root;
  try { [leaf, intermediate, root] = header.x5c.map(c => parseCertificate(base64(c))); } catch { throw bad(); }
  const fingerprint = hex(await crypto.subtle.digest('SHA-256', root.der));
  if (!roots.map(r => String(r).toLowerCase().replace(/:/g, '')).includes(fingerprint)) throw bad();
  if (!leaf.extensions.includes(LEAF_MARKER) || !intermediate.extensions.includes(INTERMEDIATE_MARKER)) throw bad();
  // Valid when it was signed: an old transaction stays readable after a certificate expires.
  const at = Number(payload.signedDate) || Date.now();
  if ([leaf, intermediate, root].some(c => at < c.notBefore || at > c.notAfter)) throw bad();
  if (!(await signedBy(leaf, intermediate)) || !(await signedBy(intermediate, root)) || !(await signedBy(root, root))) throw bad();
  const signature = base64url(parts[2]);
  if (signature.length !== 64) throw bad();
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await publicKey(leaf), signature, new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw bad();
  return payload;
}

// ---- The subscriptions row ----
// free_trial: the transaction is Apple's introductory offer (the free week),
// which gets the reduced AI limits (ai-limit-share.js).
const COLUMNS = ['app_account_token TEXT', 'original_transaction_id TEXT', 'product_id TEXT', 'store_environment TEXT', 'store_signed_at INTEGER', 'auto_renew INTEGER', 'updated_at TEXT', 'free_trial INTEGER'];
// The columns are added the first time a statement misses them, so a request
// costs no schema statements once they are there.
export async function ensureStoreColumns(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS subscriptions (user_id INTEGER PRIMARY KEY,plan TEXT NOT NULL DEFAULT 'free',valid_until TEXT)").run();
  for (const column of COLUMNS) await db.prepare('ALTER TABLE subscriptions ADD COLUMN ' + column).run().catch(() => { /* already there */ });
  await db.prepare('CREATE INDEX IF NOT EXISTS subscriptions_app_account_token ON subscriptions(app_account_token)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS subscriptions_original_transaction ON subscriptions(original_transaction_id)').run();
}
async function withColumns(db, work) {
  try { return await work(); } catch (error) {
    if (!/no such (column|table)|has no column/i.test(String(error?.message || error))) throw error;
    await ensureStoreColumns(db);
    return work();
  }
}

// The account's random UUID that the app passes to every purchase, made the first time it is asked for.
export async function appAccountToken(env) {
  return withColumns(env.DB, () => accountToken(env));
}
async function accountToken(env) {
  const row = await env.DB.prepare('SELECT app_account_token FROM subscriptions WHERE user_id=?').bind(env.USER_ID).first();
  if (row?.app_account_token) return row.app_account_token;
  const token = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO subscriptions(user_id,plan,app_account_token) VALUES(?,'free',?) ON CONFLICT(user_id) DO UPDATE SET app_account_token=COALESCE(subscriptions.app_account_token,excluded.app_account_token)").bind(env.USER_ID, token).run();
  return (await env.DB.prepare('SELECT app_account_token FROM subscriptions WHERE user_id=?').bind(env.USER_ID).first())?.app_account_token || token;
}

// What the App Store says about the account's purchase, for /app/api/subscription.
export async function storePurchase(env) {
  if (!env?.DB || !(Number(env.USER_ID) > 0)) return null;
  const row = await withColumns(env.DB, () => env.DB.prepare('SELECT plan,valid_until,product_id,store_environment,auto_renew,original_transaction_id FROM subscriptions WHERE user_id=?').bind(env.USER_ID).first());
  if (!row?.original_transaction_id) return null;
  const active = row.plan === 'ai' && Boolean(row.valid_until) && Date.parse(row.valid_until) > Date.now();
  return { active, productId: row.product_id, expiresAt: row.valid_until, environment: row.store_environment, autoRenew: row.auto_renew == null ? null : row.auto_renew === 1 };
}

const ENVIRONMENTS = new Set(['Production', 'Sandbox']);

// A pack of extra coach messages (coach-packs.js), not the subscription.
const isPack = (env, tx) => packProducts(bundleId(env)).includes(tx.productId);

// Checks a decoded transaction belongs to this app and plan.
function checkTransaction(env, tx) {
  if (tx.bundleId !== bundleId(env)) throw refuse(L('Nákup patří jiné aplikaci.', 'The purchase belongs to another app.'));
  if (!proProducts(env).includes(tx.productId) && !isPack(env, tx)) throw refuse(L('Neznámý tarif.', 'Unknown plan.'));
  // Xcode's local StoreKit testing signs with its own key, which never verifies above.
  if (!ENVIRONMENTS.has(tx.environment)) throw refuse(L('Nákup z neznámého prostředí.', 'Purchase from an unknown environment.'));
  if (!tx.originalTransactionId) throw refuse(L('Neplatný doklad o nákupu.', 'Invalid purchase record.'));
}

// plan and valid_until from a transaction (and its renewal info for the grace period).
function planOf(tx, renewal, type) {
  const expires = Number(tx.expiresDate) || 0;
  const grace = Number(renewal?.gracePeriodExpiresDate) || 0;
  if (tx.revocationDate) return { plan: 'free', validUntil: new Date(Number(tx.revocationDate)).toISOString() };
  if (type === 'EXPIRED' || type === 'GRACE_PERIOD_EXPIRED') return { plan: 'free', validUntil: expires ? new Date(expires).toISOString() : null };
  const until = Math.max(expires, grace);
  return until ? { plan: 'ai', validUntil: new Date(until).toISOString() } : { plan: 'free', validUntil: null };
}

// Writes the transaction to the row of userId, unless a newer one is there already.
async function write(db, userId, tx, renewal, type) {
  const { plan, validUntil } = planOf(tx, renewal, type);
  const signedAt = Number(tx.signedDate) || Date.now();
  const autoRenew = renewal && renewal.autoRenewStatus != null ? (Number(renewal.autoRenewStatus) === 1 ? 1 : 0) : null;
  await db.prepare("INSERT INTO subscriptions(user_id,plan,valid_until,original_transaction_id,product_id,store_environment,store_signed_at,auto_renew,updated_at,free_trial) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,valid_until=excluded.valid_until,original_transaction_id=excluded.original_transaction_id,product_id=excluded.product_id,store_environment=excluded.store_environment,store_signed_at=excluded.store_signed_at,auto_renew=COALESCE(excluded.auto_renew,subscriptions.auto_renew),updated_at=excluded.updated_at,free_trial=excluded.free_trial WHERE subscriptions.store_signed_at IS NULL OR subscriptions.store_signed_at<=excluded.store_signed_at OR subscriptions.original_transaction_id IS NOT excluded.original_transaction_id")
    .bind(userId, plan, validUntil, String(tx.originalTransactionId), tx.productId, tx.environment, signedAt, autoRenew, new Date().toISOString(), Number(tx.offerType) === 1 ? 1 : 0).run();
  return { plan, validUntil };
}

// POST /app/api/subscription/transaction {signedTransaction}: a purchase, a
// renewal, a restore or a redeemed code the app saw (Transaction.updates).
export async function saveAppTransaction(env, body, options = {}) {
  const tx = await verifyAppStoreJws(body?.signedTransaction, options);
  checkTransaction(env, tx);
  const mine = await appAccountToken(env);
  if (tx.appAccountToken && String(tx.appAccountToken).toLowerCase() !== mine.toLowerCase()) throw refuse(L('Tento nákup patří jinému účtu Aurin.', 'This purchase belongs to another Aurin account.'), 409);
  if (isPack(env, tx)) return savePackTransaction(env, tx);
  // An offer code redeemed outside the app has no token: the first account to send it keeps it.
  const raw = env.RAW_DB || env.DB;
  const holder = await raw.prepare('SELECT user_id FROM subscriptions WHERE original_transaction_id=?').bind(String(tx.originalTransactionId)).first();
  if (holder && Number(holder.user_id) !== Number(env.USER_ID)) throw refuse(L('Tento nákup patří jinému účtu Aurin.', 'This purchase belongs to another Aurin account.'), 409);
  const saved = await write(env.DB, env.USER_ID, tx, null, null);
  return { status: 'ok', plan: saved.plan, validUntil: saved.validUntil, productId: tx.productId, environment: tx.environment };
}

// POST /webhooks/app-store: App Store Server Notifications V2 ({signedPayload}).
// Apple retries an answer other than 2xx, so a notification for an account we
// do not know (yet) is answered 200 and left: the app sends that purchase itself.
export async function handleAppStoreNotification(request, env, options = {}) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ status: 'error', message: 'Bad request' }, { status: 400 }); }
  try {
    const note = await verifyAppStoreJws(body?.signedPayload, options);
    const data = note.data || {};
    if (note.notificationType === 'TEST') return Response.json({ status: 'ok', test: true });
    if (data.bundleId !== bundleId(env)) return Response.json({ status: 'error', message: 'Wrong app' }, { status: 400 });
    if (data.environment === 'Production' && storeConfigured(env) && String(data.appAppleId) !== String(env.APP_STORE_APP_ID).trim()) return Response.json({ status: 'error', message: 'Wrong app' }, { status: 400 });
    if (!data.signedTransactionInfo) return Response.json({ status: 'ok', ignored: note.notificationType });
    const tx = await verifyAppStoreJws(data.signedTransactionInfo, options);
    const renewal = data.signedRenewalInfo ? await verifyAppStoreJws(data.signedRenewalInfo, options) : null;
    checkTransaction(env, tx);
    // A refunded pack stops counting; nothing else about a pack needs the server.
    if (isPack(env, tx)) return Response.json({ status: 'ok', refunded: tx.revocationDate || note.notificationType === 'REFUND' ? await refundPackTransaction(env.DB, tx) : false });
    const row = await withColumns(env.DB, async () => (tx.appAccountToken ? await env.DB.prepare('SELECT user_id FROM subscriptions WHERE app_account_token=?').bind(String(tx.appAccountToken).toLowerCase()).first() : null)
      || await env.DB.prepare('SELECT user_id FROM subscriptions WHERE original_transaction_id=?').bind(String(tx.originalTransactionId)).first());
    if (!row) return Response.json({ status: 'ok', unknown: true });
    const saved = await write(env.DB, row.user_id, tx, renewal, note.notificationType);
    return Response.json({ status: 'ok', plan: saved.plan });
  } catch (error) {
    if (error.status) return Response.json({ status: 'error', message: error.message }, { status: error.status });
    throw error;
  }
}
