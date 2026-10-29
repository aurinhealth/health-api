import test from "node:test";
import assert from "node:assert/strict";
import { appOrigin, wwwRedirect, languageRedirect } from "../src/app-origin.js";
import { handleGoogleLogin } from "../src/google-login.js";
import { handleGoogleOAuth } from "../src/google-oauth.js";
import { handleIntervalsOAuth } from "../src/intervals-oauth.js";
import { overviewPage, privacyPage } from "../src/site-pages.js";

// aurin.health is the new home; aurin.health keeps working for older app builds and links.
const hosts = ["https://aurin.health", "https://aurin.health"];

test("OAuth callbacks go to aurin.health", () => {
  for (const origin of hosts) assert.equal(appOrigin({}, new Request(origin + "/auth/google")), origin);
  assert.equal(appOrigin({}, new Request("https://health-api.example.workers.dev/x")), "https://aurin.health");
  assert.equal(appOrigin({}, new Request("https://petrfitnessdata.eu/auth/google")), "https://aurin.health");
  assert.equal(appOrigin({}, null), "https://aurin.health");
  assert.equal(appOrigin({ APP_ORIGIN: "http://localhost:8787" }, new Request("https://aurin.health/")), "http://localhost:8787");
});

test("Google sign-in, Google Health and Intervals.icu send their callback to the same host", async () => {
  const env = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", SESSION_SECRET: "s", OWNER_EMAIL: "owner@example.com", DB: {}, USER_ID: 7, INTERVALS_CLIENT_ID: "icu", INTERVALS_CLIENT_SECRET: "icu-secret" };
  for (const origin of hosts) {
    const redirect = async response => new URL(response.headers.get("Location")).searchParams.get("redirect_uri");
    assert.equal(await redirect(await handleGoogleLogin(new Request(origin + "/auth/google?app=" + "a".repeat(43)), env, "/auth/google")), origin + "/auth/google/callback");
    assert.equal(await redirect(await handleGoogleOAuth(new Request(origin + "/oauth/google?consent=1"), env, "/oauth/google")), origin + "/oauth/google/callback");
    assert.equal(await redirect(await handleIntervalsOAuth(new Request(origin + "/oauth/intervals"), env, "/oauth/intervals")), origin + "/oauth/intervals/callback");
    // The token exchange repeats the same redirect_uri, as the provider requires.
    let sent = null;
    const fetchImpl = async (_url, init) => { sent = new URLSearchParams(init.body).get("redirect_uri"); return Response.json({}, { status: 400 }); };
    await handleIntervalsOAuth(new Request(origin + "/oauth/intervals/callback?code=c&state=s", { headers: { Cookie: "pfd_intervals_oauth_state=s.settings.7.v" } }), env, "/oauth/intervals/callback", fetchImpl);
    assert.equal(sent, origin + "/oauth/intervals/callback");
  }
});

test("www.aurin.health and the old petrfitnessdata.eu lead to aurin.health, other hosts pass", () => {
  const response = wwwRedirect(new URL("https://www.aurin.health/privacy?lang=en"));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("Location"), "https://aurin.health/privacy?lang=en");
  assert.equal(wwwRedirect(new URL("https://aurin.health/")), null);
  for (const old of ["https://petrfitnessdata.eu", "https://www.petrfitnessdata.eu"]) {
    const page = wwwRedirect(new URL(old + "/t/Ab3dEf7hJk?x=1"));
    assert.equal(page.status, 301);
    assert.equal(page.headers.get("Location"), "https://aurin.health/t/Ab3dEf7hJk?x=1");
    // A POST keeps its method and body on the way.
    assert.equal(wwwRedirect(new URL(old + "/app/api/sync"), "POST").status, 308);
  }
});

test("the public pages link to the host they are served on, aurin.health by default", async () => {
  for (const origin of hosts) {
    const html = await (await overviewPage(new Request(origin + "/"))).text();
    assert.match(html, new RegExp(`<meta property="og:image" content="${origin}/site/og-en\\.png\\?v=\\d+">`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${origin}/">`));
    assert.match(html, new RegExp(`<meta name="twitter:image" content="${origin}/site/og-en\\.png\\?v=\\d+">`));
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(ld['@graph'][0]['@type'], 'SoftwareApplication');
    assert.equal(ld['@graph'][0].url, origin);
    assert.match(html, new RegExp(`<link rel="canonical" href="${origin}/">`));
    const privacy = await (await privacyPage(new Request(origin + "/privacy"))).text();
    assert.match(privacy, new RegExp(`hreflang="cs" href="${origin}/cs/privacy"`));
  }
  assert.match(await overviewPage().text(), /content="https:\/\/aurin\.health\/site\/og-en\.png\?v=\d+"/);
  const unknown = await (await privacyPage(new Request("https://evil.example/privacy"))).text();
  assert.match(unknown, /<link rel="canonical" href="https:\/\/aurin\.health\/privacy">/);
});

test("?lang= leads to the address of that language; /cs to the English home page", () => {
  const to = path => languageRedirect(new URL("https://aurin.health" + path))?.headers.get("Location") ?? null;
  assert.equal(to("/privacy?lang=cs"), "https://aurin.health/cs/privacy");
  assert.equal(to("/terms?lang=cs"), "https://aurin.health/cs/terms");
  assert.equal(to("/privacy?lang=en"), "https://aurin.health/privacy");
  assert.equal(to("/cs"), "https://aurin.health/");
  assert.equal(to("/?lang=cs"), "https://aurin.health/");
  assert.equal(languageRedirect(new URL("https://aurin.health/privacy?lang=cs")).status, 301);
  for (const path of ["/", "/privacy", "/cs/privacy", "/t/abc?lang=cs", "/auth/email/verify?lang=cs"]) assert.equal(to(path), null, path);
  assert.equal(languageRedirect(new URL("https://aurin.health/privacy?lang=cs"), "POST"), null);
});
