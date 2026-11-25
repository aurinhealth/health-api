import test from 'node:test';
import assert from 'node:assert/strict';
import { gymLoadEstimate, gymAlternatives } from '../src/gym-catalog.js';
import { generateStrengthPlan, templateStrengthPlan, painfulExercises, EXERCISES } from '../src/strength-generator.js';
import { painAreas } from '../src/pain-words.js';
import { adjustGymPlan } from '../src/gym-adjust.js';

// Load ramp-back review 2026-11-25: after a break, illness or pain the coach
// must not add load (C3, C4, C5, C8, C6 gym part).
const sets = (date, exercise = 'Pendulum squat', kg = 100) => [1, 2, 3].map(set => ({ workout_date: date, exercise, set_no: set, type: 'WORK', actual_kg: kg, actual_reps: 12, planned_reps: '8–12', rpe: 7, completed: 1 }));
const history = [...sets('2026-09-20'), ...sets('2026-09-24'), ...sets('2026-09-28')];

test('C3: a swapped or added exercise holds or lowers its weight after a break', () => {
  const fresh = gymLoadEstimate('Pendulum squat', history, '2026-09-30');
  assert.ok(fresh.kg > 100, 'two days later the reps were met: one step up');
  assert.equal(gymLoadEstimate('Pendulum squat', history, '2026-10-14').kg, 100, '16 days: the weight holds');
  assert.ok(gymLoadEstimate('Pendulum squat', history, '2026-10-25').kg < 100, '27 days: lighter');
  const alt = gymAlternatives('Pivot leg press', history, [], {}, () => true, {}, '2026-10-25').find(a => a.name === 'Pendulum squat');
  if (alt) assert.ok(alt.kg < 100, 'an alternative after a long break is lighter too');
});

const context = (date, extra = {}) => ({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: history, plannedSessions: [] }, athleteState: { status: 'active', memories: [], brokenStations: [] }, ...extra });

test('C4: no extra set after two weeks without the gym', () => {
  // A good morning: before, the squat without recent load got a fourth set.
  const plan = generateStrengthPlan(context('2026-10-25', { adaptive: { recovery: { zone: 'green', score: 90, flags: [] } } }), { durationMinutes: 90 });
  assert.ok(plan.rows.some(r => r[1] === 'Pendulum squat'));
  const byExercise = new Map();
  for (const r of plan.rows.filter(r => r[0] === 'WORK')) byExercise.set(r[1], (byExercise.get(r[1]) || 0) + 1);
  for (const [name, n] of byExercise) assert.ok(n <= (Number(EXERCISES[name].sets) || 3) * (EXERCISES[name].unilateral ? 2 : 1), name + ': ' + n + ' sets');
});

const template = { sport: 'gym', name: 'Nohy', minutes: 60, exercises: [{ name: 'Pendulum squat', sets: 3, reps: '8–12' }, { name: 'Lat pulldown', sets: 3, reps: '10' }] };

test('C5: a saved workout respects a red morning, signs of illness and pain', () => {
  assert.throws(() => templateStrengthPlan(context('2026-10-01', { adaptive: { recovery: { zone: 'red', flags: [] } } }), template), /červená|red zone/);
  assert.throws(() => templateStrengthPlan(context('2026-10-01', { adaptive: { recovery: { zone: 'green', flags: ['respiration_elevated'] } } }), template), /Dech|breathing/);
  assert.throws(() => templateStrengthPlan(context('2026-10-01', { checkin: 'sick' }), template), /Nemoc|Sick/);
  const sore = context('2026-10-01', { athleteState: { status: 'active', memories: ['Bolí mě koleno'] } });
  const plan = templateStrengthPlan(sore, template);
  assert.deepEqual([...new Set(plan.rows.filter(r => r[0] === 'WORK').map(r => r[1]))], ['Lat pulldown']);
  assert.match(plan.rationale, /Pendulum squat/);
  assert.throws(() => templateStrengthPlan(sore, { ...template, exercises: [template.exercises[0]] }), /bolest|pain/);
});

test('C8: the thigh, the back of the thigh, the glutes and the ribs are body parts', () => {
  assert.deepEqual(painAreas(['Bolí mě stehno']).map(a => a.id), ['thigh']);
  assert.deepEqual(painAreas(['natažený hamstring']).map(a => a.id), ['hamstring']);
  assert.deepEqual(painAreas(['bolí mě hýždě']).map(a => a.id), ['glute']);
  assert.deepEqual(painAreas(['sore ribs']).map(a => a.id), ['ribs']);
  assert.deepEqual(painAreas(['nebolí mě stehno']), []);
  assert.deepEqual(painAreas(['Bolí mě stehenní sval']).map(a => a.id), ['thigh']);
  assert.ok(painfulExercises(['natažený hamstring']).avoid.has('Barbell Romanian deadlift'));
  assert.ok(painfulExercises(['bolí mě hýždě']).avoid.has('Hip thrust'));
  assert.ok(!painfulExercises(['bolí mě hýždě']).avoid.has('Lat pulldown'));
});

