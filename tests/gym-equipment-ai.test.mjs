import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { pageText, firstUrl, equipmentFromAnswer, equipmentWithAI, readGymPage } from "../src/gym-equipment-ai.js";

test("a gym page becomes readable text with the gallery's machine names", () => {
  const html = '<html><head><style>.x{}</style><script>var a="Leg press";</script></head><body><h1>Vybavení</h1><ul><li>Hack&nbsp;squat</li><li>Kladky &amp; crossover</li></ul><img src="a.jpg" alt="Seated leg curl Technogym"><!-- hidden --></body></html>';
  const text = pageText(html);
  assert.match(text, /Hack squat/);assert.match(text, /Kladky & crossover/);assert.match(text, /Seated leg curl Technogym/);
  assert.doesNotMatch(text, /var a|\.x\{|hidden/);
});

test("only a public web address is read", () => {
  assert.equal(firstUrl("Moje fitko: https://metagym.cz/kutnahora."), "https://metagym.cz/kutnahora");
  assert.equal(firstUrl("leg press, kladky"), null);
  for (const bad of ["http://localhost/x", "http://127.0.0.1/", "http://intranet/", "https://user:pw@gym.cz/", "http://[::1]/"]) assert.equal(firstUrl(bad), null, bad);
});

test("the AI answer becomes known ticks, unsupported items and sources", () => {
  const r = equipmentFromAnswer(JSON.stringify({ found: true, stations: ["cables", "teleporter", "dumbbells"], unsupported: ["Hrazda", "Hrazda", " Kettlebell "], note: "Podle webu." }), [{ url: "https://gym.cz/vybaveni", title: "Vybavení" }, { url: "javascript:x" }]);
  assert.deepEqual(r, { found: true, stations: ["dumbbells", "cables"], unsupported: ["Hrazda", "Kettlebell"], note: "Podle webu.", sources: [{ url: "https://gym.cz/vybaveni", title: "Vybavení" }] });
  assert.equal(equipmentFromAnswer(JSON.stringify({ found: true, stations: [], unsupported: [], note: "" })).found, false);
  assert.equal(equipmentFromAnswer("nonsense"), null);
});

test("a link is read and sent to the AI with the equipment list; nothing is saved", async () => {
  const db = createD1(), env = { DB: scopedDb(db, 7), USER_ID: 7, OPENAI_API_KEY: "k" }, realFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = JSON.parse(options.body);
    return Response.json({ model: "gpt-6-luna", output: [{ content: [{ type: "output_text", text: JSON.stringify({ found: true, stations: ["pivot_leg_press", "cables", "floor_mats"], unsupported: ["Hrazda"], note: "Ze stránky posilovny." }) }] }], usage: { input_tokens: 1000, output_tokens: 100 } });
  };
  const page = async url => new Response("<h1>Stroje</h1><p>Leg press, kladková věž, hrazda</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
  try {
    const r = await equipmentWithAI(env, { text: "https://gym.example.cz/stroje", fetchImpl: page });
    assert.deepEqual(r.stations, ["floor_mats", "pivot_leg_press", "cables"]);assert.deepEqual(r.unsupported, ["Hrazda"]);
    assert.deepEqual(r.page, { url: "https://gym.example.cz/stroje", read: true });
    assert.equal(request.tools[0].type, "web_search");assert.equal(request.text.format.name, "gym_equipment");
    const input = JSON.parse(request.input.slice(request.input.indexOf("{")));
    assert.match(input.page.text, /Leg press, kladková věž/);assert.ok(input.equipmentList.some(e => e.id === "cables"));
    assert.equal(db.sqlite.prepare("SELECT feature FROM ai_usage").get().feature, "gym-equipment");
    // A plain list needs no page and no web search.
    await equipmentWithAI(env, { text: "jednoručky, lavice, podložka", fetchImpl: () => assert.fail("no page to read") });
    assert.equal(request.tools, undefined);
    await assert.rejects(equipmentWithAI(env, { text: "  " }), /odkaz/);
  } finally { globalThis.fetch = realFetch; }
});

test("a page that cannot be read is reported, not thrown", async () => {
  assert.deepEqual(await readGymPage("https://gym.cz/", { fetchImpl: async () => new Response("", { status: 404 }) }), { url: "https://gym.cz/", text: "", error: "HTTP 404" });
  assert.equal((await readGymPage("https://gym.cz/a.pdf", { fetchImpl: async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }) })).error, "not a web page");
  assert.equal((await readGymPage("https://gym.cz/", { fetchImpl: async () => { throw new Error("offline"); } })).error, "offline");
});
