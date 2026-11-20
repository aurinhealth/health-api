import test from "node:test";
import assert from "node:assert/strict";
import { testsFor } from "../scripts/check-fast.mjs";

// A test runs when it imports a changed file, even through another file, or names it.
const graph = {
  "src/a.js": [], "src/b.js": ["src/a.js"], "src/c.js": [],
  "tests/helpers/day.mjs": ["src/b.js"],
  "tests/a.test.mjs": ["src/a.js"], "tests/b.test.mjs": ["tests/helpers/day.mjs"],
  "tests/c.test.mjs": ["src/c.js"], "tests/d.test.mjs": [], "tests/e.test.mjs": [],
};
const text = { "tests/d.test.mjs": "readFileSync('.github/workflows/vydat.yml')" };
const pick = changed => testsFor(changed, graph, path => text[path] ?? "");

test("a changed file runs the tests that import it, directly or through other files", () => {
  assert.deepEqual(pick(["src/a.js"]), ["tests/a.test.mjs", "tests/b.test.mjs"]);
  assert.deepEqual(pick(["src/c.js"]), ["tests/c.test.mjs"]);
});

test("a changed test runs itself, and a file a test only reads runs that test", () => {
  assert.deepEqual(pick(["tests/e.test.mjs"]), ["tests/e.test.mjs"]);
  assert.deepEqual(pick([".github/workflows/vydat.yml"]), ["tests/d.test.mjs"]);
});

test("package.json, the lint rules or most of the tests run the whole suite", () => {
  assert.equal(pick(["package.json"]), "all");
  assert.equal(pick(["eslint.config.mjs"]), "all");
  assert.equal(pick(["src/a.js", "src/c.js", "tests/e.test.mjs"]), "all");
});

test("a change outside the server runs no server test", () => {
  assert.deepEqual(pick(["ios-native/Aurin/App.swift"]), []);
});
