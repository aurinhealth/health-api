// Uploads a catalogue built by scripts/build-world-foods.mjs to R2 and then
// switches the app to it: node scripts/upload-world-foods.mjs <out-dir>/<version> [bucket]
// Needs wrangler signed in (npx wrangler login) or CLOUDFLARE_API_TOKEN with R2
// edit rights. current.json is written last, so searches keep using the old
// version until every file of the new one is in place. About 50 objects, so
// the upload stays far below R2's free million writes a month.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { WORLD_FOODS_FORMAT } from "../src/world-foods.js";

const MAX_BYTES = 300 * 1024 * 1024;

function put(bucket, key, file, contentType) {
  const args = ["--yes", "wrangler@4", "r2", "object", "put", `${bucket}/${key}`, "--file", file, "--remote", "--content-type", contentType];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
    if (r.status === 0) return;
    console.error(`Upload of ${key} failed (attempt ${attempt})`);
  }
  throw new Error(`Could not upload ${key}`);
}

export function plan(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  if (meta.format !== WORLD_FOODS_FORMAT) throw new Error(`Format ${meta.format}, the app reads ${WORLD_FOODS_FORMAT}`);
  const files = [
    ...meta.files.map(f => [f, "application/octet-stream"]),
    ...readdirSync(join(dir, "names")).map(f => [`names/${f}`, "application/json"]),
    ["barcodes.idx.json", "application/json"],
    ["meta.json", "application/json"]
  ];
  for (const [f] of files) if (statSync(join(dir, f)).size > MAX_BYTES) throw new Error(`${f} is over 300 MiB`);
  return { version: meta.version, files };
}

if (process.argv[1]?.endsWith("upload-world-foods.mjs")) {
  const [dir, bucket = "loadwise-food-catalog"] = process.argv.slice(2);
  if (!dir) { console.error("Usage: node scripts/upload-world-foods.mjs <out-dir>/<version> [bucket]"); process.exit(2); }
  const { version, files } = plan(dir);
  // In Eastern Europe, next to the Worker and D1; an existing bucket stays as it is.
  // R2 keeps the location of the first bucket ever created under a name, even
  // after it is deleted, so a bucket placed wrongly needs a new name.
  const created = spawnSync("npx", ["--yes", "wrangler@4", "r2", "bucket", "create", bucket, "--location", "eeur"], { encoding: "utf8", shell: process.platform === "win32" });
  if (created.status !== 0 && !/already exists|10004/i.test(created.stdout + created.stderr)) throw new Error(`Could not create bucket ${bucket}: ${created.stderr.slice(-300)}`);
  console.log(`Uploading ${files.length} files of ${version} to ${bucket}`);
  for (const [f, type] of files) put(bucket, `${version}/${f}`, join(dir, f), type);
  const current = join(tmpdir(), `current-${basename(dir)}.json`);
  writeFileSync(current, JSON.stringify({ format: WORLD_FOODS_FORMAT, version }));
  put(bucket, "current.json", current, "application/json");
  console.log(`Done: the app now searches ${version}`);
}
