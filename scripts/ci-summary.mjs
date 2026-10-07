// A short, data-free summary of a JSON API response for GitHub Actions logs.
// The repository is public and so are its Actions logs, while a response can
// hold health data (activities, plans, food). Workflows print only this:
// status, step, action, reason, a short message or error, and counters
// (…Count, …_found, …_saved), one line per user when the response lists users.
//
//   node scripts/ci-summary.mjs <<< "$body"
import { pathToFileURL } from "node:url";

const COUNTER = /(count|_found|_saved)$/i;
const TEXT = { status: 80, step: 80, action: 80, reason: 160, message: 200, error: 200 };

function facts(value, path = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out = [];
  for (const [key, item] of Object.entries(value)) {
    if (key === "users") continue;
    const name = path ? path + "." + key : key;
    if (item && typeof item === "object" && !Array.isArray(item)) out.push(...facts(item, name));
    else if (typeof item === "number" && COUNTER.test(key)) out.push(name + "=" + item);
    else if (typeof item === "string" && TEXT[key]) out.push(name + "=" + item.slice(0, TEXT[key]));
  }
  return out;
}

export function summarize(text) {
  let data;
  try { data = JSON.parse(text); } catch { return "(not JSON, " + String(text).length + " bytes)"; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return "(" + (Array.isArray(data) ? "array" : typeof data) + ")";
  const lines = [facts(data).join(", ") || "(no status)"];
  for (const user of Array.isArray(data.users) ? data.users : []) {
    if (!user || typeof user !== "object") continue;
    const line = facts(user.result);
    if (user.error) line.push("error=" + String(user.error).slice(0, TEXT.error));
    lines.push("user " + user.userId + ": " + (line.join(", ") || "ok"));
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  console.log(summarize(input));
}
