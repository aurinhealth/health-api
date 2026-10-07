// Copies the shared recovery model (src/recovery-model.js) into the dashboard
// client, between the recovery-model markers. Run after changing the model:
//   node scripts/sync-recovery-model.mjs
import { readFile, writeFile } from "node:fs/promises";
import { recoveryModelBlock } from "../src/recovery-model-block.js";

const file = new URL("../src/dashboard-client.js", import.meta.url);
const source = await readFile(file, "utf8");
const start = source.indexOf("// <recovery-model>"), end = source.indexOf("// </recovery-model>");
if (start < 0 || end < start) throw new Error("recovery-model markers not found in dashboard-client.js");
const next = source.slice(0, start) + recoveryModelBlock() + source.slice(end + "// </recovery-model>".length);
if (next !== source) { await writeFile(file, next); console.log("dashboard-client.js updated"); } else console.log("dashboard-client.js already in sync");
