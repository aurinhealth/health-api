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
import { FOCUS_OF, kindOfSystem } from '../src/week-ai.js';
import { buildCyclingCoachV2 } from '../src/cycling-coach-v2.js';
import { CYCLING_WORKOUTS, generateWorkout, getCapabilities, getWorkout, scheduleWorkoutInIntervals } from '../src/workout-library.js';
import { storeLocalEvent, syncLocalWorkout, completeLocalWorkout } from '../src/local-workouts.js';
import { generateStrengthPlan, plannedSessionFromRows, weeklyGymDays } from '../src/strength-generator.js';
import { readGymPlan, writeStrengthPlanToDb } from '../src/gym-plan-store.js';
import { writeStrengthPlanToIntervals } from '../src/intervals-strength.js';
import { exerciseMuscles } from '../src/fitness-insights.js';
import { internalHeaders } from '../src/internal-auth.js';
import { exercisePreferences } from '../src/exercise-feedback.js';
import { searchWorkoutLibrary, parseWorkoutSearchFilters, stepRows } from '../src/workout-library.js';
import { athleteSteps } from '../src/workout-explanation.js';
import { fewMatches } from '../src/ai-workout-compose.js';
import { systemOf } from '../src/training-plans.js';
import { isHardKind } from '../src/session-intensity.js';

const today = '2026-10-07';
const source = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
const coachInbox = readFileSync(new URL('../src/coach-inbox.js', import.meta.url), 'utf8');
// The dashboard API's route modules, called from handleDashboardApi in order.
const routeModules = ['routes-account.js', 'routes-sync.js', 'routes-gym.js', 'routes-training.js', 'routes-food.js', 'routes-cycle.js', 'routes-journal.js']
  .map(file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'));
const gateway = readFileSync(new URL('../src/strength-gateway.js', import.meta.url), 'utf8');
const slice = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to));
const setBudget = (db, minutes) => saveWeekPlan(db, { availability: Array.from({ length: 7 }, () => ({ minutes })) });

