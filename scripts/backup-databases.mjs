// Weekly copy of the central database and every user data database to R2
// (.github/workflows/db-backup.yml). Runs with the GitHub Actions Cloudflare
// credentials. The bucket lives in the EU like the databases, and a lifecycle
// rule deletes copies after 28 days: the privacy policy promises that backups
// of a deleted account are overwritten within 30 days.
// Restore steps: navody/obnova-databaze.md in the project files.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig, shardPlan } from './provision-user-shards.mjs';

export const BUCKET = 'aurin-db-backups';
export const KEEP_DAYS = 28;

export function backupPlan(config, date) {
  const plan = shardPlan(config);
  return [plan.core.database_name, ...plan.shards.map(shard => shard.name)].map(name => ({ name, key: `${date}/${name}.sql.gz` }));
}

function wrangler(...args) {
  return execFileSync('npx', ['--yes', 'wrangler@4.147.0', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
}

function ensureBucket() {
  const buckets = wrangler('r2', 'bucket', 'list', '--jurisdiction', 'eu');
  if (!buckets.includes(BUCKET)) wrangler('r2', 'bucket', 'create', BUCKET, '--jurisdiction', 'eu');
  // The rule has a fixed name; on later runs it is already there.
  try { wrangler('r2', 'bucket', 'lifecycle', 'add', BUCKET, 'expire-backups', '--expire-days', String(KEEP_DAYS), '--jurisdiction', 'eu', '--force'); }
  catch (error) {
    if (!wrangler('r2', 'bucket', 'lifecycle', 'list', BUCKET, '--jurisdiction', 'eu').includes('expire-backups')) throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = parseConfig(readFileSync('wrangler.jsonc', 'utf8'));
  const date = new Date().toISOString().slice(0, 10), dir = resolve(process.env.RUNNER_TEMP || '.', 'db-backup');
  mkdirSync(dir, { recursive: true });
  ensureBucket();
  for (const { name, key } of backupPlan(config, date)) {
    const sql = resolve(dir, name + '.sql'), gz = sql + '.gz';
    wrangler('d1', 'export', name, '--remote', '--output', sql);
    writeFileSync(gz, gzipSync(readFileSync(sql)));
    wrangler('r2', 'object', 'put', `${BUCKET}/${key}`, '--file', gz, '--remote', '--jurisdiction', 'eu', '--content-type', 'application/gzip');
    console.log(`Backed up ${name} to ${BUCKET}/${key}`);
  }
}
