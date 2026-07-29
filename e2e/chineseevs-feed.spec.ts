import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// The research feed at /ChineseEVs calls a simulated backend route backed by
// the local fixture, so no external server is needed. Its detail route
// /ChineseEVs/posts/[id] mirrors a single post.

// First focus-post id from the mock data, used by the detail-view test.
const firstFocusId = (mockData as any)[0].focusPost.id as string;

test.describe('ChineseEVs feed', () => {
  test('renders the hashtag header, stats, post cards and interactions', async ({ page }) => {
    const firstPageResponse = page.waitForResponse((response) =>
      response.url().includes('/api/demo/timelines/chinese-evs') && response.status() === 200
    );
    await page.goto('/ChineseEVs');
    const firstPage = await (await firstPageResponse).json();

    // The simulated backend returns a bounded cursor page, not the whole fixture.
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(firstPage.stats.posts).toBeGreaterThan(2);

    // Hashtag header + stat labels.
    await expect(page.getByText('#ChineseEVs')).toBeVisible();
    await expect(page.getByText('Posts', { exact: true })).toBeVisible();
    await expect(page.getByText('Participants', { exact: true })).toBeVisible();
    await expect(page.getByText('Responses', { exact: true })).toBeVisible();

    // At least 2 post cards.
    const cards = page.locator('[data-post-id]');
    await expect(cards.first()).toBeVisible();
    await expect(cards.nth(1)).toBeVisible();

    // "Read more" affordance (collapsed posts) — present on at least one card.
    await expect(page.getByText('Read more').first()).toBeVisible();

    // Interaction buttons (Reply / Like / Bookmark) — at least one of each.
    await expect(page.getByRole('button', { name: 'Reply' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Like' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bookmark' }).first()).toBeVisible();
  });

  test('explains contextual AI edits with track-changes markup only in the related panel', async ({ page }) => {
    await page.goto('/ChineseEVs');

    const aside = page.getByTestId('col-aside');
    const badge = aside.getByRole('button', { name: 'Modified by AI' }).first();
    await expect(badge).toBeVisible();
    await badge.hover();

    const disclosure = aside.getByRole('note', { name: 'Changes made by AI' });
    await expect(disclosure).toBeVisible();
    await expect(disclosure.locator('del').first()).toBeVisible();
    await expect(disclosure.locator('ins').first()).toBeVisible();
    await expect(disclosure).toContainText('original post is preserved');

    // Keyboard users get the same explanation and can dismiss it predictably.
    await page.keyboard.press('Escape');
    await expect(disclosure).toBeHidden();
    await badge.focus();
    await expect(disclosure).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(disclosure).toBeHidden();

    // Full post content remains an ordinary post; AI provenance belongs only
    // to compact related cards where the missing context needs explanation.
    await page.goto('/ChineseEVs/posts/149288649?from=143195604');
    await expect(page.getByTestId('feed').locator('[data-ai-edit]')).toHaveCount(0);
  });

  test('opens a post detail view without an error boundary', async ({ page }) => {
    await page.goto(`/ChineseEVs/posts/${firstFocusId}`);

    // No error boundary / not-found state.
    await expect(page.getByText(/Application error/i)).toHaveCount(0);
    await expect(page.getByText(/not found in mock data/i)).toHaveCount(0);

    // The focus post renders with its interaction controls + substantial text.
    await expect(page.getByRole('button', { name: 'Like' }).first()).toBeVisible();
    const bodyText = (await page.locator('body').innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(200);
  });
});
