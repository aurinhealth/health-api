// What Cloudflare runs: the app (entrypoint.js) behind HTTPS and the browser's
// security headers (web-security.js).
import app from "./entrypoint.js";
import { secured } from "./web-security.js";

export default secured(app);
