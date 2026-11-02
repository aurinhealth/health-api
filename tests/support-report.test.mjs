import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleSupportReport, saveSupportReport, validateReport, reportFindings, reportWhere, reportScreen, requestClient, MAX_SCREENSHOT_BASE64, MAX_DIAGNOSTICS, DAILY_REPORTS } from "../src/support-report.js";

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

test("a feature idea is stored without a screenshot or server snapshot and e-mailed as an idea", async () => {
  const { raw, env, sent } = setup();
  const response = await handleSupportReport(post({ kind: "idea", message: "Tempo na stejné trase v čase", screenshot: JPEG, diagnostics: { app: "1.2 (34)", ios: "26.0", language: "cs" } }), env, { signedIn: true, origin: "https://x.test" });
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /návrh odešel|idea has been sent/);
  const row = raw.sqlite.prepare("SELECT * FROM support_reports").get();
  assert.equal(row.screenshot_base64, null);
  assert.deepEqual(JSON.parse(row.diagnostics_json), { app: "1.2 (34)", ios: "26.0", language: "cs", kind: "idea" });
  assert.match(sent[0].subject, /^Aurin: feature idea #1 from a@b\.cz$/);
  assert.match(sent[0].text, /Tempo na stejné trase v čase/);
  assert.match(sent[0].text, /App: Aurin 1\.2 \(34\), iOS 26\.0, cs/);
  assert.doesNotMatch(sent[0].text, /Diagnostics|Worth a look/);
  assert.throws(() => validateReport({ kind: "idea", message: " " }), e => e.status === 400 && /nápad|idea/.test(e.message));
});

test("the e-mail opens with where the report came from: the iPhone, its screens, the watch and the last requests", async () => {
  const { env, sent } = setup();
  const diagnostics = {
    app: "1.4 (312)", ios: "26.1", device: "iPhone", deviceModel: "iPhone16,1",
    screens: [{ screen: "today", at: "2026-11-02T10:01:05Z" }, { screen: "training/muscle", at: "2026-11-02T10:02:00Z" }, { screen: "settings", at: "2026-11-02T10:03:00Z" }],
    recentRequests: [{ at: "2026-11-02T10:02:01Z", path: "GET /app/api/coach/pick", status: 200, ms: 4137 }, { at: "2026-11-02T10:01:06Z", path: "GET /app/api/today", status: 200, ms: 420 }],
    appleWatch: { paired: true, aurinInstalled: true, reachable: false, app: "1.3 (300)", watchOS: "26.0", model: "Watch7,3", signedIn: true, todayDate: "2026-11-02", sentAt: new Date().toISOString(),
      screens: [{ screen: "readiness", at: "2026-11-02T09:58:00Z" }, { screen: "gym", at: "2026-11-02T10:00:00Z" }],
      recentErrors: [{ at: "2026-11-02T10:00:30Z", path: "POST /app/api/gym", status: 500, message: "D1 error" }] }
  };
  const request = new Request("https://x.test/app/api/support/report", { method: "POST", headers: { Origin: "https://x.test", "Content-Type": "application/json", "X-Aurin-Api": "7", "User-Agent": "Aurin/312 CFNetwork/3826 Darwin/25.1.0" }, body: JSON.stringify({ message: "Série se neuložila", diagnostics }) });
  assert.equal((await handleSupportReport(request, env, { signedIn: true, origin: "https://x.test" })).status, 200);
  const { subject, text, html } = sent[0];
  assert.equal(subject, "Aurin: problem report #1 from a@b.cz (training/muscle)");
  const head = text.split("Série se neuložila")[0];
  assert.match(head, /Sent from: iPhone app, Aurin 1\.4 \(312\), iPhone16,1, iOS 26\.1/);
  assert.match(head, /Screens before the report \(UTC\): today 10:01 → training\/muscle 10:02 → settings 10:03/);
  assert.match(head, /Apple Watch: Aurin 1\.3 \(300\), watchOS 26\.0, Watch7,3, signed in, out of reach, shows 2026-11-02; last pages: readiness 09:58 → gym 10:00/);
  assert.match(head, /Last requests: GET \/app\/api\/coach\/pick 200 4137 ms \(10:02\); GET \/app\/api\/today 200 420 ms \(10:01\)/);
  assert.match(text, /1 slow request\(s\) just before the report, slowest GET \/app\/api\/coach\/pick 200 4137 ms/);
  assert.match(text, /watch: runs Aurin 1\.3 \(300\), the iPhone 1\.4 \(312\)/);
  assert.match(text, /watch: 1 failed request\(s\) this week, latest 2026-11-02T10:00:30Z POST \/app\/api\/gym 500 D1 error/);
  assert.match(html, /<br>Screens before the report \(UTC\): today 10:01/);
});

