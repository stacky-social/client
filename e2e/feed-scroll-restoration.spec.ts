import { expect, test, type Locator } from '@playwright/test';

async function center(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
}

test.describe('Feed scroll restoration', () => {
  test('a demo post round-trip restores the same card at the same viewport offset', async ({ page }) => {
    await page.goto('/ChineseEVs');
    const target = page.locator('[data-demo-feed-post]').nth(1);
    await expect(target).toBeVisible({ timeout: 15_000 });
    await center(target);

    const postId = await target.getAttribute('data-demo-feed-post');
    const beforeTop = await target.evaluate((element) => element.getBoundingClientRect().top);
    expect(postId).toBeTruthy();

    // Keyboard activation targets the card's navigation surface directly and
    // avoids landing on a highlighted span or action icon within the Paper.
    const navigationSurface = target.getByTestId('post').locator('[role="button"][tabindex="0"]').first();
    await navigationSurface.focus();
    await navigationSurface.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${postId}(?:\\?|$)`));

    await page.goBack();
    await expect(page).toHaveURL(/\/ChineseEVs(?:\?|$)/);
    const restored = page.locator(`[data-demo-feed-post="${postId}"]`);
    await expect(restored).toBeVisible();
    await expect.poll(
      async () => restored.evaluate((element) => element.getBoundingClientRect().top),
    ).toBeCloseTo(beforeTop, 0);
  });

  test('a related-post round-trip restores its focused feed card', async ({ page }) => {
    await page.goto('/ChineseEVs');
    const target = page.locator('[data-demo-feed-post]').nth(1);
    await expect(target).toBeVisible({ timeout: 15_000 });
    await center(target);

    const postId = await target.getAttribute('data-demo-feed-post');
    const beforeTop = await target.evaluate((element) => element.getBoundingClientRect().top);
    expect(postId).toBeTruthy();

    const relatedPaper = page
      .getByTestId('col-aside')
      .locator('[data-related-card] [data-post-id]')
      .first();
    await expect(relatedPaper).toBeVisible();
    const relatedId = await relatedPaper.getAttribute('data-post-id');
    const box = await relatedPaper.boundingBox();
    expect(relatedId).toBeTruthy();
    expect(box).not.toBeNull();
    await relatedPaper.click({ position: { x: box!.width - 24, y: 8 } });
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${relatedId}(?:\\?|$)`));

    await page.goBack();
    await expect(page).toHaveURL(/\/ChineseEVs(?:\?|$)/);
    const restored = page.locator(`[data-demo-feed-post="${postId}"]`);
    await expect(restored).toBeVisible();
    await expect.poll(
      async () => restored.evaluate((element) => element.getBoundingClientRect().top),
    ).toBeCloseTo(beforeTop, 0);
  });
});
