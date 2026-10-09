import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { needsAIAccess } from "../src/ai-routes.js";

test("every AI request needs AI access (consent) before it runs", () => {
  for (const path of ["/app/api/assistant", "/app/api/assistant/stream", "/app/api/gym/adjust", "/app/api/gym/equipment/detect", "/app/api/food/photo", "/app/api/food/ai-lookup", "/app/api/food/chat", "/app/api/coach/review", "/app/api/review/day"])
    assert.equal(needsAIAccess("POST", path), true, path);
  for (const [method, path] of [["GET", "/app/api/coach/review"], ["POST", "/app/api/coach/reflections"], ["POST", "/app/api/gym/equipment"], ["POST", "/app/api/coach/reviewer"], ["POST", "/app/api/food/log"]])
    assert.equal(needsAIAccess(method, path), false, method + " " + path);
});

test("the gate is applied, and the coach's note falls back to rules without AI access", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /if\(signedIn&&needsAIAccess\(request\.method,url\.pathname\)\)\{/);
  assert.match(entry, /if\(!aiAllowed\)delete ruleEnv\.OPENAI_API_KEY;\s*const reflection=await createReflection\(ruleEnv,/);
});
