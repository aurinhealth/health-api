// The USER_JOBS service binding (wrangler.jsonc): the cron hands each user's
// due background jobs to a fresh invocation of this Worker, so every user gets
// the full per-invocation limits (database queries, subrequests, CPU) instead
// of sharing one cron run's (entrypoint.js fanOutUserJobs).
import { WorkerEntrypoint } from "cloudflare:workers";
import { runUserJobsInvocation, runIntervalsWebhookInvocation } from "./entrypoint.js";
import { probeCalls } from "./load-test.js";

export class UserJobs extends WorkerEntrypoint {
  // { ok: true }, or { ok: false, error } when the user's own jobs failed:
  // only a call that did not go through rejects.
  async run(message) {
    return runUserJobsInvocation(this.env, this.ctx, message);
  }

  // The load test's probe of how many calls one invocation may make through this
  // binding (src/load-test.js, staging only): ping answers, fan calls ping n times itself.
  async ping() { return { ok: true }; }
  async fan(n) { return probeCalls(() => this.env.USER_JOBS.ping(), n); }

  // One athlete's Intervals.icu webhook changes ({ athlete, parts, kinds, deleted }).
  async intervalsWebhook(message) {
    return runIntervalsWebhookInvocation(this.env, this.ctx, message);
  }
}
