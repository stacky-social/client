import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'stacky:weave-bridge-variant';
const bridge = (page: Page) => page.getByTestId('weave-bridge');
const group = (page: Page) => page.getByTestId('content-group');
const activePost = (page: Page) =>
  page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]');
const relatedPost = (page: Page) => page.locator('[data-related-card] [data-post-id]').first();

async function openDemo(page: Page) {
  await page.goto('/AIWorkforce');
  await expect(page.locator('[data-demo-feed-post]').first()).toBeVisible({ timeout: 15_000 });
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

test('Shift+B cycles and persists open, classic, and border-only focus designs', async ({ page }) => {
  await openDemo(page);
  const status = page.getByTestId('weave-bridge-status');
  await expect(group(page)).toHaveAttribute('data-weave-shortcut', 'Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'open');
  await expect(status).toHaveText('Open bridge design');
  await expect(bridge(page)).toHaveAttribute('data-weave-variant', 'open');
  await expect(bridge(page).getByTestId('weave-divider-rail-upper')).toHaveCount(1);
  await expect(bridge(page).getByTestId('weave-ribbon-gradient')).toHaveCount(0);
  await expect(relatedPost(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(activePost(page)).toHaveCSS('clip-path', 'inset(-24px 0px -24px -24px)');
  const openPanelGap = await panelGap(page);

  await page.keyboard.press('Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'classic');
  await expect(status).toHaveText('Classic bridge design');
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'switching');
  await expect(bridge(page).locator('[data-weave-layer="outgoing"]'))
    .toHaveAttribute('data-weave-variant', 'open');
  await expect(bridge(page).locator('[data-weave-layer="current"]'))
    .toHaveAttribute('data-weave-variant', 'classic');
  await expect(bridge(page).locator('[data-weave-layer="current"]'))
    .toHaveAttribute('data-morph-delay-ms', '220');
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
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');

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
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'border');
  await expect(status).toHaveText('Border-only focus design');
  await expect(bridge(page)).toHaveCount(0);
  await expect(activePost(page)).toHaveCSS('border-right-color', 'rgb(69, 169, 158)');
  await expect(activePost(page)).toHaveCSS('border-top-right-radius', '10px');
  await expect(activePost(page)).toHaveCSS('border-bottom-right-radius', '10px');
  await expect(activePost(page)).toHaveCSS('clip-path', 'none');
  await expect(page.getByTestId('resize-divider-guide')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  expect(Math.abs(await panelGap(page) - openPanelGap)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBe('border');

  await page.reload();
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'border');
  await expect(bridge(page)).toHaveCount(0);
  await expect(activePost(page)).toHaveCSS('border-right-color', 'rgb(69, 169, 158)');

  await page.keyboard.press('Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'open');
  await expect(status).toHaveText('Open bridge design');
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');
  await expect(bridge(page).getByTestId('weave-divider-rail-upper')).toHaveCount(1);
  await expect(bridge(page).getByTestId('weave-ribbon-gradient')).toHaveCount(0);
  await expect(relatedPost(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect.poll(() => bridgeWidth(page)).toBeLessThanOrEqual(56);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBe('open');
});

test('lets the drawn bridge go while the reader scrolls the feed', async ({ page }) => {
  await openDemo(page);
  const feed = await page.getByTestId('feed').boundingBox();
  await page.mouse.move(feed!.x + feed!.width / 2, 400);

  // Keep wheeling while asserting so a slow frame cannot settle the gesture
  // before the mid-scroll checks run.
  const wheel = () => {
    let wheeling = true;
    const gesture = (async () => {
      for (let step = 0; wheeling && step < 40; step += 1) {
        await page.mouse.wheel(0, step % 2 === 0 ? 120 : -80);
        await page.waitForTimeout(30);
      }
    })();
    return async () => { wheeling = false; await gesture; };
  };

  let stop = wheel();
  await expect(group(page)).toHaveAttribute('data-weave-suspended', 'scroll');
  await expect(bridge(page)).toHaveCount(0);
  await expect(activePost(page)).toHaveCSS('border-right-color', 'rgb(69, 169, 158)');
  await expect(activePost(page)).toHaveCSS('border-top-right-radius', '10px');
  await expect(activePost(page)).toHaveCSS('clip-path', 'none');
  await stop();

  await expect(group(page)).not.toHaveAttribute('data-weave-suspended', 'scroll');
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');

  // Border-only mode draws no bridge, so there is nothing to suspend; the
  // aside still freezes while the feed moves.
  await page.keyboard.press('Shift+B');
  await page.keyboard.press('Shift+B');
  await expect(group(page)).toHaveAttribute('data-weave-variant', 'border');
  stop = wheel();
  await expect(group(page)).toHaveAttribute('data-feed-scrolling', 'true');
  await expect(group(page)).not.toHaveAttribute('data-weave-suspended', 'scroll');
  await stop();
  await page.keyboard.press('Shift+B');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBe('open');
});
