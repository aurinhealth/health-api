// The user's own data: a download of everything stored for the account, and
// deleting the account with all of it (Nastavení → Účet). The shared food and
// recipe catalogue holds no personal data and stays; the links between the
// user and their contributions are personal and go with the account.
import { L } from './lang.js';
import { PERSONAL_TABLES } from "./tenancy.js";

// Sign-in keys of the connected services are never exported.
const SECRET_TABLES = new Set(["connection_credentials", "provider_tokens"]);
const missingTable = error => /no such table/i.test(String(error?.message || error));

export async function exportAccountData(env, user) {
  const tables = {};
  for (const table of Object.keys(PERSONAL_TABLES)) {
    if (SECRET_TABLES.has(table)) continue;
    try {
      const rows = (await env.DB.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).bind(env.USER_ID).all()).results || [];
      if (rows.length) tables[table] = rows.map(({ user_id, ...row }) => row);
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
  }
  return { exportedAt: new Date().toISOString(), account: { email: user?.email || null, name: user?.name || null }, tables };
}

// Google keeps a granted consent until it is revoked; the app gives it back
// before forgetting the key. Intervals.icu has no revoke call: its key or token
// is deleted here and the user can remove the app at intervals.icu/settings.
async function revokeGoogle(env, fetchImpl) {
  if (!env.GOOGLE_REFRESH_TOKEN) return "none";
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: env.GOOGLE_REFRESH_TOKEN }) });
    return response.ok ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}

export async function deleteAccount(env, user, { fetchImpl = fetch } = {}) {
  if (!user?.id || Number(user.id) !== Number(env.USER_ID)) throw new Error(L("Účet se nepodařilo ověřit.", "The account couldn't be verified."));
  if (user.isOwner) throw new Error(L("Účet správce nejde smazat: patří k němu data a nastavení aplikace.", "The admin account can't be deleted: the app's data and settings belong to it."));
  const google = await revokeGoogle(env, fetchImpl);
  const deleted = {};
  for (const table of Object.keys(PERSONAL_TABLES)) {
    try {
      const result = await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(env.USER_ID).run();
      if (result?.meta?.changes) deleted[table] = result.meta.changes;
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
  }
  // Last: without the account row the session no longer signs anyone in,
  // and signing in again needs a new invitation.
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(env.USER_ID).run();
  return { status: "ok", google, deleted };
}
