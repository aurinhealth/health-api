// Svaly's 3D figure: /app/api/muscles/model serves the gzipped file from R2 (src/muscle-model.js).
import test from "node:test";
import assert from "node:assert/strict";
import { muscleModelResponse } from "../src/muscle-model.js";

const bucket = (objects, calls = []) => ({
  async get(key, options) {
    calls.push([key, options]);
    const o = objects[key];
    if (!o) return null;
    const match = options?.onlyIf?.get?.("If-None-Match");
    return match === o.etag ? { httpEtag: o.etag } : { httpEtag: o.etag, body: new Blob([o.data]).stream() };
  }
});

test("the 3D model comes gzipped with its ETag, and an unknown format is 404", async () => {
  const calls = [];
  const env = { FOOD_CATALOG_R2: bucket({ "models/muscles-v1.bin.gz": { etag: '"abc"', data: "AURM" } }, calls) };
  const r = await muscleModelResponse(env, new Request("https://x/app/api/muscles/model?v=1"), "1");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Encoding"), "gzip");
  assert.equal(r.headers.get("ETag"), '"abc"');
  assert.equal(await r.text(), "AURM");
  assert.equal(calls[0][0], "models/muscles-v1.bin.gz");
  assert.equal((await muscleModelResponse(env, new Request("https://x/"), "2")).status, 404);
  assert.equal((await muscleModelResponse({}, new Request("https://x/"), "1")).status, 404);
});

test("a phone that already has the model gets 304", async () => {
  const env = { FOOD_CATALOG_R2: bucket({ "models/muscles-v1.bin.gz": { etag: '"abc"', data: "AURM" } }) };
  const r = await muscleModelResponse(env, new Request("https://x/", { headers: { "If-None-Match": '"abc"' } }), "1");
  assert.equal(r.status, 304);
});

test("a model missing in R2 is 404", async () => {
  const r = await muscleModelResponse({ FOOD_CATALOG_R2: bucket({}) }, new Request("https://x/"), "1");
  assert.equal(r.status, 404);
});
