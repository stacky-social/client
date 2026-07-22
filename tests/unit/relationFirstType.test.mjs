import test from 'node:test';
import assert from 'node:assert/strict';
import { firstTypeRelations } from '../../src/utils/relationFirstType.mjs';

const rel = (category, spans = {}) => ({
  focusStart: 10, focusEnd: 40,
  contentStart: 0, contentEnd: 25,
  focusCommentStart: 12, focusCommentEnd: 20,
  contentCommentStart: 2, contentCommentEnd: 9,
  category, topic: 'Topic',
  ...spans,
});

test('keeps only the FIRST contribution type of a coincident-span pair', () => {
  const first = rel('evidence_public');
  const second = rel('agree');
  assert.deepEqual(firstTypeRelations([first, second]), [first]);
});

test('coincident triple collapses to the first, order preserved', () => {
  const rels = [rel('framing'), rel('values'), rel('disagree')];
  assert.deepEqual(firstTypeRelations(rels), [rels[0]]);
});

test('relations on DIFFERENT spans all survive', () => {
  const a = rel('framing');
  const b = rel('agree', { focusStart: 50, focusEnd: 80 });
  const c = rel('values', { contentStart: 30, contentEnd: 60 });
  assert.deepEqual(firstTypeRelations([a, b, c]), [a, b, c]);
});

test('mixed: dedupes within a coincident group without touching distinct spans', () => {
  const a = rel('framing');
  const aDup = rel('values'); // same span as a — second type, dropped
  const b = rel('agree', { focusStart: 50, focusEnd: 80 });
  const bDup = rel('questions', { focusStart: 50, focusEnd: 80 });
  assert.deepEqual(firstTypeRelations([a, aDup, b, bDup]), [a, b]);
});

test('empty / undefined / single-relation inputs pass through', () => {
  assert.deepEqual(firstTypeRelations([]), []);
  assert.deepEqual(firstTypeRelations(undefined), []);
  const only = [rel('framing')];
  assert.deepEqual(firstTypeRelations(only), only);
});
