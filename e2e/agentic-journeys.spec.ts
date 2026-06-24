import { test, expect } from '@playwright/test';
import {
  gotoFeed,
  sel,
  FEED_ROUTE,
  firstFocusId,
  VIEWPORTS,
  relatedCards,
  filterChips,
  activePostWrapperId,
  horizontalOverflow,
  collectPageErrors,
  litMarkCount,
} from './helpers';

// End-to-end "agentic workflow" journeys: full multi-step task flows a user (or
// an agentic tester) performs, asserting coherent state at each step and zero
// uncaught exceptions across the whole journey.
test.describe('Agentic workflows (end-to-end journeys)', () => {
  test('Journey 1: explore → cross-highlight → group → switch → clear → navigate → back', async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoFeed(page);
    await expect(page.locator(sel.activePost)).toHaveCount(1);

    // Hover a related card → focus post cross-highlights.
    await relatedCards(page).first().hover();
    await page.waitForTimeout(300);
    expect(await litMarkCount(page)).toBeGreaterThan(0);

    // Group by that card's topic.
    await relatedCards(page).nth(0).locator(sel.cardCategoryTag).first().click();
    await page.waitForTimeout(400);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(1);
    await expect(page.locator(sel.topicBlockHeader).first()).toBeVisible();

    // Switch to a different topic — single anchor, never compounds.
    await relatedCards(page).nth(5).locator(sel.cardCategoryTag).first().click();
    await page.waitForTimeout(400);
    await expect(page.getByRole('button', { name: /Remove .* grouping/i })).toHaveCount(1);

    // Clear the grouping.
    await page.getByRole('button', { name: /Remove .* grouping/i }).click();
    await page.waitForTimeout(300);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(0);

    // Navigate into a post (via the feed for a deterministic target — related-card
    // navigation is covered by R-NAV-3), then browser-back to the feed.
    const wrapper = page.locator('div[data-post-id]:has([data-testid="post"])').first();
    const id = await wrapper.getAttribute('data-post-id');
    await wrapper.locator('[role="button"]').first().press('Enter');
    await page.waitForURL(new RegExp(`/ChineseEVs/posts/${id}`));
    await expect(page.getByText(/Application error|not found in mock data/i)).toHaveCount(0);
    await page.goBack();
    await page.waitForURL(/\/ChineseEVs$/);
    await expect(page.locator(sel.activePost)).toHaveCount(1);

    expect(errors).toEqual([]);
  });

  test('Journey 2: scrolling advances focus and keeps the aside in sync', async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoFeed(page);
    const seen = new Set<string>();
    for (const frac of [0, 0.33, 0.66, 1]) {
      await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), frac);
      await page.waitForTimeout(320);
      await expect(page.locator(sel.activePost)).toHaveCount(1);
      expect(await relatedCards(page).count()).toBeGreaterThan(0);
      const id = await activePostWrapperId(page);
      if (id) seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(1); // focus advanced through several posts
    expect(errors).toEqual([]);
  });

  test('Journey 3: filter by category, then group within the filtered set', async ({ page }) => {
    const errors = collectPageErrors(page);
    await gotoFeed(page);
    const before = await relatedCards(page).count();
    await filterChips(page).first().click();
    await page.waitForTimeout(350);
    const after = await relatedCards(page).count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
    // Group within the filtered set — must not crash.
    const tag = relatedCards(page).first().locator(sel.cardCategoryTag).first();
    if (await tag.count()) {
      await tag.click();
      await page.waitForTimeout(350);
    }
    expect(errors).toEqual([]);
  });

  test('Journey 4: deep navigation chain never crashes', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(`${FEED_ROUTE}/posts/${firstFocusId}`);
    await page.waitForLoadState('networkidle');
    for (let hop = 0; hop < 3; hop++) {
      const card = relatedCards(page).first();
      if (!(await card.count())) break;
      await card.click();
      await page.waitForURL(/\/ChineseEVs\/posts\/.+/);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/Application error|not found in mock data/i)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('Journey 5: full flow works at a phone viewport (side-by-side, no overflow)', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.setViewportSize(VIEWPORTS.phone);
    await gotoFeed(page);
    const feed = (await page.locator(sel.feed).boundingBox())!;
    const aside = (await page.locator(sel.aside).boundingBox())!;
    expect(aside.x).toBeGreaterThanOrEqual(feed.x + feed.width - 2); // side-by-side
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    // Grouping still works on a narrow panel (tags collapse to icons but stay clickable).
    await relatedCards(page).nth(0).locator(sel.cardCategoryTag).first().click();
    await page.waitForTimeout(400);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
