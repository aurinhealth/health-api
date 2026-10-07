import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {dashboardPage} from '../src/dashboard.js';
import {englishScript, langBoot} from '../src/i18n.js';
import {aiLanguageNote, withLang} from '../src/lang.js';
import {EN, EN_TEMPLATES, EN_PATTERNS} from '../src/i18n-en.js';

test('the language is chosen before the first paint: lw-lang cookie, else the device', async () => {
  const html = await dashboardPage().text(), head = html.slice(0, html.indexOf('<body'));
  assert.ok(head.includes(langBoot));
  assert.match(head, /lw-lang=\(cs\|en\)/);
  assert.match(head, /\^\(cs\|sk\)/, 'Czech and Slovak devices get Czech, others English');
  assert.match(head, /\/app\/i18n-en\.js\?v=/);
});

test('settings offer Czech and English, and picking the device language clears the cookie', () => {
  const client = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
  for (const lang of ['cs', 'en']) assert.match(client, new RegExp('data-lang-choice="' + lang + '"'));
  assert.match(client, /<h3>Jazyk<\/h3>/);
  assert.match(client, /deviceLang/);
});

test('the English script serves the dictionary and translator as JavaScript', async () => {
  const res = englishScript();
  assert.match(res.headers.get('content-type'), /javascript/);
  const body = await res.text();
  assert.doesNotThrow(() => new vm.Script(body));
  assert.ok(body.startsWith('window.LW_EN='));
});

test('dictionary entries are English and every pattern compiles', () => {
  for (const [cs, en] of Object.entries(EN)) {
    assert.equal(typeof en, 'string', cs);
    assert.doesNotMatch(en, /[ěščřžůň]/i, cs + ' → ' + en);
  }
  for (const [cs, en] of Object.entries(EN_TEMPLATES)) assert.equal((cs.match(/\{n\}/g) || []).length, (en.match(/\{n\}/g) || []).length, cs);
  for (const [re] of EN_PATTERNS) assert.doesNotThrow(() => new RegExp(re, 'gu'), re);
  for (const key of ['Světlý', 'Tmavý', 'Jazyk', 'Nastavení']) assert.ok(EN[key], key);
});

test('AI texts follow the app language; chat answers in the language the athlete writes in', () => {
  withLang('en', () => {
    assert.match(aiLanguageNote('day-review'), /English/);
    assert.match(aiLanguageNote('assistant'), /language the athlete writes in/);
    assert.match(aiLanguageNote('assistant'), /workout names and descriptions[^.]*English/);
    assert.equal(aiLanguageNote('food-sentence'), '');
  });
  withLang('cs', () => {
    assert.equal(aiLanguageNote('day-review'), '');
    assert.match(aiLanguageNote('assistant'), /v jazyce, ve kterém sportovec píše/);
  });
  assert.equal(aiLanguageNote('reflection'), '');
});
