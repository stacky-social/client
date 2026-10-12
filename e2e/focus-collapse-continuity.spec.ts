import { expect, test, type Page } from '@playwright/test';

// #259: scrolling into the comments collapsed the focus post with a jump —
// the page was pinned in one instant scroll (~256px) and the focus gave back
// its height (~111px), so the reply being read leapt ~367px; scrolling back up
// leapt ~111px the other way. The replies must now move exactly with the input
// through the full ↔ compact switch, and the related panel must not move.

const STEP = 10;

/** Per-frame samples, taken after layout and after the app's ResizeObservers
 * (this observer is created later, so it is delivered later) — the painted
 * state, not an intermediate one. */
async function startSampling(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const region = document.querySelector('[data-testid="reply-scroll-region"]') as HTMLElement;
    const posts = region.querySelectorAll('[data-testid="post"]');
    const reply = posts[Math.min(2, posts.length - 1)] as HTMLElement;
    const aside = document.querySelector('[data-testid="col-aside"]') as HTMLElement;
    const focus = document.querySelector('[data-focus-compact]') as HTMLElement;
    w.samples = [];
    const sample = () => {
      const card = aside.querySelectorAll('[data-post-id]')[1] as HTMLElement | undefined;
      w.samples.push({
        reply: reply.getBoundingClientRect().top,
        aside: card ? card.getBoundingClientRect().top : aside.getBoundingClientRect().top,
        compact: focus.dataset.focusCompact,
      });
    };
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(probe);
    new ResizeObserver(sample).observe(probe);
    let flip = false;
    const frame = () => {
      flip = !flip;
      probe.style.width = flip ? '2px' : '1px';
      w.sampleFrame = requestAnimationFrame(frame);
    };
    w.sampleFrame = requestAnimationFrame(frame);
  });
}

async function wheel(page: Page, steps: number, dy: number) {
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(400);
}

for (const post of ['/ChineseEVs/posts/152053690', '/Tariffs/posts/cw-fxp4bHADekz7QC-b']) {
  test(`full ↔ compact focus keeps replies and the aside still: ${post}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(post);
    const region = page.getByTestId('reply-scroll-region');
    await expect(region.locator('[data-testid="post"]').nth(2)).toBeVisible();
    await page.waitForTimeout(600);
    await startSampling(page);
    const box = (await region.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 40);

    // Down through the page pin and the collapse, then back up through the expand.
    await wheel(page, 50, STEP);
    await expect(page.locator('[data-focus-compact]')).toHaveAttribute('data-focus-compact', 'true');
    await wheel(page, 60, -STEP);
    await expect(page.locator('[data-focus-compact]')).toHaveAttribute('data-focus-compact', 'false');

    const samples: { reply: number; aside: number; compact: string }[] =
      await page.evaluate(() => (window as any).samples);
    let worstReply = 0;
    let worstAside = 0;
    const transitions: string[] = [];
    for (let i = 1; i < samples.length; i += 1) {
      // A frame moves the reply by at most one wheel step — never by the
      // pin scroll or the focus height.
      worstReply = Math.max(worstReply, Math.abs(samples[i].reply - samples[i - 1].reply));
      worstAside = Math.max(worstAside, Math.abs(samples[i].aside - samples[i - 1].aside));
      if (samples[i].compact !== samples[i - 1].compact) transitions.push(samples[i].compact);
    }
    expect(transitions, 'one collapse, one expand — no oscillation at the threshold').toEqual(['true', 'false']);
    expect(worstReply, 'reply card per-frame displacement beyond the wheel step').toBeLessThanOrEqual(STEP + 1.5);
    expect(worstAside, 'related card per-frame displacement').toBeLessThanOrEqual(2);
  });
}
