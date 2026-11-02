// Runs the coach evaluation on the test server (src/coach-eval.js) one
// situation after another and writes the replies with their checks: Markdown
// to the job summary (or stdout), JSON to coach-eval.json. Exits 1 when a
// safety check failed or a situation got no answer.
// COACH_EVAL_TOKEN: the workflow's GitHub token (audience aurin-coach-eval).
// In Actions a fresh one is asked for before every situation: a token lives
// only minutes and the whole run takes longer (run 19 lost L01–W03 to it).
// COACH_EVAL_HOST (staging.aurin.health) and COACH_EVAL_SCENARIOS ("S02,S04") are optional.
import { appendFileSync, writeFileSync } from "node:fs";

const host = process.env.COACH_EVAL_HOST || "staging.aurin.health";
const { ACTIONS_ID_TOKEN_REQUEST_URL: oidcUrl, ACTIONS_ID_TOKEN_REQUEST_TOKEN: oidcAuth } = process.env;
if (!process.env.COACH_EVAL_TOKEN && !oidcUrl) { console.error("COACH_EVAL_TOKEN is missing."); process.exit(2); }
const wanted = String(process.env.COACH_EVAL_SCENARIOS || "").split(/[,\s]+/).filter(Boolean);

async function token() {
  if (!oidcUrl || !oidcAuth) return process.env.COACH_EVAL_TOKEN;
  const response = await fetch(`${oidcUrl}&audience=aurin-coach-eval`, { headers: { Authorization: `bearer ${oidcAuth}` } });
  if (!response.ok) throw new Error(`OIDC token: HTTP ${response.status}`);
  return (await response.json()).value;
}

async function call(body) {
  const response = await fetch(`https://${host}/automation/coach-eval`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6 * 60 * 1000)
  });
  const json = await response.json().catch(() => ({ status: "error", message: `HTTP ${response.status}` }));
  if (!response.ok && json.status !== "error") json.status = "error";
  return json;
}

const list = await call({});
if (list.status !== "ok") { console.error("The test server refused the evaluation:", list.message || list.status); process.exit(2); }
const scenarios = list.scenarios.filter(s => !wanted.length || wanted.includes(s.id));
const results = [];
for (const s of scenarios) {
  const result = await call({ id: s.id }).catch(error => ({ id: s.id, title: s.title, status: "error", message: error.message }));
  results.push(result);
  const failed = (result.checks || []).filter(c => !c.ok);
  console.log(result.status === "ok" ? `${s.id} ${result.model} ${Math.round(result.ms / 1000)} s${failed.length ? " · " + failed.map(c => c.name).join("; ") : ""}` : `${s.id} ${result.status}: ${result.message || ""}`);
}

const mark = (r, severity) => { const list = (r.checks || []).filter(c => c.severity === severity); return list.length ? `${list.filter(c => c.ok).length}/${list.length}` : "–"; };
const quote = text => String(text || "").split("\n").map(line => "> " + line).join("\n");
const action = a => [a.type, a.kind, a.minutes ? a.minutes + " min" : "", a.date, a.eventId].filter(Boolean).join(" ");
const lines = [
  `# Coach evaluation · ${host}`, "",
  "| | Situace | Úloha | Model | s | Bezpečnost | Kvalita |", "|---|---|---|---|---|---|---|",
  ...results.map(r => `| ${r.status !== "ok" ? "⚠️" : r.passed ? "✅" : "❌"} ${r.id} | ${r.title} | ${r.task || ""} | ${r.model || ""} | ${r.ms != null ? Math.round(r.ms / 1000) : ""} | ${mark(r, "safety")} | ${mark(r, "quality")} |`), ""
];
// Failed quality checks do not fail a situation, so they are listed on their own (Petr, run 39).
const weak = results.flatMap(r => (r.checks || []).filter(c => !c.ok && c.severity === "quality").map(c => `- ${r.id} · ${c.name}${c.detail ? ` (${c.detail})` : ""}`));
lines.push("## Neprošlé kontroly kvality", "", ...(weak.length ? weak : ["Žádné."]), "");
for (const r of results) {
  lines.push(`## ${r.id} · ${r.title}`, "");
  if (r.status !== "ok") { lines.push(`⚠️ ${r.status}: ${r.message || ""}`, ""); continue; }
  lines.push(`**Sportovec:** ${r.message}`, "", quote(r.answer), "");
  if ((r.proposed || []).length) lines.push(`**Akce:** navrženo ${r.proposed.map(action).join(", ")} · prošlo ${r.kept.length ? r.kept.map(action).join(", ") : "nic"}`, "");
  const failed = r.checks.filter(c => !c.ok);
  if (failed.length) lines.push(...failed.map(c => `- ${c.severity === "safety" ? "❌" : "⚠️"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`), "");
}
const markdown = lines.join("\n");
writeFileSync("coach-eval.json", JSON.stringify(results, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
else console.log("\n" + markdown);

const broken = results.filter(r => r.status !== "ok" || !r.passed);
if (broken.length) { console.error(`Failed: ${broken.map(r => r.id).join(", ")}`); process.exit(1); }
