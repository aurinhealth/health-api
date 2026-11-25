// Runs the coach evaluation on the test server (src/coach-eval.js) one
// situation after another and writes the replies with their checks: Markdown
// to the job summary (or stdout), JSON to coach-eval.json. Exits 1 when a
// safety check failed or a situation got no answer.
// COACH_EVAL_TOKEN: the workflow's GitHub token (audience aurin-coach-eval).
// In Actions a fresh one is asked for before every situation: a token lives
// only minutes and the whole run takes longer (run 19 lost L01–W03 to it).
// COACH_EVAL_HOST (staging.aurin.health), COACH_EVAL_SCENARIOS ("S02,S04") and
// COACH_EVAL_REPEAT (1–5 rounds of the same situations, to see whether a reply is stable) are optional.
import { appendFileSync, writeFileSync } from "node:fs";
import { scoreLines } from "./coach-eval-score.mjs";

const host = process.env.COACH_EVAL_HOST || "staging.aurin.health";
const { ACTIONS_ID_TOKEN_REQUEST_URL: oidcUrl, ACTIONS_ID_TOKEN_REQUEST_TOKEN: oidcAuth } = process.env;
if (!process.env.COACH_EVAL_TOKEN && !oidcUrl) { console.error("COACH_EVAL_TOKEN is missing."); process.exit(2); }
const wanted = String(process.env.COACH_EVAL_SCENARIOS || "").split(/[,\s]+/).filter(Boolean);
let rounds = Math.max(1, Math.min(5, Math.round(Number(process.env.COACH_EVAL_REPEAT) || 1)));

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
  // A page that is not JSON (Cloudflare's own error, e.g. "error code: 1102") keeps its first words (run 56).
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { json = { status: "error", message: `HTTP ${response.status} ${text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}`.trim() }; }
  if (!response.ok && json.status !== "error") json.status = "error";
  return json;
}

