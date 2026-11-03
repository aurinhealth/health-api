// The AI prompt texts live in the private repository aurinhealth/aurin-prompts,
// checked out to src/private (gitignored). Without it the coach modules cannot
// load, so say how to get it instead of failing on a missing module.
import { existsSync } from "node:fs";

if (!existsSync(new URL("../src/private/coach-assistant.js", import.meta.url))) {
  console.error("Missing src/private: clone the private AI prompts first:\n  git clone https://github.com/aurinhealth/aurin-prompts src/private");
  process.exit(1);
}
