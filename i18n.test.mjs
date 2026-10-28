import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROW_COUNT } from './i18n.js';
import { ES } from './i18n-es.js';

test('the Spanish column lines up with every translation row', () => {
  assert.equal(ES.length, ROW_COUNT);
  assert.ok(ES.every(s => typeof s === 'string' && s.length && !/[가-힣]/.test(s)));
});
