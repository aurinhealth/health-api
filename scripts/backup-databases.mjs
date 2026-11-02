// Weekly copy of the central database and every user data database to R2
// (.github/workflows/db-backup.yml). Runs with the GitHub Actions Cloudflare
// credentials. The bucket lives in the EU like the databases, and a lifecycle
// rule deletes copies after 28 days: the privacy policy promises that backups
// of a deleted account are overwritten within 30 days.
// Every copy is encrypted with age on the runner before it leaves it, to the
// public keys in backup-recipients.txt. The private key stays offline with the
// owner, never in GitHub or Cloudflare, so neither R2 nor a leaked Cloudflare
// token can read a backup. Nothing is uploaded without a key.
// Restore steps: navody/obnova-databaze.md in the project files.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseConfig, shardPlan } from './provision-user-shards.mjs';

export const BUCKET = 'aurin-db-backups';
export const KEEP_DAYS = 28;
export const RECIPIENTS = new URL('./backup-recipients.txt', import.meta.url);

// The age public keys (age1…) a backup is encrypted to. A secret key
// (AGE-SECRET-KEY-…) here would be a leak, so it stops the backup.
export function backupRecipients(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines.some(line => /AGE-SECRET-KEY/i.test(line))) throw new Error('backup-recipients.txt holds a secret key; only public keys (age1…) belong there');
  const bad = lines.find(line => !/^age1[02-9ac-hj-np-z]{58}$/.test(line));
  if (bad) throw new Error(`Not an age public key in backup-recipients.txt: ${bad}`);
  if (!lines.length) throw new Error('backup-recipients.txt has no age public key; backups are never uploaded unencrypted');
  return lines;
}

// Gzipped SQL in, an age file out (it starts with "age-encryption.org/v1").
export function encryptBackup(data, recipients) {
  const args = recipients.flatMap(recipient => ['-r', recipient]);
  const out = execFileSync('age', ['--encrypt', ...args], { input: data, maxBuffer: 1024 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'] });
  if (!out.subarray(0, 21).equals(Buffer.from('age-encryption.org/v1'))) throw new Error('age did not produce an encrypted file');
  return out;
}

export function backupPlan(config, date) {
  const plan = shardPlan(config);
  return [plan.core.database_name, ...plan.shards.map(shard => shard.name)].map(name => ({ name, key: `${date}/${name}.sql.gz.age` }));
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
  const recipients = backupRecipients(readFileSync(RECIPIENTS, 'utf8'));
  const date = new Date().toISOString().slice(0, 10), dir = resolve(process.env.RUNNER_TEMP || '.', 'db-backup');
  mkdirSync(dir, { recursive: true });
  ensureBucket();
  for (const { name, key } of backupPlan(config, date)) {
    const sql = resolve(dir, name + '.sql'), sealed = sql + '.gz.age';
    wrangler('d1', 'export', name, '--remote', '--output', sql);
    // Only the encrypted file stays on the runner's disk.
    writeFileSync(sealed, encryptBackup(gzipSync(readFileSync(sql)), recipients));
    rmSync(sql);
    wrangler('r2', 'object', 'put', `${BUCKET}/${key}`, '--file', sealed, '--remote', '--jurisdiction', 'eu', '--content-type', 'application/octet-stream');
    rmSync(sealed);
    console.log(`Backed up ${name} to ${BUCKET}/${key}`);
  }
}
