import test from 'node:test';
import assert from 'node:assert/strict';
import { sortReplies, buildReplySummary } from '../../src/utils/replySort.mjs';

const mk = (id, created, favs) => ({ id, created_at: created, favourites_count: favs, account: { username: id } });

const A = mk('a', '2024-07-31T09:00:00Z', 5);
const B = mk('b', '2024-07-31T10:00:00Z', 20);
const C = mk('c', '2024-07-31T11:00:00Z', 1);
const D = mk('d', '2024-07-31T12:00:00Z', 8);

const RELS = {
  a: [{ category: 'framing', topic: 'X' }, { category: 'values', topic: 'Y' }],
  b: [],
  c: [{ category: 'questions', topic: 'X' }],
  d: [{ category: 'framing', topic: 'Z' }],
};
const RANKS = { a: 2, c: 1 };
const opts = { rankOf: (r) => RANKS[r.id], relationsOf: (r) => RELS[r.id] ?? [] };

test('time mode sorts newest first', () => {
  assert.deepEqual(sortReplies([A, B, C, D], 'time', opts).map((r) => r.id), ['d', 'c', 'b', 'a']);
});

test('liked mode sorts by favourites desc, newest breaks ties', () => {
  const E = mk('e', '2024-07-31T13:00:00Z', 8);
  assert.deepEqual(sortReplies([A, B, C, D, E], 'liked', opts).map((r) => r.id), ['b', 'e', 'd', 'a', 'c']);
});

test('top mode: ranked replies first by rank asc, then unranked by score', () => {
  const out = sortReplies([A, B, C, D], 'top', opts).map((r) => r.id);
  assert.deepEqual(out.slice(0, 2), ['c', 'a'], 'ranked block ordered by rank');
  // Unranked: d has a relation (score ~2+1+log(9)); b has none but 20 favs (log(21)~1.3) → d first.
  assert.deepEqual(out.slice(2), ['d', 'b']);
});

test('sort does not mutate its input', () => {
  const input = [A, B, C];
  sortReplies(input, 'time', opts);
  assert.deepEqual(input.map((r) => r.id), ['a', 'b', 'c']);
});

test('unknown mode falls back to time', () => {
  assert.deepEqual(sortReplies([A, B], 'bogus', opts).map((r) => r.id), ['b', 'a']);
});

test('buildReplySummary digests counts, categories, topics, and samples', () => {
  const s = buildReplySummary([A, B, C, D], opts);
  assert.equal(s.total, 4);
  assert.equal(s.withContributions, 3);
  assert.deepEqual(s.byCategory[0], ['framing', 2]);
  assert.ok(s.topTopics.includes('X'));
  assert.ok(s.sample.length >= 1 && s.sample.length <= 2);
  assert.equal(s.sample[0].author, 'b', 'most-liked reply sampled first');
});

test('buildReplySummary extracts a first sentence', () => {
  const r = { ...mk('s', '2024-07-31T09:00:00Z', 3), plainText: 'First point here. Second point there.' };
  const s = buildReplySummary([r], { relationsOf: () => [] });
  assert.equal(s.sample[0].firstSentence, 'First point here.');
});
