import test from 'node:test';
import assert from 'node:assert/strict';
import { trailingEllipsisCover } from '../../src/utils/ellipsisCover.mjs';

/** Lay words out in 10px glyphs with a 5px space between words. */
function line(...words) {
  const glyphs = [];
  let x = 0;
  words.forEach((word, w) => {
    if (w > 0) x += 5;
    for (let i = 0; i < word.length; i += 1) {
      glyphs.push({ char: word[i], left: x, right: x + 10, spaceBefore: w > 0 && i === 0 });
      x += 10;
    }
  });
  return glyphs;
}

const visibleText = (glyphs, cover) => glyphs.slice(0, cover.coverFrom).map((g) => g.char).join('');

test('an ellipsis that fits after the line covers nothing and starts at the last glyph', () => {
  const glyphs = line('happens');
  assert.deepEqual(trailingEllipsisCover(glyphs, 100, 20), { coverFrom: 7, left: 70 });
  assert.deepEqual(trailingEllipsisCover(glyphs, 90, 20), { coverFrom: 7, left: 70 });
});

test('no visible glyph ever reaches into the ellipsis box', () => {
  const glyphs = line('this', 'stuff', 'happens');
  for (let lineRight = 60; lineRight <= 200; lineRight += 0.5) {
    const cover = trailingEllipsisCover(glyphs, lineRight, 17.3);
    for (const glyph of glyphs.slice(0, cover.coverFrom)) assert.ok(glyph.right <= cover.left + 1e-9);
    assert.ok(cover.left + 17.3 <= lineRight + 0.01);
  }
});

test('a cut inside a word hides that whole word, never part of a letter', () => {
  // "this stuff happens" ends at 180. Needing 20px before 185 would cut
  // "s" [170,180] in half; the whole word "happens" goes instead.
  const glyphs = line('this', 'stuff', 'happens');
  const cover = trailingEllipsisCover(glyphs, 185, 20);
  assert.equal(visibleText(glyphs, cover), 'thisstuff');
  assert.equal(cover.left, 95);
});

test('a cut exactly at a word start covers only the words after it', () => {
  const glyphs = line('this', 'stuff', 'happens');
  // The limit (105) lands in the space before "happens" (starts at 110).
  const cover = trailingEllipsisCover(glyphs, 125, 20);
  assert.equal(visibleText(glyphs, cover), 'thisstuff');
});

test('a single word filling the line is cut by whole characters', () => {
  const glyphs = line('happens');
  assert.deepEqual(trailingEllipsisCover(glyphs, 85, 20), { coverFrom: 6, left: 60 });
  assert.deepEqual(trailingEllipsisCover(glyphs, 70, 100), { coverFrom: 0, left: 0 });
  assert.equal(trailingEllipsisCover([], 70, 10), null);
});
