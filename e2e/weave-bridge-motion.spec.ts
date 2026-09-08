import { expect, test, type Page } from '@playwright/test';
import mockData from '../src/app/FakeData/listy-injection.json';

const stickyFocusId = (mockData as any[]).find((entry) => entry.replies?.length >= 10)!.focusPost.id as string;

type Layer = {
  slot: string | null;
  id: string | null;
  phase: string | null;
  sourceKind: string | null;
  morphDelay: number;
};
type SourceFrame = { id: string; phase: string | null; rightBorder: string };
type Aperture = {
  id: string;
  width: number;
  height: number;
  dividerSpan: number;
  rightBorder: string;
};
type Snapshot = {
  state: string | null;
  motion: string | null;
  revision: string | null;
  layers: Layer[];
  openIds: string[];
  sourceFrames: SourceFrame[];
  aperture: Aperture | null;
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
      const currentLayer = bridge.querySelector('[data-weave-layer="current"]');
      const focusId = currentLayer?.getAttribute('data-focus-id') ?? '';
      const reveal = currentLayer?.querySelector<SVGRectElement>('[data-testid="weave-reveal-window"]');
      const upperDivider = currentLayer?.querySelector<SVGLineElement>('[data-testid="weave-divider-rail-upper"]');
      const lowerDivider = currentLayer?.querySelector<SVGLineElement>('[data-testid="weave-divider-rail-lower"]');
      const source = document.querySelector<HTMLElement>(
        `[data-testid="post"][data-post-id="${CSS.escape(focusId)}"]`,
      );
      const box = reveal?.getBBox();
      const snapshot: Snapshot = {
        state: bridge.getAttribute('data-weave-state'),
        motion: bridge.getAttribute('data-weave-motion'),
        revision: bridge.getAttribute('data-weave-revision'),
        layers: Array.from(bridge.querySelectorAll('[data-testid="weave-bridge-layer"]')).map((layer) => ({
          slot: layer.getAttribute('data-weave-layer'),
          id: layer.getAttribute('data-focus-id'),
          phase: layer.getAttribute('data-phase'),
          sourceKind: layer.getAttribute('data-source-kind'),
          morphDelay: Number(layer.getAttribute('data-morph-delay-ms')),
        })),
        openIds: Array.from(document.querySelectorAll('[data-weave-source-open="true"]'))
          .map((post) => post.getAttribute('data-post-id') ?? '')
          .filter(Boolean)
          .sort(),
        sourceFrames: Array.from(document.querySelectorAll('[data-weave-source-open="true"]'))
          .map((post) => ({
            id: post.getAttribute('data-post-id') ?? '',
            phase: post.getAttribute('data-weave-source-phase'),
            rightBorder: getComputedStyle(post).borderRightColor,
          }))
          .filter((frame) => Boolean(frame.id))
          .sort((a, b) => a.id.localeCompare(b.id)),
        aperture: box && source ? {
          id: focusId,
          width: box.width,
          height: box.height,
          dividerSpan: upperDivider && lowerDivider
            ? Math.abs(Number(upperDivider.getAttribute('y2')) - Number(upperDivider.getAttribute('y1')))
              + Math.abs(Number(lowerDivider.getAttribute('y2')) - Number(lowerDivider.getAttribute('y1')))
            : 0,
          rightBorder: getComputedStyle(source).borderRightColor,
        } : null,
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
  const incoming = history.flatMap((event) => event.layers).filter((layer) =>
    layer.slot === 'current' && layer.id === nextId && layer.phase === 'entering');
  expect(incoming.length).toBeGreaterThan(0);
  expect(incoming.every((layer) => layer.morphDelay > 0 && layer.morphDelay < 220)).toBe(true);
  expect(history.some((event) =>
    event.aperture?.id === nextId
    && event.aperture.width > 8
    && event.layers.some((layer) =>
      layer.slot === 'outgoing' && layer.id === firstId && layer.phase === 'exiting'))).toBe(true);
  const handoff = history.filter((event) => event.state === 'retargeting');
  expect(handoff.every((event) => event.openIds.length <= 2)).toBe(true);
  const coupledExit = history.findIndex((event) =>
    event.layers.some((layer) => layer.slot === 'outgoing' && layer.id === firstId && layer.phase === 'exiting')
    && event.sourceFrames.some((frame) => frame.id === firstId && frame.phase === 'closing'));
  expect(coupledExit).toBeGreaterThanOrEqual(0);
  expect(history.flatMap((event) => event.sourceFrames)
    .every((frame) => frame.rightBorder === 'rgba(0, 0, 0, 0)')).toBe(true);
  await expect(page.locator(`[data-post-id="${firstId}"][data-testid="post"]`))
    .not.toHaveAttribute('data-weave-source-open', 'true');
  await expect(page.locator(`[data-post-id="${nextId}"][data-testid="post"]`))
    .toHaveAttribute('data-weave-source-open', 'true');
  expect(history.every((event) => {
    const active = event.layers.filter((layer) => layer.slot === 'current');
    const old = event.layers.filter((layer) => layer.slot === 'outgoing');
    return active.length <= 1 && old.length <= 1 && (
      !active[0] || !old[0]
      || active[0].id !== old[0].id
      || active[0].sourceKind !== old[0].sourceKind
    );
  })).toBe(true);
});

