// Moje tréninky and Od přátel: workouts the athlete keeps to use again, and
// workouts friends sent with a link. A workout here is a recipe only (the
// exercises in order with their sets and repetitions); planned for a day, the
// loads come from the athlete's own history (strength-generator.js
// templateStrengthPlan), so a friend's weights never travel with it.
//
// saved_workouts: the athlete's own and received workouts (user data).
// workout_shares: a shared link's workout, readable by anyone who has the link
// (central database; its owner's id stays there for the account deletion).
// The link opens the iPhone app (universal link /t/<id>) or, without it, the
// page below; /t/<id>/og.png is the preview image the app drew when sharing.
import { L, lang } from "./lang.js";
import { scriptPolicy } from "./web-security.js";
import { exerciseMuscles } from "./fitness-insights.js";
import { buildStrengthContext } from "./strength-context.js";
import { templateStrengthPlan } from "./strength-generator.js";
import { ensureCoachInboxTable } from "./coach-inbox.js";
import { assertTrainingAllowed, getAthleteState } from "./athlete-state.js";
import { localToday } from "./user-time.js";
import { siteLang } from "./site-pages.js";
import { ENDURANCE_SPORTS, cleanEnduranceTemplate, enduranceStructure, templateFromStructure, blockLines, zwoFile, ZONES } from "./endurance-templates.js";
import { totalMinutes } from "./workout-model.js";
import { stepRows } from "./workout-explanation.js";
import { getWorkout, scheduleWorkoutInIntervals } from "./workout-library.js";
import { SITE_ORIGIN } from "./app-origin.js";
import { plannedEventWorkout } from "./planned-detail.js";
import { athleteThresholds, rideFtpFor } from "./intervals-athlete.js";
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { describeInstructions } from './private/workout-templates.js';

export const SPORTS = ["gym", ...ENDURANCE_SPORTS];
const MAX_EXERCISES = 30;
const MAX_SAVED = 300;
const MAX_SHARES_PER_DAY = 100;
// The preview image is a PNG drawn by the app (about 1200 × 630); base64.
const MAX_IMAGE_CHARS = 700_000;
const ID = /^[A-Za-z0-9]{10}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function newId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// The workout as sent by the app, checked: a known sport, a name, 1–30
// exercises with 1–10 sets and repetitions such as "8", "8–12" or "30 s".
export function cleanTemplate(input = {}) {
  if (ENDURANCE_SPORTS.includes(input.sport)) return cleanEnduranceTemplate(input);
  const sport = "gym";
  const name = text(input.name, 80);
  if (!name) throw new Error(L("Pojmenuj trénink.", "Name the workout."));
  const exercises = (Array.isArray(input.exercises) ? input.exercises : []).slice(0, MAX_EXERCISES + 1).map(e => ({
    name: text(e?.name, 120),
    sets: Math.round(Number(e?.sets)),
    reps: text(e?.reps, 12).replace(/-/g, "–")
  }));
  if (exercises.length > MAX_EXERCISES) throw new Error(L("Trénink může mít nejvýše 30 cviků.", "A workout can have at most 30 exercises."));
  for (const e of exercises) {
    if (!e.name) throw new Error(L("Každý cvik musí mít název.", "Every exercise needs a name."));
    if (!(e.sets >= 1 && e.sets <= 10)) throw new Error(L("Počet sérií musí být 1 až 10.", "Sets must be between 1 and 10."));
    if (!/^\d{1,3}(?:–\d{1,3})?(?: ?s)?$/.test(e.reps)) throw new Error(L("Opakování zadej číslem, rozsahem (8–12) nebo časem (30 s).", "Enter reps as a number, a range (8–12) or a time (30 s)."));
  }
  if (!exercises.length) throw new Error(L("Přidej aspoň jeden cvik.", "Add at least one exercise."));
  const minutes = Number(input.minutes);
  return { sport, name, minutes: minutes >= 5 && minutes <= 300 ? Math.round(minutes) : null, exercises };
}

// The exercises of a saved gym plan (gym_plans rows): work sets per exercise
// in order, the repetitions of its first work set.
export function templateFromRows(rows, name, minutes = null) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (String(r?.[0] || "WORK").toUpperCase() !== "WORK" || !r?.[1]) continue;
    const last = out.at(-1);
    if (last?.name === r[1]) last.sets++;
    else out.push({ name: String(r[1]), sets: 1, reps: String(r[4] || "10") });
  }
  return cleanTemplate({ sport: "gym", name, minutes, exercises: out });
}

