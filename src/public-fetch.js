// Fetching an address a user or a webhook gave: only public web pages, and
// each redirect is checked again before it is followed, so a public page
// cannot send the Worker on to a local or private address.

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)|\.(localhost|local|internal)$/i;
// Aurin's own hosts and Workers addresses: the Worker never fetches itself on a user's behalf.
const OWN_HOST = /(^|\.)(aurin\.health|aurin-staging\.com|petrfitnessdata\.eu|workers\.dev)$/i;

// The address when it is a public http(s) page, else null.
export function publicUrl(link, { https = false } = {}) {
  let u; try { u = new URL(link); } catch { return null; }
  const host = u.hostname.replace(/\.$/, "");
  if (!(https ? /^https:$/ : /^https?:$/).test(u.protocol) || u.username || u.password || PRIVATE_HOST.test(host) || OWN_HOST.test(host) || !host.includes(".")) return null;
  return u.href;
}

// fetch, following at most `hops` redirects, each to a public address; null when one is not.
export async function fetchPublic(link, init = {}, fetchImpl = fetch, { hops = 3, https = false } = {}) {
  let url = publicUrl(link, { https });
  for (let hop = 0; url && hop <= hops; hop++) {
    const response = await fetchImpl(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const next = response.headers.get("location");
    url = next ? publicUrl(new URL(next, url).href, { https }) : null;
  }
  return null;
}

// At most maxBytes of the body; the rest is not read (the download is cancelled).
// whole: false when the body was longer.
export async function readUpTo(response, maxBytes) {
  const reader = response.body?.getReader();
  const parts = [];
  let size = 0, whole = true;
  for (;;) {
    const { value, done } = reader ? await reader.read() : { done: true };
    if (done) break;
    if (size + value.byteLength > maxBytes) {
      parts.push(value.subarray(0, maxBytes - size));
      size = maxBytes; whole = false;
      await reader.cancel().catch(() => {});
      break;
    }
    parts.push(value); size += value.byteLength;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
  return { bytes, whole };
}
