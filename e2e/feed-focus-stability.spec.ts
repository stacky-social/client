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
    return window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
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
});
