// Intervals.icu's webhooks for the athletes connected with "Připojit
// Intervals.icu" (OAuth, intervals-oauth.js): what changed there is fetched
// right away, so those athletes need no import every 5 minutes (an OAuth app
// has 100 requests per athlete a day by default). Intervals.icu sends the
// secret from the app's "Webhook Authorization Header" (INTERVALS_WEBHOOK_SECRET)
// and retries when it gets no 2xx, so the answer comes first and the work
// runs after it. An event names the athlete, not the Aurin user: the athlete
// id saved at connecting (intervals_athlete, and in the clear in
// connection_accounts for the lookup) finds them.
import { timingSafeEqualString } from "./dashboard-auth.js";
import { KINDS } from "./intervals-reads.js";

// Which part of the Intervals.icu import (index.js syncIntervals) each event
// asks for; the rest (fitness, sport settings, permissions) only refreshes
// what the app shows.
const PARTS = {
  ACTIVITY_UPLOADED: "activities", ACTIVITY_ANALYZED: "activities", ACTIVITY_UPDATED: "activities", ACTIVITY_DELETED: "activities",
  CALENDAR_UPDATED: "planned", WELLNESS_UPDATED: "weight"
};
// Which cached Intervals.icu answers each event makes old (intervals-reads.js).
const CHANGED = {
  ACTIVITY_UPLOADED: ["activities"], ACTIVITY_ANALYZED: ["activities", "activity"], ACTIVITY_UPDATED: ["activities", "activity"], ACTIVITY_DELETED: ["activities", "activity"],
  CALENDAR_UPDATED: ["calendar"], WELLNESS_UPDATED: ["wellness"], FITNESS_UPDATED: ["wellness"], SPORT_SETTINGS_UPDATED: ["settings"], APP_SCOPE_CHANGED: KINDS
};

function authorized(request, body, expected) {
  if (!expected) return false;
  const header = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return timingSafeEqualString(header, expected) || timingSafeEqualString(String(body?.secret || ""), expected);
}

// A change Aurin itself made (a planned workout it sent, the wellness it
// copied) needs no fetch back.
function ownChange(event, clientId) {
  const ids = [event, ...(Array.isArray(event.events) ? event.events : [])].map(e => e?.oauth_client_id).filter(id => id != null);
  return Boolean(clientId) && ids.length > 0 && ids.every(id => String(id) === clientId);
}

// What each athlete needs: {athleteId: {parts, kinds, deleted}}, the parts of
// the import to fetch ("" when nothing is fetched but the app's numbers should
// refresh), the kinds of cached answers that are old now and the activities an
// ACTIVITY_DELETED event names (the import removes them, index.js).
export function webhookWork(body, clientId) {
  const work = new Map();
  for (const event of Array.isArray(body?.events) ? body.events : []) {
    const athlete = String(event?.athlete_id ?? "");
    if (!athlete || typeof event.type !== "string") continue;
    if (ownChange(event, clientId)) continue;
    if (!work.has(athlete)) work.set(athlete, { parts: new Set(), kinds: new Set(), deleted: new Set() });
    work.get(athlete).parts.add(PARTS[event.type] || "");
    const gone = event.type === "ACTIVITY_DELETED" ? String(event.activity?.id ?? event.activity_id ?? "") : "";
    if (/^[a-zA-Z0-9_-]{1,80}$/.test(gone)) work.get(athlete).deleted.add(gone);
    for (const kind of CHANGED[event.type] || []) work.get(athlete).kinds.add(kind);
  }
  return work;
}

// forAthlete(athleteId, parts, kinds, deleted) does the fetching for the Aurin user
// connected as that athlete; it runs after the answer (ctx.waitUntil).
export async function handleIntervalsWebhook(request, env, ctx, forAthlete) {
  const body = await request.json().catch(() => null);
  if (!authorized(request, body, String(env.INTERVALS_WEBHOOK_SECRET || ""))) return new Response(null, { status: 401 });
  const work = webhookWork(body, String(env.INTERVALS_CLIENT_ID || "").trim());
  if (work.size) {
    const job = Promise.all([...work].map(([athlete, { parts, kinds, deleted }]) => forAthlete(athlete, [...parts].filter(Boolean), [...kinds], [...deleted])
      .catch(error => console.error("Intervals.icu webhook failed", error.message))));
    if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
  }
  return Response.json({ status: "ok" });
}
