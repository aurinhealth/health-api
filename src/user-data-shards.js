import { userEnv, PERSONAL_TABLES } from './tenancy.js';
import { routedUserDb } from './user-data-routing.js';
import { foodCatalogEnvironment, FoodCatalogUnavailable } from './food-catalog-storage.js';

const LEGACY = 'legacy';
const ALLOCATION_ATTEMPTS = 100;
export class UserDataUnavailable extends Error {
  constructor() { super('User data storage is temporarily unavailable'); this.status = 503; }
}

async function route(env, userId) {
  return env.DB.prepare(`SELECT r.shard_key, s.binding_name, s.state
    FROM user_data_routes r LEFT JOIN user_data_shards s ON s.shard_key=r.shard_key
    WHERE r.user_id=?`).bind(userId).first();
}
function database(env, row) {
  // Never fall back to the legacy DB on a missing binding: a silently empty
  // diary followed by new writes would split a person's history in two.
  if (!row || row.state !== 'ready' || !row.binding_name || !env[row.binding_name]?.prepare) throw new UserDataUnavailable();
  if (row.shard_key === LEGACY && row.binding_name !== 'DB') throw new UserDataUnavailable();
  if (row.shard_key !== LEGACY && (!/^USER_DATA_\d{3}$/.test(row.binding_name) || env[row.binding_name] === env.DB)) throw new UserDataUnavailable();
  return env[row.binding_name];
}

export async function resolveUserData(env, userId, { existingOnly = false } = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new UserDataUnavailable();
  // Old deployments and tests without the provisioned configuration retain
  // their original behavior. Once enabled, missing metadata is an error.
  if (env.USER_DATA_ROUTING !== 'true') return { db: env.DB, key: LEGACY };
  let current = await route(env, id);
  if (current) return { db: database(env, current), key: current.shard_key };
  if (existingOnly) throw new UserDataUnavailable();
  const enabled = await env.DB.prepare("SELECT value FROM schema_meta WHERE key='user_data_sharding_enabled'").first();
  if (enabled?.value !== '1') {
    await env.DB.prepare(`INSERT INTO user_data_routes(user_id,shard_key)
      SELECT id,'legacy' FROM users WHERE id=? ON CONFLICT(user_id) DO NOTHING`).bind(id).run();
  } else {
    const candidates = (await env.DB.prepare(`SELECT s.shard_key,s.binding_name,s.state,s.max_bytes,s.max_users,
      (SELECT COUNT(*) FROM user_data_routes r WHERE r.shard_key=s.shard_key) AS users_count
      FROM user_data_shards s WHERE s.shard_key!='legacy' AND s.state='ready' AND s.accepting_new=1
      ORDER BY users_count,s.shard_key LIMIT ?`).bind(ALLOCATION_ATTEMPTS).all()).results || [];
    for (const candidate of candidates) {
      if (candidate.users_count >= candidate.max_users) continue;
      let db;
      try {
        db = database(env, candidate);
        const result = await db.prepare('SELECT version FROM user_data_shard_meta WHERE id=1').all();
        if (result.results?.[0]?.version !== 1 || !Number.isFinite(result.meta?.size_after) || result.meta.size_after >= candidate.max_bytes) continue;
      } catch { continue; }
      // The capacity check and claim execute in one central SQL statement;
      // concurrent sign-ins cannot overfill a shard's user-count allowance.
      await env.DB.prepare(`INSERT INTO user_data_routes(user_id,shard_key)
        SELECT ?,shard_key FROM user_data_shards s
        WHERE shard_key=? AND state='ready' AND accepting_new=1
          AND (SELECT COUNT(*) FROM user_data_routes r WHERE r.shard_key=s.shard_key)<max_users
          AND EXISTS(SELECT 1 FROM users WHERE id=?)
        ON CONFLICT(user_id) DO NOTHING`).bind(id, candidate.shard_key, id).run();
      current = await route(env, id);
      if (current) break;
    }
  }
  current ||= await route(env, id);
  return { db: database(env, current), key: current.shard_key };
}

export async function userDataEnvironment(env, user) {
  const resolved = await resolveUserData(env, user.id);
  const catalogue = await foodCatalogEnvironment(env);
  return userEnv({ ...catalogue, USER_DATA_DB: resolved.db, USER_DATA_SHARD: resolved.key }, user);
}

export async function deletionDatabase(env, userId) {
  const { db } = await resolveUserData(env, userId, { existingOnly: true });
  const catalogue = await foodCatalogEnvironment(env);
  if (catalogue.FOOD_CATALOG_STATE === 'copying') throw new FoodCatalogUnavailable();
  return routedUserDb(env.DB, db, PERSONAL_TABLES, catalogue.FOOD_CATALOG_DB);
}
