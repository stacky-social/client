import { expect, test, type Page } from '@playwright/test';

// Regression: opening a post from deep in a long topic feed, then scrolling
// gently (trackpad-sized steps that never freeze the aside), used to scroll
// the related pane off the top of the screen. The weave-bridge SVG is
// absolutely positioned and sized to the document height, and it measured
// that height from documentElement.scrollHeight, which includes the SVG
// itself. Its feed-sized height therefore survived into the much shorter
// post-detail page and kept the document scrollable far below the content
// group. The aside is sticky inside that group, so it was carried up with
// it, leaving only the tail of one related card under the nav and blank
// space below.

const NAV_HEIGHT = 56;

async function asideGeometry(page: Page) {
  return page.evaluate(() => {
    const aside = document.querySelector('[data-testid="col-aside"]')!.getBoundingClientRect();
    return {
      top: aside.top,
      bottom: aside.bottom,
      viewport: window.innerHeight,
      docHeight: document.documentElement.scrollHeight,
      bodyHeight: document.body.getBoundingClientRect().height,
    };
  });
}

test('the related pane stays on screen when scrolling a post opened from deep in the feed', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('/Tariffs');
  const feedPosts = page.locator('[data-demo-feed-post]');
  await expect(feedPosts.first()).toBeVisible({ timeout: 15_000 });
  const target = feedPosts.nth(3);
  await target.waitFor({ state: 'attached' });
  await target.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(page.getByTestId('weave-bridge')).toHaveAttribute('data-weave-state', 'connected');
  // The feed is much taller than the post page we are about to open.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(2000);

  const postId = await target.getAttribute('data-demo-feed-post');
  const opener = target.getByTestId('post').locator('[role="button"][tabindex="0"]').first();
  await opener.focus();
  await opener.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/Tariffs/posts/${postId}(?:\\?|$)`));
  await expect(page.locator('[data-testid="col-aside"] [data-related-card]').first()).toBeVisible();
  await page.waitForTimeout(800);

  // The document must not stay taller than the page's own content.
  const settled = await asideGeometry(page);
  expect(settled.docHeight).toBeLessThanOrEqual(Math.max(settled.bodyHeight, settled.viewport) + 1);

  // Gentle wheel steps in the page margin left of the feed scroll the window
  // itself, and stay slow enough that the aside never freezes.
  const group = await page.getByTestId('content-group').boundingBox();
  await page.mouse.move(Math.max(4, group!.x / 2), 500);
  for (let step = 0; step < 40; step += 1) {
    await page.mouse.wheel(0, 20);
    await page.waitForTimeout(25);
    const geometry = await asideGeometry(page);
    expect(geometry.top, `aside top after step ${step}`).toBeGreaterThanOrEqual(NAV_HEIGHT - 1);
    expect(geometry.bottom, `aside bottom after step ${step}`).toBeGreaterThanOrEqual(geometry.viewport - 1);
  }
});
