import test from 'node:test';
import assert from 'node:assert/strict';
import { filterReplies, clusterTopLevel, applyBaseOrder } from '../../src/utils/threadFilter.mjs';

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

// ── Branch propagation (audit F-15): a branch survives when ANY reply in it
// matches — the root stays visible as context for a matching descendant. ──────

test('branchRelationsOf keeps a branch whose descendant matches the category', () => {
  // root c has no contributions of its own, but its branch union carries one.
  const branchRels = (r) =>
    r.id === 'c' ? [{ category: 'framing', topic: 'X', focusStart: 10, focusEnd: 40 }] : r.rels;
  const out = filterReplies([a, b, c, d], relsOf, { filterCategories: new Set(['framing']) }, branchRels);
  assert.deepEqual(out.map((r) => r.id), ['a', 'b', 'c']);
});

test('branchRelationsOf drops a branch when neither root nor descendants match', () => {
  const branchRels = (r) => r.rels; // no descendants add anything
  const out = filterReplies([a, b, c, d], relsOf, { responseFilter: { start: 5, end: 15 } }, branchRels);
  assert.deepEqual(out.map((r) => r.id), ['a', 'b']);
});

test('omitting branchRelationsOf keeps own-relations-only matching (back-compat)', () => {
  const out = filterReplies([a, b, c, d], relsOf, { filterCategories: new Set(['framing']) });
  assert.deepEqual(out.map((r) => r.id), ['a', 'b']);
});

test('passage filter via branch union counts a nested reply toward the branch', () => {
  const branchRels = (r) =>
    r.id === 'd' ? [...r.rels, { category: 'agree', topic: 'W', focusStart: 12, focusEnd: 20 }] : r.rels;
  const out = filterReplies([a, b, c, d], relsOf, { responseFilter: { start: 5, end: 15 } }, branchRels);
  assert.deepEqual(out.map((r) => r.id), ['a', 'b', 'd']);
});

// ── applyBaseOrder (permanent reorder): dismissing a cluster keeps the last
// clustered order — the sort only wins again after an explicit re-sort (tab
// switch clears the base). New ids missing from the base append at the end in
// their sorted relative order; base ids that no longer exist drop out. ────────

test('applyBaseOrder returns sorted order when base is empty', () => {
  assert.deepEqual(applyBaseOrder(['a', 'b', 'c'], []), ['a', 'b', 'c']);
});

test('applyBaseOrder keeps the base order over the sorted order', () => {
  assert.deepEqual(applyBaseOrder(['a', 'b', 'c', 'd'], ['c', 'a', 'd', 'b']), ['c', 'a', 'd', 'b']);
});

test('applyBaseOrder drops base ids no longer present and appends new sorted ids', () => {
  // 'x' vanished from the data; 'n1'/'n2' are new — they follow in sorted order.
  assert.deepEqual(applyBaseOrder(['n2', 'a', 'n1', 'b'], ['b', 'x', 'a']), ['b', 'a', 'n2', 'n1']);
});
