import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleSupportReport, saveSupportReport, validateReport, MAX_SCREENSHOT_BASE64, DAILY_REPORTS } from "../src/support-report.js";

const migration = readFileSync(new URL("../migrations/0016_support_reports.sql", import.meta.url), "utf8");
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD";
function setup(extra = {}) {
  const raw = createD1();
  raw.sqlite.exec(migration);
  const sent = [];
  const env = { DB: scopedDb(raw, 3), USER_ID: 3, USER_EMAIL: "a@b.cz", CONTACT_EMAIL: "support@example.com", EMAIL_FROM: "app@example.com", EMAIL: { async send(message) { sent.push(message); return { messageId: "m" }; } }, ...extra };
  return { raw, env, sent };
}
const post = (body, origin = "https://x.test") => new Request("https://x.test/app/api/support/report", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("a report is stored with its screenshot and diagnostics and e-mailed to support", async () => {
  const { raw, env, sent } = setup();
  const response = await handleSupportReport(post({ message: "Sync nefunguje", screenshot: "data:image/jpeg;base64," + JPEG, diagnostics: { app: "1.2 (34)", offline: false } }), env, { signedIn: true, origin: "https://x.test" });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.emailed, true);
  const row = raw.sqlite.prepare("SELECT * FROM support_reports").get();
  assert.equal(row.user_id, 3);
  assert.equal(row.screenshot_base64, JPEG);
  assert.deepEqual(JSON.parse(row.diagnostics_json), { app: "1.2 (34)", offline: false });
  assert.equal(row.emailed, 1);
  assert.equal(sent[0].to, "support@example.com");
  assert.match(sent[0].text, /Sync nefunguje/);
  assert.match(sent[0].text, /"offline": false/);
});

test("without e-mail set up the report is still kept", async () => {
  const { raw, env } = setup({ EMAIL: undefined });
  assert.deepEqual(await saveSupportReport(env, { message: "Chyba" }), { id: 1, emailed: false });
  assert.equal(raw.sqlite.prepare("SELECT emailed FROM support_reports").get().emailed, 0);
});

test("bad input is refused", () => {
  assert.throws(() => validateReport({ message: " " }), e => e.status === 400);
  assert.throws(() => validateReport({ message: "x".repeat(5000) }), e => e.status === 400);
  assert.throws(() => validateReport({ message: "ok ok", screenshot: "iVBORw0KGgo=" }), e => e.status === 400);
  assert.throws(() => validateReport({ message: "ok ok", screenshot: "/9j/" + "A".repeat(MAX_SCREENSHOT_BASE64) }), e => e.status === 413);
  assert.throws(() => validateReport({ message: "ok ok", diagnostics: { log: "x".repeat(20000) } }), e => e.status === 413);
  assert.throws(() => validateReport({ message: "ok ok", diagnostics: [1] }), e => e.status === 400);
});

test("reports are rate-limited per user", async () => {
  const { raw, env } = setup({ EMAIL: undefined });
  await saveSupportReport(env, { message: "první" });
  await assert.rejects(saveSupportReport(env, { message: "druhé" }), e => e.status === 429);
  raw.sqlite.exec("UPDATE support_reports SET created_at=datetime('now','-1 hour')");
  for (let i = 1; i < DAILY_REPORTS; i++) { await saveSupportReport(env, { message: "hlášení " + i }); raw.sqlite.exec("UPDATE support_reports SET created_at=datetime('now','-1 hour')"); }
  await assert.rejects(saveSupportReport(env, { message: "další" }), e => e.status === 429);
  // Another user is not limited by these.
  await saveSupportReport({ ...env, DB: scopedDb(raw, 9), USER_ID: 9 }, { message: "jiný uživatel" });
});

test("only a signed-in POST from the app's origin is accepted; the route is wired", async () => {
  const { env } = setup();
  assert.equal((await handleSupportReport(post({ message: "x y z" }), env, { signedIn: false, origin: "https://x.test" })).status, 401);
  assert.equal((await handleSupportReport(post({ message: "x y z" }, "https://evil.test"), env, { signedIn: true, origin: "https://x.test" })).status, 403);
  assert.equal((await handleSupportReport(new Request("https://x.test/app/api/support/report"), env, { signedIn: true, origin: "https://x.test" })).status, 405);
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /url\.pathname === "\/app\/api\/support\/report"\) return handleSupportReport/);
});
