import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFocusCommentSegments,
  buildFocusCompositeSegments,
  buildFocusSegments,
  renderFocusCommentHtml,
  renderFocusCompositeHtml,
  renderMultiHighlightHtml,
} from '../../src/utils/focusHighlightHtml.mjs';

// Max <mark> nesting depth in an HTML string. Flat rendering must never exceed 1.
function maxMarkDepth(html) {
  let depth = 0, max = 0;
  const re = /<mark\b|<\/mark>/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '</mark>') depth--;
    else { depth++; if (depth > max) max = depth; }
  }
  return max;
}

// Reconstruct, per plain-text offset, the data-fs/data-fe of the mark covering it
// (or null). Mirrors the walker so we can assert coverage without a DOM.
function coverage(html) {
  const cov = [];
  let i = 0, open = null;
  while (i < html.length) {
    if (html[i] === '<') {
      const gt = html.indexOf('>', i);
      const tag = html.slice(i, gt + 1);
      if (tag.startsWith('<mark')) {
        open = { fs: +/data-fs="(\d+)"/.exec(tag)[1], fe: +/data-fe="(\d+)"/.exec(tag)[1], ids: /data-range-ids="([^"]*)"/.exec(tag)[1] };
      } else if (tag.startsWith('</mark')) {
        open = null;
      }
      i = gt + 1;
      continue;
    }
    let adv = 1;
    if (html[i] === '&') { const e = /^(?:&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;)/.exec(html.slice(i, i + 8)); if (e) adv = e[0].length; }
    cov.push(open);
    i += adv;
  }
  return cov;
}

const A = { focusStart: 0, focusEnd: 20, category: 'framing' };
// Partial overlap with A (starts inside A, ends after) — the shape that forced the
// old nested renderer to re-balance mid-word.
const B = { focusStart: 10, focusEnd: 35, category: 'agree' };
const PLAIN = 'x'.repeat(40);
const HTML = `<p>${PLAIN}</p>`;

test('buildFocusSegments splits partial overlaps into flat, tagged segments', () => {
  const segs = buildFocusSegments([A, B], PLAIN.length);
  // boundaries at 0,10,20,35 → segments [0,10)=A, [10,20)=A+B, [20,35)=B
  assert.deepEqual(segs.map((s) => [s.start, s.end, s.rangeIds]), [
    [0, 10, [0]],
    [10, 20, [0, 1]],
    [20, 35, [1]],
  ]);
});

test('renderMultiHighlightHtml never nests marks (flat), even for partial overlaps', () => {
  const html = renderMultiHighlightHtml(HTML, PLAIN, [A, B]);
  assert.equal(maxMarkDepth(html), 1, `expected flat marks, got depth ${maxMarkDepth(html)}: ${html}`);
});

test('every covered offset sits inside exactly one mark with correct bounds', () => {
  const html = renderMultiHighlightHtml(HTML, PLAIN, [A, B]);
  const cov = coverage(html);
  for (let o = 0; o < 35; o++) assert.ok(cov[o], `offset ${o} should be covered`);
  for (let o = 35; o < 40; o++) assert.equal(cov[o], null, `offset ${o} should be plain`);
  // The overlap region carries both relation ids.
  assert.equal(cov[15].ids, '0 1');
  assert.equal(cov[5].ids, '0');
  assert.equal(cov[30].ids, '1');
});

test('marks never cross a tag boundary (paragraph break splits a highlight in two)', () => {
  // One relation spanning the paragraph break "ab|cd" → two adjacent marks.
  const rel = [{ focusStart: 0, focusEnd: 4, category: 'framing' }];
  const html = renderMultiHighlightHtml('<p>ab</p><p>cd</p>', 'abcd', rel);
  assert.equal(maxMarkDepth(html), 1);
  assert.equal((html.match(/<mark\b/g) || []).length, 2, `expected 2 marks across the tag: ${html}`);
  assert.ok(coverage(html).slice(0, 4).every(Boolean), 'all four chars covered');
});

