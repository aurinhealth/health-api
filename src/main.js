// What Cloudflare runs: the app (entrypoint.js) closed to browsers
// (web-app-closed.js), behind HTTPS and the browser's security headers
// (web-security.js).
import app from "./entrypoint.js";
import { webAppClosed } from "./web-app-closed.js";
import { secured } from "./web-security.js";

export default secured(webAppClosed(app));
// Each user's background jobs in an invocation of their own (USER_JOBS binding).
export { UserJobs } from "./user-jobs-entrypoint.js";
