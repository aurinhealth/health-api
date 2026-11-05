// Addresses a user or a webhook gave are fetched only when public (src/public-fetch.js).
import test from "node:test";
import assert from "node:assert/strict";
import { publicUrl, fetchPublic, readUpTo } from "../src/public-fetch.js";

test("only public http(s) addresses pass", () => {
  assert.equal(publicUrl("https://cdn.wahooligan.com/files/1.fit"), "https://cdn.wahooligan.com/files/1.fit");
  for (const bad of ["http://127.0.0.1/", "http://169.254.169.254/", "http://[::1]/", "http://10.1.2.3/", "http://100.64.0.1/", "http://intranet/", "http://db.internal/", "https://u:p@gym.cz/", "file:///etc/passwd"])
    assert.equal(publicUrl(bad), null, bad);
  assert.equal(publicUrl("http://gym.cz/", { https: true }), null);
});

test("redirects are checked hop by hop and limited", async () => {
  const loop = async url => new Response(null, { status: 302, headers: { location: url + "x" } });
  assert.equal(await fetchPublic("https://a.cz/", {}, loop), null);
  const toPrivate = async () => new Response(null, { status: 307, headers: { location: "http://192.168.1.1/" } });
  assert.equal(await fetchPublic("https://a.cz/", {}, toPrivate), null);
  const ok = async url => url === "https://a.cz/" ? new Response(null, { status: 302, headers: { location: "https://b.cz/f" } }) : new Response("fit");
  assert.equal(await (await fetchPublic("https://a.cz/", {}, ok)).text(), "fit");
});

test("a local address written as a number, in octal or hex is still local", async () => {
  // The URL parser turns every IPv4 spelling into the dotted form before the check (security review 2026-10-25).
  for (const link of ["http://0177.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://127.1/", "http://0251.0376.0251.0376/", "http://[::ffff:127.0.0.1]/", "http://0xa9fea9fe/"]) {
    assert.equal(publicUrl(link), null, link);
  }
});

test("Aurin's own hosts, Workers addresses and a trailing-dot local name are refused", () => {
  for (const link of ["https://aurin.health/app/api/me", "https://staging.aurin.health/", "https://AURIN.HEALTH./", "https://x.aurin-staging.com/", "https://health-api.petr.workers.dev/", "https://petrfitnessdata.eu/", "http://foo.localhost./", "https://aurin.health../x"])
    assert.equal(publicUrl(link), null, link);
  assert.equal(publicUrl("https://notaurin.health/"), "https://notaurin.health/");
});

test("a body is read only up to its limit; the rest is never downloaded", async () => {
  let pulled = 0;
  const chunk = new Uint8Array(1024 * 1024);
  const endless = new ReadableStream({ pull(controller) { pulled += chunk.byteLength; controller.enqueue(chunk); } });
  const { bytes, whole } = await readUpTo(new Response(endless), 1_500_000);
  assert.equal(bytes.byteLength, 1_500_000);
  assert.equal(whole, false);
  assert.ok(pulled <= 4 * 1024 * 1024, `pulled ${pulled}`);
  const exact = await readUpTo(new Response(new Uint8Array(10)), 10);
  assert.deepEqual([exact.bytes.byteLength, exact.whole], [10, true]);
  const small = await readUpTo(new Response("fit"), 10);
  assert.deepEqual([new TextDecoder().decode(small.bytes), small.whole], ["fit", true]);
});
