import test from "node:test";
import assert from "node:assert/strict";
import { BRICKS, libraryBricks } from "../src/brick-workouts.js";

const noDb = { prepare() { throw new Error("the bricks read no D1 rows"); } };

test("library bricks: every brick has its legs from the catalogue, in order, without D1", async () => {
  const bricks = await libraryBricks(noDb, { thresholds: { ftp: 250 } });
  assert.equal(bricks.length, BRICKS.length);
  for (const b of bricks) {
    assert.equal(b.legs.length, 2, b.id);
    assert.equal(b.minutes, b.legs[0].minutes + b.legs[1].minutes);
    for (const leg of b.legs) assert.ok(leg.workoutId && leg.steps.length, b.id + " " + leg.sport);
  }
  assert.deepEqual(bricks.find(b => b.id === "brick-easy").legs.map(l => l.sport), ["ride", "run"]);
  assert.deepEqual(bricks.find(b => b.id === "brick-swim-ride").legs.map(l => l.sport), ["swim", "ride"]);
  assert.ok(bricks.every(b => b.legs.every(l => l.sport !== "run" || l.minutes >= 20)), "a run off the bike is at least 20 min");
  assert.ok(bricks[0].legs[0].steps.some(s => s.steps.some(x => x.wattsLow > 0)), "the ride's steps in the athlete's watts");
});
