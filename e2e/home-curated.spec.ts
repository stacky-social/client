import { expect, test } from '@playwright/test';
import scaleDemo from '../src/app/FakeData/scale-demo.json';

const timelineRoots = (scaleDemo as any[]).filter((entry) => entry.timelineRoot === true);
const timelineIds = timelineRoots.map((entry) => entry.focusPost.id as string);
const topicIds = new Map(
  timelineRoots.map((entry) => [entry.topicId as string, entry.focusPost.id as string]),
);
const rgQuote = timelineRoots.find(
  (entry) => entry.focusPost.sourceKey === 'nyt_ai-work-force-training-job-losses.json::152115016',
)!;

test.describe('Curated Home', () => {
  test('shows every scale-demo timeline root in a session-stable shuffled order', async ({ page }) => {
    await page.goto('/home');
    const cards = page.locator('[data-store-feed-post]');
    await expect(cards).toHaveCount(timelineIds.length);

    for (const postId of topicIds.values()) {
      await expect(page.locator(`[data-store-feed-post="${postId}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-store-feed-post="143195604"]')).toHaveCount(0);

    const initialOrder = await cards.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.storeFeedPost),
    );
    expect(initialOrder).not.toEqual(timelineIds);

    await page.goto('/search');
    await page.goto('/home');
    await expect(cards).toHaveCount(timelineIds.length);
    const restoredOrder = await cards.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.storeFeedPost),
    );
    expect(restoredOrder).toEqual(initialOrder);
  });

  test('keeps only production navigation actions in the top bar', async ({ page }) => {
    await page.goto('/home');
    const nav = page.getByTestId('top-nav');

    await expect(nav.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Bookmarks' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Liked' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '#ChineseEVs' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '#AIWorkforce' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Experiment settings' })).toHaveCount(0);
  });

  test('uses the original focus copy, embeds its article, and parses NYT dates', async ({ page }) => {
    // Reproduce the intermittent path: older builds persisted the response-role
    // copy for this id. The current seed must refresh immutable corpus fields
    // without discarding participant-owned state.
    await page.addInitScript(({ postId, quotedId }) => {
      localStorage.setItem('stacky:localStore:v1', JSON.stringify({
        posts: {
          [postId]: {
            id: postId,
            content: '<p>Universal basic income (UBI) is a good idea.</p>',
            in_reply_to_id: quotedId,
          },
        },
        accounts: {}, liked: [], bookmarked: [], following: [], followingTags: [], comments: {},
      }));
    }, { postId: rgQuote.focusPost.id, quotedId: rgQuote.focusPost.quotedPost.id });
    await page.goto('/home');
    const card = page.locator(`[data-store-feed-post="${rgQuote.focusPost.id}"]`);
    await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));

    await expect(card).toContainText(rgQuote.focusPost.plainText);
    await expect(card).not.toContainText('Universal basic income (UBI)');
    await expect(card.getByTestId('reply-context')).toHaveCount(0);
    await expect(card.getByTestId('quoted-post')).toContainText('Quoted article');
    await expect(card.getByTestId('quoted-post')).toContainText('New York Times');
    await expect(card).not.toContainText('Date unavailable');

    await card.getByTestId('post').click();
    await expect(page).toHaveURL(new RegExp(`/AIWorkforce/posts/${rgQuote.focusPost.id}$`));
    await expect(page.locator(`[data-post-id="${rgQuote.focusPost.id}"]`).first()).toContainText(
      rgQuote.focusPost.plainText,
    );
    await expect(page.getByText(rgQuote.focusPost.quotedPost.title, { exact: true })).toHaveCount(0);
    await expect(page.locator(`[data-post-id="${rgQuote.focusPost.id}"]`).first().getByTestId('quoted-post'))
      .toContainText('New York Times');
  });
});
