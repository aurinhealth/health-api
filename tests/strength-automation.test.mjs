import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serverSource } from "./helpers/server-source.mjs";

// The deploy smoke test posts preview:true to /automation/strength on live:
// it must get a built plan back and never write one or be skipped.
test("the strength automation previews without writing when the deploy smoke test asks", () => {
  const entry = serverSource();
  const deploy = readFileSync(new URL("../.github/workflows/deploy-worker.yml", import.meta.url), "utf8");
  assert.match(deploy, /\\"preview\\":true/);
  assert.match(entry, /const skip = preview \? null : await nightlyGymSkip\(env\.DB, date\);/);
  assert.match(entry, /preview \? \{ date, preview: true, action: "generate" \} : \{ date, preview: false, action: "generate", nightly: true \}/);
});
