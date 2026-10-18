import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { serverSource } from "./helpers/server-source.mjs";

// The deploy smoke test posts preview:true to /automation/strength on live:
// it must get a built plan back and never write one. Nothing else makes a gym
// plan without the athlete: the week plan's gym days are preferences.
test("the strength automation only previews, and nothing makes a gym plan at night", () => {
  const entry = serverSource();
  const deploy = readFileSync(new URL("../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
  assert.match(deploy, /\\"preview\\":true/);
  assert.match(entry, /if \(body\?\.preview !== true\) return Response\.json\(\{ status: "skipped"/);
  assert.match(entry, /body: JSON\.stringify\(\{ date, preview: true, diagnostic: true, action: "generate" \}\)/);
  // Only that check skips the athlete's status and a red morning; the app's own previews obey them.
  const gateway = readFileSync(new URL("../src/strength-gateway.js", import.meta.url), "utf8");
  assert.match(gateway, /diagnosticPreview: body\?\.preview === true && body\?\.diagnostic === true/);
  assert.match(entry, /delete body\.diagnostic;/);
  assert.doesNotMatch(entry, /nightly: true/);
  assert.equal(existsSync(new URL("../.github/workflows/health-strength.yml", import.meta.url)), false);
});
