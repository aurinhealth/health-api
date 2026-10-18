import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";
import { CATALOG, DEFAULT_PINNED, CATEGORIES, normalizeCustomItem, itemView, catalogItem, usualPart } from "../src/journal-catalog.js";
import { percentEffect, impactOf, thresholdOf, rankImpacts, newDiscovery, dayState, itemDetail, morningMetrics, timeLevel, levelTime, shiftDay } from "../src/journal-impact.js";
import { saveJournalEntry, listJournalEntries, getJournalSettings, saveCustomItem, autoDays, sickDays, caffeineMg, alcoholDrinks, setJournalOptions, setFixed } from "../src/journal-store.js";
import { journalDay, journalCard, journalCatalog, thresholdText, waitingText, valueText, handleJournalApi, journalForCoach } from "../src/routes-journal.js";
import { exportPages } from "../src/account-data.js";
import { localToday } from "../src/user-time.js";
import { coachContext } from "../src/coach-assistant.js";
import { appleRow } from "../src/apple-health.js";

const today = "2026-10-15";
const days = (n, fn) => Array.from({ length: n }, (_, i) => fn(shiftDay(today, -(i + 1)), i));
// Mornings keyed by the morning's date: readiness after ✓ days 60, after ✕ days 75.
const morningsFor = (list, yesValue, noValue, metric = "readiness") => Object.fromEntries(list.map(d => [shiftDay(d.date, 1), { [metric]: d.yes ? yesValue : noValue }]));

test("the catalogue has over 100 items in both languages, unique keys and six categories", () => {
  assert.ok(CATALOG.length >= 100, String(CATALOG.length));
  assert.equal(new Set(CATALOG.map(i => i.key)).size, CATALOG.length);
  for (const i of CATALOG) {
    assert.ok(CATEGORIES.includes(i.cat), i.key);
    assert.ok(i.cs && i.en, i.key);
    assert.ok(["yesno", "amount", "time", "scale"].includes(i.type), i.key);
  }
  assert.deepEqual(CATEGORIES.filter(c => !CATALOG.some(i => i.cat === c)), []);
  assert.equal(DEFAULT_PINNED.length, 9);
  assert.ok(DEFAULT_PINNED.every(k => catalogItem(k)));
  assert.equal(withLang("en", () => itemView(catalogItem("phone_in_bed")).name), "Phone in bed");
  assert.equal(withLang("cs", () => itemView(catalogItem("phone_in_bed")).name), "Mobil v posteli");
  // Sauna's follow-ups: minutes and the temperature chips.
  assert.deepEqual(withLang("cs", () => itemView(catalogItem("sauna")).follow.map(f => [f.label, f.kind])), [["Kolik minut", "stepper"], ["Teplota", "chips"]]);
});

test("a custom item keeps its name, type, unit, usual amount, time of asking and category", () => {
  const item = normalizeCustomItem({ name: "  Ashwagandha  ", type: "amount", unit: "mg", usual: 600, when: "morning", category: "supplements" }, "c_abc123");
  assert.deepEqual([item.name, item.type, item.unit, item.usual, item.step, item.when, item.cat], ["Ashwagandha", "amount", "mg", 600, 100, "morning", "supplements"]);
  assert.equal(normalizeCustomItem({ name: "Kreatin", type: "amount", unit: "g", usual: 5 }, "c_x12345").step, 1);
  assert.equal(normalizeCustomItem({ name: "Večerka", type: "time", when: "evening", category: "nope" }, "c_x12345").cat, "supplements");
  assert.throws(() => withLang("cs", () => normalizeCustomItem({ name: " " }, "c_x12345")), /název/);
});

test("impact: ✓ mean against ✕ mean in whole percent, resting heart rate turned so that + helps", () => {
  assert.equal(percentEffect(61, 74, "readiness"), -18);
  assert.equal(percentEffect(80, 74, "hrv"), 8);
  // A lower resting heart rate after ✓ days helps.
  assert.equal(percentEffect(50, 55, "rhr"), 9);
  assert.equal(percentEffect(58, 53, "rhr"), -9);
  assert.equal(percentEffect(70, 70, "readiness"), 0);
  assert.equal(Object.is(percentEffect(70, 70, "rhr"), -0), false);
  assert.equal(percentEffect(70, 0, "readiness"), null);
});

