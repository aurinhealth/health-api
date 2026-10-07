import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { availabilityOn, trainingBudget, parseTimeWindow, validDay, weekStartOf } from '../src/training-availability.js';
import { getWeekPlan, saveWeekPlan, roleFor, targetFor } from '../src/week-planner.js';
import { getAthleteState, assertTrainingAllowed } from '../src/athlete-state.js';
import { environmentFor, indoorMinutes } from '../src/adaptive-week.js';
import { buildCyclingCoachV2 } from '../src/cycling-coach-v2.js';
import { CYCLING_WORKOUTS, generateWorkout, getCapabilities, scheduleWorkoutInIntervals } from '../src/workout-library.js';
import { storeLocalEvent, syncLocalWorkout, completeLocalWorkout } from '../src/local-workouts.js';
import { generateStrengthPlan } from '../src/strength-generator.js';
import { readGymPlan, writeStrengthPlanToDb } from '../src/gym-plan-store.js';
import { writeStrengthPlanToIntervals } from '../src/intervals-strength.js';
import { exerciseMuscles } from '../src/fitness-insights.js';

const today = '2026-10-07';
const source = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
const gateway = readFileSync(new URL('../src/strength-gateway.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
const slice = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to));
const setBudget = (db, minutes) => saveWeekPlan(db, { availability: Array.from({ length: 7 }, () => ({ minutes })) });

