import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleWorkoutTemplatesApi, publicSharePage, cleanTemplate, templateFromRows } from "../src/workout-templates.js";
import { scriptPolicy } from "../src/web-security.js";
import { templateStrengthPlan, EXERCISES } from "../src/strength-generator.js";
import { readRoutines, withRoutines } from "../src/stretching.js";
import { planValues } from "../src/gym-plan-store.js";
import { enduranceStructure, enduranceSystem, zwoFile } from "../src/endurance-templates.js";
import { getWorkout, catalog } from "../src/workout-library.js";

const ORIGIN = "https://aurin.health";
const env = (raw, id) => ({ DB: scopedDb(raw, id), RAW_DB: raw, USER_ID: id });
const session = name => ({ signedIn: true, user: { name } });
async function call(raw, id, method, path, body, name = "Petr Bouma") {
  const url = new URL(ORIGIN + path);
  const request = new Request(url, { method, headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const response = await handleWorkoutTemplatesApi(request, env(raw, id), url, session(name));
  return { status: response.status, body: await response.json() };
}
const legs = { sport: "gym", name: "Nohy", minutes: 60, exercises: [{ name: "Pivot leg press", sets: 4, reps: "8-12" }, { name: "Prone leg curl Prime", sets: 3, reps: "10" }] };

test("a workout is checked before it is saved", () => {
  assert.deepEqual(cleanTemplate(legs).exercises[0], { name: "Pivot leg press", sets: 4, reps: "8–12" });
  assert.throws(() => cleanTemplate({ ...legs, name: " " }), /Pojmenuj/);
  assert.throws(() => cleanTemplate({ ...legs, exercises: [] }), /aspoň jeden/);
  assert.throws(() => cleanTemplate({ ...legs, exercises: [{ name: "Dřep", sets: 0, reps: "8" }] }), /sérií/);
  assert.throws(() => cleanTemplate({ ...legs, exercises: [{ name: "Dřep", sets: 3, reps: "hodně" }] }), /Opakování/);
  assert.equal(cleanTemplate({ ...legs, exercises: [{ name: "Plank", sets: 3, reps: "30 s" }] }).exercises[0].reps, "30 s");
});

test("a saved gym day becomes a workout of its work sets", () => {
  const t = templateFromRows([
    ["WARMUP", "Pivot leg press", "1", "40", "8"], ["WORK", "Pivot leg press", "1", "80", "10"], ["WORK", "Pivot leg press", "2", "80", "10"], ["WORK", "Cable curl", "1", "20", "12"]
  ], "Dnešní trénink", 55);
  assert.deepEqual(t.exercises, [{ name: "Pivot leg press", sets: 2, reps: "10" }, { name: "Cable curl", sets: 1, reps: "12" }]);
  assert.equal(t.minutes, 55);
});

test("own workouts are listed, edited and deleted", async () => {
  const raw = createD1();
  const created = await call(raw, 1, "POST", "/app/api/my-workouts", legs);
  assert.equal(created.status, 200);
  const id = created.body.workout.id;
  assert.match(id, /^[A-Za-z0-9]{10}$/);
  assert.equal(created.body.workout.source, "own");
  const edited = await call(raw, 1, "PUT", "/app/api/my-workouts/" + id, { ...legs, name: "Nohy těžké" });
  assert.equal(edited.body.workout.name, "Nohy těžké");
  // Someone else's workout can't be seen or edited.
  assert.equal((await call(raw, 2, "GET", "/app/api/my-workouts")).body.workouts.length, 0);
  assert.equal((await call(raw, 2, "PUT", "/app/api/my-workouts/" + id, legs)).status, 404);
  assert.equal((await call(raw, 1, "GET", "/app/api/my-workouts")).body.workouts.length, 1);
  await call(raw, 1, "DELETE", "/app/api/my-workouts/" + id);
  assert.equal((await call(raw, 1, "GET", "/app/api/my-workouts")).body.workouts.length, 0);
});

test("a shared link lands once in the friend's Od přátel, with the sender's first name only", async () => {
  const raw = createD1();
  const image = Buffer.from("\x89PNG fake").toString("base64");
  const shared = await call(raw, 1, "POST", "/app/api/shares", { ...legs, image, date: "2099-01-05" });
  assert.equal(shared.status, 200);
  // The link is on aurin.health even when the app still talks to the old host.
  assert.equal(shared.body.url, "https://aurin.health/t/" + shared.body.id);
  // The friend opens it in the app.
  const seen = await call(raw, 2, "GET", "/app/api/shares/" + shared.body.id);
  assert.deepEqual([seen.body.share.name, seen.body.share.fromName, seen.body.share.own, seen.body.share.date], ["Nohy", "Petr", false, "2099-01-05"]);
  assert.ok(Array.isArray(seen.body.share.groups));
  const got = await call(raw, 2, "POST", "/app/api/my-workouts", { fromShare: shared.body.id });
  assert.deepEqual([got.body.workout.source, got.body.workout.fromName, got.body.workout.seen], ["friend", "Petr", false]);
  await call(raw, 2, "POST", "/app/api/my-workouts", { fromShare: shared.body.id });
  let list = await call(raw, 2, "GET", "/app/api/my-workouts");
  assert.equal(list.body.workouts.length, 1);
  assert.equal(list.body.unseen, 1);
  await call(raw, 2, "POST", "/app/api/my-workouts/seen", {});
  assert.equal((await call(raw, 2, "GET", "/app/api/my-workouts")).body.unseen, 0);
  // Kept among the friend's own, editable there; the received one can't be edited.
  assert.equal((await call(raw, 2, "PUT", "/app/api/my-workouts/" + got.body.workout.id, legs)).status, 404);
  const copy = await call(raw, 2, "POST", "/app/api/my-workouts", { copyOf: got.body.workout.id });
  assert.equal(copy.body.workout.source, "own");
  // The sender's own link does not land in their Od přátel.
  assert.equal((await call(raw, 1, "POST", "/app/api/my-workouts", { fromShare: shared.body.id })).body.status, "own");
  assert.equal((await call(raw, 1, "GET", "/app/api/my-workouts")).body.workouts.length, 0);
  // Nothing personal is stored with the link.
  const row = raw.sqlite.prepare("SELECT * FROM workout_shares").get();
  assert.doesNotMatch(row.template_json, /kg|Bouma/);
});

test("the link's page shows the workout and its preview image to anyone", async () => {
  const raw = createD1();
  const shared = await call(raw, 1, "POST", "/app/api/shares", { ...legs, image: Buffer.from("PNGDATA").toString("base64") });
  const url = new URL(ORIGIN + "/t/" + shared.body.id);
  const pageResponse = await publicSharePage(new Request(url), raw, url);
  const html = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(html, /<h1>Nohy<\/h1>/);
  assert.match(html, /Petr ti posílá trénink/);
  assert.match(html, /4 × 8–12/);
  assert.match(html, new RegExp('og:image" content="' + ORIGIN + "/t/" + shared.body.id + '/og.png'));
  assert.match(html, /· Aurin<\/title>/);
  assert.match(html, /og:site_name" content="Aurin"/);
  assert.match(html, /Otevřít v Aurinu/);
  assert.match(html, /Aurin bude brzy v App Store/);
  assert.doesNotMatch(html, /apple-itunes-app/);
  // With the app's App Store ID: the Safari banner, and the store when the app is missing.
  const listed = await (await publicSharePage(new Request(url), raw, url, { APP_STORE_ID: "6740000000" })).text();
  assert.match(listed, /<meta name="apple-itunes-app" content="app-id=6740000000, app-argument=https:\/\/aurin\.health\/t\//);
  assert.match(listed, /apps\.apple\.com\/app\/id6740000000/);
  const imageUrl = new URL(url + "/og.png");
  const image = await publicSharePage(new Request(imageUrl), raw, imageUrl);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(Buffer.from(await image.arrayBuffer()).toString(), "PNGDATA");
  const missing = new URL(ORIGIN + "/t/AAAAAAAAAA");
  assert.equal((await publicSharePage(new Request(missing), raw, missing)).status, 404);
  assert.equal(await publicSharePage(new Request(new URL(ORIGIN + "/privacy")), raw, new URL(ORIGIN + "/privacy")), null);
  // A name can't inject markup into the page.
  const evil = await call(raw, 1, "POST", "/app/api/shares", { ...legs, name: "<script>x</script>" });
  const evilUrl = new URL(ORIGIN + "/t/" + evil.body.id);
  const evilPage = await publicSharePage(new Request(evilUrl), raw, evilUrl);
  assert.doesNotMatch(await evilPage.text(), /<script>x/);
  // Only the page's own script may run (web-security.js).
  for (const response of [pageResponse, evilPage]) assert.match(response.headers.get("Content-Security-Policy"), /script-src 'sha256-[^' ]+'$/);
  assert.equal(pageResponse.headers.get("Content-Security-Policy"), scriptPolicy(html));
});

test("planned for the athlete, a shared workout keeps its exercises and sets but not anyone's weights", () => {
  const plan = templateStrengthPlan({ date: "2026-10-13", athleteState: {}, strength: { recentCompletedSets: [] } }, cleanTemplate({ ...legs, exercises: [...legs.exercises, { name: "Můj vlastní cvik", sets: 2, reps: "12" }] }), { fromName: "Petr" });
  const work = plan.rows.filter(r => r[0] === "WORK");
  assert.deepEqual(work.filter(r => r[1] === "Pivot leg press").map(r => r[4]), ["8–12", "8–12", "8–12", "8–12"]);
  assert.equal(work.filter(r => r[1] === "Prone leg curl Prime").length, 3);
  assert.deepEqual(work.filter(r => r[1] === "Můj vlastní cvik").map(r => r[3]), ["", ""]);
  // Unknown to the app: the first set is a test set the rest follow.
  assert.match(work.find(r => r[1] === "Můj vlastní cvik")[9], /^zkušební série/);
  assert.match(work.filter(r => r[1] === "Můj vlastní cvik")[1][9], /podle zkušební série/);
  assert.equal(plan.planName, "Nohy");
  assert.match(plan.rationale, /Petr/);
  // The warm-up and the stretching come with a saved workout too.
  assert.ok(plan.warmup.items.length && plan.stretching.items.length);
  assert.equal(plan.spare, null);
  // Its length is the time its exercises take, never the old 600-minute limit.
  assert.ok(plan.timing.requestedMinutes > 0 && plan.timing.requestedMinutes < 120);
  assert.equal(templateStrengthPlan({ date: "2026-10-13", athleteState: {}, strength: { recentCompletedSets: [] } }, cleanTemplate({ ...legs, minutes: 45 })).timing.requestedMinutes, 45);
});

test("a saved workout planned before it got its routines is read with Posilovna's warm-up, cardio and stretching", () => {
  const plan = templateStrengthPlan({ date: "2026-10-24", athleteState: {}, strength: { recentCompletedSets: [] } }, cleanTemplate(legs));
  const old = planValues({ ...plan, warmup: null, stretching: null, cardio: null, spare: null });
  old[4] = ["Časový limit (min)", 600, "Odhad (min)", 57];
  assert.deepEqual(old[5], []);
  const read = withRoutines(old, { warmup: true, stretching: true, cardio: "end", cardioType: "treadmill" }, name => EXERCISES[name]?.muscle);
  const routines = readRoutines(read);
  assert.ok(routines.warmup.items.length && routines.stretching.items.length);
  assert.deepEqual(routines.cardio, { type: "treadmill", start: null, end: 10, length: 0 });
  assert.deepEqual(read[4], ["Časový limit (min)", 57, "Odhad (min)", 57]);
  assert.deepEqual(read.slice(6), old.slice(6));
  // A plan that has them stays as it is.
  const current = planValues(plan);
  assert.deepEqual(withRoutines(current, { warmup: false }, name => EXERCISES[name]?.muscle), current);
});

const ride = { sport: "ride", name: "Sweet spot 3×15", blocks: [
  { repeats: 1, steps: [{ label: "Rozjetí", seconds: 900, low: 56, high: 75 }] },
  { repeats: 3, steps: [{ label: "Sweet spot", seconds: 900, low: 88, high: 93, cadence: 90 }, { label: "Volně", seconds: 300, low: 45, high: 55 }] },
  { repeats: 1, steps: [{ label: "Vyjetí", seconds: 600, low: 45, high: 55 }] }
] };
const run = { sport: "run", name: "Kilometrovky", blocks: [
  { repeats: 1, steps: [{ label: "Rozběh", km: 2, low: 78, high: 88 }] },
  { repeats: 6, steps: [{ label: "Rychle", km: 1, low: 102, high: 106 }, { label: "Klus", seconds: 120, low: 70, high: 77 }] }
] };

test("a ride or run keeps its sections, repeats and % ranges", () => {
  const t = cleanTemplate(ride);
  assert.equal(t.blocks.length, 3);
  assert.deepEqual(t.blocks[1].steps[0], { label: "Sweet spot", low: 88, high: 93, seconds: 900, cadence: 90 });
  assert.equal(cleanTemplate(run).blocks[0].steps[0].km, 2);
  assert.throws(() => cleanTemplate({ ...ride, blocks: [] }), /úsek/);
  assert.throws(() => cleanTemplate({ ...ride, blocks: [{ repeats: 40, steps: [{ seconds: 60, low: 90, high: 95 }] }] }), /opakování/);
  assert.throws(() => cleanTemplate({ ...ride, blocks: [{ repeats: 1, steps: [{ seconds: 60, low: 10, high: 20 }] }] }), /Intenzita/);
  // A distance only when running.
  assert.equal(cleanTemplate({ ...ride, blocks: [{ repeats: 1, steps: [{ km: 3, seconds: 600, low: 60, high: 70 }] }] }).blocks[0].steps[0].km, undefined);
  // Distances become minutes at the athlete's own threshold pace.
  const slow = enduranceStructure(cleanTemplate(run), { thresholdPace: 300 }), fast = enduranceStructure(cleanTemplate(run), { thresholdPace: 240 });
  assert.ok(slow[0].durationMinutes > fast[0].durationMinutes);
  assert.equal(enduranceSystem(enduranceStructure(cleanTemplate(ride)), "ride"), "sweet_spot");
  assert.match(zwoFile(cleanTemplate(ride)), /<SteadyState Duration="900" Power="0.905" Cadence="90"\/>/);
});

test("a saved ride is listed with the athlete's rows, planned and shared with its graph", async () => {
  const raw = createD1();
  const saved = await call(raw, 1, "POST", "/app/api/my-workouts", ride);
  assert.equal(saved.status, 200);
  const w = saved.body.workout;
  assert.equal(w.sport, "ride");
  assert.equal(w.minutes, 85);
  assert.equal(w.steps[1].repeats, 3);
  assert.deepEqual([w.steps[1].steps[0].percentLow, w.steps[1].steps[0].percentHigh], [88, 93]);
  // Planned: a library workout "own-<id>" in the calendar.
  raw.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))");
  const planned = await call(raw, 1, "POST", "/app/api/my-workouts/" + w.id + "/schedule", { date: "2099-02-01", environment: "indoor" });
  assert.equal(planned.status, 200, JSON.stringify(planned.body));
  const plannedId = planned.body.workout.id;
  assert.match(plannedId, /^own-[A-Za-z0-9]{10}$/);
  const lib = await getWorkout(scopedDb(raw, 1), plannedId);
  assert.equal(lib.duration_minutes, 85);
  assert.match(lib.intervals_description, /88-93%/);
  assert.equal(await getWorkout(scopedDb(raw, 2), plannedId), null);
  // The link's page draws the sections and offers the Zwift file.
  const shared = await call(raw, 1, "POST", "/app/api/shares", ride);
  const url = new URL(ORIGIN + "/t/" + shared.body.id);
  const html = await (await publicSharePage(new Request(url), raw, url)).text();
  assert.match(html, /class="graph"/);
  assert.match(html, /3× Sweet spot \/ Volně/);
  assert.match(html, /workout\.zwo/);
  const zwoUrl = new URL(url + "/workout.zwo");
  const zwo = await publicSharePage(new Request(zwoUrl), raw, zwoUrl);
  assert.match(await zwo.text(), /<sportType>bike<\/sportType>/);
  // A friend's copy plans with the friend's pace; gym planning refuses it.
  const got = await call(raw, 2, "POST", "/app/api/my-workouts", { fromShare: shared.body.id });
  assert.equal(got.body.workout.sport, "ride");
  assert.equal((await call(raw, 2, "POST", "/app/api/gym/template", { template: ride })).status, 400);
});

test("editing a saved ride and planning it again leaves the day planned before as it was", async () => {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))");
  const short = { sport: "ride", name: "Moje jízda", blocks: [{ repeats: 1, steps: [{ seconds: 1800, low: 60, high: 70 }] }] };
  const w = (await call(raw, 1, "POST", "/app/api/my-workouts", short)).body.workout;
  const monday = await call(raw, 1, "POST", "/app/api/my-workouts/" + w.id + "/schedule", { date: "2099-02-02" });
  assert.equal(monday.status, 200, JSON.stringify(monday.body));
  // Unchanged, it plans with the same copy.
  const again = await call(raw, 1, "POST", "/app/api/my-workouts/" + w.id + "/schedule", { date: "2099-02-03" });
  assert.equal(again.body.workout.id, monday.body.workout.id);
  assert.equal((await call(raw, 1, "PUT", "/app/api/my-workouts/" + w.id, { ...short, blocks: [{ repeats: 1, steps: [{ seconds: 5400, low: 60, high: 70 }] }] })).status, 200);
  const thursday = await call(raw, 1, "POST", "/app/api/my-workouts/" + w.id + "/schedule", { date: "2099-02-05" });
  assert.notEqual(thursday.body.workout.id, monday.body.workout.id);
  const db = scopedDb(raw, 1);
  assert.equal((await getWorkout(db, monday.body.workout.id)).duration_minutes, 30);
  assert.equal((await getWorkout(db, thursday.body.workout.id)).duration_minutes, 90);
  // Deleting the saved workout keeps what the days planned from it show.
  await call(raw, 1, "DELETE", "/app/api/my-workouts/" + w.id);
  assert.equal((await getWorkout(db, monday.body.workout.id)).duration_minutes, 30);
});

