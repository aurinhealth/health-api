// The size of what a caller who is not signed in may send (security review
// 2026-11-02, SEC-013). Cloudflare lets a request body grow to 100 MB; the sign-in
// routes, the waitlist and the webhooks need a few kilobytes. The body is read
// here once, up to the limit, and the route gets a request with that copy, so
// `request.json()` in the route can never parse more than the limit.

export const PUBLIC_BODY_LIMIT = 64 * 1024;
// Apple's App Store notifications carry certificate chains, and Intervals.icu
// can send several activities in one webhook.
export const WEBHOOK_BODY_LIMIT = 1024 * 1024;

export function publicBodyLimit(pathname) {
  return String(pathname || "").startsWith("/webhooks/") ? WEBHOOK_BODY_LIMIT : PUBLIC_BODY_LIMIT;
}

const tooLarge = () => Response.json({ status: "error", message: "Request too large." }, { status: 413, headers: { "Cache-Control": "no-store" } });

// Returns { request } with the body read into memory, or { response } (413) when
// the body is larger than `limit` bytes. A request without a body passes as it is.
export async function limitBody(request, limit) {
  if (!request.body || request.method === "GET" || request.method === "HEAD") return { request };
  // A declared length over the limit is refused before anything is read.
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) {
    await request.body.cancel().catch(() => {});
    return { response: tooLarge() };
  }
  // The length can be missing (chunked) or wrong, so the bytes are counted too.
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return { response: tooLarge() };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return { request: new Request(request, { body: bytes }) };
}