test("no impact without 5 ✓ and 5 ✕ mornings; illness days left out", () => {
  const list = days(20, (date, i) => ({ date, yes: i < 4 }));
  const r = impactOf(list, "readiness", morningsFor(list, 60, 75));
  assert.deepEqual([r.yes, r.no, r.effect], [4, 16, null]);
  const more = days(20, (date, i) => ({ date, yes: i < 6 }));
  assert.equal(impactOf(more, "readiness", morningsFor(more, 60, 75)).effect, -20);
  // Two of the ✓ days were ill: 4 left, no impact.
  const excluded = new Set([more[0].date, more[1].date]);
  assert.equal(impactOf(more, "readiness", morningsFor(more, 60, 75), { excluded }).effect, null);
  // Unanswered days count on neither side.
  const gaps = more.map((d, i) => (i % 2 ? { ...d, yes: null } : d));
  assert.deepEqual((({ yes, no }) => [yes, no])(impactOf(gaps, "readiness", morningsFor(more, 60, 75))), [3, 7]);
  // A morning without the value counts on neither side.
  assert.equal(impactOf(more, "hrv", morningsFor(more, 60, 75)).no, 0);
});

test("ranking from most helpful to most harmful, the rest waiting with what is missing", () => {
  const a = days(30, (date, i) => ({ date, yes: i % 3 === 0 }));
  const mornings = Object.fromEntries(a.map((d, i) => [shiftDay(d.date, 1), { readiness: d.yes ? 80 : 70, hrv: 50 + i }]));
  const series = [
    { key: "alcohol", days: a.map(d => ({ ...d, yes: !d.yes })) },
    { key: "sauna", days: a },
    { key: "cold_exposure", days: a.slice(0, 7) },
    { key: "nap", days: [] }
  ];
  const { ranked, waiting } = rankImpacts(series, "readiness", mornings);
  assert.deepEqual(ranked.map(r => [r.key, r.effect]), [["sauna", 14], ["alcohol", -13]]);
  assert.deepEqual(ranked[0].yes + ranked[0].no, 30);
  assert.deepEqual(waiting.map(w => [w.key, w.yes, w.no, w.needYes, w.needNo]), [["cold_exposure", 3, 4, 2, 1]]);
  assert.deepEqual(newDiscovery(ranked, ["sauna"]).key, "alcohol");
  assert.equal(newDiscovery(ranked, ["sauna", "alcohol"]), null);
  assert.equal(newDiscovery([{ key: "x", effect: 4 }], []), null);
});

test("the threshold of a quantity picks the cut with the largest effect, both sides 5 days", () => {
  // 0, 1 and 3 drinks: one drink is about nothing, two and more cost a lot.
  const list = days(30, (date, i) => ({ date, level: [0, 1, 3][i % 3], yes: i % 3 > 0 }));
  const mornings = Object.fromEntries(list.map(d => [shiftDay(d.date, 1), { readiness: d.level >= 2 ? 55 : 72 }]));
  const t = thresholdOf(list, "readiness", mornings);
  assert.deepEqual(t, { cut: 3, effect: -24, above: 10, below: 20 });
  const alcohol = catalogItem("alcohol");
  assert.equal(withLang("cs", () => thresholdText(alcohol, list, t)), "Od 3 nápojů výš je to −24 %");
  assert.equal(withLang("en", () => thresholdText(alcohol, list, t)), "From 3 drinks up it is −24 %");
  assert.equal(withLang("cs", () => thresholdText(alcohol, list, { ...t, cut: 2 })), "Od 2 nápojů výš je to −24 %");
  // The cut at the first ✓ amount says nothing more than ✓ against ✕.
  assert.equal(thresholdText(alcohol, list, { cut: 1, effect: -20 }), null);
  assert.equal(thresholdText(alcohol, list, { cut: 3, effect: -3 }), null);
  // Not 5 days on each side: none.
  assert.equal(thresholdOf(list.slice(0, 8), "readiness", mornings), null);
  // A time: from 21:00 on.
  const late = catalogItem("late_meal");
  assert.equal(withLang("cs", () => thresholdText(late, [], { cut: timeLevel("21:00"), effect: -9 })), "Od 21:00 dál je to −9 %");
  assert.equal(levelTime(timeLevel("00:30")), "00:30");
  assert.ok(timeLevel("00:30") > timeLevel("23:00"));
});

