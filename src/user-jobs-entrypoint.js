// The USER_JOBS service binding (wrangler.jsonc): the cron hands each user's
// due background jobs to a fresh invocation of this Worker, so every user gets
// the full per-invocation limits (database queries, subrequests, CPU) instead
// of sharing one cron run's (entrypoint.js fanOutUserJobs).
import { WorkerEntrypoint } from "cloudflare:workers";
import { runUserJobsInvocation } from "./entrypoint.js";

export class UserJobs extends WorkerEntrypoint {
  async run(message) {
    await runUserJobsInvocation(this.env, this.ctx, message);
  }
}
