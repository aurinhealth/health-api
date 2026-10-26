// An error answer whose text came from the server's insides (a database or
// JavaScript error that a route passed on as error.message) gets a plain
// sentence instead; the original goes to the log only. Texts written for the
// user pass unchanged, so only what looks technical is replaced: also the
// guards of the user databases (tenancy.js, user-data-routing.js), a missing
// secret, a request body that isn't JSON, Cloudflare's own runtime errors and
// another service's answer quoted after its status ("Intervals.icu HTTP 500: {…}").
const TECHNICAL = /\b(SQLITE_\w+|D1_\w+|no such (table|column)|Unscoped query|syntax error|constraint failed|UNIQUE constraint|FOREIGN KEY|TypeError|ReferenceError|SyntaxError|RangeError|is not a function|is not defined|Cannot read propert|undefined|null is not|NaN|stack|at \w+ \(|SELECT |INSERT |UPDATE |DELETE FROM)\b|user id is required|central and user databases|must belong to one database|cannot be dumped|dump is not available|is not configured|Unexpected (token|end of JSON)|is not valid JSON|JSON at position|Too many subrequests|Network connection lost|internal error; reference|HTTP \d{3}: /;

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
  const keys = ["message", "error", "detail"].filter(key => technicalText(body?.[key]));
  if (!body || typeof body !== "object" || !keys.length) return response;
  console.error("Technical error text hidden", response.status, new URL(request.url).pathname, String(body[keys[0]]).slice(0, 300));
  const clean = { ...body };
  for (const key of keys) delete clean[key];
  if (keys.includes("message") || !clean.message) clean.message = plain(request);
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(JSON.stringify(clean), { status: response.status, statusText: response.statusText, headers });
}
