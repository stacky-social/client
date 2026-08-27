import { expect, test, type Page } from '@playwright/test';
import {
  feedFocusHysteresisPx,
  selectStableFeedFocus,
  type FeedFocusCandidate,
} from '../src/utils/stableFeedFocus';

type FocusSample = {
  activeId: string | null;
  panelFocusId: string | null;
  recordedAt: number;
};

type ViewportFocusSample = {
  activeId: string | null;
  panelFocusId: string | null;
  activeTop: number | null;
  activeBottom: number | null;
  viewportTop: number;
  viewportBottom: number;
  visibleIds: string[];
};

async function openFollowedHome(page: Page) {
  await page.goto('/tag/ChineseEVs');
  const follow = page.getByRole('button', { name: 'Follow hashtag' });
  if (await follow.count()) await follow.click();
  await page.goto('/home');
  await expect(page.locator('[data-store-feed-post]')).toHaveCount(6);
}

async function startFocusRecorder(page: Page) {
  await page.evaluate(() => {
    const state = window as typeof window & {
      __focusSamples?: FocusSample[];
      __focusTimer?: number;
    };
    state.__focusSamples = [];
    let previous = '';
    state.__focusTimer = window.setInterval(() => {
      const activeId = document.querySelector('[data-testid="post"][data-active="true"]')
        ?.getAttribute('data-post-id') ?? null;
      const panelFocusId = document.querySelector('[data-testid="col-aside"] [data-related-focus-post-id]')
        ?.getAttribute('data-related-focus-post-id') ?? null;
      const signature = `${activeId ?? ''}|${panelFocusId ?? ''}`;
      if (signature === previous) return;
      previous = signature;
      state.__focusSamples!.push({ activeId, panelFocusId, recordedAt: performance.now() });
    }, 10);
  });
}

async function stopFocusRecorder(page: Page): Promise<FocusSample[]> {
  return page.evaluate(() => {
    const state = window as typeof window & {
      __focusSamples?: FocusSample[];
      __focusTimer?: number;
    };
    if (state.__focusTimer) window.clearInterval(state.__focusTimer);
    return state.__focusSamples ?? [];
  });
}

async function cardCenterScrollY(page: Page, postId: string) {
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-store-feed-post="${id}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing post ${id}`);
    const rect = element.getBoundingClientRect();
    const viewportTop = document.querySelector<HTMLElement>('[data-testid="top-nav"]')
      ?.getBoundingClientRect().bottom ?? 0;
    const contentCenter = viewportTop + (window.innerHeight - viewportTop) / 2;
    return window.scrollY + rect.top + rect.height / 2 - contentCenter;
  }, postId);
}

async function cardTopLineScrollY(page: Page, postId: string, beyondBoundaryPx = 0) {
  return page.evaluate(({ id, beyond }) => {
    const element = document.querySelector(`[data-post-id="${id}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing post ${id}`);
    return window.scrollY + element.getBoundingClientRect().top
      - (window.innerHeight * 0.3) + beyond;
  }, { id: postId, beyond: beyondBoundaryPx });
}

async function sampleDemoFocusAfterScroll(page: Page, scrollY: number): Promise<ViewportFocusSample> {
  return page.evaluate(async (y) => {
    window.scrollTo(0, y);
    // The live focus listener runs on the first frame. Two additional frames
    // allow React's active-card and panel state to commit before sampling, while
    // remaining well below the former 100/220ms settled-scroll delay.
    await new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ));

    const active = document.querySelector<HTMLElement>(
      '[data-testid="post"][data-active="true"]',
    );
    const activeRect = active?.getBoundingClientRect() ?? null;
    const nav = document.querySelector<HTMLElement>('[data-testid="top-nav"]');
    const viewportTop = nav?.getBoundingClientRect().bottom ?? 0;
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-demo-feed-post]'))
      .map((element) => ({
        id: element.dataset.demoFeedPost ?? '',
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.bottom > viewportTop && rect.top < window.innerHeight)
      .sort((a, b) => a.rect.top - b.rect.top);

    return {
      activeId: active?.dataset.postId ?? null,
      panelFocusId: document.querySelector('[data-testid="col-aside"] [data-related-focus-post-id]')
        ?.getAttribute('data-related-focus-post-id') ?? null,
      activeTop: activeRect?.top ?? null,
      activeBottom: activeRect?.bottom ?? null,
      viewportTop,
      viewportBottom: window.innerHeight,
      visibleIds: visible.map(({ id }) => id),
    };
  }, scrollY);
}

