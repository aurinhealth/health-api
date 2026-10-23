import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { secured, SECURITY_HEADERS } from "../src/web-security.js";

const ctx = { waitUntil() {} };
const app = {
  calls: [],
  async fetch(request) {
    this.calls.push(request.url);
    if (new URL(request.url).pathname === "/signin") return new Response("<h1>Loadwise</h1>", { headers: { "content-type": "text/html", "Referrer-Policy": "no-referrer" } });
    if (new URL(request.url).pathname === "/go") return Response.redirect("https://aurin.health/app", 302);
    return Response.json({ status: "ok" });
  },
  async scheduled(controller) { this.calls.push("cron " + controller.cron); }
};
const worker = secured(app);

test("every answer carries the security headers", async () => {
  const response = await worker.fetch(new Request("https://aurin.health/app/api/me"), {}, ctx);
  assert.deepEqual(await response.json(), { status: "ok" });
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers.get(name), value, name);
  assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
});

test("a header the app sets itself is kept", async () => {
  const response = await worker.fetch(new Request("https://aurin.health/signin"), {}, ctx);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(await response.text(), "<h1>Loadwise</h1>");
});

test("a redirect (immutable headers) gets them too", async () => {
  const response = await worker.fetch(new Request("https://aurin.health/go"), {}, ctx);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://aurin.health/app");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("plain HTTP goes to HTTPS without reaching the app", async () => {
  app.calls.length = 0;
  const page = await worker.fetch(new Request("http://aurin.health/app?lang=en"), {}, ctx);
  assert.equal(page.status, 301);
  assert.equal(page.headers.get("Location"), "https://aurin.health/app?lang=en");
  const post = await worker.fetch(new Request("http://aurin.health/app/api/sync", { method: "POST", body: "{}" }), {}, ctx);
  assert.equal(post.status, 308);
  assert.equal(post.headers.get("Location"), "https://aurin.health/app/api/sync");
  assert.deepEqual(app.calls, []);
});

test("local development stays on http", async () => {
  app.calls.length = 0;
  for (const url of ["http://localhost:8787/app", "http://127.0.0.1:8787/app", "http://[::1]:8787/app"]) {
    assert.equal((await worker.fetch(new Request(url), {}, ctx)).status, 200, url);
  }
  assert.equal(app.calls.length, 3);
});

test("cron jobs still reach the app", async () => {
  app.calls.length = 0;
  await worker.scheduled({ cron: "5 1 * * *" }, {}, ctx);
  assert.deepEqual(app.calls, ["cron 5 1 * * *"]);
});

test("Cloudflare runs the secured app", () => {
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(wrangler, /"main": "src\/main\.js"/);
  assert.match(main, /import app from "\.\/entrypoint\.js"/);
  assert.match(main, /export default secured\(webAppClosed\(app\)\)/);
});

test("JSON answers name UTF-8, so a Czech message opened in the browser reads right", async () => {
  const { withSecurityHeaders } = await import("../src/web-security.js");
  assert.equal(withSecurityHeaders(Response.json({ message: "Neplatný" })).headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(withSecurityHeaders(new Response("{}", { headers: { "Content-Type": "application/geo+json" } })).headers.get("Content-Type"), "application/geo+json");
});

test("the static files get the same headers (public/_headers)", () => {
  const file = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  const sent = Object.fromEntries(file.split("\n").filter(line => /^\s+\S+:/.test(line)).map(line => { const i = line.indexOf(":"); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
  assert.match(file, /^\/\*$/m, "for every path");
  assert.deepEqual(sent, SECURITY_HEADERS);
  assert.match(SECURITY_HEADERS["Strict-Transport-Security"], /includeSubDomains/);
  assert.match(SECURITY_HEADERS["Permissions-Policy"], /camera=\(\)/);
});
