import test from "node:test";
import assert from "node:assert/strict";
import { cardDescription } from "../src/app-training.js";
import { liveRevision, withWeekdays } from "../src/week-revision.js";

test("the training card shows the words before the workout's steps, never the steps", () => {
  const text = "Focus: Endurance on the trainer, 60 min. Carbs about 40 g/h.\n\nWarmup\n- 10m 55% 90rpm warm-up intensity=warmup\n\nMain Set 3x\n- 5m 100% intensity=interval";
  assert.equal(cardDescription(text), "Focus: Endurance on the trainer, 60 min. Carbs about 40 g/h.");
  assert.equal(cardDescription("My note\nFocus: Tempo.\nMain Set 2x\n- 8m 85%"), "My note Focus: Tempo.");
  assert.equal(cardDescription("- 10m 55%"), null);
  assert.equal(cardDescription(""), null);
  assert.equal(cardDescription("a\nb\nc\nd"), "a b c");
});

test("a waiting review keeps only changes to sessions still in the plan", () => {
  const days = [{ date: "2026-11-01", daily: { training: { planned: [{ id: "planned:60" }] } } }];
  const r = { status: "pending", summary: "s", changes: [{ eventId: "planned:120", date: "2026-11-01" }] };
  assert.equal(liveRevision(r, days, "2026-11-01"), null);
  const both = { ...r, changes: [...r.changes, { eventId: "planned:60", date: "2026-11-01" }] };
  assert.deepEqual(liveRevision(both, days, "2026-11-01").changes.map(c => c.eventId), ["planned:60"]);
  // A day outside the loaded week is not judged; a day gone by goes.
  assert.equal(liveRevision({ ...r, changes: [{ eventId: "planned:x", date: "2026-11-03" }] }, days, "2026-11-01").changes.length, 1);
  assert.equal(liveRevision({ ...r, changes: [{ eventId: "planned:60", date: "2026-10-31" }] }, days, "2026-11-01"), null);
  const applied = { ...r, status: "applied" };
  assert.equal(liveRevision(applied, days, "2026-11-01"), applied);
});

test("the review's AI input names each day by its weekday", () => {
  const f = withWeekdays({ date: "2026-10-31", upcoming: [{ date: "2026-11-01" }] });
  assert.equal(f.weekday, "Saturday");
  assert.equal(f.upcoming[0].weekday, "Sunday");
});
