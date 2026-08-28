import { expect, test, type Page } from '@playwright/test';

type Layer = { slot: string | null; id: string | null; phase: string | null };
type SourceFrame = { id: string; phase: string | null };
type Snapshot = {
  state: string | null;
  motion: string | null;
  revision: string | null;
  layers: Layer[];
  openIds: string[];
  sourceFrames: SourceFrame[];
};
type RecorderWindow = Window & { __weaveEvents?: Snapshot[]; __weaveSignature?: string };

const root = (page: Page) => page.getByTestId('weave-bridge');
const current = (page: Page) => root(page).locator('[data-weave-layer="current"]');
const outgoing = (page: Page) => root(page).locator('[data-weave-layer="outgoing"]');

async function installRecorder(page: Page) {
  await page.addInitScript(() => {
    const state = window as RecorderWindow;
    state.__weaveEvents = [];
    const record = () => {
      const bridge = document.querySelector('[data-testid="weave-bridge"]');
      if (!bridge) return;
      const snapshot: Snapshot = {
        state: bridge.getAttribute('data-weave-state'),
        motion: bridge.getAttribute('data-weave-motion'),
        revision: bridge.getAttribute('data-weave-revision'),
        layers: Array.from(bridge.querySelectorAll('[data-testid="weave-bridge-layer"]')).map((layer) => ({
          slot: layer.getAttribute('data-weave-layer'),
          id: layer.getAttribute('data-focus-id'),
          phase: layer.getAttribute('data-phase'),
        })),
        openIds: Array.from(document.querySelectorAll('[data-weave-source-open="true"]'))
          .map((post) => post.getAttribute('data-post-id') ?? '')
          .filter(Boolean)
          .sort(),
        sourceFrames: Array.from(document.querySelectorAll('[data-weave-source-open="true"]'))
          .map((post) => ({
            id: post.getAttribute('data-post-id') ?? '',
            phase: post.getAttribute('data-weave-source-phase'),
          }))
          .filter((frame) => Boolean(frame.id))
          .sort((a, b) => a.id.localeCompare(b.id)),
      };
      const signature = JSON.stringify(snapshot);
      if (signature === state.__weaveSignature) return;
      state.__weaveSignature = signature;
      state.__weaveEvents!.push(snapshot);
    };
    new MutationObserver(record).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

async function openDemo(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await installRecorder(page);
  await page.goto('/AIWorkforce');
  await expect(page.locator('[data-demo-feed-post]').first()).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-weave-state', 'connected');
  await expect(current(page)).toHaveAttribute('data-phase', 'connected');
}

async function events(page: Page) {
  return page.evaluate(() => (window as RecorderWindow).__weaveEvents ?? []);
}

async function clearEvents(page: Page) {
  await page.evaluate(() => { (window as RecorderWindow).__weaveEvents = []; });
}

async function scrollToPost(page: Page, index: number) {
  const post = page.locator('[data-demo-feed-post]').nth(index);
  const id = (await post.getAttribute('data-demo-feed-post'))!;
  await post.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top - window.innerHeight * 0.3 + 100);
  });
  return id;
}

test('records first reveal entering then connected', async ({ page }) => {
  await openDemo(page);
  const id = await current(page).getAttribute('data-focus-id');
  await expect.poll(async () => (await events(page)).some((event) =>
    event.layers.some((layer) => layer.id === id && layer.phase === 'entering'))).toBe(true);
  const history = await events(page);
  const entering = history.findIndex((event) => event.layers.some((layer) => layer.id === id && layer.phase === 'entering'));
  const connected = history.findIndex((event) => event.layers.some((layer) => layer.id === id && layer.phase === 'connected'));
  expect(connected).toBeGreaterThan(entering);
});

test('switches A to B and settles with one correctly keyed layer', async ({ page }) => {
  await openDemo(page);
  const firstId = await current(page).getAttribute('data-focus-id');
  await clearEvents(page);
  const nextId = await scrollToPost(page, 2);
  await expect(current(page)).toHaveAttribute('data-focus-id', nextId);
  await expect(current(page)).toHaveAttribute('data-phase', 'connected');
  await expect(outgoing(page)).toHaveCount(0);
  await expect(root(page).getByTestId('weave-bridge-layer')).toHaveCount(1);
  expect(nextId).not.toBe(firstId);
  const history = await events(page);
  expect(history.some((event) => event.layers.some((layer) =>
    layer.slot === 'current' && layer.id === nextId && layer.phase === 'entering'))).toBe(true);
  expect(history.some((event) => event.layers.some((layer) =>
    layer.slot === 'outgoing' && layer.id === firstId && layer.phase === 'exiting'))).toBe(true);
  const handoff = history.filter((event) => event.state === 'retargeting');
  expect(handoff.every((event) => event.openIds.length <= 2)).toBe(true);
  const oldRetracting = history.findIndex((event) =>
    event.layers.some((layer) => layer.slot === 'outgoing' && layer.id === firstId && layer.phase === 'exiting')
    && event.sourceFrames.some((frame) => frame.id === firstId && frame.phase === 'open'));
  const oldClosing = history.findIndex((event) =>
    !event.layers.some((layer) => layer.id === firstId)
    && event.sourceFrames.some((frame) => frame.id === firstId && frame.phase === 'closing'));
  expect(oldRetracting).toBeGreaterThanOrEqual(0);
  expect(oldClosing).toBeGreaterThan(oldRetracting);
  await expect(page.locator(`[data-post-id="${firstId}"][data-testid="post"]`))
    .not.toHaveAttribute('data-weave-source-open', 'true');
  await expect(page.locator(`[data-post-id="${nextId}"][data-testid="post"]`))
    .toHaveAttribute('data-weave-source-open', 'true');
  expect(history.every((event) => {
    const active = event.layers.filter((layer) => layer.slot === 'current');
    const old = event.layers.filter((layer) => layer.slot === 'outgoing');
    return active.length <= 1 && old.length <= 1 && (!active[0] || !old[0] || active[0].id !== old[0].id);
  })).toBe(true);
});

