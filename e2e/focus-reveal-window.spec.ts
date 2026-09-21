import { expect, test } from '@playwright/test';

// Clicking a focus phrase locks the post into a fixed-height reading window and
// scrolls the chosen passage to the top of it. A trailing spacer the height of
// the window lets even a final passage top-align.
//
// That spacer must never be visible on a post that already fits: scrolling a
// late passage to the top there pushes the opening lines out of view and fills
// the rest of the card with empty space, for no reading benefit — the whole post
// was already on screen.

test('a post that fits its reading window is never scrolled inside it', async ({ page }) => {
  // The dev server compiles this route on demand, which can outlast the default.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/EnergyTech', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="focus-reveal"]').first()
    .waitFor({ state: 'attached', timeout: 90_000 });
  await page.waitForTimeout(2000);

  const cards = await page.locator('[data-testid="focus-reveal"]').count();
  expect(cards, 'feed needs focus posts to exercise').toBeGreaterThan(0);

  let observedFitting = 0;
  const offenders: string[] = [];

  for (let i = 0; i < Math.min(cards, 6); i++) {
    const reveal = page.locator('[data-testid="focus-reveal"]').nth(i);
    const marks = reveal.locator('mark');
    const markCount = await marks.count();
    if (markCount === 0) continue;

    // The LAST phrase is the interesting one: it is the case that scrolls a
    // short post away from its own first line.
    const last = marks.nth(markCount - 1);
    try {
      await last.scrollIntoViewIfNeeded({ timeout: 5000 });
      await last.click({ timeout: 5000 });
    } catch {
      continue; // card moved or is off-screen; not what this test is about
    }
    await page.waitForTimeout(700);

    const state = await reveal.evaluate((el) => {
      const windowed = el.hasAttribute('data-reveal-window');
      const height = Math.round(el.getBoundingClientRect().height);
      // The ::after spacer is exactly one window tall, so remove it to get the
      // real content height.
      const content = el.scrollHeight - (windowed ? height : 0);
      return { windowed, height, content, scrollTop: Math.round(el.scrollTop) };
    });

    if (!state.windowed || state.content > state.height + 1) continue;
    observedFitting++;
    if (state.scrollTop > 0) {
      offenders.push(`card ${i}: window ${state.height}px, content ${state.content}px, `
        + `scrolled ${state.scrollTop}px — ${state.scrollTop}px of the card renders empty`);
    }
  }

  expect(observedFitting, 'no card entered the window while fitting it — test proved nothing')
    .toBeGreaterThan(0);
  expect(offenders, offenders.join('; ')).toEqual([]);
});
