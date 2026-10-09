import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withIdempotency, requestIdOf, idempotentRoute } from "../src/idempotency.js";

const post = (path, body) => new Request("https://app.test" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const run = (env, path, body, handler) => withIdempotency(post(path, body), env, new URL("https://app.test" + path), handler);

test("only the app's offline-replayable writes with a valid requestId count", () => {
  assert.equal(idempotentRoute(post("/app/api/fluids", {}), new URL("https://app.test/app/api/fluids")), true);
  assert.equal(idempotentRoute(new Request("https://app.test/app/api/fluids"), new URL("https://app.test/app/api/fluids")), false);
  assert.equal(idempotentRoute(post("/app/api/gym", {}), new URL("https://app.test/app/api/gym")), false);
  assert.equal(requestIdOf({ requestId: "6F9619FF-8B86-D011-B42D-00C04FC964FF" }), "6F9619FF-8B86-D011-B42D-00C04FC964FF");
  assert.equal(requestIdOf({ requestId: "short" }), null);
  assert.equal(requestIdOf({ requestId: "a b c d e f g h" }), null);
  assert.equal(requestIdOf({}), null);
});

test("a replayed write runs once per user and gets the first answer back", async () => {
  const raw = createD1(), env = { DB: scopedDb(raw, 7), USER_ID: 7 }, other = { DB: scopedDb(raw, 8), USER_ID: 8 };
  let writes = 0;
  const handler = async request => { const body = await request.json(); writes++; return Response.json({ status: "ok", entry: { id: writes, ml: body.ml } }); };
  const body = { ml: 250, requestId: "2b7c0d7e-4f0c-4b8e-9a51-0e7a6f1c9d20" };
  const first = await (await run(env, "/app/api/fluids", body, handler)).json();
  const again = await run(env, "/app/api/fluids", body, handler);
  assert.equal(again.headers.get("X-Idempotent-Replay"), "1");
  assert.deepEqual(await again.json(), first);
  assert.equal(writes, 1);
  // Another user, another route or another id is a new write.
  await run(other, "/app/api/fluids", body, handler);
  await run(env, "/app/api/weight", body, handler);
  await run(env, "/app/api/fluids", { ...body, requestId: "c3d1b2a0-1111-4222-8333-944455556666" }, handler);
  // Without an id nothing is remembered.
  await run(env, "/app/api/fluids", { ml: 250 }, handler);
  await run(env, "/app/api/fluids", { ml: 250 }, handler);
  assert.equal(writes, 6);
});

test("a failed write is forgotten so the same id can be retried", async () => {
  const raw = createD1(), env = { DB: scopedDb(raw, 7), USER_ID: 7 };
  const body = { kg: 80, requestId: "9d0f7c1e-5a2b-4c3d-8e9f-a0b1c2d3e4f5" };
  let calls = 0;
  const failing = await run(env, "/app/api/weight", body, async () => { calls++; return Response.json({ message: "boom" }, { status: 500 }); });
  assert.equal(failing.status, 500);
  await assert.rejects(run(env, "/app/api/weight", body, async () => { calls++; throw new Error("down"); }), /down/);
  const ok = await run(env, "/app/api/weight", body, async () => { calls++; return Response.json({ status: "ok" }); });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("X-Idempotent-Replay"), null);
  assert.equal(calls, 3);
});

test("a repeat that arrives while the first still runs does not write again", async () => {
  const raw = createD1(), env = { DB: scopedDb(raw, 7), USER_ID: 7 };
  const body = { ml: 300, requestId: "0a1b2c3d-4e5f-4061-8273-8495a6b7c8d9" };
  let release, writes = 0;
  const gate = new Promise(r => { release = r; });
  const slow = run(env, "/app/api/fluids", body, async () => { writes++; await gate; return Response.json({ status: "ok", entry: { id: 1 } }); });
  await new Promise(r => setTimeout(r, 10));
  const dup = await run(env, "/app/api/fluids", body, async () => { writes++; return Response.json({ status: "ok" }); });
  assert.deepEqual(await dup.json(), { status: "ok", duplicate: true });
  release();
  assert.equal((await slow).status, 200);
  assert.equal(writes, 1);
});

test("an attempt that never finished stops blocking its id after a while", async () => {
  const raw = createD1(), env = { DB: scopedDb(raw, 7), USER_ID: 7 };
  const body = { ml: 300, requestId: "1a1b2c3d-4e5f-4061-8273-8495a6b7c8d9" };
  await run(env, "/app/api/fluids", { ...body, requestId: "warmup-0000-0000" }, async () => Response.json({ status: "ok" }));
  raw.sqlite.prepare("INSERT INTO client_requests(user_id,route,request_id,created_at) VALUES(7,'/app/api/fluids',?,datetime('now','-10 minutes'))").run(body.requestId);
  let writes = 0;
  const r = await run(env, "/app/api/fluids", body, async () => { writes++; return Response.json({ status: "ok" }); });
  assert.equal(r.status, 200);
  assert.equal(writes, 1);
});
