import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";
import { consentStatus, saveConsent, CONSENT_VERSION } from "../src/consent.js";
import { assertAIAccess, subscriptionStatus } from "../src/subscription.js";

const migration = readFileSync(new URL("../migrations/0013_cookbook_and_consents.sql", import.meta.url), "utf8");
function setup({ owner = false } = {}) {
  const raw = createD1();
  raw.sqlite.exec(migration);
  return { raw, env: { DB: scopedDb(raw, 2), USER_ID: 2, USER_IS_OWNER: owner, CONSENT_REQUIRED: true } };
}

test("nothing is allowed before the user consents", async () => {
  const { env } = setup();
  const status = await consentStatus(env);
  assert.equal(status.needed, true);
  assert.equal(status.health, null);
  assert.equal(status.aiAllowed, false);
});

test("health consent is recorded with its version; AI stays off unless chosen", async () => {
  const { raw, env } = setup();
  const { consent } = await saveConsent(env, { health: true, ai: false });
  assert.equal(consent.needed, false);
  assert.equal(consent.health.version, CONSENT_VERSION);
  assert.ok(Date.parse(consent.health.grantedAt));
  assert.equal(consent.aiAllowed, false);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) n FROM user_consents WHERE user_id=2 AND kind='health'").get().n, 1);
});

test("AI consent can be given and taken back; the withdrawal is kept", async () => {
  const { raw, env } = setup();
  await saveConsent(env, { health: true });
  assert.equal((await saveConsent(env, { ai: true })).consent.aiAllowed, true);
  assert.equal((await saveConsent(env, { ai: false })).consent.aiAllowed, false);
  assert.ok(raw.sqlite.prepare("SELECT withdrawn_at FROM user_consents WHERE user_id=2 AND kind='ai'").get().withdrawn_at);
  assert.equal((await saveConsent(env, { ai: true })).consent.aiAllowed, true);
});

test("health consent cannot be refused here, and AI needs it first", async () => {
  const { env } = setup();
  await assert.rejects(saveConsent(env, { ai: true }), /Nejdřív/);
  await assert.rejects(saveConsent(env, { health: false }), /smazáním účtu/);
  await assert.rejects(saveConsent(env, {}), /Chybí/);
});

test("an older version of the health text asks again", async () => {
  const { raw, env } = setup();
  raw.sqlite.exec("INSERT INTO user_consents VALUES (2,'health','2020-01-01','2020-01-01T00:00:00Z',NULL)");
  const status = await consentStatus(env);
  assert.equal(status.needed, true);
  assert.equal(status.health.version, "2020-01-01");
});

test("AI for a user runs only with their AI consent; the owner's until he turns it off", async () => {
  const { env } = setup();
  await saveConsent(env, { health: true });
  await assert.rejects(assertAIAccess(env), e => e.status === 403 && e.consent === true);
  assert.equal((await subscriptionStatus(env)).aiAccess, false);
  await saveConsent(env, { ai: true });
  await assertAIAccess(env);
  const owner = setup({ owner: true }).env;
  await assertAIAccess(owner);
  await saveConsent(owner, { health: true, ai: false });
  await assert.rejects(assertAIAccess(owner), e => e.consent === true);
});

test("the owner is not asked; he runs the app", async () => {
  const { env } = setup({ owner: true });
  const status = await consentStatus(env);
  assert.equal(status.needed, false);
  assert.equal(status.aiAllowed, true);
});

test("consents are personal data: exported and deleted with the account", () => {
  assert.ok("user_consents" in PERSONAL_TABLES);
});

test("the app asks before it loads anything, and the AI features ask on first use", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  // A new account answers in the setup guide; one set up earlier gets the consent screen once.
  assert.match(client, /loadAccount\(\)\.then\(async me=>\{if\(me\.consent\?\.needed&&me\.onboarding\?\.completed\)\{forgetDashboard\(\);await showConsentGate\(me\);/);
  assert.match(client, /askConsent=Boolean\(accountConsent\?\.needed\)&&!edit/);
  assert.match(client, /if\(!edit&&!askConsent&&setup\.baseline\.ready\)return finish\(\)/);
  assert.match(client, /if\(s\.aiConsent===false\)\{if\(!\(await askAiConsent\(\)\)\)throw/);
  assert.match(entry, /url\.pathname==='\/app\/api\/consent'&&request\.method==='POST'[\s\S]{0,300}request\.headers\.get\('Origin'\)!==url\.origin/);
});
