import { expect, test, type Page } from '@playwright/test';
import mockData from '../src/app/FakeData/chinese-evs.json';

// #224 — a related card's contribution-type icon means "more like this": it
// GROUPS the cards of that type around the clicked card exactly like a topic
// span does (nothing hidden, above → above / below → below, a bordered block
// with "Type (N) ×" and "K more Type"), filters the reply list by that type,
// and toggles off from any card that shows the same icon. The top chips remain
// the only category FILTER. Also covers the frozen group header, the "Modified"
// pill's zero-growth placement, and the collapsed reading window's edges.

const FOCUS_ID = '143195604';
const DETAIL_URL = `/ChineseEVs/posts/${FOCUS_ID}`;

type Related = { id: string; content: string };
const entry = (mockData as unknown as Array<{ focusPost: { id: string }; relatedPosts?: Related[] }>)
  .find((e) => e.focusPost.id === FOCUS_ID)!;
const contentById = new Map((entry.relatedPosts ?? []).map((rp) => [rp.id, rp.content]));

const cardIds = (page: Page) => page.locator('[data-related-card]').evaluateAll((cards) =>
  cards.map((card) => ({
    id: card.querySelector('[data-post-id]')!.getAttribute('data-post-id')!,
    category: card.getAttribute('data-related-category')!,
    member: card.hasAttribute('data-related-group-member'),
  })));

async function openDetail(page: Page, search = '') {
  await page.goto(`${DETAIL_URL}${search}`);
  await expect(page.locator('[data-related-card]').first()).toBeVisible();
}

const panelCount = async (page: Page) =>
  Number((await panelSummary(page)).match(/\d+/)![0]);

const panelSummary = (page: Page) =>
  page.getByTestId('related-sticky-header').getByText(/\d+ posts? /).innerText();

/** Scroll a card into the aside's reading area and return its first icon's top. */
async function settleCard(page: Page, postId: string) {
  const card = page.locator(`[data-related-card]:has([data-post-id="${postId}"])`);
  await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const icon = card.locator('[data-related-tag]').first();
  await icon.hover();
  // Hovering a type icon reveals its span (a short smooth scroll): measure
  // only once the pointer's own reveal has settled.
  let top = (await icon.boundingBox())!.y;
  await expect.poll(async () => {
    const previous = top;
    await page.waitForTimeout(120);
    top = (await icon.boundingBox())!.y;
    return Math.abs(top - previous);
  }).toBeLessThan(0.5);
  return { card, icon, top };
}

