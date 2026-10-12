import test from "node:test";
import assert from "node:assert/strict";
import { privacyPage, supportPage } from "../src/site-pages.js";
import { serverSource } from "./helpers/server-source.mjs";

const entry = serverSource();

test("the server routes, cache and Settings know the passkeys", () => {
  assert.match(entry, /handlePasskeyLogin\(request, rawEnv, url\.pathname\)/);
  assert.match(entry, /handleEmailLogin\(request, rawEnv, url\.pathname, ctx\)/);
  assert.match(entry, /handlePasskeyApi\(request, env, url, session, ctx\)/);
  assert.match(entry, /passkeys\$\|passkeys\\\/options\$\)\/;/);
  assert.match(entry, /apple,passkeys,emailLogin:emailConfigured\(env\)\}/);
  assert.match(entry, /privacyPage\(request, \{ apple: true, email: emailConfigured\(env\) \}\)/);
});

test("the privacy policy and support page describe only the sign-in methods that exist", async () => {
  const visit = path => new Request("https://petrfitnessdata.eu" + path + "?lang=en");
  const plain = await privacyPage(visit("/privacy")).text();
  assert.match(plain, /<strong>Passkeys\.<\/strong>/);
  assert.match(plain, /You sign in with Google or a passkey,/);
  assert.doesNotMatch(plain, /Apple ID|Codes sent by email|Email Service/);
  assert.match(plain, /connections, passkeys and assistant history/);
  const all = await privacyPage(visit("/privacy"), { apple: true, email: true }).text();
  assert.match(all, /When you sign in with Apple/);
  assert.match(all, /<strong>Codes sent by email\.<\/strong>/);
  assert.match(all, /Its Email Service sends the sign-in codes/);
  assert.match(all, /You sign in with Google, a passkey or a one-time code sent to your email,/);
  const cs = await privacyPage(new Request("https://petrfitnessdata.eu/privacy?lang=cs"), { email: true }).text();
  assert.match(cs, /<strong>Přístupové klíče \(passkeys\)\.<\/strong>/);
  assert.match(cs, /<strong>Kódy e-mailem\.<\/strong>/);
  assert.doesNotMatch(cs, /Apple ID/);
  const support = await supportPage(visit("/support")).text();
  assert.match(support, /<h2>Passkeys<\/h2>/);
  assert.doesNotMatch(support, /Sign in with Apple|code by email/);
  assert.match(await supportPage(visit("/support"), { email: true }).text(), /“or with a code by email”/);
});
