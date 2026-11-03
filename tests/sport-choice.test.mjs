import test from "node:test";
import assert from "node:assert/strict";
import { athleteFocus, normalizeFocus, withFocus, mainSportOfKinds } from "../src/athlete-focus.js";
import { effectiveProfile } from "../src/energy-profile.js";
import { withSportChoice, sportExclusion, saveSportChoice, sportAllowed } from "../src/sport-choice.js";
import { rankOptions } from "../src/coach-pick.js";
import { validateCoachActions } from "../src/coach-actions.js";
import { fallbackSports, allowedSport } from "../src/adaptive-week.js";
import { planWeekRoles } from "../src/week-planner.js";
import { proposeWeekAI } from "../src/week-ai.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const focusOf = p => normalizeFocus(p);

test("the sports the athlete does and several main ones are kept in Ride, Run, Swim, Gym order", () => {
  const f = focusOf({ sports: ["strength", "chess", "ride", "run"], mainSports: ["run", "ride", "swim"] });
  assert.deepEqual(f.sports, ["ride", "run", "strength"]);
  // A main sport is one the athlete does; the first one is the older single main sport.
  assert.deepEqual(f.mainSports, ["ride", "run"]);
  assert.equal(f.mainSport, "cycling");
  assert.equal(focusOf({ sports: ["ride", "run", "swim"], mainSports: ["ride", "run", "swim"] }).mainSport, "triathlon");
  assert.equal(focusOf({ sports: ["run"], mainSports: [] }).mainSport, "general");
  // A profile that never chose keeps no list: every sport may be suggested.
  assert.equal("sports" in focusOf({ mainSport: "running" }), false);
  assert.deepEqual([mainSportOfKinds([]), mainSportOfKinds(["swim"]), mainSportOfKinds(["strength", "run"])], ["general", "swimming", "strength"]);
});

test("an older app that changes only the main sport wins over the list it sent back", () => {
  const f = focusOf({ mainSport: "running", sports: ["ride", "strength"], mainSports: ["ride"] });
  assert.deepEqual([f.mainSport, f.mainSports, f.sports], ["running", ["run"], ["ride", "run", "strength"]]);
  // The same values as the list: nothing changes.
  assert.deepEqual(focusOf({ mainSport: "cycling", sports: ["ride", "run"], mainSports: ["ride", "run"] }).mainSports, ["ride", "run"]);
  assert.equal("mainSports" in focusOf({ mainSport: "auto", sports: ["ride"], mainSports: ["ride"] }), false);
});

test("the coach reads both main sports and the sports it may suggest", async () => {
  const focus = athleteFocus({ sports: ["ride", "run", "strength"], mainSports: ["ride", "run"] }, "2026-11-03");
  assert.deepEqual(focus.mains, ["ride", "run"]);
  assert.deepEqual(focus.sports, ["ride", "run", "strength"]);
  const text = withFocus("Jsi trenér v aplikaci Aurin.", focus);
  // The lines' words come from aurin-prompts; a checkout from before them still names both sports.
  const prompts = await import("../src/private/athlete-focus.js");
  if (prompts.sportsLine) {
    assert.match(text, /Hlavní sporty: kolo a běh/);
    assert.match(text, /Sporty, které sportovec dělá: kolo, běh, posilovna/);
  } else assert.match(text, /kolo a běh/);
  // A triathlete stays a triathlete; one who never chose gets no list.
  assert.doesNotMatch(withFocus("Jsi trenér v aplikaci Aurin.", athleteFocus({ mainSport: "triathlon" }, "2026-11-03")), /Sporty, které|Hlavní sporty/);
});

test("Don't suggest rides: the others stay on, a main ride stops being main, Undo brings it back", () => {
  const off = withSportChoice({ mainSport: "cycling" }, "ride", false);
  assert.deepEqual([off.sports, off.mainSports, off.mainSport], [["run", "swim", "strength"], [], "general"]);
  const tri = withSportChoice({ mainSport: "triathlon" }, "swim", false);
  assert.deepEqual([tri.sports, tri.mainSports, tri.mainSport], [["ride", "run", "strength"], ["ride", "run"], "cycling"]);
  // "Automatically" stays automatic.
  assert.equal(withSportChoice({ mainSport: "auto" }, "ride", false).mainSport, "auto");
  const back = withSportChoice(off, "ride", true);
  assert.deepEqual(back.sports, ["ride", "run", "swim", "strength"]);
  assert.throws(() => withSportChoice({}, "chess", false));
});

test("only a clear lasting no to one sport turns it off from the chat", () => {
  const cases = {
    "Nenavrhuj mi kolo, nejezdím.": "ride",
    "Nemám kolo, tak mi nikdy nenavrhuj cyklistiku.": "ride",
    "I don't have a bike, so please never suggest cycling.": "ride",
    "nechci plavat": "swim",
    "I don't swim": "swim",
    "never suggest gym": "strength",
    "Nedoporučuj mi posilovnu": "strength",
    "Dnes nechci běhat": null,
    "Mám jít dnes běhat?": null,
    "nemám rád dlouhé běhy": null,
    "nechci dlouhé běhy": null,
    "I don't like long runs": null,
    "Nenavrhuj mi běh ani kolo": null,
    "Kolo mi dnes nenavrhuj": null
  };
  for (const [message, kind] of Object.entries(cases)) assert.equal(sportExclusion(message), kind, message);
  assert.equal(sportExclusion("nenavrhuj kolo " + "a".repeat(400)), null);
});