test("a day's state: the athlete's answer wins over the day's data; unanswered is not ✕", () => {
  const alcohol = catalogItem("alcohol"), late = catalogItem("late_meal"), sauna = catalogItem("sauna"), stress = catalogItem("stress");
  assert.deepEqual(dayState(sauna, null, null), { yes: null, level: null });
  assert.deepEqual(dayState(sauna, { answer: 0 }, null), { yes: false, level: null });
  assert.deepEqual(dayState(sauna, { answer: 1 }, null), { yes: true, level: null });
  assert.deepEqual(dayState(alcohol, null, { amount: 2, time: "21:40" }), { yes: true, level: 2 });
  assert.deepEqual(dayState(alcohol, { answer: 0, amount: 0 }, { amount: 2 }), { yes: false, level: 0 });
  assert.deepEqual(dayState(late, null, { time: "19:10" }), { yes: false, level: timeLevel("19:10") });
  assert.deepEqual(dayState(late, null, { time: "21:15" }), { yes: true, level: timeLevel("21:15") });
  assert.deepEqual(dayState(stress, { answer: 1, amount: 4 }, null), { yes: true, level: 4 });
  assert.deepEqual(dayState(stress, { answer: 1, amount: 2 }, null), { yes: false, level: 2 });
  assert.equal(withLang("cs", () => valueText(alcohol, { yes: true, amount: 2, time: "21:40" })), "2 · do 21:40");
  assert.equal(withLang("en", () => valueText(catalogItem("caffeine"), { yes: true, amount: 180, time: "15:10" })), "180 mg · last 15:10");
  assert.equal(valueText(catalogItem("magnesium"), { yes: true, amount: 300 }), "300 mg");
  assert.equal(withLang("cs", () => valueText(catalogItem("melatonin"), { yes: true, amount: 0.5 })), "0,5 mg");
});

test("waiting texts say how many more days with ✓ or ✕", () => {
  withLang("cs", () => {
    assert.equal(waitingText({ needYes: 2, needNo: 0 }), "Vliv ukážu po 2 dalších dnech s ✓");
    assert.equal(waitingText({ needYes: 1, needNo: 0 }), "Vliv ukážu po 1 dalším dni s ✓");
    assert.equal(waitingText({ needYes: 0, needNo: 3 }), "Vliv ukážu po 3 dalších dnech s ✕");
    assert.equal(waitingText({ needYes: 3, needNo: 1 }), "Vliv ukážu po 3 dalších dnech s ✓ a 1 s ✕");
  });
  assert.equal(withLang("en", () => waitingText({ needYes: 1, needNo: 0 })), "I'll show the effect after 1 more day with ✓");
});

test("the morning metrics come from the same wellness and nights as Health", () => {
  const wellness = days(10, date => ({ id: shiftDay(date, 1), hrv: 60, restingHR: 52 }));
  const sessions = [{ date: today, durationMin: 430, startTime: shiftDay(today, -1) + "T22:50:00Z", endTime: today + "T06:00:00Z", stages: { DEEP: 71 } }];
  const m = morningMetrics({ from: shiftDay(today, -3), to: today, health: { wellness }, fitness: {}, sleep: { sessions }, profile: {} });
  assert.deepEqual([m[today].hrv, m[today].rhr, m[today].sleep, m[today].deep], [60, 52, 430, 71]);
  assert.equal(m[shiftDay(today, -1)].sleep, null);
  // The detail: 30 mornings with the ✓ days marked.
  const list = days(20, (date, i) => ({ date, yes: i < 6 }));
  const d = itemDetail(list, "readiness", morningsFor(list, 60, 75), { today });
  assert.equal(d.chart.length, 20);
  assert.equal(d.chart.at(-1).yes, true);
  assert.deepEqual(d.compare.find(c => c.metric === "readiness"), { metric: "readiness", yes: 60, no: 75 });
  assert.deepEqual(d.compare.find(c => c.metric === "hrv"), { metric: "hrv", yes: null, no: null });
});

