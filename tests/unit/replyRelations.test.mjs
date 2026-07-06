import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '../../src/app/FakeData/listy-injection.json'), 'utf8'));

const CATEGORIES = new Set([
  'agree', 'disagree', 'predictions', 'evidence_public', 'evidence_personal',
  'connections', 'questions', 'humor', 'values', 'framing', 'proposals', 'pointers', 'uncategorized',
]);

const BIG_ENTRY_ID = '112880124583497150';
const bigEntry = data.find((e) => e.focusPost.id === BIG_ENTRY_ID);

test('target entry exists and has replies', () => {
  assert.ok(bigEntry, 'big demo entry present');
  assert.ok((bigEntry.replies ?? []).length >= 10);
});

test('at least one reply carries relations (data generated)', () => {
  const withRels = (bigEntry.replies ?? []).filter((r) => (r.relations ?? []).length > 0);
  assert.ok(withRels.length >= 8, `expected >=8 replies with relations, got ${withRels.length}`);
});

test('every reply relation has valid offsets, topic, and category', () => {
  for (const entry of data) {
    const focusPlain = entry.focusPost.plainText;
    for (const reply of entry.replies ?? []) {
      const plain = reply.plainText ?? reply.content;
      for (const [i, r] of (reply.relations ?? []).entries()) {
        const label = `${reply.id}[${i}]`;
        assert.ok(CATEGORIES.has(r.category), `${label} category ${r.category}`);
        assert.ok(typeof r.topic === 'string' && r.topic.length > 0, `${label} topic`);
        const focusSlice = focusPlain.slice(r.focusStart, r.focusEnd);
        assert.ok(focusSlice.length > 0, `${label} focus span non-empty`);
        assert.equal(focusPlain.indexOf(focusSlice), r.focusStart, `${label} focus offsets exact`);
        const contentSlice = plain.slice(r.contentStart, r.contentEnd);
        assert.ok(contentSlice.length > 0, `${label} content span non-empty`);
        assert.equal(plain.indexOf(contentSlice), r.contentStart, `${label} content offsets exact`);
        // Comment sub-ranges: zero-length (no bold) or nested inside their span.
        if (r.focusCommentEnd > r.focusCommentStart) {
          assert.ok(r.focusCommentStart >= r.focusStart && r.focusCommentEnd <= r.focusEnd, `${label} focusComment nested`);
        }
        if (r.contentCommentEnd > r.contentCommentStart) {
          assert.ok(r.contentCommentStart >= r.contentStart && r.contentCommentEnd <= r.contentEnd, `${label} contentComment nested`);
        }
      }
      // Content spans must not overlap within one reply (reply renderer assumes it).
      const spans = (reply.relations ?? [])
        .map((r) => [r.contentStart, r.contentEnd])
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) {
        assert.ok(spans[i][0] >= spans[i - 1][1], `${reply.id} content spans overlap`);
      }
    }
  }
});

test('some replies deliberately carry no relations ("me too" cases)', () => {
  const bare = (bigEntry.replies ?? []).filter((r) => (r.relations ?? []).length === 0);
  assert.ok(bare.length >= 3, `expected >=3 relation-free replies, got ${bare.length}`);
});

test('dual-role posts: >=2 related posts are also thread replies of the focus', () => {
  const dual = bigEntry.relatedPosts.filter((rp) => rp.inReplyToId === BIG_ENTRY_ID);
  assert.ok(dual.length >= 2, `expected >=2 dual-role related posts, got ${dual.length}`);
});

test('"Build quality" is a replies-only topic shared by >=2 replies', () => {
  const replyTopics = (bigEntry.replies ?? []).flatMap((r) => (r.relations ?? []).map((x) => x.topic));
  const relatedTopics = bigEntry.relatedPosts.flatMap((rp) => (rp.relations ?? []).map((x) => x.topic));
  assert.ok(replyTopics.filter((t) => t === 'Build quality').length >= 2);
  assert.ok(!relatedTopics.includes('Build quality'));
});

test('reply topics intersect related-post topics (cross-pane demos)', () => {
  const replyTopics = new Set((bigEntry.replies ?? []).flatMap((r) => (r.relations ?? []).map((x) => x.topic)));
  const relatedTopics = new Set(bigEntry.relatedPosts.flatMap((rp) => (rp.relations ?? []).map((x) => x.topic)));
  const shared = [...replyTopics].filter((t) => relatedTopics.has(t));
  assert.ok(shared.length >= 3, `expected >=3 shared topics, got ${shared.length}: ${[...replyTopics]}`);
});

test('small entry has 1-5 replies for the tabs-suppressed state', () => {
  const small = data.find((e) => e.focusPost.id === '112880110824825811');
  assert.ok(small, 'small entry present');
  const n = (small.replies ?? []).length;
  assert.ok(n >= 1 && n <= 5, `expected 1-5 replies, got ${n}`);
});

test('ranked replies exist for the Top tab', () => {
  const ranked = (bigEntry.replies ?? []).filter((r) => typeof r.rank === 'number');
  assert.ok(ranked.length >= 8, `expected >=8 ranked replies, got ${ranked.length}`);
  const ranks = ranked.map((r) => r.rank);
  assert.equal(new Set(ranks).size, ranks.length, 'ranks are unique');
});
