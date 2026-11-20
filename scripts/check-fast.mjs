// Before a push: CI's server checks (syntax, lint, tests) on only what the branch changed against
// origin/main, so they take seconds instead of a minute. The syntax check and the lint look at one file
// at a time, so checking the changed files catches the same errors. Tests run when they import a
// changed file (directly or through other files) or name it (a test that reads a workflow or a Swift
// file). CI still runs everything on the pull request and on main; this is a check before it.
//   node scripts/check-fast.mjs [base]        (base: origin/main)
// As a git hook before every push:   git config core.hooksPath .githooks
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, basename } from "node:path";

// A change here can break any test, so all of them run.
const EVERYTHING = ["package.json", "eslint.config.mjs", "scripts/require-private-prompts.mjs"];

// Relative imports of each .js/.mjs file in these folders: { "src/a.js": ["src/b.js", ...] }.
export function importGraph(root, dirs = ["src", "scripts", "tests"]) {
  const graph = {};
  const walk = dir => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== "fixtures") walk(path); continue; }
      if (!/\.m?js$/.test(entry.name)) continue;
      const text = readFileSync(join(root, path), "utf8");
      graph[path] = [...text.matchAll(/(?:from|import\()\s*["'](\.{1,2}\/[^"']+)["']/g)]
        .map(m => normalize(join(dirname(path), m[1])));
    }
  };
  for (const dir of dirs) if (existsSync(join(root, dir))) walk(dir);
  return graph;
}

// The test files to run for these changed paths, or "all".
export function testsFor(changed, graph, readText) {
  if (changed.some(path => EVERYTHING.includes(path))) return "all";
  const importers = {};
  for (const [file, deps] of Object.entries(graph)) for (const dep of deps) (importers[dep] ??= []).push(file);
  const affected = new Set(changed);
  const queue = [...changed];
  while (queue.length) for (const file of importers[queue.pop()] ?? []) if (!affected.has(file)) { affected.add(file); queue.push(file); }
  const tests = Object.keys(graph).filter(file => /^tests\/[^/]+\.test\.mjs$/.test(file));
  const names = changed.map(path => basename(path));
  const picked = tests.filter(test => affected.has(test) || (text => names.some(name => text.includes(name)))(readText(test)));
  // When most tests are picked anyway, the whole suite is just as quick and leaves nothing out.
  return picked.length > tests.length / 2 ? "all" : picked;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

function run(command, args) {
  console.log(`$ ${command} ${args.length > 6 ? `${args.slice(0, 6).join(" ")} … (${args.length})` : args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.argv[2] ?? "origin/main";
  const root = git("rev-parse", "--show-toplevel")[0];
  process.chdir(root);
  const changed = [...new Set([
    ...git("diff", "--name-only", `${base}...HEAD`),
    ...git("diff", "--name-only", "HEAD"),
    ...git("ls-files", "--others", "--exclude-standard"),
  ])];
  const present = changed.filter(path => existsSync(path));

  const js = present.filter(path => /^(src|scripts|tests)\/.*\.m?js$/.test(path));
  for (const path of js) if (!path.startsWith("tests/")) run("node", ["--check", path]);
  if (js.length) {
    if (!existsSync("node_modules/eslint")) { console.error("ESLint is missing: npm run lint:install"); process.exit(1); }
    run("npx", ["eslint", ...js]);
  }

  const tests = testsFor(changed, importGraph(root), path => readFileSync(path, "utf8"));
  if (tests === "all") run("npm", ["test"]);
  else if (tests.length) { run("node", ["scripts/require-private-prompts.mjs"]); run("node", ["--test", ...tests]); }

  console.log(`Checked ${changed.length} changed files: ${js.length} for syntax and lint, ${tests === "all" ? "all" : tests.length} test files.`);
  if (changed.some(path => path.startsWith("ios-native/"))) console.log("The iOS app is built and tested by CI (iOS native app) only.");
}