test("a library ride becomes an own workout with its ranges", async () => {
  const raw = createD1();
  const lib = (await catalog(scopedDb(raw, 1), "ride")).find(w => /sweet/i.test(w.primary_system || ""));
  const saved = await call(raw, 1, "POST", "/app/api/my-workouts", { fromLibrary: lib.id });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.workout.name, lib.name);
  assert.ok(Math.abs(saved.body.workout.minutes - lib.duration_minutes) <= 1);
});

test("a planned ride, or the plan a done one fulfilled, turns into an own workout to save or share", async () => {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))");
  const event = { name: "VO2 5×4", type: "Ride", workout_doc: { steps: [{ duration: 600, power: { start: 50, end: 70, units: "%ftp" } }, { reps: 5, steps: [{ duration: 240, power: { value: 115, units: "%ftp" } }, { duration: 240, power: { value: 55, units: "%ftp" } }] }] } };
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,payload_json) VALUES(1,'intervals','planned-workout','planned:77',?)").run(JSON.stringify(event));
  const r = await call(raw, 1, "GET", "/app/api/my-workouts/from-planned?id=planned:77");
  assert.equal(r.status, 200);
  assert.equal(r.body.template.sport, "ride");
  assert.equal(r.body.template.name, "VO2 5×4");
  assert.equal(r.body.template.blocks.at(-1).repeats, 5);
  // Another athlete's plan is not found.
  assert.equal((await call(raw, 2, "GET", "/app/api/my-workouts/from-planned?id=planned:77")).status, 404);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM saved_workouts").get().n, 0, "nothing is saved");
});

