import { expect, test } from '@playwright/test';
import scaleDemo from '../src/app/FakeData/scale-demo.json';

const timelineRoots = (scaleDemo as any[]).filter((entry) => entry.timelineRoot === true);
const timelineIds = timelineRoots.map((entry) => entry.focusPost.id as string);
const topicIds = new Map(
  timelineRoots.map((entry) => [entry.topicId as string, entry.focusPost.id as string]),
);

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
});
