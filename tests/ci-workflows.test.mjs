import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Security audit 2026-11-04, CI points 19, 20, 21, 25, 26 and 27.
const read = name => readFileSync(new URL("../.github/workflows/" + name, import.meta.url), "utf8");
const step = (workflow, name) => {
  const start = workflow.indexOf(`- name: ${name}\n`);
  assert.ok(start >= 0, name);
  const next = workflow.indexOf("\n      - name: ", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
};

test("both servers deploy only the tested commit, and only when it is on main", () => {
  const workflow = read("deploy-worker.yml");
  const deploy = workflow.slice(workflow.indexOf("\n  deploy:\n"));
  const check = step(deploy, "Check the commit is on main");
  assert.doesNotMatch(check, /\n {8}if:/, "the check runs for staging too");
  assert.match(check, /SHA: \$\{\{ needs\.test\.outputs\.sha \}\}/);
  assert.match(check, /compare\/main\.\.\.\$SHA/);
  // Before any code of the commit is checked out and before any secret is read.
  assert.ok(deploy.indexOf("Check the commit is on main") < deploy.indexOf("actions/checkout"));
  assert.ok(deploy.indexOf("Check the commit is on main") < deploy.indexOf("secrets."));
  assert.match(step(deploy, "Checkout repository"), /ref: \$\{\{ needs\.test\.outputs\.sha \}\}/);
  assert.match(step(deploy, "Check out the private AI prompts"), /ref: \$\{\{ needs\.test\.outputs\.prompts \}\}/);
  assert.match(workflow, /echo "sha=\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /echo "prompts=\$\(git -C src\/private rev-parse HEAD\)"/);
});

test("the App Store Connect key goes to the live server only", () => {
  assert.match(step(read("deploy-worker.yml"), "Hand the App Store Connect key to the server"), /\n {8}if: env\.TARGET == 'production'\n/);
});

test("the prompts token is never kept in a checkout", () => {
  for (const file of readdirSync(new URL("../.github/workflows/", import.meta.url))) {
    const workflow = read(file);
    for (const [block] of workflow.matchAll(/repository: aurinhealth\/aurin-prompts\n(?:.*\n)*? +path: src\/private\n.*\n/g))
      assert.match(block, /persist-credentials: false/, file);
  }
});

test("a pull request's run never counts as a build or check from main", () => {
  const vydat = read("vydat.yml");
  for (const name of ["ios-testflight.yml", "ios-native.yml"]) {
    const lookup = vydat.slice(vydat.indexOf(`--workflow ${name} --branch main`)).split("\n").slice(0, 3).join("\n");
    assert.match(lookup, /select\(\.event != "pull_request"\)/, name);
  }
  const notes = read("ios-testflight.yml");
  const base = notes.slice(notes.indexOf("--workflow ios-testflight.yml --branch main")).split("\n").slice(0, 2).join("\n");
  assert.match(base, /select\(\.event != "pull_request"\)/);
});
