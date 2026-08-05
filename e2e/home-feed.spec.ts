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
    // Ana's source count is 20 even though this curated demo only includes four
    // thread descendants and 103 separately-related posts. Neither collection
    // is added to the visible reply counter.
    await expect(
      page.locator('[data-store-feed-post="152053690"]').getByRole('button', { name: 'Reply' }),
    ).toContainText('20');
  });

  test('repairs a stale persisted reply count from the authoritative seed', async ({ page }) => {
    await page.evaluate(() => {
      const key = 'stacky:localStore:v1';
      const state = JSON.parse(localStorage.getItem(key) || 'null');
      state.posts['152053690'].replies_count = 123;
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();

    await expect(
      page.locator('[data-store-feed-post="152053690"]').getByRole('button', { name: 'Reply' }),
    ).toContainText('20');
  });

  test('shows real related responses and AI edits for an annotated focus post', async ({ page }) => {
    // An existing participant may have the older, addition-only enrichment in
    // localStorage. Read-only demo annotations should refresh without resetting
    // their likes, bookmarks, follows, or authored posts.
    await page.evaluate(() => {
      const key = 'stacky:localStore:v1';
      const state = JSON.parse(localStorage.getItem(key) || 'null');
      const stacks = state?.posts?.['152053690']?.relatedStacks;
      const michael = stacks?.find((stack: any) => stack.topPost?.id === '143196877');
      if (michael) {
        michael.topPost.rewrite = {
          content: "To connect China's battery-factory lead with supply-chain practice, I work in sustainability for a leading European global brand that has 1000+ suppliers across the world.",
          significant: true,
          editSummary: 'Stale addition-only demo rewrite.',
        };
        localStorage.setItem(key, JSON.stringify(state));
      }
    });
    await page.reload();

    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]')).toHaveCount(10);

    const michaelCard = page.locator('[data-post-id="143196877"]');
    const badge = michaelCard.getByRole('button', { name: 'Modified by AI' });
    const editedText = michaelCard.locator('[data-ai-edited-default]');
    const inlineDiff = michaelCard.locator('[data-ai-inline-diff]');
    await expect(badge).toBeVisible();
    await expect(editedText).toContainText('I work on sustainability for a major European brand');
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'true');
    const beforeHover = await michaelCard.boundingBox();

    await badge.hover();

    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'false');
    const deletedText = (await inlineDiff.locator('del').allTextContents()).join('');
    const insertedText = (await inlineDiff.locator('ins').allTextContents()).join('');
    expect(deletedText).toContain('in');
    expect(deletedText).toContain('leading');
    expect(deletedText).toContain('global');
    expect(insertedText).toContain("To connect China's battery-factory lead");
    expect(insertedText).toContain('on');
    expect(insertedText).toContain('major');
    const afterHover = await michaelCard.boundingBox();
    expect(afterHover?.width).toBeCloseTo(beforeHover!.width, 2);
    expect(afterHover?.height).toBeCloseTo(beforeHover!.height, 2);
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
