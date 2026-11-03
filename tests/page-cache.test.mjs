import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cachedPage, forgetKeptPages, CACHED_PAGES } from '../src/page-cache.js';
import { overviewPage } from '../src/site-pages.js';

function fakeCache() {
  const store = new Map();
  return {
    store,
    async match(key) { const r = store.get(key); return r ? r.clone() : undefined; },
    async put(key, response) { store.set(key, response); }
  };
}
const env = (id = 'v1') => ({ CF_VERSION_METADATA: { id }, APP_ORIGIN: 'https://staging.aurin.health' });
const page = (text = '<p>page</p>') => new Response(text, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, max-age=0, must-revalidate', 'Content-Security-Policy': "default-src 'self'" } });

test('a public page is built once per version and then served from memory', async () => {
  forgetKeptPages();
  const cache = fakeCache();
  let built = 0;
  const render = () => { built++; return page(); };
  const url = new URL('https://aurin.health/');
  const first = await cachedPage(url, env(), null, render, { cache });
  const second = await cachedPage(url, env(), null, render, { cache });
  assert.equal(built, 1);
  assert.equal(first.headers.get('X-Page-Cache'), 'miss');
  assert.equal(second.headers.get('X-Page-Cache'), 'memory');
  assert.equal(await second.text(), '<p>page</p>');
  assert.equal(second.headers.get('cache-control'), 'private, max-age=0, must-revalidate', 'browsers still ask again every visit');
  assert.equal(second.headers.get('Content-Security-Policy'), "default-src 'self'");
});

test('a fresh isolate takes the page from the edge cache, with the browser header restored', async () => {
  forgetKeptPages();
  const cache = fakeCache();
  const url = new URL('https://aurin.health/terms');
  await cachedPage(url, env(), null, () => page('<p>terms</p>'), { cache });
  const [key, stored] = [...cache.store][0];
  assert.match(key, /aurin-page=v1$/);
  assert.equal(stored.headers.get('cache-control'), 'public, max-age=86400', 'only the edge copy is public');
  forgetKeptPages();
  const again = await cachedPage(url, env(), null, () => { throw new Error('built again'); }, { cache });
  assert.equal(again.headers.get('X-Page-Cache'), 'edge');
  assert.equal(again.headers.get('cache-control'), 'private, max-age=0, must-revalidate');
  assert.equal(again.headers.get('x-aurin-browser-cache-control'), null);
  assert.equal(await again.text(), '<p>terms</p>');
});

test('a new Worker version builds the page again', async () => {
  forgetKeptPages();
  const cache = fakeCache();
  const url = new URL('https://aurin.health/privacy');
  let built = 0;
  const render = () => { built++; return page(); };
  await cachedPage(url, env('v1'), null, render, { cache });
  await cachedPage(url, env('v2'), null, render, { cache });
  assert.equal(built, 2);
});

test('nothing is kept without the version, for other paths and hosts, or for an error page', async () => {
  forgetKeptPages();
  const cache = fakeCache();
  let built = 0;
  const render = () => { built++; return page(); };
  await cachedPage(new URL('https://aurin.health/'), {}, null, render, { cache });
  await cachedPage(new URL('https://aurin.health/'), {}, null, render, { cache });
  await cachedPage(new URL('https://aurin.health/robots.txt'), env(), null, render, { cache });
  await cachedPage(new URL('https://aurin.health/robots.txt'), env(), null, render, { cache });
  await cachedPage(new URL('https://evil.example/'), env(), null, render, { cache });
  await cachedPage(new URL('https://evil.example/'), env(), null, render, { cache });
  assert.equal(built, 6);
  const failing = () => new Response('no', { status: 500 });
  await cachedPage(new URL('https://aurin.health/support'), env(), null, failing, { cache });
  assert.equal(cache.store.size, 0);
});

test('the test server host is kept under its own key', async () => {
  forgetKeptPages();
  const cache = fakeCache();
  await cachedPage(new URL('https://staging.aurin.health/'), env(), null, () => page('staging'), { cache });
  await cachedPage(new URL('https://aurin.health/'), env(), null, () => page('live'), { cache });
  const live = await cachedPage(new URL('https://aurin.health/'), env(), null, () => page('x'), { cache });
  assert.equal(await live.text(), 'live');
  assert.equal(cache.store.size, 2);
});

test('the edge copy is written after the answer when the Worker gives waitUntil', async () => {
  forgetKeptPages();
  const cache = fakeCache();
  const waits = [];
  await cachedPage(new URL('https://aurin.health/health-data'), env(), { waitUntil: p => waits.push(p) }, () => page(), { cache });
  assert.equal(waits.length, 1);
  await Promise.all(waits);
  assert.equal(cache.store.size, 1);
});

test('the kept pages read nothing per visitor: the overview is the same whatever the cookie or language', async () => {
  const a = await overviewPage(new Request('https://aurin.health/', { headers: { cookie: 'lw-lang=cs', 'accept-language': 'cs' } })).text();
  const b = await overviewPage(new Request('https://aurin.health/', { headers: { 'accept-language': 'en-US' } })).text();
  assert.equal(a, b);
  const source = readFileSync(new URL('../src/site-pages.js', import.meta.url), 'utf8');
  for (const name of ['overviewPage', 'privacyPage', 'termsPage', 'supportPage', 'healthDataPage']) {
    const body = source.slice(source.indexOf(`export function ${name}(`)).split('\nexport function ')[0];
    assert.doesNotMatch(body, /siteLang\(|headers\.get\(|searchParams/, `${name} reads nothing from the visitor`);
  }
  assert.deepEqual([...CACHED_PAGES].sort(), ['/', '/cs/privacy', '/cs/terms', '/health-data', '/privacy', '/support', '/terms']);
});

test('both Workers have the version binding the page cache keys on', () => {
  const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal((text.match(/"version_metadata": \{ "binding": "CF_VERSION_METADATA" \}/g) || []).length, 2);
});