test.describe('stable feed focus', () => {
  test('publishes only the resting post during one continuous multi-post gesture', async ({ page }) => {
    await openFollowedHome(page);
    const startY = await cardCenterScrollY(page, '152053690');
    const endY = await cardCenterScrollY(page, '149289024');
    await page.evaluate((y) => window.scrollTo(0, y), startY);
    await expect(page.locator('[data-store-feed-post="152053690"] [data-testid="post"]'))
      .toHaveAttribute('data-active', 'true');
    await startFocusRecorder(page);

    for (let step = 0; step <= 12; step += 1) {
      const progress = step / 12;
      await page.evaluate((y) => window.scrollTo(0, y), startY + ((endY - startY) * progress));
      await page.waitForTimeout(60);
    }
    const settledAt = Date.now();
    await expect(page.locator('[data-store-feed-post="149289024"] [data-testid="post"]'))
      .toHaveAttribute('data-active', 'true', { timeout: 500 });
    const settleLatencyMs = Date.now() - settledAt;
    await page.waitForTimeout(40);

    const samples = await stopFocusRecorder(page);
    console.log(`[focus-stable:sweep] latency=${settleLatencyMs}ms ${JSON.stringify(samples)}`);
    const activeIds = samples.map(({ activeId }) => activeId);
    expect(activeIds[0]).toBe('152053690');
    expect(activeIds.at(-1)).toBe('149289024');
    // Frame cadence can allow intervening cards to settle during a long sweep.
    // Focus must still move forward without oscillating or publishing twice.
    expect(new Set(activeIds).size).toBe(activeIds.length);
    expect(samples.every(({ activeId, panelFocusId }) => activeId === panelFocusId)).toBe(true);
    expect(settleLatencyMs).toBeLessThan(300);
  });

  test('does not oscillate around an adjacent-card boundary', async ({ page }) => {
    await openFollowedHome(page);
    const firstY = await cardCenterScrollY(page, '152053690');
    const secondY = await cardCenterScrollY(page, '152047717');
    const boundary = (firstY + secondY) / 2;
    await page.evaluate((y) => window.scrollTo(0, y), boundary - 24);
    await page.waitForTimeout(280);
    await expect(page.locator('[data-store-feed-post="152053690"] [data-testid="post"]'))
      .toHaveAttribute('data-active', 'true');
    await startFocusRecorder(page);

    for (const offset of [24, -24, 24, -24, 24, -24]) {
      await page.evaluate((y) => window.scrollTo(0, y), boundary + offset);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(280);

    const samples = await stopFocusRecorder(page);
    console.log(`[focus-stable:jitter] ${JSON.stringify(samples)}`);
    expect(samples.map(({ activeId }) => activeId)).toEqual(['152053690']);
    expect(samples.every(({ activeId, panelFocusId }) => activeId === panelFocusId)).toBe(true);
  });

  test('coalesces a top-anchored ChineseEVs feed gesture into one panel change', async ({ page }) => {
    await page.goto('/ChineseEVs');
    await expect(page.locator('[data-testid="post"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="post"][data-post-id="143195604"]'))
      .toHaveAttribute('data-active', 'true');
    const startY = await cardTopLineScrollY(page, '143195604');
    const endY = await cardTopLineScrollY(page, '149289030', 100);
    await startFocusRecorder(page);

    for (let step = 0; step <= 12; step += 1) {
      const progress = step / 12;
      await page.evaluate((y) => window.scrollTo(0, y), startY + ((endY - startY) * progress));
      await page.waitForTimeout(60);
    }
    await expect(page.locator('[data-testid="post"][data-post-id="149289030"]'))
      .toHaveAttribute('data-active', 'true', { timeout: 500 });
    await page.waitForTimeout(40);

    const samples = await stopFocusRecorder(page);
    console.log(`[focus-stable:top-line] ${JSON.stringify(samples)}`);
    const activeIds = samples.map(({ activeId }) => activeId);
    expect(activeIds[0]).toBe('143195604');
    expect(activeIds.at(-1)).toBe('149289030');
    // A long sweep may settle briefly on an intervening card, but must never
    // oscillate backward or publish the same card twice.
    expect(new Set(activeIds).size).toBe(activeIds.length);
    expect(samples.every(({ activeId, panelFocusId }) => activeId === panelFocusId)).toBe(true);
  });

  test('keeps the active demo card visible and synchronized on every scroll frame', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/AIWorkforce');
    await expect(page.locator('[data-demo-feed-post]')).toHaveCount(4);
    const firstId = await page.locator('[data-demo-feed-post]').first()
      .getAttribute('data-demo-feed-post');
    await expect(page.locator(`[data-testid="post"][data-post-id="${firstId}"]`))
      .toHaveAttribute('data-active', 'true');

    const targetY = await page.locator('[data-demo-feed-post]').nth(3).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return window.scrollY + rect.top - window.innerHeight * 0.3 + 100;
    });
    const jumped = await sampleDemoFocusAfterScroll(page, targetY);
    expect(jumped.activeId).not.toBe(firstId);
    expect(jumped.visibleIds).toContain(jumped.activeId);
    expect(jumped.activeBottom).toBeGreaterThan(jumped.viewportTop);
    expect(jumped.activeTop).toBeLessThan(jumped.viewportBottom);
    expect(jumped.panelFocusId).toBe(jumped.activeId);
    await expect(page.getByTestId('weave-bridge')).toHaveAttribute('data-focus-id', jumped.activeId!);

    const top = await sampleDemoFocusAfterScroll(page, 0);
    expect(top.activeId).toBe(top.visibleIds[0]);
    expect(top.panelFocusId).toBe(top.activeId);
    await expect(page.getByTestId('weave-bridge')).toHaveAttribute('data-focus-id', top.activeId!);

    const documentBottom = await page.evaluate(() => document.documentElement.scrollHeight);
    const bottom = await sampleDemoFocusAfterScroll(page, documentBottom);
    expect(bottom.activeId).toBe(bottom.visibleIds.at(-1));
    expect(bottom.activeBottom).toBeGreaterThan(bottom.viewportTop);
    expect(bottom.activeTop).toBeLessThan(bottom.viewportBottom);
    expect(bottom.panelFocusId).toBe(bottom.activeId);
    await expect(page.getByTestId('weave-bridge')).toHaveAttribute('data-focus-id', bottom.activeId!);
  });
});

