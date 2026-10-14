// Plán týdne → Navrhne AI and "Upravit s AI" (src/week-ai.js): the AI's
// answer is checked before the app shows it.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeWeekDays, gymNote, itemsFromDays, proposeWeekAI, adjustByChip, adjustByText, kindOfSystem, applyRequests } from "../src/week-ai.js";

const start = "2026-10-12", today = "2026-10-13";
const prefs = { availability: [60, 90, 60, 90, 0, 240, 60].map(minutes => ({ minutes, window: "", preferredSports: [] })) };

test("days outside the week, before today, or with an unknown sport are dropped", () => {
  const days = sanitizeWeekDays([
    { date: "2026-10-12", sport: "ride", minutes: 60, kind: "endurance" },
    { date: "2026-10-20", sport: "ride", minutes: 60, kind: "endurance" },
    { date: "2026-10-14", sport: "swim", minutes: 60, kind: "endurance" },
    { date: "2026-10-14", sport: "run", minutes: 40, kind: "endurance" }
  ], { start, today, prefs });
  assert.deepEqual(days.map(d => d.date + " " + d.sport), ["2026-10-14 run"]);
});

test("a day's time is never exceeded and too short sessions go", () => {
  const days = sanitizeWeekDays([
    { date: "2026-10-13", sport: "ride", minutes: 150, kind: "endurance" },
    { date: "2026-10-16", sport: "ride", minutes: 60, kind: "endurance" },
    { date: "2026-10-15", sport: "ride", minutes: 45, kind: "endurance" },
    { date: "2026-10-15", sport: "gym", minutes: 60, kind: "endurance" }
  ], { start, today, prefs });
  assert.deepEqual(days.map(d => [d.date, d.sport, d.minutes, d.kind]), [["2026-10-13", "ride", 90, "endurance"], ["2026-10-15", "ride", 45, "endurance"], ["2026-10-15", "gym", 45, "gym"]]);
});

test("two hard days at most, never in a row, none today on a red morning", () => {
  const hard = date => ({ date, sport: "ride", minutes: 60, kind: "threshold" });
  const days = sanitizeWeekDays([hard("2026-10-13"), hard("2026-10-14"), hard("2026-10-16"), hard("2026-10-18")], { start, today, prefs, readiness: "red" });
  // Friday the 16th has no time, so it is gone.
  assert.deepEqual(days.map(d => d.date + " " + d.kind), ["2026-10-13 endurance", "2026-10-14 threshold", "2026-10-18 threshold"]);
});

test("sessions already in the calendar keep their sport and use the day's time", () => {
  const days = sanitizeWeekDays([
    { date: "2026-10-14", sport: "ride", minutes: 60, kind: "endurance" },
    { date: "2026-10-14", sport: "gym", minutes: 45, kind: "gym" }
  ], { start, today, prefs, usedByDate: { "2026-10-14": 60 }, existingSports: { "2026-10-14": ["ride"] } });
  assert.deepEqual(days.map(d => d.sport + " " + d.minutes), []);
});

test("items carry the generator's focus and a slot per sport and day", () => {
  const items = itemsFromDays([{ date: "2026-10-18", sport: "ride", minutes: 180, environment: "outdoor", kind: "long" }, { date: "2026-10-18", sport: "ride", minutes: 30, environment: "indoor", kind: "recovery" }, { date: "2026-10-15", sport: "gym", minutes: 45, environment: "indoor", kind: "gym" }]);
  assert.deepEqual(items.map(i => [i.focus, i.slot, i.environment]), [["long_endurance", 0, "outdoor"], ["recovery", 1, "indoor"], [null, 0, null]]);
});

test("the AI's week goes through the same checks, a summary naming eased days goes", async () => {
  const ask = async () => ({ text: JSON.stringify({ summary: "Úterý sweet spot, sobota dlouhá jízda.", days: [
    { date: "2026-10-14", sport: "ride", minutes: 75, environment: "outdoor", kind: "sweet_spot", reason: "" },
    { date: "2026-10-15", sport: "ride", minutes: 60, environment: "outdoor", kind: "vo2max", reason: "" },
    { date: "2026-10-17", sport: "ride", minutes: 400, environment: "outdoor", kind: "long", reason: "Víkend" }
  ] }) });
  const r = await proposeWeekAI({}, { start, today, readiness: { zone: "green" } }, { prefs, ask });
  assert.equal(r.summary, null);
  assert.deepEqual(r.items.map(i => [i.date, i.kind, i.minutes]), [["2026-10-14", "sweet_spot", 60], ["2026-10-15", "endurance", 60], ["2026-10-17", "long", 240]]);
});

