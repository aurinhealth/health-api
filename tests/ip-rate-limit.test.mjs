import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { allowRequest, allowClient, clientKey, callerNetwork, CLIENT_LIMITS } from "../src/ip-rate-limit.js";

const MIGRATION = readFileSync(new URL("../migrations/0020_request_limits.sql", import.meta.url), "utf8");
const T0 = Date.parse("2026-10-07T08:00:00Z");
const from = (ip, path = "/auth/email/start") => new Request("https://petrfitnessdata.eu" + path, { method: "POST", headers: ip ? { "CF-Connecting-IP": ip } : {} });

test("a key gets its minute, hour and day budgets; each window starts over", async () => {
  const db = createD1();
  for (let i = 0; i < 3; i++) assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + i * 1000), true);
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + 4000), false, "the fourth in a minute");
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + 61_000), true, "a new minute");
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + 122_000), true);
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + 183_000), false, "the sixth in an hour");
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + 3_600_000), true, "a new hour");
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + 3_661_000), true);
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, T0 + 3_722_000), false, "the eighth of the day");
  assert.equal(await allowRequest(db, "k", { minute: 3, hour: 5, day: 7 }, Date.parse("2026-10-08T00:00:00Z")), true, "a new day");
  // Another key is counted on its own; a refused request is not counted.
  assert.equal(await allowRequest(db, "other", { minute: 1 }, T0), true);
  assert.equal(db.sqlite.prepare("SELECT minute_count FROM request_limits WHERE key = 'k'").get().minute_count, 1);
});

test("missing limits are unlimited and the migration matches the table the code makes", async () => {
  const db = createD1();
  db.sqlite.exec(MIGRATION);
  for (let i = 0; i < 20; i++) assert.equal(await allowRequest(db, "g", { day: 500 }, T0 + i), true);
  assert.equal(db.sqlite.prepare("SELECT day_count FROM request_limits WHERE key = 'g'").get().day_count, 20);
  // Stale rows go when a request is written.
  db.sqlite.prepare("INSERT INTO request_limits(key, minute, hour, day, updated_at) VALUES('old', '', '', '', ?)").run(Math.floor(T0 / 1000) - 3 * 86400);
  await allowRequest(db, "g", {}, T0 + 21);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM request_limits WHERE key = 'old'").get().n, 0);
});

test("callers are told apart by a keyed hash of their address, never the address itself", async () => {
  const a = await clientKey(from("203.0.113.5"), "secret"), b = await clientKey(from("203.0.113.6"), "secret");
  assert.notEqual(a, b);
  assert.equal(a, await clientKey(from("203.0.113.5"), "secret"));
  assert.notEqual(a, await clientKey(from("203.0.113.5"), "other-secret"));
  assert.doesNotMatch(a, /203/);
  assert.match(a, /^ip:[A-Za-z0-9_-]{32}$/);
  assert.equal(await clientKey(from(null), "secret"), await clientKey(from(""), "secret"), "no header: one shared key");
});

test("one caller gets five starts a minute and thirty an hour per purpose", async () => {
  const db = createD1();
  assert.deepEqual(CLIENT_LIMITS, { minute: 5, hour: 30 });
  for (let i = 0; i < 5; i++) assert.equal(await allowClient(db, from("203.0.113.5"), "s", "email", T0 + i), true);
  assert.equal(await allowClient(db, from("203.0.113.5"), "s", "email", T0 + 5), false);
  assert.equal(await allowClient(db, from("203.0.113.5"), "s", "passkey", T0 + 5), true, "another purpose has its own count");
  assert.equal(await allowClient(db, from("203.0.113.9"), "s", "email", T0 + 5), true, "another caller");
  let allowed = 0;
  for (let minute = 1; minute <= 7; minute++) for (let i = 0; i < 5; i++) if (await allowClient(db, from("203.0.113.5"), "s", "email", T0 + minute * 60_000 + i)) allowed++;
  assert.equal(allowed, 25, "thirty an hour in all");
});

test("an IPv6 caller is its /64, written one way; IPv4 and IPv4-mapped addresses are the same caller", async () => {
  assert.equal(callerNetwork("2001:DB8:1:2::5"), "2001:db8:1:2::/64");
  assert.equal(callerNetwork("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(callerNetwork("2001:db8::"), "2001:db8:0:0::/64");
  assert.equal(callerNetwork("fe80::1%eth0"), "fe80:0:0:0::/64");
  assert.equal(callerNetwork("::ffff:203.0.113.5"), "203.0.113.5");
  assert.equal(callerNetwork("::ffff:cb00:7105"), "203.0.113.5");
  assert.equal(callerNetwork(" 203.0.113.5 "), "203.0.113.5");
  assert.equal(callerNetwork(""), "none");
  assert.equal(callerNetwork("2001:db8::1::2"), "2001:db8::1::2", "not an address: kept as it came");
  assert.equal(await clientKey(from("2001:db8:1:2::5"), "s"), await clientKey(from("2001:db8:1:2:ffff:ffff:ffff:ffff"), "s"));
  assert.notEqual(await clientKey(from("2001:db8:1:2::5"), "s"), await clientKey(from("2001:db8:1:3::5"), "s"));
  assert.equal(await clientKey(from("::ffff:203.0.113.5"), "s"), await clientKey(from("203.0.113.5"), "s"));
});

test("a caller's limits can include a day", async () => {
  const db = createD1();
  for (let i = 0; i < 3; i++) assert.equal(await allowClient(db, from("203.0.113.5"), "s", "email", T0 + i * 3_600_000, { day: 3 }), true);
  assert.equal(await allowClient(db, from("203.0.113.5"), "s", "email", T0 + 3 * 3_600_000, { day: 3 }), false);
});
