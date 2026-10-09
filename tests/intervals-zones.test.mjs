import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intervalsSportSettings, writeIntervalsZones } from "../src/intervals-zones.js";
import { powerZones, hrZones, paceZones } from "../src/training-zones.js";
import { INTERVALS_SCOPES } from "../src/intervals-oauth.js";

const profile = { ftp: 260, lthr: 165, maxHr: 188, powerZoneModel: "coggan7", hrZoneModel: "frielLthr", runThresholdPace: 275, runLthr: 172, paceZoneModel: "friel" };
const thresholds = {
  profile,
  maxHr: 188,
  powerZones: powerZones(profile, 260),
  hrZones: hrZones(profile),
  paceZones: paceZones(profile, 275),
  runHrZones: hrZones({ ...profile, hrZoneModel: "frielRun", lthr: 172 })
};

test("Zones in the shape of Intervals.icu sport settings", () => {
  const { Ride, Run } = intervalsSportSettings(thresholds);
  assert.deepEqual(Ride.power_zones, [55, 75, 90, 105, 120, 150, 999]);
  assert.equal(Ride.power_zone_names.length, 7);
  assert.equal(Ride.power_zone_names[0], "Regenerace");
  assert.equal(Ride.ftp, 260);
  assert.equal(Ride.lthr, 165);
  assert.equal(Ride.max_hr, 188);
  assert.equal(Ride.hr_zones.length, 7);
  assert.equal(Ride.hr_zones.at(-1), 188, "the last zone ends at max heart rate");
  assert.ok(Ride.hr_zones.every((v, i, a) => i === 0 || v > a[i - 1]));
  assert.deepEqual(Run.pace_zones, [77.5, 87.7, 94.3, 100, 103.4, 111.5, 999]);
  assert.equal(Run.pace_zone_names[4], "Práh");
  assert.equal(Run.threshold_pace, 3.636, "4:35 /km as m/s");
  assert.equal(Run.lthr, 172);
  assert.equal(Run.hr_zones.length, 7);
});

test("Thresholds from Intervals.icu itself are not written back", () => {
  const p = { powerZoneModel: "sweetSpot" };
  const { Ride, Run } = intervalsSportSettings({ profile: p, powerZones: powerZones(p, 250), hrZones: hrZones(p), paceZones: paceZones(p, 300) });
  assert.equal(Ride.ftp, undefined);
  assert.equal(Ride.hr_zones, undefined, "no bpm without LTHR or max");
  assert.equal(Run.threshold_pace, undefined);
  assert.deepEqual(Ride.power_zones, [55, 75, 87, 94, 105, 120, 999]);
  assert.equal(Ride.power_zone_names[3], "Sweet spot");
});

test("Both sport settings are written with PUT", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body && JSON.parse(init.body) });
    if (url.endsWith("/athlete/0")) return Response.json({ id: "i42", sportSettings: [{ id: 11, types: ["Ride", "VirtualRide"] }, { id: 12, types: ["Run"] }, { id: 13, types: ["Swim"] }] });
    return Response.json({});
  };
  const result = await writeIntervalsZones({ INTERVALS_API_KEY: "Bearer tok" }, thresholds, fetchImpl);
  assert.deepEqual(result, { status: "ok", updated: ["Ride", "Run"] });
  assert.equal(calls[1].url, "https://intervals.icu/api/v1/athlete/i42/sport-settings/11?recalcHrZones=false");
  assert.equal(calls[1].method, "PUT");
  assert.equal(calls[1].body.ftp, 260);
  assert.equal(calls[2].url, "https://intervals.icu/api/v1/athlete/i42/sport-settings/12?recalcHrZones=false");
  assert.equal(calls[2].body.threshold_pace, 3.636);
});

test("A connection without SETTINGS:WRITE asks to connect again", async () => {
  const fetchImpl = async (url, init = {}) => (init.method === "PUT" ? new Response("{}", { status: 403 }) : Response.json({ id: "i1", sportSettings: [{ id: 1, types: ["Ride"] }] }));
  assert.equal((await writeIntervalsZones({ INTERVALS_API_KEY: "Bearer old" }, thresholds, fetchImpl)).status, "needs-permission");
  assert.equal((await writeIntervalsZones({}, thresholds, fetchImpl)).status, "not-connected");
  const down = await writeIntervalsZones({ INTERVALS_API_KEY: "k" }, thresholds, async () => new Response("", { status: 503 }));
  assert.equal(down.status, "error");
});

test("The OAuth connection asks for SETTINGS:WRITE and saving zones writes them", () => {
  assert.ok(INTERVALS_SCOPES.includes("SETTINGS:WRITE"));
  assert.ok(!INTERVALS_SCOPES.includes("SETTINGS:READ"));
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(src, /body&&body\.writeIntervals!==false\?await writeIntervalsZones\(env,t\):null/);
});
