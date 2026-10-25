// Fetching an address a user or a webhook gave: only public web pages, and
// each redirect is checked again before it is followed, so a public page
// cannot send the Worker on to a local or private address.

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)|\.(localhost|local|internal)$/i;

// The address when it is a public http(s) page, else null.
export function publicUrl(link, { https = false } = {}) {
  let u; try { u = new URL(link); } catch { return null; }
  if (!(https ? /^https:$/ : /^https?:$/).test(u.protocol) || u.username || u.password || PRIVATE_HOST.test(u.hostname) || !u.hostname.includes(".")) return null;
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