// Muscle groups as the preview names them, from the body figure's muscles.
const GROUP_OF = { chest: "chest", upper_back: "back", lats: "back", lower_back: "back", traps: "back", front_delts: "shoulders", side_delts: "shoulders", rear_delts: "shoulders", biceps: "arms", triceps: "arms", forearms: "arms", abs: "core", obliques: "core", hips: "glutes", quads: "quads", hamstrings: "hamstrings", calves: "calves" };
const GROUP_LABEL = { chest: ["Hrudník", "Chest"], back: ["Záda", "Back"], shoulders: ["Ramena", "Shoulders"], arms: ["Paže", "Arms"], core: ["Střed těla", "Core"], glutes: ["Hýždě", "Glutes"], quads: ["Stehna", "Quads"], hamstrings: ["Zadní stehna", "Hamstrings"], calves: ["Lýtka", "Calves"] };
// Up to four groups the workout trains most (the preview's bar), in words.
export function mainMuscles(template, en = false) {
  if (template.sport && template.sport !== "gym") return [];
  const total = {};
  for (const e of template.exercises || []) for (const [muscle, share] of Object.entries(exerciseMuscles(e.name) || {})) { const g = GROUP_OF[muscle]; if (g) total[g] = (total[g] || 0) + share * (Number(e.sets) || 1); }
  return Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => GROUP_LABEL[g][en ? 1 : 0]);
}

async function ensureTables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS saved_workouts (user_id INTEGER NOT NULL, id TEXT NOT NULL, sport TEXT NOT NULL, name TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'own', from_name TEXT, share_id TEXT, plan_date TEXT, template_json TEXT NOT NULL, structure_json TEXT, seen INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, id))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS planned_own_workouts (user_id INTEGER NOT NULL, id TEXT NOT NULL, saved_id TEXT NOT NULL, sport TEXT NOT NULL, name TEXT NOT NULL, structure_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, id))").run();
}

// The saved workout as planned now, kept apart from the template: a later edit
// and planning it again never change what an earlier day shows, sends or
// counts. The same workout planned again unchanged reuses its copy.
async function plannedCopy(db, userId, row, structure) {
  const json = JSON.stringify(structure);
  const same = await db.prepare("SELECT id FROM planned_own_workouts WHERE user_id=? AND saved_id=? AND sport=? AND name=? AND structure_json=? LIMIT 1").bind(userId, row.id, row.sport, row.name, json).first();
  if (same) return same.id;
  const id = newId();
  await db.prepare("INSERT INTO planned_own_workouts(user_id,id,saved_id,sport,name,structure_json) VALUES(?,?,?,?,?,?)").bind(userId, id, row.id, row.sport, row.name, json).run();
  return id;
}
export async function ensureShareTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS workout_shares (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, sport TEXT NOT NULL, name TEXT NOT NULL, from_name TEXT, plan_date TEXT, template_json TEXT NOT NULL, image_png TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}

// The workout's own part for the app: the exercises and their muscles for the
// gym; for a ride or run its sections, their rows with the athlete's watts or
// paces (the library's step rows) and the length at the athlete's pace.
function workoutFields(template, thresholds = null) {
  if (ENDURANCE_SPORTS.includes(template.sport)) {
    const pace = thresholds?.runThresholdPace || null, structure = enduranceStructure(template, { thresholdPace: pace, swimCss: thresholds?.swimCss });
    const steps = template.sport === "swim" ? stepRows(structure, { sport: "swim", swimPace: thresholds?.swimCss || null })
      : template.sport === "run" ? stepRows(structure, { sport: "run", thresholdPace: pace }) : stepRows(structure, { ftp: thresholds ? rideFtpFor(thresholds, "outdoor").ftp : null });
    return { minutes: Math.round(totalMinutes(structure)), exercises: [], blocks: template.blocks || [], steps, muscles: {}, groups: [] };
  }
  return {
    minutes: template.minutes ?? null, exercises: template.exercises || [], blocks: null, steps: null,
    muscles: Object.fromEntries((template.exercises || []).map(e => [e.name, exerciseMuscles(e.name)])), groups: mainMuscles(template, lang() === "en")
  };
}

function view(row, thresholds = null) {
  let template = {};
  try { template = JSON.parse(row.template_json); } catch { /* broken row */ }
  return {
    id: row.id, sport: row.sport, name: row.name, source: row.source, fromName: row.from_name || null, shareId: row.share_id || null,
    date: row.plan_date || null, seen: row.seen !== 0, ...workoutFields({ ...template, sport: row.sport }, thresholds), createdAt: row.created_at
  };
}

// One saved workout for the app, a ride's or run's rows with the athlete's
// watts and paces.
async function viewFor(env, row) {
  return view(row, row && ENDURANCE_SPORTS.includes(row.sport) ? await thresholdsOf(env) : null);
}

// FTP and threshold pace for watts and paces; none when Intervals.icu or the
// profile can't be read (the rows then show % only).
async function thresholdsOf(env) {
  try { return await athleteThresholds(env); } catch (error) { console.error("Thresholds for saved workouts failed", error.message); return null; }
}

// The sender's first name, as the friend sees it: the name typed in Profil,
// else the account's name.
async function senderName(env, user) {
  let profile = null;
  try { profile = JSON.parse((await env.DB.prepare("SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=1").bind(env.USER_ID).first())?.profile_json || "null"); } catch { /* none */ }
  return text(String(profile?.displayName || user?.name || "").split(" ")[0], 40) || null;
}

