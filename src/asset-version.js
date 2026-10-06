// A short fingerprint of a script's text. The page asks for /app/x.js?v=<fingerprint>,
// so the browser keeps the script for good and a deploy that changes it gets a new URL.
export function assetVersion(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Versioned scripts never change under the same URL; without the fingerprint
// (an old page still open) the browser checks again after a few minutes.
export function scriptCacheControl(url, version) {
  return url?.searchParams.get("v") === version ? "public, max-age=31536000, immutable" : "public, max-age=300";
}
