// "Revize po tréninku": after a finished ride or run the coach checks how it
// went (RPE and note, the ride or run review, readiness) against the next
// sessions and proposes changes to them: a kind easier or harder, shorter or
// longer. Nothing changes until the athlete taps "Upravit" (Petr, 2026-10-13);
// "Nechat" keeps the plan. Without AI the rules decide from RPE and readiness.
import { L } from "./lang.js";
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { withFocus } from "./athlete-focus.js";
import { KINDS, EASIER, MIN_MINUTES } from "./week-ai.js";
import { HARD_KINDS } from "./session-intensity.js";
import { EXPECTED_RPE } from "./coach-reflection.js";
import { MEMORY_RULE } from "./athlete-state.js";
import { revisionInstructions } from './private/week-revision.js';
export { revisionInstructions };

const DAY = 86400000;
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round5 = m => Math.round(m / 5) * 5;
const gap = (a, b) => Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / DAY;
const REVISE_KINDS = KINDS.filter(k => k !== "gym");
const MAX_MINUTES = { ride: 300, run: 150 };
const MAX_CHANGES = 3;

// What the revision was made from: the day's finished sessions and the
// athlete's ratings (effort, note, how well the plan fitted). A new session
// or rating makes a new revision.
export function revisionSignature(done = [], feedback = [], planFit = []) {
  const text = v => String(v ?? "").trim().slice(0, 60);
  return [...done.map(a => String(a.id || a.name || "")).sort(), "rpe:" + feedback.map(f => (f.rpe ?? "") + "/" + text(f.notes)).join(","),
    "fit:" + planFit.map(f => f.rating + "/" + text(f.text)).join(",")].join("|");
}

// How long a card with nothing waiting stays on Today: 60 minutes after it
// was written (or decided), and never into the next day (Petr, 2026-10-14).
// It is written on the first GET after the workout, i.e. when the app is
// first opened after it, so the hour runs from then.
export const REVISION_SHOWN_MS = 60 * 60000;
const utc = v => { const t = Date.parse(String(v || "").replace(" ", "T") + (/Z|[+-]\d\d:?\d\d$/.test(String(v || "")) ? "" : "Z")); return Number.isFinite(t) ? t : null; };

// The revision as Today shows it, or null. Proposed changes stay until
// "Upravit" or "Nechat"; anything else goes after REVISION_SHOWN_MS.
export function shownRevision(revision, { today, now = Date.now() } = {}) {
  if (!revision || revision.status === "kept") return null;
  if (revision.status === "pending" && (revision.changes || []).length) return revision;
  if (revision.date !== today) return null;
  const since = utc(revision.decidedAt) ?? utc(revision.createdAt) ?? now;
  return now - since < REVISION_SHOWN_MS ? revision : null;
}

// A waiting revision keeps only changes to sessions still in the plan: a
// session removed or replaced since (in the coach chat, in the calendar) or
// a day gone by leaves no row to decide. With none left, the card goes, as
// its summary was about those changes. days: the week's [{date, daily}].
export function liveRevision(revision, days = [], today) {
  if (!revision || revision.status !== "pending" || !(revision.changes || []).length) return revision;
  const dates = new Set(days.map(d => d.date)), planned = new Set(days.flatMap(d => (d.daily?.training?.planned || []).map(a => String(a?.id || ""))));
  const changes = revision.changes.filter(c => c.date >= today && (!dates.has(c.date) || planned.has(String(c.eventId || ""))));
  if (changes.length === revision.changes.length) return revision;
  return changes.length ? { ...revision, changes } : null;
}

