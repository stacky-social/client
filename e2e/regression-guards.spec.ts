import { test, expect } from '@playwright/test';
import { gotoFeed, sel, FEED_ROUTE, firstFocusId, relatedCards } from './helpers';

// §5A — deliberate decisions that must not silently revert.
test.describe('Regression guards (§5A)', () => {
  test('RG-1: focus post shows NO stack/category-count icon column on the feed', async ({ page }) => {
    await gotoFeed(page);
    await expect(page.locator(sel.stackCount)).toHaveCount(0);
  });

  test('RG-1: NO stack-count column on the post detail route either', async ({ page }) => {
    await page.goto(`${FEED_ROUTE}/posts/${firstFocusId}`);
    await page.waitForLoadState('networkidle');
    // sanity: not an error/empty page
    await expect(page.getByText(/Application error|not found in mock data/i)).toHaveCount(0);
    await expect(page.locator(sel.stackCount)).toHaveCount(0);
  });

  test('RG-C3 (ratified): card category tags are colored at rest (no panel hover needed)', async ({ page }) => {
    await gotoFeed(page);
    const tag = relatedCards(page).first().locator(sel.cardTagText).first();
    await expect(tag).toBeVisible();
    const color = await tag.evaluate((el) => getComputedStyle(el).color);
    // Not the neutral slate grey used before the "always colored" decision.
    expect(color).not.toBe('rgb(100, 116, 139)');
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('RG-C2: dates are honest — no "in … ago" future inflation', async ({ page }) => {
    await gotoFeed(page);
    const body = await page.locator('body').innerText();
    // The bug rendered future/skewed timestamps as the self-contradictory
    // "in about 3 hours ago". The honest output is "X ago" or "just now" — it
    // never combines a leading "in" with a trailing "ago". (Matching the full
    // "in … <unit> ago" signature avoids false positives on prose like
    // "in 10 years".)
    expect(body).not.toMatch(
      /\bin\s+(about\s+)?(\d+|a|an|half)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i,
    );
  });
});
