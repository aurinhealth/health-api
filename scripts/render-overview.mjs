// Renders the overview of the app as images (render-overview.html): the hero, one board with everything,
// a card per area of the app, the connections and the call for testers. For Reddit, the App Store page
// and anywhere else a picture of the app is wanted; the screens are the website's (public/site/app/).
//
//   node scripts/render-overview.mjs out/     (needs playwright and its Chromium)
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {join, dirname, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || 'out';
mkdirSync(out, {recursive: true});

// The page and the website's files, served as the website serves them (/site/… from public/site/).
const TYPES = {'.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const file = path === '/' ? join(root, 'scripts', 'render-overview.html') : join(root, path.startsWith('/site/') ? 'public' : '.', path);
  try {
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
const page = await browser.newPage({viewport: {width: 2000, height: 1200}, deviceScaleFactor: 1});
await page.goto(url);
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
});
for (const shot of await page.locator('[data-shot]').all()) {
  const name = await shot.getAttribute('data-shot');
  await shot.screenshot({path: join(out, `${name}.png`), animations: 'disabled'});
  console.log(`${name}.png`);
}
await browser.close();
server.close();
