import { test, expect } from '@playwright/test';
import {
  gotoFeed,
  sel,
  relatedCards,
  asideCardOrder,
  tooltipCountForCard,
} from './helpers';

// Group/reorder by clicking a related card's category tag (desktop anchors the
// card and clusters same-topic posts around it).
const tagOf = (page: import('@playwright/test').Page, i: number) =>
  relatedCards(page).nth(i).locator(sel.cardCategoryTag).first();

// R-GROUP / R-REORDER — the "more like this" clustering interaction.
test.describe('Grouping & reorder (R-GROUP, R-REORDER)', () => {
  test('R-GROUP-1 / R-REORDER-1: clicking a card tag forms a topic block + "Grouped by" pill', async ({ page }) => {
    await gotoFeed(page);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(0);
    await tagOf(page, 0).click();
    await page.waitForTimeout(400);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(1);
    await expect(page.getByText('Grouped by:')).toBeVisible();
    await expect(page.locator(sel.topicBlockHeader).first()).toBeVisible();
    await expect(page.locator(sel.topicBlockHeader).first()).toHaveText(/\(\d+\)\s*$/);
  });

  test('R-REORDER-6: the block header counts the topic TOTAL (matches + anchor)', async ({ page }) => {
    await gotoFeed(page);
    const others = await tooltipCountForCard(page, 0); // OTHER posts on card 0's topic
    expect(others).not.toBeNull();
    await tagOf(page, 0).click();
    await page.waitForTimeout(400);
    const headerText = await page.locator(sel.topicBlockHeader).first().innerText();
    const n = parseInt(headerText.match(/\((\d+)\)/)![1], 10);
    expect(n).toBe((others as number) + 1); // anchor + all matches
  });

  test('R-GROUP-3 / R-REORDER-8: single anchor — switching topics replaces, never compounds', async ({ page }) => {
    await gotoFeed(page);
    await tagOf(page, 0).click();
    await page.waitForTimeout(300);
    await expect(page.getByRole('button', { name: /Remove .* grouping/i })).toHaveCount(1);
    // Switch to a different card's topic.
    await tagOf(page, 5).click();
    await page.waitForTimeout(400);
    // Still exactly one active grouping (single-anchor invariant).
    await expect(page.getByRole('button', { name: /Remove .* grouping/i })).toHaveCount(1);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(1);
  });

  test('R-REORDER-9: clicking the "Remove" pill clears the grouping', async ({ page }) => {
    await gotoFeed(page);
    await tagOf(page, 0).click();
    await page.waitForTimeout(300);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(1);
    await page.getByRole('button', { name: /Remove .* grouping/i }).click();
    await page.waitForTimeout(300);
    await expect(page.locator(sel.groupedByPill)).toHaveCount(0);
    await expect(page.locator(sel.topicBlockHeader)).toHaveCount(0);
  });

  test('R-REORDER-5: reordering is permanent — clearing does NOT revert to the server order', async ({ page }) => {
    await gotoFeed(page);
    const initial = await asideCardOrder(page);
    // Card 0's topic has 2 matches (≤ the pagination cap), so grouping reorders
    // without hiding any card — the set is stable, only the order changes.
    await tagOf(page, 0).click();
    await page.waitForTimeout(450);
    const grouped = await asideCardOrder(page);
    expect(grouped).not.toEqual(initial); // grouping actually reordered the list
    await page.getByRole('button', { name: /Remove .* grouping/i }).click();
    await page.waitForTimeout(400);
    const afterClear = await asideCardOrder(page);
    expect(afterClear).toEqual(grouped); // order persists — no revert to the original
    expect(afterClear).not.toEqual(initial);
  });

  test('R-GROUP-6 / R-TIP-4: a singleton topic does NOT form a fake block', async ({ page }) => {
    await gotoFeed(page);
    // Find a card whose topic has no other matches ("0 more …").
    let singleton = -1;
    const n = await relatedCards(page).count();
    for (let i = 0; i < n; i++) {
      if ((await tooltipCountForCard(page, i)) === 0) { singleton = i; break; }
    }
    test.skip(singleton < 0, 'no singleton-topic card in this fixture slice');
    await tagOf(page, singleton).click();
    await page.waitForTimeout(400);
    // Anchor may register, but there must be NO block header / footer for a lone post.
    await expect(page.locator(sel.topicBlockHeader)).toHaveCount(0);
    await expect(page.locator(sel.moreLikeThis)).toHaveCount(0);
  });

  test('R-GROUP-2: the clicked card stays in view (no scroll jump) when grouping', async ({ page }) => {
    await gotoFeed(page);
    const card = relatedCards(page).nth(3);
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await card.locator(sel.cardCategoryTag).first().click();
    await page.waitForTimeout(450);
    const box = await card.boundingBox();
    const vh = page.viewportSize()!.height;
    expect(box).not.toBeNull();
    // The anchored card remains within (or very near) the viewport — not yanked away.
    expect(box!.y).toBeGreaterThan(-box!.height);
    expect(box!.y).toBeLessThan(vh);
  });
});
