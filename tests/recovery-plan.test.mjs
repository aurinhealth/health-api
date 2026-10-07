import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { recoveryRoutine, describeRecovery, addRecovery, listRecovery, updateRecovery } from "../src/recovery-plan.js";

test("the stretching routine follows the sport and puts a cramped muscle first, gently", () => {
  assert.deepEqual(recoveryRoutine({ sport: "ride" }).items.map(i => i.key).slice(0, 3), ["hip_flexor", "quad", "hamstring"]);
  const calf = recoveryRoutine({ sport: "ride", note: "Křeč do lýtka při druhém sprintu" }).items;
  assert.deepEqual(calf.slice(0, 2).map(i => i.key), ["calf", "soleus"]);
  assert.ok(calf[0].gentle);
  assert.equal(recoveryRoutine({ sport: "gym", focus: "Horní tělo A" }).items[0].key, "chest");
  assert.equal(recoveryRoutine({ sport: "gym", focus: "Nohy a dřep" }).items[0].key, "hip_flexor");
  const text = describeRecovery({ id: 1, date: "2026-10-08", kind: "stretch", items: calf });
  assert.ok(text.minutes >= 8 && text.minutes <= 15, String(text.minutes));
  assert.match(text.items[0].cue, /Jemně a bez bolesti/);
  assert.equal(text.items[0].dose, "40 s na stranu");
  const en = withLang("en", () => describeRecovery({ id: 1, date: "2026-10-08", kind: "stretch", items: calf }));
  assert.equal(en.title, "Stretching");
  assert.equal(en.items[0].name, "Wall calf stretch");
});

test("a stretching session is stored per user and day, replaced, marked done and removed", async () => {
  const raw = createD1(), db = scopedDb(raw, 7), other = scopedDb(raw, 8);
  const a = await addRecovery(db, { date: "2026-10-08", sport: "run" });
  await addRecovery(db, { date: "2026-10-08", sport: "ride" });
  let list = await listRecovery(db, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(list.length, 1);
  assert.equal(list[0].items[0].key, "hip_flexor");
  assert.ok(a.id);
  await updateRecovery(db, list[0].id, { done: true });
  list = await listRecovery(db, { from: "2026-10-08", to: "2026-10-08" });
  assert.equal(list[0].done, true);
  assert.equal((await listRecovery(other, { from: "2026-10-01", to: "2026-10-31" })).length, 0);
  await updateRecovery(db, list[0].id, { remove: true });
  assert.equal((await listRecovery(db, { from: "2026-10-01", to: "2026-10-31" })).length, 0);
});
