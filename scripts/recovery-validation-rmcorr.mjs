// Repeated-measures correlation of the recovery index across athletes.
// Save each athlete's /app/api/recovery-validation response as JSON, then:
//   node scripts/recovery-validation-rmcorr.mjs athlete1.json athlete2.json …
import { readFile } from "node:fs/promises";
import { repeatedMeasuresCorrelation } from "../src/recovery-validation.js";

const files = process.argv.slice(2);
if (!files.length) { console.error("Usage: node scripts/recovery-validation-rmcorr.mjs <file.json> …"); process.exit(1); }
const athletes = await Promise.all(files.map(async f => JSON.parse(await readFile(f, "utf8")).pairs || []));
for (const key of ["efficiencyZ", "rpeResidual"]) {
  const result = repeatedMeasuresCorrelation(athletes.map(pairs => pairs.map(p => ({ x: p.recovery, y: p[key] }))));
  console.log(key, JSON.stringify(result));
}
