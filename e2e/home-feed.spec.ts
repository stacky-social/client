import { expect, test } from '@playwright/test';

test.describe('Home timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  });

  test('renders a structured starter timeline with reply provenance', async ({ page }) => {
    await expect(page.locator('[data-store-feed-post]')).toHaveCount(6);
    await expect(page.getByText('Curated and followed conversations')).toBeVisible();
    await expect(page.getByTestId('reply-context')).toHaveCount(3);
    await expect(
      page.locator('[data-store-feed-post="152052643"]').getByText('Replying to @totem'),
    ).toBeVisible();
  });

  test('shows real related responses and AI edits for an annotated focus post', async ({ page }) => {
    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]')).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Modified by AI' }).first()).toBeVisible();
  });

  test('keeps the right column blank and the feed width stable for a post with no relations', async ({ page }) => {
    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    const feedWidthWithRelations = (await page.getByTestId('feed').boundingBox())?.width;

    const ordinaryReply = page.locator('[data-store-feed-post="152052643"]');
    await ordinaryReply.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(ordinaryReply.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
    await expect(page.getByTestId('home-related-empty')).toBeAttached();
    await expect(page.getByText('No related responses for this post.')).toHaveCount(0);

    const feedWidthWithoutRelations = (await page.getByTestId('feed').boundingBox())?.width;
    expect(feedWidthWithRelations).toBeDefined();
    expect(feedWidthWithoutRelations).toBeCloseTo(feedWidthWithRelations!, 2);
  });

  test('uses the full reading width and hides the desktop related column on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();

    const feedBox = await page.getByTestId('feed').boundingBox();
    expect(feedBox?.width).toBeGreaterThan(340);
    await expect(page.getByTestId('col-aside')).toBeHidden();
  });
});