test('C6: the AI gym adjust never adds an exercise on a painful part', async () => {
  const rows = [['WORK', 'Lat pulldown', '1', '50', '10', '', '', '', 'FALSE', '', '', 'FALSE', '', '', '']];
  let seen;
  const { rows: out } = await adjustGymPlan({}, { rows, request: 'přidej nohy', taste: { memories: ['Bolí mě koleno'] }, ask: async (_e, req) => { seen = JSON.parse(req.input); return { text: JSON.stringify({ answer: 'Přidal jsem dřep.', exercises: [{ name: 'Lat pulldown', sets: [{ type: 'WORK', kg: 50, reps: '10' }] }, { name: 'Pendulum squat', sets: [{ type: 'WORK', kg: 80, reps: '10' }] }] }) }; } });
  assert.ok(!seen.catalog.some(e => e.name === 'Pendulum squat'), 'not offered to the model');
  assert.deepEqual([...new Set(out.map(r => r[1]))], ['Lat pulldown']);
});

// C7: the day coach after a break longer than its own weeks reach.
import { withLang } from '../src/lang.js';
import { buildCyclingCoachV2 } from '../src/cycling-coach-v2.js';
import { weeklyRunCap, capRunVolume } from '../src/week-planner.js';
const date = '2026-10-08';
const day = o => new Date(Date.parse(date + 'T12:00:00Z') + o * 86400000).toISOString().slice(0, 10);
const wellness = [...Array.from({ length: 20 }, (_, i) => ({ id: day(-20 + i), ctl: 70, atl: 72, hrv: 80, restingHR: 48 })), { id: date, ctl: 70, atl: 68, hrv: 80, restingHR: 48 }];
const week = (c = []) => ({ days: c.map(a => ({ date: a.date, daily: { training: { completed: [a] } } })) });
const coach = args => withLang('cs', () => buildCyclingCoachV2({ date, today: date, week: week([]), fitness: { wellness }, health: { sleep: [{ type: 'sleep', durationMin: 470, endTime: date + 'T06:30:00' }] }, gym: { history: [] }, goal: { focus: 'threshold' }, ...args })).recommendation;
const hard = ['vo2', 'threshold', 'sweet_spot', 'tempo'];

test('C7: the first day back after 30 days has no planned or asked intensity and at most 90 min', () => {
  for (const goal of [{ focus: 'threshold' }, { focus: 'threshold', asked: true, chat: true }]) {
    const r = coach({ returns: { last: { ride: day(-30) } }, goal });
    assert.ok(!hard.includes(r.session.kind), r.session.kind);
    assert.ok(r.session.durationMinutes <= 90, String(r.session.durationMinutes));
    assert.ok(r.adaptations.some(a => /30 dní bez jízdy/.test(a)));
  }
  assert.equal(coach({}).session.kind, 'threshold', 'no activity known at all says nothing about a break');
});

test('C7: days 2 to 6 back have no long session and a length cap', () => {
  const ride = coach({ week: week([{ date: day(-3), type: 'Ride', name: 'Endurance', tss: 60, durationHours: 1.25 }]), returns: { ride: day(-3), last: { ride: day(-3) } }, goal: { focus: 'long_endurance' }, availabilityMinutes: 240 });
  assert.equal(ride.session.kind, 'endurance');
  assert.ok(ride.session.durationMinutes <= 90, String(ride.session.durationMinutes));
  const run = coach({ sport: 'run', week: week([{ date: day(-3), type: 'Run', name: 'Easy', tss: 40, durationHours: 0.75 }]), returns: { run: day(-3), last: { run: day(-3) } }, goal: { focus: 'long_endurance' }, availabilityMinutes: 240 });
  assert.ok(run.session.durationMinutes <= 45, String(run.session.durationMinutes));
});

test('C7: after 30 days without a run one run in the week plan is at most 30 min', () => {
  const cap = weeklyRunCap([], '2026-10-05');
  assert.equal(cap.single, 30);
  const targets = capRunVolume({ status: 'ok', items: [{ date: '2026-10-07', sport: 'run', role: 'long', minutes: 60, intensity: 0.7 }] }, cap);
  assert.equal(targets.items[0].minutes, 30);
});

// C6: the AI's week, one changed session and the week revision keep the week plan's checks.
import { proposeWeekAI, guardSessionChange } from '../src/week-ai.js';
import { sanitizeChanges } from '../src/week-revision.js';

