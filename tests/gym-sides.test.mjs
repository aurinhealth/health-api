import test from "node:test";
import assert from "node:assert/strict";
import { oneSided, splitSides, sideBalance, lastSideChoice } from "../src/gym-sides.js";
import { strengthSetOptions, strengthOptionNote } from "../src/gym-set-options.js";

const row = (name, n, type = "WORK") => [type, name, String(n), "16", "10", "", "", "", "FALSE", "", "", "FALSE", ""];

test("one-sided exercises are known by name, two-sided ones are not", () => {
  for (const name of ["Bulharský dřep", "Jednoruční přítah", "Single-arm row", "Iso-lateral chest press", "Výpady"]) assert.ok(oneSided(name), name);
  for (const name of ["Bench press", "Lat pulldown", "Předkopy"]) assert.ok(!oneSided(name), name);
});

test("their sets go L and P, warm-ups too, two-sided ones stay; the lagging side gets a set more", () => {
  const rows = [row("Bulharský dřep", 1, "WARMUP"), row("Bulharský dřep", 1), row("Bulharský dřep", 2), row("Bench press", 1)];
  const out = splitSides(rows, { weaker: { "Bulharský dřep": "P" } });
  assert.deepEqual(out.map(r => [r[0], r[1], r[2], r[13]]), [
    ["WARMUP", "Bulharský dřep", "1", "L"], ["WARMUP", "Bulharský dřep", "1", "P"], ["WORK", "Bulharský dřep", "1", "L"], ["WORK", "Bulharský dřep", "1", "P"],
    ["WORK", "Bulharský dřep", "2", "L"], ["WORK", "Bulharský dřep", "2", "P"], ["WORK", "Bulharský dřep", "3", "P"], ["WORK", "Bench press", "1", ""]
  ]);
});

test("the last choice wins over the name: leg extensions by sides, a split squat both at once", () => {
  const history = [
    { exercise: "Předkopy", workout_date: "2026-10-10", side: "L" }, { exercise: "Předkopy", workout_date: "2026-10-10", side: "P" },
    { exercise: "Bulharský dřep", workout_date: "2026-10-11", side: "" }, { exercise: "Bulharský dřep", workout_date: "2026-10-01", side: "L" }
  ];
  const choice = lastSideChoice(history);
  assert.deepEqual(choice, { "Předkopy": "sides", "Bulharský dřep": "both" });
  const out = splitSides([row("Předkopy", 1), row("Bulharský dřep", 1)], { choice });
  assert.deepEqual(out.map(r => r[13]), ["L", "P", ""]);
});

test("the balance compares the last session's sides and names the weaker one past 5 %", () => {
  const set = (date, side, kg, reps) => ({ exercise: "Bulharský dřep", workout_date: date, side, actual_kg: kg, actual_reps: reps });
  const [b] = sideBalance([set("2026-10-12", "L", 16, 10), set("2026-10-12", "P", 16, 8), set("2026-10-01", "L", 16, 5)]);
  assert.deepEqual(b, { exercise: "Bulharský dřep", date: "2026-10-12", left: 160, right: 128, gap: 20, weaker: "P" });
});

test("a set's side travels in its note to the history and back", () => {
  const note = strengthOptionNote({ note: "ok", side: "L" });
  assert.equal(note, "ok [Strana L]");
  assert.equal(strengthSetOptions({ note }).side, "L");
});
