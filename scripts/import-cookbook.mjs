// Writes the SQL that loads the owner's cookbook into the database, from the
// owner's private copy (the book is copyrighted and stays out of this repository):
//   node scripts/import-cookbook.mjs kucharka.json > cookbook.sql
//   npx wrangler@4 d1 execute health-data --remote --file cookbook.sql
// The owner can upload the same file in Settings → Users instead. The recipes go
// in as one row of gzipped JSON, which keeps the statement under D1's 100 KB
// limit. Running it again replaces them.
import { readFileSync } from "node:fs";
import { packCookbook } from "../src/cookbook.js";

const D1_STATEMENT_LIMIT = 100_000;

export async function cookbookSql(data) {
  const packed = await packCookbook(data);
  const sql = `INSERT INTO cookbook (id, data, updated_at) VALUES (1, '${packed}', CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at;\n`;
  if (sql.length > D1_STATEMENT_LIMIT) throw new Error(`The cookbook is ${sql.length} bytes; D1 takes at most ${D1_STATEMENT_LIMIT} per statement.`);
  return sql;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error("Usage: node scripts/import-cookbook.mjs <cookbook.json>"); process.exit(1); }
  process.stdout.write(await cookbookSql(JSON.parse(readFileSync(file, "utf8"))));
}