test("without diagnostics the request's own headers still say which app sent it", async () => {
  const { raw, env, sent } = setup();
  const client = requestClient(new Request("https://x.test", { headers: { "X-Aurin-Api": "7", "User-Agent": "Aurin/312 CFNetwork/3826 Darwin/25.1.0" } }));
  assert.deepEqual(client, { api: "7", userAgent: "Aurin/312 CFNetwork/3826 Darwin/25.1.0" });
  assert.equal(requestClient(new Request("https://x.test")), null);
  await saveSupportReport(env, { message: "Nejde to" }, client);
  assert.deepEqual(JSON.parse(raw.sqlite.prepare("SELECT diagnostics_json FROM support_reports").get().diagnostics_json).client, client);
  assert.match(sent[0].text, /Sent from: iPhone app without diagnostics \(Aurin\/312 CFNetwork\/3826 Darwin\/25\.1\.0\)/);
  assert.equal(sent[0].subject, "Aurin: problem report #1 from a@b.cz");
});

test("where: an older app's plain screen names, a watch without Aurin or details, a stale watch report", () => {
  assert.deepEqual(reportWhere({ app: "1.2 (34)", ios: "26.0", device: "iPhone", screens: ["today", "coach"], appleWatch: { paired: false, aurinInstalled: false } }, null),
    ["Sent from: iPhone app, Aurin 1.2 (34), iPhone, iOS 26.0", "Screens before the report (UTC): today → coach", "Apple Watch: none paired"]);
  assert.deepEqual(reportWhere({ appleWatch: { paired: true, aurinInstalled: false } }, null), ["Apple Watch: paired, Aurin not on it"]);
  assert.match(reportWhere({ appleWatch: { paired: true, aurinInstalled: true, reachable: true } }, null)[0], /Aurin on it, in reach; no details/);
  assert.deepEqual(reportWhere(null, null), []);
  assert.equal(reportScreen({ screens: ["today", "settings"] }), "today");
  assert.equal(reportScreen({ screens: [{ screen: "today" }, { screen: "settings" }, { screen: "page/Zdroje dat" }] }), "page/Zdroje dat");
  assert.equal(reportScreen({}), null);
  const old = new Date(Date.now() - 4 * 86_400_000).toISOString();
  assert.deepEqual(reportFindings({ appleWatch: { paired: true, aurinInstalled: true, app: "1.4 (312)", signedIn: false, sentAt: old } }, null),
    ["watch: not signed in on its own (nothing without the iPhone nearby)", `watch: its app last reported 4 days ago (${old}), so it has not been opened since`]);
});

test("the user's answer where it happened leads, and a watch problem names the watch's page in the subject", async () => {
  const { env, sent } = setup();
  const diagnostics = { happenedOn: "watch", app: "1.4 (312)", ios: "26.1", deviceModel: "iPhone16,1", screens: [{ screen: "training", at: "2026-11-02T10:01:00Z" }, { screen: "settings", at: "2026-11-02T10:03:00Z" }],
    appleWatch: { paired: true, aurinInstalled: true, app: "1.4 (312)", watchOS: "26.0", model: "Watch7,3", signedIn: true, screens: [{ screen: "readiness", at: "2026-11-02T09:58:00Z" }, { screen: "gym", at: "2026-11-02T10:00:00Z" }] } };
  await saveSupportReport(env, { message: "Série se neuložila", diagnostics });
  assert.equal(sent[0].subject, "Aurin: problem report #1 from a@b.cz (Apple Watch, gym)");
  assert.match(sent[0].text.split("Série")[0], /From: .*\nHappened on \(the user's answer\): Apple Watch\nSent from: iPhone app/);
  assert.deepEqual(reportWhere({ happenedOn: "iphone" }, { api: "7" }), ["Happened on (the user's answer): iPhone", "Sent from: iPhone app without diagnostics"]);
  assert.equal(reportScreen({ happenedOn: "watch" }), "Apple Watch");
});
