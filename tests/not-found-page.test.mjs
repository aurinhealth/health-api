import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {_resetTenancyForTest} from '../src/tenancy.js';
import {notFoundPage} from '../src/site-pages.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function database() {
  const db=createD1(); db.sqlite.exec(read('staging/schema.sql'));
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()) {
    if(!db.sqlite.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get(name)) {
      db.sqlite.exec(read('migrations/'+name)); db.sqlite.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name);
    }
  }
  return db;
}

test('the 404 page is the site, with the way home and the waitlist, and stays out of search',async()=>{
  const response=notFoundPage(new Request('https://aurin.health/anything-mistyped'));
  assert.equal(response.status,404);
  const html=await response.text();
  assert.match(html,/<html lang="en"/);
  assert.match(html,/<h1>This page doesn’t exist\.<\/h1>/);
  assert.match(html,/<a href="\/">Go to the home page<\/a>/);
  assert.match(html,/<form class="wl" action="\/waitlist"/);
  assert.match(html,/<meta name="robots" content="noindex">/);
});

test('a browser opening an unknown address gets the 404 page; the API still answers 401',async()=>{
  const entrypoint=(await import('../src/entrypoint.js')).default;
  _resetTenancyForTest();
  const env={DB:database(),SESSION_SECRET:'test-session-key',OWNER_EMAIL:'owner@example.test'};
  const open=(path,headers={},method='GET')=>entrypoint.fetch(new Request('https://aurin.health'+path,{method,headers}),env,{waitUntil(){}});
  const browser={Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'};
  for(const path of ['/anything-mistyped','/cs/support','/app/api/today']){
    const page=await open(path,browser);
    assert.equal(page.status,404,path);
    assert.match(page.headers.get('content-type'),/text\/html/);
  }
  assert.equal((await open('/anything-mistyped',browser,'HEAD')).status,404);
  const api=await open('/app/api/today',{Accept:'application/json'});
  assert.equal(api.status,401);
  assert.equal((await open('/app/api/today')).status,401);
  const czech=await open('/cs/privacy',browser);
  assert.equal(czech.status,200);
  assert.match(await czech.text(),/<html lang="cs"/);
  const moved=await open('/privacy?lang=cs',browser);
  assert.equal(moved.status,301);
  assert.equal(moved.headers.get('Location'),'https://aurin.health/cs/privacy');
});
