import test from 'node:test';
import assert from 'node:assert/strict';
import {
  topicKeyOf,
  relationsMatchTopic,
  asideGrouping,
  asideTopicFilter,
  replyGrouping,
  replyTopicFilter,
  reduceInteraction,
  validateTopicInteraction,
} from '../../src/utils/highlightStoreCore.mjs';

// Pure logic behind the atomic panel-interaction primitive (highlightStore.ts
// wraps these with module state + notify). The store's replace-not-stack
// invariant, origin-split selectors, topic-key normalization, and
// validate-on-restore all live here so they are unit-testable without React.

const anchor = { postId: 'p1', rangeIndex: 2 };
const anchorB = { postId: 'p2', rangeIndex: 0 };

// A fully-populated three-dimension slice, to prove each action clears the rest.
const seeded = () => ({
  topicInteraction: { origin: 'aside', topicKey: 'Old', anchor },
  filterCategories: new Set(['evidence', 'framing']),
  responseFilter: { start: 1, end: 9, text: 'x' },
});

// ─── topicKeyOf ──────────────────────────────────────────────────────────────

test('topicKeyOf returns the explicit topic for a topicful relation', () => {
  assert.equal(topicKeyOf({ category: 'evidence', topic: 'Trial results' }), 'Trial results');
});

test('topicKeyOf returns null for a topicless relation (no category/similarity fallback)', () => {
  assert.equal(topicKeyOf({ category: 'evidence' }), null);
  assert.equal(topicKeyOf({ category: 'evidence', topic: '' }), null);
  assert.equal(topicKeyOf(null), null);
  assert.equal(topicKeyOf(undefined), null);
});

// ─── relationsMatchTopic (aside filter-by-topic branch predicate) ────────────

test('relationsMatchTopic is true when any relation carries the explicit topic', () => {
  const rels = [
    { category: 'evidence', topic: 'Trial results' },
    { category: 'framing', topic: 'Contract reform' },
  ];
  assert.equal(relationsMatchTopic(rels, 'Contract reform'), true);
});

test('relationsMatchTopic is false when no relation carries the topic', () => {
  const rels = [{ category: 'evidence', topic: 'Trial results' }];
  assert.equal(relationsMatchTopic(rels, 'Contract reform'), false);
});

test('relationsMatchTopic keys off explicit topic only — no category fallback', () => {
  // A topicless relation must not match the topic even if its category label
  // would collide — grouping and filtering key IDENTICALLY (via topicKeyOf).
  const rels = [{ category: 'Contract reform' }];
  assert.equal(relationsMatchTopic(rels, 'Contract reform'), false);
});

test('relationsMatchTopic is false for a null/empty topic key or missing relations', () => {
  assert.equal(relationsMatchTopic([{ category: 'evidence', topic: 'T' }], null), false);
  assert.equal(relationsMatchTopic([{ category: 'evidence', topic: 'T' }], ''), false);
  assert.equal(relationsMatchTopic(undefined, 'T'), false);
  assert.equal(relationsMatchTopic([], 'T'), false);
});

// ─── Derived selectors (split by origin) ─────────────────────────────────────

test('aside-origin interaction groups the aside and filters the replies', () => {
  const ti = { origin: 'aside', topicKey: 'T', anchor };
  assert.equal(asideGrouping(ti), ti);
  assert.equal(replyTopicFilter(ti), ti);
  assert.equal(asideTopicFilter(ti), null);
  assert.equal(replyGrouping(ti), null);
});

test('replies-origin interaction clusters the replies and filters the aside', () => {
  const ti = { origin: 'replies', topicKey: 'T', anchor };
  assert.equal(replyGrouping(ti), ti);
  assert.equal(asideTopicFilter(ti), ti);
  assert.equal(replyTopicFilter(ti), null);
  assert.equal(asideGrouping(ti), null);
});

test('every selector is null when no interaction is active', () => {
  for (const sel of [asideGrouping, asideTopicFilter, replyGrouping, replyTopicFilter]) {
    assert.equal(sel(null), null);
  }
});

// ─── reduceInteraction: replace-not-stack ────────────────────────────────────

