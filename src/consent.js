// Consents under GDPR: health data (Art. 9) needs the user's explicit consent,
// and it covers sending data to OpenAI for the AI features (stored as a second
// kind, 'ai', given together with it). Each is stored with the version of the text the user agreed to and when
// (user_consents, migration 0013), so the consent can be shown later. A new
// version of the health text asks everyone again.
import { L } from './lang.js';

export const CONSENT_VERSION = '2026-10-08';
export const CONSENT_KINDS = ['health', 'ai'];

async function consentRows(db, userId) {
  try {
    return (await db.prepare('SELECT kind, version, granted_at, withdrawn_at FROM user_consents WHERE user_id = ?').bind(userId).all()).results || [];
  } catch (error) {
    if (/no such table/i.test(String(error?.message))) return [];
    throw error;
  }
}

// health/ai: {version, grantedAt} while given, otherwise null. `needed`: the app
// asks before showing anything (in the setup guide, or once for an account set
// up earlier). The owner runs the app and decides how data is used, so he is not
// asked; he set the AI up himself, so for him AI counts as allowed until he turns it off.
export async function consentStatus(env) {
  const userId = env.USER_ID ?? env.DB?.userId;
  const rows = userId ? await consentRows(env.DB, userId) : [];
  const given = kind => {
    const row = rows.find(r => r.kind === kind && !r.withdrawn_at);
    return row ? { version: row.version, grantedAt: row.granted_at } : null;
  };
  const health = given('health'), ai = given('ai');
  const aiWithdrawn = rows.some(r => r.kind === 'ai' && r.withdrawn_at);
  return {
    version: CONSENT_VERSION,
    health,
    ai,
    needed: env.USER_IS_OWNER !== true && health?.version !== CONSENT_VERSION,
    aiAllowed: Boolean(ai) || (env.USER_IS_OWNER === true && !aiWithdrawn)
  };
}

// {health:true} and/or {ai:true|false}. Health consent can only be given here;
// it is taken back by deleting the account (Settings → Account).
export async function saveConsent(env, input = {}) {
  const userId = env.USER_ID ?? env.DB?.userId;
  if (!userId) throw new Error(L('Přihlas se do aplikace.', 'Sign in to the app.'));
  if (input.health !== undefined && input.health !== true) throw new Error(L('Bez souhlasu se zpracováním údajů o zdraví aplikace fungovat nemůže. Souhlas odvoláš smazáním účtu.', 'The app can\'t work without consent to process health data. To withdraw it, delete your account.'));
  if (input.ai !== undefined && typeof input.ai !== 'boolean') throw new Error(L('Neplatná volba souhlasu s AI.', 'Invalid AI consent choice.'));
  if (input.health === undefined && input.ai === undefined) throw new Error(L('Chybí volba souhlasu.', 'No consent choice given.'));
  if (input.ai !== undefined && !input.health && !(await consentStatus(env)).health) throw new Error(L('Nejdřív je potřeba souhlas se zpracováním údajů o zdraví.', 'Consent to process health data comes first.'));
  const now = new Date().toISOString();
  const grant = kind => env.DB.prepare('INSERT INTO user_consents (user_id, kind, version, granted_at, withdrawn_at) VALUES (?, ?, ?, ?, NULL) ON CONFLICT(user_id, kind) DO UPDATE SET version = excluded.version, granted_at = excluded.granted_at, withdrawn_at = NULL').bind(userId, kind, CONSENT_VERSION, now);
  const statements = [];
  if (input.health === true) statements.push(grant('health'));
  if (input.ai === true) statements.push(grant('ai'));
  if (input.ai === false) statements.push(env.DB.prepare("INSERT INTO user_consents (user_id, kind, version, granted_at, withdrawn_at) VALUES (?, 'ai', ?, ?, ?) ON CONFLICT(user_id, kind) DO UPDATE SET withdrawn_at = excluded.withdrawn_at").bind(userId, CONSENT_VERSION, now, now));
  await env.DB.batch(statements);
  return { status: 'ok', consent: await consentStatus(env) };
}
