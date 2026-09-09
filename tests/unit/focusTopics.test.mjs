import test from 'node:test';
import assert from 'node:assert/strict';
import { focusTopicCandidates, nextFocusTopic } from '../../src/utils/focusTopics.mjs';

const relations = [
  { topic: 'Zinc', focusCommentStart: 2, focusCommentEnd: 9 },
  { topic: 'Alpha', focusCommentStart: 2, focusCommentEnd: 9 },
  { topic: 'Zinc', focusCommentStart: 2, focusCommentEnd: 9 },
];

const relatedPosts = [
  { id: 'p1', relations: [{ topic: 'Zinc' }, { topic: 'Alpha' }] },
  { id: 'p2', relations: [{ topic: 'Zinc' }, { topic: 'Zinc' }] },
  { id: 'p3', relations: [{ topic: 'Alpha' }] },
  { id: 'p4', relations: [{ topic: 'Zinc' }] },
];

test('topic candidates dedupe topics and order by unique related-post count then name', () => {
  assert.deepEqual(focusTopicCandidates(relations, [0, 1, 2], relatedPosts), [
    { topicKey: 'Zinc', rangeIndex: 0, count: 3 },
    { topicKey: 'Alpha', rangeIndex: 1, count: 2 },
  ]);
});

test('repeat activation cycles topics and ends in the no-filter state', () => {
  const topics = focusTopicCandidates(relations, [0, 1, 2], relatedPosts);
  assert.equal(nextFocusTopic(topics, null, 'focus', [0, 1, 2]).topicKey, 'Zinc');
  assert.equal(nextFocusTopic(topics, {
    origin: 'focus', topicKey: 'Zinc', anchor: { postId: 'focus', rangeIndex: 0 },
  }, 'focus', [0, 1, 2]).topicKey, 'Alpha');
  assert.equal(nextFocusTopic(topics, {
    origin: 'focus', topicKey: 'Alpha', anchor: { postId: 'focus', rangeIndex: 1 },
  }, 'focus', [0, 1, 2]), null);
});

test('a selection from another hotspot starts a new cycle at its first topic', () => {
  const topics = focusTopicCandidates(relations, [0, 1], relatedPosts);
  const next = nextFocusTopic(topics, {
    origin: 'focus', topicKey: 'Alpha', anchor: { postId: 'other', rangeIndex: 1 },
  }, 'focus', [0, 1]);
  assert.equal(next.topicKey, 'Zinc');
});
