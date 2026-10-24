import test from "node:test";
import assert from "node:assert/strict";
import { parseExerciseNote, exerciseNotes, saveExerciseNote, MAX_NOTE } from "../src/exercise-notes.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";

test("a note needs the exercise and stays one short paragraph", () => {
  assert.deepEqual(parseExerciseNote({ exercise: " Leg press ", note: " sedadlo 4,\n úzký úchop " }), { exercise: "Leg press", note: "sedadlo 4, úzký úchop" });
  assert.throws(() => parseExerciseNote({ note: "x" }));
  assert.throws(() => parseExerciseNote({ exercise: "Leg press", note: "x".repeat(MAX_NOTE + 1) }));
});

test("notes are kept per user, one per exercise, and an empty one removes it", async () => {
  const raw = createD1(), db = scopedDb(raw, 3), other = scopedDb(raw, 4);
  assert.deepEqual(await exerciseNotes(db), {}, "nothing before the first note");
  await saveExerciseNote(db, { exercise: "Leg press", note: "sedadlo 4" });
  await saveExerciseNote(db, { exercise: "Leg press", note: "sedadlo 5" });
  await saveExerciseNote(db, { exercise: "Dřep", note: "úzký postoj" });
  assert.deepEqual(await exerciseNotes(db), { "Leg press": "sedadlo 5", "Dřep": "úzký postoj" });
  assert.deepEqual(await exerciseNotes(other), {});
  await saveExerciseNote(db, { exercise: "Dřep", note: "  " });
  assert.deepEqual(await exerciseNotes(db), { "Leg press": "sedadlo 5" });
  assert.ok(PERSONAL_TABLES.exercise_notes, "deleted and exported with the account");
});
