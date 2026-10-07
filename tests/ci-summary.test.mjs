import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { summarize } from "../scripts/ci-summary.mjs";

test("a periodic sync prints counts per user, never the activities or events", () => {
  const response = {
    status: "ok",
    users: [
      { userId: 1, result: { status: "ok", source: "intervals.icu", activities: { activities_found: 3, activities_saved: 3, activities: [{ name: "Ranní jízda", average_heartrate: 142, icu_weight: 81.5 }] }, planned: { events_found: 2, events_saved: 2, events: [{ name: "Posilovna" }], reconciled_from: "2026-09-29" } } },
      { userId: 6, error: "Intervals.icu HTTP 401: " + "x".repeat(400) }
    ]
  };
  const summary = summarize(JSON.stringify(response));
  assert.equal(summary.split("\n")[0], "status=ok");
  assert.match(summary, /^user 1: status=ok, activities\.activities_found=3, activities\.activities_saved=3, planned\.events_found=2, planned\.events_saved=2$/m);
  assert.match(summary, /^user 6: error=Intervals\.icu HTTP 401: x+$/m);
  assert.ok(summary.length < 600);
  for (const data of ["Ranní jízda", "142", "81.5", "Posilovna", "2026-09-29"]) assert.ok(!summary.includes(data), data);
});

test("a generated plan prints its status, not the plan", () => {
  const summary = summarize(JSON.stringify({ status: "ok", preview: false, plan: { rows: [["Hlavní", "Dřep", 3, 100, 5]], rationale: "Únava po včerejší jízdě" }, rowsWritten: 12 }));
  assert.equal(summary, "status=ok");
});

test("an error keeps its message, shortened", () => {
  assert.equal(summarize(JSON.stringify({ status: "error", message: "m".repeat(500) })), "status=error, message=" + "m".repeat(200));
});

test("anything that is not a JSON object prints only its size or kind", () => {
  assert.equal(summarize("<html>Ranní jízda</html>"), "(not JSON, 24 bytes)");
  assert.equal(summarize("[1,2]"), "(array)");
  assert.equal(summarize("{}"), "(no status)");
});

// The repository is public and so are its Actions logs: a workflow may print a
// summary of a response, never the response itself.
test("no workflow prints a response body to the public log", () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  const leaks = [
    /printf\s+'%s\\n'\s+"\$\{?(body|response|result|plan)/,
    /echo\s+"\$\{?(body|response|result|plan)\b/,
    /\bcat\s+"?\$\{?\w*(body|response|result)/i,
    /head -c \d+\s+<<<|"\$(body|response)"\s*\|\s*head/,
    /assert [^;']*,\s*[dp]\s*[;']/,
    /"logs":/,
    /git (commit|push)/
  ];
  for (const file of readdirSync(dir).filter(f => f.endsWith(".yml"))) {
    const source = readFileSync(new URL(file, dir), "utf8");
    for (const leak of leaks) assert.doesNotMatch(source, leak, file);
    assert.doesNotMatch(source, /contents:\s*write/, file);
  }
});