test('decoded entities count as one plain char (offset stays aligned)', () => {
  // plain "a&b" (3 chars); highlight just the "&" at offset 1.
  const rel = [{ focusStart: 1, focusEnd: 2, category: 'framing' }];
  const html = renderMultiHighlightHtml('a&amp;b', 'a&b', rel);
  assert.equal(maxMarkDepth(html), 1);
  assert.match(html, /<mark[^>]*>&amp;<\/mark>/, `the entity alone should be marked: ${html}`);
});

test('zero-width inline insertion sits at the plain offset without changing mark coverage', () => {
  const rel = [{ focusStart: 0, focusEnd: 4, category: 'framing' }];
  const insertion = '<span class="focus-window-prefix">…</span>';
  const html = renderMultiHighlightHtml('<p>abcd</p>', 'abcd', rel, undefined, {
    plainOffset: 2,
    html: insertion,
  });
  assert.ok(html.includes(`</mark>${insertion}<mark`), html);
  const withoutInsertion = html.replace(insertion, '');
  assert.deepEqual(coverage(withoutInsertion), coverage(renderMultiHighlightHtml('<p>abcd</p>', 'abcd', rel)));
});

test('inline insertion can keep the following source word in one nonbreaking group', () => {
  const html = renderMultiHighlightHtml('<p>abcd</p>', 'abcd', [], undefined, {
    plainOffset: 1,
    html: '<span class="prefix-group"><span>… </span>',
    closeOffset: 3,
    closeHtml: '</span>',
  });
  assert.equal(html, '<p>a<span class="prefix-group"><span>… </span>bc</span>d</p>');
});

test('uncategorized relations are dropped', () => {
  const segs = buildFocusSegments(
    [{ focusStart: 0, focusEnd: 10, category: 'uncategorized' }],
    20,
    (c) => c !== 'uncategorized',
  );
  assert.equal(segs.length, 0);
});

test('semantic renderer uses focus-comment offsets and unions overlapping cruxes', () => {
  const plain = '0123456789abcdef';
  const relations = [
    { ...A, focusCommentStart: 2, focusCommentEnd: 8, topic: 'Alpha' },
    { ...B, focusCommentStart: 5, focusCommentEnd: 11, topic: 'Beta' },
  ];
  assert.deepEqual(
    buildFocusCommentSegments(relations, plain.length).map((segment) => [
      segment.start,
      segment.end,
      segment.rangeIds,
    ]),
    [
      [2, 5, [0]],
      [5, 8, [0, 1]],
      [8, 11, [1]],
    ],
  );
  const html = renderFocusCommentHtml(`<p>${plain}</p>`, plain, relations);
  assert.equal(maxMarkDepth(html), 1);
  assert.equal(coverage(html)[1], null);
  assert.equal(coverage(html)[6].ids, '0 1');
  assert.equal(coverage(html)[12], null);
});

test('composite renderer keeps broad passages around flat semantic marks', () => {
  const relation = {
    ...A,
    focusStart: 0,
    focusEnd: 12,
    focusCommentStart: 3,
    focusCommentEnd: 6,
  };
  assert.deepEqual(
    buildFocusCompositeSegments([relation], 16).map((segment) => [
      segment.start,
      segment.end,
      segment.rangeIds,
      segment.passageRangeIds,
    ]),
    [
      [0, 3, [], [0]],
      [3, 6, [0], [0]],
      [6, 12, [], [0]],
    ],
  );
  const html = renderFocusCompositeHtml('0123456789abcdef', '0123456789abcdef', [relation]);
  assert.equal(maxMarkDepth(html), 1);
  assert.match(html, /<span[^>]*data-focus-passage-ids="0"[^>]*>012<\/span>/);
  assert.match(html, /<mark[^>]*data-range-ids="0"[^>]*data-focus-passage-ids="0"[^>]*>345<\/mark>/);
});
