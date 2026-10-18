import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
const start = entry.indexOf("url.pathname==='/app/api/assistant'&&request.method==='POST'");
const route = entry.slice(start, entry.indexOf("if(body.stream)return assistantStreamResponse(", start));

test("the coach route reads at most 64,000 characters, before parsing them", () => {
  assert.match(entry, /const ASSISTANT_REQUEST_CHARS=64000;/);
  const read = route.indexOf("const raw=await request.text()"), cap = route.indexOf("if(raw.length>ASSISTANT_REQUEST_CHARS)return Response.json("), parse = route.indexOf("JSON.parse(raw)");
  assert.ok(read > 0 && read < cap && cap < parse, "the size is checked before the body is parsed");
  assert.match(route, /\{status:413\}/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test("the goal and preferences in the prompt are the athlete's saved ones, never the request's", () => {
  // Before, body.preferences.weeklyActivities reached the prompt word for word (2 MB in, 2 MB of context).
  assert.doesNotMatch(route, /body\.(preferences|goal)\b/);
  assert.match(route, /Object\.assign\(preferences,prefs\);/);
});
