import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

const firstFocusId = (mockData as any)[0].focusPost.id as string;

test.describe('study-mode local flows', () => {
  test('finds #ChineseEVs as a clearly labeled hashtag result', async ({ page }) => {
    await page.goto('/search');

    const search = page.getByLabel('Search hashtags, people, and posts');
    await search.fill('#ChineseEVs');

    await expect(page.getByText('Hashtags', { exact: true })).toBeVisible();
    const hashtag = page.getByRole('button', { name: 'Open #ChineseEVs hashtag' });
    await expect(hashtag).toContainText('#ChineseEVs');
    await hashtag.click();
    await expect(page).toHaveURL(/\/tag\/ChineseEVs$/);
    await expect(page.getByRole('button', { name: 'Follow hashtag' })).toBeVisible();
  });

  test('opens a user-created home post and its reply on local detail routes', async ({ page }) => {
    await page.goto('/home');

    const postText = 'A participant-created study post';
    await page.getByRole('textbox', { name: 'Post text' }).fill(postText);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Post created successfully.')).toBeVisible();

    const createdCard = page.locator('[data-post-id^="local-"]:not([data-post-id^="local-reply-"])').first();
    await expect(createdCard).toContainText(postText);
    const createdId = await createdCard.getAttribute('data-post-id');
    expect(createdId).toBeTruthy();

    await createdCard.locator('[role="button"]').first().click();
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${createdId}$`));
    await expect(page.getByText(postText)).toBeVisible();

    await page.getByPlaceholder('Post your reply').fill('Local reply');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Reply posted', { exact: true })).toBeVisible();

    const replyCard = page.locator('[data-post-id^="local-reply-"]').first();
    await expect(replyCard).toContainText('Local reply');
    const replyId = await replyCard.getAttribute('data-post-id');
    expect(replyId).toBeTruthy();

    await replyCard.locator('[role="button"]').first().click();
    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${replyId}$`));
    await expect(page.getByText(postText)).toBeVisible();
    await expect(page.getByText('Local reply')).toBeVisible();
  });

  test('increments a seeded post reply count once and keeps it after reload', async ({ page }) => {
    const sourceCount = (mockData as any)[0].focusPost.replies_count as number;
    await page.goto(`/ChineseEVs/posts/${firstFocusId}`);

    const focusCard = page.locator(`[data-post-id="${firstFocusId}"]`).first();
    const replyCount = focusCard.getByRole('button', { name: 'Reply' });
    await expect(replyCount).toContainText(String(sourceCount));

    await page.getByPlaceholder('Post your reply').first().fill('Counted.');
    await page.getByRole('button', { name: 'Submit' }).first().click();
    await expect(page.getByText('Reply posted', { exact: true })).toBeVisible();
    await expect(replyCount).toContainText(String(sourceCount + 1));

    await page.reload();
    const reloadedFocus = page.locator(`[data-post-id="${firstFocusId}"]`).first();
    await expect(reloadedFocus.getByRole('button', { name: 'Reply' })).toContainText(String(sourceCount + 1));
  });

  test('like and bookmark confirmations offer working single-step Undo', async ({ page }) => {
    await page.goto(`/ChineseEVs/posts/${firstFocusId}`);

    await page.getByRole('button', { name: 'Like', exact: true }).first().click();
    const likeNotice = page.getByText(/Post liked|Like removed/, { exact: true });
    await expect(likeNotice).toBeVisible();
    await page.getByRole('button', { name: /Undo (post liked|like removed)/i }).click();
    await expect(likeNotice).toHaveCount(0);

    await page.getByRole('button', { name: 'Bookmark', exact: true }).first().click();
    const bookmarkNotice = page.getByText(/Post saved|Bookmark removed/, { exact: true });
    await expect(bookmarkNotice).toBeVisible();
    await page.getByRole('button', { name: /Undo (post saved|bookmark removed)/i }).click();
    await expect(bookmarkNotice).toHaveCount(0);
  });
});
