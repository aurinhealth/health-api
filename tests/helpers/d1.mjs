// A small D1-compatible facade over node:sqlite for tests that need real SQL.
import { DatabaseSync } from "node:sqlite";

export function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  let batchTail = Promise.resolve();
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...values) => statement(sql, values),
    async first() { const row = sqlite.prepare(sql).get(...args); return row === undefined ? null : { ...row }; },
    async all() { return { results: sqlite.prepare(sql).all(...args).map(row => ({ ...row })), success: true }; },
    async run() { const info = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }; }
  });
  return {
    sqlite,
    prepare: sql => statement(sql),
    batch(statements) {
      // D1 serializes transactions; simultaneous connector batches must not
      // try to BEGIN two transactions on this single SQLite connection.
      const work = batchTail.then(async () => {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          // Like D1, a SELECT in a batch returns its rows.
          for (const s of statements) results.push(/^\s*(select|with)\b/i.test(s.sql) ? await s.all() : await s.run());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
      });
      batchTail = work.catch(() => {});
      return work;
    },
    async exec(sql) { sqlite.exec(sql); return { count: 1 }; }
  };
}