const athleteView = t => ({ ftp: t?.ftp || null, runThresholdPace: t?.runThresholdPace || null, swimCss: t?.swimCss || null });

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// /app/api/my-workouts…, /app/api/shares… and /app/api/gym/template.
export async function handleWorkoutTemplatesApi(request, env, url, session = {}) {
  const path = url.pathname;
  if (!path.startsWith("/app/api/my-workouts") && !path.startsWith("/app/api/shares") && path !== "/app/api/gym/template") return undefined;
  if (!session.signedIn) return json({ message: L("Přihlas se do aplikace.", "Sign in to the app.") }, 401);
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) return json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, 403);
  try {
    await ensureTables(env.DB);
    const body = request.method === "GET" || request.method === "DELETE" ? {} : await request.json().catch(() => ({}));

    if (path === "/app/api/my-workouts" && request.method === "GET") {
      const rows = (await env.DB.prepare("SELECT * FROM saved_workouts WHERE user_id=? ORDER BY updated_at DESC LIMIT ?").bind(env.USER_ID, MAX_SAVED).all()).results || [];
      const thresholds = rows.some(r => ENDURANCE_SPORTS.includes(r.sport)) ? await thresholdsOf(env) : null;
      const workouts = rows.map(r => view(r, thresholds));
      return json({ status: "ok", workouts, unseen: workouts.filter(w => w.source === "friend" && !w.seen).length, athlete: athleteView(thresholds), zones: ZONES });
    }
    if (path === "/app/api/my-workouts" && request.method === "POST") {
      const count = (await env.DB.prepare("SELECT COUNT(*) AS n FROM saved_workouts WHERE user_id=?").bind(env.USER_ID).first())?.n || 0;
      if (count >= MAX_SAVED) throw new Error(L("Uložených tréninků je moc, nějaké nejdřív smaž.", "Too many saved workouts; delete some first."));
      // A friend's workout from its link, into Od přátel (once per link).
      if (body.fromShare != null) {
        const share = await readShare(env.RAW_DB || env.DB, body.fromShare);
        if (!share) return json({ message: L("Odkaz už neplatí.", "The link is no longer valid.") }, 404);
        if (Number(share.user_id) === Number(env.USER_ID)) return json({ status: "own" });
        const had = await env.DB.prepare("SELECT * FROM saved_workouts WHERE user_id=? AND source='friend' AND share_id=?").bind(env.USER_ID, share.id).first();
        if (had) return json({ status: "ok", workout: await viewFor(env, had) });
        const id = newId();
        // Opened from the link it is seen already; only a later visit marks it otherwise.
        await env.DB.prepare("INSERT INTO saved_workouts(user_id,id,sport,name,source,from_name,share_id,plan_date,template_json,seen) VALUES(?,?,?,?,'friend',?,?,?,?,?)").bind(env.USER_ID, id, share.sport, share.name, share.from_name, share.id, share.plan_date, share.template_json, body.seen === true ? 1 : 0).run();
        return json({ status: "ok", workout: await viewFor(env, await env.DB.prepare("SELECT * FROM saved_workouts WHERE user_id=? AND id=?").bind(env.USER_ID, id).first()) });
      }
      // A received one kept among the athlete's own, a library ride or run,
      // or a new own workout.
      let template;
      if (body.fromLibrary != null) {
        const w = await getWorkout(env.DB, String(body.fromLibrary).slice(0, 120));
        if (!w || !ENDURANCE_SPORTS.includes(w.sport || "ride")) return json({ message: L("Trénink nebyl nalezen.", "Workout not found.") }, 404);
        let structure = [];
        try { structure = JSON.parse(w.structure_json || "[]"); } catch { /* none */ }
        template = templateFromStructure(w.sport || "ride", w.name, structure);
      } else if (body.copyOf != null) {
        const from = await env.DB.prepare("SELECT template_json FROM saved_workouts WHERE user_id=? AND id=?").bind(env.USER_ID, String(body.copyOf)).first();
        if (!from) return json({ message: L("Trénink nebyl nalezen.", "Workout not found.") }, 404);
        template = cleanTemplate(JSON.parse(from.template_json));
      } else template = cleanTemplate(body);
      const id = newId();
      await env.DB.prepare("INSERT INTO saved_workouts(user_id,id,sport,name,source,template_json) VALUES(?,?,?,?,'own',?)").bind(env.USER_ID, id, template.sport, template.name, JSON.stringify(template)).run();
      return json({ status: "ok", workout: await viewFor(env, await env.DB.prepare("SELECT * FROM saved_workouts WHERE user_id=? AND id=?").bind(env.USER_ID, id).first()) });
    }
    if (path === "/app/api/my-workouts/seen" && request.method === "POST") {
      await env.DB.prepare("UPDATE saved_workouts SET seen=1 WHERE user_id=? AND source='friend' AND seen=0").bind(env.USER_ID).run();
      return json({ status: "ok" });
    }
    // A saved ride or run in the calendar and Intervals.icu, with the athlete's
    // own pace for the distances (gym workouts go through /app/api/gym/template).
    const plan = /^\/app\/api\/my-workouts\/([A-Za-z0-9]{10})\/schedule$/.exec(path);
    if (plan && request.method === "POST") {
      const row = await env.DB.prepare("SELECT * FROM saved_workouts WHERE user_id=? AND id=?").bind(env.USER_ID, plan[1]).first();
      if (!row) return json({ message: L("Trénink nebyl nalezen.", "Workout not found.") }, 404);
      if (!ENDURANCE_SPORTS.includes(row.sport)) throw new Error(L("Posilovna se plánuje přes návrh s váhami.", "Gym workouts are planned through the proposal with weights."));
      const date = String(body.date || "");
      if (!DATE.test(date) || date < localToday()) throw new Error(L("Vyber dnešní nebo budoucí datum.", "Choose today or a future date."));
      const template = cleanEnduranceTemplate(JSON.parse(row.template_json)), thresholds = await thresholdsOf(env);
      const structure = enduranceStructure(template, { thresholdPace: thresholds?.runThresholdPace, swimCss: thresholds?.swimCss });
      const copy = await plannedCopy(env.DB, env.USER_ID, row, structure);
      const result = await scheduleWorkoutInIntervals(env, env.DB, { workoutId: "own-" + copy, date, confirm: true, environment: body.environment === "outdoor" ? "outdoor" : "indoor" });
      return json(result);
    }
    // A planned ride or run (from the library, the coach or Intervals.icu), or
    // the plan a done one fulfilled, as an own workout to save or share; nothing is saved.
    if (path === "/app/api/my-workouts/from-planned" && request.method === "GET") {
      const w = await plannedWorkout(env, String(url.searchParams.get("id") || ""));
      let structure = [];
      try { structure = JSON.parse(w?.structure_json || "[]"); } catch { /* none */ }
      if (!w || !structure.length) return json({ message: L("Trénink nemá úseky, které by šly uložit.", "The workout has no sections to save.") }, 404);
      return json({ status: "ok", template: templateFromStructure(ENDURANCE_SPORTS.includes(w.sport) ? w.sport : "ride", w.name, structure) });
    }
    // "Send to" → Zwift, MyWhoosh: the planned ride as a .zwo file.
    if (path === "/app/api/my-workouts/from-planned.zwo" && request.method === "GET") {
      const w = await plannedWorkout(env, String(url.searchParams.get("id") || ""));
      let structure = [];
      try { structure = JSON.parse(w?.structure_json || "[]"); } catch { /* none */ }
      if (!w || (w.sport && w.sport !== "ride") || !structure.length) return json({ message: L("Tenhle trénink jako soubor pro Zwift nejde.", "This workout can't be made into a Zwift file.") }, 404);
      const template = templateFromStructure("ride", w.name, structure);
      return new Response(zwoFile(template), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" } });
    }
    // A ride or run put together from the athlete's words; nothing is saved.
    if (path === "/app/api/my-workouts/describe" && request.method === "POST") {
      const sport = ENDURANCE_SPORTS.includes(body.sport) ? body.sport : "ride", words = text(body.text, 400);
      if (!words) throw new Error(L("Popiš, jaký trénink chceš.", "Describe the workout you want."));
      if (!env.OPENAI_API_KEY) return json({ message: L("AI teď není dostupná. Zkus to později.", "AI isn't available right now. Try again later.") }, 503);
      return json({ status: "ok", template: await describeWorkout(env, sport, words, await thresholdsOf(env)) });
    }
    const one = /^\/app\/api\/my-workouts\/([A-Za-z0-9]{10})$/.exec(path);
    if (one && request.method === "PUT") {
      const template = cleanTemplate(body);
      const r = await env.DB.prepare("UPDATE saved_workouts SET name=?,sport=?,template_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=? AND source='own'").bind(template.name, template.sport, JSON.stringify(template), env.USER_ID, one[1]).run();
      if (!r.meta?.changes) return json({ message: L("Trénink nebyl nalezen.", "Workout not found.") }, 404);
      return json({ status: "ok", workout: await viewFor(env, await env.DB.prepare("SELECT * FROM saved_workouts WHERE user_id=? AND id=?").bind(env.USER_ID, one[1]).first()) });
    }
    if (one && request.method === "DELETE") {
      // An own workout takes the links it was shared by with it (the same
      // workout, word for word); friends keep the copies they saved.
      const own = await env.DB.prepare("SELECT template_json FROM saved_workouts WHERE user_id=? AND id=? AND source='own'").bind(env.USER_ID, one[1]).first();
      if (own) {
        const db = env.RAW_DB || env.DB;
        await ensureShareTable(db);
        await db.prepare("DELETE FROM workout_shares WHERE user_id=? AND template_json=?").bind(env.USER_ID, own.template_json).run();
      }
      await env.DB.prepare("DELETE FROM saved_workouts WHERE user_id=? AND id=?").bind(env.USER_ID, one[1]).run();
      return json({ status: "ok" });
    }

    // A link to the workout; the app sends the preview image it drew.
    if (path === "/app/api/shares" && request.method === "POST") {
      const template = cleanTemplate(body);
      const image = typeof body.image === "string" && body.image.length <= MAX_IMAGE_CHARS && /^[A-Za-z0-9+/=]+$/.test(body.image) ? body.image : null;
      const db = env.RAW_DB || env.DB;
      await ensureShareTable(db);
      const today = (await db.prepare("SELECT COUNT(*) AS n FROM workout_shares WHERE user_id=? AND created_at>=datetime('now','-1 day')").bind(env.USER_ID).first())?.n || 0;
      if (today >= MAX_SHARES_PER_DAY) return json({ message: L("Dnešní limit sdílení tréninků je vyčerpaný. Zkus to zítra.", "You've reached today's limit for sharing workouts. Try again tomorrow.") }, 429);
      const id = newId(), from = await senderName(env, session.user), date = DATE.test(String(body.date || "")) && body.date >= localToday() ? body.date : null;
      await db.prepare("INSERT INTO workout_shares(id,user_id,sport,name,from_name,plan_date,template_json,image_png) VALUES(?,?,?,?,?,?,?,?)").bind(id, env.USER_ID, template.sport, template.name, from, date, JSON.stringify(template), image).run();
      return json({ status: "ok", id, url: shareUrl(env, id) });
    }
    const shared = /^\/app\/api\/shares\/([A-Za-z0-9]{10})$/.exec(path);
    if (shared && request.method === "GET") {
      const share = await readShare(env.RAW_DB || env.DB, shared[1]);
      if (!share) return json({ message: L("Odkaz už neplatí.", "The link is no longer valid.") }, 404);
      const template = JSON.parse(share.template_json);
      const thresholds = ENDURANCE_SPORTS.includes(share.sport) ? await thresholdsOf(env) : null;
      return json({ status: "ok", share: { id: share.id, sport: share.sport, name: share.name, fromName: share.from_name || null, date: share.plan_date || null, own: Number(share.user_id) === Number(env.USER_ID), ...workoutFields({ ...template, sport: share.sport }, thresholds) } });
    }

    // A saved or received gym workout planned for a day: a proposal with the
    // athlete's own loads, confirmed like a generated one (/app/api/gym/confirm).
    if (path === "/app/api/gym/template" && request.method === "POST") {
      const template = cleanTemplate(body.template || body);
      if (template.sport !== "gym") throw new Error(L("Kolo a běh se plánují z Mých tréninků.", "Rides and runs are planned from My workouts."));
      const date = DATE.test(String(body.date || "")) ? body.date : localToday();
      if (date < localToday()) throw new Error(L("Trénink jde naplánovat jen na dnešek nebo později.", "A workout can only be planned for today or later."));
      assertTrainingAllowed(await getAthleteState(env.DB));
      let context;
      try { context = await buildStrengthContext(env, date); }
      catch (error) { console.error("Strength context for a saved gym workout failed", error.message); throw new Error(L("Trénink se nepodařilo sestavit. Zkus to znovu.", "Couldn't build the workout. Try again.")); }
      if (context.status !== "ok") throw new Error(L("Data pro posilovnu nejsou připravená.", "The gym data isn't ready."));
      const plan = templateStrengthPlan(context, template, { fromName: text(body.fromName, 40) });
      const minutes = template.minutes || plan.timing?.estimatedMinutes || 60;
      await ensureCoachInboxTable(env.DB);
      const draft = { kind: "gym_preview", plan, minutes, startTime: null };
      const saved = await env.DB.prepare("INSERT INTO coach_inbox(user_id,channel,message,draft_json) VALUES(?,?,?,?)").bind(env.USER_ID, "gym", L("Uložený trénink", "Saved workout"), JSON.stringify(draft)).run();
      const muscles = Object.fromEntries([...new Set(plan.rows.map(r => r?.[1]).filter(Boolean))].map(name => [name, exerciseMuscles(name)]));
      return json({ status: "ok", plan, draftId: saved.meta?.last_row_id, muscles, minutes });
    }
    return json({ message: "Not found" }, 404);
  } catch (error) {
    return json({ message: error.message }, 400);
  }
}

