// Turns the simulator recording of ios-native.yml (Aurin-screens artifact, preview/) into the App Store
// preview videos (app previews), one per language: preview/app-preview-en.mp4 and app-preview-cs.mp4.
//
//   node scripts/app-preview.mjs screens/preview
//
// The directory holds what the workflow left there: recording.mp4 (the simulator's screen while
// AppPreviewTests ran), started.txt (when the recording began, seconds since 1970) and marks.txt (the test's
// "<language> in|out <seconds>" lines). Each in…out is one clip; the clips of a language play one after
// another, so the launches and the test runner never show. App Store Connect takes 15–30 s, 886×1920
// portrait for every current iPhone size, H.264 at 30 fps with a stereo track (silent here).
// Needs ffmpeg (brew install ffmpeg).
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {join} from 'node:path';

const WIDTH = 886, HEIGHT = 1920, FPS = 30, MIN = 15, MAX = 30;
// The simulator's first frame comes a moment after "Recording started": the cuts move by this much.
const LAG = Number(process.env.PREVIEW_LAG ?? 0.3);

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'recording.mp4'))) {
  console.error('usage: node scripts/app-preview.mjs <directory with recording.mp4, started.txt and marks.txt>');
  process.exit(2);
}
try { execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); } catch { console.error('ffmpeg is missing: brew install ffmpeg'); process.exit(2); }

const started = Number(readFileSync(join(dir, 'started.txt'), 'utf8').trim());
const clips = {};
let open = {};
for (const line of readFileSync(join(dir, 'marks.txt'), 'utf8').split('\n')) {
  const [language, edge, at] = line.trim().split(/\s+/);
  if (!language || !at) continue;
  const t = Math.max(0, Number(at) - started - LAG);
  if (edge === 'in') open[language] = t;
  else if (edge === 'out' && open[language] != null) {
    (clips[language] ??= []).push([open[language], t]);
    delete open[language];
  }
}

let failed = 0;
for (const [language, list] of Object.entries(clips)) {
  // Longer than App Store Connect takes: every clip gives up the same share of its end,
  // so each scene still shows.
  const total = list.reduce((sum, [from, to]) => sum + to - from, 0);
  const share = Math.min(1, (MAX - 0.1) / total);
  const kept = list.map(([from, to]) => [from, from + (to - from) * share]);
  if (share < 1) console.log(`${language}: ${total.toFixed(1)} s of clips, each kept to ${Math.round(share * 100)} %`);
  const length = kept.reduce((sum, [from, to]) => sum + to - from, 0);
  const target = join(dir, `app-preview-${language}.mp4`);
  // Each clip is its own input, seeked to: ffmpeg decodes only the clips, not the whole recording.
  const inputs = kept.flatMap(([from, to]) => ['-ss', from.toFixed(3), '-to', to.toFixed(3), '-i', join(dir, 'recording.mp4')]);
  const trims = kept.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS,fps=${FPS}[c${i}]`);
  const filter = [...trims,
    `${kept.map((_, i) => `[c${i}]`).join('')}concat=n=${kept.length}:v=1:a=0,` +
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,format=yuv420p[v]`].join(';');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', filter, '-map', '[v]', '-map', `${kept.length}:a`, '-t', length.toFixed(3),
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-r', String(FPS),
    '-b:v', '10M', '-maxrate', '12M', '-bufsize', '20M',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', target], {stdio: 'inherit'});
  const note = length < MIN ? `  too short: App Store Connect needs at least ${MIN} s` : '';
  if (note) failed++;
  console.log(`app-preview-${language}.mp4  ${kept.length} clips, ${length.toFixed(1)} s, ` +
    `${Math.round(statSync(target).size / 1024)} kB${note}`);
}
if (!Object.keys(clips).length) { console.error('marks.txt has no clips'); process.exit(1); }
if (failed) process.exit(1);
