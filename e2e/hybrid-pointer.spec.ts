import { expect, test } from '@playwright/test';

// A touch-capable computer is not a touch-only computer. Chromium exposes
// maxTouchPoints in this context, while Playwright still drives a real mouse
// pointer for hover(). This is the Windows touchscreen-laptop regression that
// previously disabled all related-pane hover interactions.
test.use({ hasTouch: true });

test.describe('hybrid touch + mouse input', () => {
  test('uses the current pointer for related-card and AI-edit interactions', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);

    const focus = page.locator('[data-store-feed-post="152053690"]');
    await focus.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(focus.getByTestId('post')).toHaveAttribute('data-active', 'true');

    const headingBox = await page.getByRole('heading', { name: 'Home', level: 1 }).boundingBox();
    expect(headingBox).not.toBeNull();

    // Put the UI in touch mode first, as if the user had just used the screen.
    await page.touchscreen.tap(
      headingBox!.x + headingBox!.width / 2,
      headingBox!.y + headingBox!.height / 2,
    );

    // Moving the physical mouse onto a card must immediately restore hover;
    // touch capability must not suppress cross-highlighting.
    const cards = page.locator('[data-related-card]');
    await expect(cards).toHaveCount(10);
    await cards.first().hover();
    await expect(cards.nth(1)).toHaveCSS('opacity', '0.45');

    // The Modified-by-AI disclosure uses the same current-pointer contract.
    const michaelCard = page.locator('[data-post-id="143196877"]');
    const badge = michaelCard.getByRole('button', { name: 'Modified by AI' });
    const edited = michaelCard.locator('[data-ai-edited-default]');
    const diff = michaelCard.locator('[data-ai-inline-diff]');
    await expect(badge).toBeVisible();
    await badge.hover();
    await expect(edited).toHaveAttribute('aria-hidden', 'true');
    await expect(diff).toHaveAttribute('aria-hidden', 'false');

    // A finger remains a tap interaction: after leaving with the mouse, one
    // touch tap reveals the in-card diff without navigating the post.
    await page.mouse.move(headingBox!.x + 2, headingBox!.y + 2);
    await expect(diff).toHaveAttribute('aria-hidden', 'true');
    const urlBeforeTouch = page.url();
    const badgeBox = await badge.boundingBox();
    expect(badgeBox).not.toBeNull();
    await page.touchscreen.tap(
      badgeBox!.x + badgeBox!.width / 2,
      badgeBox!.y + badgeBox!.height / 2,
    );
    await expect(diff).toHaveAttribute('aria-hidden', 'false');
    await page.touchscreen.tap(
      badgeBox!.x + badgeBox!.width / 2,
      badgeBox!.y + badgeBox!.height / 2,
    );
    await expect(diff).toHaveAttribute('aria-hidden', 'true');
    expect(page.url()).toBe(urlBeforeTouch);
  });
});