// ----- "Popiš slovy": a ride or run from the athlete's words -----

const STEP_SCHEMA = { type: "object", additionalProperties: false, required: ["label", "seconds", "km", "low", "high", "cadence"], properties: {
  label: { type: "string" }, seconds: { type: ["integer", "null"] }, km: { type: ["number", "null"] },
  low: { type: "integer" }, high: { type: "integer" }, cadence: { type: ["integer", "null"] }
} };
// A swim step: metres at % of CSS, or a rest at the wall in seconds.
const SWIM_STEP_SCHEMA = { type: "object", additionalProperties: false, required: ["label", "meters", "seconds", "rest", "low", "high"], properties: {
  label: { type: "string" }, meters: { type: ["integer", "null"] }, seconds: { type: ["integer", "null"] }, rest: { type: "boolean" },
  low: { type: "integer" }, high: { type: "integer" }
} };
const describeSchema = step => ({ type: "json_schema", name: "endurance_workout", strict: true, schema: { type: "object", additionalProperties: false, required: ["name", "blocks"], properties: {
  name: { type: "string" },
  blocks: { type: "array", items: { type: "object", additionalProperties: false, required: ["repeats", "steps"], properties: { repeats: { type: "integer" }, steps: { type: "array", items: step } } } }
} } });
const DESCRIBE_SCHEMA = describeSchema(STEP_SCHEMA), SWIM_DESCRIBE_SCHEMA = describeSchema(SWIM_STEP_SCHEMA);


