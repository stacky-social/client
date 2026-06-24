import { test, expect } from '@playwright/test';
import { gotoFeed, sel, relatedCards } from './helpers';

const isTransparent = (bg: string) => bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';

// R-HOVER — hovering a related card cross-highlights the focus post and dims
// the sibling cards.
test.describe('Cross-highlight & sibling dim (R-HOVER)', () => {
  test('R-HOVER-4: focus-post marks exist but are transparent at rest', async ({ page }) => {
    await gotoFeed(page);
    const marks = page.locator(`${sel.activePost} ${sel.rangeMark}`);
    expect(await marks.count()).toBeGreaterThan(0);
    const litAtRest = await marks.evaluateAll((els) =>
      els.filter((e) => {
        const b = getComputedStyle(e).backgroundColor;
        return b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent';
      }).length,
    );
    expect(litAtRest).toBe(0);
  });

  test('R-HOVER-1: hovering a related card paints colored marks on the focus post', async ({ page }) => {
    await gotoFeed(page);
    await relatedCards(page).first().hover();
    await page.waitForTimeout(400);
    const lit = await page
      .locator(`${sel.activePost} ${sel.rangeMark}`)
      .evaluateAll((els) =>
        els.filter((e) => !['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor)).length,
      );
    expect(lit).toBeGreaterThan(0);
  });

  test('R-HOVER-2: hovering a card dims the other cards', async ({ page }) => {
    await gotoFeed(page);
    const cards = relatedCards(page);
    await cards.first().hover();
    await page.waitForTimeout(400);
    const hovered = parseFloat(await cards.first().evaluate((e) => getComputedStyle(e).opacity));
    const other = parseFloat(await cards.nth(2).evaluate((e) => getComputedStyle(e).opacity));
    expect(hovered).toBeGreaterThan(0.9);
    expect(other).toBeLessThan(0.9);
  });

  test('R-HOVER-3: leaving the card restores full opacity', async ({ page }) => {
    await gotoFeed(page);
    const cards = relatedCards(page);
    await cards.first().hover();
    await page.waitForTimeout(300);
    // Stepped move crosses the aside boundary so mouseleave actually fires.
    await page.mouse.move(5, 300, { steps: 10 });
    await page.waitForTimeout(550);
    const other = parseFloat(await cards.nth(2).evaluate((e) => getComputedStyle(e).opacity));
    expect(other).toBeGreaterThan(0.9);
    const stillLit = await page
      .locator(`${sel.activePost} ${sel.rangeMark}`)
      .evaluateAll((els) =>
        els.filter((e) => !['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor)).length,
      );
    expect(stillLit).toBe(0); // marks faded back to transparent
  });
});
