// Uploads the 3D muscle figure built by scripts/build-muscle-model.mjs to R2, gzipped,
// where /app/api/muscles/model serves it (src/muscle-model.js):
//   node scripts/upload-muscle-model.mjs muscles-v1.bin [format]
// Needs wrangler signed in (npx wrangler login) or CLOUDFLARE_API_TOKEN with R2 edit rights.
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { MUSCLE_MODEL_FORMATS } from "../src/muscle-model.js";

const [file, format = "1"] = process.argv.slice(2);
const key = MUSCLE_MODEL_FORMATS[format];
if (!file || !key) { console.error("Usage: node scripts/upload-muscle-model.mjs muscles-v1.bin [format]"); process.exit(2); }
if (readFileSync(file).subarray(0, 4).toString() !== "AURM") throw new Error(`${file} is not a model from build-muscle-model.mjs`);
const gz = file + ".gz";
writeFileSync(gz, gzipSync(readFileSync(file), { level: 9 }));
const r = spawnSync("npx", ["--yes", "wrangler@4.147.0", "r2", "object", "put", `loadwise-food-catalog/${key}`, "--file", gz, "--remote", "--content-type", "application/octet-stream"],
  { stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) throw new Error("Upload failed");
console.log(`Done: ${key}`);
