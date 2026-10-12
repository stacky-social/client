import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalThreadPost, projectThreadRelations } from '../../src/utils/threadRelations.mjs';

const relation = (start, end, commentStart = start, commentEnd = end) => ({
  contentStart: start, contentEnd: end,
  contentCommentStart: commentStart, contentCommentEnd: commentEnd,
  focusStart: 13, focusEnd: 73, focusCommentStart: 13, focusCommentEnd: 40,
  category: 'proposals', topic: 'Grid Cybersecurity',
});

test('thread projections preserve authored replacements and focus metadata', () => {
  const source = 'Intro. Securing network access is the way to go.';
  const target = 'A longer intro. Securing the access is the way to go.';
  const projected = projectThreadRelations(source, target, [relation(7, source.length, 7, source.indexOf(" is"))])[0];
  assert.equal(target.slice(projected.contentStart, projected.contentEnd), 'Securing the access is the way to go.');
  assert.equal(target.slice(projected.contentCommentStart, projected.contentCommentEnd), 'Securing the access');
  assert.equal(projected.focusStart, 13);
  assert.equal(projected.focusEnd, 73);
  assert.equal(projected.topic, 'Grid Cybersecurity');
});

test('pure contextual insertions disappear rather than highlighting unrelated original text', () => {
  assert.deepEqual(projectThreadRelations('Added context. Original.', 'Original.', [relation(0, 14)]), []);
});

test('exact replaced phrase maps onto the authored replacement', () => {
  const projected = projectThreadRelations('Say network now.', 'Say the now.', [relation(4, 11)])[0];
  assert.equal('Say the now.'.slice(projected.contentStart, projected.contentEnd), 'the');
});

test('related-only original provenance is escaped for thread rendering without mutating the aside', () => {
  const post = { content: 'Modified body', rewrite: { originalContent: 'I said <5 & >2.' } };
  const canonical = canonicalThreadPost(post);
  assert.equal(canonical.plainText, 'I said <5 & >2.');
  assert.equal(canonical.content, '<p>I said &lt;5 &amp; &gt;2.</p>');
  assert.equal(post.content, 'Modified body');
});

const fixture = JSON.parse(readFileSync(new URL('../../src/app/FakeData/scale-demo.json', import.meta.url), 'utf8'));
test('Peter Ware descendant uses the original passage and aligned crux under Car54', () => {
  const entry = fixture.find((entry) => entry.focusPost.id === 'cw-Uqkr_kO7p7s38ggg');
  const scoped = entry.relatedPosts.find((post) => post.id === 'cw-vyPJW7taRHpwMt4h');
  const canonical = fixture.find((entry) => entry.focusPost.id === scoped.id).focusPost;
  assert.match(canonical.plainText, /^You may be a utility engineer/);
  const projected = projectThreadRelations(scoped.content, canonical.plainText, scoped.relations);
  assert.ok(projected.length > 0);
  for (const r of projected) {
    assert.equal(canonical.plainText.slice(r.contentStart, r.contentEnd), 'Securing the access is the way to go, not disconnecting from the network.');
    assert.equal(canonical.plainText.slice(r.contentCommentStart, r.contentCommentEnd), 'not disconnecting from the network');
  }
});

test('all imported scoped reply annotations project within canonical text', () => {
  const originals = new Map(fixture.map((entry) => [entry.focusPost.id, entry.focusPost.plainText]));
  for (const entry of fixture) {
    for (const reply of entry.replies ?? []) {
      const target = originals.get(reply.id) ?? reply.plainText;
      for (const r of projectThreadRelations(reply.plainText, target, reply.relations ?? [])) {
        assert.ok(r.contentStart >= 0 && r.contentEnd > r.contentStart && r.contentEnd <= target.length, reply.id);
        assert.ok(r.contentCommentStart >= r.contentStart && r.contentCommentEnd >= r.contentCommentStart && r.contentCommentEnd <= r.contentEnd, reply.id);
      }
    }
  }
});
