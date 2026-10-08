import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dashboardPage } from "../src/dashboard.js";
import { signInButtonsCss } from "../src/sign-in-buttons.js";

const template = html => html.match(/<template id="signInButtons">([\s\S]*?)<\/template>/)[1];

test("the sign-in screen shows Google's button, and Apple's only once Apple is set up", async () => {
  const google = template(await dashboardPage().text());
  assert.match(google, /href="\/auth\/google"/);
  assert.match(google, /Přihlásit se přes Google/);
  assert.doesNotMatch(google, /\/auth\/apple/);
  const both = template(await dashboardPage({ signIn: { apple: true } }).text());
  assert.match(both, /href="\/auth\/apple"[\s\S]*Přihlásit se přes Apple/);
});

test("the buttons use Google's and Apple's own colours in both themes", () => {
  // Google: #131314 with a #8E918F border on dark, white with #747775 on light; Apple: white on dark, black on light.
  assert.match(signInButtonsCss, /\.sign-in-google\{[^}]*background:#131314;color:#e3e3e3;border-color:#8e918f\}/);
  assert.match(signInButtonsCss, /:root\[data-theme="light"\] \.sign-in-google\{background:#fff;color:#1f1f1f;border-color:#747775\}/);
  assert.match(signInButtonsCss, /:root:not\(\[data-theme="dark"\]\) \.sign-in-apple\{background:#000;color:#fff;border-color:#000\}/);
});

test("the sign-in screen links the terms and the privacy policy", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const gate = client.match(/function showLoginGate\(\)\{.*\}/)[0];
  assert.match(gate, /\$\("signInButtons"\)\?\.innerHTML/);
  assert.match(gate, /href="\/terms"/);
  assert.match(gate, /href="\/privacy"/);
});
