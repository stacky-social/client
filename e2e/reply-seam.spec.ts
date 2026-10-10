import { expect, test, type Page } from '@playwright/test';
import mockData from '../src/app/FakeData/scale-demo.json';
const stickyFocusId = (mockData as any[]).find((entry) => entry.topicId === 'energy-tech' && entry.replies?.length >= 7 && entry.relatedPosts?.length > 0)!.focusPost.id as string;
const bridge = (page: Page) => page.getByTestId('weave-bridge');
const activePost = (page: Page) => page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]');
async function expectConnectedBridge(page: Page) {
  await expect(bridge(page)).toHaveAttribute('data-bridge-state', 'connected');
}
function expectNear(actual: number, expected: number, tolerance: number) { expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance); }
async function geometry(page: Page) {
  return bridge(page).evaluate((svg) => {
    const endpoint = (side: string) => {
      const path = svg.querySelector(`[data-testid="weave-strand-${side}"]`) as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!);
      return { x: point.x, y: point.y };
    };
    return { sourceX: Number(svg.getAttribute('data-source-x')), targetX: Number(svg.getAttribute('data-target-x')), upperEnd: endpoint('upper'), lowerEnd: endpoint('lower') };
  });
}

test('reply view keeps the open seam joined to the divider before and after compaction', async ({ page }) => {
  await page.goto(`/EnergyTech/posts/${stickyFocusId}`);
  const assertSeam = async () => {
    await expectConnectedBridge(page);
    const g = await geometry(page);
    const card = (await activePost(page).boundingBox())!;
    const divider = (await page.getByRole('separator', { name: 'Resize feed and related panels' }).boundingBox())!;
    // Both fillets and their continuation rails share the divider centerline.
    expectNear(g.upperEnd.x, divider.x + divider.width / 2, 0.6);
    expectNear(g.lowerEnd.x, divider.x + divider.width / 2, 0.6);
    expect(card.x + card.width - g.sourceX).toBeGreaterThanOrEqual(2);
    expect(card.x + card.width - g.sourceX).toBeLessThanOrEqual(4);
    for (const side of ['upper', 'lower']) {
      const rail = bridge(page).getByTestId(`weave-divider-rail-${side}`);
      expect(Number(await rail.getAttribute('x1'))).toBeCloseTo(g.targetX, 0);
    }
    await expect(activePost(page)).toHaveCSS('border-right-color', 'rgba(0, 0, 0, 0)');
  };
  await assertSeam();
  await page.screenshot({ path: "/tmp/reply-seam-expanded.png" });
  await page.getByTestId('reply-scroll-region').evaluate((element) => { element.scrollTop = 100; });
  await expect(page.locator('[data-focus-compact]')).toHaveAttribute('data-focus-compact', 'true');
  await assertSeam();
  await page.screenshot({ path: "/tmp/reply-seam-compact.png" });
});
