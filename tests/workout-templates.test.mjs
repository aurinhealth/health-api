import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleWorkoutTemplatesApi, publicSharePage, cleanTemplate, templateFromRows } from "../src/workout-templates.js";
import { templateStrengthPlan } from "../src/strength-generator.js";

const ORIGIN = "https://petrfitnessdata.eu";
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
  assert.equal(shared.body.url, ORIGIN + "/t/" + shared.body.id);
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
  assert.doesNotMatch(await (await publicSharePage(new Request(evilUrl), raw, evilUrl)).text(), /<script>x/);
});

test("planned for the athlete, a shared workout keeps its exercises and sets but not anyone's weights", () => {
  const plan = templateStrengthPlan({ date: "2026-10-13", athleteState: {}, strength: { recentCompletedSets: [] } }, cleanTemplate({ ...legs, exercises: [...legs.exercises, { name: "Můj vlastní cvik", sets: 2, reps: "12" }] }), { fromName: "Petr" });
  const work = plan.rows.filter(r => r[0] === "WORK");
  assert.deepEqual(work.filter(r => r[1] === "Pivot leg press").map(r => r[4]), ["8–12", "8–12", "8–12", "8–12"]);
  assert.equal(work.filter(r => r[1] === "Prone leg curl Prime").length, 3);
  assert.deepEqual(work.filter(r => r[1] === "Můj vlastní cvik").map(r => r[3]), ["", ""]);
  assert.equal(plan.planName, "Nohy");
  assert.match(plan.rationale, /Petr/);
});
