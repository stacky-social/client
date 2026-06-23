import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// The research feed at /listy-injection is rendered entirely from local mock
// JSON — no backend needed. Its detail route /listy-injection/posts/[id]
// mirrors a single post.

// First focus-post id from the mock data, used by the detail-view test.
const firstFocusId = (mockData as any)[0].focusPost.id as string;

test.describe('Listy-injection feed', () => {
  test('renders the hashtag header, stats, post cards and interactions', async ({ page }) => {
    await page.goto('/listy-injection');

    // Hashtag header + stat labels.
    await expect(page.getByText('#ChineseEVs')).toBeVisible();
    await expect(page.getByText('Posts', { exact: true })).toBeVisible();
    await expect(page.getByText('Participants', { exact: true })).toBeVisible();
    await expect(page.getByText('Responses', { exact: true })).toBeVisible();

    // At least 2 post cards.
    const cards = page.locator('[data-post-id]');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    // "Read more" affordance (collapsed posts) — present on at least one card.
    await expect(page.getByText('Read more').first()).toBeVisible();

    // Interaction buttons (Reply / Like / Bookmark) — at least one of each.
    await expect(page.getByRole('button', { name: 'Reply' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Like' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bookmark' }).first()).toBeVisible();
  });

  test('opens a post detail view without an error boundary', async ({ page }) => {
    await page.goto(`/listy-injection/posts/${firstFocusId}`);

    // No error boundary / not-found state.
    await expect(page.getByText(/Application error/i)).toHaveCount(0);
    await expect(page.getByText(/not found in mock data/i)).toHaveCount(0);

    // The focus post renders with its interaction controls + substantial text.
    await expect(page.getByRole('button', { name: 'Like' }).first()).toBeVisible();
    const bodyText = (await page.locator('body').innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(200);
  });
});