test("deleting an own workout ends the links it was shared by, not a friend's saved copy", async () => {
  const raw = createD1();
  const saved = await call(raw, 1, "POST", "/app/api/my-workouts", legs);
  const shared = await call(raw, 1, "POST", "/app/api/shares", legs);
  const other = await call(raw, 1, "POST", "/app/api/shares", { ...legs, name: "Jiné nohy" });
  const friend = await call(raw, 2, "POST", "/app/api/my-workouts", { fromShare: shared.body.id });
  assert.equal(friend.status, 200);
  await call(raw, 1, "DELETE", "/app/api/my-workouts/" + saved.body.workout.id);
  assert.equal((await call(raw, 2, "GET", "/app/api/shares/" + shared.body.id)).status, 404);
  assert.equal((await call(raw, 2, "GET", "/app/api/shares/" + other.body.id)).status, 200, "another workout's link stays");
  assert.equal((await call(raw, 2, "GET", "/app/api/my-workouts")).body.workouts.length, 1, "the friend keeps the copy");
});

test("Popiš slovy sends the athlete's FTP or threshold pace, so watts and paces convert exactly", async () => {
  const { describeInput } = await import("../src/workout-templates.js");
  assert.deepEqual(JSON.parse(describeInput("ride", "3×10 na 280 W", { ftp: 280.4 })).threshold, { ftpWatts: 280 });
  assert.deepEqual(JSON.parse(describeInput("run", "5×1 km za 4:10", { runThresholdPace: 265 })).threshold, { thresholdPace: "4:25/km", thresholdPaceSeconds: 265 });
  assert.equal(JSON.parse(describeInput("ride", "hodinu lehce", null)).threshold, null);
});