test("answers are stored per day and item; null clears back to unanswered", async () => {
  const db = scopedDb(createD1(), 3);
  const settings = await getJournalSettings(db);
  assert.deepEqual(settings.pinned, DEFAULT_PINNED);
  await saveJournalEntry(db, settings, { date: "2026-10-14", key: "sauna", answer: 1, extra: { minutes: 15, temp: 90, bogus: 3 } });
  await saveJournalEntry(db, settings, { date: "2026-10-14", key: "phone_in_bed", answer: 0 });
  await saveJournalEntry(db, settings, { date: "2026-10-14", key: "alcohol", answer: 1, amount: 0 });
  await saveJournalEntry(db, settings, { date: "2026-10-14", key: "mood", amount: 4 });
  await assert.rejects(saveJournalEntry(db, settings, { date: "2026-10-14", key: "mood", amount: 9 }));
  await assert.rejects(saveJournalEntry(db, settings, { date: "2026-10-14", key: "nope", answer: 1 }));
  let rows = await listJournalEntries(db, "2026-10-01", "2026-10-31");
  assert.deepEqual(rows.map(r => [r.key, r.answer, r.amount]).sort(), [["alcohol", 0, 0], ["mood", 1, 4], ["phone_in_bed", 0, null], ["sauna", 1, null]]);
  assert.deepEqual(rows.find(r => r.key === "sauna").extra, { minutes: 15, temp: 90 });
  await saveJournalEntry(db, settings, { date: "2026-10-14", key: "sauna", answer: null });
  rows = await listJournalEntries(db, "2026-10-01", "2026-10-31");
  assert.equal(rows.some(r => r.key === "sauna"), false);
  // An own item is pinned at the end and can be answered.
  const { item } = await saveCustomItem(db, { name: "Ashwagandha", type: "amount", unit: "mg", usual: 600 });
  const next = await getJournalSettings(db);
  assert.equal(next.pinned.at(-1), item.key);
  await saveJournalEntry(db, next, { date: "2026-10-14", key: item.key, answer: 1, amount: 600 });
  const catalog = await withLang("cs", () => journalCatalog(db));
  assert.equal(catalog.count, CATALOG.length + 1);
  assert.equal(catalog.items.find(i => i.key === item.key).pinned, true);
  await saveCustomItem(db, { remove: item.key });
  assert.equal((await getJournalSettings(db)).pinned.includes(item.key), false);
});

function dataDb(userId = 5) {
  const raw = createD1(), db = scopedDb(raw, userId);
  raw.sqlite.exec(`CREATE TABLE health_datapoints (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT NOT NULL DEFAULT '{}', record_role TEXT DEFAULT 'primary');
    CREATE INDEX idx_health_datapoints_user_0 ON health_datapoints(user_id, data_type, sample_time DESC);
    CREATE TABLE fluid_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, consumed_at TEXT NOT NULL, ml INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'water', created_at TEXT, source TEXT, external_id TEXT, app TEXT);
    CREATE INDEX idx_fluid_log_user_date ON fluid_log(user_id, date);
    CREATE TABLE food_logs (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, consumed_at TEXT, recipe_title TEXT, note TEXT, kcal REAL NOT NULL DEFAULT 0, status TEXT);
    CREATE INDEX idx_food_logs_user ON food_logs(user_id, consumed_date, consumed_at);`);
  const fluid = raw.sqlite.prepare("INSERT INTO fluid_log(user_id,date,consumed_at,ml,kind) VALUES(?,?,?,?,?)");
  const food = raw.sqlite.prepare("INSERT INTO food_logs(user_id,consumed_date,consumed_at,recipe_title,note) VALUES(?,?,?,?,?)");
  const activity = raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,payload_json) VALUES(?,?,?,?,?,?)");
  return { raw, db, fluid, food, activity, userId };
}

