import { expect, test, type Page } from '@playwright/test';
import scaleDemo from '../src/app/FakeData/scale-demo.json';

const ROUTE_BASE: Record<string, string> = {
  'chinese-evs': '/ChineseEVs',
  'ai-workforce': '/AIWorkforce',
  'energy-tech': '/EnergyTech',
  tariffs: '/Tariffs',
};
// The longest timeline post is clamped even in the detail view's taller clamp.
const longest = (scaleDemo as any[])
  .filter((entry) => entry.timelineRoot === true && ROUTE_BASE[entry.topicId])
  .reduce((a, b) => (b.focusPost.content.length > a.focusPost.content.length ? b : a));
const longestDetailRoute = `${ROUTE_BASE[longest.topicId]}/posts/${encodeURIComponent(longest.focusPost.id)}`;

// #259: a truncation ellipsis is drawn OVER the text (never inserted, so line
// breaks cannot move). A character it overlaps must be hidden whole: the
// "…" after a truncated feed post used to start mid-glyph, so "happens"
// showed as "happen" plus a clipped sliver of "s". Every glyph whose box
// overlaps an ellipsis box must sit inside that ellipsis's covered highlight.

type EllipsisReport = { checked: number; offenders: string[] };

/** Check every shown ellipsis (trailing post markers and leading focus-window
 *  leads) against the glyph boxes of its own text. */
async function ellipsisReport(page: Page): Promise<EllipsisReport> {
  return page.evaluate(() => {
    const offenders: string[] = [];
    let checked = 0;
    const range = document.createRange();
    const highlightRanges = (name: string): Range[] => {
      const highlight = (CSS as any).highlights?.get(name);
      return highlight ? Array.from(highlight as Iterable<Range>) : [];
    };
    const isCovered = (ranges: Range[], node: Text, offset: number) => ranges.some((r) => {
      try {
        return r.comparePoint(node, offset) === 0 && r.comparePoint(node, offset + 1) === 0;
      } catch {
        return false;
      }
    });

    const check = (label: string, box: DOMRect, text: HTMLElement, covered: Range[]) => {
      checked += 1;
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        for (let offset = 0; offset < node.length; offset += 1) {
          if (/\s/.test(node.data[offset])) continue;
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const glyph = Array.from(range.getClientRects()).find((rect) => rect.width > 0);
          if (!glyph) continue;
          // Same line as the ellipsis, and horizontally overlapping it.
          const sameLine = glyph.bottom > box.top + 1 && glyph.top < box.bottom - 1;
          const overlap = Math.min(glyph.right, box.right) - Math.max(glyph.left, box.left);
          if (!sameLine || overlap <= 0.5) continue;
          if (!isCovered(covered, node, offset)) {
            offenders.push(`${label}: "${node.data[offset]}" [${glyph.left.toFixed(1)}, ${glyph.right.toFixed(1)}] `
              + `under the ellipsis box [${box.left.toFixed(1)}, ${box.right.toFixed(1)}] but not covered`);
          }
        }
      }
    };

    const trailingCovered = highlightRanges('post-clamp-covered');
    document.querySelectorAll<HTMLElement>('[data-testid="post-clamp-ellipsis"][data-inline-positioned="true"]')
      .forEach((marker, i) => {
        const shell = marker.closest<HTMLElement>('.post-text-clamp-shell')!;
        const text = shell.querySelector<HTMLElement>('.postClampedText, [data-testid="focus-reveal"]')!;
        const style = getComputedStyle(marker);
        // The marker is opaque; its box must be the card's own surface.
        const card = marker.closest<HTMLElement>('[data-testid="post"]')!;
        if (style.backgroundColor !== getComputedStyle(card).backgroundColor) {
          offenders.push(`trailing ${i}: marker ${style.backgroundColor} on a ${getComputedStyle(card).backgroundColor} card`);
        }
        check(`trailing ${i}`, marker.getBoundingClientRect(), text, trailingCovered);
      });

    const leadingCovered = highlightRanges('focus-window-covered');
    document.querySelectorAll<HTMLElement>('[data-testid="focus-window-lead"][data-shown]').forEach((lead, i) => {
      const text = lead.parentElement!.querySelector<HTMLElement>('[data-testid="focus-reveal"]')!;
      check(`leading ${i}`, lead.getBoundingClientRect(), text, leadingCovered);
    });
    return { checked, offenders };
  });
}

async function expectWholeCharacters(page: Page, where: string, minimum = 1) {
  // The marker is placed a frame after layout settles.
  await expect.poll(async () => (await ellipsisReport(page)).checked, { message: `${where}: no ellipsis shown` })
    .toBeGreaterThanOrEqual(minimum);
  const report = await ellipsisReport(page);
  expect(report.offenders, `${where}: ${report.offenders.join('; ')}`).toEqual([]);
}

test.describe('truncation ellipses hide whole characters', () => {
  for (const width of [1440, 900, 420]) {
    test(`Home feed at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/home');
      await expect(page.locator('[data-testid="post"]').first()).toBeVisible({ timeout: 30_000 });
      await expectWholeCharacters(page, `/home at ${width}px`, 3);
    });
  }

  test('Home feed re-places the ellipsis on resize', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/home');
    await expect(page.locator('[data-testid="post"]').first()).toBeVisible({ timeout: 30_000 });
    await expectWholeCharacters(page, '/home at 1280px', 3);
    for (const width of [1013, 777, 531]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(300);
      await expectWholeCharacters(page, `/home resized to ${width}px`, 3);
    }
  });

  for (const width of [1440, 420]) {
    test(`post detail page at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(longestDetailRoute, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(`[data-post-id="${longest.focusPost.id}"]`).first())
        .toBeVisible({ timeout: 60_000 });
      await expectWholeCharacters(page, `${longestDetailRoute} at ${width}px`);
    });
  }

  test('topic feed, including the focus post reading window', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/ChineseEVs', { waitUntil: 'domcontentloaded' });
    const reveal = page.locator('[data-testid="post"][data-active="true"] [data-testid="focus-reveal"]').first();
    await reveal.waitFor({ state: 'visible', timeout: 90_000 });
    await expectWholeCharacters(page, '/ChineseEVs');

    // Hovering related spans scrolls the focus post's window: a leading
    // ellipsis appears over its first line, and a trailing one while text
    // follows the window. Check both on every card that scrolls it.
    const cards = page.locator('[data-related-card]');
    await expect(cards.first()).toBeVisible();
    let windows = 0;
    for (let i = 0; i < Math.min(await cards.count(), 8); i += 1) {
      const span = cards.nth(i).locator('mark[data-range-id]').first();
      try {
        await cards.nth(i).scrollIntoViewIfNeeded({ timeout: 5000 });
        await span.hover({ timeout: 5000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(500);
      if (await reveal.evaluate((el) => el.scrollTop > 0)) windows += 1;
      const report = await ellipsisReport(page);
      expect(report.offenders, `card ${i}: ${report.offenders.join('; ')}`).toEqual([]);
    }
    expect(windows, 'no hover scrolled the reading window — test proved nothing').toBeGreaterThan(0);
  });
});
