// Proves the server checks still catch what they are for, on planted mistakes: the lint catches an
// undefined variable (eslint.config.mjs; one took down the week view in production) and the syntax
// check (npm run check) catches broken code. A rule that silently stops working fails here, not in
// production. Runs as part of npm run lint.
import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const failures = [];
const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });
for (const filePath of ["src/probe.js", "scripts/probe.mjs", "tests/probe.test.mjs"]) {
  const [result] = await eslint.lintText("export const total = sum + 1;\n", { filePath });
  if (!result.messages.some(m => m.ruleId === "no-undef" && m.severity === 2)) failures.push(`the lint no longer stops an undefined variable in ${filePath}`);
}

const dir = mkdtempSync(join(tmpdir(), "lint-probe-"));
const broken = join(dir, "broken.mjs");
writeFileSync(broken, "export function day( {\n");
if (spawnSync(process.execPath, ["--check", broken], { stdio: "ignore" }).status === 0) failures.push("node --check no longer stops broken syntax");
rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}
console.log("Probes: the lint and the syntax check still catch planted mistakes.");