test("Popiš slovy a swim: CSS and pool go along, lengths end at the wall, rests stay rests", async () => {
  const { describeInput, describedTemplate } = await import("../src/workout-templates.js");
  const input = JSON.parse(describeInput("swim", "8×100 na 1:40 s 20 s pauzou", { swimCss: 105, poolLength: 50 }));
  assert.deepEqual(input.threshold, { css: "1:45/100m", cssSeconds: 105 });
  assert.equal(input.poolLengthMeters, 50);
  assert.equal(JSON.parse(describeInput("swim", "lehce 1 km", null)).poolLengthMeters, 25);
  const t = describedTemplate("swim", { name: "Práh 8×100", blocks: [
    { repeats: 1, steps: [{ label: "Rozplavání", meters: 310, seconds: null, rest: false, low: 85, high: 90 }] },
    { repeats: 8, steps: [{ label: "Práh", meters: 100, seconds: null, rest: false, low: 103, high: 107 }, { label: "Pauza", meters: null, seconds: 20, rest: true, low: 0, high: 0 }] }
  ] }, { poolLength: 50 });
  assert.equal(t.sport, "swim");
  assert.equal(t.blocks[0].steps[0].meters, 300, "rounded to the 50 m pool");
  assert.deepEqual(t.blocks[1].steps[1], { label: "Pauza", rest: true, seconds: 20 });
  assert.equal(t.blocks[1].repeats, 8);
});
