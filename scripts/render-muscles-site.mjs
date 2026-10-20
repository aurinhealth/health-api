// Renders the website's 3D muscle figure (public/site/muscles/) from the licensed model, which stays
// off the website: 72 turns of the figure with the sample day's colours (f00–f71), of which the site
// keeps the front (f00) and the back (f36), and a close-up of every muscle as its detail shows it in
// the app (z-<id>).
//
//   gunzip -c muscles-v1.bin.gz > scripts/muscles-v1.bin   (the file in R2, models/muscles-v1.bin.gz)
//   npx http-server scripts -p 8765 &  then  node scripts/render-muscles-site.mjs out/
//   then convert f00, f36 and the z-*.png to webp (quality 82).
/* global setup, paint, paintSel, place, frame, heads */ // defined by render-muscles-site.html, run inside the page
import {chromium} from 'playwright-core';
import fs from 'node:fs';

const out = process.argv[2] || 'out';
fs.mkdirSync(out, {recursive: true});
// The sample day (DemoData.muscles): tired in rust, recovering in amber, the rest grey (Palette.swift, Muscle3D.swift).
const TIRED = '#B4532F', RECOVERING = '#C4782A', RESTED = '#C9C3BA', BONE = '#E4DFD7', GREEN = '#1F6B52';
const colors = {glutes: TIRED, hamstrings: TIRED, quads: TIRED, calves: TIRED, chest: RECOVERING, back: RECOVERING};
const BACK = ['hamstrings', 'glutes', 'calves', 'back', 'lower_back', 'traps', 'rear_delts', 'triceps'];

const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8765/render-muscles-site.html');
await page.waitForFunction(() => window.ready, null, {timeout: 60000});
const save = (file, url) => fs.writeFileSync(`${out}/${file}`, Buffer.from(url.split(',')[1], 'base64'));
const two = i => String(i).padStart(2, '0');

await page.evaluate(([c, rest, bone]) => { setup(640, 1000, 160, 250); paint(c, rest, bone); place(null); }, [colors, RESTED, BONE]);
for (let i = 0; i < 72; i++) {
  const yaw = i / 72 * Math.PI * 2;
  save(`f${two(i)}.png`, await page.evaluate(y => frame(y, false), yaw));
  save(`i${two(i)}.png`, await page.evaluate(y => frame(y, true), yaw));
}
// MuscleDetailView's header: the figure close on the muscle, turned to its side, the rest dimmed.
await page.evaluate(() => setup(800, 440, 10, 10));
for (const id of (await page.evaluate(() => heads)).filter(id => id !== 'other' && id !== 'bone')) {
  const yaw = BACK.includes(id) ? Math.PI - 0.3 : 0.3;
  save(`z-${id}.png`, await page.evaluate(([id, c, rest, bone, yaw]) => { paintSel(id, c, rest, bone); place(id); return frame(yaw, false); }, [id, colors[id] || GREEN, RESTED, BONE, yaw]));
}
await browser.close();