// The athlete's thresholds go along, so "3×10 at 280 W" or "4:10/km" turn into
// the right % instead of a guess.
export function describeInput(sport, words, thresholds) {
  if (sport === "swim") {
    const css = Number(thresholds?.swimCss) > 0 ? Math.round(thresholds.swimCss) : null;
    return JSON.stringify({ sport, language: lang(), threshold: css ? { css: Math.floor(css / 60) + ":" + String(css % 60).padStart(2, "0") + "/100m", cssSeconds: css } : null, poolLengthMeters: Number(thresholds?.poolLength) || 25, description: words });
  }
  const pace = Number(thresholds?.runThresholdPace) > 0 ? Math.round(thresholds.runThresholdPace) : null;
  const threshold = sport === "run" ? (pace ? { thresholdPace: Math.floor(pace / 60) + ":" + String(pace % 60).padStart(2, "0") + "/km", thresholdPaceSeconds: pace } : null)
    : Number(thresholds?.ftp) > 0 ? { ftpWatts: Math.round(thresholds.ftp) } : null;
  return JSON.stringify({ sport, language: lang(), threshold, description: words });
}

async function describeWorkout(env, sport, words, thresholds = null) {
  const r = await callOpenAI(env, { feature: "workout-describe", instructions: describeInstructions(sport), input: describeInput(sport, words, thresholds), format: sport === "swim" ? SWIM_DESCRIBE_SCHEMA : DESCRIBE_SCHEMA, maxOutputTokens: 3000, model: lightModel(env) });
  let data;
  try { data = JSON.parse(r.text); } catch { throw new Error(L("Trénink se nepodařilo sestavit, zkus ho popsat jinak.", "The workout couldn't be built; try describing it differently.")); }
  return describedTemplate(sport, data, thresholds);
}

