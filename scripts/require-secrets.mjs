// Stops a deploy before anything goes live when the Worker lacks a secret the
// new version needs. Reads the Worker's secret names from `wrangler secret
// list` (which never returns values) and prints only the missing names.
//
//   npx wrangler secret list [--env staging] | node scripts/require-secrets.mjs NAME...
const input = await new Promise(resolve => {
  let text = "";
  process.stdin.on("data", chunk => { text += chunk; }).on("end", () => resolve(text));
});
const required = process.argv.slice(2);
// The list is a JSON array of {"name", "type"}; wrangler may print a banner or
// warnings around it.
if (!/\[[\s\S]*\]/.test(input)) {
  console.error("Could not read the Worker's secret names.");
  process.exit(1);
}
const names = new Set([...input.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(match => match[1]));
const missing = required.filter(name => !names.has(name));
if (missing.length) {
  console.error(`The Worker is missing ${missing.join(", ")}. Add it in Cloudflare: Workers & Pages → the Worker → Settings → Variables and Secrets (type Secret).`);
  process.exit(1);
}
console.log(`Required secrets are set: ${required.join(", ")}`);
