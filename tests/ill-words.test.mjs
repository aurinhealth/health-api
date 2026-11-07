import test from "node:test";
import assert from "node:assert/strict";
import { illNow, unwellNow } from "../src/pain-words.js";

// Audit "Kouč jako skutečný trenér" 2026-11-07, points 1 and 2.
test("illNow hears the athlete's own illness now, not a past, conditional or denied one", () => {
  for (const t of ["Jsem nemocný", "Jsem nachlazený a mám horečku", "Cítím se dost nemocná", "Mám chřipku", "Chytil jsem virózu", "Mám zase teplotu",
    "I'm sick", "I am ill today", "I feel a bit unwell", "I have the flu", "I've got a cold", "down with covid", "I’m sick"]) assert.ok(illNow(t), t);
  for (const t of ["Nejsem nemocný", "Minulý týden jsem byl nemocný", "Když jsem nemocný, co mám dělat?", "Až budu nemocná, napíšu", "Žena je nemocná",
    "I was sick last week", "If I'm sick, should I ride?", "I'm not sick", "I have a cold-weather jacket", "Mám nemocné dítě", ""]) assert.ok(!illNow(t), t);
});

test("unwellNow adds a lighter cold, unless the athlete says they have none", () => {
  for (const t of ["Mám rýmu", "Bolí mě v krku", "Škrábe mě v krku", "sore throat today", "I have a runny nose", "Jsem nachlazený"]) assert.ok(unwellNow(t), t);
  for (const t of ["Nemám rýmu", "no sore throat", "Bolí mě koleno", "Rychle jsem dojel"]) assert.ok(!unwellNow(t), t);
});