test('C6: the AI week has one long run, no paused sport and stays within the running cap', async () => {
  const days = [{ date: '2026-10-10', sport: 'run', minutes: 120, kind: 'long', environment: 'outdoor', reason: '' }, { date: '2026-10-11', sport: 'run', minutes: 110, kind: 'long', environment: 'outdoor', reason: '' }, { date: '2026-10-09', sport: 'swim', minutes: 45, kind: 'endurance', environment: 'indoor', reason: '' }];
  const ask = async () => ({ text: JSON.stringify({ summary: 'Dva dlouhé běhy.', requested: [], days }) });
  const facts = { start: '2026-10-05', today: '2026-10-05', readiness: { zone: 'green' } };
  const r = await proposeWeekAI({}, facts, { ask, paused: ['swim'], runCap: { cap: 150, single: 90, committed: 0 } });
  const runs = r.items.filter(x => x.sport === 'run');
  assert.ok(!r.items.some(x => x.sport === 'swim'), 'the paused swim is left out');
  assert.equal(runs.filter(x => x.kind === 'long' || x.focus === 'long_endurance').length <= 1, true, JSON.stringify(runs));
  assert.ok(runs.every(x => x.minutes <= 90), JSON.stringify(runs.map(x => x.minutes)));
  assert.ok(runs.reduce((n, x) => n + x.minutes, 0) <= 150);
  assert.equal(r.summary, null, 'no summary that still promises the AI days');
});

test('C6: one changed session keeps the pause, one long a week and the running cap', () => {
  const run = { date: '2026-10-11', sport: 'run', minutes: 60, kind: 'endurance', environment: 'outdoor' };
  assert.equal(guardSessionChange({ ...run, minutes: 90, kind: 'threshold' }, run, { paused: ['run'] }).minutes, 60);
  assert.equal(guardSessionChange({ ...run, minutes: 90, kind: 'threshold' }, run, { paused: ['run'] }).kind, 'endurance');
  assert.equal(guardSessionChange({ ...run, minutes: 40 }, run, { paused: ['run'] }).minutes, 40, 'shorter is fine');
  const second = guardSessionChange({ ...run, minutes: 120, kind: 'long' }, run, { others: [{ date: '2026-10-10', sport: 'run', kind: 'long', minutes: 100 }] });
  assert.equal(second.kind, 'endurance');
  assert.ok(second.minutes <= 60 + 0, String(second.minutes));
  assert.equal(guardSessionChange({ ...run, minutes: 120 }, run, { runCap: { cap: 200, single: 80 } }).minutes, 80);
  assert.equal(guardSessionChange({ ...run, minutes: 120 }, run, { runCap: { cap: 150, single: 200 }, others: [{ date: '2026-10-08', sport: 'run', kind: 'endurance', minutes: 80 }] }).minutes, 70);
});

test('C6: the week revision keeps the pause, one long a week and the running cap', () => {
  const upcoming = [{ eventId: 'a', date: '2026-10-10', sport: 'run', name: 'Easy', minutes: 50, kind: 'endurance' }, { eventId: 'b', date: '2026-10-11', sport: 'run', name: 'Long', minutes: 100, kind: 'long' }, { eventId: 'c', date: '2026-10-09', sport: 'ride', name: 'Ride', minutes: 40, kind: 'endurance' }];
  const out = sanitizeChanges([{ eventId: 'a', kind: 'long', minutes: 120 }, { eventId: 'c', kind: 'endurance', minutes: 60 }], upcoming, { paused: ['ride'], runCap: { cap: 200, single: 110, committed: 170 }, weekEnd: '2026-10-11', availabilityByDate: { '2026-10-10': 180, '2026-10-09': 180 } });
  assert.ok(!out.some(c => c.eventId === 'c'), 'no longer ride while it rests');
  assert.equal(sanitizeChanges([{ eventId: 'c', kind: 'endurance', minutes: 30 }], upcoming, { paused: ['ride'] })[0]?.minutes, 30, 'shorter is fine');
  const a = out.find(c => c.eventId === 'a');
  if (a) { assert.notEqual(a.kind, 'long'); assert.ok(a.minutes <= 80, String(a.minutes)); }
  assert.equal(sanitizeChanges([{ eventId: 'a', kind: 'endurance', minutes: 120 }], upcoming, { runCap: { cap: 200, single: 110, committed: 170 }, weekEnd: '2026-10-11', availabilityByDate: { '2026-10-10': 180, '2026-10-09': 180 } })[0].minutes, 80, 'the week has 30 min of running left');
  assert.equal(sanitizeChanges([{ eventId: 'a', kind: 'long', minutes: 50 }], upcoming, {}).length, 0, 'no second long run');
});

