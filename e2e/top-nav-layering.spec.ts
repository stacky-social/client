import { expect, test } from '@playwright/test';

test('keeps panel dividers behind the sticky top navigation while scrolling', async ({ page }) => {
  await page.goto('/ChineseEVs');
  await expect(page.locator('[data-demo-feed-post]').first()).toBeVisible();

  const divider = page.getByRole('separator', { name: 'Resize feed and related panels' });
  await expect(divider).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 900));

  const navOwnsDividerPoint = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="top-nav"]');
    const separator = document.querySelector('[role="separator"][aria-label="Resize feed and related panels"]');
    if (!(nav instanceof HTMLElement) || !(separator instanceof HTMLElement)) return false;
    const navRect = nav.getBoundingClientRect();
    const separatorRect = separator.getBoundingClientRect();
    const hit = document.elementFromPoint(
      separatorRect.left + separatorRect.width / 2,
      navRect.top + navRect.height / 2,
    );
    return hit === nav || (hit instanceof Node && nav.contains(hit));
  });

  expect(navOwnsDividerPoint).toBe(true);
});
