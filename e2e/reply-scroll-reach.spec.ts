import { expect, test, type Page } from '@playwright/test';

// Researcher report (#224): "can't fully scroll comments on this post". The
// reply region was sized with a fixed 72px budget for everything above it, but
// the focus post sits under the nav AND the Back row, so on a short viewport
// the last reply ended ~52px below the window — and the wheel is contained in
// the region, so nothing could scroll it into view.
const POST = '/AIWorkforce/posts/cw-5K5DUa-AVr3ntujb';

async function lastReplyBottomAfterScrollingToEnd(page: Page) {
  const region = page.getByTestId('reply-scroll-region');
  await expect(region.locator('[data-testid="post"]').first()).toBeVisible();
  const box = (await region.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 40, page.viewportSize()!.height - 10));
  for (let i = 0; i < 20; i += 1) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const regionEl = document.querySelector('[data-testid="reply-scroll-region"]')!;
    const replies = regionEl.querySelectorAll('[data-testid="post"]');
    return {
      lastBottom: replies[replies.length - 1].getBoundingClientRect().bottom,
      regionBottom: regionEl.getBoundingClientRect().bottom,
      viewport: window.innerHeight,
    };
  });
}

test.describe('reply region reaches its last reply (#224)', () => {
  test.use({ viewport: { width: 1000, height: 576 } });

  test('scrolling the replies brings the last reply fully into view', async ({ page }) => {
    await page.goto(POST);
    const { lastBottom, regionBottom, viewport } = await lastReplyBottomAfterScrollingToEnd(page);
    expect(regionBottom).toBeLessThanOrEqual(viewport + 1);
    expect(lastBottom).toBeLessThanOrEqual(viewport + 1);
  });

  test('a restored reply position still reaches the last reply', async ({ page }) => {
    await page.goto(POST);
    await lastReplyBottomAfterScrollingToEnd(page);
    // Reload restores the reply scroll and compact state from sessionStorage.
    await page.reload();
    const { lastBottom, viewport } = await lastReplyBottomAfterScrollingToEnd(page);
    expect(lastBottom).toBeLessThanOrEqual(viewport + 1);
  });
});
