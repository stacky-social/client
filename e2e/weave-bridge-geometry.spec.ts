import { expect, test, type Page } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

const stickyFocusId = (mockData as any[]).find((entry) => entry.replies?.length >= 10)!.focusPost.id as string;

const bridge = (page: Page) => page.getByTestId('weave-bridge');
const activePost = (page: Page) =>
  page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]');

async function expectConnectedBridge(page: Page) {
  await expect(bridge(page)).toHaveAttribute('data-bridge-state', 'connected');
  const activeId = await activePost(page).getAttribute('data-post-id');
  await expect(bridge(page)).toHaveAttribute('data-focus-id', activeId!);
  await expect(page.getByTestId('col-aside').locator('[data-related-focus-post-id]').first()).toHaveAttribute(
    'data-related-focus-post-id', activeId!,
  );
}

async function geometry(page: Page) {
  return bridge(page).evaluate((svg) => {
    const number = (name: string) => Number(svg.getAttribute(name));
    const inspectPath = (testId: string) => {
      const path = svg.querySelector(`[data-testid="${testId}"]`) as SVGPathElement;
      const length = path.getTotalLength();
      const matrix = path.getScreenCTM()!;
      const at = (distance: number) => {
        const point = path.getPointAtLength(distance).matrixTransform(matrix);
        return { x: point.x, y: point.y };
      };
      const samples = Array.from({ length: 61 }, (_, index) => at(length * index / 60));
      const steps = samples.slice(1).map((point, index) => point.y - samples[index].y);
      return {
        start: at(0),
        sourceProbe: at(Math.min(10, length * 0.12)),
        end: at(length),
        terminalProbe: at(Math.max(0, length - Math.min(14, length * 0.16))),
        maxY: samples.reduce((best, point) => point.y > best.y ? point : best),
        minY: samples.reduce((best, point) => point.y < best.y ? point : best),
        maxYIncrease: Math.max(...steps),
        maxYDecrease: Math.max(...steps.map((step) => -step)),
      };
    };
    const upper = inspectPath('weave-strand-upper');
    const lower = inspectPath('weave-strand-lower');
    return {
      sourceX: number('data-source-x'),
      sourceTopY: number('data-source-top-y'),
      sourceBottomY: number('data-source-bottom-y'),
      targetX: number('data-target-x'),
      targetTopY: number('data-target-top-y'),
      targetBottomY: number('data-target-bottom-y'),
      upperStart: upper.start,
      upperSourceProbe: upper.sourceProbe,
      upperEnd: upper.end,
      upperMaxY: upper.maxY,
      upperMinY: upper.minY,
      upperMaxYIncrease: upper.maxYIncrease,
      upperTerminalProbe: upper.terminalProbe,
      lowerStart: lower.start,
      lowerSourceProbe: lower.sourceProbe,
      lowerEnd: lower.end,
      lowerMaxY: lower.maxY,
      lowerMinY: lower.minY,
      lowerMaxYDecrease: lower.maxYDecrease,
      lowerTerminalProbe: lower.terminalProbe,
    };
  });
}

function expectNear(actual: number, expected: number, tolerance = 2) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/AIWorkforce');
  await expect(page.locator('[data-demo-feed-post]').first()).toBeVisible();
});