// Run the real HTTP handlers, generators and SQL storage with fixed coach data.
// Only the external data loaders and the surrounding Worker dispatch are fixtures.
async function api(minutes) {
  const raw = createD1(), db = scopedDb(raw, 1), env = { DB: db, USER_ID: 1 };
  raw.sqlite.exec('CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))');
  await setBudget(db, minutes);
  const context = vm.createContext({
    Request, Response, URL, console, crypto, lang: () => 'cs', L: cs => cs, internalHeaders,
    getWeekPlan, availabilityOn, trainingBudget, parseTimeWindow, roleFor, targetFor,
    validTrainingDay: validDay, mondayOfDate: weekStartOf, localToday: () => today,
    getAthleteState, assertTrainingAllowed, environmentFor, indoorMinutes,
    buildCyclingCoachV2, FOCUS_OF, kindOfSystem, isHardKind, generateWorkout, getCapabilities, getWorkout, scheduleWorkoutInIntervals,
    storeLocalEvent, syncLocalWorkout, completeLocalWorkout, generateStrengthPlan, plannedSessionFromRows, weeklyGymDays,
    readGymPlan, writeStrengthPlanToDb, writeStrengthPlanToIntervals, exerciseMuscles, exercisePreferences,
    weekWeather: async () => ({}), computeWeekTargets: async () => ({ items: [] }), planForWeek: async () => ({ plan: null, pw: null, roles: {}, load: null, apply: t => t }), activePlan: async () => null, gymPhaseFor: () => null,
    cached: async (_env, _ctx, _key, load) => load(), athleteThresholds: async () => ({ ftp: 250 }),
    loadCoachInputs: async (_env, _ctx, _auth, date) => ({
      date, week: { days: [] }, fitness: { wellness: [{ id: date, ctl: 60, atl: 50 }] },
      health: { sleep: [{ type: 'sleep', durationMin: 480, endTime: date + 'T06:00:00' }] }
    }),
    buildStrengthContext: async (_env, date) => ({ status: 'ok', date, strength: { recentCompletedSets: [] }, cycling: { recentActivities: [], plannedWorkouts: [] }, recovery: {} }),
    ensureCurrentWorkoutSafeToReplace: async () => ({ status: 'ok' }), nutritionFor: async () => ({}),
    handleWorkoutTemplatesApi: async () => undefined,
    searchWorkoutLibrary, parseWorkoutSearchFilters, fewMatches, stepRows, athleteSteps, systemOf, reconcileWorkoutLibraryCompletions: async () => {}, rideFtpFor: t => ({ ftp: t.ftp, estimated: false }), explainWorkout: () => ({ title: '' })
  });
  vm.runInContext(slice(coachInbox, 'async function ensureCoachInboxTable(', '\n// Earlier proposals of the assistant'), context);
  for (const text of routeModules) vm.runInContext(text.replace(/^import .*$/gm, '').replace(/^export /gm, ''), context);
  vm.runInContext(slice(source, 'async function handleDashboardApi(', '\n// The concrete workout'), context);
  vm.runInContext(slice(source, 'async function defaultDayCoach(', '\n// The athlete\'s ratings since a day'), context);
  vm.runInContext(slice(source, 'async function workoutPreview(', '\nfunction logoResponse('), context);
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
  }, async get(path) {
    const url = new URL('https://internal' + path);
    const response = await context.handleDashboardApi(new Request(url), env, {}, url, { signedIn: true });
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
  // The week plan's detail draws the workout from its step rows.
  assert.ok(result.data.workout.steps?.length > 0);
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
  assert.ok(ride.data.workout.steps?.length > 0);
  assert.ok(ride.data.workout.steps.flatMap(b => b.steps).some(x => x.durationSeconds > 0));
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

test('a resize keeps its length; generation and the focused gym keep the week plan\'s day limit', async () => {
  const app = await api(0), workout = CYCLING_WORKOUTS.find(w => w.duration_minutes === 60 && w.primary_system === 'endurance');
  const resized = await app.post('/app/api/workouts/generate', { date: today, environment: 'indoor', sport: 'ride', workoutId: workout.id, resizeTo: 180 });
  assert.equal(resized.status, 200, resized.data.message);
  assert.equal(resized.data.workout.duration_minutes, 180);
  const day = await app.post('/app/api/workouts/generate', { date: today, environment: 'indoor', variant: 0, sport: 'ride' });
  assert.equal(day.status, 400);
  assert.match(day.data.message, /nemáš dost času/);
  // Training time is set only in the week plan: the focused gym sends no
  // length of its own, and a day without time gets no gym.
  const gym = await app.post('/app/api/gym/generate', { date: today, focusMuscles: ['chest'] });
  assert.equal(gym.status, 400);
  assert.match(gym.data.message, /30 minut/);
});

test('the library ranks by the coach\'s session, as the proposal above it, not by the whole free time', async () => {
  const app = await api(180);
  // A tired morning: short night, fatigue above fitness.
  app.context.loadCoachInputs = async (_env, _ctx, _auth, date) => ({
    date, week: { days: [] }, fitness: { wellness: [{ id: date, ctl: 50, atl: 85 }] },
    health: { sleep: [{ type: 'sleep', durationMin: 300, endTime: date + 'T06:00:00' }] }
  });
  const coach = await app.context.defaultDayCoach(app.env, await app.context.loadCoachInputs(app.env, {}, null, today), today, 'ride', { prefs: await getWeekPlan(app.db, today), plan: null, targets: null });
  const session = coach.recommendation.session.durationMinutes;
  assert.ok(session < 180, 'the fixture coach wants less than the free time');
  const list = await app.get('/app/api/workouts/search?sport=ride&environment=outdoor&limit=10');
  assert.equal(list.status, 200, list.data.message);
  assert.equal(list.data.coachPick.durationMinutes, session);
  const kind = coach.recommendation.session.kind;
  assert.equal(list.data.coachPick.system, kind === 'long_endurance' ? 'endurance' : kind === 'vo2' ? 'vo2max' : kind);
  assert.ok(Math.abs(list.data.workouts[0].duration_minutes - session) <= 30, `top workout ${list.data.workouts[0].duration_minutes} min vs ${session}`);
});

test('Doporučená in the library keeps to the day\'s time in the week plan; a picked length does not', async () => {
  const app = await api(45);
  const list = await app.get('/app/api/workouts/search?sport=ride&environment=outdoor&limit=40');
  assert.equal(list.status, 200, list.data.message);
  assert.ok(list.data.workouts.length > 0);
  assert.ok(list.data.workouts.every(w => w.duration_minutes <= 45), list.data.workouts.map(w => w.duration_minutes).join(','));
  const picked = await app.get('/app/api/workouts/search?sport=ride&environment=outdoor&limit=40&duration=120&durationTolerance=15');
  assert.ok(picked.data.workouts.some(w => w.duration_minutes > 45));
});

test('the library asks for the AI\'s own workout only when few of the chosen type are left', async () => {
  const app = await api(180);
  const all = await app.get('/app/api/workouts/search?sport=ride&environment=outdoor&limit=40');
  assert.equal(all.data.compose, false, 'Doporučený has plenty');
  const rare = await app.get('/app/api/workouts/search?sport=ride&environment=indoor&limit=40&system=vo2max&duration=30&durationTolerance=5&minDifficulty=9&maxDifficulty=10');
  assert.equal(rare.status, 200, rare.data.message);
  assert.equal(rare.data.compose, rare.data.workouts.filter(w => w.primary_system === 'vo2max').length < 3);
  assert.equal(rare.data.compose, true, rare.data.workouts.map(w => w.name).join(', '));
});

test('a harder kind asked in "Upravit s AI" is ridden; one the coach eases says what it became', async () => {
  const app = await api(120);
  // VO₂max intervals yesterday: the 48 h rule keeps today easy, unless the athlete insists.
  const yesterday = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  app.context.loadCoachInputs = async (_env, _ctx, _auth, date) => ({
    date, week: { days: [{ date: yesterday, daily: { training: { completed: [{ date: yesterday, name: 'VO2max intervals', type: 'Ride', tss: 90, durationHours: 1.25 }], planned: [] } } }] },
    fitness: { wellness: [{ id: date, ctl: 60, atl: 55 }] },
    health: { sleep: [{ type: 'sleep', durationMin: 480, endTime: date + 'T06:00:00' }] }
  });
  const body = { date: today, sport: 'ride', environment: 'outdoor', availabilityMinutes: 90, focus: 'vo2max', userInitiated: true };
  const plain = await app.post('/app/api/workouts/generate', body);
  assert.equal(plain.status, 200, plain.data.message);
  assert.notEqual(plain.data.system, 'vo2max');
  assert.equal(plain.data.eased.kind, kindOfSystem(plain.data.system));
  assert.ok(plain.data.eased.why);
  const insisted = await app.post('/app/api/workouts/generate', { ...body, insisted: true });
  assert.equal(insisted.status, 200, insisted.data.message);
  assert.equal(insisted.data.system, 'vo2max');
  assert.equal(insisted.data.eased, undefined);
});

test('the quick gym from Svaly takes the usual length, capped by the day\'s free time', async () => {
  const app = await api(45);
  const capped = await app.post('/app/api/gym/generate', { date: today, preview: true, userInitiated: true, autoLength: true, usualMinutes: 75, focus: 'upper' });
  assert.equal(capped.status, 200, capped.data.message);
  assert.equal(capped.data.minutes, 45);
  assert.equal(capped.data.plan.timing.requestedMinutes, 45);
  await setBudget(app.db, 150);
  const usual = await app.post('/app/api/gym/generate', { date: today, preview: true, userInitiated: true, autoLength: true, usualMinutes: 60, focus: 'upper' });
  assert.equal(usual.data.minutes, 60);
  const none = await app.post('/app/api/gym/generate', { date: today, preview: true, userInitiated: true, autoLength: true, focus: 'upper' });
  assert.equal(none.data.minutes, 60);
  // A rest day (0 min) does not block the athlete's own tap.
  await setBudget(app.db, 0);
  const rest = await app.post('/app/api/gym/generate', { date: today, preview: true, userInitiated: true, autoLength: true, usualMinutes: 45, focus: 'upper' });
  assert.equal(rest.status, 200, rest.data.message);
  assert.equal(rest.data.minutes, 45);
});