test("the day's data fills in alcohol, caffeine, the last meal and an evening workout", async () => {
  const { db, fluid, food, activity, userId } = dataDb();
  const d = "2026-10-14";
  fluid.run(userId, d, d + "T08:00", 200, "coffee");
  fluid.run(userId, d, d + "T15:10", 40, "coffee");
  fluid.run(userId, d, d + "T20:00", 500, "beer");
  fluid.run(userId, d, d + "T21:40", 150, "wine");
  fluid.run(userId, d, d + "T12:00", 500, "water");
  // Someone else's drink is not ours.
  fluid.run(userId + 1, d, d + "T23:00", 500, "beer");
  food.run(userId, d, d + "T12:30:00", "Kuře s rýží", "{}");
  food.run(userId, d, d + "T21:15:00", "Toust", "{}");
  activity.run(userId, "intervals", "activity", "a1", d + "T19:00:00", JSON.stringify({ type: "Ride", start_date_local: d + "T19:00:00", moving_time: 3600 }));
  activity.run(userId, "intervals", "activity", "a2", d + "T07:00:00", JSON.stringify({ type: "Run", start_date_local: d + "T07:00:00", moving_time: 1800 }));
  const auto = await autoDays(db, "2026-10-13", d);
  assert.deepEqual(auto[d].alcohol, { amount: 2, time: "21:40" });
  assert.deepEqual(auto[d].caffeine, { amount: 145, time: "15:10" });
  assert.deepEqual(auto[d].late_caffeine, { yes: true });
  assert.deepEqual(auto[d].late_meal, { time: "21:15" });
  assert.deepEqual(auto[d].evening_training, { time: "19:00" });
  assert.equal(auto["2026-10-13"], undefined);
  assert.equal(Math.round(caffeineMg("food", 250, "Red Bull")), 80);
  assert.equal(caffeineMg("food", 300, "Heřmánkový čaj"), 0);
  assert.equal(alcoholDrinks("food", 80, "Slivovice"), 2);
  // The journal day shows them as answered from the data; Today's card lists them.
  const day = await withLang("cs", () => journalDay(db, d, today));
  const items = day.sections.flatMap(s => s.items);
  assert.deepEqual(items.filter(i => i.fromData).map(i => [i.key, i.value]), [["caffeine", "145 mg · do 15:10"], ["outdoors", null], ["evening_training", "19:00"], ["late_meal", "21:15"], ["alcohol", "2 · do 21:40"]]);
  // By part of the day and time; the row's value without the time.
  assert.deepEqual(day.sections.map(s => [s.title, s.items.map(i => i.key)]), [["Přes den", ["caffeine", "outdoors"]], ["Večer", ["evening_training", "late_meal", "alcohol", "sauna"]], ["Noc", ["phone_in_bed", "late_bed"]], ["Dnešní noc", ["sleep_away"]]]);
  assert.deepEqual(items.filter(i => i.key === "alcohol" || i.key === "late_meal").map(i => i.short), [null, "2 nápoje"]);
  assert.deepEqual([day.answered, day.total], [5, 9]);
  assert.deepEqual(day.week.map(w => w.state), ["empty", "empty", "partial", "empty", "future", "future", "future"]);
  // More from the same day: coffee, too little water, no energy drink, no big dinner, a training day.
  assert.deepEqual(auto[d].coffee_cups, { amount: 2, time: "15:10" });
  assert.deepEqual([auto[d].little_water, auto[d].energy_drink, auto[d].heavy_dinner, auto[d].rest_day], [{ yes: true }, { yes: false }, { yes: false }, { yes: false }]);
  const card = await withLang("cs", () => journalCard(db, today, 7));
  assert.deepEqual([card.date, card.open, card.answered, card.total], [d, 4, 5, 9]);
  assert.equal(await journalCard(db, today, 3), null);
});

test("Vždy ne / Vždy ano fills the days from then on, the day's data and own answers win", async () => {
  const { db, fluid, userId } = dataDb(11);
  const d = shiftDay(today, -1), before = shiftDay(today, -3);
  await setFixed(db, "alcohol", 0, shiftDay(today, -2));
  await setFixed(db, "sauna", 1, shiftDay(today, -2));
  const day = await withLang("cs", () => journalDay(db, d, today));
  const items = day.sections.flatMap(s => s.items);
  const alcohol = items.find(i => i.key === "alcohol"), sauna = items.find(i => i.key === "sauna");
  assert.deepEqual([alcohol.fixed, alcohol.answer, alcohol.short], [0, 0, "vždy ne"]);
  assert.deepEqual([sauna.fixed, sauna.answer, sauna.short], [1, 1, "vždy ano"]);
  // Not before it was set.
  const earlier = (await journalDay(db, before, today)).sections.flatMap(s => s.items).find(i => i.key === "alcohol");
  assert.equal(earlier.answered, false);
  // A logged beer beats "Vždy ne".
  fluid.run(userId, d, d + "T20:00", 500, "beer");
  const drank = (await journalDay(db, d, today)).sections.flatMap(s => s.items).find(i => i.key === "alcohol");
  assert.deepEqual([drank.fixed, drank.answer, drank.amount], [undefined, 1, 1]);
  await assert.rejects(() => setFixed(db, "late_meal", 1, d));
  await setFixed(db, "sauna", null, d);
  assert.equal((await getJournalSettings(db)).fixed.sauna, undefined);
});

test("the nights fill in late to bed, the usual bedtime, a drink before bed and a nap", async () => {
  const { raw, db, fluid, userId } = dataDb(12);
  const insert = raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,start_time,end_time,payload_json) VALUES(?,?,?,?,?,?)");
  // Local wall-clock times; a night ends the next morning.
  const night = (date, start, end, nap = false) => insert.run(userId, "apple-health", "sleep", date + "T" + start + ":00",
    (end < start ? shiftDay(date, 1) : date) + "T" + end + ":00", JSON.stringify({ sleep: { metadata: { nap } } }));
  // Usual bedtime 22:30 for a week, then 0:15 after yesterday, a nap and a drink at 23:50.
  const d = shiftDay(today, -1);
  for (let i = 8; i >= 2; i--) night(shiftDay(today, -i), "22:30", "06:30");
  night(today, "00:15", "07:00");
  night(d, "14:00", "14:25", true);
  fluid.run(userId, d, d + "T23:50", 300, "water");
  const auto = await autoDays(db, shiftDay(today, -8), d);
  assert.equal(auto[shiftDay(today, -3)].late_bed.yes, false);
  assert.deepEqual([auto[d].late_bed.yes, auto[d].regular_bedtime.yes, auto[d].drink_before_bed.yes, auto[d].nap.yes], [true, false, true, true]);
  assert.equal(auto[shiftDay(today, -2)].regular_bedtime?.yes, true);
});

