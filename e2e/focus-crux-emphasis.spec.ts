import { expect, test } from '@playwright/test';

// Focus-post topic phrases are bold at rest. Hovering ONE related-card span is a
// directed gesture: that span's phrase stays bold and every unrelated phrase
// returns to ordinary text, so the reader can see which words the hovered
// response is answering.
//
// Regression guard for #224: the emphasis moved from a text-shadow to a real
// font-weight, but `.fp-aside-muted` still only cancelled the shadow, so every
// phrase stayed bold and the gesture pointed at nothing.

const DETAIL_URL = '/EnergyTech/posts/cw-S1VeKWSitwk9wRrq';
const REST_WEIGHT = '700';

test('a directed related-span hover leaves only the linked focus phrase bold', async ({ page }) => {
  // The dev server compiles this route on demand, which can outlast the default.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded' });

  const focusMarks = page.locator('[data-testid="focus-reveal"] mark');
  await expect(focusMarks.first()).toBeAttached({ timeout: 90_000 });
  const totalMarks = await focusMarks.count();
  expect(totalMarks, 'focus post needs several phrases for muting to mean anything').toBeGreaterThan(1);

  // Every phrase is bold before any hover.
  const weightsAtRest = await focusMarks.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).fontWeight));
  expect(new Set(weightsAtRest)).toEqual(new Set([REST_WEIGHT]));

  // Related cards hydrate after the focus post, and further behind it when the
  // dev server is compiling other routes in parallel.
  const span = page.locator('[data-related-card] mark[data-range-id]').first();
  await expect(span).toBeAttached({ timeout: 60_000 });
  await span.scrollIntoViewIfNeeded();
  await span.hover();

  // The gesture must actually reach the focus post: something got muted. The
  // range-index publish is debounced (200ms) so a sweep across a card does not
  // strobe the focus post — wait for the class rather than for a fixed delay,
  // which would go fragile the moment the dev server is under load.
  const muted = page.locator('[data-testid="focus-reveal"] mark.fp-aside-muted');
  await expect(muted.first(), 'hovering one span should mute the unrelated phrases')
    .toBeAttached({ timeout: 10_000 });
  const mutedCount = await muted.count();
  expect(mutedCount, 'the hovered span keeps its own phrase bold').toBeLessThan(totalMarks);

  // Muted phrases read as ordinary text, not as bold.
  const mutedWeights = await muted.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).fontWeight));
  for (const weight of mutedWeights) {
    expect(Number(weight), 'a muted phrase must not stay bold').toBeLessThan(Number(REST_WEIGHT));
  }

  // The linked phrase is still bold.
  const linkedWeights = await page
    .locator('[data-testid="focus-reveal"] mark:not(.fp-aside-muted)')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontWeight));
  expect(linkedWeights.length).toBeGreaterThan(0);
  expect(new Set(linkedWeights)).toEqual(new Set([REST_WEIGHT]));
});
