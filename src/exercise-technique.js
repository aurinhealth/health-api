// Technique card for every catalog exercise: setup, movement, where to feel
// it, common mistakes and breathing, with a demonstration video. The athlete
// can save an own video link per exercise; it replaces the library video for
// them. An exercise outside the catalog gets its card written once by the AI
// and stored (exercise_techniques), so it is never looked up again.
import { TECHNIQUE } from './exercise-technique-data.js';
import { FEEL } from './exercise-feel.js';
import { callOpenAI, lightModel } from './coach-assistant.js';
import { EXERCISES, FOCUS_GROUPS } from './strength-generator.js';
import { stationLabel } from './gym-equipment.js';
import { normalizeExerciseName } from './strength-normalization.js';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// The video id of a YouTube link (watch, youtu.be, shorts, embed), or null.
export function youtubeId(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1];
  return YOUTUBE_ID.test(id || '') ? id : null;
}

export function techniqueFor(name, own = null, stored = null) {
  const exercise = normalizeExerciseName(name);
  const t = TECHNIQUE[exercise] || stored, def = EXERCISES[exercise];
  if (!t && !def) return null;
  const query = t?.query || exercise + ' exercise proper form';
  const ownId = youtubeId(own?.url);
  const video = ownId ? { id: ownId, source: 'own' } : t?.video?.id && YOUTUBE_ID.test(t.video.id) ? { id: t.video.id, title: t.video.title || '', source: 'library' } : null;
  return {
    exercise,
    muscles: Object.values(FOCUS_GROUPS).filter(g => g.exercises.includes(exercise)).map(g => g.label),
    station: stationLabel(exercise),
    note: def?.note || '',
    setup: t?.setup || [], steps: t?.steps || [], mistakes: t?.mistakes || [], breathing: t?.breathing || '',
    feel: FEEL[exercise] || t?.feel || [], source: TECHNIQUE[exercise] ? 'library' : t ? 'ai' : null,
    video, ownUrl: own?.url || null,
    searchUrl: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
  };
}

async function ensureExerciseVideos(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS exercise_videos (user_id INTEGER NOT NULL, exercise TEXT NOT NULL, url TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, exercise))').run();
}

export async function ownExerciseVideo(db, exercise) {
  await ensureExerciseVideos(db);
  return db.prepare('SELECT url FROM exercise_videos WHERE user_id=? AND exercise=?').bind(db.userId, normalizeExerciseName(exercise)).first();
}

// An empty link removes the own video; anything else must be an http(s) link.
export async function saveOwnExerciseVideo(db, exercise, url) {
  const name = normalizeExerciseName(exercise), link = String(url || '').trim();
  if (!EXERCISES[name]) throw new Error('Neznámý cvik.');
  await ensureExerciseVideos(db);
  if (!link) { await db.prepare('DELETE FROM exercise_videos WHERE user_id=? AND exercise=?').bind(db.userId, name).run(); return null; }
  let parsed; try { parsed = new URL(link); } catch { throw new Error('Vlož celý odkaz na video (https://…).'); }
  if (!/^https?:$/.test(parsed.protocol) || link.length > 500) throw new Error('Vlož celý odkaz na video (https://…).');
  await db.prepare('INSERT INTO exercise_videos(user_id,exercise,url,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,exercise) DO UPDATE SET url=excluded.url,updated_at=CURRENT_TIMESTAMP').bind(db.userId, name, link).run();
  return { url: link };
}

// ---- Exercises outside the catalog ----------------------------------------
// Shared by all athletes (an exercise's technique is not personal data).
async function ensureTechniques(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS exercise_techniques (exercise TEXT PRIMARY KEY, technique_json TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
}
export async function storedTechnique(db, exercise) {
  await ensureTechniques(db);
  const row = await db.prepare('SELECT technique_json FROM exercise_techniques WHERE exercise=?').bind(normalizeExerciseName(exercise)).first();
  try { return row ? JSON.parse(row.technique_json) : null; } catch { return null; }
}
const list = { type: 'array', items: { type: 'string' } };
const TECHNIQUE_SCHEMA = { type: 'json_schema', name: 'exercise_technique', strict: true, schema: { type: 'object', additionalProperties: false, required: ['setup', 'steps', 'feel', 'mistakes', 'breathing', 'videoId', 'videoTitle', 'query'], properties: { setup: list, steps: list, feel: list, mistakes: list, breathing: { type: 'string' }, videoId: { type: ['string', 'null'] }, videoTitle: { type: 'string' }, query: { type: 'string' } } } };
const TECHNIQUE_INSTRUCTIONS = 'Jsi trenér silového tréninku. Napiš česky technickou kartu cviku pro posilovnu: setup (2–3 body nastavení), steps (3–5 bodů provedení), feel (2 body: kde má být cvik cítit a co naopak nemá bolet nebo pracovat), mistakes (2–3 časté chyby), breathing (jedna věta). Krátké věty, bez úvodu. Vyhledej na webu jedno kvalitní video s technikou na YouTube a vrať jeho 11znakové id (videoId) a název; když žádné nenajdeš, videoId je null. query je anglický dotaz pro vyhledání videa.';
// Written once per exercise; a broken answer stores nothing.
export async function generateTechnique(env, exercise) {
  const name = normalizeExerciseName(exercise);
  const r = await callOpenAI(env, { instructions: TECHNIQUE_INSTRUCTIONS, input: 'Cvik: ' + JSON.stringify(name), tools: [{ type: 'web_search' }], format: TECHNIQUE_SCHEMA, maxOutputTokens: 3000, model: lightModel(env) });
  const data = JSON.parse(r.text), clean = v => (Array.isArray(v) ? v : []).map(x => String(x).trim()).filter(Boolean).slice(0, 6);
  const technique = { setup: clean(data.setup), steps: clean(data.steps), feel: clean(data.feel), mistakes: clean(data.mistakes), breathing: String(data.breathing || '').trim(), video: YOUTUBE_ID.test(String(data.videoId || '')) ? { id: data.videoId, title: String(data.videoTitle || '').slice(0, 200) } : null, query: String(data.query || name + ' exercise proper form').slice(0, 200) };
  if (technique.steps.length < 3) throw new Error('Popis techniky se nepodařilo připravit.');
  await ensureTechniques(env.DB);
  await env.DB.prepare('INSERT INTO exercise_techniques(exercise,technique_json,model) VALUES(?,?,?) ON CONFLICT(exercise) DO NOTHING').bind(name, JSON.stringify(technique), r.model || null).run();
  return technique;
}
// Only an exercise the athlete really has in a plan or the history, so a
// typed name cannot run up AI costs.
export async function exerciseInUse(db, exercise) {
  const name = normalizeExerciseName(exercise);
  const history = await db.prepare('SELECT 1 FROM strength_sets WHERE user_id=? AND lower(exercise)=lower(?) LIMIT 1').bind(db.userId, name).first().catch(() => null);
  if (history) return true;
  return Boolean(await db.prepare('SELECT 1 FROM gym_plans WHERE user_id=? AND values_json LIKE ? LIMIT 1').bind(db.userId, '%' + JSON.stringify(name).slice(1, -1) + '%').first().catch(() => null));
}
