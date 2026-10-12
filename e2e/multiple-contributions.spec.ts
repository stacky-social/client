import { expect, test } from '@playwright/test';
import data from '../src/app/FakeData/scale-demo.json';

const focusId = 'cw-408dJ1YRNhiM1YGC';
const relatedId = 'cw-rN8S4eML597HwCqg';
const entry = data.find((entry) => entry.focusPost.id === focusId)!;
const suppressed = new Set([focusId, ...entry.ancestors.map((p) => p.id), ...entry.replies.map((p) => p.id)]);
const related = entry.relatedPosts.filter((p) => !suppressed.has(p.id));
const labels: Record<string, string> = { evidence_personal: 'Evidence (Personal)', humor: 'Humor' };

test('multiple types count independently and hover/filter select one color in both panes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/AIWorkforce/posts/${focusId}`, { waitUntil: 'domcontentloaded' });
  const aside = page.getByTestId('col-aside');
  const card = aside.locator(`[data-related-card-surface][data-post-id="${relatedId}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('[data-related-tag]')).toHaveCount(2);
  const mark = card.locator('mark[data-contribution-category]').first();
  await expect(mark).toHaveAttribute('data-contribution-category', 'evidence_personal');
  await expect(mark).toHaveCSS('background-image', 'none');
  await expect(page.getByTestId('related-filter-summary')).toContainText(`${related.length} posts across all categories`);
  const totals = new Map<string, number>();
  related.forEach((post) => new Set(post.relations.map((r) => r.category)).forEach((category) => totals.set(category, (totals.get(category) ?? 0) + 1)));
  expect(Array.from(totals.values()).reduce((sum, n) => sum + n, 0)).toBeGreaterThan(related.length);
  for (const category of ['evidence_personal', 'humor']) {
    await expect(aside.getByRole('button', { name: `Show ${labels[category]} filter`, exact: true }))
      .toContainText(String(totals.get(category)));
  }
  const secondary = card.getByRole('button', { name: 'Humor', exact: true });
  await secondary.hover();
  await expect(mark).toHaveAttribute('data-contribution-category', 'humor');
  const focus = page.getByTestId('feed').locator(`[data-testid="post"][data-post-id="${focusId}"]`);
  await expect(focus.locator('[data-aside-highlight][data-contribution-category="humor"]').first()).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(mark).toHaveAttribute('data-contribution-category', 'evidence_personal');
  await aside.getByRole('button', { name: 'Show Humor filter', exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(mark).toHaveAttribute('data-contribution-category', 'humor');
  // Card hover after a filter must carry that color into the focused passage.
  await card.hover({ position: { x: 15, y: 15 } });
  await expect(focus.locator('[data-aside-highlight][data-contribution-category="humor"]').first()).toBeVisible();
  await expect(page.getByTestId('related-filter-summary')).toContainText('Filtered:');
});