test("chips: shorter by a quarter, one kind easier or harder, indoor shortens a ride", () => {
  const s = { date: "2026-10-14", sport: "ride", minutes: 120, environment: "outdoor", kind: "sweet_spot" };
  assert.equal(adjustByChip(s, "shorter").minutes, 90);
  assert.equal(adjustByChip(s, "easier").kind, "endurance");
  assert.equal(adjustByChip(s, "harder").kind, "threshold");
  assert.deepEqual([adjustByChip(s, "indoor").environment, adjustByChip(s, "indoor").minutes], ["indoor", 85]);
  assert.equal(adjustByChip({ ...s, sport: "run", kind: "tempo" }, "harder").kind, "threshold");
  assert.equal(adjustByChip({ ...s, sport: "gym", kind: "gym" }, "harder").kind, "gym");
});

test("a library system maps to its kind", () => {
  assert.equal(kindOfSystem("vo2max"), "vo2max");
  assert.equal(kindOfSystem("sweet_spot"), "sweet_spot");
  assert.equal(kindOfSystem(null, "tempo"), "tempo");
});

test("the AI's change of one session stays in the week and off hard neighbours", async () => {
  const ask = async () => ({ text: JSON.stringify({ date: "2026-10-30", minutes: 60, environment: "indoor", kind: "threshold", note: "Na trenažéru." }) });
  const weekDays = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
  const r = await adjustByText({}, { session: { date: "2026-10-17", sport: "ride", minutes: 70, environment: "outdoor", kind: "vo2max" }, request: "Prší", weekDays, otherSessions: [{ date: "2026-10-18", kind: "sweet_spot" }], prefs, today }, { ask });
  assert.deepEqual([r.date, r.minutes, r.environment, r.kind, r.note], ["2026-10-17", 60, "indoor", "endurance", "Lehčí trénink: vedle je jiný tvrdý den."]);
});

test("days the athlete named hold exactly the sports asked for, even when the AI kept another", async () => {
  // Petr, 2026-10-13: "Dej mi posilovnu na pátek, sobotu a neděli" and the AI still left a run on Saturday.
  const ask = async () => ({ text: JSON.stringify({ summary: "Posilovna pá–ne.", requested: [
    { date: "2026-10-16", sports: ["gym"] }, { date: "2026-10-17", sports: ["gym"] }, { date: "2026-10-18", sports: ["gym"] }
  ], days: [
    { date: "2026-10-14", sport: "ride", minutes: 60, environment: "outdoor", kind: "endurance", reason: "" },
    { date: "2026-10-16", sport: "gym", minutes: 60, environment: "indoor", kind: "gym", reason: "" },
    { date: "2026-10-17", sport: "run", minutes: 45, environment: "outdoor", kind: "endurance", reason: "" },
    { date: "2026-10-18", sport: "gym", minutes: 60, environment: "indoor", kind: "gym", reason: "" }
  ] }) });
  const r = await proposeWeekAI({}, { start, today, readiness: { zone: "green" } }, { prefs, ask });
  // Friday has no time set, but the athlete asked for it.
  assert.deepEqual(r.items.map(i => i.date + " " + i.sport), ["2026-10-14 ride", "2026-10-16 gym", "2026-10-17 gym", "2026-10-18 gym"]);
});

test("a named rest day is emptied and requests outside the week are ignored", () => {
  const out = applyRequests([{ date: "2026-10-15", sport: "run", minutes: 45 }, { date: "2026-10-14", sport: "ride", minutes: 60 }],
    [{ date: "2026-10-15", sports: [] }, { date: "2026-10-25", sports: ["gym"] }, { date: "2026-10-14", sports: ["ride", "swim"] }], { start });
  assert.deepEqual(out.map(d => d.date + " " + d.sport), ["2026-10-14 ride"]);
});

