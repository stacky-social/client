import { revealTopLevelReplies } from './helpers/revealReplies';
import { expect, test } from '@playwright/test';

test('replies append while scrolling and nested branches explicitly expand and hide', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ChineseEVs/posts/143195604');
  const region = page.getByTestId('reply-scroll-region');
  const branches = region.locator('[data-reply-depth="0"]');
  await expect(branches.first()).toBeVisible({ timeout: 60_000 });
  await expect(region.getByTestId('reply-load-sentinel')).toBeAttached();
  const initial = await branches.count();
  await expect.poll(async () => {
    await region.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    return branches.count();
  }, { timeout: 30_000 }).toBeGreaterThan(initial);
  await expect(region.getByRole('button', { name: /^\d+ more repl/ })).toHaveCount(0);

  await revealTopLevelReplies(page);
  const expand = region.locator('[data-testid^="nested-see-more-"]').first();
  await expect(expand).toBeAttached();
  const parentId = (await expand.getAttribute('data-testid'))!.replace('nested-see-more-', '');
  const branch = region.locator(`[data-post-id="${parentId}"]`).first()
    .locator('xpath=ancestor::*[@data-reply-depth][1]');
  await expect(expand).toContainText(/Show \d+ nested repl/);
  await expand.click();
  await expect(branch.locator('[data-reply-depth="1"]').first()).toBeVisible();
  await branch.getByRole('button', { name: 'Hide nested replies', exact: true }).first().click();
  await expect(branch.locator('[data-reply-depth="1"]')).toHaveCount(0);
});
