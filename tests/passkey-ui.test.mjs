import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dashboardPage } from "../src/dashboard.js";
import { signInButtons, signInButtonsCss } from "../src/sign-in-buttons.js";
import { privacyPage, supportPage } from "../src/site-pages.js";
import { EN, EN_TEMPLATES } from "../src/i18n-en.js";

const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
const template = html => html.match(/<template id="signInButtons">([\s\S]*?)<\/template>/)[1];

test("the sign-in screen offers a passkey always and the e-mail code only once e-mail is set up", async () => {
  const plain = template(await dashboardPage().text());
  assert.match(plain, /<button class="sign-in-btn sign-in-passkey" type="button" id="passkeySignIn" data-for="signin" hidden>/);
  assert.doesNotMatch(plain, /emailStartForm/);
  assert.match(plain, /id="loginStatus"[^>]*role="status"/);
  const withEmail = template(await dashboardPage({ signIn: { email: true } }).text());
  assert.match(withEmail, /<form id="emailStartForm"[\s\S]*<input id="loginEmail" type="email" autocomplete="username webauthn"/);
  // Both tabs share the buttons; each shows its own words.
  assert.match(withEmail, /<span data-for="signin">Přihlásit se přes Google<\/span><span data-for="register">Zaregistrovat se přes Google<\/span>/);
  assert.match(signInButtonsCss, /\.login-card:not\(\[data-mode="register"\]\) \[data-for="register"\],\.login-card\[data-mode="register"\] \[data-for="signin"\]\{display:none!important\}/);
  assert.match(withEmail, /<form id="emailCodeForm" class="email-code" novalidate hidden>/);
  assert.match(withEmail, /id="loginCode" type="text" inputmode="numeric" autocomplete="one-time-code"/);
  // A hidden element must stay hidden even where the class sets display.
  assert.match(signInButtonsCss, /\.login-card \[hidden\]\{display:none!important\}/);
  assert.match(signInButtons({ email: true }), /id="codeAddress" data-no-i18n/);
});

