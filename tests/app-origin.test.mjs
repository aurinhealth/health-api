import test from "node:test";
import assert from "node:assert/strict";
import { appOrigin, wwwRedirect } from "../src/app-origin.js";
import { handleGoogleLogin } from "../src/google-login.js";
import { handleGoogleOAuth } from "../src/google-oauth.js";
import { handleIntervalsOAuth } from "../src/intervals-oauth.js";
import { overviewPage, privacyPage } from "../src/site-pages.js";

// aurin.health is the new home; petrfitnessdata.eu keeps working for older app builds and links.
const hosts = ["https://aurin.health", "https://petrfitnessdata.eu"];

test("OAuth callbacks stay on the host the request came to", () => {
  for (const origin of hosts) assert.equal(appOrigin({}, new Request(origin + "/auth/google")), origin);
  assert.equal(appOrigin({}, new Request("https://health-api.example.workers.dev/x")), "https://petrfitnessdata.eu");
  assert.equal(appOrigin({}, null), "https://petrfitnessdata.eu");
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
    await handleIntervalsOAuth(new Request(origin + "/oauth/intervals/callback?code=c&state=s", { headers: { Cookie: "pfd_intervals_oauth_state=s.settings.7" } }), env, "/oauth/intervals/callback", fetchImpl);
    assert.equal(sent, origin + "/oauth/intervals/callback");
  }
});

test("www.aurin.health leads to aurin.health, other hosts pass", () => {
  const response = wwwRedirect(new URL("https://www.aurin.health/privacy?lang=en"));
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("Location"), "https://aurin.health/privacy?lang=en");
  assert.equal(wwwRedirect(new URL("https://aurin.health/")), null);
  assert.equal(wwwRedirect(new URL("https://petrfitnessdata.eu/")), null);
});

test("the public pages link to the host they are served on, aurin.health by default", async () => {
  for (const origin of hosts) {
    const html = await (await overviewPage(new Request(origin + "/"))).text();
    assert.match(html, new RegExp(`<meta property="og:image" content="${origin}/site/og-en\\.png">`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${origin}/">`));
    assert.match(html, new RegExp(`<meta name="twitter:image" content="${origin}/site/og-en\\.png">`));
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(ld['@graph'][0]['@type'], 'SoftwareApplication');
    assert.equal(ld['@graph'][0].url, origin);
    assert.match(html, new RegExp(`<link rel="canonical" href="${origin}/">`));
    const privacy = await (await privacyPage(new Request(origin + "/privacy"))).text();
    assert.match(privacy, new RegExp(`hreflang="cs" href="${origin}/privacy\\?lang=cs"`));
  }
  assert.match(await overviewPage().text(), /content="https:\/\/aurin\.health\/site\/og-en\.png"/);
  const unknown = await (await privacyPage(new Request("https://evil.example/privacy"))).text();
  assert.match(unknown, /<link rel="canonical" href="https:\/\/aurin\.health\/privacy">/);
});
