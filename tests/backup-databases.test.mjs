import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import { parseConfig } from "../scripts/provision-user-shards.mjs";
import { backupPlan, backupRecipients, encryptBackup, KEEP_DAYS, RECIPIENTS } from "../scripts/backup-databases.mjs";

const hasAge = (() => { try { execFileSync("age", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

test("the weekly backup covers the central database and every user data database", () => {
  const plan = backupPlan(parseConfig(readFileSync("wrangler.jsonc", "utf8")), "2026-10-18");
  assert.equal(plan.length, 21);
  assert.deepEqual(plan[0], { name: "health-data", key: "2026-10-18/health-data.sql.gz.age" });
  assert.equal(plan.at(-1).name, "health-data-users-020");
  // The privacy policy says backups of a deleted account are overwritten within 30 days.
  assert.ok(KEEP_DAYS <= 30);
  assert.match(readFileSync("src/site-pages.js", "utf8"), /Database backups are overwritten within 30 days/);
});

test("backups are encrypted to the public keys in the repository, never uploaded without one", () => {
  const text = readFileSync(RECIPIENTS, "utf8");
  assert.doesNotMatch(text, /AGE-SECRET-KEY/i);
  assert.ok(backupRecipients(text).length >= 1);
  const key = "age1dt6sey07gpjfexg73m7svrxhxuv9huf8vjmj3g8zm6tacwyg4yaqt7nfp0";
  assert.deepEqual(backupRecipients(`# comment\r\n${key}\r\n`), [key]);
  assert.throws(() => backupRecipients("# only a comment\n"), /no age public key/);
  assert.throws(() => backupRecipients("AGE-SECRET-KEY-1QQQ"), /secret key/);
  assert.throws(() => backupRecipients("ssh-ed25519 AAAA"), /Not an age public key/);
});

test("an encrypted backup opens only with the private key and gives back the SQL", { skip: !hasAge && "age is not installed" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "backup-key-")), keyFile = join(dir, "key.txt");
  try {
    execFileSync("age-keygen", ["-o", keyFile], { stdio: "ignore" });
    const recipient = readFileSync(keyFile, "utf8").match(/public key: (age1\S+)/)[1];
    const sql = "INSERT INTO users VALUES (1, 'petr@example.com');\n";
    const sealed = encryptBackup(gzipSync(sql), backupRecipients(recipient));
    assert.ok(!sealed.includes("petr@example.com"));
    assert.equal(gunzipSync(execFileSync("age", ["--decrypt", "-i", keyFile], { input: sealed })).toString(), sql);
    execFileSync("age-keygen", ["-o", join(dir, "other.txt")], { stdio: "ignore" });
    assert.throws(() => execFileSync("age", ["--decrypt", "-i", join(dir, "other.txt")], { input: sealed, stdio: ["pipe", "pipe", "ignore"] }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
