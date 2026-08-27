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
    await expect(page.getByText('Latest', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Timeline sorted by latest activity')).toHaveCount(0);
    await expect(page.getByTestId('reply-context')).toHaveCount(0);
    await expect(page.locator('[data-store-feed-post="152052643"]')).toHaveCount(0);
    // The count is an affordance: all four replies it promises can be opened in
    // the thread. Separately-related posts are never added to this number.
    await expect(
      page.locator('[data-store-feed-post="152053690"]').getByRole('button', { name: 'Reply' }),
    ).toContainText('4');
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
        rightColor: style.borderRightColor,
        topLeftRadius: style.borderTopLeftRadius,
        topRightRadius: style.borderTopRightRadius,
        bottomRightRadius: style.borderBottomRightRadius,
        shadow: style.boxShadow,
      };
    });
    expect(postCardStyle.left).toBe('2px');
    expect(postCardStyle.right).toBe('2px');
    expect(postCardStyle.rightColor).toBe('rgba(0, 0, 0, 0)');
    expect(postCardStyle.topLeftRadius).toBe('10px');
    expect(postCardStyle.topRightRadius).toBe('0px');
    expect(postCardStyle.bottomRightRadius).toBe('0px');
    expect(postCardStyle.shadow).not.toBe('none');
    expect(postCardStyle.background).toBe('rgb(255, 255, 255)');

    // A previous Home-only appearance stored pointer hover in React state,
    // which could remain green after scrolling on mouse + touchscreen laptops.
    await homePost.hover();
    await expect(homePost).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('keeps writing feedback under the aligned composer instead of taking over the related pane', async ({ page }) => {
    await page.route('**/posts/feedback', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        praise: 'Your main point is clear.',
        advice: 'Name the source you want readers to check.',
        simulatedReplies: [],
      }),
    }));

    const focusedFeedPost = page.locator('[data-store-feed-post="152053690"]');
    await focusedFeedPost.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(page.locator('[data-related-focus-post-id="152053690"]').first()).toBeVisible();

    const composer = page.getByRole('region', { name: 'Create a post' });
    const draft = composer.getByRole('textbox', { name: 'Post text' });
    await draft.fill(
      'Battery manufacturing and supply chain evidence are changing quickly.',
    );

    await expect(composer.getByText('Your main point is clear.')).toBeVisible();
    await expect(page.getByTestId('col-aside').getByText('Your main point is clear.')).toHaveCount(0);
    await expect(page.getByTestId('col-aside').locator('[data-related-card]').first()).toBeVisible();
    await expect(page.getByTestId('col-aside').locator('[data-related-focus-post-id^="draft-"]').first()).toBeVisible();

    await draft.fill('');
    await expect(page.locator('[data-related-focus-post-id="152053690"]').first()).toBeVisible();

    const composerBox = (await composer.boundingBox())!;
    const postBox = (await page.locator('[data-store-feed-post]').first().getByTestId('post').boundingBox())!;
    expect(Math.abs(composerBox.width - postBox.width)).toBeLessThanOrEqual(1);
  });

  test('repairs a stale persisted reply count from the visible thread graph', async ({ page }) => {
    await page.evaluate(() => {
      const key = 'stacky:localStore:v1';
      const state = JSON.parse(localStorage.getItem(key) || 'null');
      // Current persistence stores only participant-owned deltas. Simulate the
      // older full-fixture blob with the smallest stale override needed here.
      state.posts['152053690'] = { replies_count: 123 };
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();

    await expect(
      page.locator('[data-store-feed-post="152053690"]').getByRole('button', { name: 'Reply' }),
    ).toContainText('4');
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
    // The collapsed reading window begins at the annotated passage, while the
    // AI edit is earlier in the post. Its badge must not leak into this view.
    await expect(badge).toHaveCount(0);
    // The collapsed card opens on the annotated relationship span, even when
    // the AI rewrite also contains edits much earlier in the post.
    await expect(editedText.locator('mark[data-range-id="0"]')).toContainText(
      'Only geopolitics and supply chain risk',
    );
    await michaelCard.getByRole('button', { name: 'Read more' }).click();
    await expect(badge).toBeVisible();
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'true');
    const beforeHover = await michaelCard.boundingBox();
    const relationshipMark = editedText.locator('mark[data-range-id="0"]');
    await expect(relationshipMark).toBeVisible();

    await badge.hover();

    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'false');
    await expect(editedText).toHaveAttribute('aria-hidden', 'true');
    // The redline replaces the published paragraph in place and carries its
    // interactive relationship highlight into the tracked text.
    await expect(relationshipMark).toBeHidden();
    await expect(inlineDiff.locator('mark[data-range-id="0"]')).toBeVisible();
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
    expect(afterHover!.height).toBeGreaterThanOrEqual(beforeHover!.height);
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
    await expect(relatedEmpty.getByText('Related posts', { exact: true })).toBeVisible();
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

    await page.route('https://beta.stacky.social/api/v1/timelines/tag/StackyInjectionPost**', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Filter posts by #StackyInjection' }).click();

    await expect(page.getByText('Server search is unavailable. Showing results saved in this app.')).toBeVisible();
    await expect(page).toHaveURL(/\/search\?q=%23StackyInjection&type=posts&entity=%23StackyInjection$/);
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
    await page.getByRole('button', { name: 'Filter posts by #StackyInjection' }).click();

    await expect(page.getByText('No posts found for #StackyInjection.')).toBeVisible();
    await expect(page).toHaveURL(/\/search\?q=%23StackyInjection&type=posts&entity=%23StackyInjection$/);
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
