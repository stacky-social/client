import { expect, test } from '@playwright/test';

test.describe('post deletion', () => {
  test('only offers deletion on a local post I authored and removes it everywhere', async ({ page }) => {
    await page.goto('/home');

    const text = `Delete this local post ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Post text' }).fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Post created successfully.')).toBeVisible();

    const created = page.locator('[data-store-feed-post]').filter({ hasText: text }).first();
    await expect(created).toBeVisible();
    await expect(created.getByRole('button', { name: 'More post actions' })).toHaveCount(1);

    // Seeded content belongs to other users and must not expose a destructive action.
    const seeded = page.locator('[data-store-feed-post]').filter({ hasNotText: text }).first();
    await expect(seeded.getByRole('button', { name: 'More post actions' })).toHaveCount(0);

    // Personal-list references are deleted atomically with the status.
    await created.getByRole('button', { name: 'Like', exact: true }).click();
    await created.getByRole('button', { name: 'Bookmark', exact: true }).click();

    await created.getByRole('button', { name: 'More post actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete post' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete post?' });
    await expect(dialog).toContainText('This action can’t be undone.');

    // Cancel is non-destructive.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(created).toBeVisible();

    await created.getByRole('button', { name: 'More post actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete post' }).click();
    await page.getByRole('dialog', { name: 'Delete post?' }).getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('Post deleted', { exact: true })).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);

    await page.goto('/liked');
    await expect(page.getByText(text)).toHaveCount(0);
    await page.goto('/bookmarks');
    await expect(page.getByText(text)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(text)).toHaveCount(0);
  });

  test('deletes my post from its full post view and returns Home', async ({ page }) => {
    await page.goto('/home');

    const text = `Delete this full-view post ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Post text' }).fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    const created = page.locator('[data-store-feed-post]').filter({ hasText: text });
    await expect(created).toHaveCount(1);
    const postId = await created.getAttribute('data-post-id');
    expect(postId).toBeTruthy();
    await created.getByText(text, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${postId}$`));

    const focusedPost = page.locator(`[data-testid="post"][data-post-id="${postId}"]`);
    await focusedPost.getByRole('button', { name: 'More post actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete post' }).click();
    await page.getByRole('dialog', { name: 'Delete post?' }).getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText(text)).toHaveCount(0);
  });
});
