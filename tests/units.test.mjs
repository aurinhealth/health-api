// Units (A4): the device sends X-Units, the server remembers it per user like
// the language, and rule-based texts and AI notes follow it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { withLang, withUnits, units, isImperial, lang, normalizeUnits, storedUnits, rememberUnits, storedLanguage, rememberLanguage, aiLanguageNote, _resetLanguagesForTest } from "../src/lang.js";
import { buildRunReview } from "../src/run-review.js";
import { buildGymReview } from "../src/gym-review.js";
import { GYM_PLAN_COLUMNS } from "../src/gym-plan-store.js";

test("units live beside the language in the request context, metric by default", () => {
  assert.equal(units(), "metric");
  assert.equal(isImperial(), false);
  assert.deepEqual(["imperial", "Imperial", "metric", "", null, "furlongs"].map(normalizeUnits), ["imperial", "imperial", "metric", "metric", "metric", "metric"]);
  withUnits("imperial", () => {
    assert.equal(isImperial(), true);
    // Setting the language inside keeps the units, and the other way round.
    withLang("en", () => { assert.equal(lang(), "en"); assert.equal(units(), "imperial"); });
    withUnits("metric", () => assert.equal(units(), "metric"));
  });
  withLang("en", () => withUnits("imperial", () => { assert.equal(lang(), "en"); assert.equal(isImperial(), true); }));
});

