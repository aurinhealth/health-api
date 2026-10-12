import test from 'node:test';
import assert from 'node:assert/strict';
import {aiLanguageNote, withLang} from '../src/lang.js';

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
