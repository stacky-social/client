import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIP_SAFE_CHARS,
  WINDOW_CHARS,
  readingWindowBounds,
} from '../../src/utils/relatedWindow.mjs';

// A long card: 120 five-letter words ("w000 " …) = 600 characters, so every
// window edge that is not a word boundary is visibly mid-word.
const words = Array.from({ length: 120 }, (_, i) => `w${String(i).padStart(3, '0')}`);
const text = words.join(' ');
const wordAt = (i) => ({ start: i * 5, end: i * 5 + 4 });
const relation = (fromWord, toWord) => ({
  contentStart: wordAt(fromWord).start,
  contentEnd: wordAt(toWord).end,
  contentCommentStart: 0,
  contentCommentEnd: 0,
});

const isWordBoundaryStart = (s) => s === 0 || text[s - 1] === ' ';
const isWordBoundaryEnd = (e) => e === text.length || text[e] === ' ';

test('short text is never windowed', () => {
  assert.deepEqual(readingWindowBounds('short text', [relation(0, 1)], null), { start: 0, end: 10 });
});

test('the default window centres on the first relation and snaps to whole words', () => {
  const rels = [relation(50, 51)];
  const { start, end } = readingWindowBounds(text, rels, null);
  assert.ok(isWordBoundaryStart(start), `start ${start} is mid-word`);
  assert.ok(isWordBoundaryEnd(end), `end ${end} is mid-word`);
  assert.ok(start <= rels[0].contentStart && end >= rels[0].contentEnd);
  assert.ok(end - start <= WINDOW_CHARS * 2);
});

test('a preferred relation outside the default window re-centres the window on it', () => {
  const rels = [relation(10, 11), relation(90, 91)];
  const { start, end } = readingWindowBounds(text, rels, 1);
  assert.ok(start <= rels[1].contentStart && end >= rels[1].contentEnd);
  assert.ok(start > rels[0].contentEnd, 'the first relation is no longer the centre');
  assert.ok(isWordBoundaryStart(start) && isWordBoundaryEnd(end));
});

test('a preferred relation the default already shows keeps the default window', () => {
  const rels = [relation(40, 41), relation(44, 45)];
  assert.deepEqual(readingWindowBounds(text, rels, 1), readingWindowBounds(text, rels, null));
});

test('a matching relation beyond the clip-safe prefix re-centres (collapsed cards clip)', () => {
  // Words 64-66 sit ~110-130 characters after the default centre (word 42): inside
  // the 280-char window but past its clip-safe first CLIP_SAFE_CHARS.
  const rels = [relation(42, 42), relation(64, 66)];
  const def = readingWindowBounds(text, rels, null);
  assert.ok(rels[1].contentEnd <= def.end, 'default window technically contains it');
  assert.ok(rels[1].contentEnd > def.start + CLIP_SAFE_CHARS);
  const preferred = readingWindowBounds(text, rels, 1);
  assert.notDeepEqual(preferred, def);
  assert.ok(preferred.start <= rels[1].contentStart && preferred.end >= rels[1].contentEnd);
});

test('the clicked (anchor) span keeps the default window whenever any of it is shown', () => {
  const rels = [relation(42, 42), relation(64, 66)];
  assert.deepEqual(
    readingWindowBounds(text, rels, 1, true),
    readingWindowBounds(text, rels, null),
  );
});

test('snapping never trims into the shown relation', () => {
  // A relation longer than the window: its own range decides the edges.
  const rels = [relation(20, 90)];
  const { start, end } = readingWindowBounds(text, rels, 0);
  assert.ok(start >= rels[0].contentStart - 5);
  assert.ok(isWordBoundaryStart(start) && isWordBoundaryEnd(end));
});