test.describe('focus retention algorithm', () => {
  const centerCandidates: Array<FeedFocusCandidate<string>> = [
    { id: 'a', value: 'a', rect: { top: 100, bottom: 500, height: 400 } },
    { id: 'b', value: 'b', rect: { top: 500, bottom: 900, height: 400 } },
  ];

  test('retains center focus inside the hysteresis band and releases beyond it', () => {
    expect(feedFocusHysteresisPx(1000)).toBe(80);
    expect(selectStableFeedFocus({
      candidates: centerCandidates,
      currentId: 'a',
      viewportHeight: 1000,
      mode: 'center',
    })?.id).toBe('a');

    const decisiveMove = centerCandidates.map((candidate) => ({
      ...candidate,
      rect: { ...candidate.rect, top: candidate.rect.top - 100, bottom: candidate.rect.bottom - 100 },
    }));
    expect(selectStableFeedFocus({
      candidates: decisiveMove,
      currentId: 'a',
      viewportHeight: 1000,
      mode: 'center',
    })?.id).toBe('b');
  });

  test('uses a two-sided retention band around a top anchor', () => {
    const downBoundary: Array<FeedFocusCandidate<string>> = [
      { id: 'a', value: 'a', rect: { top: -100, bottom: 260, height: 360 } },
      { id: 'b', value: 'b', rect: { top: 260, bottom: 620, height: 360 } },
    ];
    expect(selectStableFeedFocus({
      candidates: downBoundary,
      currentId: 'a',
      viewportHeight: 1000,
      mode: 'top-line',
    })?.id).toBe('a');

    downBoundary[1].rect = { top: 210, bottom: 570, height: 360 };
    expect(selectStableFeedFocus({
      candidates: downBoundary,
      currentId: 'a',
      viewportHeight: 1000,
      mode: 'top-line',
    })?.id).toBe('b');

    downBoundary[1].rect = { top: 340, bottom: 700, height: 360 };
    expect(selectStableFeedFocus({
      candidates: downBoundary,
      currentId: 'b',
      viewportHeight: 1000,
      mode: 'top-line',
    })?.id).toBe('b');
    downBoundary[1].rect = { top: 390, bottom: 750, height: 360 };
    expect(selectStableFeedFocus({
      candidates: downBoundary,
      currentId: 'b',
      viewportHeight: 1000,
      mode: 'top-line',
    })?.id).toBe('a');
  });

  test('does not retain a card hidden behind the sticky navigation', () => {
    const candidates: Array<FeedFocusCandidate<string>> = [
      { id: 'hidden', value: 'hidden', rect: { top: -300, bottom: 40, height: 340 } },
      { id: 'visible', value: 'visible', rect: { top: 72, bottom: 420, height: 348 } },
    ];
    expect(selectStableFeedFocus({
      candidates,
      currentId: 'hidden',
      viewportTop: 56,
      viewportHeight: 900,
      mode: 'center',
    })?.id).toBe('visible');
  });

  test('selects the first and last visible cards at feed boundaries', () => {
    const unordered: Array<FeedFocusCandidate<string>> = [
      { id: 'below', value: 'below', rect: { top: 920, bottom: 1220, height: 300 } },
      { id: 'last-visible', value: 'last-visible', rect: { top: 520, bottom: 840, height: 320 } },
      { id: 'first-visible', value: 'first-visible', rect: { top: 80, bottom: 400, height: 320 } },
      { id: 'behind-nav', value: 'behind-nav', rect: { top: -250, bottom: 48, height: 298 } },
    ];
    expect(selectStableFeedFocus({
      candidates: unordered,
      currentId: 'last-visible',
      viewportTop: 56,
      viewportHeight: 900,
      mode: 'center',
      atTop: true,
    })?.id).toBe('first-visible');
    expect(selectStableFeedFocus({
      candidates: unordered,
      currentId: 'first-visible',
      viewportTop: 56,
      viewportHeight: 900,
      mode: 'center',
      atBottom: true,
    })?.id).toBe('last-visible');
  });
});
