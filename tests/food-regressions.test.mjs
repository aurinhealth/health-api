import test from "node:test";
import assert from "node:assert/strict";
import { productFromLabel, calculateAmount, normalizeBarcode } from "../src/food-sources.js";

test("package label is the highest-priority source", () => {
  const p = productFromLabel({
    name: "Milbona High Protein Pudding",
    brand: "Milbona",
    calories_100g: 81,
    protein_100g: 10,
    carbs_100g: 6.4,
    fat_100g: 1.6,
    fiber_100g: 0.7,
    salt_100g: 0.28
  });
  assert.equal(p.source, "package_label");
  assert.equal(p.confidence, "highest");
  assert.equal(p.calories_100g, 81);
  assert.equal(p.protein_100g, 10);
  assert.equal(p.fiber_100g, 0.7);
  assert.equal(p.salt_100g, 0.28);
});

test("200 g label values are calculated exactly", () => {
  const p = productFromLabel({calories_100g:81,protein_100g:10,carbs_100g:6.4,fat_100g:1.6,fiber_100g:0.7,salt_100g:0.28});
  const x = calculateAmount(p, 200);
  assert.deepEqual(x, {
    grams:200, calories:162, protein_g:20, carbs_g:12.8, fat_g:3.2, sugar_g:null, fiber_g:1.4, salt_g:0.56
  });
});

test("barcode normalization keeps EAN-13 stable", () => {
  assert.equal(normalizeBarcode("4056489918325"), "4056489918325");
});
