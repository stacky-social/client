import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'stacky:weave-bridge-variant';
const bridge = (page: Page) => page.getByTestId('weave-bridge');
const group = (page: Page) => page.getByTestId('content-group');
const activePost = (page: Page) =>
  page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]');
const relatedPost = (page: Page) => page.locator('[data-related-card] [data-post-id]').first();

async function openDemo(page: Page) {
  await page.goto('/AIWorkforce');
  await expect(page.locator('[data-demo-feed-post]').first()).toBeVisible();
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');
}

async function bridgeWidth(page: Page) {
  return bridge(page).evaluate((svg) =>
    Number(svg.getAttribute('data-target-x')) - Number(svg.getAttribute('data-source-x')));
}

async function panelGap(page: Page) {
  const [post, aside] = await Promise.all([
    activePost(page).boundingBox(),
    page.getByTestId('col-aside').boundingBox(),
  ]);
  if (!post || !aside) throw new Error('Bridge panels are not measurable');
  return aside.x - (post.x + post.width);
}

test('Shift+B toggles and persists the classic and open bridge designs', async ({ page }) => {
  await openDemo(page);
  await expect(group(page)).toHaveAttribute('data-weave-shortcut', 'Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'open');
  await expect(bridge(page)).toHaveAttribute('data-weave-variant', 'open');
  await expect(bridge(page).getByTestId('weave-divider-rail-upper')).toHaveCount(1);
  await expect(bridge(page).getByTestId('weave-ribbon-gradient')).toHaveCount(0);
  await expect(relatedPost(page)).toHaveCSS('background-color', 'rgb(247, 249, 250)');
  await expect(activePost(page)).toHaveCSS('clip-path', 'inset(-24px 0px -24px -24px)');
  const openPanelGap = await panelGap(page);

  await page.keyboard.press('Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'classic');
  await expect(bridge(page)).toHaveAttribute('data-weave-variant', 'classic');
  await expect(bridge(page).getByTestId('weave-divider-rail-upper')).toHaveCount(0);
  await expect(bridge(page).getByTestId('weave-ribbon-gradient')).toHaveCount(1);
  await expect(relatedPost(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(activePost(page)).toHaveCSS('clip-path', 'inset(-24px 0px -24px -24px)');
  await expect.poll(() => bridgeWidth(page)).toBeGreaterThanOrEqual(46);
  await expect.poll(() => bridgeWidth(page)).toBeLessThanOrEqual(56);
  expect(Math.abs(await panelGap(page) - openPanelGap)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBe('classic');

  await page.reload();
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'classic');

  await page.evaluate(() => {
    const input = document.createElement('input');
    input.dataset.testid = 'bridge-shortcut-input';
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press('Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'classic');

  await page.getByTestId('bridge-shortcut-input').evaluate((input) => input.remove());
  await page.keyboard.press('Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'open');
  await expect(bridge(page).getByTestId('weave-divider-rail-upper')).toHaveCount(1);
  await expect(bridge(page).getByTestId('weave-ribbon-gradient')).toHaveCount(0);
  await expect(relatedPost(page)).toHaveCSS('background-color', 'rgb(247, 249, 250)');
  await expect.poll(() => bridgeWidth(page)).toBeLessThanOrEqual(56);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBe('open');
});
