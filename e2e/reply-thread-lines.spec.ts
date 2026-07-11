import { test, expect } from '@playwright/test';

// Nested replies must be visibly attached to their parent by a thread
// connector line. Regression: the line used to render at left:20px INSIDE the
// indented child group — i.e. underneath the child's opaque white card — so no
// line was visible anywhere. The rail belongs in the indent gutter left of the
// card, where nothing paints over it.

test('nested reply connector lines are visible, not covered by the reply cards', async ({ page }) => {
  await page.goto('/ChineseEVs/posts/143195604');
  await expect(page.locator('[data-post-id]').first()).toBeVisible();

  // Reveal nested branches so depth>0 replies (which carry the lines) render.
  for (let i = 0; i < 8; i++) {
    const more = page.locator('[data-testid^="nested-see-more-"]');
    if ((await more.count()) === 0) break;
    try { await more.first().click({ timeout: 1500 }); } catch { break; }
  }

  const lines = page.locator('[class*="threadLine"]');
  await expect(lines.first()).toBeAttached();

  const probe = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[class*="threadLine"]')) as HTMLElement[];
    let visible = 0;
    for (const el of els.slice(0, 8)) {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const x = r.left + r.width / 2;
      const y = Math.max(1, Math.min(window.innerHeight - 2, r.top + r.height / 2));
      // The line itself must win the hit-test at its own midpoint — if a card
      // covers it, elementFromPoint returns the card instead.
      const hit = document.elementFromPoint(x, y);
      if (hit === el) visible++;
    }
    return { total: els.length, visible };
  });

  expect(probe.total, 'nested replies should render thread lines').toBeGreaterThan(0);
  expect(probe.visible, 'thread lines must not be covered by reply cards').toBeGreaterThan(0);
});