test("the morning sheet goes once yesterday is answered, put away, or Deník is off", async () => {
  const db = scopedDb(createD1(), 8);
  const settings = await getJournalSettings(db);
  const d = shiftDay(today, -1);
  assert.deepEqual([settings.enabled, settings.askMorning], [true, true]);
  assert.equal((await journalCard(db, today, 8)).open, 9);
  await setJournalOptions(db, { askMorning: false });
  assert.equal((await journalCard(db, today, 8)).ask, false);
  await setJournalOptions(db, { enabled: false });
  assert.equal(await journalCard(db, today, 8), null);
  assert.equal(await journalForCoach(db, today), null);
  await setJournalOptions(db, { enabled: true, askMorning: true });
  for (const key of settings.pinned) await saveJournalEntry(db, settings, { date: d, key, answer: 0 });
  assert.equal(await journalCard(db, today, 8), null);
  // Put away: gone for the day.
  const other = scopedDb(createD1(), 9);
  const request = (path, body) => new Request("https://aurin.health" + path, { method: body ? "POST" : "GET", headers: { Origin: "https://aurin.health" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const call = (path, body) => handleJournalApi(request(path, body), { DB: other }, {}, new URL("https://aurin.health" + path), { signedIn: true });
  await call("/app/api/journal/dismiss", { date: shiftDay(localToday(), -1) });
  const answer = await (await call("/app/api/journal/today")).json();
  assert.deepEqual([answer.status, answer.card, answer.discovery], ["ok", null, null]);
});

test("illness takes days out: the journal's Nemoc, a sick check-in and the Sick status", async () => {
  const raw = createD1(), db = scopedDb(raw, 4);
  const settings = await getJournalSettings(db);
  await saveJournalEntry(db, settings, { date: "2026-10-02", key: "sick", answer: 1 });
  raw.sqlite.exec("CREATE TABLE morning_checkins (user_id INTEGER NOT NULL, date TEXT NOT NULL, feeling TEXT NOT NULL, updated_at TEXT, PRIMARY KEY (user_id, date))");
  raw.sqlite.prepare("INSERT INTO morning_checkins(user_id,date,feeling) VALUES(4,'2026-10-06','sick')").run();
  const out = await sickDays(db, "2026-10-01", "2026-10-15", { status: "sick", changedAt: "2026-10-13T08:00:00Z" });
  assert.deepEqual([...out].sort(), ["2026-10-02", "2026-10-05", "2026-10-06", "2026-10-13", "2026-10-14", "2026-10-15"]);
});

test("the routes: a day, an answer, the impact with the mornings and an item's detail", async () => {
  const db = scopedDb(createD1(), 11);
  const now = localToday();
  const request = (path, body, origin = "https://aurin.health") => new Request("https://aurin.health" + path, { method: body ? "POST" : "GET", headers: { Origin: origin }, ...(body ? { body: JSON.stringify(body) } : {}) });
  // Sauna on every third day of the last 30; readiness 80 after it, 70 otherwise.
  const list = Array.from({ length: 30 }, (_, i) => ({ date: shiftDay(now, -(i + 1)), yes: i % 3 === 0 }));
  const mornings = async () => Object.fromEntries(list.map(d => [shiftDay(d.date, 1), { readiness: d.yes ? 80 : 70, hrv: 60, rhr: d.yes ? 50 : 55, sleep: 420, deep: 60 }]));
  const call = (path, body, origin) => handleJournalApi(request(path, body, origin), { DB: db }, {}, new URL("https://aurin.health" + path), { signedIn: true }, { mornings });
  assert.equal(await handleJournalApi(request("/app/api/cycle"), { DB: db }, {}, new URL("https://aurin.health/app/api/cycle"), { signedIn: true }), undefined);
  assert.equal((await handleJournalApi(request("/app/api/journal"), { DB: db }, {}, new URL("https://aurin.health/app/api/journal"), { signedIn: false })).status, 401);
  assert.equal((await call("/app/api/journal/entry", { date: list[0].date, key: "sauna", answer: 1 }, "https://evil.example")).status, 403);
  for (const d of list) {
    const r = await call("/app/api/journal/entry", { date: d.date, key: "sauna", answer: d.yes ? 1 : 0 });
    assert.equal(r.status, 200);
  }
  const future = await call("/app/api/journal/entry", { date: shiftDay(now, 1), key: "sauna", answer: 1 });
  assert.equal(future.status, 400);
  const day = await (await call("/app/api/journal?date=" + list[0].date)).json();
  assert.equal(day.sections.flatMap(s => s.items).find(i => i.key === "sauna").answer, 1);
  const impact = await (await call("/app/api/journal/impact?metric=readiness")).json();
  assert.deepEqual(impact.items.map(i => [i.key, i.effect, i.yes, i.no]), [["sauna", 14, 10, 20]]);
  const rhr = await (await call("/app/api/journal/impact?metric=rhr")).json();
  assert.equal(rhr.items[0].effect, 9);
  const detail = await (await call("/app/api/journal/item?key=sauna&metric=readiness")).json();
  assert.equal(detail.effect, 14);
  assert.equal(detail.compare.find(c => c.metric === "sleep").yes, 420);
  assert.equal(detail.chart.length, 30);
  assert.equal(detail.threshold, null);
  // The findings are saved for the coach and the first one is a new finding, once.
  const first = await (await call("/app/api/journal/today")).json();
  assert.equal(first.discovery.key, "sauna");
  assert.equal(first.discovery.effect, 14);
  await call("/app/api/journal/dismiss", { discovery: true });
  assert.equal((await (await call("/app/api/journal/today")).json()).discovery, null);
  const coach = await journalForCoach(db, now);
  assert.deepEqual(coach.findings, [{ item: "Sauna", nextMorningReadinessPercent: 14, daysWith: 10, daysWithout: 20 }]);
  assert.deepEqual(coach.yesterday.answers, [{ item: "Sauna", answer: "yes" }]);
  // Pinning from Upravit deník keeps the order and drops unknown keys.
  const pinned = await (await call("/app/api/journal/pinned", { pinned: ["sauna", "magnesium", "nope"] })).json();
  assert.deepEqual(pinned.pinned, ["sauna", "magnesium"]);
});

test("the coach's context carries the journal only when there is one", () => {
  const base = { date: today, daily: {}, week: { days: [] }, fitness: { wellness: [] }, health: { wellness: [], sleep: [] }, gym: { history: [] } };
  assert.equal("journal" in coachContext(base), false);
  const journal = { findings: [{ item: "Alkohol", nextMorningReadinessPercent: -17, daysWith: 9, daysWithout: 52 }] };
  assert.deepEqual(coachContext({ ...base, journal }).journal, journal);
});

test("the journal's tables are personal: guarded, exported and deleted with the account", async () => {
  assert.ok("journal_entries" in PERSONAL_TABLES && "journal_settings" in PERSONAL_TABLES);
  const raw = createD1(), db = scopedDb(raw, 12);
  const settings = await getJournalSettings(db);
  await saveJournalEntry(db, settings, { date: "2026-10-14", key: "sauna", answer: 1 });
  assert.throws(() => db.prepare("SELECT * FROM journal_entries"), /Unscoped/);
  const tables = [];
  for await (const page of exportPages(raw, 12)) tables.push(page.table);
  assert.ok(tables.includes("journal_entries"));
});

test("journal reads go through the primary key, not a scan", async () => {
  const raw = createD1(), db = scopedDb(raw, 13);
  await getJournalSettings(db);
  const plan = sql => raw.sqlite.prepare("EXPLAIN QUERY PLAN " + sql).all(...Array(sql.split("?").length - 1).fill("x")).map(r => r.detail).join("; ");
  assert.match(plan("SELECT date,item_key,answer,amount,time,extra_json FROM journal_entries WHERE user_id=? AND date>=? AND date<=? ORDER BY date"), /SEARCH journal_entries USING (INDEX|PRIMARY KEY)/);
  assert.match(plan("SELECT date FROM journal_entries WHERE user_id=? AND item_key='sick' AND answer=1 AND date>=? AND date<=?"), /SEARCH journal_entries USING (INDEX|PRIMARY KEY)/);
  assert.match(plan("SELECT settings_json FROM journal_settings WHERE user_id=?"), /SEARCH journal_settings USING (INTEGER PRIMARY KEY|INDEX|PRIMARY KEY)/);
});

test("the English app gets the catalogue and the day without Czech", async () => {
  const CZECH = /[ěščřžýůňťďĚŠČŘŽÝŮŇŤĎ]/;
  const db = scopedDb(createD1(), 7);
  const catalog = await withLang("en", () => journalCatalog(db));
  assert.doesNotMatch(JSON.stringify(catalog), CZECH);
  const day = await withLang("en", () => journalDay(db, shiftDay(today, -1), today));
  assert.doesNotMatch(JSON.stringify(day), CZECH);
  assert.match(JSON.stringify(await withLang("cs", () => journalCatalog(db))), CZECH);
});

test("journal: what happened in the night up to the wake-up has its own part, asked first thing", () => {
  assert.equal(usualPart(catalogItem("early_wake")), "last_night");
  assert.equal(usualPart(catalogItem("night_noise")), "last_night");
  assert.equal(usualPart(catalogItem("late_bed")), "night");
  assert.equal(usualPart(catalogItem("morning_light")), "morning");
});

test("journal: too little water is measured against the day's drinks target", async () => {
  const { raw, db, fluid, userId } = dataDb();
  const d = "2026-10-14", e = "2026-10-15";
  // 2 l of water and 1 l of wine (wine does not count): enough for 60 kg (1.8 l), too little for 80 kg (2.4 l).
  for (const day of [d, e]) { fluid.run(userId, day, day + "T10:00", 2000, "water"); fluid.run(userId, day, day + "T20:00", 1000, "wine"); }
  const weight = raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,sample_time,value_numeric) VALUES(?,?,?,?,?)");
  weight.run(userId, "apple", "weight", d + "T07:00:00", 60);
  weight.run(userId, "apple", "weight", e + "T07:00:00", 80);
  const auto = await autoDays(db, d, e);
  assert.deepEqual([auto[d].little_water, auto[e].little_water], [{ yes: false }, { yes: true }]);
});

test("journal: Apple Health fills in mindfulness, daylight, noise in sleep, symptoms, sex, yoga, stretching and a time-zone change", async () => {
  const { raw, db, userId } = dataDb();
  const d = "2026-10-14", e = "2026-10-15", now = Date.parse("2026-10-16T12:00:00Z");
  const insert = raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,value_numeric) VALUES(?,?,?,?,?,?)");
  const put = (type, date, value) => {
    const row = appleRow({ type, id: "journal:" + type + ":" + date, date, value }, now);
    insert.run(userId, "apple-health", row.data_type, row.external_id, row.sample_time, row.value_numeric);
  };
  put("daily-mindful-minutes", d, 12);
  put("daily-daylight-minutes", d, 45); put("daily-morning-daylight-minutes", d, 15);
  put("daily-daylight-minutes", e, 10); put("daily-morning-daylight-minutes", e, 0);
  // The loudest reading in the night to the 15th belongs to the 14th's "Dnešní noc".
  put("daily-night-noise", e, 62); put("daily-night-noise", "2026-10-16", 38);
  put("daily-symptom-headache", d, 1); put("daily-symptom-body-ache", e, 1); put("daily-symptom-stomach", e, 2); put("daily-symptom-runny-nose", d, 1);
  put("daily-sexual-activity", e, 1);
  put("daily-yoga-minutes", d, 30); put("daily-stretching-minutes", e, 15);
  put("daily-time-zone-change", e, -6);
  const auto = await autoDays(db, d, e);
  const yes = date => Object.entries(auto[date]).filter(([, v]) => v.yes === true).map(([k]) => k).sort();
  assert.deepEqual(yes(d), ["headache", "meditation", "morning_light", "night_noise", "outdoors", "runny_nose", "yoga"]);
  assert.deepEqual(yes(e), ["sex", "sore_muscles", "stomach", "stretching", "time_zone"]);
  // Measured and below the line: ✕ rather than nothing.
  assert.deepEqual([auto[e].outdoors, auto[e].morning_light, auto[e].night_noise], [{ yes: false }, { yes: false }, { yes: false }]);
  // Out of range or the wrong kind of value: not stored.
  assert.equal(appleRow({ type: "daily-night-noise", id: "x", date: d, value: 200 }, now), null);
  assert.equal(appleRow({ type: "daily-time-zone-change", id: "y", date: d, value: -6 }, now).value_numeric, -6);
  assert.ok(CATALOG.filter(i => ["meditation", "night_noise", "sex", "time_zone", "stomach"].includes(i.key)).every(i => itemView(i).auto));
});
