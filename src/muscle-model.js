// Svaly's 3D figure (ios-native Muscle3D.swift): the file scripts/build-muscle-model.mjs builds
// from the licensed ecorché model. It lives gzipped in R2 next to the food catalogue and never
// in the repository; the app asks for the format it reads (?v=1) and keeps the file.
export const MUSCLE_MODEL_FORMATS = { 1: "models/muscles-v1.bin.gz" };
// SHA-256 of each stored (gzipped) file as the owner uploaded it. The food catalogue's R2 key can
// write this bucket too, so a file that differs is never served, and CI never builds it into the
// app (.github/scripts/fetch-muscle-model.sh; security audit 2026-11-04, point 37). A new upload
// (scripts/upload-muscle-model.mjs) prints the value to put here.
export const MUSCLE_MODEL_SHA256 = { 1: "e2713b59e2a72d1c8b581aa63fe91c3ea351b3c1e1c686192c82bf000d806ab8" };

export const sha256Hex = async data => [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(b => b.toString(16).padStart(2, "0")).join("");

export async function muscleModelResponse(env, request, format, { sha256 = MUSCLE_MODEL_SHA256 } = {}) {
  const key = MUSCLE_MODEL_FORMATS[format];
  const bucket = env.FOOD_CATALOG_R2;
  if (!key || !bucket) return Response.json({ status: "error", message: "No 3D model." }, { status: 404 });
  const object = await bucket.get(key, { onlyIf: request.headers });
  if (!object) return Response.json({ status: "error", message: "No 3D model." }, { status: 404 });
  const headers = { "ETag": object.httpEtag, "Cache-Control": "private, max-age=86400" };
  if (!object.body) return new Response(null, { status: 304, headers });
  const data = await object.arrayBuffer();
  const actual = await sha256Hex(data);
  if (actual !== sha256[format]) {
    console.error(`3D model ${key}: SHA-256 ${actual} is not the pinned one; not served`);
    return Response.json({ status: "error", message: "No 3D model." }, { status: 404 });
  }
  // Stored gzipped: the phone unpacks it (URLSession), the Worker passes it on as it is.
  return new Response(data, { encodeBody: "manual", headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Encoding": "gzip" } });
}
