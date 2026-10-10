import { expect, test } from '@playwright/test';

test('topic menu clears the hovered text line when entering at its upper edge', async ({ page }) => {
  await page.goto('/Tariffs/posts/cw-bpvqBrw_B23dLVfY');
  const mark = page.locator('[data-testid="focus-reveal"] mark[aria-label^="Choose among"]:visible').first();
  await expect(mark).toBeVisible();
  const line = await mark.evaluate((element) => {
    const rect = element.getClientRects()[0];
    return { x: rect.left + 2, y: rect.top + 2, top: rect.top, bottom: rect.bottom };
  });
  await page.mouse.move(line.x, line.y);
  const picker = page.getByTestId('focus-topic-picker');
  await expect(picker).toBeVisible();
  const box = (await picker.boundingBox())!;
  expect(box.y >= line.bottom + 7 || box.y + box.height <= line.top - 7).toBe(true);
});

test('modified hover preserves the complete emphasized crux across a clipped insertion', async ({ page }) => {
  await page.goto('/Tariffs/posts/cw-bpvqBrw_B23dLVfY');
  const card = page.locator('[data-related-card] [data-post-id="cw-x9qj9gHPGunqT_sj"]');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Modified by AI' }).hover();
  // Both layers share the same active emphasis state while the redline is
  // shown; comparing them isolates offset drift from the hover debounce.
  const crux = await card.locator('[data-ai-edited-default] [data-content-comment]').allTextContents();
  expect(crux.join('')).toContain('Who wins in that tariff trade War?');
  const tracked = card.locator('[data-ai-inline-diff]');
  await expect(tracked).toHaveAttribute('aria-hidden', 'false');
  expect((await tracked.locator('[data-content-comment]').allTextContents()).join('')).toEqual(crux.join(''));
});