test.describe('contribution-type grouping (#224)', () => {
  test('a type icon groups its type around the card and hides nothing', async ({ page }) => {
    await openDetail(page);
    await expect(page.locator('[data-related-card]')).toHaveCount(10);
    const countBefore = await panelCount(page);
    await expect(page.getByTestId('related-sticky-header')).toContainText('across all categories');
    const before = await cardIds(page);
    // The second Disagree card: at least one member sits above it.
    const anchorId = before.filter((card) => card.category === 'disagree')[1].id;
    const anchorIndex = before.findIndex((card) => card.id === anchorId);
    const aboveMembers = before.slice(0, anchorIndex).filter((card) => card.category === 'disagree');
    expect(aboveMembers.length).toBeGreaterThan(0);

    const chip = page.getByRole('button', { name: 'Show Disagree filter' });
    const chipCount = Number((await chip.innerText()).replace(/\D/g, ''));
    const { icon, top } = await settleCard(page, anchorId);
    await icon.click();

    await expect(page).toHaveURL(/[?&]fg=category/);
    await expect(page).not.toHaveURL(/[?&]fc=/);
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(1);
    await expect(page.getByTestId('active-group-anchor').locator('[data-post-id]')).toHaveAttribute('data-post-id', anchorId);
    // Nothing is filtered away: the panel still spans every category.
    await expect(page.getByTestId('related-sticky-header')).toContainText('across all categories');

    // The clicked card (its icon) holds still.
    expect(Math.abs((await icon.boundingBox())!.y - top)).toBeLessThanOrEqual(1);

    // "(N)" is the top chip's count; the footer pages the rest in threes.
    const header = page.locator('[data-related-group-header]');
    await expect(header).toContainText(`Disagree (${chipCount})`);
    const after = await cardIds(page);
    const members = after.filter((card) => card.member);
    const belowShown = members.length - 1 - aboveMembers.length;
    expect(belowShown).toBe(3);
    const remaining = chipCount - members.length;
    await expect(page.locator('button.show-more-link')).toHaveText(`${remaining} more Disagree`);
    // Only the group's own not-yet-revealed members are paged out.
    expect(await panelCount(page)).toBe(countBefore - remaining);

    // Above → above, below → below: the block is contiguous, the members that
    // were above still precede the anchor and the rest follow it.
    const newAnchorIndex = after.findIndex((card) => card.id === anchorId);
    const block = after.slice(newAnchorIndex - aboveMembers.length, newAnchorIndex + 1 + belowShown);
    expect(block.every((card) => card.member && card.category === 'disagree')).toBe(true);
    expect(after.slice(0, newAnchorIndex).map((card) => card.id))
      .toEqual(expect.arrayContaining(aboveMembers.map((card) => card.id)));
    // Every card that preceded the anchor still precedes it (nothing jumps up).
    const precededBefore = before.slice(0, anchorIndex).map((card) => card.id);
    expect(after.slice(0, newAnchorIndex).map((card) => card.id).sort()).toEqual([...precededBefore].sort());

    // Grouping adds no per-card row: the card header keeps its 44px.
    const headerHeights = await page.locator('[data-related-card] [data-post-id]').evaluateAll((papers) =>
      Array.from(new Set(papers.map((paper) => Math.round(paper.firstElementChild!.getBoundingClientRect().height)))));
    expect(headerHeights).toEqual([44]);
  });

  test('a type group clears the top filter, filters the replies, toggles, and Back undoes it', async ({ page }) => {
    await openDetail(page);
    await page.getByRole('button', { name: 'Show Disagree filter' }).click();
    await expect(page).toHaveURL(/[?&]fc=disagree/);
    const filteredCards = await cardIds(page);
    expect(filteredCards.every((card) => card.category === 'disagree')).toBe(true);

    const { icon } = await settleCard(page, filteredCards[1].id);
    await icon.click();
    await expect(page).toHaveURL(/[?&]fg=category/);
    await expect(page).not.toHaveURL(/[?&]fc=/);
    await expect(page.getByRole('button', { name: 'Show Disagree filter' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('posts across all categories')).toBeVisible();

    // The reply list is filtered to replies that make the same contribution.
    const replyBar = page.getByTestId('reply-filter-bar');
    await expect(replyBar).toBeVisible();
    await expect(page.getByTestId('reply-topic-filter')).toContainText('Disagree');

    // The same icon on ANOTHER member clears the group (and the reply filter).
    const otherMember = (await cardIds(page)).find((card) => card.member && card.id !== filteredCards[1].id)!;
    const other = await settleCard(page, otherMember.id);
    await other.icon.click();
    await expect(page).not.toHaveURL(/[?&]ft=/);
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(0);
    await expect(replyBar).toHaveCount(0);

    // Browser Back restores the group; Back again restores the category filter.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]fg=category/);
    await expect(page.locator('[data-related-group-header]')).toContainText('Disagree (');
    await page.goBack();
    await expect(page).toHaveURL(/[?&]fc=disagree/);
  });

  test('a shared type-group link reopens the same group', async ({ page }) => {
    await openDetail(page);
    const anchorId = (await cardIds(page)).filter((card) => card.category === 'disagree')[0].id;
    const params = new URLSearchParams({ ft: 'disagree', fo: 'aside', fa: anchorId, fi: '0', fg: 'category' });
    await openDetail(page, `?${params}`);
    await expect(page.getByTestId('active-group-anchor').locator('[data-post-id]')).toHaveAttribute('data-post-id', anchorId);
    await expect(page.locator('[data-related-group-header]')).toContainText('Disagree (');
    await expect(page.getByTestId('reply-topic-filter')).toContainText('Disagree');
  });
});

test.describe('frozen group header (#224)', () => {
  test('a copy of the group header freezes under the panel header while the group scrolls', async ({ page }) => {
    await openDetail(page);
    const anchorId = (await cardIds(page)).filter((card) => card.category === 'disagree')[0].id;
    const { icon } = await settleCard(page, anchorId);
    await icon.click();
    const header = page.locator('[data-related-group-header]');
    await expect(header).toBeAttached();
    const bar = page.locator('[data-related-group-sticky-bar]');

    const aside = page.getByTestId('col-aside');
    const scrollGroupBy = (offset: number) => aside.evaluate((element, by) => {
      const line = element.querySelector('[data-testid="related-sticky-header"]')!.getBoundingClientRect().bottom;
      const groupHeader = element.querySelector('[data-related-group-header]')!;
      element.scrollTop += groupHeader.getBoundingClientRect().top - line + by;
    }, offset);

    // The real header in view → no copy.
    await scrollGroupBy(-40);
    await expect(header).toBeInViewport();
    await expect(bar).toHaveAttribute('data-visible', 'false');

    // The real header scrolled above the line → the frozen copy shows, flush
    // under the panel header, with the same label.
    await scrollGroupBy(160);
    await expect(bar).toHaveAttribute('data-visible', 'true');
    await expect(bar).toContainText((await header.locator('span').first().innerText()));
    const geometry = await aside.evaluate((element) => {
      const line = element.querySelector('[data-testid="related-sticky-header"]')!.getBoundingClientRect().bottom;
      const frozen = element.querySelector('[data-related-group-sticky-bar]')!.getBoundingClientRect();
      const rail = element.querySelector('[data-related-group-member] > div[aria-hidden]')!.getBoundingClientRect();
      return { line, top: frozen.top, left: frozen.left, right: frozen.right, railLeft: rail.left, railRight: rail.right };
    });
    expect(Math.abs(geometry.top - geometry.line)).toBeLessThanOrEqual(1);
    // Its side rails continue the group's border.
    expect(Math.abs(geometry.left - geometry.railLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.right - geometry.railRight)).toBeLessThanOrEqual(1);
    // Freezing must not change the box's shape: the copy keeps the real
    // header's rounded top corners (researcher feedback, #224).
    const frame = bar.locator('> div').first();
    const realRadius = await header.evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
    await expect(frame).toHaveCSS('border-top-left-radius', realRadius);
    await expect(frame).toHaveCSS('border-top-right-radius', realRadius);
    expect(parseFloat(realRadius)).toBeGreaterThan(0);

    // Back above the group's start → the copy hides again.
    await scrollGroupBy(-40);
    await expect(bar).toHaveAttribute('data-visible', 'false');

    // Past the group's last card → hidden.
    await aside.evaluate((element) => {
      const line = element.querySelector('[data-testid="related-sticky-header"]')!.getBoundingClientRect().bottom;
      const last = element.querySelector('[data-related-group-end="true"]')!;
      element.scrollTop += last.getBoundingClientRect().bottom - line + 20;
    });
    await expect(bar).toHaveAttribute('data-visible', 'false');

    // Its × dismisses the group like the real one.
    await scrollGroupBy(160);
    await expect(bar).toHaveAttribute('data-visible', 'true');
    await page.getByTestId('related-group-sticky-dismiss').click();
    await expect(page.getByTestId('active-group-anchor')).toHaveCount(0);
    await expect(bar).toHaveCount(0);
  });
});

test('a type icon clicked right under the panel header is not left beneath the frozen copy', async ({ page }) => {
  await openDetail(page);
  // The first Disagree card has no member above it, so its group header is
  // inserted directly above it — scrolled away when the card sits at the top.
  const anchorId = (await cardIds(page)).filter((card) => card.category === 'disagree')[0].id;
  const card = page.locator(`[data-related-card]:has([data-post-id="${anchorId}"])`);
  const aside = page.getByTestId('col-aside');
  await aside.evaluate((element, id) => {
    const line = element.querySelector('[data-testid="related-sticky-header"]')!.getBoundingClientRect().bottom;
    const target = element.querySelector(`[data-related-card] [data-post-id="${id}"]`)!;
    element.scrollTop += target.getBoundingClientRect().top - line - 4;
  }, anchorId);
  const icon = card.locator('[data-related-tag]').first();
  await icon.evaluate((element) => (element as HTMLElement).click());
  const bar = page.locator('[data-related-group-sticky-bar]');
  await expect(bar).toHaveAttribute('data-visible', 'true');
  const barBottom = await bar.evaluate((element) => element.getBoundingClientRect().bottom);
  expect((await icon.boundingBox())!.y).toBeGreaterThanOrEqual(barBottom - 0.5);
});

test.describe('related card header and reading window (#224)', () => {
  for (const width of [1024, 1280]) {
    test(`the Modified pill sits under the name without growing the header (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/AIWorkforce');
      const aside = page.getByTestId('col-aside');
      const badge = aside.getByRole('button', { name: 'Modified by AI' }).first();
      await expect(badge).toBeVisible();
      const heights = await aside.locator('[data-related-card] [data-post-id]').evaluateAll((papers) =>
        papers.map((paper) => ({
          modified: !!paper.querySelector('[data-ai-edit]'),
          height: Math.round(paper.firstElementChild!.getBoundingClientRect().height * 10) / 10,
        })));
      expect(heights.some((row) => row.modified)).toBe(true);
      expect(heights.some((row) => !row.modified)).toBe(true);
      expect(Array.from(new Set(heights.map((row) => row.height)))).toEqual([44]);
      const box = await badge.boundingBox();
      expect(box!.height).toBeLessThanOrEqual(15);
      const card = badge.locator('xpath=ancestor::*[@data-post-id][1]');
      await expect(card.locator('[data-related-name-block] [data-ai-edit]')).toHaveCount(1);
      await expect(card.locator('[data-related-tag-cluster] [data-ai-edit]')).toHaveCount(0);
    });
  }

  test('a windowed card opens and closes on whole words behind a legible ellipsis', async ({ page }) => {
    await openDetail(page);
    await expect(page.locator('[data-related-card]')).toHaveCount(10);
    const windows = await page.locator('[data-related-card] [data-ai-edited-default]').evaluateAll((paragraphs) =>
      paragraphs.flatMap((paragraph) => {
        const start = paragraph.querySelector('[data-window-ellipsis="start"]');
        if (!start) return [];
        const style = getComputedStyle(start);
        const clone = paragraph.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[data-window-ellipsis]').forEach((node) => node.remove());
        return [{
          id: paragraph.closest('[data-post-id]')!.getAttribute('data-post-id')!,
          text: clone.textContent ?? '',
          prefix: start.textContent,
          color: style.color,
          fontSize: style.fontSize,
          proseSize: getComputedStyle(paragraph).fontSize,
          hasEnd: !!paragraph.querySelector('[data-window-ellipsis="end"]'),
        }];
      }));
    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) {
      // Slate-500: ≥4.5:1 on the white card, at the prose size, then a thin space.
      expect(window.color).toBe('rgb(100, 116, 139)');
      expect(window.fontSize).toBe(window.proseSize);
      expect(window.prefix).toBe('… ');
      const content = contentById.get(window.id);
      const at = content ? content.indexOf(window.text) : -1;
      if (at < 0) continue; // rewritten/linkified text: not comparable to the raw fixture
      expect(/\s/.test(content![at - 1]), `window of ${window.id} starts mid-word`).toBe(true);
      const end = at + window.text.length;
      if (window.hasEnd) expect(/\s/.test(content![end]), `window of ${window.id} ends mid-word`).toBe(true);
    }
  });
});