test("the AI can change one session's sport; gym is always indoor gym", async () => {
  const ask = async () => ({ text: JSON.stringify({ date: "2026-10-17", sport: "gym", minutes: 60, environment: "outdoor", kind: "endurance", note: "Běh jsem změnil na posilovnu." }) });
  const weekDays = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
  const r = await adjustByText({}, { session: { date: "2026-10-17", sport: "run", minutes: 45, environment: "outdoor", kind: "endurance" }, request: "Chci posilovnu", weekDays, prefs, today }, { ask });
  assert.deepEqual([r.sport, r.environment, r.kind, r.minutes], ["gym", "indoor", "gym", 60]);
});

test("a gym day's note never names exercises the generator may not pick", () => {
  const [gym] = sanitizeWeekDays([{ date: "2026-10-18", sport: "gym", minutes: 60, kind: "gym", reason: "Lehčí celé tělo: rumunský mrtvý tah, bulharský dřep a addukce doplněné cvikem na vršek těla. Nohy necvič do selhání." }], { start, today, prefs });
  assert.equal(gym.reason, null);
  assert.equal(gymNote("V sobotu jedeš dlouho, posilovna je proto v neděli. Dej dřep a bench."), "V sobotu jedeš dlouho, posilovna je proto v neděli.");
  assert.equal(gymNote("Sunday is the day after your rest day. Keep 2 reps in reserve."), "Sunday is the day after your rest day.");
  const [ride] = sanitizeWeekDays([{ date: "2026-10-18", sport: "ride", minutes: 60, kind: "endurance", reason: "Klidná jízda, žádné série." }], { start, today, prefs });
  assert.equal(ride.reason, "Klidná jízda, žádné série.");
});

test("a note never promises a harder session or intervals the checks and library won't give", async () => {
  // Three hard days in a row: the second and third are eased and say why.
  const days = sanitizeWeekDays([
    { date: "2026-10-13", sport: "ride", minutes: 60, kind: "threshold", reason: "Práh 3×12 min na 260 W. Klíčový den." },
    { date: "2026-10-14", sport: "ride", minutes: 60, kind: "vo2max", reason: "VO2max, ať se posuneš." },
    { date: "2026-10-15", sport: "run", minutes: 45, kind: "tempo", reason: "Tempo běh." },
    { date: "2026-10-17", sport: "ride", minutes: 60, kind: "threshold", reason: "Další práh." }
  ], { start, today, prefs });
  assert.equal(days[0].reason, "Klíčový den.");
  assert.equal(days[1].kind, "endurance");
  assert.match(days[1].reason, /Lehčí trénink: vedle je jiný tvrdý den/);
  assert.equal(days[3].kind, "endurance");
  assert.match(days[3].reason, /dva tvrdé dny/);
  assert.equal(days.eased, 2);
  assert.equal(gymNote("Horní polovina těla, nohy šetříme. Den po volnu."), "Den po volnu.");
  // The AI's week summary goes when days were eased.
  const ask = async () => ({ text: JSON.stringify({ summary: "Úterý a středa práh.", requested: [], days: [{ date: "2026-10-14", sport: "ride", minutes: 60, environment: "outdoor", kind: "threshold", reason: "" }, { date: "2026-10-15", sport: "ride", minutes: 60, environment: "outdoor", kind: "threshold", reason: "" }] }) });
  const week = await proposeWeekAI({}, { start, today }, { prefs, ask });
  assert.equal(week.summary, null);
  // "Upravit s AI": a harder session next to another hard day says it stayed easy.
  const adjusted = await adjustByText({}, { session: { date: "2026-10-17", sport: "ride", minutes: 60, environment: "outdoor", kind: "endurance" }, request: "chci práh", weekDays: [start, "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"], otherSessions: [{ date: "2026-10-18", kind: "vo2max" }], prefs, today }, { ask: async () => ({ text: JSON.stringify({ date: "2026-10-17", sport: "ride", minutes: 60, environment: "outdoor", kind: "threshold", note: "Změnil jsem to na práh 3×10." }) }) });
  assert.equal(adjusted.kind, "endurance");
  assert.match(adjusted.note, /vedle je jiný tvrdý den/);
});
