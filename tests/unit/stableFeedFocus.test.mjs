import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFeedFocusPin,
  feedFocusGap,
  feedFocusHysteresisPx,
  feedFocusReadingLine,
  selectPinnedFeedFocus,
} from '../../src/utils/stableFeedFocusCore.mjs';

// Viewport: 1200px tall, 60px sticky nav. Usable height 1140, so the top-line
// reading line sits at 60 + 1140 * 0.3 = 402 and the band is 8% of 1140 = 91.2.
const VIEW = { viewportTop: 60, viewportHeight: 1200, mode: 'top-line', anchorRatio: 0.3 };
const LINE = 402;
const BAND = feedFocusHysteresisPx(1140);

/** A stack of 300px cards separated by 16px gaps, first card top at `firstTop`. */
function feed(firstTop, count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const top = firstTop + index * 316;
    return { id: `p${index}`, value: index, rect: { top, bottom: top + 300, height: 300 } };
  });
}

/** Same feed scrolled by `dy` (positive = content moved up). */
const scrolled = (candidates, dy) => candidates.map((candidate) => ({
  ...candidate,
  rect: { ...candidate.rect, top: candidate.rect.top - dy, bottom: candidate.rect.bottom - dy },
}));

function step(candidates, currentId, pin, extra = {}) {
  return selectPinnedFeedFocus({ ...VIEW, candidates, currentId, pin, ...extra });
}

test('reading line and gap follow the approved geometry', () => {
  assert.equal(feedFocusReadingLine(VIEW), LINE);
  assert.equal(feedFocusReadingLine({ ...VIEW, mode: 'center' }), 60 + 570);
  assert.equal(feedFocusGap({ top: 200, bottom: 450, height: 250 }, LINE), 0, 'spanning');
  assert.equal(feedFocusGap({ top: 500, bottom: 800, height: 300 }, LINE), 98, 'below');
  assert.equal(feedFocusGap({ top: 0, bottom: 250, height: 250 }, LINE), 152, 'above');
});

test('an explicit pin records the clicked post and its gap', () => {
  const posts = feed(100);
  const pin = createFeedFocusPin({ ...VIEW, id: 'p2', rect: posts[2].rect });
  assert.deepEqual(pin, { id: 'p2', best: posts[2].rect.top - LINE });
});

test('without a pin the selector behaves exactly like the stable picker', () => {
  const posts = feed(100);
  const { selected, pin } = step(posts, 'p0', null);
  assert.equal(selected?.id, 'p0');
  assert.equal(pin, null);
});

test('clicking a low post keeps it pinned while intermediate posts cross the line, then hands off silently', () => {
  let posts = feed(100);
  // p2 is low on screen (top 732, line 402): the unpinned picker would keep p0.
  let pin = createFeedFocusPin({ ...VIEW, id: 'p2', rect: posts[2].rect });
  let result = step(posts, 'p2', pin);
  assert.equal(result.selected?.id, 'p2', 'no scroll: stays on the clicked post');
  pin = result.pin;
  assert.ok(pin, 'still pinned');

  // Scroll toward it in small increments. p1 crosses the reading line on the
  // way (from dy = 20), which would steal auto-focus without the pin.
  const seen = [];
  for (let dy = 20; dy <= 420; dy += 20) {
    result = step(scrolled(posts, dy), 'p2', pin);
    seen.push(result.selected?.id);
    pin = result.pin;
    if (!pin) break;
  }
  assert.ok(seen.every((id) => id === 'p2'), `always p2, saw ${seen.join(',')}`);
  assert.equal(pin, null, 'handed off to auto once the picker agrees');

  // After the handoff the ordinary picker keeps p2 while it spans the line.
  posts = scrolled(posts, 420);
  result = step(posts, 'p2', null);
  assert.equal(result.selected?.id, 'p2');
});

test('scrolling away from the pinned post by more than the band releases it', () => {
  const posts = feed(100);
  let pin = createFeedFocusPin({ ...VIEW, id: 'p2', rect: posts[2].rect });
  // Content moves DOWN (user scrolls up): p2 drifts further below the line.
  let result = step(scrolled(posts, -(BAND - 5)), 'p2', pin);
  assert.equal(result.selected?.id, 'p2', 'inside the band: kept');
  pin = result.pin;
  assert.ok(pin);
  result = step(scrolled(posts, -(BAND + 5)), 'p2', pin);
  assert.equal(result.pin, null, 'beyond the band: released');
  assert.equal(result.selected?.id, 'p0', 'auto picks the post on the line');
});

test('release measures from the best gap reached, not from the click', () => {
  const posts = feed(100);
  let pin = createFeedFocusPin({ ...VIEW, id: 'p3', rect: posts[3].rect });
  // Approach part-way (p3 still well below the line), then reverse.
  let result = step(scrolled(posts, 200), 'p3', pin);
  assert.equal(result.selected?.id, 'p3');
  pin = result.pin;
  assert.equal(pin.best, posts[3].rect.top - 200 - LINE);
  // Reversing by less than the band keeps it; by more releases it.
  result = step(scrolled(posts, 200 - (BAND - 5)), 'p3', pin);
  assert.equal(result.selected?.id, 'p3');
  result = step(scrolled(posts, 200 - (BAND + 5)), 'p3', result.pin);
  assert.equal(result.pin, null);
});

