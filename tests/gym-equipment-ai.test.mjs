import test from "node:test";
import assert from "node:assert/strict";
import { GYM_STATIONS, equipmentCatalog, parseDetectAnswer } from "../src/gym-equipment-ai.js";
import { normalizeTraining } from "../src/onboarding.js";
import { METAGYM_KUTNA_HORA } from "../src/gym-equipment.js";

test("every gym station has a generic name", () => {
  for (const id of Object.keys(METAGYM_KUTNA_HORA.stations)) assert.ok(GYM_STATIONS.some(s => s.id === id), id);
  assert.ok(GYM_STATIONS.some(s => s.id === "pullup_bar"), "the usual equipment of other gyms too");
  assert.equal(new Set(GYM_STATIONS.map(s => s.id)).size, GYM_STATIONS.length);
  assert.deepEqual(normalizeTraining({ equipment: "home", stations: ["pullup_bar", "kettlebells", "laser"] }).stations, ["pullup_bar", "kettlebells"], "the usual others are kept");
  assert.ok(equipmentCatalog().every(s => s.id && s.label && s.group));
});

test("the AI answer keeps only known stations", () => {
  const r = parseDetectAnswer('{"found":true,"gymName":"Fit Box","stations":["cables","dumbbells","laser_cannon","cables"],"note":""}');
  assert.deepEqual(r.stations, ["cables", "dumbbells"]);
  assert.equal(r.found, true);
  assert.equal(parseDetectAnswer('{"found":true,"stations":[]}').found, false, "nothing found is not a gym");
  assert.equal(parseDetectAnswer("no json"), null);
});

test("own stations are saved with the training setup", () => {
  const t = normalizeTraining({ equipment: "custom", stations: ["cables", "nope", "dumbbells"], gymName: " Fit Box ", gymUrl: "javascript:alert(1)" });
  assert.equal(t.equipment, "custom");
  assert.deepEqual(t.stations, ["cables", "dumbbells"]);
  assert.equal(t.gymName, "Fit Box");
  assert.equal(t.gymUrl, "", "only web links");
  assert.equal(normalizeTraining({ equipment: "custom", stations: [] }).equipment, "gym", "custom without stations is the whole gym");
});

import { pageImages, galleryLink, websitePhotos } from "../src/gym-equipment-ai.js";

test("photos of a gym's web page: real pictures, not logos, lazy and srcset ones too", () => {
  const html = `<meta property="og:image" content="/img/hero.jpg">
    <img src="/static/logo.png"><img src="data:image/gif;base64,AAAA">
    <img data-src="https://cdn.gym.cz/foto/klece.webp" src="/blank.gif">
    <img srcset="/f/a-480.jpg 480w, /f/a-1200.jpg 1200w">
    <a href="/galerie/stroj1.JPG">foto</a>`;
  assert.deepEqual(pageImages(html, "https://gym.cz/kutna-hora"), [
    "https://gym.cz/img/hero.jpg", "https://cdn.gym.cz/foto/klece.webp", "https://gym.cz/f/a-1200.jpg", "https://gym.cz/galerie/stroj1.JPG"]);
});

test("the gallery page is followed on the same site only", () => {
  assert.equal(galleryLink(`<a href="https://facebook.com/gym">Fotogalerie</a><a href="/fotogalerie">Fotky</a>`, "https://gym.cz/"), "https://gym.cz/fotogalerie");
  assert.equal(galleryLink(`<a href="/kontakt">Kontakt</a>`, "https://gym.cz/"), null);
});

test("website photos: page plus gallery, at most 8, no private addresses", async () => {
  const pages = {
    "https://gym.cz/": `<img src="/a.jpg"><a href="/galerie">Galerie</a>`,
    "https://gym.cz/galerie": Array.from({ length: 10 }, (_, i) => `<img src="/g${i}.jpg">`).join("")
  };
  const fetchImpl = async url => new Response(pages[url] || "", { headers: { "content-type": "text/html" } });
  const photos = await websitePhotos("https://gym.cz/", fetchImpl);
  assert.equal(photos.length, 8);
  assert.equal(photos[0], "https://gym.cz/a.jpg");
  assert.deepEqual(await websitePhotos("http://127.0.0.1/admin", fetchImpl), []);
  assert.deepEqual(await websitePhotos("http://localhost:8787/", fetchImpl), []);
});
