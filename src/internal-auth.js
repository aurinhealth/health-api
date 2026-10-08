// The app's layers (entrypoint, strength gateway, MCP) call each other inside
// the Worker with made-up requests. Those carry this token instead of the
// owner API key: it is random, exists only in the memory of one running
// Worker instance and never leaves it, so no stored secret travels with them.
import { timingSafeEqualString } from "./dashboard-auth.js";

let token = "";

// Workers allow random values only while handling a request, so it is made
// on first use rather than when the module loads.
function internalToken() {
  if (!token) token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  return token;
}

export function internalHeaders() {
  return { Authorization: `Bearer ${internalToken()}` };
}

export function isInternalCall(request) {
  return timingSafeEqualString(request.headers.get("Authorization") || "", `Bearer ${internalToken()}`);
}
