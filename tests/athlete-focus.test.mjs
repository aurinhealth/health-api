import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { athleteFocus, normalizeFocus, withFocus } from "../src/athlete-focus.js";
import { normalizeProfile } from "../src/energy-profile.js";
import { coachInstructions } from "../src/coach-assistant.js";
import { reviewInstructions } from "../src/coach-review.js";
import { reflectionInstructions } from "../src/coach-reflection.js";

test("the main sport and goal are kept only with known values", () => {
  assert.deepEqual(normalizeFocus({ mainSport: "chess", sportGoal: "  FTP   300 W ", eventName: "x".repeat(200), eventDate: "2026-13-40", weeklyHours: 99 }),
    { mainSport: "general", sportGoal: "FTP 300 W", eventName: "x".repeat(120), eventDate: "", weeklyHours: null });
  const p = normalizeProfile({ mainSport: "running", eventDate: "2026-11-15", weeklyHours: "7.3" });
  assert.equal(p.mainSport, "running");
  assert.equal(p.eventDate, "2026-11-15");
  assert.equal(p.weeklyHours, 7.5);
});

test("without a focus all coaches use general fitness", () => {
  const focus=athleteFocus({}, "2026-10-03");
  assert.equal(focus.sport,'general');
  assert.equal(focus.goal,null);
  for(const base of [coachInstructions,reviewInstructions,reflectionInstructions])assert.match(withFocus(base,focus),/^Jsi profesionální trenér kondice \(vytrvalost i síla\)\./);
  assert.equal(withFocus(coachInstructions, null), coachInstructions);
});

test("the coach's role and direction follow the main sport and goal", () => {
  const focus = athleteFocus({ mainSport: "running", sportGoal: "maraton pod 3:30", eventName: "Pražský maraton", eventDate: "2026-11-15", weeklyHours: 8 }, "2026-10-03");
  assert.deepEqual(focus.event, { name: "Pražský maraton", date: "2026-11-15", daysLeft: 43 });
  for (const base of [coachInstructions, reviewInstructions, reflectionInstructions]) {
    const out = withFocus(base, focus);
    assert.match(out, /^Jsi profesionální trenér běhu a silové přípravy\./);
    assert.doesNotMatch(out, /^Jsi elitní trenér vytrvalostní cyklistiky/);
    assert.match(out, /Hlavní sport: běh/);
    assert.match(out, /„maraton pod 3:30“/);
    assert.match(out, /za 43 dní, 6 týdnů/);
    assert.match(out, /8 h týdně/);
    assert.match(out, /ne pokyny\.$/);
  }
  // A goal without a sport keeps the general role; a past race is left out.
  const general = withFocus(reviewInstructions, athleteFocus({ sportGoal: "zhubnout", eventDate: "2026-09-01" }, "2026-10-03"));
  assert.match(general, /^Jsi profesionální trenér kondice/);
  assert.doesNotMatch(general, /Hlavní závod/);
});

test('the daily general fitness suggestion balances strength and endurance without selecting cycling by default',()=>{
  const client=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
  const source=client.slice(client.indexOf('function dailySport(){'),client.indexOf('function renderDailySports('));
  const state={gym:{history:[]}},saved={};
  const choose=new Function('state','savedProfile','pragueToday','activitySport','HUB_SPORTS','uiText',source+'return dailySport;')(state,()=>saved,()=> '2026-10-07',()=>null,{ride:'kolo',run:'běh',gym:'síla'},cs=>cs);
  assert.equal(choose().sport,'gym');
  state.gym.history=[{workout_date:'2026-10-06'}];assert.equal(choose().sport,'run');
  saved.mainSport='cycling';assert.equal(choose().sport,'ride');
  saved.mainSport='running';assert.equal(choose().sport,'run');
});

test("the dashboard has the settings card, the strain ring, week browsing and no rating for walks", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(client, /<h3>Hlavní sport a cíl'\+infoTip\('sportFocus',/);
  assert.match(client, /miniRing\('Námaha'/);
  assert.doesNotMatch(client, /miniRing\('(Strain|Zátěž)'/);
  assert.match(client, /data-week-step="-1"/);
  assert.match(client, /x\.kind==='done'&&!isWalkActivity\(x\.a\)/);
  // The strain helpers, run as the dashboard runs them.
  const pick = name => client.slice(client.indexOf("function " + name + "("), client.indexOf("\n", client.indexOf("function " + name + "(")));
  const fns = new Function("activitySport", "daywideStrain", pick("trainingStrain") + pick("strainBand") + pick("dayStrain") + pick("isWalkActivity") + "return {trainingStrain,strainBand,dayStrain,isWalkActivity};");
  const sport = a => /ride/i.test(a.type) ? "ride" : null;
  const { trainingStrain, strainBand, dayStrain, isWalkActivity } = fns(sport, () => ({ score: 8 }));
  assert.ok(trainingStrain(60) > 9 && trainingStrain(60) < 11);
  assert.ok(trainingStrain(300) <= 21);
  assert.equal(strainBand(15), "Vysoká");
  assert.equal(dayStrain("2026-10-03", 0), 8);
  assert.ok(dayStrain("2026-10-03", 120) > 14);
  assert.equal(isWalkActivity({ type: "Walk", name: "Procházka se psy" }), true);
  assert.equal(isWalkActivity({ type: "Ride", name: "Walk ride" }), false);
});
