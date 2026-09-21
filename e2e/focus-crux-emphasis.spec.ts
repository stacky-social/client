import { expect, test } from '@playwright/test';

// Focus-post topic phrases read as bold at rest. Hovering ONE related-card span
// is a directed gesture: that span's phrase keeps its emphasis and every
// unrelated phrase returns to ordinary text, so the reader can see which words
// the hovered response is answering.
//
// The emphasis is a text-shadow rather than a font-weight, and this suite is the
// reason. The gesture toggles emphasis on every phrase at once, so anything that
// changes glyph metrics reflows the paragraph and moves the words out from under
// the cursor mid-hover. The width assertion below is the real contract; the
// shadow assertions only describe how it is currently achieved.

const DETAIL_URL = '/EnergyTech/posts/cw-S1VeKWSitwk9wRrq';
const MARKS = '[data-testid="focus-reveal"] mark';

test('a directed related-span hover un-bolds unrelated phrases without moving text', async ({ page }) => {
  // The dev server compiles this route on demand, which can outlast the default.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded' });

  const focusMarks = page.locator(MARKS);
  await expect(focusMarks.first()).toBeAttached({ timeout: 90_000 });
  const totalMarks = await focusMarks.count();
  expect(totalMarks, 'focus post needs several phrases for muting to mean anything').toBeGreaterThan(1);

  // Every phrase carries the emphasis before any hover.
  const shadowsAtRest = await focusMarks.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).textShadow));
  expect(shadowsAtRest.every((shadow) => shadow !== 'none'), 'all phrases emphasised at rest').toBe(true);

  // Emphasis must never be carried by font-weight, at rest or muted: that is
  // what makes it toggleable without moving text. Compare against the prose the
  // phrase sits in rather than a hard-coded 400.
  const weightsMatchProse = await focusMarks.evaluateAll((nodes) =>
    nodes.map((node) => {
      const prose = node.parentElement ? getComputedStyle(node.parentElement).fontWeight : '400';
      return getComputedStyle(node).fontWeight === prose;
    }));
  expect(weightsMatchProse.every(Boolean), 'phrases must not be emphasised by weight').toBe(true);

  const widthsAtRest = await focusMarks.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().width)));

  // Related cards hydrate after the focus post, and further behind it when the
  // dev server is compiling other routes in parallel.
  const span = page.locator('[data-related-card] mark[data-range-id]').first();
  await expect(span).toBeAttached({ timeout: 60_000 });
  await span.scrollIntoViewIfNeeded();
  await span.hover();

  // The gesture must actually reach the focus post: something got muted. The
  // range-index publish is debounced (200ms) so a sweep across a card does not
  // strobe the focus post — wait for the class rather than for a fixed delay.
  const muted = page.locator(`${MARKS}.fp-aside-muted`);
  await expect(muted.first(), 'hovering one span should mute the unrelated phrases')
    .toBeAttached({ timeout: 10_000 });
  const mutedCount = await muted.count();
  expect(mutedCount, 'the hovered span keeps its own phrase emphasised').toBeLessThan(totalMarks);

  // Muted phrases read as ordinary text.
  const mutedShadows = await muted.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).textShadow));
  expect(mutedShadows.every((shadow) => shadow === 'none'), 'muted phrases drop their emphasis').toBe(true);

  // The linked phrase keeps it.
  const linkedShadows = await page.locator(`${MARKS}:not(.fp-aside-muted)`)
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).textShadow));
  expect(linkedShadows.length).toBeGreaterThan(0);
  expect(linkedShadows.every((shadow) => shadow !== 'none'), 'the linked phrase stays emphasised').toBe(true);

  // THE CONTRACT: nothing moved. A font-weight-based emphasis fails here by
  // 7-16px per phrase, which is enough to shift a line break under the cursor.
  const widthsOnHover = await focusMarks.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().width)));
  expect(widthsOnHover, 'phrase widths must not change when emphasis toggles').toEqual(widthsAtRest);
});
