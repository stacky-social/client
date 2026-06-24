import { test, expect } from '@playwright/test';
import {
  gotoFeed,
  sel,
  ACTIVE_BORDER_RGB,
  activePostWrapperId,
  relatedCards,
} from './helpers';

// R-FEED — the feed & focus invariant: at every scroll position exactly one
// post is focused and the aside matches it (D-FOCUS).
test.describe('Feed focus invariant (R-FEED)', () => {
  test('R-FEED-1: hashtag header, stats, and 6 posts', async ({ page }) => {
    await gotoFeed(page);
    await expect(page.getByText('#ChineseEVs')).toBeVisible();
    await expect(page.getByText('Posts', { exact: true })).toBeVisible();
    await expect(page.getByText('Participants', { exact: true })).toBeVisible();
    await expect(page.getByText('Responses', { exact: true })).toBeVisible();
    await expect(page.locator(sel.post)).toHaveCount(6);
  });

  test('R-FEED-2: exactly one focused post on load, aside populated', async ({ page }) => {
    await gotoFeed(page);
    await expect(page.locator(sel.activePost)).toHaveCount(1);
    expect(await relatedCards(page).count()).toBeGreaterThan(0);
  });

  test('R-FEED-3 (D-FOCUS): exactly one focus + non-empty aside at top, mid, bottom', async ({ page }) => {
    await gotoFeed(page);
    const assertFocused = async () => {
      await expect(page.locator(sel.activePost)).toHaveCount(1);
      expect(await relatedCards(page).count()).toBeGreaterThan(0);
    };
    await assertFocused(); // top
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(350);
    await assertFocused(); // mid
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(450);
    await assertFocused(); // bottom spacer
  });

  test('R-FEED-4: scrolling moves focus (always exactly one, id changes)', async ({ page }) => {
    await gotoFeed(page);
    const seen = new Set<string>();
    for (let y = 0; y <= 2200; y += 400) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(250);
      await expect(page.locator(sel.activePost)).toHaveCount(1);
      const id = await activePostWrapperId(page);
      if (id) seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(1); // focus actually advanced
  });

  test('R-FEED-5: active post renders the blue active border', async ({ page }) => {
    await gotoFeed(page);
    const active = page.locator(sel.activePost).first();
    const border = await active.evaluate((el) => getComputedStyle(el).borderColor);
    expect(border).toContain(ACTIVE_BORDER_RGB);
  });
});
