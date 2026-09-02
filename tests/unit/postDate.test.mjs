import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePostDate, postDateTimestamp } from '../../src/utils/postDate.mjs';

test('parses NYT Unix-second strings', () => {
  const parsed = parsePostDate('1782404924');
  assert.ok(parsed);
  assert.equal(parsed.toISOString(), '2026-06-25T16:28:44.000Z');
});

test('preserves ISO strings and Unix-millisecond strings', () => {
  const iso = '2026-06-25T16:28:44.000Z';
  assert.equal(postDateTimestamp(iso), Date.parse(iso));
  assert.equal(postDateTimestamp('1782404924000'), Date.parse(iso));
});

test('rejects empty and malformed dates', () => {
  assert.equal(parsePostDate(''), null);
  assert.equal(parsePostDate('not-a-date'), null);
  assert.equal(parsePostDate(new Date(Number.NaN)), null);
});