test('opens the source midpoint before revealing the bridge', async ({ page }) => {
  await openDemo(page);
  const firstId = await current(page).getAttribute('data-focus-id');
  const nextId = await scrollToPost(page, 2);
  await expect(current(page)).toHaveAttribute('data-focus-id', nextId);
  await expect(current(page)).toHaveAttribute('data-phase', 'entering');

  const nextCard = page.locator(`[data-post-id="${nextId}"][data-testid="post"]`);
  await page.waitForFunction((id) => document.querySelector(
    `[data-post-id="${id}"][data-testid="post"]`,
  )?.getAttribute('data-weave-source-phase') === 'opening', nextId, { polling: 'raf' });
  const [revealWidth, sourceX, railMotion] = await Promise.all([
    root(page).getByTestId('weave-reveal-window').evaluate((rect) =>
      Number.parseFloat(rect.getAttribute('width') ?? '')),
    root(page).getAttribute('data-source-x').then(Number),
    nextCard.evaluate((card) => ({
      topAnimation: getComputedStyle(card, '::before').animationName,
      bottomAnimation: getComputedStyle(card, '::after').animationName,
    })),
  ]);
  expect(revealWidth).toBeLessThanOrEqual(sourceX + 1);
  expect(railMotion).toEqual({
    topAnimation: 'weave-source-edge-open',
    bottomAnimation: 'weave-source-edge-open',
  });

  await expect(nextCard).toHaveAttribute('data-weave-source-phase', 'open');
  await expect.poll(async () => Number.parseFloat(
    await root(page).getByTestId('weave-reveal-window').getAttribute('width') ?? '',
  )).toBeGreaterThan(sourceX + 1);
  await expect(page.locator(`[data-post-id="${firstId}"][data-testid="post"]`))
    .not.toHaveAttribute('data-weave-source-open', 'true');
});

test('rapid retarget keeps only the latest focus and removes stale layers', async ({ page }) => {
  await openDemo(page);
  await clearEvents(page);
  const middleId = await scrollToPost(page, 1);
  await page.waitForFunction((id) => {
    const layer = document.querySelector('[data-weave-layer="current"]');
    return layer?.getAttribute('data-focus-id') === id && layer.getAttribute('data-phase') === 'entering';
  }, middleId);
  const latestId = await scrollToPost(page, 3);
  await expect(current(page)).toHaveAttribute('data-focus-id', latestId);
  await expect(current(page)).toHaveAttribute('data-phase', 'connected');
  await expect(root(page).getByTestId('weave-bridge-layer')).toHaveCount(1);
  await expect(root(page).locator(`[data-focus-id="${middleId}"]`)).toHaveCount(0);
});

test('divider geometry updates without a motion replay or revision change', async ({ page }) => {
  await openDemo(page);
  const revision = await root(page).getAttribute('data-weave-revision');
  const targetX = await root(page).getAttribute('data-target-x');
  await clearEvents(page);
  const divider = page.getByRole('separator', { name: 'Resize feed and related panels' });
  await divider.focus();
  await divider.press('ArrowRight');
  await expect.poll(async () => root(page).getAttribute('data-target-x')).not.toBe(targetX);
  await expect(root(page)).toHaveAttribute('data-weave-revision', revision!);
  await expect(current(page)).toHaveAttribute('data-phase', 'connected');
  await expect(outgoing(page)).toHaveCount(0);
  const history = await events(page);
  expect(history.flatMap((event) => event.layers).every((layer) => layer.phase === 'connected')).toBe(true);
});

test('reduced motion connects immediately without entering or outgoing layers', async ({ page }) => {
  await openDemo(page, 'reduce');
  await expect(root(page)).toHaveAttribute('data-weave-motion', 'reduced');
  await expect(outgoing(page)).toHaveCount(0);
  let history = await events(page);
  expect(history.flatMap((event) => event.layers)
    .every((layer) => layer.phase !== 'entering' && layer.phase !== 'exiting')).toBe(true);
  await clearEvents(page);
  const nextId = await scrollToPost(page, 2);
  await expect(current(page)).toHaveAttribute('data-focus-id', nextId);
  await expect(current(page)).toHaveAttribute('data-phase', 'connected');
  await expect(outgoing(page)).toHaveCount(0);
  history = await events(page);
  expect(history.flatMap((event) => event.layers).every((layer) => layer.phase === 'connected')).toBe(true);
});
