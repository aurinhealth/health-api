import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleSupportReport, saveSupportReport, validateReport, reportFindings, MAX_SCREENSHOT_BASE64, MAX_DIAGNOSTICS, DAILY_REPORTS } from "../src/support-report.js";

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
  assert.deepEqual(JSON.parse(row.diagnostics_json), { app: "1.2 (34)", offline: false, server: { syncs: [], failedSends: [] } });
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
  assert.throws(() => validateReport({ message: "ok ok", diagnostics: { log: "x".repeat(MAX_DIAGNOSTICS) } }), e => e.status === 413);
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

test("the e-mail leads with what is worth a look, the server's side included", async () => {
  const { raw, env, sent } = setup();
  raw.sqlite.exec(`CREATE TABLE sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name));
    INSERT INTO sync_status VALUES (3,'connection_google','broken',NULL,'2026-10-12 08:00:00','{"lastError":"invalid_grant","lastErrorAt":"2026-10-12T08:00:00Z"}','2026-10-12 08:00:00');
    INSERT INTO sync_status VALUES (3,'dashboard_recent','partial',NULL,'2026-10-12 08:00:00','{"results":[{"source":"google","status":"ok"},{"source":"intervals","status":"error","message":"401 Unauthorized"}]}','2026-10-12 08:00:00');
    INSERT INTO sync_status VALUES (9,'connection_google','broken',NULL,NULL,'{"lastError":"someone else"}',NULL);
    CREATE TABLE sync_sends (user_id INTEGER NOT NULL, activity_key TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', remote_id TEXT, message TEXT, payload_json TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, activity_key, destination));
    INSERT INTO sync_sends(user_id,activity_key,destination,status,message) VALUES (3,'gym:2026-10-12','intervals','error','Intervals refused the workout');`);
  const diagnostics = {
    connections: [{ id: "apple", connected: true, lastSuccessAt: new Date(Date.now() - 30 * 3_600_000).toISOString() }, { id: "intervals", connected: true }],
    appleHealth: { on: false },
    lastErrors: { food: "Server odpověděl chybou 500." },
    recentErrors: [{ at: "2026-10-13T10:00:00Z", path: "POST /app/api/food", status: 500, message: "D1 error" }]
  };
  await saveSupportReport(env, { message: "Nejde to", diagnostics });
  const stored = JSON.parse(raw.sqlite.prepare("SELECT diagnostics_json FROM support_reports").get().diagnostics_json);
  assert.equal(stored.server.syncs.length, 2);
  assert.equal(stored.server.failedSends[0].message, "Intervals refused the workout");
  const text = sent[0].text;
  assert.match(text, /Worth a look:/);
  assert.match(text, /apple: nothing new for 30 h/);
  assert.match(text, /apple: switched off on the iPhone/);
  assert.match(text, /on screen \(food\): Server odpověděl chybou 500\./);
  assert.match(text, /1 failed request\(s\) in the app this week, latest 2026-10-13T10:00:00Z POST \/app\/api\/food 500 D1 error/);
  assert.match(text, /server sync connection_google: broken \(invalid_grant\)/);
  assert.match(text, /server sync dashboard_recent: partial; intervals error 401 Unauthorized/);
  assert.match(text, /1 send\(s\) to other apps failed/);
  assert.doesNotMatch(text, /someone else/);
  assert.match(sent[0].html, /<li>apple: switched off on the iPhone/);
});

test("the app's crashes are flagged with the latest one", () => {
  const crashes = [{ at: "2026-10-14T07:00:00Z", app: "1.0 (412)", ios: "26.0", exception: "1 code 2", signal: 11, frames: ["Loadwise +0x1a2b", "UIKitCore +0x40"] }, { at: "2026-10-10T07:00:00Z", app: "1.0 (400)", ios: "26.0", frames: [] }];
  assert.deepEqual(reportFindings({ crashes }, null), ["2 crash(es) in the app in the last two weeks, latest 2026-10-14T07:00:00Z 1.0 (412) 1 code 2 signal 11 Loadwise +0x1a2b"]);
});

test("nothing to flag says so", () => {
  assert.deepEqual(reportFindings({ connections: [{ id: "google", connected: true, lastSuccessAt: new Date().toISOString() }], lastErrors: {} }, { syncs: [{ name: "connection_google", status: "ok" }], failedSends: [] }), []);
  assert.deepEqual(reportFindings(null, null), []);
});
