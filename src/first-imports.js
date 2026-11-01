// The history a service brings in when it is connected (its OAuth callback in
// entrypoint.js), and again when paused health data is turned back on
// (routes-account.js, health-pause.js). Run in the background (ctx.waitUntil).
import { matchActivities } from "./index.js";
import { bumpCacheVersion } from "./api-cache.js";
import { syncUltrahuman, FIRST_IMPORT_DAYS as ULTRAHUMAN_FIRST_DAYS } from "./ultrahuman.js";
import { syncWhoop, FIRST_IMPORT_DAYS as WHOOP_FIRST_DAYS } from "./whoop.js";
import { syncWahoo, retryWahooExports, writeWahooZones, FIRST_IMPORT_DAYS as WAHOO_FIRST_DAYS } from "./wahoo.js";
import { athleteThresholds } from "./intervals-athlete.js";

const IMPORTS = {
  // Ultrahuman: the ring's last two months (readiness's baseline).
  ultrahuman: env => syncUltrahuman(env, { days: ULTRAHUMAN_FIRST_DAYS }),
  whoop: env => syncWhoop(env, { days: WHOOP_FIRST_DAYS }),
  // Wahoo: the done workouts, matched to the plan, the plans ahead sent and
  // the FTP with the power zones written.
  wahoo: env => syncWahoo(env, { days: WAHOO_FIRST_DAYS }).then(() => matchActivities(env, { days: WAHOO_FIRST_DAYS + 1 })).then(() => retryWahooExports(env))
    .then(() => athleteThresholds(env)).then(t => writeWahooZones(env, t))
};
const TOKENS = { ultrahuman: "ULTRAHUMAN_TOKEN", whoop: "WHOOP_TOKEN", wahoo: "WAHOO_TOKEN" };
const NAMES = { ultrahuman: "Ultrahuman", whoop: "WHOOP", wahoo: "Wahoo" };

export function firstImport(env, ctx, provider) {
  if (!IMPORTS[provider] || !env[TOKENS[provider]]) return;
  ctx.waitUntil(IMPORTS[provider](env).then(() => bumpCacheVersion(env.DB)).catch(error => console.error(NAMES[provider] + " first import failed", error.message)));
}
export const FIRST_IMPORT_PROVIDERS = Object.keys(IMPORTS);
