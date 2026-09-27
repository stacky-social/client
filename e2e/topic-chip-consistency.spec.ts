import { expect, test } from '@playwright/test';

// Grouping must not add anything to a card's header. Every grouped card used
// to carry its own "<topic> (n) ›" row; on the anchor it grew the header
// 44→70px and slid the clicked span down (#224). The group now reads through
// its bordered block alone ("Topic (N) ×" header, footer, rails, plus a frozen
// copy of the header while scrolling), and the anchor is identified by the
// active-group-anchor hook on the card itself. A card carrying the "Modified"
// pill must keep the same header height as one without it.

const DETAIL_URL = '/EnergyTech/posts/cw-S1VeKWSitwk9wRrq';
const CHIP = '[data-related-card] button[aria-label^="Show more posts about"]';

test('an active group adds no per-card topic row and every card header keeps its height', async ({ page }) => {
  // The dev server compiles this route on demand, which can outlast the default.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded' });

  const span = page.locator('[data-related-card] mark[data-range-id]').first();
  await expect(span).toBeAttached({ timeout: 90_000 });
  const headerHeights = () => page.locator('[data-related-card] [data-post-id]').evaluateAll((papers) =>
    Object.fromEntries(papers.map((paper) => [
      paper.getAttribute('data-post-id'),
      Math.round(paper.firstElementChild!.getBoundingClientRect().height * 10) / 10,
    ])));
  const before = await headerHeights();
  expect(new Set(Object.values(before)).size, 'every card header shares one height').toBe(1);

  await span.scrollIntoViewIfNeeded();
  await span.click();
  await expect(page.getByTestId('active-group-anchor')).toHaveCount(1);
  await expect(page.locator('[data-related-group-header]')).toBeVisible();
  await expect(page.locator(CHIP)).toHaveCount(0);

  const after = await headerHeights();
  for (const [postId, height] of Object.entries(after)) {
    if (postId in before) expect(height, `header of ${postId}`).toBe(before[postId]);
  }
});