test('activating an aside topic sets it and clears category + passage', () => {
  const next = reduceInteraction(seeded(), { type: 'asideTopic', topicKey: 'T', anchor });
  assert.deepEqual(next.topicInteraction, { origin: 'aside', topicKey: 'T', anchor });
  assert.equal(next.filterCategories.size, 0);
  assert.equal(next.responseFilter, null);
});

test('activating a reply topic sets it and clears category + passage', () => {
  const next = reduceInteraction(seeded(), { type: 'replyTopic', topicKey: 'T', anchor: anchorB });
  assert.deepEqual(next.topicInteraction, { origin: 'replies', topicKey: 'T', anchor: anchorB });
  assert.equal(next.filterCategories.size, 0);
  assert.equal(next.responseFilter, null);
});

test('setting a category filter clears any topic + passage', () => {
  const next = reduceInteraction(seeded(), { type: 'category', cats: ['evidence'] });
  assert.equal(next.topicInteraction, null);
  assert.deepEqual([...next.filterCategories], ['evidence']);
  assert.equal(next.responseFilter, null);
});

test('setting a passage filter clears any topic + category', () => {
  const span = { start: 3, end: 8, text: 'y' };
  const next = reduceInteraction(seeded(), { type: 'passage', span });
  assert.equal(next.topicInteraction, null);
  assert.equal(next.filterCategories.size, 0);
  assert.equal(next.responseFilter, span);
});

test('clearTopic clears only the topic, leaving filters untouched', () => {
  const next = reduceInteraction(seeded(), { type: 'clearTopic' });
  assert.equal(next.topicInteraction, null);
  assert.deepEqual([...next.filterCategories], ['evidence', 'framing']);
  assert.deepEqual(next.responseFilter, { start: 1, end: 9, text: 'x' });
});

test('clearAll clears every dimension', () => {
  const next = reduceInteraction(seeded(), { type: 'clearAll' });
  assert.equal(next.topicInteraction, null);
  assert.equal(next.filterCategories.size, 0);
  assert.equal(next.responseFilter, null);
});

test('reduceInteraction never mutates the input slice', () => {
  const dims = seeded();
  reduceInteraction(dims, { type: 'clearAll' });
  assert.equal(dims.topicInteraction.topicKey, 'Old');
  assert.equal(dims.filterCategories.size, 2);
  assert.notEqual(dims.responseFilter, null);
});

test('exactly one dimension is ever active after any activating action', () => {
  const active = (d) => [d.topicInteraction, d.filterCategories.size > 0 ? d.filterCategories : null, d.responseFilter].filter(Boolean).length;
  assert.equal(active(reduceInteraction(seeded(), { type: 'asideTopic', topicKey: 'T', anchor })), 1);
  assert.equal(active(reduceInteraction(seeded(), { type: 'replyTopic', topicKey: 'T', anchor })), 1);
  assert.equal(active(reduceInteraction(seeded(), { type: 'category', cats: ['evidence'] })), 1);
  assert.equal(active(reduceInteraction(seeded(), { type: 'passage', span: { start: 0, end: 1, text: 'z' } })), 1);
});

// ─── validateTopicInteraction (setPanelFocus restore) ────────────────────────

test('validate keeps an interaction whose anchor still resolves to the same key', () => {
  const ti = { origin: 'aside', topicKey: 'T', anchor };
  const resolve = (a) => (a.postId === 'p1' && a.rangeIndex === 2 ? 'T' : null);
  assert.equal(validateTopicInteraction(ti, resolve), ti);
});

test('validate drops the WHOLE interaction when the anchor span is gone', () => {
  const ti = { origin: 'aside', topicKey: 'T', anchor };
  assert.equal(validateTopicInteraction(ti, () => null), null);
});

test('validate drops the interaction when the anchor now carries a different topic', () => {
  const ti = { origin: 'aside', topicKey: 'T', anchor };
  assert.equal(validateTopicInteraction(ti, () => 'Different'), null);
});

test('validate returns null for a null interaction', () => {
  assert.equal(validateTopicInteraction(null, () => 'T'), null);
});
