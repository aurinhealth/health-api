import test from "node:test";
import assert from "node:assert/strict";
import {TOOLS} from "../src/mcp.js";

test("MCP exposes cycling workout library tools",()=>{
  const names=new Set(TOOLS.map(x=>x.name));
  for(const name of ["searchCyclingWorkouts","getCyclingCapabilities","scheduleCyclingWorkout","recordCyclingWorkoutFeedback"])assert.ok(names.has(name),name);
  const schedule=TOOLS.find(x=>x.name==="scheduleCyclingWorkout");
  assert.deepEqual(schedule.inputSchema.required,["workoutId","date","confirm"]);
  assert.equal(schedule.annotations.readOnlyHint,false);
});

test("workout search MCP supports the primary personalization filters",()=>{
  const tool=TOOLS.find(x=>x.name==="searchCyclingWorkouts");
  const props=tool.inputSchema.properties;
  for(const key of ["system","durationMinutes","targetLoad","maxDifficulty","readiness","hardBikeDaysRolling7d","phase","limit"])assert.ok(props[key],key);
});
