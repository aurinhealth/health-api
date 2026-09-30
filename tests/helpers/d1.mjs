// A small D1-compatible facade over node:sqlite for tests that need real SQL.
import { DatabaseSync } from "node:sqlite";

export function createD1() {
  const sqlite = new DatabaseSync(":memory:");
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
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    async exec(sql) { sqlite.exec(sql); return { count: 1 }; }
  };
}
