import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { saveAppleHealth } from "../src/apple-health.js";
import { googleDashboard } from "../src/google-dashboard.js";
import { weekHealthDate, shiftDate } from "../src/dashboard-shared.js";
import { serverSource } from "./helpers/server-source.mjs";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
const TODAY = "2026-11-06"; // a Friday

test("a week reads today's Google Health within the last 30 days, its own Sunday before, nothing ahead", () => {
  assert.equal(weekHealthDate("2026-11-02", TODAY), TODAY, "this week");
  assert.equal(weekHealthDate("2026-10-26", TODAY), TODAY, "last week");
  assert.equal(weekHealthDate("2026-10-07", TODAY), TODAY, "a week starting 30 days back");
  assert.equal(weekHealthDate("2026-10-05", TODAY), "2026-10-11", "older: its own Sunday");
  assert.equal(weekHealthDate("2026-11-09", TODAY), null, "next week has nothing measured");
  assert.equal(weekHealthDate(TODAY, TODAY), TODAY);
});

test("today's read gives every day of the last 30 the same active energy as the day's own week read", async () => {
  const raw = createD1();
  raw.sqlite.exec(schema);
  const db = scopedDb(raw, 1), records = [];
  for (let k = -40; k <= 0; k++) {
    const d = shiftDate(TODAY, k);
    for (const h of [6, 12, 21, 23]) records.push({ type: "active-energy-burned", id: `ae:${d}T${h}`, start: `${d}T${String(h).padStart(2, "0")}:00:00Z`, end: `${d}T${String(h).padStart(2, "0")}:59:00Z`, value: 50 + k + h });
  }
  await saveAppleHealth(db, 1, { records });
  const now = await googleDashboard(db, TODAY), energy = (summary, day) => summary.wellness.find(w => w.id === day)?.activeCalories ?? null;
  for (let start = shiftDate(TODAY, -32); start <= TODAY; start = shiftDate(start, 1)) {
    if (weekHealthDate(start, TODAY) !== TODAY) continue;
    const own = await googleDashboard(db, shiftDate(start, 6));
    for (let i = 0; i < 7; i++) {
      const day = shiftDate(start, i);
      if (day > TODAY) continue;
      assert.equal(energy(now, day), energy(own, day), "week of " + start + ", " + day);
      assert.ok(energy(now, day) > 0, day);
    }
  }
});

test("the week route takes its Google Health read from weekHealthDate", () => {
  const src = serverSource();
  const route = src.slice(src.indexOf('if (url.pathname === "/app/api/week")'), src.indexOf("const together = readDaysTogether(env.DB, env.USER_ID, start"));
  assert.match(route, /healthDate = weekHealthDate\(start, localToday\(\)\)/);
  assert.match(route, /profile && healthDate \? await googleHealthFor\(env, ctx, healthDate\)/);
  assert.doesNotMatch(route, /googleHealthFor\(env, ctx, dates\[6\]\)/);
});
