import { test, expect } from '@playwright/test';
import { gotoFeed, sel, relatedCards, filterChips } from './helpers';

// R-TIP — the single shared hover tooltip ("N more <Topic>").
test.describe('Hover tooltip (R-TIP)', () => {
  test('R-TIP-1/2: one cursor-following tooltip, pointer-events:none, reads "N more <Topic>"', async ({ page }) => {
    await gotoFeed(page);
    await expect(page.locator(sel.hoverTooltip)).toHaveCount(0); // none at rest

    await relatedCards(page).first().hover();
    await page.waitForTimeout(400);
    await expect(page.locator(sel.hoverTooltip)).toHaveCount(1);

    const tip = page.locator(sel.hoverTooltip).first();
    await expect(tip).toHaveText(/\d+\s+more\s+/i);
    expect(await tip.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
  });

  test('R-TIP-2: leaving the trigger hides the tooltip', async ({ page }) => {
    await gotoFeed(page);
    await relatedCards(page).first().hover();
    await page.waitForTimeout(300);
    await expect(page.locator(sel.hoverTooltip)).toHaveCount(1);
    await page.locator(sel.topNav).hover();
    await page.waitForTimeout(400);
    await expect(page.locator(sel.hoverTooltip)).toHaveCount(0);
  });

  test('R-TIP-5: never more than one tooltip across rapid hovers', async ({ page }) => {
    await gotoFeed(page);
    const cards = relatedCards(page);
    const n = Math.min(await cards.count(), 5);
    for (let i = 0; i < n; i++) {
      await cards.nth(i).hover();
      await page.waitForTimeout(150);
      expect(await page.locator(sel.hoverTooltip).count()).toBeLessThanOrEqual(1);
    }
  });

  test('R-TIP-3: tooltip does not strand when the related list re-renders', async ({ page }) => {
    await gotoFeed(page);
    await relatedCards(page).first().hover();
    await page.waitForTimeout(300);
    await expect(page.locator(sel.hoverTooltip)).toHaveCount(1);
    // Toggling a category filter re-renders the card list (removing/replacing
    // cards). The single shared tooltip must not strand on screen.
    await filterChips(page).first().click();
    await page.waitForTimeout(300);
    await page.mouse.move(5, 300, { steps: 10 }); // move off the aside
    await page.waitForTimeout(400);
    await expect(page.locator(sel.hoverTooltip)).toHaveCount(0);
  });
});
