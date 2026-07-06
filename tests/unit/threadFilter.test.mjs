import test from 'node:test';
import assert from 'node:assert/strict';
import { filterReplies, clusterTopLevel } from '../../src/utils/threadFilter.mjs';

const R = (id, rels) => ({ id, rels });
const relsOf = (r) => r.rels;

const a = R('a', [{ category: 'framing', topic: 'X', focusStart: 10, focusEnd: 40 }]);
const b = R('b', [
  { category: 'framing', topic: 'Y', focusStart: 100, focusEnd: 140 },
  { category: 'questions', topic: 'X', focusStart: 10, focusEnd: 30 },
]);
const c = R('c', []); // no contributions
const d = R('d', [{ category: 'values', topic: 'Z', focusStart: 200, focusEnd: 240 }]);

test('no active filters returns all replies', () => {
  assert.deepEqual(filterReplies([a, b, c, d], relsOf, {}).map((r) => r.id), ['a', 'b', 'c', 'd']);
});

test('category filter uses AND semantics across selected categories', () => {
  assert.deepEqual(filterReplies([a, b, c, d], relsOf, { filterCategories: new Set(['framing']) }).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(filterReplies([a, b, c, d], relsOf, { filterCategories: new Set(['framing', 'questions']) }).map((r) => r.id), ['b']);
});

test('passage filter keeps replies whose relations overlap the span', () => {
  assert.deepEqual(filterReplies([a, b, c, d], relsOf, { responseFilter: { start: 5, end: 15 } }).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(filterReplies([a, b, c, d], relsOf, { responseFilter: { start: 500, end: 600 } }).map((r) => r.id), []);
});

test('topic filter matches relation topics', () => {
  assert.deepEqual(filterReplies([a, b, c, d], relsOf, { topicFilter: 'X' }).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(filterReplies([a, b, c, d], relsOf, { topicFilter: 'Z' }).map((r) => r.id), ['d']);
});

test('filters compose as intersections', () => {
  const out = filterReplies([a, b, c, d], relsOf, {
    filterCategories: new Set(['questions']),
    topicFilter: 'X',
    responseFilter: { start: 5, end: 15 },
  });
  assert.deepEqual(out.map((r) => r.id), ['b']);
});

test('clusterTopLevel pulls topic matches adjacent to the anchor, anchor stays put', () => {
  const relsById = {
    r1: [{ topic: 'T' }], r2: [{ topic: 'U' }], r3: [{ topic: 'T' }],
    r4: [{ topic: 'T' }], r5: [],
  };
  const { order, memberIds } = clusterTopLevel(['r1', 'r2', 'r3', 'r4', 'r5'], (id) => relsById[id] ?? [], 'r3', 'T');
  // r1 (above match) moves down to just above r3; r4 (below match) is already adjacent below.
  assert.deepEqual(order, ['r2', 'r1', 'r3', 'r4', 'r5']);
  assert.deepEqual([...memberIds].sort(), ['r1', 'r3', 'r4']);
});

test('clusterTopLevel with no matches leaves order intact', () => {
  const { order, memberIds } = clusterTopLevel(['x', 'y'], () => [], 'x', 'nope');
  assert.deepEqual(order, ['x', 'y']);
  assert.deepEqual([...memberIds], ['x']);
});

test('clusterTopLevel tolerates an anchor missing from the list', () => {
  const { order } = clusterTopLevel(['x', 'y'], () => [], 'ghost', 'T');
  assert.deepEqual(order, ['x', 'y']);
});