// The AI's answer as an own workout; a swim's lengths end at the wall of the athlete's pool.
export function describedTemplate(sport, data, thresholds = null) {
  const pool = Number(thresholds?.poolLength) || 25;
  const swimStep = st => st.rest ? { label: st.label, rest: true, seconds: st.seconds }
    : { label: st.label, low: st.low, high: st.high, meters: Math.max(pool, Math.round(Math.round((Number(st.meters) || pool) / pool) * pool)) };
  const blocks = (data?.blocks || []).map(b => ({ repeats: b.repeats, steps: (b.steps || []).map(st => sport === "swim" ? swimStep(st)
    : { label: st.label, low: st.low, high: st.high, cadence: st.cadence, ...(sport === "run" && st.km ? { km: st.km } : { seconds: st.seconds }) }) }));
  return cleanEnduranceTemplate({ sport, name: data?.name, blocks });
}

// The planned workout behind an event id ("planned:<id>"), as /app/api/workouts/planned reads it.
async function plannedWorkout(env, eventId) {
  const id = eventId.replace(/^planned:/, "").slice(0, 120);
  if (!id) return null;
  const link = await env.DB.prepare("SELECT workout_id FROM workout_schedule_links WHERE user_id=? AND intervals_event_id=? ORDER BY id DESC LIMIT 1").bind(env.USER_ID, id).first().catch(() => null);
  const library = link ? await getWorkout(env.DB, link.workout_id).catch(() => null) : null;
  if (library) return library;
  const row = await env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family IN ('intervals','local') AND data_type='planned-workout' AND external_id=?").bind(env.USER_ID, "planned:" + id).first().catch(() => null);
  let event = null;
  try { event = JSON.parse(row?.payload_json || "null"); } catch { /* broken row */ }
  return event ? plannedEventWorkout(event) : null;
}

async function readShare(db, id) {
  if (!ID.test(String(id || ""))) return null;
  await ensureShareTable(db);
  return db.prepare("SELECT id,user_id,sport,name,from_name,plan_date,template_json FROM workout_shares WHERE id=?").bind(String(id)).first();
}

// Links are on aurin.health whichever host the app talks to, so they never change.
export function shareUrl(env, id) { return new URL("/t/" + id, env?.APP_ORIGIN || SITE_ORIGIN).toString(); }

// ----- The public page of a link (anyone, no sign-in) -----

const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SPORT_LABEL = { gym: ["Posilovna", "Gym"], ride: ["Kolo", "Ride"], run: ["Běh", "Run"], swim: ["Plavání", "Swim"] };

