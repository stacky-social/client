import { expect, test } from '@playwright/test';

// Clicking a related span groups the panel by that span's topic. The gesture's
// reading anchor is the span itself — the words under the cursor — so the span
// must not move while every other card animates into its new slot.
//
// The anchor card's own top edge MAY shift a little: activating the group adds
// the topic chip to that card's header, which can wrap onto a second line and
// grow the header. Keeping the span still is what matters; the card is only
// held to a loose bound that still catches a runaway scroll.
const SPAN_TOLERANCE = 1;
const CARD_TOLERANCE = 48;

for (const index of [0, 2, 7]) {
  test(`topic clicks keep related card ${index + 1}'s clicked span under the cursor`, async ({ page }) => {
    // The dev server compiles this route on demand, which can outlast the
    // default timeout; wait for the cards rather than the window `load` event.
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/EnergyTech/posts/cw-S1VeKWSitwk9wRrq', { waitUntil: 'domcontentloaded' });
    const initial = page.locator('[data-related-card]').nth(index);
    await expect(initial).toBeAttached({ timeout: 90_000 });
    const id = await initial.locator('[data-post-id]').getAttribute('data-post-id');
    const card = page.locator(`[data-related-card] [data-post-id="${id}"]`);
    const span = card.locator('mark[data-range-id]').first();
    const rangeId = await span.getAttribute('data-range-id');
    await span.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(350);
    await span.hover();
    await page.waitForTimeout(150);

    for (const action of ['activate', 'dismiss']) {
      await page.evaluate(({ id, rangeId }) => {
        const samples: { card: number; span: number }[] = [];
        (window as any).pinSamples = samples;
        const until = performance.now() + 1100;
        const sample = () => {
          const card = document.querySelector(`[data-related-card] [data-post-id="${id}"]`)!;
          const span = card.querySelector(`mark[data-range-id="${rangeId}"]`)!;
          samples.push({ card: card.getBoundingClientRect().top, span: span.getBoundingClientRect().top });
          if (performance.now() < until) requestAnimationFrame(sample);
        };
        sample();
      }, { id, rangeId });
      // Click exactly where the user is already pointing; no test-runner scroll.
      await page.mouse.down();
      await page.mouse.up();
      if (action === 'activate') await expect(page).toHaveURL(/[?&]fo=aside/);
      else await expect(page).not.toHaveURL(/[?&]fo=aside/);
      await page.waitForTimeout(1150);
      const samples = await page.evaluate(() => (window as any).pinSamples as { card: number; span: number }[]);
      expect(samples.length).toBeGreaterThan(5);
      const drift = (key: 'card' | 'span') =>
        Math.max(...samples.map(s => Math.abs(s[key] - samples[0][key])));
      expect(drift('span'), `${action}: clicked span must stay under the cursor`)
        .toBeLessThanOrEqual(SPAN_TOLERANCE);
      expect(drift('card'), `${action}: anchor card must not scroll away`)
        .toBeLessThanOrEqual(CARD_TOLERANCE);
    }
  });
}
