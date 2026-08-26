import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Data contract for the REPLY side of the committed feed fixture
// (src/app/FakeData/listy-injection.json), emitted by scripts/convert-demo-data.mjs
// from the CrossWeave live-demo prepared corpus.
//
// The corpus annotates focused->descendant (nested reply) pairs, so real reply
// threads carry REAL relations with explicit topics and nest to depth 3. Each
// annotated reply's focus* offsets index the focus post and its content* offsets
// index the reply; a reply may carry >1 relation (one per contribution type)
// sharing one highlight span, exactly like a related post. These tests re-check the
// committed artifact so a bad / missing regen can't land silently. See [[demo-data-provenance]].

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '../../src/app/FakeData/listy-injection.json'), 'utf8'));

// Mirrors the fixture-consuming stripHtml in src/components/Posts/Post.tsx:
// strip tags, then decode the entities esc() emits. The offset-alignment
// invariant is defined against THIS transform (the FE walks HTML content and
// maps plain-text offsets), so the test must match it exactly.
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const validRange = (s, e, len) => Number.isInteger(s) && Number.isInteger(e) && s >= 0 && s < e && e <= len;

/** Depth of a reply within its entry: focus post = 0, top-level reply = 1, a
 *  reply-to-a-reply = 2, etc. Walks inReplyToId until it reaches the focus post. */
function replyDepth(reply, byId, focusId) {
  let depth = 0;
  let cur = reply;
  const seen = new Set();
  while (cur && cur.id !== focusId && !seen.has(cur.id)) {
    seen.add(cur.id);
    depth++;
    if (cur.inReplyToId === focusId) break;
    cur = byId.get(cur.inReplyToId);
  }
  return depth;
}

test('offset invariant: stripHtml(content) === plainText for every HTML post (focus/ancestors/replies)', () => {
  // Related posts are excluded on purpose: their `content` is the PLAIN offset
  // base (no separate plainText) and legitimately contains literal <a href> markup
  // from the real NYT scrape — the FE indexes their offsets into raw content, so
  // stripHtml would corrupt them. Their ranges are covered by replyRelations.test.mjs.
  for (const e of data) {
    const htmlPosts = [e.focusPost, ...(e.ancestors ?? []), ...(e.replies ?? [])];
    for (const p of htmlPosts) {
      if (typeof p.content !== 'string' || typeof p.plainText !== 'string') continue;
      assert.equal(
        stripHtml(p.content),
        p.plainText,
        `offset drift: stripHtml(content) !== plainText for post ${p.id}`,
      );
    }
  }
});

test('annotated replies carry explicit, in-range topics; content spans never partially overlap', () => {
  let repliesWithRelations = 0;
  let liveXpane = 0;
  let totalRelations = 0;
  for (const e of data) {
    const focusPlain = e.focusPost.plainText;
    // Topics that actually exist on this entry's related posts (cross-pane target).
    const relatedTopics = new Set(
      (e.relatedPosts ?? []).flatMap((rp) => (rp.relations ?? []).map((r) => r.topic)),
    );
    for (const reply of e.replies ?? []) {
      const rels = reply.relations ?? [];
      if (rels.length === 0) continue;
      repliesWithRelations++;
      const plain = reply.plainText ?? '';
      // A reply's relations share one highlight pair (one per contribution type), so
      // their content spans are IDENTICAL; distinct spans, if any, must not PARTIALLY
      // overlap (the renderer layers identical/nested spans, not partial overlaps) —
      // same tolerance the related pane already relies on.
      const spans = rels.map((r) => [r.contentStart, r.contentEnd]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (let i = 1; i < spans.length; i++) {
        const [ps, pe] = spans[i - 1];
        const [s, en] = spans[i];
        const identical = s === ps && en === pe;
        const disjoint = s >= pe;
        assert.ok(identical || disjoint, `reply ${reply.id}: content spans partially overlap [${ps},${pe}] vs [${s},${en}]`);
      }
      for (const [i, r] of rels.entries()) {
        const label = `reply ${reply.id}[${i}]`;
        totalRelations++;
        if (relatedTopics.has(r.topic)) liveXpane++;
        assert.ok(typeof r.topic === 'string' && r.topic.length > 0, `${label} missing explicit topic`);
        assert.ok(validRange(r.focusStart, r.focusEnd, focusPlain.length), `${label} focus span out of range`);
        assert.ok(validRange(r.contentStart, r.contentEnd, plain.length), `${label} content span out of range`);
        assert.ok(
          r.focusStart <= r.focusCommentStart && r.focusCommentStart < r.focusCommentEnd && r.focusCommentEnd <= r.focusEnd,
          `${label} focus comment not nested in focus span`,
        );
        assert.ok(
          r.contentStart <= r.contentCommentStart && r.contentCommentStart < r.contentCommentEnd && r.contentCommentEnd <= r.contentEnd,
          `${label} content comment not nested in content span`,
        );
      }
    }
  }
  assert.ok(repliesWithRelations >= 1, `expected >=1 reply carrying relations, got ${repliesWithRelations}`);
  // Cross-pane liveness: reply topics are REAL annotations, so some legitimately
  // do not land on the separately ranked candidate pane. Keep a strong aggregate
  // floor while allowing the multi-source corpus's current measured 85% overlap.
  assert.ok(totalRelations >= 1, 'expected >=1 reply relation');
  const livePct = Math.round((liveXpane / totalRelations) * 100);
  assert.ok(liveXpane / totalRelations >= 0.8, `expected >=80% of reply relations cross-pane live, got ${livePct}% (${liveXpane}/${totalRelations})`);
});

test('at least one nested reply thread reaches depth >= 2 (grandchildren exist)', () => {
  let deep = 0;
  for (const e of data) {
    const focusId = e.focusPost.id;
    const byId = new Map((e.replies ?? []).map((r) => [r.id, r]));
    // every reply parent must resolve within the entry (focus or another reply)
    for (const r of e.replies ?? []) {
      const validParent = r.inReplyToId === focusId || byId.has(r.inReplyToId);
      assert.ok(validParent, `reply ${r.id} inReplyToId ${r.inReplyToId} does not resolve within entry`);
      if (replyDepth(r, byId, focusId) >= 2) deep++;
    }
  }
  assert.ok(deep >= 1, `expected >=1 reply at depth >= 2, got ${deep}`);
});
