import { expect, test } from '@playwright/test';

test('all contribution types remain available and secondary hover/filter recolors both panes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ChineseEVs/posts/143195604', { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-related-card]:has([data-post-id="143205239"])');
  await expect(card.locator('[data-related-tag]')).toHaveCount(2);
  const secondary = card.locator('[data-related-tag][data-contribution-category="evidence_public"]');
  const marks = card.locator('[data-ai-edited-default] mark[data-contribution-category]');
  await expect(marks.first()).toHaveAttribute('data-contribution-category', 'framing');
  await expect(marks.first()).toHaveCSS('background-image', 'none');
  await secondary.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await secondary.hover();
  await expect(marks.first()).toHaveAttribute('data-contribution-category', 'evidence_public');
  await expect(page.locator('[data-testid="focus-reveal"] [data-contribution-category="evidence_public"]').first()).toBeVisible();
  // The card-hover delay must not erase explicit icon intent.
  await page.waitForTimeout(250);
  await expect(marks.first()).toHaveAttribute('data-contribution-category', 'evidence_public');

  await page.mouse.move(0, 0);
  await expect(marks.first()).toHaveAttribute('data-contribution-category', 'framing');
  const header = page.getByTestId('related-sticky-header');
  await header.getByRole('button', { name: 'Show Framing filter', exact: true }).click();
  await header.getByRole('button', { name: 'Show Evidence (Public) filter', exact: true }).click();
  await expect(header.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(header.getByRole('button', { name: 'Show Framing filter', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await card.locator('[data-related-card-surface]').hover();
  await expect(marks.first()).toHaveAttribute('data-contribution-category', 'evidence_public');
  await expect(page.locator('[data-testid="focus-reveal"] [data-contribution-category="evidence_public"]').first()).toBeVisible();
  await expect(card).toBeVisible();
});