test('small reversals inside the band never flicker', () => {
  const posts = feed(100);
  let pin = createFeedFocusPin({ ...VIEW, id: 'p3', rect: posts[3].rect });
  const ids = [];
  for (const dy of [30, -20, 30, -20, 25, -25, 30]) {
    const result = step(scrolled(posts, dy), 'p3', pin);
    ids.push(result.selected?.id);
    pin = result.pin;
  }
  assert.deepEqual(new Set(ids), new Set(['p3']));
  assert.ok(pin, 'still pinned');
});

test('a layout shift that does not move the pinned post never switches focus', () => {
  const posts = feed(100);
  let pin = createFeedFocusPin({ ...VIEW, id: 'p2', rect: posts[2].rect });
  // Cards ABOVE the pin grow/shrink and cards below are appended (load more);
  // the pinned card itself keeps its geometry.
  const shifted = posts.map((candidate) => candidate.id === 'p0'
    ? { ...candidate, rect: { top: -400, bottom: 300, height: 700 } }
    : candidate);
  shifted.push({ id: 'p6', value: 6, rect: { top: 2000, bottom: 2300, height: 300 } });
  const result = step(shifted, 'p2', pin);
  assert.equal(result.selected?.id, 'p2');
  assert.deepEqual(result.pin, pin);
});

test('clicking another post re-pins to it', () => {
  const posts = feed(100);
  let pin = createFeedFocusPin({ ...VIEW, id: 'p2', rect: posts[2].rect });
  let result = step(posts, 'p2', pin);
  assert.equal(result.selected?.id, 'p2');
  pin = createFeedFocusPin({ ...VIEW, id: 'p1', rect: posts[1].rect });
  result = step(posts, 'p1', pin);
  assert.equal(result.selected?.id, 'p1');
});

test('a pinned post above the reading line is kept until the user scrolls away from it', () => {
  // p0 sits above the reading line (bottom 290, line 402) and p1's top has
  // passed the retention band, so the unpinned picker would choose p1.
  const posts = feed(-10);
  let pin = createFeedFocusPin({ ...VIEW, id: 'p0', rect: posts[0].rect });
  assert.equal(pin.best, LINE - 290);
  let result = step(posts, 'p0', pin);
  assert.equal(result.selected?.id, 'p0');
  // Scrolling further down (content up) moves it away: released beyond band.
  result = step(scrolled(posts, BAND + 5), 'p0', result.pin);
  assert.equal(result.pin, null);
  assert.equal(result.selected?.id, 'p1');
});

test('a pinned post above the line hands off when scrolled back onto the line', () => {
  const posts = feed(-10);
  let pin = createFeedFocusPin({ ...VIEW, id: 'p0', rect: posts[0].rect });
  let result;
  for (let dy = -20; dy >= -200; dy -= 20) {
    result = step(scrolled(posts, dy), 'p0', pin);
    assert.equal(result.selected?.id, 'p0');
    pin = result.pin;
    if (!pin) break;
  }
  assert.equal(pin, null, 'silent handoff');
});

test('a pinned post that leaves the viewport is released', () => {
  const posts = feed(100);
  const pin = createFeedFocusPin({ ...VIEW, id: 'p0', rect: posts[0].rect });
  const result = step(scrolled(posts, 500), 'p0', pin);
  assert.equal(result.pin, null);
  assert.equal(result.selected?.id, 'p2', 'auto picks the card now on the line');
});

test('a pinned post missing from the measured candidates is released', () => {
  const posts = feed(100).filter(({ id }) => id !== 'p2');
  const result = step(posts, 'p2', { id: 'p2', best: 100 });
  assert.equal(result.pin, null);
});

test('feed-boundary shortcuts do not override an active pin', () => {
  const posts = feed(100);
  const pin = createFeedFocusPin({ ...VIEW, id: 'p2', rect: posts[2].rect });
  const atTop = step(posts, 'p2', pin, { atTop: true });
  assert.equal(atTop.selected?.id, 'p2');
  assert.ok(atTop.pin);
  const atBottom = step(posts, 'p0', createFeedFocusPin({ ...VIEW, id: 'p0', rect: posts[0].rect }), { atBottom: true });
  assert.equal(atBottom.selected?.id, 'p0', 'at the bottom the pin still wins over the last card');
});

test('a pin for a post that is no longer the current focus is ignored', () => {
  const posts = feed(100);
  const pin = createFeedFocusPin({ ...VIEW, id: 'p2', rect: posts[2].rect });
  const result = step(posts, 'p0', pin);
  assert.equal(result.pin, null);
  assert.equal(result.selected?.id, 'p0');
});

test('center mode pins use the viewport centre as the reading line', () => {
  const posts = feed(100);
  const center = { ...VIEW, mode: 'center' };
  const pin = createFeedFocusPin({ ...center, id: 'p3', rect: posts[3].rect });
  assert.equal(pin.best, posts[3].rect.top - 630);
  const result = selectPinnedFeedFocus({ ...center, candidates: posts, currentId: 'p3', pin });
  assert.equal(result.selected?.id, 'p3');
  assert.ok(result.pin);
});