test("the choice is saved to the profile and saving the same again changes nothing", async () => {
  const db = scopedDb(createD1(), 4);
  await db.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY (user_id,id))").run();
  await db.prepare("INSERT INTO dashboard_profile(user_id,id,profile_json) VALUES(?,1,?)").bind(4, JSON.stringify({ mainSport: "running", sex: "female" })).run();
  const r = await saveSportChoice(db, 4, "ride", false);
  assert.deepEqual([r.changed, r.sports, r.mainSports, r.mainSport], [true, ["run", "swim", "strength"], ["run"], "running"]);
  const saved = JSON.parse((await db.prepare("SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1").bind(4).first()).profile_json);
  assert.deepEqual([saved.sex, saved.sports], ["female", ["run", "swim", "strength"]]);
  assert.equal((await saveSportChoice(db, 4, "ride", false)).changed, false);
  assert.deepEqual((await saveSportChoice(db, 4, "ride", true)).sports, ["ride", "run", "swim", "strength"]);
});

const coach = (status = "green", kind = "endurance", minutes = 60) => ({ readiness: { status, score: 70, reasons: [] }, recommendation: { session: { kind, durationMinutes: minutes } }, load: { lowerBodyGymSignals48h: 0 } });

test("Activity of the day never offers a sport the athlete turned off, not even under other options", () => {
  const r = rankOptions({ ride: coach(), run: coach(), mainSport: "cycling", allowed: ["run", "strength"], sports: ["ride"] });
  assert.equal(r.options.some(o => o.kind === "ride" || o.kind === "swim"), false);
  assert.equal(r.options[0].kind, "run");
  // Two main sports both get the main sport's lead over the gym.
  const both = rankOptions({ ride: coach("yellow"), run: coach("yellow"), mains: ["ride", "run"], allowed: ["ride", "run", "strength"], sports: [] });
  assert.deepEqual(both.options.slice(0, 2).map(o => o.kind).sort(), ["ride", "run"]);
});

test("a coach card in a turned-off sport goes only when the athlete asks for that sport", () => {
  const focus = { sports: ["run", "strength"] };
  const ride = { type: "workout", date: "2026-11-04", sport: "ride", minutes: 60, reason: "Lehká jízda" };
  const user = { userInitiated: true };
  assert.deepEqual(validateCoachActions([ride], { athleteState: "active", focus, userMessage: "Co zítra?" }, "2026-11-03", user), []);
  assert.equal(validateCoachActions([ride], { athleteState: "active", focus, userMessage: "Zítra bych si dal kolo" }, "2026-11-03", user).length, 1);
  // The message that turned it off is no ask for it.
  assert.deepEqual(validateCoachActions([ride], { athleteState: "active", focus, userMessage: "Co zítra?", conversation: [{ role: "user", content: "Nenavrhuj mi kolo" }] }, "2026-11-03", user), []);
  assert.equal(sportAllowed(null, "ride"), true);
  assert.equal(sportAllowed({ sports: ["strength"] }, "gym"), true);
});

test("the week keeps to the chosen sports: rules, defaults and the AI week", async () => {
  assert.deepEqual(fallbackSports({ sport: "running", sports: ["swim", "run"], regular: ["ride"] }), ["run", "swim"]);
  assert.equal(allowedSport({ sports: ["run"] }, "ride"), false);
  assert.equal(allowedSport({}, "ride"), true);
  const ask = async () => ({ text: JSON.stringify({ summary: null, days: [
    { date: "2026-10-14", sport: "ride", minutes: 60, environment: "outdoor", kind: "endurance", reason: "" },
    { date: "2026-10-15", sport: "run", minutes: 45, environment: "outdoor", kind: "endurance", reason: "" }
  ] }) });
  const prefs = { availability: [60, 90, 60, 90, 0, 240, 60].map(minutes => ({ minutes, window: "", preferredSports: [] })) };
  const r = await proposeWeekAI({}, { start: "2026-10-12", today: "2026-10-13", readiness: { zone: "green" } }, { prefs, ask, focus: athleteFocus({ sports: ["run", "strength"] }, "2026-10-13") });
  assert.deepEqual(r.items.map(i => i.sport), ["run"]);
});

test("two main endurance sports both lead the week", () => {
  const days = [["ride"], ["run"], [], ["ride"], ["run"], ["ride"], ["run"]];
  const roles = planWeekRoles(days, { mainSport: ["ride", "run"] });
  const sportsWithKey = new Set(roles.flatMap(d => d.items.filter(x => ["quality", "long"].includes(x.role)).map(x => x.sport)));
  assert.deepEqual([...sportsWithKey].sort(), ["ride", "run"]);
});

test("an automatic main sport never lands on a sport the athlete turned off", () => {
  const history = { recentCount: 30, yearCount: 100, mainSport: "cycling" };
  assert.equal(effectiveProfile({ mainSport: "auto", sports: ["run", "strength"] }, { trainingHistory: history }).mainSport, "general");
  assert.equal(effectiveProfile({ mainSport: "auto" }, { trainingHistory: history }).mainSport, "cycling");
});

test("suggest rides less often: another option goes first when it is close", () => {
  const r = rankOptions({ ride: coach(), run: coach(), mainSport: "general", sports: ["ride", "run"], less: ["ride"] });
  assert.notEqual(r.options[0].kind, "ride");
  assert.equal(r.options.some(o => o.kind === "ride"), true);
});
