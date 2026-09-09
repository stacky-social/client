import assert from 'node:assert/strict';
import test from 'node:test';

import { linkifyHtmlUrls, preserveInlineLinkOffsets, splitInlineLinks } from '../../src/utils/inlineLinks.mjs';

test('keeps multiple URLs visible and independently clickable', () => {
  const tokens = splitInlineLinks('Compare https://example.com/a and https://example.org/b.');
  const links = tokens.filter((token) => token.type === 'link');

  assert.deepEqual(links.map(({ href, label }) => ({ href, label })), [
    { href: 'https://example.com/a', label: 'https://example.com/a' },
    { href: 'https://example.org/b', label: 'https://example.org/b' },
  ]);
  assert.equal(tokens.at(-1).value, '.');
});

test('renders a Markdown destination as its URL without naming its content type', () => {
  const tokens = splitInlineLinks('[Read article](https://example.com/watch?v=1)');
  const link = tokens.find((token) => token.type === 'link');

  assert.equal(link.label, 'https://example.com/watch?v=1');
  assert.equal(link.href, 'https://example.com/watch?v=1');
});

test('linkifies bare URLs in HTML text while leaving existing anchors alone', () => {
  const html = linkifyHtmlUrls(
    '<p>One https://example.com/a and <a href="https://example.org/b">https://example.org/b</a>.</p>',
  );

  assert.equal((html.match(/data-inline-content-link/g) ?? []).length, 1);
  assert.equal((html.match(/<a\b/g) ?? []).length, 2);
});

test('turns escaped anchor markup into one clean visible URL', () => {
  const tokens = splitInlineLinks(
    '&lt;a href=&quot;https://example.com/data&quot; target=&quot;_blank&quot;&gt;https://example.com/data&lt;/a&gt;/',
  );
  const links = tokens.filter((token) => token.type === 'link');

  assert.equal(links.length, 1);
  assert.equal(links[0].label, 'https://example.com/data');
  assert.equal(tokens.at(-1).value, '/');
});

test('keeps annotation offsets stable while collapsing link markup', () => {
  const input = 'Before <a href="https://example.com/data">source</a> after';
  const result = preserveInlineLinkOffsets(input);

  assert.equal(result.length, input.length);
  assert.equal(result.indexOf('after'), input.indexOf('after'));
  assert.equal(result.trimStart().startsWith('Before https://example.com/data'), true);
});
