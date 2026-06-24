import { test, expect } from '@playwright/test';
import {
  gotoFeed,
  sel,
  VIEWPORTS,
  horizontalOverflow,
  feedRatio,
} from './helpers';

// R-RESIZE — app-wide shell redesign: sticky top nav + horizontally-centered
// feed/related group + a single ratio slider. All are now MATCHES (regression
// guards) on this branch.
test.describe('Shell layout (R-RESIZE)', () => {
  test('R-RESIZE-1: sticky top nav; no left-nav column, no burger', async ({ page }) => {
    await gotoFeed(page);
    const nav = page.locator(sel.topNav);
    await expect(nav).toBeVisible();
    const position = await nav.evaluate((el) => getComputedStyle(el).position);
    expect(['sticky', 'fixed']).toContain(position);
    const box = (await nav.boundingBox())!;
    expect(box.y).toBeLessThanOrEqual(2);
    // The old left-nav column and nav-collapse burger must stay gone (RG-2).
    await expect(page.locator('[data-testid="col-nav"]')).toHaveCount(0);
    await expect(page.locator('.mantine-Burger-root')).toHaveCount(0);
  });

  test('R-RESIZE-2/6: content group centered and capped at ~1280px on a wide screen', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.wide);
    await gotoFeed(page);
    const box = (await page.locator(sel.contentGroup).boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(1292); // 1280 cap + box-sizing slack
    expect(box.width).toBeGreaterThan(1100); // near the cap, not full-bleed
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    const leftGutter = box.x;
    const rightGutter = clientW - (box.x + box.width);
    expect(Math.abs(leftGutter - rightGutter)).toBeLessThanOrEqual(20); // centered
  });

  test('R-RESIZE-3: exactly one ratio slider, default split ~65/35', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.roomy);
    await gotoFeed(page);
    await expect(page.locator(sel.resizeSeparator)).toHaveCount(1);
    const ratio = await feedRatio(page);
    expect(ratio).toBeGreaterThan(0.58);
    expect(ratio).toBeLessThan(0.72);
  });

  test('R-RESIZE-4: dragging changes + persists the ratio; double-click resets to 0.65', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.roomy);
    await gotoFeed(page);

    const before = await feedRatio(page);
    const sepBox = (await page.locator(sel.resizeSeparator).boundingBox())!;
    // The divider spans the full column height (top:0;bottom:0), so its box
    // center is off-screen on a tall feed. Grab it near the top, in-viewport.
    const cy = Math.max(sepBox.y, 0) + 200;
    const cx = sepBox.x + sepBox.width / 2;

    // Drag the slider left in explicit increments (the divider uses pointer
    // events with capture; a single stepped move can miss the delta handler).
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(cx - (160 * i) / 12, cy);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // The slider actually moved — feed got narrower.
    const after = await feedRatio(page);
    expect(after).toBeLessThan(before - 0.03);

    // Persisted as a ratio under stacky:feedRatio.
    const stored = await page.evaluate(() => localStorage.getItem('stacky:feedRatio'));
    expect(stored).not.toBeNull();
    expect(parseFloat(stored!)).toBeCloseTo(after, 1);

    // Reload preserves the saved ratio.
    await page.reload();
    await page.locator(sel.activePost).first().waitFor();
    await page.waitForTimeout(200);
    expect(await feedRatio(page)).toBeCloseTo(after, 1);

    // Double-click resets to the 0.65 default (value + persisted).
    await page.locator(sel.resizeSeparator).dblclick();
    await page.waitForTimeout(300);
    const reset = await page.evaluate(() => localStorage.getItem('stacky:feedRatio'));
    expect(parseFloat(reset!)).toBeCloseTo(0.65, 2);
    expect(await feedRatio(page)).toBeCloseTo(0.65, 1);
  });

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    test(`R-RESIZE-5/7: feed+aside side-by-side, no horizontal overflow @ ${name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize(vp);
      await gotoFeed(page);
      const feed = (await page.locator(sel.feed).boundingBox())!;
      const aside = (await page.locator(sel.aside).boundingBox())!;
      // Side-by-side: aside sits to the right of the feed on the same row.
      expect(aside.x).toBeGreaterThanOrEqual(feed.x + feed.width - 2);
      expect(Math.abs(aside.y - feed.y)).toBeLessThan(120);
      // No collapse/stack: both have real width.
      expect(feed.width).toBeGreaterThan(40);
      expect(aside.width).toBeGreaterThan(40);
      // No horizontal overflow.
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }
});
