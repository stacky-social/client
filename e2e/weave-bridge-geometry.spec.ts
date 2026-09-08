import { expect, test, type Page } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

const stickyFocusId = (mockData as any[]).find((entry) => entry.replies?.length >= 10)!.focusPost.id as string;

const bridge = (page: Page) => page.getByTestId('weave-bridge');
const activePost = (page: Page) =>
  page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]');

async function expectConnectedBridge(page: Page) {
  await expect(bridge(page)).toHaveAttribute('data-bridge-state', 'connected');
  await expect(bridge(page)).toHaveAttribute('data-weave-state', 'connected');
  const activeId = await activePost(page).getAttribute('data-post-id');
  await expect(bridge(page)).toHaveAttribute('data-focus-id', activeId!);
  await expect(activePost(page)).toHaveAttribute('data-weave-source-phase', 'open');
  await expect(page.getByTestId('col-aside').locator('[data-related-focus-post-id]').first()).toHaveAttribute(
    'data-related-focus-post-id', activeId!,
  );
}

async function geometry(page: Page) {
  return bridge(page).evaluate((svg) => {
    const number = (name: string) => Number(svg.getAttribute(name));
    const sourceX = number('data-source-x');
    const inspectPath = (testId: string) => {
      const path = svg.querySelector(`[data-testid="${testId}"]`) as SVGPathElement;
      const length = path.getTotalLength();
      const matrix = path.getScreenCTM()!;
      const at = (distance: number) => {
        const point = path.getPointAtLength(distance).matrixTransform(matrix);
        return { x: point.x, y: point.y };
      };
      const start = at(0);
      const horizontalRun = Math.max(0, sourceX - start.x);
      const samples = Array.from({ length: 61 }, (_, index) => at(length * index / 60));
      const steps = samples.slice(1).map((point, index) => point.y - samples[index].y);
      return {
        pathData: path.getAttribute('d') ?? '',
        start,
        sourceJoint: at(horizontalRun),
        curveProbe: at(Math.min(length, horizontalRun + Math.min(10, (length - horizontalRun) * 0.12))),
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
      sourceX,
      sourceTopY: number('data-source-top-y'),
      sourceBottomY: number('data-source-bottom-y'),
      targetX: number('data-target-x'),
      targetTopY: number('data-target-top-y'),
      targetBottomY: number('data-target-bottom-y'),
      upperStart: upper.start,
      upperPathData: upper.pathData,
      upperSourceJoint: upper.sourceJoint,
      upperCurveProbe: upper.curveProbe,
      upperEnd: upper.end,
      upperMaxY: upper.maxY,
      upperMinY: upper.minY,
      upperMaxYIncrease: upper.maxYIncrease,
      upperTerminalProbe: upper.terminalProbe,
      lowerStart: lower.start,
      lowerPathData: lower.pathData,
      lowerSourceJoint: lower.sourceJoint,
      lowerCurveProbe: lower.curveProbe,
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
  const [g, card, aside, divider, nav, overlay, frameStyle, bridgeStyles, panelStyles] = await Promise.all([
    geometry(page), activePost(page).boundingBox(), page.getByTestId('col-aside').boundingBox(),
    page.getByRole('separator', { name: 'Resize feed and related panels' }).boundingBox(),
    page.getByTestId('top-nav').boundingBox(), bridge(page).boundingBox(),
    activePost(page).evaluate((post) => {
      const style = getComputedStyle(post);
      return {
        rightBorder: style.borderRightColor,
        topBorderWidth: Number.parseFloat(style.borderTopWidth),
        bottomBorderWidth: Number.parseFloat(style.borderBottomWidth),
        topRightRadius: style.borderTopRightRadius,
        bottomRightRadius: style.borderBottomRightRadius,
        clipPath: style.clipPath,
        sourcePhase: post.getAttribute('data-weave-source-phase'),
      };
    }),
    Promise.all([
      bridge(page).getByTestId('weave-ribbon'),
      bridge(page).getByTestId('weave-strand-upper'),
      bridge(page).getByTestId('weave-strand-lower'),
      bridge(page).getByTestId('weave-divider-rail-upper'),
      bridge(page).getByTestId('weave-divider-rail-lower'),
    ].map((element) => element.evaluate((node) => {
      const style = getComputedStyle(node);
      return { fill: style.fill, stroke: style.stroke };
    }))),
    Promise.all([
      page.getByTestId('col-aside').evaluate((node) => getComputedStyle(node).backgroundColor),
      page.locator('[data-related-card] [data-post-id]').first()
        .evaluate((node) => getComputedStyle(node).backgroundColor),
    ]),
  ]);
  expect(card && aside && divider && nav && overlay).toBeTruthy();
  expect(Object.values(g).flatMap((value) => typeof value === 'number'
    ? [value]
    : typeof value === 'object' ? [value.x, value.y] : [])
    .every(Number.isFinite)).toBe(true);
  expect(card!.x + card!.width - g.sourceX).toBeGreaterThanOrEqual(2);
  expect(card!.x + card!.width - g.sourceX).toBeLessThanOrEqual(4);
  expectNear(g.targetX, divider!.x + divider!.width / 2);
  expect(g.targetX).toBeLessThan(aside!.x);
  expect(g.targetX - g.sourceX).toBeGreaterThanOrEqual(46);
  expect(g.targetX - g.sourceX).toBeLessThanOrEqual(56);
  expect(frameStyle.rightBorder).toBe('rgba(0, 0, 0, 0)');
  expect(frameStyle.topRightRadius).toBe('0px');
  expect(frameStyle.bottomRightRadius).toBe('0px');
  expect(frameStyle.clipPath).toBe('inset(-24px 0px -24px -24px)');
  expect(frameStyle.sourcePhase).toBe('open');
  expect(bridgeStyles).toEqual([
    { fill: 'rgb(255, 255, 255)', stroke: 'none' },
    { fill: 'none', stroke: 'rgb(69, 169, 158)' },
    { fill: 'none', stroke: 'rgb(69, 169, 158)' },
    { fill: 'none', stroke: 'rgb(69, 169, 158)' },
    { fill: 'none', stroke: 'rgb(69, 169, 158)' },
  ]);
  expect(panelStyles).toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 255)']);
  expectNear(g.sourceTopY, card!.y + frameStyle.topBorderWidth / 2, 0.6);
  expectNear(
    g.sourceBottomY,
    card!.y + card!.height - frameStyle.bottomBorderWidth / 2,
    0.6,
  );
  expect(g.sourceBottomY - g.sourceTopY).toBeGreaterThan(card!.height - 5);
  expect(g.targetTopY).toBeLessThanOrEqual(g.sourceTopY - 68);
  expect(g.targetBottomY).toBeGreaterThanOrEqual(g.sourceBottomY + 68);
  expect(g.targetBottomY - g.targetTopY).toBeGreaterThan(
    (g.sourceBottomY - g.sourceTopY) * 1.75,
  );
  expectNear(g.upperStart.x, g.sourceX); expectNear(g.upperStart.y, g.sourceTopY);
  expectNear(g.lowerStart.x, g.sourceX); expectNear(g.lowerStart.y, g.sourceBottomY);
  expectNear(g.upperSourceJoint.x, g.sourceX); expectNear(g.upperSourceJoint.y, g.sourceTopY);
  expectNear(g.lowerSourceJoint.x, g.sourceX); expectNear(g.lowerSourceJoint.y, g.sourceBottomY);
  // The native card border remains untouched; each SVG stroke begins at its
  // open right edge with a horizontal tangent and bends within ten pixels.
  expect(g.upperPathData).toMatch(/^M .+ C /);
  expect(g.lowerPathData).toMatch(/^M .+ C /);
  expect(g.upperCurveProbe.x - g.upperSourceJoint.x).toBeGreaterThan(
    Math.abs(g.upperCurveProbe.y - g.upperSourceJoint.y) * 1.5,
  );
  expect(g.lowerCurveProbe.x - g.lowerSourceJoint.x).toBeGreaterThan(
    Math.abs(g.lowerCurveProbe.y - g.lowerSourceJoint.y) * 1.5,
  );
  expect(g.upperSourceJoint.y - g.upperCurveProbe.y).toBeGreaterThan(0.25);
  expect(g.lowerCurveProbe.y - g.lowerSourceJoint.y).toBeGreaterThan(0.25);
  // Every sampled point moves outward. Any downward upper excursion or upward
  // lower excursion is the rejected inward pinch.
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
  await expect(bridge(page).getByTestId('weave-divider-rail-upper')).toHaveCount(1);
  await expect(bridge(page).getByTestId('weave-divider-rail-lower')).toHaveCount(1);
  expect(overlay!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height - 1);
  await expect(bridge(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(bridge(page)).toHaveCSS('pointer-events', 'none');
  await expect(bridge(page)).toHaveCSS('overflow', 'hidden');
  await expect(page.getByTestId('resize-divider-guide')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('keeps the bridge joined during every scroll event', async ({ page }) => {
  await expectConnectedBridge(page);
  const samples = await page.evaluate(async () => {
    const readings: Array<{
      topGap: number;
      bottomGap: number;
      sourceOverlap: number;
    }> = [];
    const record = () => {
      const active = document.querySelector<HTMLElement>(
        '[data-testid="feed"] [data-testid="post"][data-active="true"]',
      );
      const svg = document.querySelector<SVGSVGElement>('[data-testid="weave-bridge"]');
      if (!active || !svg || svg.getAttribute('data-focus-id') !== active.dataset.postId) return;
      const rect = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      const topBorderCenter = rect.top + Number.parseFloat(style.borderTopWidth) / 2;
      const bottomBorderCenter = rect.bottom - Number.parseFloat(style.borderBottomWidth) / 2;
      readings.push({
        topGap: Math.abs(Number(svg.getAttribute('data-source-top-y')) - topBorderCenter),
        bottomGap: Math.abs(Number(svg.getAttribute('data-source-bottom-y')) - bottomBorderCenter),
        sourceOverlap: rect.right - Number(svg.getAttribute('data-source-x')),
      });
    };
    window.addEventListener('scroll', record, { passive: true });
    for (let step = 0; step < 6; step += 1) {
      window.scrollBy(0, 6);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    window.removeEventListener('scroll', record);
    return readings;
  });
  expect(samples.length).toBeGreaterThanOrEqual(4);
  samples.forEach(({ topGap, bottomGap, sourceOverlap }) => {
    expect(topGap).toBeLessThanOrEqual(0.6);
    expect(bottomGap).toBeLessThanOrEqual(0.6);
    expect(sourceOverlap).toBeGreaterThanOrEqual(2);
    expect(sourceOverlap).toBeLessThanOrEqual(4);
  });
});

test('updates divider junctions in the same frame as their curves while scrolling', async ({ page }) => {
  await expectConnectedBridge(page);
  const gaps = await page.evaluate(async () => {
    const readings: Array<{ upper: number; lower: number }> = [];
    const point = (
      element: SVGGraphicsElement,
      x: number,
      y: number,
    ) => {
      const svg = element.ownerSVGElement!;
      const value = svg.createSVGPoint();
      value.x = x;
      value.y = y;
      return value.matrixTransform(element.getScreenCTM()!);
    };
    const record = () => {
      const layer = document.querySelector<SVGGElement>(
        '[data-testid="weave-bridge"] [data-weave-layer="current"]',
      );
      const upperPath = layer?.querySelector<SVGPathElement>('[data-testid="weave-strand-upper"]');
      const lowerPath = layer?.querySelector<SVGPathElement>('[data-testid="weave-strand-lower"]');
      const upperRail = layer?.querySelector<SVGLineElement>('[data-testid="weave-divider-rail-upper"]');
      const lowerRail = layer?.querySelector<SVGLineElement>('[data-testid="weave-divider-rail-lower"]');
      if (!upperPath || !lowerPath || !upperRail || !lowerRail) return;

      const upperEnd = upperPath.getPointAtLength(upperPath.getTotalLength())
        .matrixTransform(upperPath.getScreenCTM()!);
      const lowerEnd = lowerPath.getPointAtLength(lowerPath.getTotalLength())
        .matrixTransform(lowerPath.getScreenCTM()!);
      const upperStart = point(upperRail, upperRail.x1.baseVal.value, upperRail.y1.baseVal.value);
      const lowerStart = point(lowerRail, lowerRail.x1.baseVal.value, lowerRail.y1.baseVal.value);
      readings.push({
        upper: Math.hypot(upperEnd.x - upperStart.x, upperEnd.y - upperStart.y),
        lower: Math.hypot(lowerEnd.x - lowerStart.x, lowerEnd.y - lowerStart.y),
      });
    };

    for (let step = 0; step < 6; step += 1) {
      window.scrollBy(0, 12);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      record();
    }
    return readings;
  });

  expect(gaps.length).toBe(6);
  gaps.forEach(({ upper, lower }) => {
    expect(upper).toBeLessThanOrEqual(1);
    expect(lower).toBeLessThanOrEqual(1);
  });
});

test('keeps partially off-screen focus edges continuous and viewport-clipped', async ({ page }) => {
  await page.goto(`/AIWorkforce/posts/${stickyFocusId}`);
  await expect(activePost(page)).toBeVisible();
  await expectConnectedBridge(page);

  const [cardBefore, nav] = await Promise.all([
    activePost(page).boundingBox(),
    page.getByTestId('top-nav').boundingBox(),
  ]);
  expect(cardBefore && nav).toBeTruthy();
  const navBottom = nav!.y + nav!.height;
  const scrollDistance = Math.max(40, cardBefore!.y - navBottom + 48);
  await page.evaluate((distance) => window.scrollBy(0, distance), scrollDistance);
  await expect(bridge(page)).toHaveAttribute('data-source-kind', 'card');
  await expect.poll(async () => {
    const [g, card] = await Promise.all([geometry(page), activePost(page).boundingBox()]);
    return card ? Math.abs(g.sourceTopY - card.y) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(3);

  const [g, cardAfter, connectedClip] = await Promise.all([
    geometry(page),
    activePost(page).boundingBox(),
    bridge(page).getByTestId('weave-strand-upper')
      .evaluate((path) => path.parentElement?.getAttribute('clip-path')),
  ]);
  expect(cardAfter).toBeTruthy();
  expect(cardAfter!.y).toBeLessThan(navBottom - 16);
  expect(cardAfter!.y + cardAfter!.height).toBeGreaterThan(navBottom + 32);
  expectNear(g.sourceTopY, cardAfter!.y, 3);
  expect(g.sourceTopY).toBeLessThan(navBottom);
  expect(g.targetTopY).toBeLessThan(g.sourceTopY);
  expect(connectedClip).toBeNull();
  await expect(bridge(page)).toHaveCSS('overflow', 'hidden');
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
  expect(g.targetX - g.sourceX).toBeGreaterThanOrEqual(46);
  expect(g.targetX - g.sourceX).toBeLessThanOrEqual(56);
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
  expect(g.targetX - g.sourceX).toBeGreaterThanOrEqual(46);
  expect(g.targetX - g.sourceX).toBeLessThanOrEqual(56);
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
