import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
const start = entry.indexOf("url.pathname==='/app/api/assistant'&&request.method==='POST'");
const route = entry.slice(start, entry.indexOf("if(body.stream)return assistantStreamResponse(", start));

test("the coach route reads at most 64,000 characters, before parsing them", () => {
  assert.match(entry, /const ASSISTANT_REQUEST_CHARS=64000;/);
  const read = route.indexOf("const raw=await request.text()"), cap = route.indexOf("if(raw.length>ASSISTANT_REQUEST_CHARS+ASSISTANT_IMAGE_CHARS)return Response.json("), parse = route.indexOf("JSON.parse(raw)");
  assert.ok(read > 0 && read < cap && cap < parse, "the size is checked before the body is parsed");
  assert.match(route, /\{status:413\}/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test("the goal and preferences in the prompt are the athlete's saved ones, never the request's", () => {
  // Before, body.preferences.weeklyActivities reached the prompt word for word (2 MB in, 2 MB of context).
  assert.doesNotMatch(route, /body\.(preferences|goal)\b/);
  assert.match(route, /Object\.assign\(preferences,prefs\);/);
});

test("a message carries at most one checked photo, which reaches the AI but never the stored chat", async () => {
  assert.match(entry, /const ASSISTANT_IMAGE_CHARS=2500000;/);
  // Only the photo may push the request past 64,000 characters.
  assert.match(route, /if\(raw\.length-\(image\?\.length\|\|0\)>ASSISTANT_REQUEST_CHARS\)return/);
  assert.match(route, /if\(image!=null&&!validCoachImage\(image\)\)return Response\.json\(/);
  assert.match(route, /appendChatTurn\(env\.DB,body\.chatId,saved,answer\)/);
  assert.match(route, /const saved=image\?L\('\[Fotka\] ', '\[Photo\] '\)\+message:message;/);
  assert.match(route, /askCoach\(env,message,coachCtx,\{focus,actions:true,task,onAnswer,image\}\)/);
  // A photo is never a food sentence and always gets the full context.
  assert.match(route, /!image&&isFoodLogMessage\(message\)/);
  const validCoachImage = new Function("const ASSISTANT_IMAGE_CHARS=2500000;return " + entry.match(/const validCoachImage=(image=>.+);$/m)[1])();
  assert.equal(validCoachImage("data:image/jpeg;base64,/9j/4AAQ"), true);
  assert.equal(validCoachImage("data:image/gif;base64,R0lG"), false);
  assert.equal(validCoachImage("https://example.com/a.jpg"), false);
  assert.equal(validCoachImage("data:image/jpeg;base64," + "A".repeat(2500000)), false);

  const { askCoach } = await import("../src/coach-assistant.js");
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (_, options) => { const body = JSON.parse(options.body); calls.push(body); return Response.json({ model: body.model, output_text: "Odpověď" }); };
  try {
    await askCoach({ OPENAI_API_KEY: "test" }, "Převeď mi to na tréninky.", { conversation: [{ role: "user", content: "[Fotka] Co to je?" }, { role: "assistant", content: "Rozpis." }] }, { task: "planning", image: "data:image/jpeg;base64,/9j/4AAQ" });
    const last = calls[0].input.at(-1);
    assert.deepEqual(last.content, [{ type: "input_text", text: "Požadavek (s fotkou): Převeď mi to na tréninky." }, { type: "input_image", image_url: "data:image/jpeg;base64,/9j/4AAQ", detail: "high" }]);
    // Earlier photos are only their mark.
    assert.equal(calls[0].input.filter(m => Array.isArray(m.content)).length, 1);
  } finally { globalThis.fetch = original; }
});