const list = await call({});
if (list.status !== "ok") { console.error("The test server refused the evaluation:", list.message || list.status); process.exit(2); }
// COACH_EVAL_CALIBRATE (luna, sol, both, haiku (Anthropic) or judge, the eval's judge): only the checker's calibration (coach-calibration.js), no coach answers.
const calibrate = String(process.env.COACH_EVAL_CALIBRATE || "").trim();
// rules: the rule judge (coach-judge.js) on Today texts with a known verdict.
if (calibrate === "rules") {
  const out = [];
  for (const id of list.judgeCalibration || []) { const r = await call({ judgeCalibrate: id }).catch(error => ({ id, status: "error", message: error.message })); r.id ??= id; out.push(r);
    console.log(r.status === "ok" ? `${id} ${r.correct ? "ok" : "CHYBA"} ${(r.failed || []).map(f => f.rule).join(",")}` : `${id} ${r.status}: ${r.message || ""}`); }
  const ok = out.filter(r => r.status === "ok"), faults = ok.filter(r => r.expect.length), clean = ok.filter(r => !r.expect.length);
  const usd = ok.reduce((sum, r) => sum + (r.usd || 0), 0), times = ok.map(r => r.ms).sort((a, b) => a - b);
  const lines = [`# Kalibrace AI rozhodčího, ${host}`, "", `Chytil porušení: ${faults.filter(r => r.correct).length}/${faults.length}`, `Falešné poplachy: ${clean.filter(r => !r.correct).length}/${clean.length}`,
    `Cena ${usd.toFixed(3)} USD, medián ${times.length ? (times[times.length >> 1] / 1000).toFixed(1) : "–"} s${out.length - ok.length ? `, chyb serveru ${out.length - ok.length}` : ""}`, "",
    ...ok.map(r => `- ${r.correct ? "✅" : "❌"} ${r.id} (${r.expect.length ? "čeká " + r.expect.join(" nebo ") : "bez porušení"}): ${r.text} ${r.advice}${(r.failed || []).map(f => `\n  - ${f.rule}: „${f.quote}“ (${f.why})`).join("")}`), ""];
  writeFileSync("coach-eval.json", JSON.stringify(out, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n"); else console.log(lines.join("\n"));
  process.exit(out.some(r => r.status !== "ok") ? 1 : 0);
}
if (calibrate) {
  const models = calibrate === "both" ? ["luna", "sol"] : [["sol", "judge", "haiku"].includes(calibrate) ? calibrate : "luna"], out = [], lines = [`# Kalibrace AI kontrolora, ${host}`, ""];
  for (const model of models) {
    const rows = [];
    for (const id of list.calibration || []) { const r = await call({ calibrate: id, model }).catch(error => ({ id, status: "error", message: error.message })); r.id ??= id; r.run = model; rows.push(r); out.push(r);
      console.log(r.status === "ok" ? `${model} ${id} ${r.correct ? "ok" : "CHYBA"} ${(r.flags || []).map(f => f.cat).join(",")}` : `${model} ${id} ${r.status}: ${r.message || ""}`); }
    const ok = rows.filter(r => r.status === "ok"), faults = ok.filter(r => r.expect === "flag"), clean = ok.filter(r => r.expect === "ok");
    const usd = ok.reduce((sum, r) => sum + (r.usd || 0), 0), times = ok.map(r => r.ms).sort((a, b) => a - b);
    lines.push(`## ${model}`, "", `Chytil chyb: ${faults.filter(r => r.correct).length}/${faults.length}`, `Falešné poplachy: ${clean.filter(r => !r.correct).length}/${clean.length}`,
      `Cena ${usd.toFixed(3)} USD, medián ${times.length ? (times[times.length >> 1] / 1000).toFixed(1) : "–"} s${rows.length - ok.length ? `, chyb serveru ${rows.length - ok.length}` : ""}`, "",
      ...ok.filter(r => !r.correct).map(r => `- ${r.id} (${r.persona}, ${r.expect === "flag" ? "nechytil" : "falešný poplach"}: ${r.why})${(r.flags || []).map(f => ` ${f.cat}: „${f.quote}“ (${f.why})`).join(";")}`), "");
  }
  writeFileSync("coach-eval.json", JSON.stringify(out, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n"); else console.log(lines.join("\n"));
  process.exit(out.some(r => r.status !== "ok") ? 1 : 0);
}
// Empty = every S, L, W and K situation; the personas only when named, or "P" for all of them (each is four answers).
const scenarios = list.scenarios.filter(s => wanted.length ? wanted.includes(s.id) || (s.turns && wanted.includes("P")) : !s.turns);
// A persona is four answers with a growing conversation: at most 2 rounds of them (critic 2026-11-14, 20 personas × 5 rounds would be 800 calls).
if (rounds > 2 && scenarios.some(s => s.turns)) { console.log(`Personas: ${rounds} rounds lowered to 2.`); rounds = 2; }
// COACH_EVAL_COACH (haiku or sonnet): the coach on Anthropic's Claude instead of OpenAI, to compare.
const coach = ["haiku", "sonnet"].includes(String(process.env.COACH_EVAL_COACH || "").trim()) ? { coach: String(process.env.COACH_EVAL_COACH).trim() } : {};
const results = [];
// Held-out situations (src/coach-eval.js isHoldout): the summary shows their scores and failed safety
// checks, never their answers or failed quality checks, so a prompt fix cannot be tuned on them.
const holdout = new Set(scenarios.filter(s => s.holdout).map(s => s.id));
const label = r => r.round ? `${r.id} (${r.round}/${rounds})` : r.id;
// A persona (P01–P20) is a conversation: each message goes with the coach's earlier answers.
for (let round = 1; round <= rounds; round++) for (const s of scenarios) {
  const conversation = [];
  for (let turn = 1; turn <= (s.turns || 1); turn++) {
    const result = await call(s.turns ? { id: s.id, turn, conversation, ...coach } : { id: s.id, ...coach }).catch(error => ({ id: s.id, title: s.title, status: "error", message: error.message }));
    // An error page knows no situation: keep its id, so the summary names it (run 56 printed "undefined").
    result.id ??= s.turns ? `${s.id}.${turn}` : s.id; result.title ??= s.title;
    if (rounds > 1) result.round = round;
    results.push(result);
    const failed = (result.checks || []).filter(c => !c.ok);
    const shown = holdout.has(result.id) ? failed.filter(c => c.severity === "safety") : failed;
    console.log(result.status === "ok" ? `${label(result)} ${result.model} ${Math.round(result.ms / 1000)} s${shown.length ? ", " + shown.map(c => c.name).join("; ") : ""}${shown.length < failed.length ? ", kontrolní sada: " + (failed.length - shown.length) + " kvalita" : ""}` : `${label(result)} ${result.status}: ${result.message || ""}`);
    if (result.status !== "ok") break;
    conversation.push({ role: "user", content: result.message }, { role: "assistant", content: result.historyNote || result.answer || "" });
  }
}

const mark = (r, severity) => { const list = (r.checks || []).filter(c => c.severity === severity); return list.length ? `${list.filter(c => c.ok).length}/${list.length}` : "–"; };
const quote = text => String(text || "").split("\n").map(line => "> " + line).join("\n");
const action = a => [a.type, a.kind, a.minutes ? a.minutes + " min" : "", a.date, a.eventId].filter(Boolean).join(" ");
const lines = [
  `# Coach evaluation, ${host}${coach.coach ? `, kouč ${coach.coach}` : ""}`, "",
  "| | Situace | Úloha | Model | s | Bezpečnost | Kvalita |", "|---|---|---|---|---|---|---|",
  ...results.map(r => `| ${r.status !== "ok" ? "⚠️" : r.passed ? "✅" : "❌"} ${label(r)} | ${r.title}${holdout.has(r.id) ? " (kontrolní)" : ""} | ${r.task || ""} | ${r.model || ""} | ${r.ms != null ? Math.round(r.ms / 1000) : ""} | ${mark(r, "safety")} | ${mark(r, "quality")} |`), ""
];
// The AI checker (coach-checker.js): what it cost and how long it took.
// What the run cost on OpenAI (the coach's answers and the checker).
const coachUsd = results.reduce((sum, r) => sum + (r.usd || 0), 0), checkerUsd = results.reduce((sum, r) => sum + (r.checker?.usd || 0), 0), judgeUsd = results.reduce((sum, r) => sum + (r.judge?.usd || 0), 0);
const coachTimes = results.filter(r => r.ms != null && r.task !== "checker").map(r => r.ms).sort((a, b) => a - b);
if (coachTimes.length) lines.push(`Kouč: ${coachTimes.length} odpovědí, ${(coachUsd / coachTimes.length).toFixed(4)} USD na odpověď, medián ${(coachTimes[coachTimes.length >> 1] / 1000).toFixed(1)} s`, "");
lines.push(`Cena běhu: kouč ${coachUsd.toFixed(2)} USD + kontrolor ${checkerUsd.toFixed(2)} USD + rozhodčí ${judgeUsd.toFixed(2)} USD = ${(coachUsd + checkerUsd + judgeUsd).toFixed(2)} USD`, "");
// How much of the capability map the situations cover, each sport on its own (coach-capabilities.js).
if (list.coverage) {
  const c = list.coverage, pct = p => `${p.covered}/${p.total} (${Math.round(100 * p.covered / p.total)} %)`;
  lines.push("## Mapa schopností", "", `Celkem ${pct(c.total)}: ${Object.entries(c.bySport).map(([sport, p]) => `${sport} ${pct(p)}`).join(", ")}`, "", `Bez scénáře: ${c.gaps.join(", ") || "nic"}`, "");
}
const checked = results.filter(r => r.checker?.ms != null), times = checked.map(r => r.checker.ms).sort((a, b) => a - b);
if (checked.length) lines.push(`AI kontrolor: ${checked.length} odpovědí, ${checked.reduce((sum, r) => sum + (r.checker.usd || 0), 0).toFixed(3)} USD, medián ${(times[times.length >> 1] / 1000).toFixed(1)} s`, "");
// The rule judge (coach-judge.js): per rule, how many texts kept it, broke it or had no such rule.
const judged = results.filter(r => r.judge && !r.judge.error);
if (judged.length) {
  const labels = { NUMBERS: "Počet čísel", FACTS: "Fakta podle dat", LENGTH: "Délka", SAFETY: "Bezpečnost", TONE: "Tón a jazyk", RULES: "Ostatní pravidla" };
  const count = (rule, verdict) => judged.filter(r => r.judge.rules.some(x => x.rule === rule && x.verdict === verdict)).length;
  const jt = judged.map(r => r.judge.ms).sort((a, b) => a - b);
  lines.push("## AI rozhodčí po pravidlech", "", `${judged.length} textů, ${judgeUsd.toFixed(3)} USD, medián ${(jt[jt.length >> 1] / 1000).toFixed(1)} s${results.some(r => r.judge?.error) ? `, selhal u ${results.filter(r => r.judge?.error).length}` : ""}`, "",
    "| Pravidlo | Prošlo | Porušeno | Netýká se |", "|---|---|---|---|", ...Object.entries(labels).map(([rule, name]) => `| ${name} | ${count(rule, "pass")} | ${count(rule, "fail")} | ${count(rule, "na")} |`), "");
}
// Failed quality checks do not fail a situation, so they are listed on their own (Petr, run 39).
const weak = results.flatMap(r => (r.checks || []).filter(c => !c.ok && c.severity === "quality").map(c => holdout.has(r.id) ? `- ${label(r)}, kontrolní sada` : `- ${label(r)}, ${c.name}${c.detail ? ` (${c.detail})` : ""}`));
lines.push(...scoreLines(results, holdout));
lines.push("## Neprošlé kontroly kvality", "", ...(weak.length ? weak : ["Žádné."]), "");
// Stable = every check passed in every round (Petr 2026-11-06: a fail that passes on a rerun is still a flaw).
if (rounds > 1) {
  const clean = r => r.status === "ok" && (r.checks || []).every(c => c.ok);
  lines.push(`## Stabilita: všechny kontroly v ${rounds} kolech`, "", ...scenarios.map(s => { const all = results.filter(r => r.id === s.id || r.id.startsWith(s.id + ".")), ok = all.filter(clean).length; return `- ${ok === all.length ? "✅" : "❌"} ${s.id} ${ok}/${all.length}`; }), "");
}
for (const r of results) {
  lines.push(`## ${label(r)}, ${r.title}`, "");
  if (r.status !== "ok") { lines.push(`⚠️ ${r.status}: ${r.message || ""}`, ""); continue; }
  if (holdout.has(r.id)) { lines.push("Kontrolní sada: odpověď je jen v artefaktu coach-eval.", "", ...r.checks.filter(c => !c.ok && c.severity === "safety").map(c => `- ❌ ${c.name}${c.detail ? ` (${c.detail})` : ""}`), ""); continue; }
  lines.push(`**Sportovec:** ${r.message}`, "", quote(r.answer), "");
  if ((r.proposed || []).length) lines.push(`**Akce:** navrženo ${r.proposed.map(action).join(", ")}, prošlo ${r.kept.length ? r.kept.map(action).join(", ") : "nic"}`, "");
  const failed = r.checks.filter(c => !c.ok);
  if (failed.length) lines.push(...failed.map(c => `- ${c.severity === "safety" ? "❌" : "⚠️"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`), "");
}
const markdown = lines.join("\n");
writeFileSync("coach-eval.json", JSON.stringify(results, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
else console.log("\n" + markdown);

const broken = results.filter(r => r.status !== "ok" || !r.passed);
if (broken.length) { console.error(`Failed: ${broken.map(r => r.id).join(", ")}`); process.exit(1); }
