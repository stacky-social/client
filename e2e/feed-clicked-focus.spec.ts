import { expect, test, type Page } from '@playwright/test';
import { feedFocusHysteresisPx } from '../src/utils/stableFeedFocus';

// Clicked-focus protocol: clicking a topic phrase on a non-focused feed post
// focuses that post WHERE IT SITS (no window scroll) and pins it until the
// reader scrolls it onto the reading line (silent handoff) or more than one
// hysteresis band away from it (release to scroll-driven focus).

type Target = { id: string; top: number; bottom: number };

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  ));
}

async function activeId(page: Page) {
  return page.locator('[data-testid="feed"] [data-testid="post"][data-active="true"]')
    .first().getAttribute('data-post-id');
}

async function openDemoFeed(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/AIWorkforce');
  await expect(page.locator('[data-demo-feed-post]').nth(3)).toBeVisible();
  await expect(page.locator('[data-testid="post"][data-active="true"]')).toHaveCount(1);
}

/**
 * A non-focused post below the reading line and outside the retention band —
 * the scroll picker would never choose it here — with a phrase on screen.
 */
async function lowerTarget(page: Page): Promise<Target | null> {
  return page.evaluate((band) => {
    const nav = document.querySelector<HTMLElement>('[data-testid="top-nav"]');
    const viewportTop = nav?.getBoundingClientRect().bottom ?? 0;
    const line = viewportTop + (window.innerHeight - viewportTop) * 0.3;
    for (const wrapper of Array.from(document.querySelectorAll<HTMLElement>('[data-demo-feed-post]'))) {
      const post = wrapper.querySelector<HTMLElement>('[data-testid="post"]');
      if (!post || post.dataset.active === 'true') continue;
      const rect = wrapper.getBoundingClientRect();
      if (rect.top <= line + band + 8) continue;
      const mark = Array.from(post.querySelectorAll<HTMLElement>(
        '[data-testid="focus-reveal"] mark[data-range-ids]',
      )).find((candidate) => {
        const box = candidate.getBoundingClientRect();
        return box.width > 0 && box.top > viewportTop && box.bottom < window.innerHeight - 4;
      });
      if (!mark) continue;
      mark.setAttribute('data-e2e-click-target', 'true');
      return { id: wrapper.dataset.demoFeedPost!, top: rect.top, bottom: rect.bottom };
    }
    return null;
  }, feedFocusHysteresisPx(900 - 56));
}

async function clickTarget(page: Page) {
  await page.locator('[data-e2e-click-target="true"]').click();
}

