import test from 'node:test';
import assert from 'node:assert/strict';
import { narrow } from '../src/shared-foods.js';

// Two letters of the whole query ("bi" of "bily jogurt") matched most of a big
// catalogue, and the 500 newest rows could leave the right food out.
test('the shared catalogue is narrowed by the longest word of the query', () => {
  assert.equal(narrow('bily jogurt'), 'jog');
  assert.equal(narrow('ryze'), 'ryz');
  assert.equal(narrow('ok'), 'ok');
});
