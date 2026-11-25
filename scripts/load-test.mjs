// Load test of the test server (src/load-test.js): opens LOAD_TEST_ACCOUNTS made-up accounts
// with the sample athlete, then sends bursts of app opens at the same moment (an Apple Health
// upload, then the screens the app loads together) and measures time, errors and the D1 work
// each answer reports in Server-Timing. Deletes the accounts at the end, also after a failure.
// Only staging.aurin.health; the sessions never leave this process (the logs are public).
// LOAD_TEST_ACCOUNTS (1–50, default 40), LOAD_TEST_BURSTS ("10,20,40,80,120" app opens at once),
// LOAD_TEST_ROUNDS (rounds of each burst, default 3).
import { appendFileSync, writeFileSync } from "node:fs";

const host = "staging.aurin.health", origin = `https://${host}`;
const { ACTIONS_ID_TOKEN_REQUEST_URL: oidcUrl, ACTIONS_ID_TOKEN_REQUEST_TOKEN: oidcAuth } = process.env;
const accounts = Math.max(1, Math.min(50, Math.round(Number(process.env.LOAD_TEST_ACCOUNTS) || 40)));
const bursts = String(process.env.LOAD_TEST_BURSTS || "10,20,40,80,120").split(/[,\s]+/).map(Number).filter(n => n > 0 && n <= 200);
const rounds = Math.max(1, Math.min(5, Math.round(Number(process.env.LOAD_TEST_ROUNDS) || 3)));
const SCREENS = ["/app/api/me", "/app/api/today", "/app/api/athlete-state", "/app/api/training", "/app/api/food-today", "/app/api/week", "/app/api/connections"];

async function token() {
  if (!oidcUrl || !oidcAuth) return process.env.LOAD_TEST_TOKEN;
  const response = await fetch(`${oidcUrl}&audience=aurin-load-test`, { headers: { Authorization: `bearer ${oidcAuth}` } });
  if (!response.ok) throw new Error(`OIDC token: HTTP ${response.status}`);
  return (await response.json()).value;
}
async function automation(body) {
  const response = await fetch(`${origin}/automation/load-test`, { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10 * 60 * 1000) });
  const json = await response.json().catch(() => ({ status: "error", message: `HTTP ${response.status}` }));
  if (!response.ok || json.status !== "ok") throw new Error(json.message || `HTTP ${response.status}`);
  return json;
}

// "app;dur=812, db;dur=640;desc=\"23 queries, 1180 rows read\"" -> numbers.
export function parseTiming(header) {
  const text = String(header || ""), num = re => Number((text.match(re) || [])[1]) || 0;
  return { appMs: num(/app;dur=(\d+)/), dbMs: num(/db;dur=(\d+)/), queries: num(/(\d+) queries/), rows: num(/(\d+) rows read/) };
}

async function request(phase, cookie, path, init = {}) {
  const started = Date.now();
  try {
    const response = await fetch(origin + path, { ...init, headers: { Cookie: cookie, Origin: origin, ...(init.headers || {}) }, signal: AbortSignal.timeout(60 * 1000) });
    await response.arrayBuffer();
    return { phase, path: (init.method || "GET") + " " + path, status: response.status, ms: Date.now() - started, ...parseTiming(response.headers.get("Server-Timing")) };
  } catch (error) { return { phase, path: (init.method || "GET") + " " + path, status: error.name === "TimeoutError" ? "timeout" : "network", ms: Date.now() - started }; }
}

// One app open: the Apple Health upload of the last two days (the server's sample, prepare), then the screens together.
let uploadBody = "{}";
async function appOpen(phase, cookie) {
  const upload = await request(phase, cookie, "/app/api/health/apple", { method: "POST", headers: { "Content-Type": "application/json" }, body: uploadBody });
  const screens = await Promise.all(SCREENS.map(path => request(phase, cookie, path)));
  return [upload, ...screens, { phase, path: "app open (all)", status: [upload, ...screens].every(r => r.status === 200) ? 200 : "error", ms: Math.max(...screens.map(r => r.ms)) + upload.ms }];
}

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
export function summary(results) {
  const lines = [];
  for (const phase of [...new Set(results.map(r => r.phase))]) {
    const rows = results.filter(r => r.phase === phase);
    lines.push(`## ${phase}`, "", "| Požadavek | Počet | Chyby | p50 ms | p95 ms | max ms | D1 dotazů | D1 řádků | D1 ms |", "|---|---|---|---|---|---|---|---|---|");
    for (const path of [...new Set(rows.map(r => r.path))]) {
      const list = rows.filter(r => r.path === path), ms = list.map(r => r.ms).sort((a, b) => a - b), errors = list.filter(r => r.status !== 200);
      const codes = [...new Set(errors.map(r => r.status))].map(code => `${code}×${errors.filter(r => r.status === code).length}`).join(" ");
      lines.push(`| ${path} | ${list.length} | ${codes || 0} | ${pct(ms, 0.5)} | ${pct(ms, 0.95)} | ${ms[ms.length - 1]} | ${avg(list.map(r => r.queries || 0))} | ${avg(list.map(r => r.rows || 0))} | ${avg(list.map(r => r.dbMs || 0))} |`);
    }
    lines.push("");
  }
  return lines;
}

if (process.argv[1]?.endsWith("load-test.mjs")) {
  const results = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let failed = null;
  try {
    const { sessions, upload } = await automation({ prepare: accounts });
    uploadBody = JSON.stringify(upload);
    console.log(`${sessions.length} accounts ready.`);
    // The first open of each account writes its six weeks of sample (review-sample.js), all at once.
    for (const r of await Promise.all(sessions.map(cookie => request(`První otevření, ${sessions.length} účtů najednou (zápis 6 týdnů dat)`, cookie, "/app/api/today")))) results.push(r);
    await wait(15000);
    for (const size of bursts) for (let round = 1; round <= rounds; round++) {
      const phase = `${size} otevření aplikace najednou`, opens = await Promise.all(Array.from({ length: size }, (_, i) => appOpen(phase, sessions[i % sessions.length])));
      results.push(...opens.flat());
      const all = opens.map(o => o[o.length - 1]);
      console.log(`${phase}, kolo ${round}: ${all.filter(r => r.status === 200).length}/${size} bez chyby, nejpomalejší ${Math.max(...all.map(r => r.ms))} ms`);
      await wait(20000);
    }
  } catch (error) { failed = error; console.error("Load test stopped:", error.message); }
  finally {
    try { const done = await automation({ cleanup: true }); console.log(`Deleted ${done.deleted} test accounts.`); }
    catch (error) { console.error("Cleanup failed:", error.message); failed ||= error; }
  }
  const markdown = [`# Zátěžový test, ${host}`, "", `${accounts} testovacích účtů (vzorový sportovec, bez AI), kola: ${rounds}. Časy jsou za celý požadavek z GitHub runneru, D1 je průměr ze Server-Timing.`, "", ...summary(results)].join("\n");
  writeFileSync("load-test.json", JSON.stringify(results, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n"); else console.log(markdown);
  if (failed) process.exit(1);
}
