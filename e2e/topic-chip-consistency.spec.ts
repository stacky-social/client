import { expect, test } from '@playwright/test';

// When a topic grouping is active, every card in the group carries the same
// "<topic> (n) ›" chip. The anchor is still the anchor — aria-pressed and the
// active-group-anchor hook say so — but it must not look like a different
// control from the cards it groups, and the chip must not move around because
// one card happens to carry a "Modified" badge and another does not.

const DETAIL_URL = '/EnergyTech/posts/cw-S1VeKWSitwk9wRrq';
const CHIP = '[data-related-card] button[aria-label^="Show more posts about"]';

test('every topic chip in an active group shares one presentation and its own row', async ({ page }) => {
  // The dev server compiles this route on demand, which can outlast the default.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded' });

  // Activating a related span groups the panel by that span's topic, which is
  // what puts the chip on every member card.
  const span = page.locator('[data-related-card] mark[data-range-id]').first();
  await expect(span).toBeAttached({ timeout: 90_000 });
  await span.scrollIntoViewIfNeeded();
  await span.click();

  const chips = page.locator(CHIP);
  await expect(chips.first()).toBeVisible();
  await expect(page.getByTestId('active-group-anchor')).toHaveCount(1);
  const chipCount = await chips.count();
  expect(chipCount, 'need an anchor plus at least one member to compare').toBeGreaterThan(1);

  // One presentation: the anchor's chip is styled exactly like its members'.
  const styles = await chips.evaluateAll((nodes) =>
    nodes.map((node) => {
      const s = getComputedStyle(node);
      return [s.backgroundColor, s.borderTopWidth, s.borderTopStyle, s.opacity].join('|');
    }));
  const distinct = Array.from(new Set(styles));
  expect(distinct.length, `chips must share one style, saw: ${distinct.join(' / ')}`).toBe(1);

  // Own row: the chip sits below its card's category icons rather than beside
  // them, so its position does not depend on what else the header carries.
  const offsets = await chips.evaluateAll((nodes) =>
    nodes.map((node) => {
      const card = node.closest('[data-related-card]');
      const tag = card?.querySelector('[data-related-tag]');
      if (!tag) return null;
      return node.getBoundingClientRect().top - tag.getBoundingClientRect().bottom;
    }));
  const measured = offsets.filter((value): value is number => value !== null);
  expect(measured.length, 'at least one card exposes a category tag to compare against').toBeGreaterThan(0);
  for (const delta of measured) {
    expect(delta, 'chip must start below the category-icon row, not beside it').toBeGreaterThanOrEqual(-2);
  }
});
