// An error answer whose text came from the server's insides (a database or
// JavaScript error that a route passed on as error.message) gets a plain
// sentence instead; the original goes to the log only. Texts written for the
// user pass unchanged, so only what looks technical is replaced: also the
// guards of the user databases (tenancy.js, user-data-routing.js), a missing
// secret, a request body that isn't JSON and Cloudflare's own runtime errors.
const TECHNICAL = /\b(SQLITE_\w+|D1_\w+|no such (table|column)|Unscoped query|syntax error|constraint failed|UNIQUE constraint|FOREIGN KEY|TypeError|ReferenceError|SyntaxError|RangeError|is not a function|is not defined|Cannot read propert|undefined|null is not|NaN|stack|at \w+ \(|SELECT |INSERT |UPDATE |DELETE FROM)\b|user id is required|central and user databases|must belong to one database|cannot be dumped|dump is not available|is not configured|Unexpected (token|end of JSON)|is not valid JSON|JSON at position|Too many subrequests|Network connection lost|internal error; reference/;

export function technicalText(text) {
  return typeof text === "string" && TECHNICAL.test(text);
}

const plain = request => {
  const language = String(request.headers.get("X-Interface-Language") || "").slice(0, 2).toLowerCase()
    || /(?:^|;\s*)lw-lang=(cs|en)/.exec(request.headers.get("cookie") || "")?.[1] || "cs";
  return language === "en" ? "Something went wrong. Try again in a moment." : "Něco se pokazilo. Zkus to za chvíli znovu.";
};

export async function withPlainErrors(request, response) {
  if (response.status < 400 || !/^application\/json/i.test(response.headers.get("Content-Type") || "")) return response;
  const body = await response.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || !["message", "error"].some(key => technicalText(body[key]))) return response;
  console.error("Technical error text hidden", response.status, new URL(request.url).pathname, String(body.message || body.error).slice(0, 300));
  const clean = { ...body, message: plain(request) };
  if (technicalText(clean.error)) delete clean.error;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(JSON.stringify(clean), { status: response.status, statusText: response.statusText, headers });
}
