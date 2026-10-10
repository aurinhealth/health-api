// The directory remains central. Never cache the cutover state across requests:
// a request admitted after activation must immediately use the new catalogue.
export class FoodCatalogUnavailable extends Error {
  constructor() { super('Katalog potravin je dočasně nedostupný. Zkus to prosím znovu za chvíli.'); this.status = 503; }
}

export async function foodCatalogEnvironment(env) {
  if (env.FOOD_CATALOG_ROUTING !== 'true') return { ...env, FOOD_CATALOG_DB: env.DB, FOOD_CATALOG_STATE: 'legacy' };
  const rows = (await env.DB.prepare("SELECT key,value FROM schema_meta WHERE key IN ('food_catalog_state','food_catalog_database_id')").all()).results || [];
  const values = Object.fromEntries(rows.map(r => [r.key,r.value]));
  const state = values.food_catalog_state;
  if (state === 'legacy' || state === 'copying') return { ...env, FOOD_CATALOG_DB:env.DB, FOOD_CATALOG_STATE:state };
  if (state !== 'ready' || !env.FOODS?.prepare || env.FOODS === env.DB || !env.FOOD_CATALOG_DB_ID || values.food_catalog_database_id !== env.FOOD_CATALOG_DB_ID) throw new FoodCatalogUnavailable();
  return { ...env, FOOD_CATALOG_DB:env.FOODS, FOOD_CATALOG_STATE:state };
}

export function foodCatalogRequestPaused(request, env, pathname) {
  return env.FOOD_CATALOG_STATE === 'copying' && (
    /^\/app\/api\/food\//.test(pathname) || pathname === '/app/api/account/delete' || pathname === '/app/api/account/export'
  );
}
