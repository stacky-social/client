import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWinningRelation, contributionSegments } from '../../src/utils/contributionSelection.mjs';

test('highest probability wins across arbitrary contribution types without removing alternatives', () => {
  const relations = ['agree', 'evidence_public', 'framing', 'question'].map((category, i) => ({ category, probability: [0.3, 0.8, 0.6, 0.9][i] }));
  assert.equal(selectWinningRelation(relations), relations[3]);
  assert.equal(relations.length, 4);
  assert.equal(selectWinningRelation(relations, 'agree', new Set(['framing'])), relations[0]);
  assert.equal(selectWinningRelation(relations, null, new Set(['framing', 'evidence_public'])), relations[1]);
  assert.equal(selectWinningRelation(relations, 'absent', new Set(['absent'])), relations[3]);
});

test('missing and tied probabilities retain stable original identities', () => {
  const legacy = [{ category: 'agree' }, { category: 'framing' }];
  assert.equal(selectWinningRelation(legacy), legacy[0]);
  const tied = legacy.map((r) => ({ ...r, probability: 0.5 }));
  assert.equal(selectWinningRelation(tied), tied[0]);
  assert.equal(selectWinningRelation([...legacy, { category: 'question', probability: 0 }]).category, 'question');
  assert.equal(selectWinningRelation([]), null);
});

test('partial overlaps retain every text interval and source relation index', () => {
  const relations = [
    { category: 'agree', probability: 0.2, contentStart: 0, contentEnd: 6 },
    { category: 'framing', probability: 0.9, contentStart: 3, contentEnd: 9 },
    { category: 'question', probability: 0.4, contentStart: 3, contentEnd: 9 },
  ];
  const segments = contributionSegments(relations, 12);
  assert.deepEqual(segments.map(({ start, end }) => [start, end]), [[0, 3], [3, 6], [6, 9]]);
  assert.deepEqual(segments.map((s) => selectWinningRelation(s.contributors).index), [0, 1, 1]);
  assert.deepEqual(segments.map((s) => selectWinningRelation(s.contributors, 'question').index), [0, 2, 2]);
  assert.deepEqual(segments[1].contributors.map((r) => r.index), [0, 1, 2]);
});