// Run the real HTTP handlers, generators and SQL storage with fixed coach data.
// Only the external data loaders and the surrounding Worker dispatch are fixtures.
async function api(minutes) {
  const raw = createD1(), db = scopedDb(raw, 1), env = { DB: db, USER_ID: 1 };
  raw.sqlite.exec('CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))');
  await setBudget(db, minutes);
  const context = vm.createContext({
    Request, Response, URL, console, crypto, lang: () => 'cs', L: cs => cs,
    getWeekPlan, availabilityOn, trainingBudget, parseTimeWindow, roleFor, targetFor,
    validTrainingDay: validDay, mondayOfDate: weekStartOf, pragueToday: () => today,
    getAthleteState, assertTrainingAllowed, environmentFor, indoorMinutes,
    buildCyclingCoachV2, generateWorkout, getCapabilities, scheduleWorkoutInIntervals,
    storeLocalEvent, syncLocalWorkout, completeLocalWorkout, generateStrengthPlan,
    readGymPlan, writeStrengthPlanToDb, writeStrengthPlanToIntervals, exerciseMuscles,
    weekWeather: async () => ({}), computeWeekTargets: async () => ({ items: [] }),
    cached: async (_env, _ctx, _key, load) => load(), athleteThresholds: async () => ({ ftp: 250 }),
    loadCoachInputs: async (_env, _ctx, _auth, date) => ({
      date, week: { days: [] }, fitness: { wellness: [{ id: date, ctl: 60, atl: 50 }] },
      health: { sleep: [{ type: 'sleep', durationMin: 480, endTime: date + 'T06:00:00' }] }
    }),
    buildStrengthContext: async (_env, date) => ({ status: 'ok', date, strength: { recentCompletedSets: [] }, cycling: { recentActivities: [], plannedWorkouts: [] }, recovery: {} }),
    ensureCurrentWorkoutSafeToReplace: async () => ({ status: 'ok' }), nutritionFor: async () => ({})
  });
  vm.runInContext(slice(source, 'async function ensureCoachInboxTable(', '\nfunction coachChannel('), context);
  vm.runInContext(slice(source, 'async function handleDashboardApi(', '\n// The concrete workout'), context);
  vm.runInContext(slice(source, 'async function workoutPreview(', '\nasync function handleAdminApi('), context);
  vm.runInContext(slice(gateway, 'async function generateStrengthPlanRoute(', '\nasync function syncStrength('), context);
  context.app = { fetch: async (request, requestEnv, ctx) => {
    const url = new URL(request.url);
    if (url.pathname === '/strength/generate-plan') return context.generateStrengthPlanRoute(requestEnv, request, url, ctx);
    assert.equal(url.pathname, '/strength/write-plan');
    return Response.json(await writeStrengthPlanToDb(requestEnv.DB, await request.json()));
  } };
  return { db, raw, context, env, async post(path, body) {
    const url = new URL('https://internal' + path);
    const response = await context.handleDashboardApi(new Request(url, { method: 'POST', headers: { Origin: url.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, {}, url, { signedIn: true });
    return { status: response.status, data: await response.json() };
  } };
}

test('manual HTTP writes save three different sports above the daily budget and allow zero availability', async () => {
  const app = await api(30);
  for (const sport of ['ride', 'run', 'gym']) {
    const result = await app.post('/app/api/workouts/manual', { date: today, name: sport, sport, minutes: 60 });
    assert.equal(result.status, 200, result.data.message);
  }
  await setBudget(app.db, 0);
  assert.equal((await app.post('/app/api/workouts/manual', { date: today, name: 'Další jízda', sport: 'ride', minutes: 90 })).status, 200);
  const rows = app.raw.sqlite.prepare('SELECT event_json FROM local_workouts WHERE user_id=1').all();
  assert.equal(rows.length, 4);
  assert.equal(rows.reduce((sum, row) => sum + JSON.parse(row.event_json).moving_time / 60, 0), 270);
  assert.equal((await getWeekPlan(app.db, today)).availability[2].minutes, 0);
  assert.equal((await app.post('/app/api/workouts/manual', { date: '2026-02-30', name: 'Invalid', sport: 'ride', minutes: 60 })).status, 400);
});

test('chat previews preserve the requested ride, run and gym length on a zero availability day', async () => {
  const app = await api(0);
  for (const [sport, minutes] of [['ride', 180], ['run', 60], ['gym', 60]]) {
    const result = await app.context.workoutPreview(app.env, {}, { date: today, sport, minutes });
    assert.equal(result.status, 'ok');
    assert.equal(sport === 'gym' ? result.plan.timing.requestedMinutes : result.workout.duration_minutes, minutes);
  }
  assert.equal((await getWeekPlan(app.db, today)).availability[2].minutes, 0);
});

test('an explicitly resized library workout keeps its chosen length even with zero availability', async () => {
  const app = await api(0), workout = CYCLING_WORKOUTS.find(w => w.duration_minutes === 60 && w.primary_system === 'endurance');
  const result = await app.post('/app/api/workouts/generate', { date: today, environment: 'indoor', workoutId: workout.id, resizeTo: 180 });
  assert.equal(result.status, 200, result.data.message);
  assert.equal(result.data.workout.duration_minutes, 180);
  const saved = await app.post('/app/api/workouts/schedule', { date: today, workoutId: result.data.workout.id, environment: 'indoor', confirm: true });
  assert.equal(saved.status, 200, saved.data.message);
});

test('gym confirmation saves the displayed proposal after the daily availability is reduced', async () => {
  const app = await api(60);
  const preview = await app.context.workoutPreview(app.env, {}, { date: today, sport: 'gym', minutes: 60 });
  await setBudget(app.db, 0);
  const result = await app.post('/app/api/gym/confirm', { draftId: preview.draftId });
  assert.equal(result.status, 200, result.data.message);
  const saved = await readGymPlan(app.db, today);
  assert.equal(saved.stored, true);
  assert.equal(saved.values[4][1], 60);
  assert.deepEqual(saved.values.slice(7).map(row => row.slice(0, 5)), preview.plan.rows.map(row => row.slice(0, 5)));
});

test('automatic generation still caps rides and gyms and rejects days with zero availability', async () => {
  const app = await api(45);
  const ride = await app.post('/app/api/workouts/generate', { date: today, sport: 'ride', environment: 'outdoor', availabilityMinutes: 180 });
  assert.equal(ride.status, 200, ride.data.message);
  assert.ok(ride.data.workout.duration_minutes <= 45);
  const gym = await app.post('/app/api/gym/generate', { date: today, preview: true, durationMinutes: 90 });
  assert.equal(gym.status, 200, gym.data.message);
  assert.equal(gym.data.plan.timing.requestedMinutes, 45);
  await setBudget(app.db, 0);
  for (const path of ['/app/api/workouts/generate', '/app/api/gym/generate']) {
    assert.equal((await app.post(path, { date: today, preview: true, availabilityMinutes: 60, durationMinutes: 60 })).status, 400);
  }
});

test('a user initiated gym request survives both HTTP generation layers without being shortened', async () => {
  const app = await api(0);
  const result = await app.post('/app/api/gym/generate', { date: today, durationMinutes: 90, userInitiated: true });
  assert.equal(result.status, 200, result.data.message);
  assert.equal((await readGymPlan(app.db, today)).values[4][1], 90);
});

test('the duration controls send user initiated requests while an automatic length keeps the day limit', async () => {
  const app = await api(0), calls = [], elements = {
    generateDate: { value: today }, generateEnvironment: { value: 'indoor' }, generateMinutes: { value: '' }, resizeGenerated: {},
    generateWorkoutBtn: {}, generatedWorkout: {}, generateFocusedGym: {}, gymFocusDate: { value: today },
    gymFocusDuration: { value: '90' }, gymFocusStatus: {}
  };
  const ui = vm.createContext({
    state: { generated: { date: today } }, statusCoachingRevision: 0, selectedGymMuscles: new Set(['chest']),
    $: id => elements[id], pragueToday: () => today, workoutSport: () => 'ride', gymDay: () => today,
    esc: String, toast() {}, renderGeneratedWorkout() {}, loadGym: async () => {}, reloadWeek() {}, openTrainingDetail() {},
    jsonFetch: async (path, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      const result = await app.post(path, body);
      if (result.status !== 200) throw new Error(result.data.message);
      return result.data;
    }
  });
  vm.runInContext(slice(client, 'async function resizeGeneratedWorkout(', '\nasync function generateWorkoutForDay('), ui);
  vm.runInContext(slice(client, 'async function generateWorkoutForDay(', '\nlet dashboardLoadRevision='), ui);
  vm.runInContext(slice(client, 'async function generateFocusedGym(', '\nwindow.addEventListener("error"'), ui);
  const workout = CYCLING_WORKOUTS.find(w => w.duration_minutes === 60 && w.primary_system === 'endurance');
  await ui.resizeGeneratedWorkout(workout.id, 180);
  assert.equal(calls[0].resizeTo, 180);
  assert.equal(ui.state.generated.workout.duration_minutes, 180);
  await ui.generateWorkoutForDay();
  assert.equal(calls[1].userInitiated, undefined);
  assert.match(elements.generatedWorkout.innerHTML, /nemáš dost času/);
  await ui.generateFocusedGym();
  assert.equal(calls[2].userInitiated, true);
  assert.equal((await readGymPlan(app.db, today)).values[4][1], 90);
});
