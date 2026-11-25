import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { consentStatus, saveConsent } from "../src/consent.js";
import { productNewsEmail, unsubscribeLink, handleUnsubscribe } from "../src/product-emails.js";

const migration = readFileSync(new URL("../migrations/0013_cookbook_and_consents.sql", import.meta.url), "utf8");
const ENV = { SESSION_SECRET: "s".repeat(32), APP_ORIGIN: "https://staging.aurin.health" };

test("every product news e-mail is marked commercial and carries its unsubscribe link", () => {
  for (const lang of ["cs", "en"]) {
    const mail = productNewsEmail(lang, { subject: "New\nfeature", paragraphs: ["Hi <b>"], unsubscribe: "https://x/email/unsubscribe/2/abc" });
    assert.match(mail.subject, lang === "cs" ? /^Obchodní sdělení/ : /^A commercial message/);
    assert.doesNotMatch(mail.subject, /\n/);
    assert.match(mail.text, /https:\/\/x\/email\/unsubscribe\/2\/abc/);
    assert.match(mail.html, /href="https:\/\/x\/email\/unsubscribe\/2\/abc"/);
    assert.match(mail.html, /Hi &lt;b&gt;/);
    assert.equal(mail.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  }
  assert.throws(() => productNewsEmail("cs", { subject: "x", paragraphs: [] }));
});

test("the signed link unsubscribes on POST only, a forged one does nothing", async () => {
  const raw = createD1(); raw.sqlite.exec(migration);
  const env = { ...ENV, DB: raw };
  const userEnv = { DB: scopedDb(raw, 2), USER_ID: 2 };
  await saveConsent(userEnv, { health: true, productEmails: true });
  const link = await unsubscribeLink(env, 2);
  const url = new URL(link);
  const opts = { userExists: async id => id === 2 };
  assert.equal((await handleUnsubscribe(new Request(link), env, url, opts)).status, 200);
  assert.equal((await consentStatus(userEnv)).productEmails, true, "opening the link alone keeps the choice");
  const forged = new URL(link.replace(/\/[^/]+$/, "/" + "A".repeat(43)));
  assert.equal((await handleUnsubscribe(new Request(forged, { method: "POST" }), env, forged, opts)).status, 404);
  assert.equal((await consentStatus(userEnv)).productEmails, true);
  const done = await handleUnsubscribe(new Request(link, { method: "POST", body: "List-Unsubscribe=One-Click" }), env, url, opts);
  assert.equal(done.status, 200);
  assert.equal((await consentStatus(userEnv)).productEmails, false);
});