test("the client wires the passkey and code sign-in and keeps the app's own fetch out of it", () => {
  const gate = client.match(/function showLoginGate\(\)\{.*\}/)[0];
  assert.match(gate, /forgetAccount\(\);/);
  assert.match(gate, /installLoginGate\(\);\}$/);
  assert.match(client, /navigator\.credentials\.get\(\{publicKey:\{challenge:b64uBuf\(o\.challenge\),rpId:o\.rpId,timeout:o\.timeout,userVerification:o\.userVerification,allowCredentials:ids\.map\(id=>\(\{type:'public-key',id:b64uBuf\(id\)\}\)\)\}\}\)/);
  assert.match(client, /navigator\.credentials\.get\(\{mediation:'conditional',signal:ctl\.signal,/);
  assert.match(gate, /role="tablist"/);
  assert.match(client, /navigator\.credentials\.create\(\{publicKey:\{\.\.\.o,challenge:b64uBuf\(o\.challenge\),user:\{\.\.\.o\.user,id:b64uBuf\(o\.user\.id\)\}/);
  const authFetch = client.match(/async function authFetch\(.*\}/)[0];
  assert.doesNotMatch(authFetch, /jsonFetch|showLoginGate/);
  assert.match(client, /const d=await authFetch\('\/auth\/email\/verify',\{email:address,code:\$\('loginCode'\)\.value\}\);passkeyAutofill\?\.abort\(\);await offerPasskey\(\{created:Boolean\(d\.created\),email:address\}\);/);
  assert.match(client, /PublicKeyCredential\.isUserVerifyingPlatformAuthenticatorAvailable\(\)/);
  assert.match(client, /localStorage\.setItem\('lw-passkey-offer','no'\)/);
  assert.match(client, /\+passkeysHtml\(me\.passkeys\)\+appleSignInHtml\(me\.apple\)/);
  assert.match(client, /signalAllAcceptedCredentials/);
  assert.match(client, /signalUnknownCredential/);
});

// The helpers that turn the browser's ArrayBuffers into what the server reads.
const helpers = new Function(client.match(/const b64uBuf=.*;\n/)[0] + client.match(/const bufB64u=.*;\n/)[0] + client.match(/function credentialJson\(c\)\{[\s\S]*?return o;\}\n/)[0] + "return {b64uBuf,bufB64u,credentialJson};")();

test("credentials go to the server as base64url, the way the server reads them", () => {
  const bytes = Uint8Array.from({ length: 40 }, (_, i) => (i * 37 + 250) & 255);
  const text = Buffer.from(bytes).toString("base64url");
  assert.equal(helpers.bufB64u(bytes.buffer), text);
  assert.deepEqual([...new Uint8Array(helpers.b64uBuf(text))], [...bytes]);
  const buf = value => new TextEncoder().encode(value).buffer;
  const created = helpers.credentialJson({ id: "aWQ", rawId: buf("id"), type: "public-key", authenticatorAttachment: "platform", response: { clientDataJSON: buf("{}"), attestationObject: buf("att"), getTransports: () => ["internal"] } });
  assert.deepEqual(created, { id: "aWQ", rawId: "aWQ", type: "public-key", authenticatorAttachment: "platform", response: { clientDataJSON: "e30", attestationObject: "YXR0", transports: ["internal"] }, clientExtensionResults: {} });
  const signed = helpers.credentialJson({ id: "aWQ", rawId: buf("id"), type: "public-key", response: { clientDataJSON: buf("{}"), authenticatorData: buf("ad"), signature: buf("sig"), userHandle: buf("user") } });
  assert.deepEqual(signed.response, { clientDataJSON: "e30", authenticatorData: "YWQ", signature: "c2ln", userHandle: "dXNlcg" });
  assert.equal(helpers.credentialJson({ id: "x", rawId: buf("x"), type: "public-key", response: { clientDataJSON: buf("{}"), authenticatorData: buf("a"), signature: buf("s"), userHandle: null } }).response.userHandle, null);
});

test("the server routes, cache and Settings know the passkeys", () => {
  assert.match(entry, /handlePasskeyLogin\(request, rawEnv, url\.pathname\)/);
  assert.match(entry, /handleEmailLogin\(request, rawEnv, url\.pathname, ctx\)/);
  assert.match(entry, /handlePasskeyApi\(request, env, url, session, ctx\)/);
  assert.match(entry, /passkeys\$\|passkeys\\\/options\$\)\/;/);
  assert.match(entry, /apple,passkeys,emailLogin:emailConfigured\(env\)\}/);
  assert.match(entry, /privacyPage\(request, \{ apple: appleConfigured\(env\), email: emailConfigured\(env\) \}\)/);
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

// String literals of a script, skipping comments and regular expressions.
function literals(source) {
  const out = [];
  let prev = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (/\s/.test(c)) continue;
    if (c === "/" && source[i + 1] === "/") { const end = source.indexOf("\n", i); i = end < 0 ? source.length : end; continue; }
    if (c === "/" && source[i + 1] === "*") { i = source.indexOf("*/", i + 2) + 1; continue; }
    if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev))) {
      let j = i + 1, inClass = false;
      for (; j < source.length; j++) { const d = source[j]; if (d === "\\") j++; else if (d === "[") inClass = true; else if (d === "]") inClass = false; else if (d === "/" && !inClass) break; }
      i = j; prev = "/"; continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1, value = "";
      while (j < source.length && source[j] !== c) { if (source[j] === "\\") j++; value += source[j++]; }
      out.push(value); i = j; prev = c; continue;
    }
    prev = c;
  }
  return out;
}
// What a literal puts on screen: the text outside tags and the attributes the translator reads.
const shown = value => !/[<>]/.test(value) ? [value] : [...[...value.matchAll(/(?:placeholder|title|aria-label|alt)="([^"]*)"/g)].map(m => m[1]), ...value.replace(/<[^>]*>|<[^>]*$|^[^<]*>/g, "\0").split("\0")];

test("every new sign-in text has an English translation", () => {
  const between = (from, to) => { const at = client.indexOf(from); assert.ok(at >= 0, from); return client.slice(at, client.indexOf(to, at)); };
  const scripts = [between("const b64uBuf=", "// Complete the saved profile"), between("const passkeyDate=", "// Your data: a download of everything"), between("function installAdmin(", "\n"), between("function emailChangeHtml(", "// Settings → Účet: the account's passkeys."), between("async function loadAdmin(", "\n"),
    readFileSync(new URL("../src/passkeys.js", import.meta.url), "utf8"), readFileSync(new URL("../src/email-login.js", import.meta.url), "utf8")];
  const czech = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
  const texts = [...scripts.flatMap(literals), signInButtons({ apple: true, email: true })].flatMap(shown).map(text => text.trim()).filter(text => czech.test(text));
  assert.ok(texts.length > 40, "the scan finds the texts");
  const missing = texts.filter(text => !(text in EN) && !(text.replace(/\$\{[^}]*\}|\d+(?:[.,:]\d+)*/g, "{n}") in EN_TEMPLATES));
  assert.deepEqual(missing, []);
});

test("the sign-in card fits a narrow phone and Settings buttons keep their size", async () => {
  // Without minmax(0,1fr) the e-mail field with its button widened the card past a 390 px screen.
  for (const selector of [".login-card", ".sign-in-buttons", ".email-code"]) assert.match(signInButtonsCss, new RegExp("\\" + selector + "\\{[^}]*grid-template-columns:minmax\\(0,1fr\\)"), selector);
  assert.match(signInButtonsCss, /\.email-code-row\{display:flex;flex-wrap:wrap;/);
  assert.doesNotMatch(signInButtonsCss, /\.sign-in-btn\{[^}]*white-space:nowrap/);
  assert.match(await dashboardPage().text(), /#accountCard \.metric-line>\.btn\{flex:none;align-self:center\}/);
});
