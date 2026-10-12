// Reads the NDJSON account download (account-data.js) back into its header,
// its lines and the rows grouped by table, for tests.
import { exportAccountStream } from "../../src/account-data.js";

export async function readExport(stream) {
  const text = await new Response(stream).text();
  const lines = text.split("\n");
  if (lines.at(-1) !== "") throw new Error("The export must end with a newline");
  const records = lines.slice(0, -1).map(line => JSON.parse(line));
  const [header, ...rows] = records;
  const tables = {};
  for (const { table, row } of rows) (tables[table] ||= []).push(row);
  return { header, rows, tables, text };
}

export const exportAccount = (env, user, options) => readExport(exportAccountStream(env, user, options));
