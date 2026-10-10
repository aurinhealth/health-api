// Tables needed before a user's data database is known, or shared by everyone.
// Keep these on the existing DB binding. All remaining PERSONAL_TABLES move
// together, so transactions between health, plans and the diary stay atomic.
export const CENTRAL_PERSONAL_TABLES = new Set([
  'connection_credentials', 'user_consents', 'user_identities', 'user_passkeys',
  'user_language', 'user_time_zone', 'subscriptions', 'ai_usage',
  'food_contributions', 'recipe_contributions', 'food_reports', 'support_reports'
]);
const CENTRAL_TABLES = new Set([
  ...CENTRAL_PERSONAL_TABLES, 'users', 'user_invites', 'schema_meta',
  'account_deletions', 'user_data_routes', 'user_data_shards',
  'shared_foods', 'shared_recipes', 'workout_library', 'exercise_techniques',
  'cookbook', 'auth_challenges', 'email_login_codes', 'd1_migrations'
]);
const TARGET = Symbol('database target');
const STATEMENT = Symbol('database statement');
const routers = new WeakMap();

export function routedUserDb(core, personal, personalTables) {
  if (core === personal) return core;
  if (!routers.has(core)) routers.set(core, new WeakMap());
  const cached = routers.get(core).get(personal);
  if (cached?.tables === personalTables) return cached.db;
  const local = new Set(Object.keys(personalTables).filter(t => !CENTRAL_PERSONAL_TABLES.has(t)));
  function target(sql) {
    // Table names inside provider JSON, SQL strings and comments are not tables.
    const code = String(sql).replace(/'(?:''|[^'])*'|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
    const words = code.match(/[a-z_][a-z_0-9]*/gi)?.map(w => w.toLowerCase()) || [];
    const hasLocal = words.some(w => local.has(w));
    if (hasLocal && words.some(w => CENTRAL_TABLES.has(w))) throw new Error('A query cannot join central and user databases');
    return hasLocal ? personal : core;
  }
  function wrap(statement, database) {
    return {
      [TARGET]: database, [STATEMENT]: statement,
      bind: (...values) => wrap(statement.bind(...values), database),
      run: (...args) => statement.run(...args),
      first: (...args) => statement.first(...args),
      all: (...args) => statement.all(...args),
      raw: (...args) => statement.raw(...args)
    };
  }
  const db = {
    prepare(sql) { const database = target(sql); return wrap(database.prepare(sql), database); },
    batch(statements) {
      if (!statements.length) return Promise.resolve([]);
      const database = statements[0]?.[TARGET];
      // Validate the entire batch before executing any part. Splitting a D1
      // transaction into two calls would silently lose rollback guarantees.
      if (!database || statements.some(s => s?.[TARGET] !== database)) throw new Error('A batch must belong to one database');
      return database.batch(statements.map(s => s[STATEMENT]));
    },
    exec(sql) { return target(sql).exec(sql); },
    dump() { throw new Error('A routed database cannot be dumped'); }
  };
  routers.get(core).set(personal, { db, tables: personalTables });
  return db;
}
