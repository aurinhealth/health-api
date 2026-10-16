import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntervalsDescription, parseStepLine, structureFromWorkoutDoc, plannedEventWorkout, structureMinutes } from '../src/planned-detail.js';
import { stepRows } from '../src/workout-explanation.js';

test('Intervals.icu workout text becomes steps and repeat blocks',()=>{
  const s=parseIntervalsDescription('Warmup\n- 15m ramp 50-75%\n\nMain set 3x\n- 12m 88-93% 90rpm\n- 4m 55%\n\nCooldown\n- 10m Z1\n\nDrž kadenci a pij každých 15 minut.');
  assert.deepEqual(s[0],{durationMinutes:15,ramp:true,powerStart:50,powerEnd:75});
  assert.equal(s[1].repeats,3);assert.equal(s[1].note,'Main set');
  assert.deepEqual(s[1].steps[0],{durationMinutes:12,power:91,powerLow:88,powerHigh:93,cadence:'90'});
  assert.equal(s[2].power,50);
  assert.equal(Math.round(structureMinutes(s)),73);
  assert.deepEqual(parseStepLine('- 1h30m 60-72% 85-95rpm'),{durationMinutes:90,power:66,powerLow:60,powerHigh:72,cadence:'85–95'});
  assert.equal(parseStepLine('- 30s 120%').durationMinutes,0.5);
  assert.equal(parseStepLine('- 5m easy').free,true);
  assert.equal(parseStepLine('- nothing here'),null);
});

test('the step table keeps the planned range in watts',()=>{
  const [row]=stepRows(parseIntervalsDescription('- 12m 88-93%'),{ftp:250,environment:'indoor'});
  assert.deepEqual([row.steps[0].percentLow,row.steps[0].percentHigh,row.steps[0].wattsLow,row.steps[0].wattsHigh],[88,93,220,233]);
});

test('a structured workout_doc wins over the text and an event becomes a workout',()=>{
  const doc={steps:[{duration:600,power:{start:50,end:70,units:'%ftp'},ramp:true},{reps:4,steps:[{duration:240,power:{value:110,units:'%ftp'},cadence:{value:95}},{duration:120,power:{value:3,units:'power_zone'}}]}]};
  const s=structureFromWorkoutDoc(doc);
  assert.deepEqual(s[0],{durationMinutes:10,ramp:true,powerStart:50,powerEnd:70});
  assert.deepEqual(s[1].steps.map(x=>x.power),[110,82]);assert.equal(s[1].steps[0].cadence,'95');
  const w=plannedEventWorkout({name:'VO2 4×4',type:'VirtualRide',moving_time:3600,icu_training_load:70,workout_doc:doc,description:'- 99m 10%'});
  assert.deepEqual([w.sport,w.environment,w.duration_minutes,w.target_load],['ride','indoor',60,70]);
  assert.equal(JSON.parse(w.structure_json).length,2);
  assert.ok(Math.abs(w.intensity_factor-Math.sqrt(70/100))<1e-9);
  const run=plannedEventWorkout({name:'Lehký běh',type:'Run',description:'- 40m 75%'});
  assert.deepEqual([run.sport,run.environment,run.duration_minutes],['run','outdoor',40]);
});
test('without FTP or threshold pace each step gets the heart-rate zone of its power or pace zone',()=>{
  const hrZones=[{zone:1,bpmLow:null,bpmHigh:130},{zone:2,bpmLow:131,bpmHigh:145},{zone:3,bpmLow:146,bpmHigh:155},{zone:4,bpmLow:156,bpmHigh:165},{zone:5,bpmLow:166,bpmHigh:190}];
  const [easy,hard]=stepRows([{durationMinutes:20,power:65},{durationMinutes:5,power:110}],{environment:'indoor',hrZones}).map(b=>b.steps[0]);
  assert.deepEqual([easy.hrLow,easy.hrHigh,hard.hrLow,hard.hrHigh],[131,145,166,190]);
  assert.equal(stepRows([{durationMinutes:20,power:65}],{ftp:250,environment:'indoor',hrZones})[0].steps[0].hrLow,undefined);
  const run=stepRows([{durationMinutes:20,power:97}],{sport:'run',environment:'indoor',hrZones})[0].steps[0];
  assert.deepEqual([run.hrLow,run.hrHigh],[156,165]);
});
