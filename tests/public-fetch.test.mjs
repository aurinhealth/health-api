// Addresses a user or a webhook gave are fetched only when public (src/public-fetch.js).
import test from "node:test";
import assert from "node:assert/strict";
import { publicUrl, fetchPublic } from "../src/public-fetch.js";

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
