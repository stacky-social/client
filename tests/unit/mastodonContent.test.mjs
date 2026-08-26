import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractMastodonLinks,
  maskDuplicateArticleReferences,
  mastodonLinkHost,
  normalizeMastodonText,
  resolveMastodonRevision,
} from '../../src/utils/mastodonContent.mjs';

test('masks a duplicated Markdown article URL without shifting annotation offsets', () => {
  const article = 'https://en.wikipedia.org/wiki/Jevons_paradox';
  const input = `The Jevons Paradox\n\n[https://en.wikipedia.org/wiki/Jevons\\_paradox](https://en.wikipedia.org/wiki/Jevons\\_paradox)\n\nEssentially all jobs return. See https://example.com/context.`;
  const masked = maskDuplicateArticleReferences(input, article);

  assert.equal(masked.length, input.length);
  assert.equal(masked.indexOf('Essentially'), input.indexOf('Essentially'));
  assert.equal(masked.includes('en.wikipedia.org'), false);
  assert.equal(masked.includes('https://example.com/context'), true);
});

test('normalizes Mastodon split-link HTML and removes imported publication metadata', () => {
  const html = `<p><strong>Florida teens' dangerous social media challenge</strong> Authorities warned parents
    <a href="https://www.foxnews.com/us/florida-teens" target="_blank">
      <span class="invisible">https://www.</span>
      <span class="ellipsis">foxnews.com/us </span>
      <span class="invisible">/florida-teens</span>
    </a>
    Published: 2025-07-23T07:07:17Z</p>`;

  assert.equal(
    normalizeMastodonText(html),
    "Florida teens' dangerous social media challenge Authorities warned parents",
  );
  assert.deepEqual(extractMastodonLinks(html), ['https://www.foxnews.com/us/florida-teens']);
});

test('resolves backend track-change brackets to clean edited prose', () => {
  const rewrite = 'After floods, new laws protect kids⌈.⌉ ⌊[Link to article:⌋ ⌈https://www.cnn.com/story]⌉';
  assert.equal(resolveMastodonRevision(rewrite), 'After floods, new laws protect kids.  https://www.cnn.com/story]');
  assert.equal(normalizeMastodonText(rewrite), 'After floods, new laws protect kids.');
  assert.deepEqual(extractMastodonLinks(rewrite), ['https://www.cnn.com/story']);
});

test('unwraps legacy square-bracket delimiters inside inserted punctuation and words', () => {
  const rewrite = "Their lives are online⌈[,]⌉ and one had ⌊[a a]⌋⌈[an A]⌉pple ⌊[air tag]⌋⌈[AirTag]⌉ before going to ⌊[a]⌋⌈[an]⌉ ATM.";
  const edited = 'Their lives are online, and one had an Apple AirTag before going to an ATM.';

  assert.equal(resolveMastodonRevision(rewrite), edited);
  assert.equal(normalizeMastodonText(rewrite), edited);
});

test('preserves ordinary square brackets outside track-change insertions', () => {
  assert.equal(
    resolveMastodonRevision('Keep [editor note], add ⌈[clear context]⌉.'),
    'Keep [editor note], add clear context.',
  );
});

test('keeps human link labels while exposing the destination separately', () => {
  const html = '<p>See <a href="https://example.com/report">the full report</a> for details.</p>';
  assert.equal(normalizeMastodonText(html), 'See the full report for details.');
  assert.equal(mastodonLinkHost(extractMastodonLinks(html)[0]), 'example.com');
});