// /t/<id> and /t/<id>/og.png; null for any other path.
export async function publicSharePage(request, db, url, env = {}) {
  const m = /^\/t\/([A-Za-z0-9]{10})(\/og\.png|\/workout\.zwo)?$/.exec(url.pathname);
  if (!m || !db) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  await ensureShareTable(db);
  // A ride for Zwift (.zwo), with the sections at the middle of their ranges.
  if (m[2] === "/workout.zwo") {
    const row = await db.prepare("SELECT sport,name,template_json FROM workout_shares WHERE id=?").bind(m[1]).first();
    if (row?.sport !== "ride") return new Response("Not found", { status: 404 });
    const file = (row.name.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workout") + ".zwo";
    return new Response(zwoFile(JSON.parse(row.template_json)), { headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="${file}"`, "cache-control": "public, max-age=300" } });
  }
  if (m[2]) {
    const row = await db.prepare("SELECT image_png FROM workout_shares WHERE id=?").bind(m[1]).first();
    if (!row?.image_png) return new Response("Not found", { status: 404 });
    const bytes = Uint8Array.from(atob(row.image_png), c => c.charCodeAt(0));
    return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  }
  const share = await db.prepare("SELECT id,sport,name,from_name,template_json,image_png IS NOT NULL AS has_image FROM workout_shares WHERE id=?").bind(m[1]).first();
  const en = siteLang(request) === "en", t = (cs, enText) => en ? enText : cs;
  if (!share) return new Response(page({ en, title: t("Odkaz už neplatí", "Link no longer valid"), body: `<h1>${t("Odkaz už neplatí", "This link is no longer valid")}</h1><p class="sub">${t("Trénink byl smazán nebo odkaz nikdy neexistoval.", "The workout was deleted or the link never existed.")}</p>` }), { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  let template = {};
  try { template = JSON.parse(share.template_json); } catch { /* broken row */ }
  const exercises = template.exercises || [];
  const endurance = ENDURANCE_SPORTS.includes(share.sport);
  const sport = (SPORT_LABEL[share.sport] || SPORT_LABEL.gym)[en ? 1 : 0];
  const from = share.from_name ? t(share.from_name + " ti posílá trénink", share.from_name + " sent you a workout") : t("Sdílený trénink", "Shared workout");
  const minutes = endurance ? Math.round(totalMinutes(enduranceStructure(template))) : template.minutes;
  const length = minutes ? (minutes >= 60 ? Math.floor(minutes / 60) + " h" + (minutes % 60 ? " " + (minutes % 60) + " min" : "") : minutes + " min") : null;
  const meta = [sport, length, endurance ? null : exercises.length + " " + t(exercises.length === 1 ? "cvik" : exercises.length < 5 ? "cviky" : "cviků", exercises.length === 1 ? "exercise" : "exercises")].filter(Boolean).join(" · ");
  const muscles = endurance ? [] : mainMuscles(template, en);
  const list = endurance ? sectionList(template) : exercises.map(e => `<li><span>${escapeHtml(e.name)}</span><span class="sr">${escapeHtml(e.sets + " × " + e.reps)}</span></li>`).join("");
  const description = from + " · " + meta;
  const og = share.has_image ? new URL("/t/" + share.id + "/og.png", url.origin).toString() : null;
  // The App Store banner and the way there when the app is not installed;
  // APP_STORE_ID is the app's Apple ID in App Store Connect.
  const storeId = /^\d{6,12}$/.test(String(env.APP_STORE_ID || "")) ? String(env.APP_STORE_ID) : null;
  const store = storeId ? "https://apps.apple.com/app/id" + storeId : null;
  const banner = storeId ? `<meta name="apple-itunes-app" content="app-id=${storeId}, app-argument=${escapeHtml(url.origin + url.pathname)}">` : "";
  const head = banner + `<meta property="og:type" content="website"><meta property="og:site_name" content="Aurin"><meta property="og:title" content="${escapeHtml(share.name)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url.origin + url.pathname)}">` + (og ? `<meta property="og:image" content="${og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : "");
  const body = `<p class="eyebrow"><span class="avatar">${escapeHtml((share.from_name || "?").slice(0, 1).toUpperCase())}</span>${escapeHtml(from)}</p>
<h1>${escapeHtml(share.name)}</h1>
<p class="sub">${escapeHtml(meta)}</p>
${muscles.length ? `<div class="bars">${muscles.map((name, i) => `<div><i class="c${i}"></i><span>${escapeHtml(name)}</span></div>`).join("")}</div>` : ""}
${endurance ? intervalGraph(template) : ""}
<ol class="card">${list}</ol>
<p class="note">${endurance ? t(share.sport === "swim" ? "Tempo na 100 m ti aplikace přepočte podle tvého CSS." : share.sport === "run" ? "Tempo ti aplikace přepočte podle tvého prahového tempa." : "Watty ti aplikace přepočte podle tvého FTP.", share.sport === "swim" ? "The app turns the paces per 100 m into yours from your CSS." : share.sport === "run" ? "The app turns the paces into yours from your threshold pace." : "The app turns the watts into yours from your FTP.") : t("Váhy ti aplikace navrhne podle tvých vlastních tréninků a toho, jak jsi odpočatý.", "The app suggests the weights from your own workouts and how rested you are.")}</p>
<a class="button" id="open" href="aurin://open/share/${share.id}">${t("Otevřít v Aurinu", "Open in Aurin")}</a>
<p class="note" id="noapp" hidden>${store ? `<a href="${store}">${t("Stáhni si Aurin z App Store", "Get Aurin on the App Store")}</a>` : t("Aurin bude brzy v App Store.", "Aurin is coming soon to the App Store.")}</p>${share.sport === "ride" ? `
<a class="button ghost" href="/t/${share.id}/workout.zwo">${t("Stáhnout .zwo pro Zwift", "Download .zwo for Zwift")}</a>` : ""}`;
  // Without the app the scheme does nothing: the page stays, so it shows the way to the app.
  const script = `<script>document.getElementById("open").addEventListener("click",function(){setTimeout(function(){if(!document.hidden){${store ? `location.href=${JSON.stringify(store)}` : `document.getElementById("noapp").hidden=false`}}},1500)})</script>`;
  return new Response(page({ en, title: share.name, description, head, body: body + script }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", "Content-Security-Policy": scriptPolicy(script) } });
}

// The sections as bars over time, coloured by zone, like the app's chart.
function intervalGraph(template) {
  const structure = enduranceStructure(template), total = totalMinutes(structure) || 1, bars = [];
  let x = 0;
  for (const b of structure) for (let i = 0; i < (b.steps ? b.repeats : 1); i++) for (const st of b.steps || [b]) {
    const w = st.durationMinutes / total * 100, h = Math.min(100, st.power / 1.5);
    bars.push(`<rect x="${x.toFixed(2)}" y="${(100 - h).toFixed(2)}" width="${Math.max(0.3, w - 0.4).toFixed(2)}" height="${h.toFixed(2)}" rx="1" class="z${zoneClass(st.power)}"/>`);
    x += w;
  }
  return `<svg class="graph" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="">${bars.join("")}</svg>`;
}
const zoneClass = p => p < 56 ? 1 : p < 76 ? 2 : p < 88 ? 3 : p < 106 ? 4 : 5;

function sectionList(template) {
  return blockLines(template).map(b => {
    const steps = b.steps.map(st => `${escapeHtml(st.length)} · ${escapeHtml(st.target)}`).join(" / ");
    const title = (b.repeats > 1 ? b.repeats + "× " : "") + b.steps.map(st => st.label).join(" / ");
    return `<li class="sec"><i class="z${zoneClass(Math.max(...b.steps.map(st => st.percent)))}"></i><span><b>${escapeHtml(title)}</b><span class="sr">${steps}</span></span></li>`;
  }).join("");
}

function page({ en, title, description = "", head = "", body }) {
  return `<!doctype html><html lang="${en ? "en" : "cs"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)} · Aurin</title><meta name="description" content="${escapeHtml(description)}">${head}<style>
:root{--bg:#F3EFE8;--card:#FBFAF7;--ink:#1B1A17;--muted:#6D6A63;--line:rgba(27,26,23,.09);--button:#15140F;--onbutton:#fff;--avatar:#1F6B52;--c0:#A35A12;--c1:#1F6B52;--c2:#4F46C8;--c3:#1D6FA3;--z1:#9C978D;--z2:#1D6FA3;--z3:#1F6B52;--z4:#C4782A;--z5:#B4532F}
@media (prefers-color-scheme:dark){:root{--bg:#0A0B0C;--card:#1C1E1F;--ink:#ECEAE6;--muted:#9AA39F;--line:rgba(236,234,230,.08);--button:#F4F2EE;--onbutton:#0A0B0C;--avatar:#2E9E78;--c0:#F2B46B;--c1:#8FE6C4;--c2:#A5A1FF;--c3:#7CC3F0;--z1:#5C6266;--z2:#7CC3F0;--z3:#8FE6C4;--z4:#F0B36E;--z5:#F0907A}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
main{max-width:520px;margin:0 auto;padding:40px 20px 56px}
.eyebrow{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px;margin:0}
.avatar{width:30px;height:30px;border-radius:50%;background:var(--avatar);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}
h1{font-family:"New York","Iowan Old Style",Georgia,serif;font-weight:400;font-size:38px;line-height:1.1;margin:14px 0 4px}
.sub{color:var(--muted);margin:0}
.bars{display:flex;gap:6px;margin-top:18px}.bars div{flex:1}.bars i{display:block;height:6px;border-radius:3px}.bars span{display:block;color:var(--muted);font-size:12px;margin-top:6px}
.c0{background:var(--c0)}.c1{background:var(--c1)}.c2{background:var(--c2)}.c3{background:var(--c3)}
.card{list-style:none;margin:22px 0 0;padding:4px 18px;background:var(--card);border-radius:20px}
.card li{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-top:1px solid var(--line)}.card li:first-child{border-top:0}
.sr{color:var(--muted);white-space:nowrap}
.note{color:var(--muted);font-size:14px;margin:14px 2px 0}.note a{color:var(--ink)}
.button{display:flex;align-items:center;justify-content:center;height:52px;margin-top:22px;border-radius:999px;background:var(--button);color:var(--onbutton);font-weight:600;text-decoration:none}
.button.ghost{background:none;color:var(--ink);border:1px solid var(--line);margin-top:12px}
.graph{display:block;width:100%;height:96px;margin-top:20px}
.z1{fill:var(--z1);background:var(--z1)}.z2{fill:var(--z2);background:var(--z2)}.z3{fill:var(--z3);background:var(--z3)}.z4{fill:var(--z4);background:var(--z4)}.z5{fill:var(--z5);background:var(--z5)}
.card li.sec{justify-content:flex-start;align-items:stretch}.sec i{flex:none;width:4px;border-radius:2px}.sec>span{display:flex;flex-direction:column}.sec b{font-weight:500}
</style></head><body><main>${body}</main></body></html>`;
}

