import { expect, test } from '@playwright/test';

test.describe('Home timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tag/ChineseEVs');
    await page.getByRole('button', { name: 'Follow hashtag' }).click();
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  });

  test('renders only focus posts from a followed conversation by default', async ({ page }) => {
    await expect(page.locator('[data-store-feed-post]')).toHaveCount(6);
    await expect(page.getByText('Posts from accounts and hashtags you follow')).toBeVisible();
    await expect(page.getByTestId('reply-context')).toHaveCount(0);
    await expect(page.locator('[data-store-feed-post="152052643"]')).toHaveCount(0);
    // Ana's source count is 20 even though this curated demo only includes four
    // thread descendants and 103 separately-related posts. Neither collection
    // is added to the visible reply counter.
    await expect(
      page.locator('[data-store-feed-post="152053690"]').getByRole('button', { name: 'Reply' }),
    ).toContainText('20');
  });

  test('removes an unfollowed conversation from Home', async ({ page }) => {
    await page.goto('/tag/ChineseEVs');
    await page.getByRole('button', { name: 'Unfollow hashtag' }).click();
    await page.goto('/home');

    await expect(page.getByTestId('store-feed-empty')).toContainText('Your feed is empty.');
    await expect(page.locator('[data-store-feed-post]')).toHaveCount(0);
  });

  test('shows standalone replies only when the Home replies experiment is enabled', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('stacky:experimentFlags:v1', JSON.stringify({ homeReplies: true }));
    });
    await page.reload();

    const reply = page.locator('[data-store-feed-post="152052643"]');
    await expect(reply).toBeVisible();
    await expect(reply.getByText('Replying to @totem')).toBeVisible();
    await expect(page.getByTestId('reply-context').first()).toBeVisible();
  });

  test('keeps the composer distinct while reusing the ChineseEVs post cards', async ({ page }) => {
    const composer = page.getByRole('region', { name: 'Create a post' });
    const textbox = page.getByRole('textbox', { name: 'Post text' });

    const composerStyle = await composer.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        borderColor: style.borderTopColor,
        borderWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
      };
    });
    expect(composerStyle.backgroundImage).toContain('linear-gradient');
    expect(composerStyle.borderWidth).toBe('1px');
    expect(composerStyle.borderColor).not.toBe('rgb(255, 255, 255)');
    expect(composerStyle.boxShadow).not.toBe('none');

    const textboxStyle = await textbox.evaluate((element) => {
      const style = getComputedStyle(element);
      const placeholder = getComputedStyle(element, '::placeholder');
      const rgb = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      const luminance = (value: string) => {
        const channels = rgb(value).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const light = Math.max(luminance(placeholder.color), luminance(style.backgroundColor));
      const dark = Math.min(luminance(placeholder.color), luminance(style.backgroundColor));
      return {
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderTopWidth,
        placeholderContrast: (light + 0.05) / (dark + 0.05),
      };
    });
    expect(textboxStyle.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(textboxStyle.borderWidth).toBe('1px');
    expect(textboxStyle.placeholderContrast).toBeGreaterThanOrEqual(4.5);

    await textbox.focus();
    await expect.poll(async () => textbox.evaluate((element) => getComputedStyle(element).borderTopColor))
      .toBe('rgb(47, 127, 118)');

    const homePost = page.locator('[data-store-feed-post="152053690"]').getByTestId('post');
    const postCardStyle = await homePost.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        left: style.borderLeftWidth,
        right: style.borderRightWidth,
        radius: style.borderRadius,
        shadow: style.boxShadow,
      };
    });
    expect(postCardStyle.left).toBe('2px');
    expect(postCardStyle.right).toBe('2px');
    expect(postCardStyle.radius).toBe('10px');
    expect(postCardStyle.shadow).not.toBe('none');
    expect(postCardStyle.background).toBe('rgb(255, 255, 255)');

    // A previous Home-only appearance stored pointer hover in React state,
    // which could remain green after scrolling on mouse + touchscreen laptops.
    await homePost.hover();
    await expect(homePost).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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
    // The collapsed card opens on the annotated relationship span, even when
    // the AI rewrite also contains edits much earlier in the post.
    await expect(editedText.locator('mark[data-range-id="0"]')).toContainText(
      'Only geopolitics and supply chain risk',
    );
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

  test('shows a stable related-post empty state for a post with no relations', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('stacky:experimentFlags:v1', JSON.stringify({ homeReplies: true }));
    });
    await page.reload();

    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    const feedWidthWithRelations = (await page.getByTestId('feed').boundingBox())?.width;

    const ordinaryReply = page.locator('[data-store-feed-post="152052643"]');
    await ordinaryReply.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(ordinaryReply.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
    const relatedEmpty = page.getByTestId('home-related-empty');
    await expect(relatedEmpty.getByText('Related Posts', { exact: true })).toBeVisible();
    await expect(relatedEmpty.getByText('No related posts yet.', { exact: true })).toBeVisible();

    const feedWidthWithoutRelations = (await page.getByTestId('feed').boundingBox())?.width;
    expect(feedWidthWithRelations).toBeDefined();
    expect(feedWidthWithoutRelations).toBeCloseTo(feedWidthWithRelations!, 2);
  });

  test('clears retained related cards when an empty feed is entered', async ({ page }) => {
    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    // Top-nav transitions keep the shell provider and parallel aside alive.
    // The destination has no post that could publish a replacement focus, so
    // feed entry itself must clear Home's retained context.
    await page.getByRole('button', { name: 'Bookmarks' }).click();
    await expect(page).toHaveURL(/\/bookmarks$/);
    await expect(page.getByTestId('store-feed-empty')).toContainText('No bookmarks yet.');
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
    await expect(page.getByText('No related responses for this post.')).toHaveCount(0);
  });

  test('clears retained related cards when a hashtag fails before its feed mounts', async ({ page }) => {
    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    await page.route('https://beta.stacky.social/api/v1/tags/StackyInjectionPost', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Open #StackyInjection hashtag' }).click();

    await expect(page.getByTestId('tag-load-error')).toBeVisible();
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
    await expect(page.getByText('103 posts across all categories')).toHaveCount(0);
  });

  test('keeps the related panel blank when a hashtag timeline is empty', async ({ page }) => {
    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    await page.route('https://beta.stacky.social/api/v1/tags/StackyInjectionPost', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'StackyInjectionPost',
          url: 'https://beta.stacky.social/tags/stackyinjectionpost',
          history: [],
        }),
      }),
    );
    await page.route('https://beta.stacky.social/api/v1/timelines/tag/StackyInjectionPost**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Open #StackyInjection hashtag' }).click();

    await expect(page.getByTestId('api-feed-empty')).toContainText('No posts found.');
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
    await expect(page.getByText('103 posts across all categories')).toHaveCount(0);
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
