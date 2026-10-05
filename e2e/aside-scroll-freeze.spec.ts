import { expect, test, type Page } from '@playwright/test';

const bridge = (page: Page) => page.getByTestId('weave-bridge');
const group = (page: Page) => page.getByTestId('content-group');
const freeze = (page: Page) => page.getByTestId('aside-freeze');
const aside = (page: Page) => page.getByTestId('col-aside');
const activePost = (page: Page) =>
  page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]');
const firstRelated = (page: Page) =>
  page.locator('[data-related-card] [data-post-id]').first();

async function openDemo(page: Page) {
  await page.goto('/AIWorkforce');
  await expect(page.locator('[data-demo-feed-post]').first()).toBeVisible({ timeout: 15_000 });
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');
}

async function feedCenter(page: Page) {
  const box = await page.getByTestId('feed').boundingBox();
  if (!box) throw new Error('Feed is not measurable');
  return { x: box.x + box.width / 2, y: 400 };
}

test('wheel-scrolling the feed freezes and blurs the aside, then reconnects on the settled post', async ({ page }) => {
  await openDemo(page);
  const before = await firstRelated(page).getAttribute('data-post-id');
  const { x, y } = await feedCenter(page);
  await page.mouse.move(x, y);

  // Keep wheeling while asserting, so a slow CI frame cannot let the gesture
  // settle before the mid-scroll checks run.
  let wheeling = true;
  const gesture = (async () => {
    for (let step = 0; wheeling && step < 40; step += 1) {
      await page.mouse.wheel(0, step % 2 === 0 ? 120 : -80);
      await page.waitForTimeout(40);
    }
  })();
  await expect(group(page)).toHaveAttribute('data-feed-scrolling', 'true');
  await expect(bridge(page)).toHaveCount(0);
  await expect(freeze(page)).toHaveCSS('pointer-events', 'none');
  await expect(aside(page)).toHaveCSS('filter', 'blur(4px)');
  // Static: the aside keeps the related cards it had when scrolling began.
  await expect(firstRelated(page)).toHaveAttribute('data-post-id', before!);
  wheeling = false;
  await gesture;

  await expect(group(page)).not.toHaveAttribute('data-feed-scrolling', 'true');
  await expect(aside(page)).toHaveCSS('filter', 'none');
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');
  const activeId = await activePost(page).getAttribute('data-post-id');
  await expect(bridge(page)).toHaveAttribute('data-focus-id', activeId!);
});

test('programmatic scrolling does not freeze the aside', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(50);
  await expect(group(page)).not.toHaveAttribute('data-feed-scrolling', 'true');
  await expect(aside(page)).toHaveCSS('filter', 'none');
});

test('a small reading scroll on the same post leaves the aside live', async ({ page }) => {
  await openDemo(page);
  const focused = await activePost(page).getAttribute('data-post-id');
  const { x, y } = await feedCenter(page);
  await page.mouse.move(x, y);
  for (let step = 0; step < 4; step += 1) {
    await page.mouse.wheel(0, 8);
    await page.waitForTimeout(60);
  }
  await expect(activePost(page)).toHaveAttribute('data-post-id', focused!);
  await expect(group(page)).not.toHaveAttribute('data-feed-scrolling', 'true');
  await expect(aside(page)).toHaveCSS('filter', 'none');
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');
});
