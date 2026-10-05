// Technique card for every catalog exercise: setup, movement, common
// mistakes and breathing, with a demonstration video. The athlete can save
// an own video link per exercise; it replaces the library video for them.
import { TECHNIQUE } from './exercise-technique-data.js';
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

export function techniqueFor(name, own = null) {
  const exercise = normalizeExerciseName(name);
  const t = TECHNIQUE[exercise], def = EXERCISES[exercise];
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