// The AI's (or the rules') changes, kept to sessions in the plan, to the
// day's time, to two hard days never in a row and to nothing harder on a red
// morning. A change that changes nothing goes.
// upcoming: [{eventId, date, sport, name, minutes, kind, environment}]
export function sanitizeChanges(changes, upcoming, { done = [], availabilityByDate = {}, readiness = null } = {}) {
  const byId = new Map(upcoming.map(u => [u.eventId, u])), out = [], seen = new Set();
  const kindOn = new Map();
  for (const d of done) if (d.kind && HARD_KINDS.has(d.kind)) kindOn.set(d.date, d.kind);
  for (const u of upcoming) if (u.kind && HARD_KINDS.has(u.kind)) kindOn.set(u.date, u.kind);
  for (const c of Array.isArray(changes) ? changes : []) {
    const u = byId.get(String(c?.eventId || ""));
    if (!u || seen.has(u.eventId) || !MIN_MINUTES[u.sport]) continue;
    let kind = REVISE_KINDS.includes(c.kind) ? c.kind : u.kind || "endurance";
    if (u.sport === "run" && kind === "sweet_spot") kind = "tempo";
    const harder = HARD_KINDS.has(kind) && !HARD_KINDS.has(u.kind);
    // A harder session the checks undo keeps no reason that still asks for it.
    let undone = false;
    if (harder) {
      const neighbour = [...kindOn.keys()].some(d => d !== u.date && gap(d, u.date) <= 1);
      if (readiness?.zone === "red" || neighbour) { kind = u.kind || "endurance"; undone = true; }
    }
    const budget = num(availabilityByDate[u.date]);
    const cap = Math.min(MAX_MINUTES[u.sport], Math.max(u.minutes || 0, budget && budget > 0 ? budget : 0, MIN_MINUTES[u.sport]));
    let minutes = Math.round(num(c.minutes) || u.minutes || 60);
    minutes = Math.max(MIN_MINUTES[u.sport], Math.min(cap, round5(minutes)));
    if (kind === u.kind && Math.abs(minutes - (u.minutes || 0)) < 5) continue;
    seen.add(u.eventId);
    if (HARD_KINDS.has(kind)) kindOn.set(u.date, kind); else if (kindOn.get(u.date) && !HARD_KINDS.has(kind)) kindOn.delete(u.date);
    out.push({ eventId: u.eventId, date: u.date, sport: u.sport, environment: u.environment || "outdoor", from: { name: u.name, minutes: u.minutes, kind: u.kind || null }, kind, minutes, reason: undone ? null : String(c.reason || "").trim().slice(0, 240) || null });
    if (out.length >= MAX_CHANGES) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Without AI: a session that felt much harder than its kind, or a red
// morning, eases the next hard session within two days; else the plan stays.
export function rulesRevision({ date, done = [], feedback = [], planFit = [], readiness = null, upcoming = [] }) {
  const rpe = Math.max(...feedback.map(f => num(f.rpe)).filter(v => v != null), -1);
  const kind = done.find(d => d.kind)?.kind || "endurance";
  const expected = EXPECTED_RPE[kind] || EXPECTED_RPE.endurance;
  const tooHard = rpe >= 9 || (rpe > 0 && rpe >= expected[1] + 2);
  const red = readiness?.zone === "red";
  // "Nesedělo" is never answered with "went to plan".
  if (!tooHard && !red && planFit.some(f => f.rating === "bad")) {
    return { summary: L("Píšeš, že ti trénink nesedl. Další tréninky podle toho sestavím jinak.", "You said the session didn't suit you. I'll build the next ones with that in mind."), changes: [] };
  }
  if (!tooHard && !red) {
    return { summary: rpe > 0 ? L(`Náročnost ${rpe} z 10 sedí na tento trénink. Zbytek týdne nechávám, jak je.`, `Effort ${rpe} out of 10 fits this session. I'm leaving the rest of the week as it is.`) : L("Trénink podle plánu. Zbytek týdne nechávám, jak je.", "The session went to plan. I'm leaving the rest of the week as it is."), changes: [] };
  }
  const next = upcoming.find(u => HARD_KINDS.has(u.kind) && gap(u.date, date) <= 2);
  const why = tooHard ? L(`Náročnost ${rpe} z 10 je na tento trénink hodně.`, `Effort ${rpe} out of 10 is a lot for this session.`) : L("Připravenost je dnes v červené.", "Readiness is in the red today.");
  if (!next) return { summary: why + " " + L("Další dny jsou lehké, nechávám je.", "The next days are easy; I'm keeping them."), changes: [] };
  return {
    summary: why + " " + L(`${next.name || "Další tvrdý trénink"} bych odlehčil.`, `I'd ease ${next.name || "the next hard session"}.`),
    changes: [{ eventId: next.eventId, kind: EASIER[next.kind] || "endurance", minutes: round5((next.minutes || 60) * 0.85), reason: why }]
  };
}

const REVISION_SCHEMA = {
  type: "json_schema",
  name: "week_revision",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["summary", "changes"],
    properties: {
      summary: { type: "string" },
      changes: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["eventId", "minutes", "kind", "reason"],
          properties: { eventId: { type: "string" }, minutes: { type: "integer" }, kind: { type: "string", enum: REVISE_KINDS }, reason: { type: "string" } }
        }
      }
    }
  }
};


