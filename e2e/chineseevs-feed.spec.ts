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

  test('shows contextual AI edits in place and allows the related card to expand', async ({ page }) => {
    await page.goto('/ChineseEVs');

    const aside = page.getByTestId('col-aside');
    const badge = aside.getByRole('button', { name: 'Modified by AI' }).first();
    await expect(badge).toBeVisible();
    const card = badge.locator('xpath=ancestor::*[@data-post-id][1]');
    const beforeHover = await card.boundingBox();
    const editedText = card.locator('[data-ai-edited-default]');
    const inlineDiff = card.locator('[data-ai-inline-diff]');
    // The published excerpt is windowed around the relation span while the
    // comparison is windowed around edits, so the two compact windows need not
    // contain the same first insertion. Verify the edited layer itself is the
    // visible, substantive default; the diff assertions below cover edits.
    const editedValue = (await editedText.innerText()).trim();
    expect(editedValue.length).toBeGreaterThan(20);
    await expect(editedText).toHaveAttribute('aria-hidden', 'false');
    const editedContentHeight = await editedText.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().height;
    });
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'true');

    await badge.hover();

    await expect(aside.getByRole('note')).toHaveCount(0);
    await expect(editedText).toHaveAttribute('aria-hidden', 'true');
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'false');
    await expect(inlineDiff.locator('del').first()).toBeVisible();
    await expect(inlineDiff.locator('ins').first()).toBeVisible();
    await expect(inlineDiff.locator('mark').first()).toBeVisible();
    await expect(card.locator('[data-related-card-content]')).toHaveAttribute(
      'data-ai-edit-presentation',
      'inline-redline',
    );
    const diffContentHeight = await inlineDiff.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().height;
    });
    const afterHover = await card.boundingBox();
    expect(beforeHover).not.toBeNull();
    expect(afterHover).not.toBeNull();
    expect(afterHover!.width).toBeCloseTo(beforeHover!.width, 2);
    expect(afterHover!.height).toBeGreaterThanOrEqual(beforeHover!.height);
    expect(diffContentHeight).toBeGreaterThanOrEqual(editedContentHeight - 1);

    // Keyboard users get the same in-card treatment and can dismiss it.
    await page.keyboard.press('Escape');
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'true');
    await expect(editedText).toHaveAttribute('aria-hidden', 'false');
    await badge.focus();
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'false');
    await page.keyboard.press('Escape');
    await expect(inlineDiff).toHaveAttribute('aria-hidden', 'true');

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
