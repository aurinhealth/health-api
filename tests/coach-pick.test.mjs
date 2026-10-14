import test from "node:test";
import assert from "node:assert/strict";
import { rankOptions } from "../src/coach-pick.js";

const coach = (status, kind = "tempo", minutes = 65, lower = 0, reasons = []) => ({ readiness: { status, score: 70, reasons }, recommendation: { session: { kind, durationMinutes: minutes } }, load: { lowerBodyGymSignals48h: lower } });

test("a rested cyclist gets the ride the coach chose, the rest under Jiné možnosti", () => {
  const r = rankOptions({ ride: coach("green"), run: coach("green", "endurance", 40), mainSport: "cycling", sports: ["ride", "run", "strength"] });
  assert.equal(r.options[0].kind, "ride");
  assert.equal(r.options[0].title, "Kolo · tempo");
  assert.equal(r.options[0].best, true);
  assert.equal(r.options[0].action, "library");
  assert.deepEqual(r.options.map(o => o.kind).sort(), ["gym", "rest", "ride", "run", "sauna", "swim"]);
});

test("a bad night recommends a day off with the sauna and says why", () => {
  const r = rankOptions({ ride: coach("red", "recovery", 30, 0, ["spánek 5,8 h z potřebných 7,5 h"]), run: coach("red", "recovery"), mainSport: "cycling", sports: ["ride"] });
  assert.equal(r.options[0].kind, "rest");
  assert.equal(r.options[0].title, "Volno a sauna");
  assert.match(r.options[0].reason, /^Spánek 5,8 h/);
  assert.equal(r.options[0].action, "accept");
});

test("tired legs make the gym upper body; declines push an option down", () => {
  const r = rankOptions({ ride: coach("yellow", "endurance", 60, 2), run: coach("yellow", "endurance"), mainSport: "strength", sports: ["strength", "ride"] });
  const gym = r.options.find(o => o.kind === "gym");
  assert.equal(gym.title, "Posilovna · horní polovina");
  const declined = rankOptions({ ride: coach("yellow", "endurance", 60, 2), run: coach("yellow", "endurance"), mainSport: "strength", sports: ["strength", "ride"], declines: [{ top: r.options[0].kind }, { top: r.options[0].kind }, { top: r.options[0].kind }] });
  assert.notEqual(declined.options[0].kind, r.options[0].kind);
});

test("a workout done today turns the pick to recovery", () => {
  const r = rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"], today: ["ride"] });
  assert.ok(["rest", "sauna"].includes(r.options[0].kind));
});

test("the reason speaks of quality only when the pick is a hard session", () => {
  assert.match(rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"] }).options[0].reason, /kvalitu/);
  const easy = rankOptions({ ride: coach("green", "endurance", 90), run: coach("green", "endurance"), mainSport: "cycling", sports: ["ride"] }).options[0];
  assert.equal(easy.kind, "ride");
  assert.doesNotMatch(easy.reason, /kvalitu/);
  assert.match(easy.reason, /klidném tempu/);
});

test("Doporučení trenéra builds the ride and run like the library's proposal (plan, role, free time, abilities)", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const route = src.slice(src.indexOf("if(url.pathname==='/app/api/coach/pick')"), src.indexOf("if(url.pathname==='/app/api/coach/check-in'"));
  assert.match(route, /defaultDayCoach\(env,inputs,date,'ride',week\)/);
  const helper = src.slice(src.indexOf("async function defaultDayCoach"), src.indexOf("// The athlete's ratings since a day"));
  for (const part of [/targetFor\(targets,date,sport\)/, /roleFor\(prefs,date,sport/, /trainingBudget\(prefs,date/, /getCapabilities\(env\.DB,sport\)/]) assert.match(helper, part);
});
