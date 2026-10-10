import { expect, test } from '@playwright/test';

test('hover dims sibling cards without dimming any part of the shared group outline', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ChineseEVs/posts/143195604', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-related-card] mark[data-range-id]').first().click();
  await expect(page.locator('[data-related-group-header]')).toBeVisible();
  const members = page.locator('[data-related-group-member]');
  await expect.poll(() => members.count()).toBeGreaterThan(1);
  const first = members.first().locator('[data-related-card-surface]');
  const sibling = members.nth(1).locator('[data-related-card-surface]');
  await first.scrollIntoViewIfNeeded();
  // Grouping/scrolling suppresses hover until its reveal settles.
  await page.waitForTimeout(350);
  await page.mouse.move(0, 0);
  await first.hover();
  await expect(sibling).toHaveCSS('opacity', '0.45');
  await expect(first).toHaveCSS('opacity', '1');

  // A rail can have opacity:1 itself and still be faded by a parent. Check the
  // complete ancestor chain, including filters, to catch the original bug.
  const frames = page.locator('[data-related-group-frame], [data-related-group-header], [data-related-group-footer]');
  await expect.poll(() => frames.evaluateAll((elements) => elements.every((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (Number(style.opacity) !== 1 || style.filter !== 'none') return false;
    }
    return true;
  }))).toBe(true);
  await expect(page.locator('[data-related-group-frame]').first()).toHaveCSS('border-left-style', 'solid');
});
