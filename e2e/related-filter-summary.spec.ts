import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

const DETAIL = '/ChineseEVs/posts/152053690';

test('contribution filter is noticeable, offers alternatives, and clears from its own chip', async ({ page }) => {
  await page.goto(DETAIL, { waitUntil: 'domcontentloaded' });
  const header = page.getByTestId('related-sticky-header');
  const summary = page.getByTestId('related-filter-summary');
  await expect(summary).toContainText(/Related posts: \d+ posts across all categories/);
  const filter = header.getByRole('button', { name: /^Show .+ filter$/ }).first();
  const label = (await filter.getAttribute('aria-label'))!.replace(/^Show /, '').replace(/ filter$/, '');
  await filter.click();
  await expect(summary).toContainText(/Filtered: \d+ related posts? contributing/);
  await expect(summary).toContainText(label);
  const change = summary.getByRole('button', { name: 'Change contribution type filter' });
  await change.hover();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  const replacement = (await page.getByRole('menuitem').first().textContent())!.split(' · ')[0];
  await page.getByRole('menuitem').first().click();
  await expect(summary).toContainText(replacement);
  await summary.getByRole('button', { name: `Remove ${replacement} filter`, exact: true }).click();
  await expect(summary).toContainText(/Related posts: \d+ posts across all categories/);
});

test('topic alternatives work with keyboard and its separate × clears the restriction', async ({ page }) => {
  await page.goto(DETAIL, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="focus-reveal"] mark[aria-label^="Choose among"]:visible').first().click();
  const summary = page.getByTestId('related-filter-summary');
  await expect(summary).toContainText(/Filtered: \d+ related posts? about/);
  const change = summary.getByRole('button', { name: 'Change topic filter' });
  await page.mouse.move(0, 0);
  await change.focus();
  await page.keyboard.press('Enter');
  const options = page.getByRole('menuitem');
  await expect(options.nth(1)).toBeVisible();
  const label = (await options.nth(1).textContent())!.split(' · ')[0];
  await options.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('aside-topic-filter')).toContainText(label);
  await summary.getByRole('button', { name: `Remove ${label} filter`, exact: true }).click();
  await expect(summary).toContainText(/Related posts: \d+ posts across all categories/);
});