test('aligns both strands with the synchronized focus post and aside', async ({ page }) => {
  await expectConnectedBridge(page);
  const [g, card, aside, divider, nav, overlay, frameStyle, strandStyle] = await Promise.all([
    geometry(page), activePost(page).boundingBox(), page.getByTestId('col-aside').boundingBox(),
    page.getByRole('separator', { name: 'Resize feed and related panels' }).boundingBox(),
    page.getByTestId('top-nav').boundingBox(), bridge(page).boundingBox(),
    activePost(page).evaluate((post) => {
      const style = getComputedStyle(post);
      return {
        rightBorder: style.borderRightColor,
        topRightRadius: style.borderTopRightRadius,
        bottomRightRadius: style.borderBottomRightRadius,
        clipPath: style.clipPath,
        topBorder: style.borderTopColor,
        topBorderWidth: style.borderTopWidth,
      };
    }),
    bridge(page).getByTestId('weave-strand-upper').evaluate((strand) => {
      const style = getComputedStyle(strand);
      return { stroke: style.stroke, strokeWidth: style.strokeWidth };
    }),
  ]);
  expect(card && aside && divider && nav && overlay).toBeTruthy();
  expect(Object.values(g).flatMap((value) => typeof value === 'number' ? [value] : [value.x, value.y])
    .every(Number.isFinite)).toBe(true);
  expectNear(g.sourceX, card!.x + card!.width);
  expectNear(g.targetX, divider!.x + divider!.width / 2);
  expect(g.targetX).toBeLessThan(aside!.x);
  expect(g.targetX - g.sourceX).toBeGreaterThanOrEqual(60);
  expect(frameStyle.rightBorder).toBe('rgba(0, 0, 0, 0)');
  expect(frameStyle.topRightRadius).toBe('0px');
  expect(frameStyle.bottomRightRadius).toBe('0px');
  expect(frameStyle.clipPath).toBe('inset(-24px 0px -24px -24px)');
  expect(strandStyle.stroke).toBe(frameStyle.topBorder);
  expect(strandStyle.strokeWidth).toBe(frameStyle.topBorderWidth);
  expectNear(g.sourceTopY, card!.y, 3);
  expectNear(g.sourceBottomY, card!.y + card!.height, 3);
  expect(g.sourceBottomY - g.sourceTopY).toBeGreaterThan(card!.height - 4);
  expect(g.targetTopY).toBeLessThanOrEqual(g.sourceTopY - 68);
  expect(g.targetBottomY).toBeGreaterThanOrEqual(g.sourceBottomY + 68);
  expect(g.targetBottomY - g.targetTopY).toBeGreaterThan(
    (g.sourceBottomY - g.sourceTopY) * 1.75,
  );
  expectNear(g.upperStart.x, g.sourceX); expectNear(g.upperStart.y, g.sourceTopY);
  expectNear(g.lowerStart.x, g.sourceX); expectNear(g.lowerStart.y, g.sourceBottomY);
  // The frame border must travel outward before it bends. A vertical source
  // tangent recreates a short right edge even when the actual border is open.
  expect(g.upperSourceProbe.x - g.upperStart.x).toBeGreaterThan(
    Math.abs(g.upperSourceProbe.y - g.upperStart.y) * 1.5,
  );
  expect(g.lowerSourceProbe.x - g.lowerStart.x).toBeGreaterThan(
    Math.abs(g.lowerSourceProbe.y - g.lowerStart.y) * 1.5,
  );
  // Every sampled point moves straight outward (or stays level along the
  // source lead). Any downward upper excursion or upward lower excursion is
  // the rejected inward pinch.
  expect(g.upperMaxY.y).toBeLessThanOrEqual(g.sourceTopY + 1);
  expect(g.lowerMinY.y).toBeGreaterThanOrEqual(g.sourceBottomY - 1);
  expect(g.upperMaxYIncrease).toBeLessThanOrEqual(0.5);
  expect(g.lowerMaxYDecrease).toBeLessThanOrEqual(0.5);
  expectNear(g.upperEnd.x, g.targetX); expectNear(g.upperEnd.y, g.targetTopY);
  expectNear(g.lowerEnd.x, g.targetX); expectNear(g.lowerEnd.y, g.targetBottomY);
  // The final segment must arrive steeply. A horizontal tangent is the old
  // attachment-tab failure this suite is designed to prevent.
  const upperTerminalSlope = (g.upperTerminalProbe.y - g.upperEnd.y)
    / (g.upperEnd.x - g.upperTerminalProbe.x);
  const lowerTerminalSlope = (g.lowerEnd.y - g.lowerTerminalProbe.y)
    / (g.lowerEnd.x - g.lowerTerminalProbe.x);
  expect(upperTerminalSlope).toBeGreaterThan(2.4);
  expect(lowerTerminalSlope).toBeGreaterThan(2.4);
  await expect(bridge(page).getByTestId('weave-divider-seam')).toHaveCount(0);
  await expect(bridge(page).getByTestId('weave-ribbon-gradient').locator('stop').last())
    .toHaveAttribute('stop-opacity', '0');
  expect(overlay!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height - 1);
  await expect(bridge(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(bridge(page)).toHaveCSS('pointer-events', 'none');
  await expect(page.getByTestId('resize-divider-guide')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('retargets to the resting post after scrolling', async ({ page }) => {
  await expectConnectedBridge(page);
  const next = page.locator('[data-demo-feed-post]').nth(2);
  const nextId = await next.getAttribute('data-demo-feed-post');
  await next.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top - window.innerHeight * 0.3 + 100);
  });
  await expect(next.getByTestId('post')).toHaveAttribute('data-active', 'true');
  await expect(bridge(page)).toHaveAttribute('data-focus-id', nextId!);
  await expect(page.getByTestId('col-aside').locator('[data-related-focus-post-id]').first()).toHaveAttribute(
    'data-related-focus-post-id', nextId!,
  );
  const [nav, overlay] = await Promise.all([
    page.getByTestId('top-nav').boundingBox(), bridge(page).boundingBox(),
  ]);
  expect(overlay!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height - 1);
});

test('retargets after pointer and keyboard divider resizing', async ({ page }) => {
  await expectConnectedBridge(page);
  const divider = page.getByRole('separator', { name: 'Resize feed and related panels' });
  const box = (await divider.boundingBox())!;
  const pointerBefore = (await geometry(page)).targetX;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x - 50, box.y + 100);
  await page.mouse.up();
  await expect.poll(async () => (await geometry(page)).targetX).not.toBe(pointerBefore);
  const pointerDivider = (await divider.boundingBox())!;
  expectNear((await geometry(page)).targetX, pointerDivider.x + pointerDivider.width / 2);
  const keyboardBefore = (await geometry(page)).targetX;
  await divider.focus();
  await expect(divider).toBeFocused();
  await divider.press('ArrowRight');
  await expect.poll(async () => (await geometry(page)).targetX).not.toBe(keyboardBefore);
  const keyboardDivider = (await divider.boundingBox())!;
  expectNear((await geometry(page)).targetX, keyboardDivider.x + keyboardDivider.width / 2);
  await expect(divider).toHaveAttribute('aria-valuenow', /\d+/);
});

test('keeps the full-frame flare at a narrow desktop split', async ({ page }) => {
  await page.setViewportSize({ width: 1010, height: 882 });
  await expectConnectedBridge(page);
  const [g, card] = await Promise.all([geometry(page), activePost(page).boundingBox()]);
  expect(card).toBeTruthy();
  expectNear(g.sourceTopY, card!.y, 3);
  expectNear(g.sourceBottomY, card!.y + card!.height, 3);
  expect(g.targetX - g.sourceX).toBeGreaterThanOrEqual(60);
  expect(g.targetTopY).toBeLessThanOrEqual(g.sourceTopY - 68);
  expect(g.targetBottomY).toBeGreaterThanOrEqual(g.sourceBottomY + 68);
  expect(g.targetBottomY - g.targetTopY).toBeGreaterThan(
    (g.sourceBottomY - g.sourceTopY) * 1.75,
  );
  expect(g.upperMaxY.y).toBeLessThanOrEqual(g.sourceTopY + 1);
  expect(g.lowerMinY.y).toBeGreaterThanOrEqual(g.sourceBottomY - 1);
});

test('keeps a usable feed column at the minimum resizable split', async ({ page }) => {
  await page.setViewportSize({ width: 1010, height: 882 });
  await page.evaluate(() => localStorage.setItem('stacky:feedRatio', '0.15'));
  await page.reload();
  await expectConnectedBridge(page);
  const divider = page.getByRole('separator', { name: 'Resize feed and related panels' });
  await expect(divider).toHaveAttribute('aria-valuemin', '35');
  await expect(divider).toHaveAttribute('aria-valuenow', '35');
  const [g, content] = await Promise.all([
    geometry(page), page.getByTestId('feed-content').boundingBox(),
  ]);
  expect(content).toBeTruthy();
  expect(content!.width).toBeGreaterThanOrEqual(240);
  expect(g.targetX - g.sourceX).toBeGreaterThanOrEqual(60);
});

test('keeps the sticky focus source narrower than the divider opening', async ({ page }) => {
  await page.goto(`/AIWorkforce/posts/${stickyFocusId}`);
  await expect(activePost(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(1200);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId('focus-sticky-bar')).toBeVisible();
  await expect(bridge(page)).toHaveAttribute('data-source-kind', 'sticky');
  const [g, sticky] = await Promise.all([
    geometry(page), page.getByTestId('focus-sticky-bar').boundingBox(),
  ]);
  expect(sticky).toBeTruthy();
  expect(g.sourceBottomY - g.sourceTopY).toBeGreaterThan(sticky!.height * 0.7);
  expect(g.targetBottomY - g.targetTopY).toBeGreaterThan(
    (g.sourceBottomY - g.sourceTopY) * 1.25,
  );
});

test('hides below the split-view breakpoint and returns above it', async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await expect(bridge(page)).toHaveCount(0);
  await expect.poll(() => activePost(page).evaluate((post) => getComputedStyle(post).borderRightColor))
    .not.toBe('rgba(0, 0, 0, 0)');
  await page.setViewportSize({ width: 769, height: 900 });
  await expectConnectedBridge(page);
  await expect.poll(() => activePost(page).evaluate((post) => getComputedStyle(post).borderRightColor))
    .toBe('rgba(0, 0, 0, 0)');
});
