// "Revize po tréninku" (src/week-revision.js): the coach's changes to the
// next sessions are checked before the athlete sees them.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeChanges, rulesRevision, reviseWeek, revisionSignature } from "../src/week-revision.js";

const upcoming = [
  { eventId: "planned:1", date: "2026-10-15", sport: "ride", name: "Endurance 1 h", minutes: 60, kind: "endurance", environment: "outdoor" },
  { eventId: "planned:2", date: "2026-10-16", sport: "ride", name: "VO₂max 5×4", minutes: 70, kind: "vo2max", environment: "indoor" },
  { eventId: "planned:3", date: "2026-10-17", sport: "ride", name: "Dlouhá jízda", minutes: 150, kind: "long", environment: "outdoor" }
];

test("only planned sessions change, a change that changes nothing goes", () => {
  const out = sanitizeChanges([
    { eventId: "planned:9", minutes: 60, kind: "endurance", reason: "" },
    { eventId: "planned:2", minutes: 70, kind: "vo2max", reason: "" },
    { eventId: "planned:3", minutes: 120, kind: "long", reason: "Kratší" }
  ], upcoming);
  assert.deepEqual(out.map(c => [c.eventId, c.minutes, c.kind]), [["planned:3", 120, "long"]]);
  assert.equal(out[0].from.minutes, 150);
});

test("nothing harder next to a hard day or on a red morning", () => {
  const harder = [{ eventId: "planned:1", minutes: 60, kind: "threshold", reason: "" }];
  assert.equal(sanitizeChanges(harder, upcoming)[0], undefined);
  const alone = [upcoming[0], { ...upcoming[1], date: "2026-10-18" }];
  assert.equal(sanitizeChanges(harder, alone)[0].kind, "threshold");
  assert.equal(sanitizeChanges(harder, alone, { readiness: { zone: "red" } })[0], undefined);
});

test("a day's time and the sport's minimum hold", () => {
  const out = sanitizeChanges([{ eventId: "planned:3", minutes: 400, kind: "long", reason: "" }, { eventId: "planned:2", minutes: 5, kind: "threshold", reason: "" }], upcoming, { availabilityByDate: { "2026-10-17": 180 } });
  assert.deepEqual(out.map(c => [c.eventId, c.minutes]), [["planned:2", 30], ["planned:3", 180]]);
});

test("without AI a too hard session eases the next hard one", () => {
  const r = rulesRevision({ date: "2026-10-14", done: [{ kind: "sweet_spot" }], feedback: [{ rpe: 9 }], upcoming });
  assert.deepEqual(r.changes.map(c => [c.eventId, c.kind, c.minutes]), [["planned:2", "threshold", 60]]);
  const fine = rulesRevision({ date: "2026-10-14", done: [{ kind: "sweet_spot" }], feedback: [{ rpe: 6 }], upcoming });
  assert.equal(fine.changes.length, 0);
});

test("the AI's answer goes through the same checks; a failed AI falls back to the rules", async () => {
  const facts = { date: "2026-10-14", today: "2026-10-14", done: [{ date: "2026-10-14", kind: "sweet_spot" }], feedback: [{ rpe: 8 }], upcoming, readiness: { zone: "green" } };
  const ask = async () => ({ text: JSON.stringify({ summary: "Zvládnuté, páteční VO₂max odlehčím.", changes: [{ eventId: "planned:2", minutes: 60, kind: "threshold", reason: "Únava" }] }) });
  const r = await reviseWeek({}, facts, { ask });
  assert.equal(r.source, "ai");
  assert.deepEqual(r.changes.map(c => [c.eventId, c.kind, c.minutes]), [["planned:2", "threshold", 60]]);
  const failed = await reviseWeek({}, { ...facts, feedback: [{ rpe: 10 }] }, { ask: async () => { throw new Error("AI není připojena."); } });
  assert.equal(failed.source, "rules");
  assert.equal(failed.changes[0].eventId, "planned:2");
});

test("a new session or rating changes the signature", () => {
  const a = revisionSignature([{ id: "activity:1" }], []);
  assert.notEqual(a, revisionSignature([{ id: "activity:1" }], [{ rpe: 7 }]));
  assert.notEqual(a, revisionSignature([{ id: "activity:1" }, { id: "activity:2" }], []));
});

test("a harder change the checks undo keeps no reason, and a summary with only dropped changes goes", async () => {
  // Harder next to the VO₂max day is undone; the longer session stays without the "harder" reason.
  const [change] = sanitizeChanges([{ eventId: "planned:1", kind: "threshold", minutes: 90, reason: "Přitlač práh 3×12." }], upcoming, { availabilityByDate: { "2026-10-15": 120 } });
  assert.equal(change.kind, "endurance");
  assert.equal(change.reason, null);
  const ask = async () => ({ text: JSON.stringify({ summary: "Přitlačím čtvrtek na práh.", changes: [{ eventId: "planned:1", kind: "threshold", minutes: 60, reason: "Přitlač." }] }) });
  const r = await reviseWeek({}, { date: "2026-10-14", done: [], feedback: [], readiness: null, upcoming }, { ask });
  assert.deepEqual(r.changes, []);
  assert.doesNotMatch(r.summary, /Přitlačím/);
});