test('grows the open bridge and divider together without reconstructing a right edge', async ({ page }) => {
  await openDemo(page);
  const firstId = await current(page).getAttribute('data-focus-id');
  await clearEvents(page);
  const nextId = await scrollToPost(page, 2);
  await expect(current(page)).toHaveAttribute('data-focus-id', nextId);
  await expect(current(page)).toHaveAttribute('data-phase', 'connected');
  const samples = (await events(page)).flatMap((event) => event.aperture?.id === nextId
    ? [event.aperture] : []);
  expect(Math.max(...samples.map((sample) => sample.width))
    - Math.min(...samples.map((sample) => sample.width))).toBeGreaterThan(12);
  expect(Math.max(...samples.map((sample) => sample.height))
    - Math.min(...samples.map((sample) => sample.height))).toBeGreaterThan(40);
  expect(Math.max(...samples.map((sample) => sample.dividerSpan))
    - Math.min(...samples.map((sample) => sample.dividerSpan))).toBeGreaterThan(80);
  expect(samples.some((sample) => sample.width > 8 && sample.height > 40
    && sample.dividerSpan > 30)).toBe(true);
  expect(samples.every((sample) => sample.rightBorder === 'rgba(0, 0, 0, 0)')).toBe(true);
  await expect(page.locator(`[data-post-id="${firstId}"][data-testid="post"]`))
    .not.toHaveAttribute('data-weave-source-open', 'true');
});

test('never skips the open-source lifecycle across repeated focus handoffs', async ({ page }) => {
  await openDemo(page);
  for (const index of [1, 3, 0, 2]) {
    await clearEvents(page);
    const id = await scrollToPost(page, index);
    await expect(current(page)).toHaveAttribute('data-focus-id', id);
    await expect(current(page)).toHaveAttribute('data-phase', 'connected');
    await expect(page.locator(`[data-post-id="${id}"][data-testid="post"]`))
      .toHaveAttribute('data-weave-source-phase', 'open');
    const history = await events(page);
    expect(history.some((event) => event.sourceFrames.some((frame) =>
      frame.id === id && frame.phase === 'opening'))).toBe(true);
    expect(history.some((event) => event.sourceFrames.some((frame) =>
      frame.id === id && frame.phase === 'open'))).toBe(true);
  }
});

test('animates the same focus when its source changes between card and sticky bar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installRecorder(page);
  await page.goto(`/AIWorkforce/posts/${stickyFocusId}`);
  await expect(page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]')).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-weave-state', 'connected');
  await expect(root(page)).toHaveAttribute('data-source-kind', 'card');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(1200);

  await clearEvents(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(root(page)).toHaveAttribute('data-source-kind', 'sticky');
  await expect(root(page)).toHaveAttribute('data-weave-state', 'connected');
  let history = await events(page);
  expect(history.some((event) => event.layers.some((layer) =>
    layer.id === stickyFocusId && layer.phase === 'entering' && layer.sourceKind === 'sticky'))).toBe(true);

  await clearEvents(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(root(page)).toHaveAttribute('data-source-kind', 'card');
  await expect(root(page)).toHaveAttribute('data-weave-state', 'connected');
  await expect(page.locator(`[data-post-id="${stickyFocusId}"][data-testid="post"]`))
    .toHaveAttribute('data-weave-source-phase', 'open');
  history = await events(page);
  expect(history.some((event) => event.layers.some((layer) =>
    layer.id === stickyFocusId && layer.phase === 'entering' && layer.sourceKind === 'card'))).toBe(true);
  expect(history.some((event) => event.sourceFrames.some((frame) =>
    frame.id === stickyFocusId && frame.phase === 'opening'))).toBe(true);
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
