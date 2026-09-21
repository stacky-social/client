import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('AI redlines group consecutive replacements and separate old/new phrases', async ({ page }) => {
  await page.goto('/EnergyTech/posts/cw-ie_db4lx1rv_UOr_');
  await page.getByRole('button', { name: 'Show Connections filter' }).click();
  const card = page.locator('[data-related-card] [data-post-id="cw-BUGfufR__CqO1aQ-"]');
  const badge = card.getByRole('button', { name: 'Modified by AI' });
  const before = await card.boundingBox();
  await badge.hover();
  const diff = card.locator('[data-ai-inline-diff]');
  await expect(diff).toHaveAttribute('aria-hidden', 'false');
  expect(await card.boundingBox()).toEqual(before);
  await expect(diff.locator('del')).toContainText(["our nation's", 'they possess']);
  await expect(diff.locator('ins')).toContainText(["the United States'", 'China possesses']);
  await expect(diff).toContainText("our nation's the United States'");
  await expect(diff).toContainText('they possess China possesses');
  await expect(diff.locator('mark')).not.toHaveCount(0);
  await expect(diff.locator('[data-ai-edit-separator]')).toHaveCount(2);
  await page.screenshot({ path: '/tmp/stacky-ai-phrases.png' });
  await page.keyboard.press('Escape');
  await expect(diff).toHaveAttribute('aria-hidden', 'true');
  await expect(card.locator('[data-ai-edited-default]')).toHaveAttribute('aria-hidden', 'false');
  await badge.tap();
  await expect(diff).toHaveAttribute('aria-hidden', 'false');
  await badge.tap();
  await expect(diff).toHaveAttribute('aria-hidden', 'true');
});
