// Svaly's 3D figure (ios-native Muscle3D.swift): the file scripts/build-muscle-model.mjs builds
// from the licensed ecorché model. It lives gzipped in R2 next to the food catalogue and never
// in the repository; the app asks for the format it reads (?v=1) and keeps the file.
export const MUSCLE_MODEL_FORMATS = { 1: "models/muscles-v1.bin.gz" };

export async function muscleModelResponse(env, request, format) {
  const key = MUSCLE_MODEL_FORMATS[format];
  const bucket = env.FOOD_CATALOG_R2;
  if (!key || !bucket) return Response.json({ status: "error", message: "No 3D model." }, { status: 404 });
  const object = await bucket.get(key, { onlyIf: request.headers });
  if (!object) return Response.json({ status: "error", message: "No 3D model." }, { status: 404 });
  const headers = { "ETag": object.httpEtag, "Cache-Control": "private, max-age=86400" };
  if (!object.body) return new Response(null, { status: 304, headers });
  // Stored gzipped: the phone unpacks it (URLSession), the Worker passes it on as it is.
  return new Response(object.body, { encodeBody: "manual", headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Encoding": "gzip" } });
}