test("the request header is read next to the language and the cron wrapper uses the remembered units", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /request\.headers\.get\('X-Units'\)/);
  assert.match(entry, /if \(user && headerUnits\) await rememberUnits\(rawEnv\.DB, user\.id, headerUnits, language\);/);
  assert.match(entry, /withLang\(language, \(\) => withUnits\(unitsChoice, \(\) => withTimeZone\(zone, \(\) => routeRequest\(/);
  assert.match(entry, /unitsChoice = await storedUnits\(env\.DB, user\.id\);\s*results\.push\(\{ userId: user\.id, result: await withLang\(language, \(\) => withUnits\(unitsChoice,/);
});

test("the units are remembered per user in the language table, also for a table made before units existed", async () => {
  _resetLanguagesForTest();
  const db = createD1();
  assert.equal(await storedUnits(db, 1), "metric");
  await rememberUnits(db, 1, "imperial", "en");
  assert.equal(await storedUnits(db, 1), "imperial");
  assert.equal(await storedLanguage(db, 1), "en", "a first-seen user's row carries the request language");
  await rememberLanguage(db, 1, "cs");
  _resetLanguagesForTest();
  assert.deepEqual([await storedLanguage(db, 1), await storedUnits(db, 1, { fresh: true })], ["cs", "imperial"]);
  assert.equal(await storedUnits(db, 2), "metric");
  // An older database has user_language without the units column.
  _resetLanguagesForTest();
  const old = createD1();
  old.sqlite.exec("CREATE TABLE user_language (user_id INTEGER PRIMARY KEY, language TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO user_language(user_id,language) VALUES (3,'en')");
  assert.equal(await storedUnits(old, 3), "metric");
  await rememberUnits(old, 3, "imperial");
  assert.deepEqual([await storedLanguage(old, 3, { fresh: true }), await storedUnits(old, 3, { fresh: true })], ["en", "imperial"]);
  assert.equal(await storedUnits(null, 3), "metric");
});

test("the AI is told to write pounds and miles for an imperial athlete", () => {
  withLang("en", () => {
    assert.doesNotMatch(aiLanguageNote("day-review"), /pounds/);
    withUnits("imperial", () => {
      assert.match(aiLanguageNote("day-review"), /UNITS: .*pounds, miles, feet\/inches, °F and fl oz; the data is metric, convert it\./);
      assert.match(aiLanguageNote("assistant"), /language the athlete writes in.*UNITS:/s);
      assert.equal(aiLanguageNote("food-sentence"), "");
    });
  });
  withUnits("imperial", () => assert.match(aiLanguageNote("reflection"), /JEDNOTKY: .*libry \(lb\), míle/));
});

// 5×5 min at threshold with 1 min jogs; threshold pace 5:00/km (3.333 m/s).
const description = "Warmup\n- 12m 78% rozklus\n\n5x\n- 5m 99%\n- 1m 72% klus\n\nCooldown\n- 8m 76% výklus";
const sp = secPerKm => 1000 / secPerKm, iv = (start, seconds, pace, hr, maxHr) => ({ start, seconds, speed: sp(pace), hr, maxHr });
const intervals = [iv(0, 720, 330, 140, 152),
  iv(720, 300, 302, 165, 170), iv(1020, 60, 360, 158, 165), iv(1080, 300, 300, 168, 173), iv(1380, 60, 400, 160, 166),
  iv(1440, 300, 304, 170, 175), iv(1740, 60, 410, 161, 167), iv(1800, 300, 312, 172, 177), iv(2100, 60, 420, 162, 168),
  iv(2160, 300, 318, 174, 179), iv(2460, 60, 430, 163, 168)];
const activity = { id: "activity:r1", type: "Run", name: "Threshold reps 5×5 min", start: "2026-10-07T07:00:00", durationHours: 2520 / 3600, tss: 70 };
const runReview = () => buildRunReview({ activity, detail: { activity: { distance: 8100 }, intervals }, plan: { description, tss: 65, durationHours: 50 / 60 }, date: "2026-10-07", thresholdPace: 300 });

test("the run review talks in pace per mile for an imperial athlete; the data stays metric", () => {
  const r = withLang("en", () => withUnits("imperial", runReview));
  assert.equal(r.chart.refLabel, "threshold 8:03/mi");
  assert.deepEqual(r.table.rows[0], ["1", "8:06/mi · 5:00", "165 / 170"]);
  assert.match(JSON.stringify(r), /the last was 26 s\/mi slower/);
  assert.deepEqual(r.actions, ["Completed: 42 min · 5 mi · 70 TSS."]);
  const metric = withLang("en", runReview);
  assert.equal(metric.chart.refLabel, "threshold 5:00/km");
  assert.match(JSON.stringify(metric), /the last was 16 s\/km slower/);
});

test("the gym review shows loads in pounds for an imperial athlete", () => {
  const date = "2026-10-07";
  const set = (exercise, no, pkg, preps, kg, reps, rpe) => ["WORK", exercise, no, pkg, preps, kg, reps, rpe, "TRUE", "", "", "FALSE", ""];
  const values = [["PLAN"], [""], ["Datum", date, "", "Upper A"], [], [], [], GYM_PLAN_COLUMNS, set("DB bench press", 1, 24, "8-10", 24, 10, 7), set("DB bench press", 2, 24, "8-10", 24, 10, 7.5), set("DB bench press", 3, 24, "8-10", 24, 10, 8)];
  const history = [{ workout_date: "2026-10-03", exercise: "DB bench press", actual_kg: 22, actual_reps: 10, rpe: 8 }];
  const r = withLang("en", () => withUnits("imperial", () => buildGymReview({ values, history, date }))), text = JSON.stringify(r);
  assert.deepEqual(r.table.rows[0], ["DB bench press", "3× 52.9 lb × 8-10", "52.9×10, 52.9×10, 52.9×10", "8"]);
  assert.match(text, /estimated max 70\.5 lb, 5\.9 lb more than on 10\/3/);
  assert.match(text, /DB bench press 60\.6 lb \(\+7\.7\)/);
  assert.match(text, /Volume 1,587 lb/);
  assert.doesNotMatch(text, / kg/);
  // RPE is never converted.
  assert.equal(r.table.rows[0][3], "8");
  const metric = withLang("en", () => buildGymReview({ values, history, date }));
  assert.deepEqual(metric.table.rows[0], ["DB bench press", "3× 24 kg × 8-10", "24×10, 24×10, 24×10", "8"]);
});
