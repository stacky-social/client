import { expect, test } from '@playwright/test';
import scaleDemo from '../src/app/FakeData/scale-demo.json';

const curatedEntries = scaleDemo as any[];
const timelineRoots = curatedEntries.filter((entry) => entry.timelineRoot === true);
const annotatedRoot = timelineRoots.find((entry) => entry.relatedPosts?.length > 0)!;
const focusId = annotatedRoot.focusPost.id as string;
const directReplyIds = (annotatedRoot.replies as any[])
  .filter((reply) => reply.inReplyToId === focusId)
  .map((reply) => reply.id as string);
const firstReplyId = directReplyIds[0];
const modifiedRoot = timelineRoots.find((entry) =>
  (entry.relatedPosts as any[]).slice(0, 10).some((post) =>
    post.rewrite?.significant && post.content.length > 450,
  ),
)!;
const modifiedRelated = (modifiedRoot.relatedPosts as any[])
  .slice(0, 10)
  .find((post) => post.rewrite?.significant && post.content.length > 450)!;

test.describe('Home timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  });

  test('renders every corrected scale-demo timeline root by default', async ({ page }) => {
    await expect(page.locator('[data-store-feed-post]')).toHaveCount(timelineRoots.length);
    await expect(page.getByText('Curated conversations and posts from accounts you follow')).toBeVisible();
    await expect(page.getByText('Latest', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Timeline sorted by latest activity')).toHaveCount(0);
    await expect(page.locator(`[data-store-feed-post="${firstReplyId}"]`)).toHaveCount(0);
    await expect(
      page.locator(`[data-store-feed-post="${focusId}"]`).getByRole('button', { name: 'Reply' }),
    ).toContainText(String(directReplyIds.length));
  });

  test('does not mix the legacy Chinese EV fixture into curated Home', async ({ page }) => {
    await page.goto('/tag/ChineseEVs');
    const follow = page.getByRole('button', { name: 'Follow hashtag', exact: true });
    if (await follow.count()) await follow.click();
    await page.goto('/home');

    await expect(page.locator('[data-store-feed-post]')).toHaveCount(timelineRoots.length);
    await expect(page.locator('[data-store-feed-post="143195604"]')).toHaveCount(0);
  });

  test('shows standalone replies only when the Home replies experiment is enabled', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('stacky:experimentFlags:v1', JSON.stringify({ homeReplies: true }));
    });
    await page.reload();

    const reply = page.locator(`[data-store-feed-post="${firstReplyId}"]`);
    await expect(reply).toBeVisible();
    await expect(reply.getByText(/Replying to @/)).toBeVisible();
    await expect(page.getByTestId('reply-context').first()).toBeVisible();
  });

  test('keeps the composer distinct while reusing the curated post cards', async ({ page }) => {
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

    const homePostWrapper = page.locator(`[data-store-feed-post="${focusId}"]`);
    await homePostWrapper.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const homePost = homePostWrapper.getByTestId('post');
    await expect(homePost).toHaveAttribute('data-active', 'true');
    const postCardStyle = await homePost.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        left: style.borderLeftWidth,
        right: style.borderRightWidth,
        topLeftRadius: style.borderTopLeftRadius,
        shadow: style.boxShadow,
      };
    });
    expect(postCardStyle.left).toBe('2px');
    expect(postCardStyle.right).toBe('2px');
    expect(postCardStyle.topLeftRadius).toBe('10px');
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

    const focusedFeedPost = page.locator(`[data-store-feed-post="${focusId}"]`);
    await focusedFeedPost.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(page.locator(`[data-related-focus-post-id="${focusId}"]`).first()).toBeVisible();

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
    await expect(page.getByTestId('col-aside').locator('[data-related-card]').first()).toBeVisible();
    await expect(page.getByTestId('col-aside').locator('[data-related-focus-post-id^="draft-"]')).toHaveCount(0);

    const composerBox = (await composer.boundingBox())!;
    const postBox = (await page.locator('[data-store-feed-post]').first().getByTestId('post').boundingBox())!;
    expect(Math.abs(composerBox.width - postBox.width)).toBeLessThanOrEqual(1);
  });

  test('repairs a stale persisted reply count from the visible thread graph', async ({ page }) => {
    await page.evaluate((targetId) => {
      const key = 'stacky:localStore:v1';
      const state = JSON.parse(localStorage.getItem(key) || 'null');
      // Current persistence stores only participant-owned deltas. Simulate the
      // older full-fixture blob with the smallest stale override needed here.
      state.posts[targetId] = { replies_count: 123 };
      localStorage.setItem(key, JSON.stringify(state));
    }, focusId);
    await page.reload();

    await expect(
      page.locator(`[data-store-feed-post="${focusId}"]`).getByRole('button', { name: 'Reply' }),
    ).toContainText(String(directReplyIds.length));
  });

  test('shows real related responses and AI edits for an annotated focus post', async ({ page }) => {
    const modifiedFocusId = modifiedRoot.focusPost.id as string;
    const focus = page.locator(`[data-store-feed-post="${modifiedFocusId}"]`);
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]')).toHaveCount(10);

    const modifiedCard = page.locator(`[data-post-id="${modifiedRelated.id}"]`);
    const badge = modifiedCard.getByRole('button', { name: 'Modified by AI' });
    const editedText = modifiedCard.locator('[data-ai-edited-default]');
    const inlineDiff = modifiedCard.locator('[data-ai-inline-diff]');
    await expect(editedText.locator('mark[data-range-id="0"]')).toBeVisible();
    await modifiedCard.getByRole('button', { name: 'Read more' }).click();
    await expect(badge).toBeVisible();
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'true');
    const beforeHover = await modifiedCard.boundingBox();
    const relationshipMark = editedText.locator('mark[data-range-id="0"]');
    await expect(relationshipMark).toBeVisible();

    await badge.hover();

    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'false');
    await expect(editedText).toHaveAttribute('aria-hidden', 'true');
    // The redline replaces the published paragraph in place and carries its
    // interactive relationship highlight into the tracked text.
    await expect(relationshipMark).toBeHidden();
    await expect(inlineDiff.locator('mark[data-range-id="0"]').first()).toBeVisible();
    const deletedText = (await inlineDiff.locator('del').allTextContents()).join('');
    const insertedText = (await inlineDiff.locator('ins').allTextContents()).join('');
    expect(deletedText.length).toBeGreaterThan(0);
    expect(insertedText.length).toBeGreaterThan(0);
    const afterHover = await modifiedCard.boundingBox();
    expect(afterHover?.width).toBeCloseTo(beforeHover!.width, 2);
    expect(afterHover!.height).toBeGreaterThanOrEqual(beforeHover!.height);
  });

  test('shows a stable related-post empty state for a participant post with no relations', async ({ page }) => {
    const focus = page.locator(`[data-store-feed-post="${focusId}"]`);
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(page.locator('[data-related-card]').first()).toBeVisible();
    const feedWidthWithRelations = (await page.getByTestId('feed').boundingBox())?.width;

    await page.getByRole('textbox', { name: 'Post text' }).fill('A participant post without related data');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const ordinaryPost = page.locator('[data-store-feed-post^="local-"]').first();
    await ordinaryPost.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(ordinaryPost.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
    const relatedEmpty = page.getByTestId('home-related-empty');
    await expect(relatedEmpty.getByText('Related posts', { exact: true })).toBeVisible();
    await expect(relatedEmpty.getByText('No related posts yet.', { exact: true })).toBeVisible();

    const feedWidthWithoutRelations = (await page.getByTestId('feed').boundingBox())?.width;
    expect(feedWidthWithRelations).toBeDefined();
    expect(feedWidthWithoutRelations).toBeCloseTo(feedWidthWithRelations!, 2);
  });

  test('clears retained related cards when an empty feed is entered', async ({ page }) => {
    const focus = page.locator(`[data-store-feed-post="${focusId}"]`);
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    // The route remains available even though personal-collection shortcuts
    // no longer occupy the production top bar.
    await page.goto('/bookmarks');
    await expect(page).toHaveURL(/\/bookmarks$/);
    await expect(page.getByTestId('store-feed-empty')).toContainText('No bookmarks yet.');
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
    await expect(page.getByText('No related responses for this post.')).toHaveCount(0);
  });

  test('clears retained related cards when Search is entered', async ({ page }) => {
    const focus = page.locator(`[data-store-feed-post="${focusId}"]`);
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-related-card]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/\/search$/);
    await expect(page.locator('[data-related-card]')).toHaveCount(0);
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
