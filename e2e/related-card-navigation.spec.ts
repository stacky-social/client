import { test, expect } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

// Regression tests for the related-card interaction model on the ChineseEVs
// detail view (RelatedStacks.tsx). These guard the fixes in commit
// "Make related-card top strip clickable and fix broken reply avatar":
//
//   A. The WHOLE related card is a navigation target — including the top strip
//      (relation tags rightward), which previously fell through to a bare
//      <Paper> with no onClick and did nothing. Clicking it now opens the post.
//   B. The card's interactive controls must NOT navigate: a category tag click
//      groups the panel, and an interaction control (Favourites) toggles state.
//      Both rely on stopPropagation so the card-level navigate never fires.
//   C. The reply composer avatar no longer falls back to the literal string
//      'defaultAvatarUrl', which used to resolve to /ChineseEVs/posts/
//      defaultAvatarUrl and spam the server with spurious route renders.
//
// The feed renders from local mock JSON (no backend / no auth).

const firstFocusId = (mockData as any)[0].focusPost.id as string;
const DETAIL_URL = `/ChineseEVs/posts/${firstFocusId}`;

// A related card in the aside: the inner Mantine <Paper> carries data-post-id;
// the outer wrapper carries data-related-card.
const relatedPaper = '[data-related-card] [data-post-id]';

test.describe('Related-card navigation & interaction guards', () => {
  test('A: clicking the top-right strip of a related card opens that post', async ({ page }) => {
    await page.goto(DETAIL_URL);

    const card = page.locator(relatedPaper).first();
    await expect(card).toBeVisible();

    const targetId = await card.getAttribute('data-post-id');
    expect(targetId, 'related card should carry a post id').toBeTruthy();
    // It links to a DIFFERENT post than the one we're viewing.
    expect(targetId).not.toBe(firstFocusId);

    const box = await card.boundingBox();
    expect(box).not.toBeNull();

    // Click the top strip — the old dead zone: right side, inside the ~40px top
    // band where the relation tags float. Not over the tags (top-left) or any
    // content text (below the band).
    await card.click({ position: { x: box!.width - 25, y: 8 } });

    await expect(page).toHaveURL(new RegExp(`/ChineseEVs/posts/${targetId}(\\?|$)`));
  });

  test('B1: clicking a category tag groups the panel and does NOT navigate', async ({ page }) => {
    await page.goto(DETAIL_URL);

    const tag = page.locator('[data-related-card] .related-tag-text').first();
    await expect(tag).toBeVisible();

    // No grouping active yet. (T4 removed the "Grouped by:" pill; grouping is now
    // signalled by the inline anchor indicator, data-testid "active-group-anchor".)
    const groupIndicator = page.getByTestId('active-group-anchor');
    await expect(groupIndicator).toHaveCount(0);

    const urlBefore = page.url();
    await tag.click();

    // The tag's own action fires (panel groups) ...
    await expect(groupIndicator.first()).toBeVisible();
    // ... and the card-level navigation did NOT (stopPropagation held).
    expect(page.url()).toBe(urlBefore);
  });

  test('B2: clicking a related-card interaction control does NOT navigate', async ({ page }) => {
    await page.goto(DETAIL_URL);

    const fav = page.locator('[data-related-card] [aria-label="Favourites"]').first();
    await expect(fav).toBeVisible();

    const urlBefore = page.url();
    await fav.click();
    await page.waitForTimeout(300);

    // Favourite toggles locally; it must never trigger a post navigation.
    expect(page.url()).toBe(urlBefore);
  });

  test('C: the reply composer never requests the broken defaultAvatarUrl', async ({ page }) => {
    const badRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('defaultAvatarUrl')) badRequests.push(r.url());
    });

    await page.goto(DETAIL_URL);

    // The reply composer (ReplySection) is on the detail view.
    await expect(page.getByPlaceholder('Post your reply')).toBeVisible();
    await page.waitForTimeout(500);

    expect(
      badRequests,
      'the reply avatar must not resolve to the literal defaultAvatarUrl',
    ).toEqual([]);
  });
});