test.describe('clicked feed focus', () => {
  test('clicking a phrase on a lower post focuses it without scrolling, and keeps it while scrolling toward it', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDemoFeed(page);
    const target = await lowerTarget(page);
    expect(target, 'a lower post with an on-screen phrase').toBeTruthy();

    const before = await page.evaluate(() => window.scrollY);
    await clickTarget(page);
    await expect(page.locator(`[data-testid="post"][data-post-id="${target!.id}"]`))
      .toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('col-aside').locator('[data-related-focus-post-id]').first())
      .toHaveAttribute('data-related-focus-post-id', target!.id);
    await page.waitForTimeout(250);
    expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThanOrEqual(1);
    expect(new URL(page.url()).pathname).toBe('/AIWorkforce');
    await expect(page.locator(`[data-testid="post"][data-post-id="${target!.id}"]`))
      .toHaveAttribute('data-active', 'true');

    // Scroll toward the clicked post in small steps: other posts cross the
    // reading line on the way, but focus never leaves the clicked post.
    const seen = new Set<string | null>();
    for (let step = 0; step < 12; step += 1) {
      await page.evaluate(() => window.scrollBy(0, 30));
      await settle(page);
      seen.add(await activeId(page));
    }
    await page.waitForTimeout(300);
    seen.add(await activeId(page));
    expect(Array.from(seen)).toEqual([target!.id]);
    await expect(page.getByTestId('weave-bridge')).toHaveAttribute('data-focus-id', target!.id);
    expect(errors).toEqual([]);
  });

  test('scrolling away from the clicked post beyond the band returns to scroll focus', async ({ page }) => {
    await openDemoFeed(page);
    // Start mid-feed so there is room to scroll away (upward) from the pin.
    await page.evaluate(() => {
      const second = document.querySelectorAll<HTMLElement>('[data-demo-feed-post]')[1];
      const rect = second.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + rect.top - window.innerHeight * 0.3 + 20);
    });
    await page.waitForTimeout(350);
    const target = await lowerTarget(page);
    expect(target).toBeTruthy();
    await clickTarget(page);
    await expect(page.locator(`[data-testid="post"][data-post-id="${target!.id}"]`))
      .toHaveAttribute('data-active', 'true');

    // A reversal smaller than the band keeps the pin.
    await page.evaluate(() => window.scrollBy(0, -30));
    await settle(page);
    await page.waitForTimeout(300);
    expect(await activeId(page)).toBe(target!.id);

    // Moving it more than one band further from the line releases it.
    await page.evaluate(() => window.scrollBy(0, -150));
    await settle(page);
    await expect.poll(() => activeId(page)).not.toBe(target!.id);
    const released = await activeId(page);
    await expect(page.getByTestId('col-aside').locator('[data-related-focus-post-id]').first())
      .toHaveAttribute('data-related-focus-post-id', released!);
  });

  test('Home uses the same protocol: no scroll on click, pin held while scrolling toward it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tag/ChineseEVs');
    const follow = page.getByRole('button', { name: 'Follow hashtag' });
    if (await follow.count()) await follow.click();
    await page.goto('/home');
    await expect(page.locator('[data-store-feed-post]').nth(4)).toBeVisible();
    await expect(page.locator('[data-testid="post"][data-active="true"]')).toHaveCount(1);
    // Home measures against the content centre and its order is shuffled per
    // session: step down the feed until a non-focused post sits below the
    // centre line, outside the band, with a phrase on screen.
    let target: string | null = null;
    for (let y = 100; y <= 3000 && !target; y += 100) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(300);
      target = await page.evaluate((band) => {
        const nav = document.querySelector<HTMLElement>('[data-testid="top-nav"]');
        const viewportTop = nav?.getBoundingClientRect().bottom ?? 0;
        const line = viewportTop + (window.innerHeight - viewportTop) / 2;
        for (const wrapper of Array.from(document.querySelectorAll<HTMLElement>('[data-store-feed-post]'))) {
          const post = wrapper.querySelector<HTMLElement>('[data-testid="post"]');
          if (!post || post.dataset.active === 'true') continue;
          const rect = wrapper.getBoundingClientRect();
          if (rect.top <= line + band + 8) continue;
          const mark = Array.from(post.querySelectorAll<HTMLElement>(
            '[data-testid="focus-reveal"] mark[data-range-ids]',
          )).find((candidate) => {
            const box = candidate.getBoundingClientRect();
            return box.width > 0 && box.top > viewportTop && box.bottom < window.innerHeight - 4;
          });
          if (!mark) continue;
          mark.setAttribute('data-e2e-click-target', 'true');
          return wrapper.dataset.storeFeedPost!;
        }
        return null;
      }, feedFocusHysteresisPx(900 - 56));
    }
    test.skip(!target, 'no lower Home post with an on-screen phrase at this viewport');

    const before = await page.evaluate(() => window.scrollY);
    await clickTarget(page);
    await expect(page.locator(`[data-store-feed-post="${target}"] [data-testid="post"]`))
      .toHaveAttribute('data-active', 'true');
    await page.waitForTimeout(250);
    expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThanOrEqual(1);

    const seen = new Set<string | null>();
    for (let step = 0; step < 6; step += 1) {
      await page.evaluate(() => window.scrollBy(0, 25));
      await settle(page);
      seen.add(await activeId(page));
    }
    await page.waitForTimeout(300);
    seen.add(await activeId(page));
    expect(Array.from(seen)).toEqual([target]);
  });

  test('Back restores the clicked focus and its pin', async ({ page }) => {
    await openDemoFeed(page);
    const target = await lowerTarget(page);
    expect(target).toBeTruthy();
    await clickTarget(page);
    const card = page.locator(`[data-testid="post"][data-post-id="${target!.id}"]`);
    await expect(card).toHaveAttribute('data-active', 'true');
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await card.locator('div[role="button"]').first().press('Enter');
    await expect(page).toHaveURL(new RegExp(`/posts/${target!.id}`));
    await page.goBack();
    await expect(page).toHaveURL(/\/AIWorkforce$/);
    await expect(page.locator(`[data-testid="post"][data-post-id="${target!.id}"]`))
      .toHaveAttribute('data-active', 'true');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(scrollBefore + 2);
    await page.waitForTimeout(400);

    // The restored pin survives a small scroll toward the post.
    await page.evaluate(() => window.scrollBy(0, 20));
    await settle(page);
    await page.waitForTimeout(300);
    expect(await activeId(page)).toBe(target!.id);
  });
});
