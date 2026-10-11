// "Regenerace na dnes" on the app's Today screen (src/recovery-today.js) and
// the recovery saved into the day's plan (app-today.js, recovery-plan.js).
import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { recoveryToday } from "../src/recovery-today.js";
import { buildToday } from "../src/app-today.js";
import { addRecovery, listRecovery, routineAreas, recoveryRoutine } from "../src/recovery-plan.js";

const DATE = "2026-10-11";
const gymDone = { id: "gym:" + DATE, status: "done", date: DATE, title: "Horní tělo A", sport: "strength", minutes: null, tss: null };
const intervals = { id: "p1", status: "planned", date: "2026-10-12", title: "Intervaly 5×4 min VO2max", sport: "ride", minutes: 75, tss: 85 };

test("after a gym day: why, the stretch for the upper body, a sauna and bedtime", () => {
  const r = recoveryToday({ date: DATE, today: [gymDone], tomorrow: [intervals], gym: { [DATE]: { name: "Horní tělo A", exercises: ["Bench press", "Přítahy"] } }, tonight: { bedtime: "22:10", need: 510 } });
  assert.equal(r.title, "Regenerace na dnes");
  assert.equal(r.text, "Posilovna dala zabrat horní části těla a zítra jedeš intervaly.");
  assert.deepEqual(r.items.map(i => i.kind), ["stretch", "sauna", "bedtime"]);
  const stretch = r.items[0];
  assert.equal(stretch.title, "Protažení po posilovně");
  assert.match(stretch.detail, /^\d+ min · hrudník, záda, ramena$/);
  assert.equal(stretch.routine.items[0].name, "Hrudník ve dveřích");
  assert.equal(stretch.routine.items[0].dose, "40 s na stranu");
  assert.equal(stretch.routine.items[0].seconds, 80);
  assert.equal(stretch.sport, "gym");
  assert.equal(r.items[1].detail, "3× 10 min večer, pak hodně pít");
  assert.equal(r.items[2].title, "Do postele v 22:10");
  assert.equal(r.items[2].detail, "dnes potřebuješ 8 h 30 spánku");
});

test("a leg day, a ride and the morning after a long ride; nothing after a rest day", () => {
  const legs = recoveryToday({ date: DATE, today: [{ ...gymDone, title: "Nohy" }], tomorrow: [] });
  assert.equal(legs.text, "Posilovna dala zabrat nohám a zítra máš volno.");
  assert.equal(legs.items[0].routine.items[0].key, "hip_flexor");
  const ride = recoveryToday({ date: DATE, today: [{ status: "done", sport: "ride", title: "Vytrvalost", minutes: 90, tss: 70 }], tomorrow: null });
  assert.equal(ride.text, "Dnešní jízda (70 TSS) zatížila nohy a kyčle.");
  assert.equal(ride.items[0].title, "Protažení po jízdě");
  const morning = recoveryToday({ date: DATE, yesterday: [{ status: "done", sport: "ride", title: "Dlouhá", minutes: 180, tss: 160 }], tomorrow: [{ status: "planned", sport: "run", title: "Lehký běh" }] });
  assert.equal(morning.text, "Včerejší jízda (160 TSS) zatížila nohy a kyčle a zítra běžíš.");
  assert.deepEqual(morning.items.map(i => i.kind), ["stretch"], "no sauna the morning after");
  assert.equal(recoveryToday({ date: DATE, today: [{ status: "planned", sport: "ride", tss: 80 }], yesterday: [{ status: "done", sport: "ride", minutes: 40, tss: 30 }] }), null);
  assert.equal(recoveryToday({ date: DATE, today: [{ status: "done", sport: "other", minutes: 15, tss: 5 }] }), null);
});

test("done stretching and sauna are marked; English texts", () => {
  const r = recoveryToday({ date: DATE, today: [gymDone], saved: [{ kind: "stretch", done: true }, { kind: "sauna", done: false }] });
  assert.equal(r.items[0].done, true);
  assert.equal(r.items[1].done, false);
  const en = withLang("en", () => recoveryToday({ date: DATE, today: [gymDone], tomorrow: [intervals], tonight: { bedtime: "22:10", need: 480 } }));
  assert.equal(en.title, "Recovery for today");
  assert.equal(en.text, "The gym session worked your upper body and tomorrow you ride intervals.");
  assert.match(en.items[0].detail, /chest, back, shoulders/);
  assert.equal(en.items[2].detail, "you need 8 h of sleep tonight");
  assert.deepEqual(withLang("en", () => routineAreas(recoveryRoutine({ sport: "run" }).items)), ["calves", "thighs", "hips"]);
});

test("sauna and a finished routine are saved as done and join Today's plan", async () => {
  const db = scopedDb(createD1(), 3);
  const stretch = await addRecovery(db, { date: DATE, sport: "gym", focus: "Horní tělo", done: true });
  assert.equal(stretch.done, true);
  assert.ok(stretch.doneAt);
  const sauna = await addRecovery(db, { date: DATE, kind: "sauna", done: true });
  assert.equal(sauna.title, "Sauna");
  assert.deepEqual(sauna.items, []);
  const saved = await listRecovery(db, { from: DATE, to: DATE });
  assert.equal(saved.length, 2);

  const today = buildToday({
    date: DATE, hour: 20,
    daily: { training: { planned: [], matched: [], completed: [] } },
    gym: { name: "Horní tělo A", exercises: ["Bench press"], logged: 4 },
    recovery: { yesterday: {}, tomorrow: { planned: [{ id: "planned:1", name: "Intervaly 5×4", type: "Ride", start: "2026-10-12T17:00:00", durationHours: 1.2, tss: 85 }] }, gym: {}, saved }
  });
  assert.equal(today.recovery.text, "Posilovna dala zabrat horní části těla a zítra jedeš intervaly.");
  assert.equal(today.recovery.items[0].done, true);
  assert.equal(today.recovery.items[1].done, true);
  const rows = today.plan.filter(i => i.kind === "recovery");
  assert.deepEqual(rows.map(i => i.title), ["Protažení po posilovně", "Sauna"]);
  assert.ok(rows.every(i => i.done && /hotovo$/.test(i.detail)));
  assert.match(rows[0].detail, /^\d+ min · 6 cviků · hotovo$/);
  // A past day shows the saved recovery in its plan but no suggestions.
  const past = buildToday({ date: DATE, hour: null, recovery: { saved } });
  assert.equal(past.recovery, null);
  assert.equal(past.plan.filter(i => i.kind === "recovery").length, 2);
});
