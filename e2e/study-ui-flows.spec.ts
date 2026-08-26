import { expect, test } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

const firstFocusId = (mockData as any)[0].focusPost.id as string;
const DETAIL_URL = `/AIWorkforce/posts/${firstFocusId}`;

test.describe('Study-ready related posts and composers', () => {
  test('related posts reveal ten cards at a time', async ({ page }) => {
    await page.goto(DETAIL_URL);

    const cards = page.locator('[data-related-card]');
    await expect(cards).toHaveCount(10);

    const loadMore = page.getByTestId('related-load-more');
    await expect(loadMore).toContainText('Load more');
    await loadMore.click();

    await expect(cards).toHaveCount(20);
  });

  test('related-card actions confirm the change and offer Undo', async ({ page }) => {
    await page.goto(DETAIL_URL);

    await page.locator('[data-related-card] [aria-label="Bookmark"]').first().click();

    await expect(page.getByText(/Post saved|Bookmark removed/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/Post saved|Bookmark removed/)).toHaveCount(0);
  });

  test('reply feedback errors preserve the draft and do not block posting', async ({ page }) => {
    await page.route('https://beta.stacky.social:3002/posts/feedback', (route) => route.abort('failed'));
    await page.goto(DETAIL_URL);

    const composer = page.getByPlaceholder('Post your reply').first();
    const draft = 'A study reply whose feedback request will fail safely.';
    await composer.fill(draft);

    await expect(page.getByText('Writing feedback could not load. You can still post this reply.')).toBeVisible();
    await expect(composer).toHaveValue(draft);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const submit = page.getByRole('button', { name: 'Submit' }).first();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText('Reply posted')).toBeVisible();
  });

  test('home composer is multiline and recovers from feedback errors', async ({ page }) => {
    await page.route('https://beta.stacky.social:3002/posts/feedback', (route) => route.abort('failed'));
    await page.goto('/home');

    const composer = page.getByPlaceholder('What do you want to share?');
    await expect(composer).toHaveJSProperty('tagName', 'TEXTAREA');
    const draft = 'A longer home post that keeps working when feedback is unavailable.';
    await composer.fill(draft);

    await expect(page.getByText('Writing feedback could not load. You can still post this draft.')).toBeVisible();
    await expect(composer).toHaveValue(draft);
    await expect(page.getByRole('button', { name: 'Retry feedback' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();
  });

  test('home feedback aligns with the draft text edge', async ({ page }) => {
    await page.route('https://beta.stacky.social:3002/posts/feedback', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        praise: 'The opening is clear.',
        advice: 'Add one supporting example.',
        simulatedReplies: [{ id: 'reply-1', content: 'Which example best supports this?' }],
      }),
    }));
    await page.goto('/home');

    const composer = page.getByPlaceholder('What do you want to share?');
    await composer.fill('A complete draft that should receive aligned writing feedback.');

    const feedbackCopy = page.getByTestId('feedback-copy');
    await expect(feedbackCopy).toBeVisible();
    const composerBox = (await composer.boundingBox())!;
    const feedbackBox = (await feedbackCopy.boundingBox())!;
    const draftInset = await composer.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).paddingLeft),
    );
    expect(Math.abs(feedbackBox.x - (composerBox.x + draftInset))).toBeLessThanOrEqual(1);
  });
});
