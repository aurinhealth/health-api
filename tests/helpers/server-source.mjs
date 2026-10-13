// The dashboard server's source as text: entrypoint.js and the modules split
// out of it, for tests that check what a route does by reading its code.
import { readFileSync } from "node:fs";

export const SERVER_FILES = [
  "entrypoint.js",
  "dashboard-shared.js",
  "coach-inbox.js",
  "coach-ride-reviews.js",
  "library-workouts.js",
  "own-fitness.js",
  "plan-context.js",
  "threshold-check-state.js",
  "routes-account.js",
  "routes-admin.js",
  "routes-food.js",
  "routes-gym.js",
  "routes-sync.js",
  "routes-training.js"
];

// entrypoint.js first, so positions inside it stay comparable.
export function serverSource(files = SERVER_FILES) {
  return files.map(file => readFileSync(new URL("../../src/" + file, import.meta.url), "utf8")).join("\n");
}