test('C7: asked again after the coach\'s concern, a long ride in the week back stands', () => {
  const r = coach({ week: week([{ date: day(-3), type: 'Ride', name: 'Endurance', tss: 60, durationHours: 1.25 }]), returns: { ride: day(-3), last: { ride: day(-3) } }, goal: { focus: 'long_endurance', asked: true, chat: true, insisted: true }, availabilityMinutes: 240 });
  assert.ok(r.session.durationMinutes > 90, String(r.session.durationMinutes));
});

test('C6: a revision makes at most one run long, and a longer run never gets shorter', () => {
  const upcoming = [{ eventId: 'a', date: '2026-10-09', sport: 'run', name: 'Easy', minutes: 50, kind: 'endurance' }, { eventId: 'b', date: '2026-10-11', sport: 'run', name: 'Easy', minutes: 50, kind: 'endurance' }];
  const out = sanitizeChanges([{ eventId: 'a', kind: 'long', minutes: 90 }, { eventId: 'b', kind: 'long', minutes: 90 }], upcoming, { availabilityByDate: { '2026-10-09': 180, '2026-10-11': 180 } });
  assert.equal(out.filter(c => c.kind === 'long').length, 1);
  const run = { date: '2026-10-11', sport: 'run', minutes: 62, kind: 'endurance' };
  assert.equal(guardSessionChange({ ...run, minutes: 120 }, run, { runCap: { cap: 64, single: 200 } }).minutes, 62);
});

// C1: what leaves the phone on a day the coach eases the plan.
import { coachEases } from '../src/week-ai.js';
import { handleWorkoutTemplatesApi } from '../src/workout-templates.js';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';

test('C1: the coach eases a hard or long plan, or cuts it for a named reason', () => {
  const vo2 = { name: 'VO2 5×4', duration_minutes: 75 }, easy = g => ({ system: 'recovery', adaptations: ['nízká připravenost'], workout: { duration_minutes: 45, ...g } });
  assert.equal(coachEases(vo2, easy()), true);
  assert.equal(coachEases(vo2, { system: 'vo2max', adaptations: [], workout: { duration_minutes: 75 } }), false, 'kept');
  assert.equal(coachEases({ name: 'Ride', intensity_factor: 0.9, duration_minutes: 60 }, { system: 'endurance', adaptations: [], workout: { duration_minutes: 60 } }), true, 'hard by its IF');
  assert.equal(coachEases({ name: 'Endurance', duration_minutes: 180 }, easy({ duration_minutes: 90 })), true, 'cut to half for a reason');
  assert.equal(coachEases({ name: 'Endurance', duration_minutes: 180 }, { system: 'endurance', adaptations: [], workout: { duration_minutes: 150 } }), false, 'shorter without a reason');
  assert.equal(coachEases(vo2, { system: 'endurance', adaptations: ['střední připravenost'], workout: { duration_minutes: 90 } }), false, 'never longer than the plan');
  assert.equal(coachEases({ name: 'Endurance', duration_minutes: 100 }, { system: 'threshold', adaptations: ['krátké okno'], workout: { duration_minutes: 70 } }), false, 'never harder than the plan');
  assert.equal(coachEases(vo2, { system: 'long_endurance', adaptations: [], workout: { duration_minutes: 75 } }), false, 'never long where the plan was not');
});

test('C1: the .zwo and .fit files of today\'s plan hold the coach\'s version', async () => {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE IF NOT EXISTS health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,start_time TEXT,sample_time TEXT,end_time TEXT,external_id TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))");
  const event = { name: 'VO2 5×4', type: 'Ride', workout_doc: { steps: [{ duration: 600, power: { start: 50, end: 70, units: '%ftp' } }, { reps: 5, steps: [{ duration: 240, power: { value: 115, units: '%ftp' } }, { duration: 240, power: { value: 55, units: '%ftp' } }] }] } };
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,payload_json) VALUES(1,'intervals','planned-workout','planned:77',?)").run(JSON.stringify(event));
  const easy = { name: 'Recovery spin', sport: 'ride', environment: 'indoor', duration_minutes: 45, structure_json: JSON.stringify([{ type: 'steady', minutes: 45, power: 55 }]) };
  const get = async (path, todayVersion) => { const url = new URL('https://aurin.health' + path); return handleWorkoutTemplatesApi(new Request(url, { headers: { Origin: url.origin } }), { DB: scopedDb(raw, 1), RAW_DB: raw, USER_ID: 1 }, url, { signedIn: true, user: { name: 'Petr' } }, { todayVersion }); };
  const zwo = await (await get('/app/api/my-workouts/from-planned.zwo?id=planned:77', async () => ({ workout: easy }))).text();
  assert.match(zwo, /Recovery spin/);
  assert.doesNotMatch(zwo, /VO2/);
  const kept = await (await get('/app/api/my-workouts/from-planned.zwo?id=planned:77', async () => null)).text();
  assert.match(kept, /VO2/);
});
