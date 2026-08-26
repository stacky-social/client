import { expect, test, type Page } from '@playwright/test';

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
    const endpoint = (testId: string, end: boolean) => {
      const path = svg.querySelector(`[data-testid="${testId}"]`) as SVGPathElement;
      const point = path.getPointAtLength(end ? path.getTotalLength() : 0);
      const screen = point.matrixTransform(path.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    };
    return {
      sourceX: number('data-source-x'),
      sourceTopY: number('data-source-top-y'),
      sourceBottomY: number('data-source-bottom-y'),
      targetX: number('data-target-x'),
      targetTopY: number('data-target-top-y'),
      targetBottomY: number('data-target-bottom-y'),
      upperStart: endpoint('weave-strand-upper', false),
      upperEnd: endpoint('weave-strand-upper', true),
      lowerStart: endpoint('weave-strand-lower', false),
      lowerEnd: endpoint('weave-strand-lower', true),
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
  const [g, card, aside, nav, overlay] = await Promise.all([
    geometry(page), activePost(page).boundingBox(), page.getByTestId('col-aside').boundingBox(),
    page.getByTestId('top-nav').boundingBox(), bridge(page).boundingBox(),
  ]);
  expect(card && aside && nav && overlay).toBeTruthy();
  expect(Object.values(g).flatMap((value) => typeof value === 'number' ? [value] : [value.x, value.y])
    .every(Number.isFinite)).toBe(true);
  expectNear(g.sourceX, card!.x + card!.width);
  expectNear(g.targetX, aside!.x);
  expect(g.sourceTopY).toBeGreaterThanOrEqual(card!.y - 2);
  expect(g.sourceBottomY).toBeLessThanOrEqual(card!.y + card!.height + 2);
  expect(g.sourceBottomY).toBeGreaterThan(g.sourceTopY);
  expectNear(g.upperStart.x, g.sourceX); expectNear(g.upperStart.y, g.sourceTopY);
  expectNear(g.lowerStart.x, g.sourceX); expectNear(g.lowerStart.y, g.sourceBottomY);
  expectNear(g.upperEnd.x, g.targetX); expectNear(g.upperEnd.y, g.targetTopY);
  expectNear(g.lowerEnd.x, g.targetX); expectNear(g.lowerEnd.y, g.targetBottomY);
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
  expectNear((await geometry(page)).targetX, (await page.getByTestId('col-aside').boundingBox())!.x);
  const keyboardBefore = (await geometry(page)).targetX;
  await divider.focus();
  await expect(divider).toBeFocused();
  await divider.press('ArrowRight');
  await expect.poll(async () => (await geometry(page)).targetX).not.toBe(keyboardBefore);
  expectNear((await geometry(page)).targetX, (await page.getByTestId('col-aside').boundingBox())!.x);
  await expect(divider).toHaveAttribute('aria-valuenow', /\d+/);
});

test('hides below the split-view breakpoint and returns above it', async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await expect(bridge(page)).toHaveCount(0);
  await page.setViewportSize({ width: 769, height: 900 });
  await expectConnectedBridge(page);
});