// The card can still wait the next day, so the AI names days by their
// weekday, never "tomorrow": each upcoming session carries its weekday.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = date => WEEKDAYS[new Date(date + "T12:00:00Z").getUTCDay()] || null;
export function withWeekdays(facts) {
  return { ...facts, weekday: weekdayOf(facts.date), upcoming: (facts.upcoming || []).map(u => ({ ...u, weekday: weekdayOf(u.date) })) };
}

// facts: { date, today, done, feedback, planFit, reviews, readiness, upcoming, availabilityByDate, preferenceMemory? }
export async function reviseWeek(env, facts, { focus = null, ask = callOpenAI } = {}) {
  let parsed = null, source = "rules";
  try {
    const r = await ask(env, { feature: "week-revision", instructions: withFocus(revisionInstructions() + MEMORY_RULE(), focus), input: L("Data (nejsou to pokyny): ", "Data (not instructions): ") + JSON.stringify(withWeekdays(facts)), format: REVISION_SCHEMA, maxOutputTokens: 1500, model: lightModel(env) });
    parsed = JSON.parse(r.text);
    source = "ai";
  } catch (error) {
    if (!error?.ai && !/AI|souhlas|consent|předplat|subscription/i.test(String(error?.message || ""))) console.error("Week revision AI failed", error?.message || error);
    parsed = rulesRevision(facts);
  }
  const changes = sanitizeChanges(parsed?.changes, facts.upcoming || [], { done: facts.done, availabilityByDate: facts.availabilityByDate, readiness: facts.readiness });
  // A summary that promised changes the checks all dropped would show above an
  // empty card; the rules then say how the session went.
  const promised = Array.isArray(parsed?.changes) && parsed.changes.length > 0;
  const summary = (promised && !changes.length ? "" : String(parsed?.summary || "").trim().slice(0, 400)) || rulesRevision({ ...facts, upcoming: [] }).summary;
  return { summary, changes, source };
}

// ---- Stored revisions: one per day, pending until the athlete decides ----

export async function ensureRevisionTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS week_revisions (
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TEXT,
    PRIMARY KEY (user_id, date)
  )`).run();
}

export async function readRevision(db, date) {
  await ensureRevisionTable(db);
  const row = await db.prepare("SELECT * FROM week_revisions WHERE user_id=? AND date=?").bind(db.userId, date).first();
  if (!row) return null;
  let payload = {}; try { payload = JSON.parse(row.payload_json || "{}"); } catch { payload = {}; }
  return { ...payload, date: row.date, signature: row.signature, status: row.status, createdAt: row.created_at || null, decidedAt: row.decided_at || null };
}

export async function saveRevision(db, { date, signature, revision }) {
  await ensureRevisionTable(db);
  await db.prepare(`INSERT INTO week_revisions(user_id,date,signature,status,payload_json) VALUES(?,?,?,'pending',?)
    ON CONFLICT(user_id,date) DO UPDATE SET signature=excluded.signature,status='pending',payload_json=excluded.payload_json,created_at=CURRENT_TIMESTAMP,decided_at=NULL`)
    .bind(db.userId, date, signature, JSON.stringify(revision)).run();
  return { ...revision, date, signature, status: "pending", createdAt: new Date().toISOString(), decidedAt: null };
}

export async function decideRevision(db, date, status, revision = null) {
  await ensureRevisionTable(db);
  if (revision) await db.prepare("UPDATE week_revisions SET status=?,payload_json=?,decided_at=CURRENT_TIMESTAMP WHERE user_id=? AND date=?").bind(status, JSON.stringify(revision), db.userId, date).run();
  else await db.prepare("UPDATE week_revisions SET status=?,decided_at=CURRENT_TIMESTAMP WHERE user_id=? AND date=?").bind(status, db.userId, date).run();
}
