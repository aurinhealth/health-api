import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { coachContext, coachInstructions } from "../src/coach-assistant.js";

const day=(date,{planned=[],completed=[]}={})=>({date,daily:{training:{planned,completed}}});
const ride=(date,name,tss=80,durationHours=1.5)=>({date,name,type:"Ride",tss,durationHours});

test("red readiness removes planned intensity",()=>{
  const week={days:[
    day("2026-09-27",{completed:[ride("2026-09-27","VO2 intervals",120,1.2)]}),
    day("2026-09-26",{completed:[ride("2026-09-26","Threshold",110,1.3)]}),
    day("2026-09-25",{completed:[ride("2026-09-25","Sweet Spot",105,1.4)]}),
    day("2026-09-29",{planned:[ride("2026-09-29","Threshold 3x10",95,1.2)]})
  ]};
  const result=buildCyclingCoachV2({
    date:"2026-09-29",
    week,
    fitness:{wellness:[{id:"2026-09-29",ctl:70,atl:108,tsb:-38}]},
    health:{sleep:[{type:"sleep",durationMin:310,endTime:"2026-09-29T06:00:00"}]},
    gym:{history:[]},
    manualReadiness:20,
    availabilityMinutes:75
  });
  assert.equal(result.readiness.status,"red");
  assert.ok(["recovery","endurance"].includes(result.recommendation.session.kind));
  assert.notEqual(result.recommendation.session.kind,"threshold");
});

test("two hard rides in rolling seven days block a third hard day",()=>{
  const week={days:[
    day("2026-09-24",{completed:[ride("2026-09-24","Threshold",115,1.4)]}),
    day("2026-09-27",{completed:[ride("2026-09-27","VO2",100,1.0)]}),
    day("2026-09-29",{planned:[ride("2026-09-29","Threshold",90,1.2)]})
  ]};
  const result=buildCyclingCoachV2({
    date:"2026-09-29",week,
    fitness:{wellness:[{id:"2026-09-29",ctl:70,atl:75,tsb:-5}]},
    health:{sleep:[{type:"sleep",durationMin:450,endTime:"2026-09-29T06:30:00"}]},
    gym:{history:[]},availabilityMinutes:75
  });
  assert.equal(result.load.hardBikeDaysRolling7d,2);
  assert.equal(result.recommendation.session.kind,"endurance");
  assert.match(result.recommendation.adaptations.join(" "),/limit kvalitních dnů/);
});

test("build phase can prescribe quality when readiness and hard-day budget allow it",()=>{
  const result=buildCyclingCoachV2({
    date:"2026-09-29",
    week:{days:[]},
    fitness:{wellness:[{id:"2026-09-29",ctl:60,atl:55,tsb:5}]},
    health:{sleep:[{type:"sleep",durationMin:470,endTime:"2026-09-29T06:30:00"}]},
    gym:{history:[]},
    goal:{phase:"build",focus:"FTP"},
    availabilityMinutes:90
  });
  assert.equal(result.readiness.status,"green");
  assert.equal(result.recommendation.session.kind,"threshold");
  assert.equal(result.recommendation.session.cadence,"85–95 rpm");
});

test("coach context embeds v2 engine and keeps explicit non-affiliation",()=>{
  const context=coachContext({
    date:"2026-09-29",
    daily:{training:{planned:[],completed:[]}},
    week:{days:[]},
    fitness:{wellness:[{id:"2026-09-29",ctl:60,atl:55,tsb:5}]},
    health:{},gym:{history:[]}
  });
  assert.equal(context.cyclingCoachV2.version,"cycling-coach-v2.0-predeploy");
  assert.match(coachInstructions,/Nejsi zaměstnanec týmu UAE/);
  assert.match(coachInstructions,/TrainerRoad, JOIN nebo Xert/);
});


test("missing availability falls back to planned duration instead of 30 minutes",()=>{
  const planned=ride("2026-09-29","Endurance",70,1.5);
  const result=buildCyclingCoachV2({
    date:"2026-09-29",
    daily:{training:{planned:[planned],completed:[]}},
    week:{days:[day("2026-09-29",{planned:[planned]})]},
    fitness:{wellness:[{id:"2026-09-29",ctl:60,atl:55,tsb:5}]},
    health:{sleep:[{type:"sleep",durationMin:450,endTime:"2026-09-29T06:30:00"}]},
    gym:{history:[]}
  });
  assert.equal(result.constraints.availableMinutes,90);
});


test("VO2 recommendation uses persisted vo2max capability key",()=>{
  const result=buildCyclingCoachV2({
    date:"2026-09-29",
    week:{days:[day("2026-09-29",{planned:[ride("2026-09-29","VO2 5x4",100,1.5)]})]},
    fitness:{wellness:[{id:"2026-09-29",ctl:60,atl:55,tsb:5}]},
    health:{sleep:[{type:"sleep",durationMin:450,endTime:"2026-09-29T06:30:00"}]},
    gym:{history:[]},availabilityMinutes:90,
    capabilities:{vo2max:{level:5.8,confidence:.7}}
  });
  assert.equal(result.recommendation.progression.system,"vo2max");
  assert.equal(result.recommendation.progression.capabilityLevel,5.8);
});

test("missing recovery signals cannot appear green",()=>{
  const result=buildCyclingCoachV2({date:"2026-09-29",week:{days:[]},fitness:{wellness:[]},health:{},gym:{history:[]},goal:{phase:"build"}});
  assert.notEqual(result.readiness.status,"green");
  assert.notEqual(result.recommendation.session.kind,"vo2");
});

test("stale sleep and future wellness are not used as today's readiness",()=>{
  const result=buildCyclingCoachV2({date:"2026-09-29",week:{days:[]},fitness:{wellness:[{id:"2026-10-01",ctl:60,atl:45}]},health:{sleep:[{type:"sleep",durationMin:480,endTime:"2026-09-25T06:00:00"}]},gym:{history:[]}});
  assert.equal(result.readiness.sleepMinutes,null);
  assert.equal(result.readiness.tsb,null);
});
