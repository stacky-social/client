import { expect, test } from '@playwright/test';
import mockData from '../src/app/FakeData/chinese-evs.json';

const focusId = (mockData as any)[0].focusPost.id as string;
const DETAIL_URL = `/ChineseEVs/posts/${focusId}`;

test.describe('focus phrase integration', () => {
  test('related-span hover restores its full focus passage without a layout shift', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const focus = page.locator('[data-testid="focus-reveal"]').first();
    const card = page.locator('[data-related-card]').first();
    await expect(focus).toBeVisible();
    await expect(card).toBeVisible();
    const heightBefore = (await focus.boundingBox())!.height;

    const relatedSpan = card.locator('mark[data-range-id], mark[data-overlap-range-ids]').first();
    await relatedSpan.hover();
    const strongPassage = focus.locator('[data-aside-highlight="strong"]').first();
    await expect(strongPassage).toBeVisible({ timeout: 1500 });
    const paintedText = await focus.locator('[data-aside-highlight]').allTextContents();
    expect(paintedText.join('').trim().length).toBeGreaterThan(0);
    await expect(strongPassage).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const fragmentStyles = await focus.locator('[data-aside-highlight]').evaluateAll((fragments) =>
      fragments.map((fragment) => {
        const style = getComputedStyle(fragment);
        return {
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
          borderRadius: style.borderRadius,
        };
      }),
    );
    expect(new Set(fragmentStyles.map(({ paddingTop }) => paddingTop))).toHaveProperty('size', 1);
    expect(new Set(fragmentStyles.map(({ paddingBottom }) => paddingBottom))).toHaveProperty('size', 1);
    expect(fragmentStyles.every(({ borderRadius }) => borderRadius === '0px')).toBe(true);
    expect((await focus.boundingBox())!.height).toBeCloseTo(heightBefore, 2);
  });

  test('a focus phrase replaces aside grouping with a focus-origin topic filter', async ({ page }) => {
    await page.goto(DETAIL_URL);
    const relationTag = page.locator('[data-related-card] [data-related-tag]').first();
    await expect(relationTag).toBeVisible();
    await relationTag.click();
    await expect(page.getByTestId('active-group-anchor').first()).toBeVisible();

    const mark = page.locator('[data-testid="focus-reveal"] mark[data-range-ids]:visible').first();
    await mark.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('fo')).toBe('focus');
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(0);
    await expect(page.locator('[data-testid="focus-reveal"] mark.fp-selected').first()).toBeVisible();
  });

  test('the sticky focus excerpt uses the same bold phrases and picker', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('stacky:experimentFlags:v1', JSON.stringify({ stickyFocusBar: true }));
    });
    await page.goto(DETAIL_URL);
    await expect(page.locator('[data-testid="focus-reveal"]').first()).toBeVisible();
    const sticky = page.getByTestId('focus-sticky-bar');
    await expect.poll(async () => {
      // A cold detail load can finish its saved-position restore after the
      // focus post paints. Keep the user's scroll intent authoritative.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      return sticky.isVisible();
    }).toBe(true);
    const mark = sticky.locator(
      '[data-testid="focus-reveal"] mark[aria-label^="Choose among"]:visible',
    ).first();
    await expect(mark).toHaveCSS('font-weight', /^(700|bold)$/);
    await mark.click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('focus-topic-picker')).toBeVisible();
  });
});
